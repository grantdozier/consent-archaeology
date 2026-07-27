// config.js — App Settings, read and validated ONCE at module load (startup).
//
// MODULE SYSTEM: ES modules ("type": "module" in api/package.json). Node 22.
// Every file under src/lib/ is ESM; do not mix in require().
//
// Cloudflare handed the Worker an `env` object per request. Azure Functions has
// no such thing — App Settings arrive as process.env. This module is the single
// place that reads them, so nothing else in the codebase touches process.env.
//
// FAIL LOUDLY (CONTRACT.md §Configuration). A missing required setting throws
// at import time, which means the Function App fails to load and every route
// returns 500 with the reason in the host log. That is deliberate and correct:
// an encryption key that silently defaults, or a Cosmos endpoint that silently
// points nowhere, is the worst possible failure mode for a tool holding PII.
// There is no bypass flag. Do not add one.
//
// R5: this object holds secrets. It is deliberately hostile to being logged —
// both JSON.stringify() and console.log() render it redacted (see below).
// Never interpolate a config value into an error message or a log line.

/** Settings with no meaningful default. Absent or empty ⇒ startup throws. */
const REQUIRED = [
  'COSMOS_ENDPOINT',      // https://<account>.documents.azure.com:443/
  'COSMOS_KEY',           // primary key (deploy script)
  'COSMOS_DB',            // "consentarch"
  'PII_ENCRYPTION_KEY',   // base64, exactly 32 bytes — AES-256-GCM (R5)
  'PII_HASH_SALT',        // base64, 32 bytes — HMAC-SHA256 dedup salt (R5)
  'BREVO_API_KEY',        // magic-link email. No email ⇒ no session ⇒ no R3 gate.
  'ALLOWED_ORIGIN',       // CORS origin(s) for the Pages frontend
  'PUBLIC_APP_URL',       // where magic links land (verify.html reads ?token=)
  'SENDER_EMAIL',         // Brevo sender — domain verified via CLOUDFLARE DNS
];

// Deliberately NOT required, each for a stated reason — these are documented
// behaviours, not silent defaults:
//
//   FIRECRAWL_API_KEY — absent ⇒ every broker in a sweep records the real error
//     code `firecrawl_not_configured` in its finding row, exactly as the Worker
//     did. The failure is surfaced per-broker rather than hidden; booting the
//     whole app down because scraping is unconfigured would take out /api/stats
//     and the R5 export-and-delete endpoint too.
//   SENDER_NAME — cosmetic display name on the verification email. The Worker
//     used the same literal fallback.

const SENDER_NAME_FALLBACK = 'CONSENT ARCHAEOLOGY';

function readRaw(name) {
  const v = process.env[name];
  return typeof v === 'string' ? v.trim() : '';
}

/** Decode standard base64 → byte length, or -1 if it is not valid base64. */
function base64ByteLength(value) {
  try {
    // atob is a Node 22 global and behaves exactly like the Workers one:
    // it THROWS on invalid base64, which is what we want here.
    return atob(value).length;
  } catch {
    return -1;
  }
}

function validate() {
  const missing = REQUIRED.filter((name) => readRaw(name) === '');
  if (missing.length) {
    // Names only. Never values (R5).
    throw new Error(
      'server_misconfigured: required App Settings are missing or empty: ' +
        missing.join(', ') +
        '. Set them on the Function App (az functionapp config appsettings set) — ' +
        'never in the repo, never in local.settings.json (gitignored).',
    );
  }

  const endpoint = readRaw('COSMOS_ENDPOINT');
  if (!/^https:\/\//i.test(endpoint)) {
    throw new Error('server_misconfigured: COSMOS_ENDPOINT must be an https:// URI');
  }

  // AES-256 needs exactly 32 key bytes. crypto.js re-checks this at first use;
  // checking here too means a bad key is caught at deploy, not at the first
  // user who tries to submit their name.
  const keyBytes = base64ByteLength(readRaw('PII_ENCRYPTION_KEY'));
  if (keyBytes === -1) {
    throw new Error('server_misconfigured: PII_ENCRYPTION_KEY is not valid base64 (openssl rand -base64 32)');
  }
  if (keyBytes !== 32) {
    throw new Error('server_misconfigured: PII_ENCRYPTION_KEY must decode to 32 bytes (openssl rand -base64 32)');
  }

  // The salt is used as the raw HMAC key material *as a string* — that is the
  // Worker's wire format and it must not change, so we validate length only.
  if (readRaw('PII_HASH_SALT').length < 16) {
    throw new Error('server_misconfigured: PII_HASH_SALT looks too short (openssl rand -base64 32)');
  }

  if (!/^https?:\/\//i.test(readRaw('PUBLIC_APP_URL'))) {
    throw new Error('server_misconfigured: PUBLIC_APP_URL must be an absolute http(s) URL');
  }
}

validate();

/**
 * Frozen settings snapshot.
 *
 * Shaped so it can be passed straight into the ported crypto/auth helpers as
 * their `env` argument — `encryptPII(config, plaintext)` reads exactly like the
 * Worker's `encryptPII(env, plaintext)` did.
 */
export const config = Object.freeze({
  COSMOS_ENDPOINT: readRaw('COSMOS_ENDPOINT'),
  COSMOS_KEY: readRaw('COSMOS_KEY'),
  COSMOS_DB: readRaw('COSMOS_DB'),

  PII_ENCRYPTION_KEY: readRaw('PII_ENCRYPTION_KEY'),
  PII_HASH_SALT: readRaw('PII_HASH_SALT'),

  BREVO_API_KEY: readRaw('BREVO_API_KEY'),
  /** May be '' — see the note above; sweeps then record firecrawl_not_configured. */
  FIRECRAWL_API_KEY: readRaw('FIRECRAWL_API_KEY'),

  ALLOWED_ORIGIN: readRaw('ALLOWED_ORIGIN'),
  /** Comma-separated ALLOWED_ORIGIN split for CORS checks (localhost dev entries welcome). */
  allowedOrigins: Object.freeze(
    readRaw('ALLOWED_ORIGIN').split(',').map((s) => s.trim()).filter(Boolean),
  ),

  PUBLIC_APP_URL: readRaw('PUBLIC_APP_URL').replace(/\/+$/, ''),
  SENDER_EMAIL: readRaw('SENDER_EMAIL'),
  SENDER_NAME: readRaw('SENDER_NAME') || SENDER_NAME_FALLBACK,

  // R5 belt-and-braces: make the obvious ways of accidentally logging secrets
  // produce nothing useful. JSON.stringify(config) and console.log(config)
  // both render the redacted form.
  toJSON() {
    return '[config: redacted]';
  },
  [Symbol.for('nodejs.util.inspect.custom')]() {
    return '[config: redacted]';
  },
});

/**
 * Fetch a setting that a specific code path requires, throwing a loud, PII-free
 * error when it is absent. Use for the optional settings (FIRECRAWL_API_KEY) at
 * the point of use, so the failure names the setting instead of being a
 * mysterious 401/500 from a third party.
 */
export function requireSetting(name) {
  const value = config[name];
  if (typeof value !== 'string' || value === '') {
    throw new Error(`server_misconfigured: ${name} is not set`);
  }
  return value;
}
