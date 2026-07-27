// routes/intake.js — POST /api/intake, POST /api/me/export-and-delete
//
// Intake accepts: fullName, email, city, state (required); phone,
// priorAddresses[], birthYear (optional). That is the complete list.
//
// R1 — WHY THE SSN REJECTION BELOW EXISTS:
// This is a public repo that collects PII behind a dramatic "classified"
// UI. If it accepted Social Security Numbers — even optionally, even
// "just the last 4" — it would be structurally indistinguishable from a
// phishing kit, regardless of intent. So there is no SSN column in the
// schema, no SSN field in this handler, and any request that even
// *carries* an SSN-like key or value is rejected with a 400 before we
// process anything else. Brokers key on name + address history + email +
// phone; an SSN is never needed to find or demand deletion of a record.
// If a user is worried about SSN exposure, the real fix is a credit
// freeze (free, statutory, works) — the error message says so.

import { HttpError, json, readJson, nowISO } from '../http.js';
import { encryptPII, decryptPII, saltedHash, uuid } from '../crypto.js';
import { issueMagicToken, sendMagicLinkEmail, requireSession } from '../auth.js';

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
  return typeof v === 'string' ? v.trim() : '';
}

/** Validate + normalize the intake body. Throws 400 with PII-free messages. */
function validateIntake(body) {
  const fullName = str(body.fullName);
  const email = str(body.email).toLowerCase();
  const city = str(body.city);
  const state = str(body.state);
  const phone = str(body.phone);

  if (fullName.length < 2 || fullName.length > 120 || !fullName.includes(' ')) {
    throw new HttpError(400, 'invalid_fullName: first and last name required');
  }
  if (!EMAIL_RE.test(email) || email.length > 254) {
    throw new HttpError(400, 'invalid_email');
  }
  if (city.length < 1 || city.length > 80) throw new HttpError(400, 'invalid_city');
  if (!STATE_RE.test(state)) throw new HttpError(400, 'invalid_state: two-letter code required');
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

export async function postIntake(request, env) {
  const body = await readJson(request);

  // R1 gate — before validation, before anything. See file-header comment.
  if (containsSsnLike(body)) {
    throw new HttpError(400, SSN_REJECTION);
  }

  const pii = validateIntake(body);
  const emailHash = await saltedHash(env, pii.email);

  // Rate-limit magic-link emails per address (KV counter) so this endpoint
  // can't be used to bomb someone's inbox.
  const rlKey = `rl:magic:${emailHash}`;
  const sent = parseInt((await env.SESSIONS.get(rlKey)) || '0', 10);
  if (sent >= MAGIC_EMAILS_PER_HOUR) {
    throw new HttpError(429, 'rate_limited: too many verification emails — try again in an hour');
  }

  const now = nowISO();
  const ciphertext = await encryptPII(env, JSON.stringify(pii));

  // Dedup on the salted email hash (R5): same email → same subject row,
  // PII refreshed. A previously purged subject re-activates.
  const existing = await env.DB.prepare('SELECT id FROM subjects WHERE email_hash = ?')
    .bind(emailHash).first();

  let subjectId;
  if (existing) {
    subjectId = existing.id;
    await env.DB.prepare(
      'UPDATE subjects SET pii_ciphertext = ?, last_activity_at = ?, purged_at = NULL WHERE id = ?',
    ).bind(ciphertext, now, subjectId).run();
  } else {
    subjectId = uuid();
    await env.DB.prepare(
      `INSERT INTO subjects (id, email_hash, pii_ciphertext, created_at, last_activity_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(subjectId, emailHash, ciphertext, now, now).run();
  }

  // R3: nothing works without the magic-link round trip. Send it via Brevo.
  // If Brevo fails, sendMagicLinkEmail THROWS and the client gets a real
  // error — we never answer verificationSent:true unless Brevo accepted the
  // message (house rule: never fake success).
  const token = await issueMagicToken(env, subjectId);
  await sendMagicLinkEmail(env, pii.email, token);
  await env.SESSIONS.put(rlKey, String(sent + 1), { expirationTtl: 3600 });

  return json({ subjectId, verificationSent: true });
}

// --- POST /api/me/export-and-delete -----------------------------------------
// R5: export-and-delete from day one, not "v2". Returns everything we hold on
// the authenticated subject (decrypted), then hard-deletes all of it and kills
// the session. The response body IS the export — save it, it's gone after this.

export async function postExportAndDelete(request, env) {
  const { subjectId, sessionToken } = await requireSession(request, env);

  const subject = await env.DB.prepare('SELECT * FROM subjects WHERE id = ?')
    .bind(subjectId).first();
  if (!subject) throw new HttpError(404, 'subject_not_found');

  const [sweeps, findings, demands, evidence] = await Promise.all([
    env.DB.prepare('SELECT * FROM sweeps WHERE subject_id = ? ORDER BY created_at').bind(subjectId).all(),
    env.DB.prepare('SELECT * FROM findings WHERE subject_id = ? ORDER BY created_at').bind(subjectId).all(),
    env.DB.prepare('SELECT * FROM demands WHERE subject_id = ? ORDER BY created_at').bind(subjectId).all(),
    env.DB.prepare('SELECT * FROM evidence WHERE subject_id = ? ORDER BY seq').bind(subjectId).all(),
  ]);

  const exportPayload = {
    exportedAt: nowISO(),
    note: 'Complete export of everything CONSENT ARCHAEOLOGY held about this subject. All copies on our side were deleted when this export was generated.',
    subject: {
      id: subject.id,
      createdAt: subject.created_at,
      verifiedAt: subject.verified_at,
      pii: subject.pii_ciphertext ? JSON.parse(await decryptPII(env, subject.pii_ciphertext)) : null,
    },
    sweeps: sweeps.results.map((s) => ({
      id: s.id, status: s.status, total: s.total, done: s.done,
      createdAt: s.created_at, completedAt: s.completed_at,
    })),
    findings: findings.results.map((f) => ({
      id: f.id, sweepId: f.sweep_id, brokerId: f.broker_id, status: f.status,
      matched: !!f.matched, publishedFields: JSON.parse(f.published_fields), createdAt: f.created_at,
    })),
    demands: await Promise.all(demands.results.map(async (d) => ({
      id: d.id, findingId: d.finding_id, type: d.type, createdAt: d.created_at,
      letterHash: d.letter_hash,
      letterMarkdown: d.letter_ciphertext ? await decryptPII(env, d.letter_ciphertext) : null,
    }))),
    evidence: await Promise.all(evidence.results.map(async (e) => ({
      id: e.id, seq: e.seq, company: e.company, element: e.element,
      narrative: e.narrative_ciphertext ? await decryptPII(env, e.narrative_ciphertext) : null,
      occurredAt: e.occurred_at, createdAt: e.created_at,
      prevHash: e.prev_hash, hash: e.hash,
    }))),
  };

  // Hard delete, children first. This is a real deletion of our copies — which
  // is exactly what we say. It is NOT "erasing you from the internet" (R2);
  // the brokers still hold what they hold until they honor the demands.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM evidence WHERE subject_id = ?').bind(subjectId),
    env.DB.prepare('DELETE FROM demands WHERE subject_id = ?').bind(subjectId),
    env.DB.prepare('DELETE FROM findings WHERE subject_id = ?').bind(subjectId),
    env.DB.prepare('DELETE FROM sweeps WHERE subject_id = ?').bind(subjectId),
    env.DB.prepare('DELETE FROM subjects WHERE id = ?').bind(subjectId),
  ]);
  await env.SESSIONS.delete(`session:${sessionToken}`);

  return json(exportPayload, 200, {
    'content-disposition': 'attachment; filename="consent-archaeology-export.json"',
  });
}
