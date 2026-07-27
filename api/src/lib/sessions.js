// sessions.js — the KV replacement. Port of the Worker's env.SESSIONS.{get,put,delete}.
// ES modules, Node 22. Backed by the Cosmos `sessions` container (pk /pk).
//
// Keys carried over from the Worker, unchanged:
//   magic:<token>    single-use magic-link tokens, 15 min   (R3 gate)
//   session:<token>  bearer session tokens, 24 h            (R3 — see guard below)
//   rl:magic:<hash>  per-email magic-link rate limit, 1 h
//   rl:sweep:<id>    per-subject sweep rate limit, 24 h     (R4)
//   robots:<host>    cached robots.txt verdicts, 24 h       (R4)
//
// ───────────────────────────────────────────────────────────────────────────
// EXPIRY IS CHECKED IN CODE, NOT DELEGATED TO COSMOS TTL.
//
// Cosmos TTL is a background sweeper: an expired document remains readable
// until the sweeper gets to it, which can be seconds or longer, and is not
// something the SDK will tell you about. A magic-link token that still
// authenticates one second after its 15-minute expiry is an authentication
// bug, not a housekeeping detail — so every document also carries an explicit
// `expiresAt` and get() compares it before returning anything. TTL is kept as
// the storage reclaimer; `expiresAt` is the security boundary.
// ───────────────────────────────────────────────────────────────────────────

import {
  container,
  pointRead,
  deleteItem,
  wrapCosmosError,
} from './cosmos.js';

const handle = () => container('sessions');

// ---------------------------------------------------------------------------
// key sanitisation
// ---------------------------------------------------------------------------
//
// A Cosmos `id` may not contain '/', '\', '#' or '?', may not end in a space,
// and is capped at 1023 characters. Worker keys are colon-delimited and can
// embed a hostname or an arbitrary token, so they are escaped on the way in.
//
// SCHEME: keep [A-Za-z0-9._:-] verbatim; replace every other character with
// '%' followed by the uppercase two-hex-digit encoding of each of its UTF-8
// bytes (so 'é' → '%C3%A9', '/' → '%2F', ' ' → '%20', '%' → '%25').
//
// WHY IT IS INJECTIVE (i.e. why two distinct keys can never collide):
//
//   The scheme has an explicit left inverse. Define decode(s): scan s left to
//   right; on a '%', consume exactly the next two characters as a hex byte and
//   emit that byte; on any other character, emit it. Then for every input key
//   k, decode(sanitiseKey(k)) === k.
//
//   That holds because '%' is itself OUTSIDE the preserved set, so a '%' in
//   the output is *always* an escape introducer and never a literal — there is
//   no other way for '%' to appear. Every escape is exactly three characters,
//   fixed width, so the scan is unambiguous with no lookahead or backtracking.
//   Preserved characters map to themselves and can never be produced by an
//   escape (escapes always start with '%'), so the two alphabets do not
//   overlap and no output string has two possible readings.
//
//   A function with a left inverse is injective: if sanitiseKey(a) ===
//   sanitiseKey(b) then a === decode(sanitiseKey(a)) === decode(sanitiseKey(b))
//   === b. Therefore distinct keys always produce distinct ids. ∎
//
//   (Contrast with the tempting shortcut of replacing unsafe characters with
//   '_' or '-': that is many-to-one — 'robots:a/b' and 'robots:a-b' would
//   collide — and a collision between two `session:` keys is a session
//   takeover. Do not "simplify" this.)
//
// In practice nothing gets escaped: session/magic tokens are base64url
// ([A-Za-z0-9_-]), hostnames are [a-z0-9.-], hashes are hex and subject ids
// are UUIDs — all inside the preserved set. The escaping exists so that the
// day someone adds a key with a slash or a unicode host in it, it still cannot
// collide and still cannot be rejected by Cosmos.

const PRESERVED = /^[A-Za-z0-9._:-]$/;
const MAX_ID_LENGTH = 1023;

