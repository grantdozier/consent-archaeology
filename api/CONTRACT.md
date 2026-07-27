# Azure port — data layer contract

Binding interface between `api/src/lib/` (storage) and `api/src/routes/` (logic).
Derived mechanically from every D1 query and KV call in the original Worker, so the
port is faithful rather than reimagined. **All Hard Rules in `../DESIGN.md` §1 still
apply, unchanged.**

## Why we moved, and what did NOT move

Backend moved from Cloudflare Workers + D1 + KV to **Azure Functions (Node 22,
Linux, Consumption/Y1) + Cosmos DB (free tier)**, in `rg-consent-archaeology`,
`centralus` — matching the existing DTG Azure pattern (`dtg-integrations` runs the
same shape).

**DNS did not move and cannot.** `doziertechgroup.com` is authoritative on
Cloudflare (`jonah.ns.cloudflare.com`, `chin.ns.cloudflare.com`). There are no
Azure DNS zones on this subscription. Every DNS record — the Pages CNAME, the API
subdomain, Brevo's sender verification — still goes in the **Cloudflare dashboard**.
The domain being *registered* through Azure does not change this.

## Why Cosmos, and why not Static Web Apps

- **Consumption plan** — 1M executions + 400k GB-s free per month. This workload
  will not come close.
- **Cosmos free tier** — 1000 RU/s + 25 GB, permanently, one per subscription
  (unclaimed on this one). Critically it has **native document TTL**, which is a
  direct replacement for KV's `expirationTtl`: magic-link tokens, session tokens,
  rate-limit counters and the robots.txt cache all expire on their own.
- **Not Static Web Apps managed functions**, despite same-origin being appealing:
  they do not support timer triggers, and R5's 90-day PII purge needs one.

## Storage model

Cosmos database `consentarch`. Containers and partition keys:

| container | partition key | notes |
|---|---|---|
| `sessions` | `/pk` | default TTL 86400s; per-item `ttl` overrides. KV replacement. |
| `subjects` | `/id` | one doc per subject |
| `sweeps` | `/subjectId` | |
| `findings` | `/subjectId` | so a dossier read is single-partition |
| `demands` | `/subjectId` | |
| `evidence` | `/subjectId` | |

Field names move from `snake_case` (SQL) to `camelCase` (documents). The mapping is
1:1: `pii_ciphertext` → `piiCiphertext`, `last_activity_at` → `lastActivityAt`, etc.
`purged_at`/`verified_at` become `purgedAt`/`verifiedAt`, absent or `null` when unset.

**Timestamps** stay ISO-8601 strings, as in the Worker, so comparisons still sort
lexicographically.

## `lib/repo.js` — required exports

Every method is `async`. Anything returning "not found" returns `null`, never throws.
No method may log PII (R5).

### subjects
```
findIdByEmailHash(emailHash)            -> { id } | null
createSubject({ id, emailHash, piiCiphertext, createdAt, lastActivityAt })
getSubject(id)                          -> doc | null
getSubjectPii(id)                       -> piiCiphertext | null   // null if purged
touchSubject(id, ts)                                              // no-op if purged
markVerified(id, ts)
updateSubjectPii(id, piiCiphertext, ts)                           // clears purgedAt
setDonateDismissed(id)
getDonateDismissed(id)                  -> boolean
listStaleUnpurged(cutoffIso)            -> [{ id }]               // lastActivityAt < cutoff
purgeSubject(id, ts)                                              // piiCiphertext=null, purgedAt=ts
deleteSubject(id)
countVerifiedSubjects()                 -> number
```

### sweeps
```
createSweep({ id, subjectId, status, total, done, createdAt, updatedAt })
getSweep(id)                            -> doc | null
listSweepsBySubject(subjectId)          -> [doc]   // createdAt asc
latestSweepBySubject(subjectId)         -> doc | null
incrementSweepDone(id, subjectId, ts)
setSweepStatus(id, subjectId, { status, errorCode, completedAt, updatedAt })
deleteSweepsBySubject(subjectId)
```

