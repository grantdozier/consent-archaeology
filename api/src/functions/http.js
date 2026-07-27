// functions/http.js — route registration, CORS, and the error boundary.
//
// This is the Azure Functions v4 replacement for the Worker's src/index.js
// router. Same paths, same methods, same bodies — the frontend needs nothing
// but a new API_BASE (docs/assets/api.js).
//
// Route map (the API contract the frontend is built against):
//   POST /api/intake                 open      — intake + magic-link send (R1 SSN gate inside)
//   GET  /api/verify?token=          open      — magic-link → session (the ONLY session mint, R3)
//   POST /api/sweep                  Bearer    — start allowlist sweep (R3+R4)
//   GET  /api/sweep/{id}             Bearer    — progress + findings (also DRIVES the sweep; see routes/sweep.js)
//   GET  /api/dossier                Bearer    — results + broker legal metadata
//   POST /api/demand                 Bearer    — generate demand letter
//   POST /api/evidence               Bearer    — append to hash-chained locker
//   GET  /api/evidence/export        Bearer    — locker download (JSON)
//   POST /api/donate/dismiss         Bearer    — permanent, irreversible dismissal
//   POST /api/me/export-and-delete   Bearer    — R5 export-and-delete
//   GET  /api/stats                  open      — aggregate counts ONLY (R5)
//
// "Bearer" = requireSession() in lib/auth.js — a token that exists only
// because this subject clicked a Brevo magic link sent to their own email (R3).
//
// The `/api` prefix comes from host.json (extensions.http.routePrefix), so the
// `route` values below are the paths without it.

import { app } from '@azure/functions';

import { HttpError, json } from '../lib/http.js';
// Importing config validates every required App Setting at load time and
// throws if one is missing (lib/config.js). That is the "fail loudly at
// startup" requirement in CONTRACT.md §Configuration: the Function App fails
// to index with the reason in the host log, rather than serving a half-working
// API — an encryption key that silently defaults is the worst failure mode
// available to a tool holding PII.
import { config } from '../lib/config.js';

import { postIntake, postExportAndDelete } from '../routes/intake.js';
import { getVerify } from '../routes/verify.js';
import { postSweep, getSweep } from '../routes/sweep.js';
import { getDossier } from '../routes/dossier.js';
import { postDemand } from '../routes/demand.js';
import { postEvidence, getEvidenceExport } from '../routes/evidence.js';
import { postDismiss } from '../routes/donate.js';
import { getStats } from '../routes/stats.js';

// --- CORS --------------------------------------------------------------------
// The frontend is on a different origin (GitHub Pages / dig.doziertechgroup.com)
// so every response needs CORS headers and preflights must be answered here.
//
// NEVER `*`: these requests carry an Authorization bearer token that IS the R3
// gate, and a wildcard would let any page on the internet drive this API with a
// token it had somehow obtained. The origin is echoed back only when it appears
// in ALLOWED_ORIGIN (comma-separated; localhost entries welcome in dev).
//
// ⚠ DEPLOY: leave the Function App's *platform* CORS allowed-origins list EMPTY.
// If Azure also injects Access-Control-Allow-Origin the header is sent twice and
// every browser rejects the response. CORS is handled in code, here.
function corsHeaders(request) {
  const origin = request.headers.get('origin');
  const headers = { vary: 'Origin' };
  if (origin && config.allowedOrigins.includes(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-methods'] = 'GET,POST,OPTIONS';
    headers['access-control-allow-headers'] = 'Content-Type,Authorization';
    headers['access-control-expose-headers'] = 'Content-Disposition';
    headers['access-control-max-age'] = '86400';
  }
  return headers;
}

// --- wrapper: preflight + CORS + error boundary ------------------------------

function wrap(handler) {
  return async (request, context) => {
    const cors = corsHeaders(request);
    if (request.method === 'OPTIONS') {
      return { status: 204, headers: cors };
    }
    try {
      const response = await handler(request, context);
      return { ...response, headers: { ...(response.headers || {}), ...cors } };
    } catch (err) {
      if (err instanceof HttpError) {
        // HttpError messages are constructed PII-free by contract (lib/http.js).
        const res = json({ error: err.message }, err.status);
        return { ...res, headers: { ...res.headers, ...cors } };
      }
      // Unknown error. R5: do NOT log err.message — runtime messages (e.g.
      // JSON/URL errors) can quote input, and input can contain PII. Log the
      // error class + stack FRAMES only (frames are code locations, not data),
      // and return a generic body. Real failure, honestly reported (house
      // rule) — just without the details that could leak.
      const frames = String((err && err.stack) || '').split('\n').slice(1, 6).join('\n');
      context.error('unhandled_error', (err && err.name) || 'Error', '\n' + frames);
      const res = json({ error: 'internal_error' }, 500);
      return { ...res, headers: { ...res.headers, ...cors } };
    }
  };
}

/**
 * Register one HTTP route. OPTIONS is added to every route so the wrapper can
 * answer preflights itself.
 *
 * authLevel is 'anonymous' on purpose and must stay that way: Azure function
 * KEYS are not this project's auth model. The R3 magic-link session is
 * (lib/auth.js) — a function key would be a shared secret with no link to a
 * verified human, i.e. exactly the bypass R3 forbids.
 */
function route(name, methods, path, handler) {
  app.http(name, {
    methods: [...methods, 'OPTIONS'],
    authLevel: 'anonymous',
    route: path,
    handler: wrap(handler),
  });
}

route('intake', ['POST'], 'intake', postIntake);
route('verify', ['GET'], 'verify', getVerify);
route('sweepStart', ['POST'], 'sweep', postSweep);
route('sweepStatus', ['GET'], 'sweep/{id}', getSweep);
route('dossier', ['GET'], 'dossier', getDossier);
route('demand', ['POST'], 'demand', postDemand);
route('evidence', ['POST'], 'evidence', postEvidence);
route('evidenceExport', ['GET'], 'evidence/export', getEvidenceExport);
route('donateDismiss', ['POST'], 'donate/dismiss', postDismiss);
route('exportAndDelete', ['POST'], 'me/export-and-delete', postExportAndDelete);
route('stats', ['GET'], 'stats', getStats);

// Note: the Worker answered unknown /api/* paths with {"error":"not_found"}.
// Azure's host answers them with its own plain 404 before any of our code
// runs. No catch-all route is registered on purpose — a `{*rest}` function
// risks shadowing the real routes, and a wrong 404 body is a far smaller
// problem than a mis-routed request.
