// routes/donate.js — POST /api/donate/dismiss
//
// Donations are a Stripe Payment Link configured in the Stripe dashboard —
// no server-side Stripe call exists in this worker for the MVP. Apple Pay on
// the link requires domain verification on doziertechgroup.com, and the
// link's return URL must be https://doziertechgroup.com/dig/thanks (DESIGN §5).
//
// This endpoint records the one thing the server owes the donation flow:
// PERMANENT dismissal. "No thanks" means never ask again — not on this
// device, not on any device, not in thirty days. The frontend sets its
// localStorage flag; this flag covers every other device the verified
// subject ever logs in from. There is no endpoint to un-dismiss. That is
// deliberate; do not add one.

import { HttpError, json } from '../http.js';
import { requireSession } from '../auth.js';

export async function postDismiss(request, env) {
  const { subjectId } = await requireSession(request, env);
  const result = await env.DB.prepare(
    'UPDATE subjects SET donate_dismissed = 1 WHERE id = ?',
  ).bind(subjectId).run();
  if (!result.meta || result.meta.changes === 0) {
    // Only reachable if the row vanished mid-request; report the truth.
    throw new HttpError(404, 'subject_not_found');
  }
  return json({ ok: true });
}
