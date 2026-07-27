-- CONSENT ARCHAEOLOGY — D1 schema
-- Load with:  wrangler d1 execute consent_archaeology --remote --file=./schema.sql
--
-- R1: There is NO SSN column in this schema. There will never be an SSN column
--     in this schema. A public repo that stores SSNs behind a dramatic UI is a
--     phishing kit regardless of intent. Brokers key on name + address history
--     + email + phone; an SSN is never needed. Do not add one in a migration.
--
-- R5: PII is radioactive. Every column that holds subject-supplied personal
--     data is *_ciphertext — AES-256-GCM, key from `wrangler secret put
--     PII_ENCRYPTION_KEY` (see src/crypto.js). Plaintext PII never touches D1.
--     The only derived value stored is email_hash, an HMAC-SHA256 salted hash
--     used solely for dedup — kept after the 90-day purge so a purged subject
--     re-appearing doesn't create duplicate rows.

-- ---------------------------------------------------------------------------
-- subjects — one row per verified-or-pending identity.
-- pii_ciphertext = AES-GCM( JSON{fullName,email,phone?,city,state,
--                                priorAddresses?,birthYear?} )
-- (Note what is NOT in that JSON: no SSN, not the last 4, not ever. R1.)
-- purge (R5): after 90 days without activity, pii_ciphertext is set NULL and
-- purged_at stamped by the cron in src/index.js. email_hash survives for dedup.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subjects (
  id               TEXT PRIMARY KEY,          -- random UUID, safe to expose
  email_hash       TEXT NOT NULL UNIQUE,      -- HMAC-SHA256(PII_HASH_SALT, lowercased email)
  pii_ciphertext   TEXT,                      -- NULL once purged/deleted
  created_at       TEXT NOT NULL,             -- ISO 8601
  verified_at      TEXT,                      -- first successful magic-link click (R3)
  last_activity_at TEXT NOT NULL,             -- purge clock (R5)
  donate_dismissed INTEGER NOT NULL DEFAULT 0,-- permanent; never re-prompt (DESIGN §5)
  purged_at        TEXT                       -- set by the 90-day purge cron
);
CREATE INDEX IF NOT EXISTS idx_subjects_purge
  ON subjects (last_activity_at) WHERE purged_at IS NULL;

-- ---------------------------------------------------------------------------
-- sweeps — one row per broker sweep run (R4: allowlist only, rate-limited).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sweeps (
  id           TEXT PRIMARY KEY,
  subject_id   TEXT NOT NULL REFERENCES subjects(id),
  status       TEXT NOT NULL CHECK (status IN ('running','complete','failed')),
  total        INTEGER NOT NULL,              -- sweepable brokers at start time
  done         INTEGER NOT NULL DEFAULT 0,
  error_code   TEXT,                          -- machine code only — NEVER PII (R5)
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,                 -- progress heartbeat (stall detection)
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sweeps_subject ON sweeps (subject_id, created_at);

-- ---------------------------------------------------------------------------
-- findings — one row per (sweep, broker). Deliberately PII-free:
--   * published_fields is a JSON array of FIELD NAMES ONLY (e.g.
--     ["name","city","phone"]) — never the values a broker publishes.
--   * The broker search URL is NOT stored (it embeds the subject's name);
--     it is re-derived from brokers.js when needed.
-- Broker metadata (legal name, HQ, registry id, opt-out URL) lives in
-- src/brokers.js, keyed by broker_id — the reviewed allowlist is the single
-- source of truth (R4).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS findings (
  id               TEXT PRIMARY KEY,
  sweep_id         TEXT NOT NULL REFERENCES sweeps(id),
  subject_id       TEXT NOT NULL REFERENCES subjects(id),
  broker_id        TEXT NOT NULL,             -- key into src/brokers.js
  status           TEXT NOT NULL CHECK (status IN ('ok','skipped_robots','error')),
  matched          INTEGER NOT NULL DEFAULT 0,
  published_fields TEXT NOT NULL DEFAULT '[]',-- JSON array of field NAMES only
  error_code       TEXT,                      -- machine code only — NEVER PII
  created_at       TEXT NOT NULL,
  UNIQUE (sweep_id, broker_id)
);
CREATE INDEX IF NOT EXISTS idx_findings_subject ON findings (subject_id);

-- ---------------------------------------------------------------------------
-- demands — generated demand letters (rtk / disclosure / delete / provenance).
-- The letter text contains the subject's own name and contact (R7 — a real,
-- identifiable human signs it), so it is stored encrypted and nulled on purge.
-- letter_hash (SHA-256 of the plaintext markdown) survives the purge so a
-- user-retained copy can still be proven authentic.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS demands (
  id                TEXT PRIMARY KEY,
  subject_id        TEXT NOT NULL REFERENCES subjects(id),
  finding_id        TEXT NOT NULL REFERENCES findings(id),
  type              TEXT NOT NULL CHECK (type IN ('rtk','disclosure','delete','provenance')),
  letter_ciphertext TEXT,                     -- AES-GCM; NULL once purged
  letter_hash       TEXT NOT NULL,            -- SHA-256 hex of plaintext letter
  created_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_demands_subject ON demands (subject_id);

-- ---------------------------------------------------------------------------
-- evidence — the hash-chained evidence locker (DESIGN §4c).
-- Per subject:  hash = SHA256( prev_hash + canonicalJSON(entry) )
-- where entry = {seq, company, element, narrative, occurredAt, createdAt}
-- and the genesis prev_hash is 64 zeros. Tampering with any entry breaks every
-- subsequent hash — that chain is what makes the export credible as evidence.
-- narrative is the user's own account (PII-adjacent) → encrypted, nulled on
-- purge; the chain hashes remain so a user-exported copy stays verifiable.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evidence (
  id                   TEXT PRIMARY KEY,
  subject_id           TEXT NOT NULL REFERENCES subjects(id),
  seq                  INTEGER NOT NULL,      -- 1,2,3… per subject
  company              TEXT NOT NULL,         -- the accused company (not subject PII)
  element              INTEGER NOT NULL CHECK (element IN (1,2,3,4)),
  narrative_ciphertext TEXT,                  -- AES-GCM; NULL once purged
  occurred_at          TEXT NOT NULL,
  created_at           TEXT NOT NULL,
  prev_hash            TEXT NOT NULL,
  hash                 TEXT NOT NULL,
  UNIQUE (subject_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_evidence_subject ON evidence (subject_id, seq);
