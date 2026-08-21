// routes/intake.js — POST /api/intake, POST /api/me/export-and-delete
//
// Intake accepts: fullName, email, city, state (required); phone,
// priorAddresses[], birthYear (optional). That is the complete list.
//
// R1 — WHY THE SSN REJECTION BELOW EXISTS:
// This is a public repo that collects PII behind a dramatic "classified"
// UI. If it accepted Social Security Numbers — even optionally, even
// "just the last 4" — it would be structurally indistinguishable from a
// phishing kit, regardless of intent. So there is no SSN field in the
// document schema, no SSN field in this handler, and any request that even
// *carries* an SSN-like key or value is rejected with a 400 before we
// process anything else. Brokers key on name + address history + email +
// phone; an SSN is never needed to find or demand deletion of a record.
// If a user is worried about SSN exposure, the real fix is a credit
// freeze (free, statutory, works) — the error message says so.

import { HttpError, json, readJson, nowISO } from '../lib/http.js';
import { encryptPII, decryptPII, saltedHash, uuid } from '../lib/crypto.js';
import { issueMagicToken, sendMagicLinkEmail, requireSession } from '../lib/auth.js';
import { config } from '../lib/config.js';
import * as sessions from '../lib/sessions.js';
import * as repo from '../lib/repo.js';

const MAGIC_EMAILS_PER_HOUR = 5; // per email address — anti email-bombing

// --- R1 enforcement ---------------------------------------------------------

const SSN_KEY_RE = /ssn|social[\s_-]*security/i;
// Classic formatted SSN in any string value (defense in depth — catches an SSN
// pasted into a free-text field). Deliberately narrow (ddd-dd-dddd) so phone
// numbers and years never false-positive.
const SSN_VALUE_RE = /\b\d{3}-\d{2}-\d{4}\b/;

/** Recursively scan a parsed body for SSN-like keys or values. */
function containsSsnLike(value) {
  if (typeof value === 'string') return SSN_VALUE_RE.test(value);
  if (Array.isArray(value)) return value.some(containsSsnLike);
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (SSN_KEY_RE.test(k)) return true;
      if (containsSsnLike(v)) return true;
    }
  }
  return false;
}

const SSN_REJECTION =
  'This service does not accept Social Security Numbers — not the full number, ' +
  'not the last four, not in any field. You do not need an SSN to locate or ' +
  'demand deletion of data-broker records. If you are worried about SSN ' +
  'exposure, the actual fix is a credit freeze: free, legally guaranteed, ' +
  'about ten minutes at annualcreditreport.com, and it works better than we do.';

// --- validation --------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const STATE_RE = /^[A-Za-z]{2}$/;
const PHONE_RE = /^[\d\s()+.\-]{7,20}$/;

function str(v) {
  return typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
}

// Full state names → codes. The frontend normalises too, but a validation
// rule that only holds when the caller happens to be running the current
// build of our own JavaScript is not a validation rule. Someone typing
// "Louisiana" has given a correct answer; turning that into a 400 is our
// bug, not their mistake.
const STATE_CODES = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', districtofcolumbia: 'DC',
  washingtondc: 'DC', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID',
  illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY',
  louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA',
  michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO',
  montana: 'MT', nebraska: 'NE', nevada: 'NV', newhampshire: 'NH',
  newjersey: 'NJ', newmexico: 'NM', newyork: 'NY', northcarolina: 'NC',
  northdakota: 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
  pennsylvania: 'PA', rhodeisland: 'RI', southcarolina: 'SC',
  southdakota: 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', westvirginia: 'WV', wisconsin: 'WI',
  wyoming: 'WY', puertorico: 'PR', guam: 'GU', virginislands: 'VI',
  americansamoa: 'AS', northernmarianaislands: 'MP',
};

function normaliseState(raw) {
  const v = str(raw).replace(/[.,]+$/, '');
  if (STATE_RE.test(v)) return v.toUpperCase();
  return STATE_CODES[v.toLowerCase().replace(/[^a-z]/g, '')] || v;
}