export function sanitiseKey(key) {
  if (typeof key !== 'string' || key === '') {
    throw new Error('invalid_session_key: must be a non-empty string');
  }
  const encoder = new TextEncoder();
  let out = '';
  for (const ch of key) { // iterates by code point, so surrogate pairs stay whole
    if (PRESERVED.test(ch)) {
      out += ch;
      continue;
    }
    for (const byte of encoder.encode(ch)) {
      out += '%' + byte.toString(16).toUpperCase().padStart(2, '0');
    }
  }
  if (out.length > MAX_ID_LENGTH) {
    // Truncating would destroy injectivity, and hashing would make the id
    // opaque for no benefit. Refuse instead.
    throw new Error('invalid_session_key: sanitised key exceeds the 1023-char Cosmos id limit');
  }
  return out;
}

// ---------------------------------------------------------------------------
// get / put / del
// ---------------------------------------------------------------------------

/**
 * @param {string} key
 * @returns {Promise<string|null>} the stored string, or null if absent or expired.
 */
export async function get(key) {
  const id = sanitiseKey(key);
  const doc = await pointRead(handle(), id, id);
  if (!doc) return null;
  // Explicit expiry check — see the header comment. A document past expiresAt
  // is treated as absent even though Cosmos still has it on disk.
  if (typeof doc.expiresAt === 'string' && doc.expiresAt <= new Date().toISOString()) {
    return null;
  }
  return typeof doc.v === 'string' ? doc.v : null;
}

/**
 * Write (or replace) a key. ttlSeconds is REQUIRED — this store holds only
 * short-lived state and there is no such thing as a legitimate unbounded write
 * here. Cosmos expires the document; expiresAt is what get() actually trusts.
 *
 * R3 GUARD: writing a `session:` key is refused. Session tokens are minted in
 * exactly one place — verifyMagicTokenAndStartSession() in auth.js, which
 * calls putSessionTokenR3Only() below. This turns a review-time convention
 * into a runtime control. Do not route around it.
 */
export async function put(key, value, ttlSeconds) {
  if (typeof key === 'string' && key.startsWith('session:')) {
    throw new Error(
      'r3_violation: session tokens may only be minted by verifyMagicTokenAndStartSession(); ' +
        'see the R3 block at the top of auth.js',
    );
  }
  return writeRecord(key, value, ttlSeconds);
}

/**
 * The ONLY writer of `session:` keys. Named this way so the R3 invariant is
 * greppable: this definition, plus exactly one call — in auth.js, inside
 * verifyMagicTokenAndStartSession().
 *
 *   grep -rnE '^\s*await sessions\.putSessionTokenR3Only\(' api/src --include=*.js
 *
 * must return exactly ONE line. A second call site is a bug report.
 *
 * Deliberately kept out of the default export below, so the namespace-import
 * style route code uses (`import sessions from './sessions.js'`) cannot reach
 * it by accident.
 */
export async function putSessionTokenR3Only(key, value, ttlSeconds) {
  if (!key.startsWith('session:')) {
    throw new Error('putSessionTokenR3Only is only for session: keys');
  }
  return writeRecord(key, value, ttlSeconds);
}

async function writeRecord(key, value, ttlSeconds) {
  const id = sanitiseKey(key);
  if (typeof value !== 'string') {
    throw new Error('invalid_session_value: must be a string (JSON.stringify it first)');
  }
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error('invalid_ttl: ttlSeconds is required and must be a positive number');
  }
  const ttl = Math.ceil(ttlSeconds);
  const doc = {
    id,
    pk: id, // partition key /pk — one logical partition per key, perfectly spread
    v: value,
    ttl, // Cosmos TTL: storage reclamation only (container needs defaultTtl enabled)
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(), // the real boundary
  };
  try {
    // upsert: KV semantics — writing an existing key replaces it.
    await handle().items.upsert(doc);
  } catch (err) {
    throw wrapCosmosError(err, 'upsert');
  }
}

/** Delete a key. Absent is not an error. */
export async function del(key) {
  const id = sanitiseKey(key);
  await deleteItem(handle(), id, id);
}

// putSessionTokenR3Only is intentionally absent from the default export (R3).
export default { get, put, del, sanitiseKey };
