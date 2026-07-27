// auth.js — the R3 gate. Read this comment before touching anything below.
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │ R3 — VERIFIED-SELF ONLY. THIS IS THE ANTI-DOXING CONTROL.               │
// │                                                                          │
// │ A sweep may only run against an identity whose email was verified in    │
// │ this session by clicking a Brevo magic link. Without this gate, a       │
// │ public repo + "give me a name and I'll find everything about them" is a │
// │ stalking tool with a nice UI. With it, it's a privacy tool. The entire  │
// │ ethical difference is this one email round-trip.                        │
// │                                                                          │
// │ Invariants (grep-able, enforce in review):                              │
// │   1. `session:` KV keys are written in EXACTLY ONE place:               │
// │      verifyMagicTokenAndStartSession(), below — which requires a valid  │
// │      single-use magic token that was emailed to the subject.            │
// │   2. There is NO admin bypass, NO env-var override, NO debug flag, NO   │
// │      "research mode". Do not add one. A PR adding one is a doxing       │
// │      engine PR and gets closed.                                         │
// │   3. requireSession() is the only door into every /api route that       │
// │      touches a subject. It accepts a bearer token or nothing.           │
// └──────────────────────────────────────────────────────────────────────────┘

import { HttpError, nowISO } from './http.js';
import { randomToken } from './crypto.js';

const MAGIC_TOKEN_TTL_SECONDS = 15 * 60;    // magic links die in 15 minutes
const SESSION_TTL_SECONDS = 24 * 60 * 60;   // sessions die in 24 hours

// ---------------------------------------------------------------------------
// Magic-link issue (called from intake)
// ---------------------------------------------------------------------------

/**
 * Mint a single-use magic token for a subject and stash it in KV with a short
 * TTL. The token is only ever transmitted inside the verification email.
 */
export async function issueMagicToken(env, subjectId) {
  const token = randomToken(32);
  await env.SESSIONS.put(
    `magic:${token}`,
    JSON.stringify({ subjectId, issuedAt: nowISO() }),
    { expirationTtl: MAGIC_TOKEN_TTL_SECONDS },
  );
  return token;
}

/**
 * Send the verification email via Brevo transactional API.
 *
 * Sender domain must be verified in Brevo (DKIM/SPF records added in the
 * Cloudflare DNS dashboard for doziertechgroup.com) or Brevo will refuse or
 * spam-folder these. See wrangler.toml TODO(deploy).
 *
 * HONESTY (house rule #1 — never fake success): if Brevo does not accept the
 * message we THROW. The caller must not tell the user "verification sent"
 * unless this function returned. We surface Brevo's HTTP status but never its
 * response body — Brevo error bodies can echo the recipient address (R5).
 */
export async function sendMagicLinkEmail(env, recipientEmail, token) {
  if (!env.BREVO_API_KEY) {
    throw new HttpError(500, 'server_misconfigured: BREVO_API_KEY secret is not set');
  }
  const verifyUrl = `${env.PUBLIC_APP_URL}/verify.html?token=${token}`;

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: env.SENDER_NAME || 'CONSENT ARCHAEOLOGY', email: env.SENDER_EMAIL },
      to: [{ email: recipientEmail }],
      subject: 'CLEARANCE VERIFICATION — one click required',
      // Theater in the subject line, truth in the body (DESIGN §3).
      textContent: [
        'CONSENT ARCHAEOLOGY — identity verification',
        '',
        'Someone (hopefully you) asked us to run a data-broker sweep on this',
        'email address. Clicking the link below proves the address is yours.',
        'That proof is the only thing standing between this tool and being a',
        'stalking engine, so we will not run anything until you click it.',
        '',
        verifyUrl,
        '',
        'The link works once and expires in 15 minutes.',
        'If you did not request this, do nothing — nothing will happen.',
      ].join('\n'),
      htmlContent:
        '<div style="font-family:ui-monospace,Menlo,Consolas,monospace;background:#0a0e0a;color:#33ff66;padding:24px">' +
        '<p>▓▓ CONSENT ARCHAEOLOGY — IDENTITY VERIFICATION</p>' +
        '<p style="color:#c8ffc8">Someone (hopefully you) asked us to run a data-broker sweep on this ' +
        'email address. Clicking below proves the address is yours — the only thing standing ' +
        'between this tool and being a stalking engine. No click, no sweep.</p>' +
        `<p><a href="${verifyUrl}" style="color:#ffb000">▶ VERIFY AND PROCEED</a></p>` +
        '<p style="color:#7a9a7a">This link works once and expires in 15 minutes. ' +
        'If you did not request this, do nothing — nothing will happen.</p>' +
        '</div>',
    }),
  });

  if (!res.ok) {
    // Real error, propagated. Status only — no response body, no recipient (R5).
    throw new HttpError(502, `verification_email_failed: Brevo responded ${res.status}`);
  }
}

