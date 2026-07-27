// routes/dossier.js — GET /api/dossier
//
// The subject's own results: every broker checked in their most recent sweep,
// joined against the reviewed allowlist metadata (legal entity, HQ, CA
// registry id, opt-out URL). R3: session-gated — you can only ever read your
// own dossier. Broker fields that are null carry TODO(verify) markers in
// lib/brokers.js and render as null here; the frontend shows them as
// "unverified", never invents them (accuracy feeds legal letters).

import { HttpError, json } from '../lib/http.js';
import { requireSession } from '../lib/auth.js';
import { brokerById } from '../lib/brokers.js';
import * as repo from '../lib/repo.js';

export async function getDossier(request) {
  const { subjectId } = await requireSession(request); // R3 gate

  const sweep = await repo.latestSweepBySubject(subjectId);
  if (!sweep) {
    throw new HttpError(404, 'no_sweep_yet: run POST /api/sweep first');
  }

  const [findings, donateDismissed] = await Promise.all([
    repo.listFindingsBySweep(sweep.id, subjectId),
    repo.getDonateDismissed(subjectId),
  ]);

  return json({
    sweepId: sweep.id,
    sweepStatus: sweep.status,
    // Permanent-dismissal flag (DESIGN §5) so every device this subject
    // verifies on can honor "never ask again" — not just the one that clicked.
    donateDismissed: !!donateDismissed,
    findings: findings.map((f) => {
      const b = brokerById(f.brokerId);
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
          : { name: f.brokerId, legalName: null, hqAddress: null, registryId: null, optOutUrl: null },
        status: f.status,
        matched: !!f.matched,
        publishedFields: f.publishedFields || [], // field NAMES only (R5)
      };
    }),
  });
}
