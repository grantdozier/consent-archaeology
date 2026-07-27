// routes/verify.js — GET /api/verify?token=
//
// The frontend's verify.html (where the Brevo magic link lands) calls this
// with the token from the URL. On success the subject is marked verified and
// a bearer session token comes back — the ONLY way a session ever exists (R3).
// All session-minting logic lives in lib/auth.js; this route is a thin door.

import { json } from '../lib/http.js';
import { verifyMagicTokenAndStartSession } from '../lib/auth.js';
import { config } from '../lib/config.js';

export async function getVerify(request) {
  // Azure Functions v4 exposes the query string as URLSearchParams, so this
  // replaces the Worker's `new URL(request.url).searchParams`.
  const token = request.query.get('token');
  const { sessionToken } = await verifyMagicTokenAndStartSession(config, token);
  return json({ ok: true, sessionToken });
}
