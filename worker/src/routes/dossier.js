// routes/dossier.js — GET /api/dossier
//
// The subject's own results: every broker checked in their most recent sweep,
// joined against the reviewed allowlist metadata (legal entity, HQ, CA
// registry id, opt-out URL). R3: session-gated — you can only ever read your
// own dossier. Broker fields that are null carry TODO(verify) markers in
// brokers.js and render as null here; the frontend shows them as
// "unverified", never invents them (accuracy feeds legal letters).

import { HttpError, json } from '../http.js';
import { requireSession } from '../auth.js';
import { brokerById } from '../brokers.js';

export async function getDossier(request, env) {
  const { subjectId } = await requireSession(request, env); // R3 gate

  const sweep = await env.DB.prepare(
    `SELECT * FROM sweeps WHERE subject_id = ? ORDER BY created_at DESC LIMIT 1`,
  ).bind(subjectId).first();
  if (!sweep) {
    throw new HttpError(404, 'no_sweep_yet: run POST /api/sweep first');
  }

  const [{ results: findings }, subject] = await Promise.all([
    env.DB.prepare('SELECT * FROM findings WHERE sweep_id = ? ORDER BY created_at')
      .bind(sweep.id).all(),
    env.DB.prepare('SELECT donate_dismissed FROM subjects WHERE id = ?')
      .bind(subjectId).first(),
  ]);

  return json({
    sweepId: sweep.id,
    sweepStatus: sweep.status,
    // Permanent-dismissal flag (DESIGN §5) so every device this subject
    // verifies on can honor "never ask again" — not just the one that clicked.
    donateDismissed: !!(subject && subject.donate_dismissed),
    findings: findings.map((f) => {
      const b = brokerById(f.broker_id);
      return {
        findingId: f.id, // needed by POST /api/demand
        broker: b
          ? {
              name: b.name,
              legalName: b.legalName,       // null = unverified (TODO(verify) in brokers.js)
              hqAddress: b.hqAddress,       // null = unverified
              registryId: b.caRegistryId,   // null = unverified
              optOutUrl: b.optOutUrl,       // null = unverified
            }
          : { name: f.broker_id, legalName: null, hqAddress: null, registryId: null, optOutUrl: null },
        status: f.status,
        matched: !!f.matched,
        publishedFields: JSON.parse(f.published_fields), // field NAMES only (R5)
      };
    }),
  });
}
