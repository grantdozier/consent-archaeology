// index.js — router, CORS, error boundary, and the R5 purge cron.
//
// Route map (the API contract the frontend is built against):
//   POST /api/intake                 open      — intake + magic-link send (R1 SSN gate inside)
//   GET  /api/verify?token=          open      — magic-link → session (the ONLY session mint, R3)
//   POST /api/sweep                  Bearer    — start allowlist sweep (R3+R4)
//   GET  /api/sweep/:id              Bearer    — progress + findings
//   GET  /api/dossier                Bearer    — results + broker legal metadata
//   POST /api/demand                 Bearer    — generate demand letter
//   POST /api/evidence               Bearer    — append to hash-chained locker
//   GET  /api/evidence/export        Bearer    — locker download (JSON)
//   POST /api/donate/dismiss         Bearer    — permanent, irreversible dismissal
//   POST /api/me/export-and-delete   Bearer    — R5 export-and-delete
//   GET  /api/stats                  open      — aggregate counts ONLY (R5)
//
// "Bearer" = requireSession() in auth.js — a token that exists only because
// this subject clicked a Brevo magic link sent to their own email (R3).

import { HttpError, json } from './http.js';
import { postIntake, postExportAndDelete } from './routes/intake.js';
import { getVerify } from './routes/verify.js';
import { postSweep, getSweep } from './routes/sweep.js';
import { getDossier } from './routes/dossier.js';
import { postDemand } from './routes/demand.js';
import { postEvidence, getEvidenceExport } from './routes/evidence.js';
import { postDismiss } from './routes/donate.js';
import { getStats } from './routes/stats.js';

// [method, path-regex (named groups → params), handler]
const ROUTES = [
  ['POST', /^\/api\/intake$/, postIntake],
  ['GET', /^\/api\/verify$/, getVerify],
  ['POST', /^\/api\/sweep$/, postSweep],
  ['GET', /^\/api\/sweep\/(?<id>[A-Za-z0-9-]{8,64})$/, getSweep],
  ['GET', /^\/api\/dossier$/, getDossier],
  ['POST', /^\/api\/demand$/, postDemand],
  ['POST', /^\/api\/evidence$/, postEvidence],
  ['GET', /^\/api\/evidence\/export$/, getEvidenceExport],
  ['POST', /^\/api\/donate\/dismiss$/, postDismiss],
  ['POST', /^\/api\/me\/export-and-delete$/, postExportAndDelete],
  ['GET', /^\/api\/stats$/, getStats],
];

// --- CORS --------------------------------------------------------------------

function corsHeaders(env, request) {
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const headers = { vary: 'Origin' };
  if (origin && allowed.includes(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-methods'] = 'GET,POST,OPTIONS';
    headers['access-control-allow-headers'] = 'Content-Type,Authorization';
    headers['access-control-expose-headers'] = 'Content-Disposition';
    headers['access-control-max-age'] = '86400';
  }
  return headers;
}

function withHeaders(response, headers) {
  const out = new Response(response.body, response);
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
  return out;
}

// --- worker ------------------------------------------------------------------

export default {
  async fetch(request, env, ctx) {
    const cors = corsHeaders(env, request);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const { pathname } = new URL(request.url);
    try {
      for (const [method, pattern, handler] of ROUTES) {
        if (request.method !== method) continue;
        const match = pathname.match(pattern);
        if (!match) continue;
        const response = await handler(request, env, ctx, match.groups || {});
        return withHeaders(response, cors);
      }
      return withHeaders(json({ error: 'not_found' }, 404), cors);
    } catch (err) {
      if (err instanceof HttpError) {
        // HttpError messages are constructed PII-free by contract (http.js).
        return withHeaders(json({ error: err.message }, err.status), cors);
      }
      // Unknown error. R5: do NOT log err.message — runtime messages (e.g.
      // JSON/URL errors) can quote input, and input can contain PII. Log the
      // error class + stack FRAMES only (frames are code locations, not data),
      // and return a generic body. Real failure, honestly reported (house
      // rule) — just without the details that could leak.
      const frames = String(err && err.stack || '').split('\n').slice(1, 6).join('\n');
      console.error('unhandled_error', err && err.name || 'Error', '\n' + frames);
      return withHeaders(json({ error: 'internal_error' }, 500), cors);
    }
  },

  // --- R5: 90-day PII purge (cron, see wrangler.toml [triggers]) -------------
  // Subjects idle for 90+ days lose their PII ciphertext, their encrypted
  // demand letters, and their encrypted evidence narratives. What remains:
  // the salted email hash (dedup), aggregate rows (stats), and the evidence
  // chain hashes (so a user-exported plaintext copy stays verifiable).
  async scheduled(_event, env, _ctx) {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const { results } = await env.DB.prepare(
      'SELECT id FROM subjects WHERE purged_at IS NULL AND last_activity_at < ?',
    ).bind(cutoff).all();

    for (const { id } of results) {
      await env.DB.batch([
        env.DB.prepare('UPDATE subjects SET pii_ciphertext = NULL, purged_at = ? WHERE id = ?').bind(now, id),
        env.DB.prepare('UPDATE demands SET letter_ciphertext = NULL WHERE subject_id = ?').bind(id),
        env.DB.prepare('UPDATE evidence SET narrative_ciphertext = NULL WHERE subject_id = ?').bind(id),
      ]);
    }
    // Counts only — never ids-with-context beyond this, never PII (R5).
    console.log('pii_purge_complete', 'subjects_purged=' + results.length);
  },
};
