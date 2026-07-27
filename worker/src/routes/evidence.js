// routes/evidence.js — POST /api/evidence, GET /api/evidence/export
//
// The hash-chained evidence locker (DESIGN §4c). Each entry records one of
// the four claim elements:
//   1 privacy violated   2 sense of intrusion
//   3 support dissatisfaction   4 support-record decay
//
// Chain construction (per subject):
//   entry    = { seq, company, element, narrative, occurredAt, createdAt }
//   hash     = SHA256( prevHash + canonicalJSON(entry) )     (hex)
//   genesis prevHash = "0" * 64
//
// Tamper with any stored entry and every later hash breaks — that property is
// what makes a user's exported locker credible as evidence, and it can be
// re-verified by anyone with the export and a SHA-256 implementation (no
// trust in us required). The narrative is the user's own account (PII) →
// stored AES-GCM encrypted (R5), decrypted only for the owner's export.

import { HttpError, json, readJson, nowISO } from '../http.js';
import { encryptPII, decryptPII, sha256Hex, canonicalJSON, uuid } from '../crypto.js';
import { requireSession } from '../auth.js';

const GENESIS_HASH = '0'.repeat(64);

// --- POST /api/evidence ------------------------------------------------------

export async function postEvidence(request, env) {
  const { subjectId } = await requireSession(request, env); // R3 gate
  const body = await readJson(request);

  const company = typeof body.company === 'string' ? body.company.trim() : '';
  const element = Number(body.element);
  const narrative = typeof body.narrative === 'string' ? body.narrative.trim() : '';
  const occurredAt = typeof body.occurredAt === 'string' ? body.occurredAt.trim() : '';

  if (company.length < 1 || company.length > 200) throw new HttpError(400, 'invalid_company');
  if (![1, 2, 3, 4].includes(element)) throw new HttpError(400, 'invalid_element: must be 1, 2, 3, or 4');
  if (narrative.length < 1 || narrative.length > 5000) throw new HttpError(400, 'invalid_narrative: 1-5000 chars');
  if (!occurredAt || Number.isNaN(Date.parse(occurredAt))) throw new HttpError(400, 'invalid_occurredAt: ISO date required');

  // Two attempts to absorb a seq race (UNIQUE(subject_id, seq) is the referee).
  for (let attempt = 0; attempt < 2; attempt++) {
    const tip = await env.DB.prepare(
      'SELECT seq, hash FROM evidence WHERE subject_id = ? ORDER BY seq DESC LIMIT 1',
    ).bind(subjectId).first();

    const seq = tip ? tip.seq + 1 : 1;
    const prevHash = tip ? tip.hash : GENESIS_HASH;
    const createdAt = nowISO();

    // The hash covers the PLAINTEXT canonical entry, so an exported (decrypted)
    // locker is independently verifiable. Key order here is irrelevant —
    // canonicalJSON sorts keys — but the field SET is part of the contract.
    const entry = { seq, company, element, narrative, occurredAt, createdAt };
    const hash = await sha256Hex(prevHash + canonicalJSON(entry));
    const evidenceId = uuid();

    try {
      await env.DB.prepare(
        `INSERT INTO evidence (id, subject_id, seq, company, element, narrative_ciphertext, occurred_at, created_at, prev_hash, hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        evidenceId, subjectId, seq, company, element,
        await encryptPII(env, narrative), occurredAt, createdAt, prevHash, hash,
      ).run();
      return json({ evidenceId, hash });
    } catch (err) {
      if (attempt === 0 && /UNIQUE/i.test(String(err.message))) continue; // lost the race — re-read tip
      throw err;
    }
  }
  throw new HttpError(409, 'evidence_conflict: concurrent writes — retry');
}

// --- GET /api/evidence/export ------------------------------------------------
// The user's locker, decrypted, as a downloadable JSON file. Includes the
// exact verification recipe so a third party (lawyer, journalist, arbitrator)
// can check the chain without trusting this service.

export async function getEvidenceExport(request, env) {
  const { subjectId } = await requireSession(request, env); // R3 gate

  const { results } = await env.DB.prepare(
    'SELECT * FROM evidence WHERE subject_id = ? ORDER BY seq',
  ).bind(subjectId).all();

  const entries = await Promise.all(results.map(async (e) => ({
    seq: e.seq,
    company: e.company,
    element: e.element,
    narrative: e.narrative_ciphertext ? await decryptPII(env, e.narrative_ciphertext) : null, // null = purged (R5)
    occurredAt: e.occurred_at,
    createdAt: e.created_at,
    prevHash: e.prev_hash,
    hash: e.hash,
  })));

  return json(
    {
      exportedAt: nowISO(),
      subjectId,
      verification: {
        how:
          'For each entry, serialize {seq, company, element, narrative, occurredAt, createdAt} ' +
          'as JSON with object keys sorted alphabetically and no whitespace, prepend prevHash, ' +
          'SHA-256 the resulting string, hex-encode: it must equal `hash`. Entry 1 uses prevHash of 64 zeros; ' +
          'every later entry uses the previous entry\'s hash. Any edit anywhere breaks every hash after it.',
        genesisPrevHash: GENESIS_HASH,
        // Wording note: R2 bans dramatic deletion verbs in user-facing copy;
        // this describes our own retention policy in plain terms.
        note: 'Entries with narrative:null had their stored text cleared under the 90-day retention policy; their hashes remain valid against a previously exported plaintext copy.',
      },
      elements: {
        1: 'privacy violated', 2: 'sense of intrusion',
        3: 'support dissatisfaction', 4: 'support-record decay',
      },
      entries,
    },
    200,
    { 'content-disposition': 'attachment; filename="evidence-locker.json"' },
  );
}
