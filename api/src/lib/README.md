# `api/src/lib/` — the storage layer

Port of the Cloudflare Worker's D1 + KV data layer to Azure Cosmos DB.
Implements [`api/CONTRACT.md`](../../CONTRACT.md) exactly. All Hard Rules in
[`DESIGN.md` §1](../../../DESIGN.md) still apply, unchanged.

**Module system: ES modules** (`"type": "module"`), Node 22. Do not mix in
`require()`.

| file | what |
|---|---|
| `config.js` | App Settings from `process.env`, validated at import time. Missing required setting ⇒ startup throws. |
| `cosmos.js` | `CosmosClient` singleton + container handles + the four primitives (`pointRead`, `createItem`, `patchItem`, `queryAll`). |
| `repo.js` | Every method in CONTRACT.md §`lib/repo.js`. |
| `sessions.js` | `get` / `put` / `del` — the KV replacement. |
| `crypto.js` | AES-256-GCM PII, salted dedup hashes, evidence-chain hashing. **Wire format frozen.** |
| `auth.js` | Magic-link issue/verify, session bearer tokens, Brevo send. **The R3 gate.** |
| `http.js` | `HttpError`, `json`, `readJson`, `nowISO`. |

Runtime dependency: `@azure/cosmos`. (`@azure/functions` is in
`api/package.json` because the v4 programming model requires it to register
triggers — nothing under `lib/` imports it, so this layer is testable with
`node --test` and no Functions host.)

---

## Container and partition-key layout

Database `consentarch`.

| container | partition key | why |
|---|---|---|
| `sessions` | `/pk` | id == pk, one logical partition per key. Perfect spread, every access is a point read. |
| `subjects` | `/id` | one document per subject; every access is by subject id. |
| `sweeps` | `/subjectId` | |
| `findings` | `/subjectId` | a whole dossier read is **single-partition** |
| `demands` | `/subjectId` | |
| `evidence` | `/subjectId` | the hash chain never spans subjects |

Everything a logged-in subject does touches exactly one logical partition per
container — the partition key is always `subjectId`, which `requireSession()`
has already produced. That is the entire reason the layout looks like this.

### Container creation requirements (deploy script)

These are not optional; the code above assumes them.

1. **`sessions` — `defaultTtl` must be enabled** (e.g. `86400`, or `-1` to let
   per-item `ttl` govern). Without it Cosmos ignores the per-item `ttl` and the
   container grows forever. Note that expiry *correctness* does not depend on
   this — see "Expiry" below.
2. **`evidence` — `uniqueKeyPolicy: { uniqueKeys: [{ paths: ['/seq'] }] }`.**
   Unique keys are scoped per logical partition, and the partition key is
   `/subjectId`, so this is exactly D1's `UNIQUE (subject_id, seq)`. It is the
   referee for the evidence route's seq race. **Without it, two concurrent
   appends silently fork the hash chain**, and a forked chain is a broken
   evidence file.
3. **`findings` — `uniqueKeyPolicy: { uniqueKeys: [{ paths: ['/sweepId', '/brokerId'] }] }`**
   reproduces `UNIQUE (sweep_id, broker_id)`. A sweep never spans subjects, so
   per-partition scoping is equivalent. This keeps the resumable sweep from
   double-recording a broker.
4. **Composite index on `findings`: `[{ path: '/sweepId', order: 'ascending' },
   { path: '/createdAt', order: 'ascending' }]`** — `listFindingsBySweep()`
   filters on one property and orders by another. It works without the
   composite index; it costs less with it.
5. The default indexing policy (index everything) is fine everywhere else. Do
   not hand-tune it to exclude `emailHash`, `lastActivityAt`, `createdAt`,
   `seq` or `sweepId` — every one of them is filtered or ordered on.

`subjects.emailHash` **cannot** be given a unique key: the partition key is
`/id`, so every subject is its own partition and a unique key there constrains
nothing. See "Semantic differences" below.

---

## RU cost reasoning — read this before adding a query

Free tier is 1000 RU/s. Rough costs: **point read ≈ 1 RU**, point write/patch
≈ 5–10 RU, single-partition query ≈ 3 RU + ~1 RU per KB returned,
**cross-partition query ≈ that, multiplied by the number of physical
partitions, plus a fan-out latency penalty that grows as the account does.**

So the rules this layer follows:

- **Know the id and the partition key? Point read.** `pointRead()`. Never
  `SELECT * FROM c WHERE c.id = @id` when you have the partition key.
- **Know the partition key? Pass it.** `queryAll(handle, sql, subjectId)` sets
  `{ partitionKey }` in the feed options, which scopes execution to one
  physical partition. The SQL therefore does *not* repeat
  `WHERE c.subjectId = @id` — the option already did that, and the redundant
  predicate would only obscure who is scoping the query.