### findings
```
createFinding({ id, sweepId, subjectId, brokerId, status, matched,
                publishedFields, errorCode, createdAt })
getOwnedFinding(id, subjectId)          -> doc | null   // ownership check, R3
listFindingsBySubject(subjectId)        -> [doc]   // createdAt asc
listFindingsBySweep(sweepId, subjectId) -> [doc]
brokerIdsBySweep(sweepId, subjectId)    -> [string]
deleteFindingsBySubject(subjectId)
```

### demands
```
createDemand({ id, subjectId, findingId, type, letterCiphertext, letterHash, createdAt })
listDemandsBySubject(subjectId)         -> [doc]   // createdAt asc
countAllDemands()                       -> number
nullDemandCiphertextBySubject(subjectId)
deleteDemandsBySubject(subjectId)
```

### evidence
```
createEvidence({ id, subjectId, seq, company, element, narrativeCiphertext,
                 occurredAt, createdAt, prevHash, hash })
listEvidenceBySubject(subjectId)        -> [doc]   // seq asc
lastEvidenceBySubject(subjectId)        -> { seq, hash } | null
nullEvidenceCiphertextBySubject(subjectId)
deleteEvidenceBySubject(subjectId)
```

## `lib/sessions.js` — KV replacement

Same three-call shape the Worker used, so route code barely changes:

```
get(key)                    -> string | null      // expired items read as null
put(key, value, ttlSeconds) // ttlSeconds required; no unbounded writes
del(key)
```

Backed by the `sessions` container. Document shape:
`{ id: <sanitised key>, pk: <sanitised key>, v: <string value>, ttl: <seconds> }`.

Cosmos `id` may not contain `/ \ # ?`, and the Worker's keys look like
`session:<token>` and `robots:<origin>` — so **sanitise**: percent-encode anything
outside `[A-Za-z0-9._:-]`. The mapping must be injective; two different keys must
never collide.

TTL is enforced by Cosmos, but `get()` must **also** check an explicit `expiresAt`
field and treat a past value as absent. Cosmos TTL is eventually-consistent sweeping,
and a magic-link token that is readable for even a few seconds past expiry is an auth
bug, not a housekeeping detail.

## `lib/crypto.js`

Port of the Worker's, essentially unchanged: Node 22 exposes the same Web Crypto API
at `globalThis.crypto`. Keep AES-256-GCM with a fresh IV per record, the `v1:` blob
format, HMAC-SHA256 salted dedup hashes, and `canonicalJSON` + `sha256Hex` for the
evidence hash chain. **The wire format must not change** — same ciphertext layout, so
the crypto tests port verbatim.

## Configuration

Worker `wrangler secret` → Azure **App Settings** (`process.env`):

| name | what | source |
|---|---|---|
| `COSMOS_ENDPOINT` | Cosmos URI | set by deploy script |
| `COSMOS_KEY` | primary key | set by deploy script |
| `COSMOS_DB` | `consentarch` | set by deploy script |
| `PII_ENCRYPTION_KEY` | base64, 32 bytes | `openssl rand -base64 32` |
| `PII_HASH_SALT` | base64, 32 bytes | `openssl rand -base64 32` |
| `BREVO_API_KEY` | transactional email | Brevo dashboard — **Grant pastes** |
| `FIRECRAWL_API_KEY` | broker scrape | Firecrawl dashboard — **Grant pastes** |
| `ALLOWED_ORIGIN` | CORS origin for the Pages frontend | deploy script |

Never in the repo, never in `local.settings.json` (which is gitignored).

Startup must **fail loudly** on a missing required setting rather than degrading to a
half-working state — an encryption key that silently defaults is the worst possible
failure mode here.

## HTTP surface — unchanged

Same paths, methods, request bodies and response shapes as the Worker. The frontend
must not need editing beyond `API_BASE`. See `../DESIGN.md` and `docs/assets/api.js`.
Note the field is `demandsDrafted` (never `demandsSent` — nothing is ever sent).
