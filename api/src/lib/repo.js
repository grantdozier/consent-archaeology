// repo.js — the data layer. Implements api/CONTRACT.md §"lib/repo.js" exactly.
// ES modules, Node 22. Cosmos DB replaces D1; every method here is a direct
// port of a D1 statement in worker/src/.
//
// RULES THIS FILE KEEPS (read before editing — see README.md for the long form):
//
//  * Every method is async. "Not found" returns null (or [] / false / 0 for
//    the list, boolean and count methods). Not found is never an exception.
//  * No method logs anything, ever. Not ids, not counts, not errors (R5).
//  * Field names are camelCase documents; the SQL snake_case mapping is 1:1.
//  * Point-read where an id AND its partition key are known (~1 RU). Query
//    with { partitionKey } where the partition is known (single-partition).
//    Fan out across partitions ONLY in the three places marked
//    "CROSS-PARTITION (unavoidable)". Adding a fourth is a real cost decision,
//    not a convenience — read README.md first.
//  * Updates are server-side patches with a `condition`, not read-modify-write.
//    patchItem() returning false is the exact equivalent of D1's
//    `result.meta.changes === 0` — "row absent, or the WHERE clause excluded it".
//
// Methods that the contract types as returning nothing return a boolean here
// (true = applied, false = no matching document). That is additive: callers may
// ignore it, and auth.js needs it to reproduce the Worker's 401/404 behaviour.

import {
  container,
  pointRead,
  createItem,
  patchItem,
  deleteItem,
  queryAll,
  queryValues,
  mapLimit,
  clean,
  RepoConflictError,
} from './cosmos.js';

export { RepoConflictError };

const subjects = () => container('subjects');
const sweeps = () => container('sweeps');
const findings = () => container('findings');
const demands = () => container('demands');
const evidence = () => container('evidence');

/** Concurrency cap for the per-partition sweeps (purge, export-and-delete). */
const FANOUT = 8;

/**
 * `purged_at IS NULL` as a patch condition. Built from literals only — patch
 * conditions are not parameterised by the SDK, so nothing caller-supplied may
 * ever be interpolated into one.
 */
const NOT_PURGED = 'FROM c WHERE (NOT IS_DEFINED(c.purgedAt) OR IS_NULL(c.purgedAt))';

/** Delete every document in one subject's partition of a container. */
async function deletePartition(handle, subjectId) {
  const ids = await queryValues(handle, 'SELECT VALUE c.id FROM c', subjectId);
  await mapLimit(ids, FANOUT, (id) => deleteItem(handle, id, subjectId));
  return ids.length;
}

/** Null out one encrypted field on every document in a subject's partition. */
async function nullFieldInPartition(handle, subjectId, path) {
  const ids = await queryValues(handle, 'SELECT VALUE c.id FROM c', subjectId);
  await mapLimit(ids, FANOUT, (id) =>
    patchItem(handle, id, subjectId, [{ op: 'set', path, value: null }]),
  );
  return ids.length;
}

// ===========================================================================
// subjects — partition key /id (one logical partition per subject)
// ===========================================================================

/**
 * CROSS-PARTITION (unavoidable) #1. The dedup lookup keys on emailHash, but the
 * partition key is /id — a subject's own id is exactly what we do not have at
 * intake time. Bounded and rare (once per intake), and emailHash is indexed by
 * the default policy.
 *
 * ⚠ SEMANTIC DIFFERENCE from D1: `email_hash TEXT NOT NULL UNIQUE` cannot be
 * reproduced. A Cosmos unique key policy is scoped to a logical partition, and
 * with pk = /id every subject is its own partition, so a unique key on
 * /emailHash would constrain nothing. Uniqueness is therefore enforced by this
 * read-then-write in the intake route, which has a race window: two concurrent
 * intakes for the same address can create two subjects. Both are valid, both
 * verify independently; the cost is a duplicate row, not a data leak.
 */
export async function findIdByEmailHash(emailHash) {
  const rows = await queryAll(subjects(), {
    query: 'SELECT VALUE c.id FROM c WHERE c.emailHash = @emailHash',
    parameters: [{ name: '@emailHash', value: emailHash }],
  });
  return rows.length ? { id: rows[0] } : null;
}

