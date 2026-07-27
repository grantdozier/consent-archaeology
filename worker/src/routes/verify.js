// routes/verify.js — GET /api/verify?token=
//
// The frontend's verify.html (where the Brevo magic link lands) calls this
// with the token from the URL. On success the subject is marked verified and
// a bearer session token comes back — the ONLY way a session ever exists (R3).
// All session-minting logic lives in auth.js; this route is a thin door.

import { json } from '../http.js';
import { verifyMagicTokenAndStartSession } from '../auth.js';

export async function getVerify(request, env) {
  const token = new URL(request.url).searchParams.get('token');
  const { sessionToken } = await verifyMagicTokenAndStartSession(env, token);
  return json({ ok: true, sessionToken });
}