- **Updates are patches, not read-modify-write.** `patchItem()` sends
  `{ condition, operations }` in one round trip. `condition` is how
  `UPDATE … WHERE id = ? AND purged_at IS NULL` survives the port, and
  `patchItem()` returning `false` (404 or 412) is the exact equivalent of D1's
  `result.meta.changes === 0`. Read-then-write would cost double the RU and
  reintroduce a race the database can settle for us.
  ⚠ Patch conditions are **not parameterised** by the SDK — build them from
  literals only. `setSweepStatus`'s `ifStatus` is whitelisted for this reason.
- **`incr` for counters.** `incrementSweepDone` uses a server-side `incr`, so
  concurrent progress updates cannot lose one.

### The three cross-partition queries, and why they are allowed

There are exactly three fan-outs in `repo.js`, each marked
`CROSS-PARTITION (unavoidable)`:

1. `findIdByEmailHash()` — dedup lookup at intake. The partition key is the
   subject id, which is precisely the thing we are trying to find. Once per
   intake.
2. `listStaleUnpurged()` — the R5 90-day purge scan. It is *defined* as "every
   subject, regardless of partition". Runs once a day from a timer trigger, off
   the request path, and projects ids only.
3. `countVerifiedSubjects()` / `countAllDemands()` — the `/api/stats`
   aggregates. `COUNT` is evaluated server-side per partition and merged by the
   SDK, so no documents cross the wire, but RU still scales with container size.

**Do not add a fourth.** If you catch yourself writing a query without a
partition key, the answer is almost always that you already had `subjectId` in
hand from `requireSession()` and forgot to pass it. If `/api/stats` ever gets
hot, cache the numbers in the `sessions` container behind a TTL — do not keep a
running total that can silently drift, and do not report a number you cannot
recompute.

`getSweep(id)` deserves a note: the contract signature has no partition key, so
the default path is a cross-partition point query on `id` (cheap — `id` is
always indexed and matches at most one document — but still a fan-out). It
accepts an **optional second argument**, `getSweep(id, subjectId)`, which turns
it into a ~1 RU point read. Route code always has the subject id; pass it. A
sweep belonging to someone else then reads as `null`, which produces the same
404 the ownership check would.

---

## Expiry: `expiresAt` is the security boundary, TTL is the janitor

Cosmos TTL is an eventually-consistent background sweeper. An expired document
stays readable until the sweeper reaches it, and the SDK will not tell you.
A magic-link token that still authenticates one second past its 15-minute
expiry is an **authentication bug**, not a housekeeping detail.

So every `sessions` document carries an explicit `expiresAt` ISO timestamp and
`get()` compares it before returning anything. TTL is retained purely to
reclaim storage. Do not "simplify" this by deleting the check.

## Key sanitisation is injective — proof

Cosmos ids may not contain `/ \ # ?`. Worker keys look like `session:<token>`,
`magic:<token>`, `robots:<host>`, `rl:magic:<hash>`, `rl:sweep:<id>`.

`sanitiseKey()` keeps `[A-Za-z0-9._:-]` verbatim and replaces every other
character with `%` + the uppercase two-hex-digit encoding of each of its UTF-8
bytes.

It is injective because it has an explicit left inverse. Define `decode(s)`:
scan left to right; on `%`, consume exactly the next two characters as a hex
byte and emit that byte; otherwise emit the character. Then
`decode(sanitiseKey(k)) === k` for every key `k` — because `%` is itself
outside the preserved set, so a `%` in the output is *always* an escape
introducer and never a literal, and every escape is a fixed three characters,
so the scan is unambiguous. Preserved characters map to themselves and can
never be produced by an escape. A function with a left inverse is injective:
`sanitiseKey(a) === sanitiseKey(b)` ⇒ `a === decode(sanitiseKey(a)) ===
decode(sanitiseKey(b)) === b`. ∎

The obvious shortcut — replacing unsafe characters with `_` — is **many-to-one**
(`robots:a/b` and `robots:a_b` collide), and a collision between two `session:`
keys is a session takeover. Do not simplify it.

In practice nothing is ever escaped: tokens are base64url, hosts are
`[a-z0-9.-]`, hashes are hex, subject ids are UUIDs. The escaping exists so the
day someone adds a key with a slash in it, it still cannot collide.

---

## R3 is enforced at runtime, not just in review

`sessions.put()` **throws** on any key starting with `session:`. The only
writer is `sessions.putSessionTokenR3Only()`, whose single call site in the
whole repo is inside `verifyMagicTokenAndStartSession()`. It is deliberately
left out of `sessions.js`'s default export, so namespace-style route code
cannot reach it by accident.

```
grep -rnE '^\s*await sessions\.putSessionTokenR3Only\(' api/src --include=*.js
```

must return **exactly one line**, in `lib/auth.js`. A second call site is a bug
report. There is no admin bypass, no env override, no debug flag, and none may
be added.

## R5 notes for anyone editing this layer