export async function createSubject({ id, emailHash, piiCiphertext, createdAt, lastActivityAt }) {
  return createItem(subjects(), {
    id,
    emailHash,
    piiCiphertext,
    createdAt,
    verifiedAt: null,     // first magic-link click stamps this (R3)
    lastActivityAt,       // the R5 purge clock
    donateDismissed: false,
    purgedAt: null,
  });
}

export async function getSubject(id) {
  return pointRead(subjects(), id, id);
}

/** @returns the ciphertext blob, or null when absent or purged. */
export async function getSubjectPii(id) {
  const doc = await pointRead(subjects(), id, id);
  if (!doc || doc.purgedAt) return null;
  return doc.piiCiphertext || null;
}

/**
 * Bump the purge clock. No-op (returns false) if the subject is gone or purged
 * — the Worker's `UPDATE ... WHERE id = ? AND purged_at IS NULL` with
 * `changes === 0` meaning "treat this session as invalid".
 */
export async function touchSubject(id, ts) {
  return patchItem(
    subjects(), id, id,
    [{ op: 'set', path: '/lastActivityAt', value: ts }],
    NOT_PURGED,
  );
}

/**
 * `verified_at = COALESCE(verified_at, ?), last_activity_at = ?` — first click
 * wins, later clicks only touch the clock.
 *
 * Fast path is one patch: stamp both, conditional on not-purged AND
 * not-already-verified. A 412 there means the subject exists but is already
 * verified (or is purged), so we retry with the clock-only patch; if that also
 * fails the subject is purged or gone → false, and the caller 400s.
 */
export async function markVerified(id, ts) {
  const firstTime = await patchItem(
    subjects(), id, id,
    [
      { op: 'set', path: '/verifiedAt', value: ts },
      { op: 'set', path: '/lastActivityAt', value: ts },
    ],
    'FROM c WHERE (NOT IS_DEFINED(c.purgedAt) OR IS_NULL(c.purgedAt)) ' +
      'AND (NOT IS_DEFINED(c.verifiedAt) OR IS_NULL(c.verifiedAt))',
  );
  if (firstTime) return true;
  return touchSubject(id, ts);
}

/** Re-intake: refresh PII, bump the clock, and un-purge (purgedAt → null). */
export async function updateSubjectPii(id, piiCiphertext, ts) {
  return patchItem(subjects(), id, id, [
    { op: 'set', path: '/piiCiphertext', value: piiCiphertext },
    { op: 'set', path: '/lastActivityAt', value: ts },
    { op: 'set', path: '/purgedAt', value: null },
  ]);
}

/**
 * DESIGN §5 — permanent. There is deliberately no setDonateUndismissed(); do
 * not add one.
 */
export async function setDonateDismissed(id) {
  return patchItem(subjects(), id, id, [{ op: 'set', path: '/donateDismissed', value: true }]);
}

export async function getDonateDismissed(id) {
  const doc = await pointRead(subjects(), id, id);
  return !!(doc && doc.donateDismissed);
}

/**
 * CROSS-PARTITION (unavoidable) #2. The R5 90-day purge timer scans for idle
 * subjects across the whole container; there is no partition key to scope it
 * to, by definition. Runs once a day from a timer trigger, off the request
 * path, and projects ids only — never PII.
 */
export async function listStaleUnpurged(cutoffIso) {
  const ids = await queryValues(subjects(), {
    query:
      'SELECT VALUE c.id FROM c ' +
      'WHERE (NOT IS_DEFINED(c.purgedAt) OR IS_NULL(c.purgedAt)) AND c.lastActivityAt < @cutoff',
    parameters: [{ name: '@cutoff', value: cutoffIso }],
  });
  return ids.map((id) => ({ id }));
}

/** R5 purge: drop the PII ciphertext, keep the salted emailHash for dedup. */
export async function purgeSubject(id, ts) {
  return patchItem(subjects(), id, id, [
    { op: 'set', path: '/piiCiphertext', value: null },
    { op: 'set', path: '/purgedAt', value: ts },
  ]);
}

export async function deleteSubject(id) {
  return deleteItem(subjects(), id, id);
}