// ---------------------------------------------------------------------------
// Magic-link verify → session mint (called from /api/verify ONLY)
// ---------------------------------------------------------------------------

/**
 * THE ONLY FUNCTION IN THIS CODEBASE THAT CREATES A SESSION. (R3 invariant 1.)
 * Consumes the single-use magic token, stamps the subject verified, and mints
 * a bearer session token.
 */
export async function verifyMagicTokenAndStartSession(env, token) {
  if (!token || typeof token !== 'string' || token.length < 20) {
    throw new HttpError(400, 'invalid_token');
  }
  const key = `magic:${token}`;
  const raw = await env.SESSIONS.get(key);
  if (!raw) {
    throw new HttpError(400, 'invalid_or_expired_token: request a new link from the intake form');
  }
  // Single-use: burn it before doing anything else.
  await env.SESSIONS.delete(key);

  const { subjectId } = JSON.parse(raw);
  const now = nowISO();
  const result = await env.DB.prepare(
    `UPDATE subjects
        SET verified_at = COALESCE(verified_at, ?), last_activity_at = ?
      WHERE id = ? AND purged_at IS NULL`,
  ).bind(now, now, subjectId).run();
  if (!result.meta || result.meta.changes === 0) {
    throw new HttpError(400, 'subject_not_found');
  }

  const sessionToken = randomToken(32);
  await env.SESSIONS.put(
    `session:${sessionToken}`,
    JSON.stringify({ subjectId, issuedAt: now }),
    { expirationTtl: SESSION_TTL_SECONDS },
  );
  return { subjectId, sessionToken };
}

// ---------------------------------------------------------------------------
// Session check (every subject-scoped route goes through this)
// ---------------------------------------------------------------------------

/**
 * Require a valid `Authorization: Bearer <sessionToken>` header. Returns
 * { subjectId, sessionToken } or throws 401. Also touches the subject's
 * last_activity_at, which is the R5 purge clock.
 *
 * R3: the ONLY way a token passes this check is if it was minted by
 * verifyMagicTokenAndStartSession() after a clicked magic link. There is no
 * other issuer, no master token, no bypass. Keep it that way.
 */
export async function requireSession(request, env) {
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+([A-Za-z0-9_-]{20,})$/);
  if (!match) {
    throw new HttpError(401, 'unauthorized: verify your email via the magic link first (R3)');
  }
  const sessionToken = match[1];
  const raw = await env.SESSIONS.get(`session:${sessionToken}`);
  if (!raw) {
    throw new HttpError(401, 'session_expired: verify your email again to get a new session');
  }
  const { subjectId } = JSON.parse(raw);

  // Touch the purge clock. If the subject row vanished (export-and-delete),
  // the session is orphaned — treat as unauthorized.
  const result = await env.DB.prepare(
    'UPDATE subjects SET last_activity_at = ? WHERE id = ? AND purged_at IS NULL',
  ).bind(nowISO(), subjectId).run();
  if (!result.meta || result.meta.changes === 0) {
    await env.SESSIONS.delete(`session:${sessionToken}`);
    throw new HttpError(401, 'session_invalid: subject no longer exists');
  }
  return { subjectId, sessionToken };
}
