// crypto.js — the R5 toolbox.
//
//   * AES-256-GCM for PII at rest in D1. Key = `wrangler secret put
//     PII_ENCRYPTION_KEY` (32 bytes, base64; generate: openssl rand -base64 32).
//     Every personal field a subject gives us is run through encryptPII()
//     before it touches the database, and decrypted only transiently in the
//     worker's memory while serving that subject's own authenticated request.
//
//   * Keyed (salted) hashing for dedup. HMAC-SHA256 under PII_HASH_SALT.
//     Deterministic — same email, same hash — which is the whole point of a
//     dedup key. Keyed with a secret so the hashes are useless for offline
//     dictionary attacks if the database ever leaks: without the salt you
//     cannot test candidate emails against the stored hashes.
//
//   * SHA-256 + canonical JSON for the evidence locker hash chain.
//
// Zero dependencies: Web Crypto only, native to Workers.

import { HttpError } from './http.js';

// ---------------------------------------------------------------------------
// base64 helpers (std alphabet for ciphertext blobs, url-safe for tokens)
// ---------------------------------------------------------------------------

function bytesToBase64(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// AES-256-GCM — PII at rest (R5)
// ---------------------------------------------------------------------------

// Per-isolate key cache; re-imported if the secret rotates under us.
let cachedAesKey = null;
let cachedAesMaterial = null;

async function getAesKey(env) {
  if (!env.PII_ENCRYPTION_KEY) {
    // Config error, not a user error. Message is static — no PII (R5).
    throw new HttpError(500, 'server_misconfigured: PII_ENCRYPTION_KEY secret is not set');
  }
  if (cachedAesKey && cachedAesMaterial === env.PII_ENCRYPTION_KEY) return cachedAesKey;
  let raw;
  try {
    raw = base64ToBytes(env.PII_ENCRYPTION_KEY.trim());
  } catch {
    throw new HttpError(500, 'server_misconfigured: PII_ENCRYPTION_KEY is not valid base64');
  }
  if (raw.byteLength !== 32) {
    throw new HttpError(500, 'server_misconfigured: PII_ENCRYPTION_KEY must be 32 bytes (openssl rand -base64 32)');
  }
  cachedAesKey = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  cachedAesMaterial = env.PII_ENCRYPTION_KEY;
  return cachedAesKey;
}

/** Encrypt a plaintext string → "v1:" + base64(iv || ciphertext+tag). */
export async function encryptPII(env, plaintext) {
  const key = await getAesKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV, fresh per message
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const packed = new Uint8Array(iv.byteLength + ct.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(ct), iv.byteLength);
  return 'v1:' + bytesToBase64(packed);
}

/** Decrypt a blob produced by encryptPII. Throws a PII-free 500 on failure. */
export async function decryptPII(env, blob) {
  if (typeof blob !== 'string' || !blob.startsWith('v1:')) {
    throw new HttpError(500, 'decrypt_failed: unknown ciphertext format');
  }
  const key = await getAesKey(env);
  let packed;
  try {
    packed = base64ToBytes(blob.slice(3));
  } catch {
    throw new HttpError(500, 'decrypt_failed: corrupt ciphertext');
  }
  if (packed.byteLength < 12 + 16) throw new HttpError(500, 'decrypt_failed: truncated ciphertext');
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: packed.slice(0, 12) },
      key,
      packed.slice(12),
    );
    return new TextDecoder().decode(pt);
  } catch {
    // Wrong key or tampered ciphertext. Say so plainly; include nothing else.
    throw new HttpError(500, 'decrypt_failed: authentication failed (wrong key or tampered data)');
  }
}

// ---------------------------------------------------------------------------
// Keyed hash — dedup without storing plaintext (R5)
// ---------------------------------------------------------------------------

/** HMAC-SHA256(PII_HASH_SALT, value) → hex. Deterministic, for dedup keys. */
export async function saltedHash(env, value) {
  if (!env.PII_HASH_SALT) {
    throw new HttpError(500, 'server_misconfigured: PII_HASH_SALT secret is not set');
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.PII_HASH_SALT),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return bytesToHex(mac);
}

// ---------------------------------------------------------------------------
// Evidence-chain primitives (DESIGN §4c)
// ---------------------------------------------------------------------------

export async function sha256Hex(str) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return bytesToHex(digest);
}

/**
 * Deterministic JSON: object keys sorted at every depth, no whitespace.
 * Both the worker (when writing) and any third party (when verifying an
 * export) must produce byte-identical strings, or the hash chain is useless.
 */
export function canonicalJSON(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJSON).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJSON(value[k])).join(',') + '}';
}

// ---------------------------------------------------------------------------
// Tokens & ids
// ---------------------------------------------------------------------------

/** 32 bytes of CSPRNG, base64url — magic-link and session bearer tokens. */
export function randomToken(byteLength = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return bytesToBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function uuid() {
  return crypto.randomUUID();
}