/**
 * CROSS-PARTITION (unavoidable) #3a. /api/stats aggregate (R5: counts only).
 * COUNT is computed server-side per partition and merged by the SDK, so no
 * documents cross the wire — but RU scales with container size. If stats ever
 * get hot, cache the number in the sessions container with a TTL; do not
 * "optimise" it by keeping a running total that can silently drift.
 */
export async function countVerifiedSubjects() {
  const rows = await queryValues(
    subjects(),
    'SELECT VALUE COUNT(1) FROM c WHERE IS_DEFINED(c.verifiedAt) AND NOT IS_NULL(c.verifiedAt)',
  );
  return rows.length ? Number(rows[0]) || 0 : 0;
}

// ===========================================================================
// sweeps — partition key /subjectId
// ===========================================================================

export async function createSweep({ id, subjectId, status, total, done, createdAt, updatedAt }) {
  return createItem(sweeps(), {
    id,
    subjectId,
    status,                       // running | complete | failed
    total,
    done: done || 0,
    errorCode: null,              // machine code only — NEVER PII (R5)
    createdAt,
    updatedAt,                    // progress heartbeat (stall detection)
    completedAt: null,
  });
}

/**
 * The contract signature is getSweep(id), which has no partition key — so the
 * default path is a cross-partition point query on the id. It is cheap (id is
 * always indexed and matches at most one document) but it still fans out.
 *
 * OPTIONAL second argument, additive: pass the caller's own subjectId and this
 * becomes a ~1 RU point read. Prefer it. A sweep belonging to someone else then
 * reads as null, which is the same 404 the route produces from its ownership
 * check — the outcome is identical, the cost is not.
 */
export async function getSweep(id, subjectId) {
  if (subjectId) return pointRead(sweeps(), id, subjectId);
  const rows = await queryAll(sweeps(), {
    query: 'SELECT * FROM c WHERE c.id = @id',
    parameters: [{ name: '@id', value: id }],
  });
  return rows.length ? clean(rows[0]) : null;
}

/** Single-partition: createdAt ascending, matching `ORDER BY created_at`. */
export async function listSweepsBySubject(subjectId) {
  const rows = await queryAll(sweeps(), 'SELECT * FROM c ORDER BY c.createdAt ASC', subjectId);
  return rows.map(clean);
}

export async function latestSweepBySubject(subjectId) {
  const rows = await queryAll(
    sweeps(),
    'SELECT * FROM c ORDER BY c.createdAt DESC OFFSET 0 LIMIT 1',
    subjectId,
  );
  return rows.length ? clean(rows[0]) : null;
}

/**
 * `UPDATE sweeps SET done = done + 1, updated_at = ?`.
 *
 * `incr` is applied server-side, so concurrent increments cannot lose an
 * update the way a read-modify-write would. Note this is a separate round trip
 * from the findings insert it accompanies — see README.md "no cross-container
 * transactions"; `done` is a progress display, and the findings rows remain the
 * source of truth for what has actually been attempted.
 */
export async function incrementSweepDone(id, subjectId, ts) {
  return patchItem(sweeps(), id, subjectId, [
    { op: 'incr', path: '/done', value: 1 },
    { op: 'set', path: '/updatedAt', value: ts },
  ]);
}

const SWEEP_STATUSES = new Set(['running', 'complete', 'failed']);

/**
 * Set status / errorCode / completedAt / updatedAt. A key that is `undefined`
 * is left untouched; an explicit null is written as null (that is how the
 * Worker cleared error_code on success).
 *
 * Optional `ifStatus` (additive) reproduces the Worker's guarded finaliser
 * `... WHERE id = ? AND status = 'running'`, which stops a late failure handler
 * from clobbering a sweep that already completed. Whitelisted, because patch
 * conditions cannot be parameterised.
 */
