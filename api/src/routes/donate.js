// routes/donate.js — POST /api/donate/dismiss
//
// Donations are a Stripe Payment Link configured in the Stripe dashboard —
// no server-side Stripe call exists in this API for the MVP. Apple Pay on
// the link requires domain verification on doziertechgroup.com, and the
// link's return URL must be https://doziertechgroup.com/dig/thanks (DESIGN §5).
//
// This endpoint records the one thing the server owes the donation flow:
// PERMANENT dismissal. "No thanks" means never ask again — not on this
// device, not on any device, not in thirty days. The frontend sets its
// localStorage flag; this flag covers every other device the verified
// subject ever logs in from. There is no endpoint to un-dismiss. That is
// deliberate; do not add one.

import { HttpError, json } from '../lib/http.js';
import { requireSession } from '../lib/auth.js';
import * as repo from '../lib/repo.js';

export async function postDismiss(request) {
  const { subjectId } = await requireSession(request); // R3 gate

  // setDonateDismissed returns false when no document matched — the document
  // repo's equivalent of D1's `changes === 0`. Only reachable if the row
  // vanished mid-request; report the truth rather than answering ok. Silently
  // returning {ok:true} for a flag that did not stick means asking this person
  // for money again after they said no, which is precisely the dark pattern
  // DESIGN §5 forbids.
  const applied = await repo.setDonateDismissed(subjectId);
  if (!applied) {
    throw new HttpError(404, 'subject_not_found');
  }
  return json({ ok: true });
}
