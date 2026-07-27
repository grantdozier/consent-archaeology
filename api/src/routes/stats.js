// routes/stats.js — GET /api/stats (public, no auth)
//
// R5: AGGREGATE COUNTS ONLY. Never a name, never a city, never a most-recent-
// anything, never a per-state breakdown, never anything that could
// re-identify a subject. If a future feature wants richer public stats, it
// does not go in this file without a privacy review.

import { json } from '../lib/http.js';
import { BROKERS } from '../lib/brokers.js';
import * as repo from '../lib/repo.js';

export async function getStats() {
  const [demands, verified] = await Promise.all([
    repo.countAllDemands(),
    repo.countVerifiedSubjects(),
  ]);
  return json({
    // DRAFTED, not sent, and not filed. This service never transmits a
    // demand to a company — R7 means the user sends it themselves, in
    // their own name, from their own address. The count of letters we
    // generated is the only number we are entitled to report; we have no
    // way to know how many were actually sent, and claiming otherwise
    // would be exactly the kind of unearned number this project exists
    // to object to. Renamed from `demandsSent` for that reason.
    demandsDrafted: demands,
    subjectsVerified: verified,
    brokersCovered: BROKERS.length,
  });
}