/** Validate + normalize the intake body. Throws 400 with PII-free messages. */
function validateIntake(body) {
  const fullName = str(body.fullName);
  const email = str(body.email).toLowerCase();
  const city = str(body.city).replace(/[.,]+$/, '');
  const state = normaliseState(body.state);
  const phone = str(body.phone);

  // Length only. This used to also require a space, i.e. a Western
  // first-plus-last name — which rejects mononyms and plenty of legitimately
  // single-token legal names, for no security benefit: brokers are queried on
  // name + city + state, and a one-token name simply matches less well. A
  // worse match is the caller's problem to weigh; a locked door is ours.
  if (fullName.length < 2 || fullName.length > 120) {
    throw new HttpError(400, 'invalid_fullName: a name between 2 and 120 characters is required');
  }
  if (!EMAIL_RE.test(email) || email.length > 254) {
    throw new HttpError(400, 'invalid_email');
  }
  if (city.length < 1 || city.length > 80) throw new HttpError(400, 'invalid_city');
  if (!STATE_RE.test(state)) {
    throw new HttpError(400, 'invalid_state: a US state name or two-letter code is required');
  }
  if (phone && !PHONE_RE.test(phone)) throw new HttpError(400, 'invalid_phone');

  let priorAddresses = [];
  if (body.priorAddresses !== undefined) {
    if (!Array.isArray(body.priorAddresses) || body.priorAddresses.length > 10) {
      throw new HttpError(400, 'invalid_priorAddresses: up to 10 strings');
    }
    priorAddresses = body.priorAddresses.map(str).filter(Boolean);
    if (priorAddresses.some((a) => a.length > 200)) {
      throw new HttpError(400, 'invalid_priorAddresses: each entry max 200 chars');
    }
  }

  let birthYear = null;
  if (body.birthYear !== undefined && body.birthYear !== null && body.birthYear !== '') {
    birthYear = Number(body.birthYear);
    const thisYear = new Date().getUTCFullYear();
    if (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > thisYear) {
      throw new HttpError(400, 'invalid_birthYear');
    }
  }

  return {
    fullName,
    email,
    phone: phone || null,
    city,
    state: state.toUpperCase(),
    priorAddresses,
    birthYear,
  };
}

// --- POST /api/intake --------------------------------------------------------

export async function postIntake(request) {
  const body = await readJson(request);

  // R1 gate — before validation, before anything. See file-header comment.
  if (containsSsnLike(body)) {
    throw new HttpError(400, SSN_REJECTION);
  }

  const pii = validateIntake(body);
  const emailHash = await saltedHash(config, pii.email);

  // Rate-limit magic-link emails per address (sessions counter) so this
  // endpoint can't be used to bomb someone's inbox.
  //
  // A READ FAILURE HERE IS NOT A REASON TO REJECT THE INTAKE. The counter is
  // a courtesy cap on outbound mail, not a security control — R3 is the
  // security control, and it lives in the magic link itself. If the sessions
  // container is briefly unreachable we would rather send one more
  // verification email than turn a store hiccup into a 500 for someone who
  // did nothing wrong. Treat an unreadable counter as zero and carry on.
  const rlKey = `rl:magic:${emailHash}`;
  let sent = 0;
  try {
    sent = parseInt((await sessions.get(rlKey)) || '0', 10) || 0;
  } catch {
    sent = 0;
  }
  if (sent >= MAGIC_EMAILS_PER_HOUR) {
    throw new HttpError(429, 'rate_limited: too many verification emails — try again in an hour');
  }

  const now = nowISO();
  const ciphertext = await encryptPII(config, JSON.stringify(pii));

  // Dedup on the salted email hash (R5): same email → same subject document,
  // PII refreshed. A previously purged subject re-activates (updateSubjectPii
  // clears purgedAt).
  const existing = await repo.findIdByEmailHash(emailHash);

  let subjectId;
  if (existing) {
    subjectId = existing.id;
    await repo.updateSubjectPii(subjectId, ciphertext, now);
  } else {
    subjectId = uuid();
    await repo.createSubject({
      id: subjectId,
      emailHash,
      piiCiphertext: ciphertext,
      createdAt: now,
      lastActivityAt: now,
    });
  }

  // R3: nothing works without the magic-link round trip. Send it via Brevo.
  //
  // `verificationSent` is load-bearing and is NEVER true unless Brevo actually
  // accepted the message (house rule: never fake success). What changed is the
  // shape of the failure, not its honesty: a refusal from the mail provider
  // used to propagate as a 5xx, which threw away a perfectly good stored
  // subject and told the caller nothing they could act on. The subject record
  // above is already written and is worth keeping — resubmitting later reuses
  // it — so report the truth in a 200 the client can render: stored yes, sent
  // no, and here is why. The frontend renders that as "received, delivery
  // unconfirmed" with a retry, never as "check your inbox".
  //
  // The rate-limit counter is only incremented when a message really went out.
  // Charging someone's hourly quota for an email that was never sent would cap
  // them out of the retries this failure mode makes necessary.
  const token = await issueMagicToken(config, subjectId);
  try {
    await sendMagicLinkEmail(config, pii.email, token);
  } catch (err) {
    // R5: err.message from sendMagicLinkEmail is constructed PII-free (status
    // code only, no recipient, no response body). Anything else gets a generic
    // string rather than a message we have not vetted for PII.
    const reason =
      err instanceof HttpError ? err.message : 'verification_email_failed: mail provider unreachable';
    return json({ subjectId, verificationSent: false, deliveryError: reason });
  }

  // A failure to record the send is not worth failing the request over — the
  // email is already gone. Worst case the cap is one message looser this hour.
  try {
    await sessions.put(rlKey, String(sent + 1), 3600);
  } catch {
    /* counter is best-effort; see the read above */
  }

  return json({ subjectId, verificationSent: true });
}