- Nothing here logs. Not ids, not counts, not caught errors.
- Cosmos SDK errors are re-thrown as `CosmosOperationError`
  (`cosmos_<op>_failed: status <n>`) with the original on `.cause`. That is
  safe because **no repo query ever takes a PII parameter** — parameters are
  only UUIDs, salted hashes, ISO timestamps and broker ids. Ciphertext travels
  in document bodies, never in a `WHERE` clause. Keep it that way.
- `diagnosticLevel` is pinned to `'info'` in `cosmos.js`. Do not raise it to
  `'debug'`, and do not set `AZURE_LOG_LEVEL=verbose` in App Settings: both make
  the SDK log request bodies, which are ciphertext and subject ids.
- `config` renders as `[config: redacted]` under both `JSON.stringify()` and
  `console.log()`. That is on purpose.

---

## Semantic differences forced by the document model

| SQL original | Cosmos port | consequence |
|---|---|---|
| `email_hash TEXT UNIQUE` | not enforceable (unique keys are per-partition; pk is `/id`) | dedup is a read-then-write in the intake route; two concurrent intakes for one address can create two subjects. Both verify independently — a duplicate row, not a leak. |
| `UNIQUE (subject_id, seq)` on evidence | `uniqueKeyPolicy /seq` (pk `/subjectId`) | **equivalent**, but only if the container is created with it. |
| `UNIQUE (sweep_id, broker_id)` on findings | `uniqueKeyPolicy /sweepId,/brokerId` | equivalent, same caveat. |
| `matched INTEGER` (0/1) | boolean | `!!f.matched` still works either way. |
| `published_fields TEXT` (JSON string) | real JSON array | readers no longer need `JSON.parse`. `createFinding` accepts a string and parses it, so a stray `JSON.stringify` at a call site cannot corrupt a dossier. |
| `donate_dismissed INTEGER` | boolean | |
| `DB.batch([...])` across tables | no equivalent | Cosmos transactional batch is single-container **and** single-partition. Two consequences below. |
| `ORDER BY created_at` | `ORDER BY c.createdAt` | ISO-8601 strings, so lexicographic order is chronological order, same as SQLite TEXT. **Ties are ordered differently**: SQLite fell back to rowid (insertion order), Cosmos falls back to an internal index key. Only reachable for two documents written in the same millisecond; the sweep loop's 750 ms politeness delay makes it unreachable in practice. |
| `COUNT(*)` | `SELECT VALUE COUNT(1)` | exact, evaluated server-side, but cross-partition (see above). |

### The two lost atomic groups

1. **Finding insert + `sweeps.done + 1`.** These were one `DB.batch`; they are
   now two round trips (different containers). A crash between them
   under-counts `done`. This is tolerable *by design*: `done` drives the
   progress bar only, and the findings rows remain the source of truth for what
   has been attempted — which is what makes the sweep resumable in the first
   place. Do not "fix" it by deriving `done` from a `COUNT` on every poll; that
   turns a free field read into a query per poll.
2. **Export-and-delete's five-statement batch.** Now sequential per-container
   deletes. Delete children first (evidence → demands → findings → sweeps →
   subject) so a failure can never orphan a subject document behind deleted
   children. A partial failure **throws** — no swallowed exceptions, no
   optimistic return — and the operation is idempotent, so the caller can retry.

### Deletes and null-outs

`deletePartition()` / `nullFieldInPartition()` query the ids in one partition,
then issue point operations with a concurrency cap of 8. Deliberately **not**
`items.bulk()`: bulk returns a per-operation status array that makes it easy to
report success while individual operations failed, and its API has churned
across SDK minor versions. Point operations are the most stable surface in the
SDK and a rejection propagates.

---

## Call-style notes for route authors

- `json(data, status, headers)` returns an Azure Functions v4
  `HttpResponseInit` (`{ status, headers, body }`), not a `Response`. Return it
  straight from a v4 handler. Status, headers and body bytes are identical to
  the Worker's.
- `requireSession(request)` — the second `env` argument is accepted and ignored.
- The `crypto.js` and `auth.js` helpers keep the Worker's `(env, …)` signatures
  and also accept the env omitted: `encryptPII(config, text)` and
  `encryptPII(text)` are equivalent, as are `issueMagicToken(config, id)` and
  `issueMagicToken(id)`. Pass `config` if you prefer the code to read like the
  original.
- "Not found" is `null` / `[]` / `false` / `0`, never a throw. Contract methods
  typed as returning nothing return a **boolean** here (`true` = applied,
  `false` = no matching document). Ignore it if you do not need it; `auth.js`
  needs it to reproduce the Worker's 401/404 behaviour.
- A unique-constraint violation throws `RepoConflictError` (`.status === 409`,
  `.conflict === true`), exported from `repo.js`. That is what the evidence
  seq-retry loop should catch — the D1 version matched `/UNIQUE/i` on a driver
  message.