export async function setSweepStatus(id, subjectId, patch = {}) {
  const ops = [];
  for (const key of ['status', 'errorCode', 'completedAt', 'updatedAt']) {
    if (Object.prototype.hasOwnProperty.call(patch, key) && patch[key] !== undefined) {
      ops.push({ op: 'set', path: `/${key}`, value: patch[key] });
    }
  }
  let condition;
  if (patch.ifStatus !== undefined) {
    if (!SWEEP_STATUSES.has(patch.ifStatus)) {
      throw new Error('invalid_ifStatus: expected running | complete | failed');
    }
    condition = `FROM c WHERE c.status = "${patch.ifStatus}"`;
  }
  return patchItem(sweeps(), id, subjectId, ops, condition);
}

export async function deleteSweepsBySubject(subjectId) {
  return deletePartition(sweeps(), subjectId);
}

// ===========================================================================
// findings — partition key /subjectId, so a whole dossier read is one partition
// ===========================================================================

/**
 * ⚠ Two document-model normalisations, both applied here so routes cannot
 * drift:
 *   matched:        D1 INTEGER 0/1 → boolean. `!!f.matched` still works.
 *   publishedFields: D1 TEXT holding a JSON string → a real JSON array. A
 *                    string is accepted and parsed, so a leftover
 *                    JSON.stringify(fields) at a call site cannot corrupt the
 *                    dossier; readers get an array either way and no longer
 *                    need JSON.parse.
 */
export async function createFinding({
  id, sweepId, subjectId, brokerId, status, matched, publishedFields, errorCode, createdAt,
}) {
  let fields = publishedFields;
  if (typeof fields === 'string') {
    try {
      fields = JSON.parse(fields);
    } catch {
      throw new Error('invalid_publishedFields: not a JSON array');
    }
  }
  if (!Array.isArray(fields)) fields = [];

  return createItem(findings(), {
    id,
    sweepId,
    subjectId,
    brokerId,
    status,                        // ok | skipped_robots | error
    matched: !!matched,
    publishedFields: fields,       // field NAMES only, never values (R5)
    errorCode: errorCode ?? null,  // machine code only — NEVER PII (R5)
    createdAt,
  });
}

/**
 * R3 ownership check, enforced by the storage layer itself: the finding id is
 * read from the caller's OWN partition, so another subject's finding is simply
 * not there. No post-hoc `if (row.subject_id !== subjectId)` to forget.
 */
export async function getOwnedFinding(id, subjectId) {
  return pointRead(findings(), id, subjectId);
}

export async function listFindingsBySubject(subjectId) {
  const rows = await queryAll(findings(), 'SELECT * FROM c ORDER BY c.createdAt ASC', subjectId);
  return rows.map(clean);
}

/** Single-partition. Composite index (sweepId ASC, createdAt ASC) recommended — see README. */
export async function listFindingsBySweep(sweepId, subjectId) {
  const rows = await queryAll(
    findings(),
    {
      query: 'SELECT * FROM c WHERE c.sweepId = @sweepId ORDER BY c.createdAt ASC',
      parameters: [{ name: '@sweepId', value: sweepId }],
    },
    subjectId,
  );
  return rows.map(clean);
}

/** Which brokers this sweep has already attempted — drives resumability. */
export async function brokerIdsBySweep(sweepId, subjectId) {
  return queryValues(
    findings(),
    {
      query: 'SELECT VALUE c.brokerId FROM c WHERE c.sweepId = @sweepId',
      parameters: [{ name: '@sweepId', value: sweepId }],
    },
    subjectId,
  );
}

export async function deleteFindingsBySubject(subjectId) {
  return deletePartition(findings(), subjectId);
}

// ===========================================================================
// demands — partition key /subjectId
// ===========================================================================

export async function createDemand({
  id, subjectId, findingId, type, letterCiphertext, letterHash, createdAt,
}) {
  return createItem(demands(), {
    id,
    subjectId,
    findingId,
    type,                 // rtk | disclosure | delete | provenance | gdpr
    letterCiphertext,     // AES-GCM; nulled by the R5 purge (R7: the letter names a real human)
    letterHash,           // SHA-256 of the plaintext — outlives the purge
    createdAt,
  });
}

export async function listDemandsBySubject(subjectId) {
  const rows = await queryAll(demands(), 'SELECT * FROM c ORDER BY c.createdAt ASC', subjectId);
  return rows.map(clean);
}