// --- POST /api/me/export-and-delete -----------------------------------------
// R5: export-and-delete from day one, not "v2". Returns everything we hold on
// the authenticated subject (decrypted), then hard-deletes all of it and kills
// the session. The response body IS the export — save it, it's gone after this.

export async function postExportAndDelete(request) {
  const { subjectId, sessionToken } = await requireSession(request); // R3 gate

  const subject = await repo.getSubject(subjectId);
  if (!subject) throw new HttpError(404, 'subject_not_found');
  const piiCiphertext = await repo.getSubjectPii(subjectId); // null once purged

  const [sweeps, findings, demands, evidence] = await Promise.all([
    repo.listSweepsBySubject(subjectId),
    repo.listFindingsBySubject(subjectId),
    repo.listDemandsBySubject(subjectId),
    repo.listEvidenceBySubject(subjectId),
  ]);

  const exportPayload = {
    exportedAt: nowISO(),
    note: 'Complete export of everything CONSENT ARCHAEOLOGY held about this subject. All copies on our side were deleted when this export was generated.',
    subject: {
      id: subject.id,
      createdAt: subject.createdAt,
      verifiedAt: subject.verifiedAt || null,
      pii: piiCiphertext ? JSON.parse(await decryptPII(config, piiCiphertext)) : null,
    },
    sweeps: sweeps.map((s) => ({
      id: s.id, status: s.status, total: s.total, done: s.done,
      createdAt: s.createdAt, completedAt: s.completedAt || null,
    })),
    findings: findings.map((f) => ({
      id: f.id, sweepId: f.sweepId, brokerId: f.brokerId, status: f.status,
      matched: !!f.matched, publishedFields: f.publishedFields || [], createdAt: f.createdAt,
    })),
    demands: await Promise.all(demands.map(async (d) => ({
      id: d.id, findingId: d.findingId, type: d.type, createdAt: d.createdAt,
      letterHash: d.letterHash,
      letterMarkdown: d.letterCiphertext ? await decryptPII(config, d.letterCiphertext) : null,
    }))),
    evidence: await Promise.all(evidence.map(async (e) => ({
      id: e.id, seq: e.seq, company: e.company, element: e.element,
      narrative: e.narrativeCiphertext ? await decryptPII(config, e.narrativeCiphertext) : null,
      occurredAt: e.occurredAt, createdAt: e.createdAt,
      prevHash: e.prevHash, hash: e.hash,
    }))),
  };

  // Hard delete, children first. This is a real deletion of our copies — which
  // is exactly what we say. It is NOT "erasing you from the internet" (R2);
  // the brokers still hold what they hold until they honor the demands.
  //
  // The Worker did this as one D1 batch. Cosmos has no cross-container
  // transaction, so these run sequentially. Children first means a failure
  // part-way can never leave orphaned child documents pointing at a subject
  // that no longer exists — and the export above has already been built, so
  // the caller still gets their data even if a delete step throws.
  await repo.deleteEvidenceBySubject(subjectId);
  await repo.deleteDemandsBySubject(subjectId);
  await repo.deleteFindingsBySubject(subjectId);
  await repo.deleteSweepsBySubject(subjectId);
  await repo.deleteSubject(subjectId);
  await sessions.del(`session:${sessionToken}`);

  return json(exportPayload, 200, {
    'content-disposition': 'attachment; filename="consent-archaeology-export.json"',
  });
}
