// routes/stats.js — GET /api/stats (public, no auth)
//
// R5: AGGREGATE COUNTS ONLY. Never a name, never a city, never a most-recent-
// anything, never a per-state breakdown, never anything that could
// re-identify a subject. If a future feature wants richer public stats, it
// does not go in this file without a privacy review.

import { json } from '../http.js';
import { BROKERS } from '../brokers.js';

export async function getStats(request, env) {
  const [demands, verified] = await Promise.all([
    // "demandsSent" = demand letters generated for users to send as
    // themselves (R7 — we draft, the user sends in their own name).
    env.DB.prepare('SELECT COUNT(*) AS n FROM demands').first(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM subjects WHERE verified_at IS NOT NULL').first(),
  ]);
  return json({
    demandsSent: demands.n,
    subjectsVerified: verified.n,
    brokersCovered: BROKERS.length,
  });
}