/**
 * CROSS-PARTITION (unavoidable) #3b. /api/stats — the `demandsDrafted` number.
 * DRAFTED, never "sent": nothing is ever transmitted on the subject's behalf
 * (R7), and reporting a send count we cannot know would be exactly the kind of
 * unearned number this project exists to object to.
 */
export async function countAllDemands() {
  const rows = await queryValues(demands(), 'SELECT VALUE COUNT(1) FROM c');
  return rows.length ? Number(rows[0]) || 0 : 0;
}

/** R5 purge: clear the letter text, keep letterHash so a user's copy stays provable. */
export async function nullDemandCiphertextBySubject(subjectId) {
  return nullFieldInPartition(demands(), subjectId, '/letterCiphertext');
}

export async function deleteDemandsBySubject(subjectId) {
  return deletePartition(demands(), subjectId);
}

// ===========================================================================
// evidence — partition key /subjectId; the hash chain (DESIGN §4c)
// ===========================================================================

/**
 * ⚠ REQUIRES the evidence container to be created with
 *   uniqueKeyPolicy: { uniqueKeys: [{ paths: ['/seq'] }] }
 *
 * Cosmos unique keys are scoped to a logical partition, and the partition key
 * here is /subjectId — so `unique on /seq` is precisely D1's
 * `UNIQUE (subject_id, seq)`. That constraint is not a nicety: it is the
 * referee for the evidence route's seq race, the same role it played in D1.
 * Without it two concurrent appends can both read tip.seq = n, both write
 * n + 1, and the hash chain forks silently. A forked chain is a broken
 * evidence file. Verify the policy exists before trusting an export.
 *
 * A violation throws RepoConflictError (status 409), which is what the retry
 * loop should catch — the D1 code matched on /UNIQUE/i in the driver's message;
 * here it is a named type.
 */
export async function createEvidence({
  id, subjectId, seq, company, element, narrativeCiphertext, occurredAt, createdAt, prevHash, hash,
}) {
  return createItem(evidence(), {
    id,
    subjectId,
    seq,
    company,               // the accused company — not subject PII
    element,               // 1..4, the four claim elements
    narrativeCiphertext,   // AES-GCM; nulled by the R5 purge
    occurredAt,
    createdAt,
    prevHash,
    hash,
  });
}

/** Single-partition, seq ascending — chain order. */
export async function listEvidenceBySubject(subjectId) {
  const rows = await queryAll(evidence(), 'SELECT * FROM c ORDER BY c.seq ASC', subjectId);
  return rows.map(clean);
}

/** The chain tip. Projects two fields, so no ciphertext crosses the wire. */
export async function lastEvidenceBySubject(subjectId) {
  const rows = await queryAll(
    evidence(),
    'SELECT c.seq, c.hash FROM c ORDER BY c.seq DESC OFFSET 0 LIMIT 1',
    subjectId,
  );
  if (!rows.length) return null;
  return { seq: rows[0].seq, hash: rows[0].hash };
}

/** R5 purge: clear narratives, keep the chain hashes so exports stay verifiable. */
export async function nullEvidenceCiphertextBySubject(subjectId) {
  return nullFieldInPartition(evidence(), subjectId, '/narrativeCiphertext');
}

export async function deleteEvidenceBySubject(subjectId) {
  return deletePartition(evidence(), subjectId);
}

export default {
  findIdByEmailHash, createSubject, getSubject, getSubjectPii, touchSubject, markVerified,
  updateSubjectPii, setDonateDismissed, getDonateDismissed, listStaleUnpurged, purgeSubject,
  deleteSubject, countVerifiedSubjects,
  createSweep, getSweep, listSweepsBySubject, latestSweepBySubject, incrementSweepDone,
  setSweepStatus, deleteSweepsBySubject,
  createFinding, getOwnedFinding, listFindingsBySubject, listFindingsBySweep, brokerIdsBySweep,
  deleteFindingsBySubject,
  createDemand, listDemandsBySubject, countAllDemands, nullDemandCiphertextBySubject,
  deleteDemandsBySubject,
  createEvidence, listEvidenceBySubject, lastEvidenceBySubject, nullEvidenceCiphertextBySubject,
  deleteEvidenceBySubject,
};
