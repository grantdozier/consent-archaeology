// routes/sweep.js — POST /api/sweep, GET /api/sweep/:id
//
// R3: BOTH endpoints sit behind requireSession(). A session exists only
// because THIS subject clicked a magic link sent to THEIR email. There is no
// admin bypass, no env override, no debug flag — a sweep can only ever be run
// by a person against themself. That is the anti-doxing control and the
// entire ethical basis of the project; do not weaken it.
//
// R4: every URL fetched goes through buildSearchUrl()/assertAllowlistedUrl()
// from brokers.js — allowlisted origins only, https only. robots.txt is
// checked (and cached in KV) before each origin is scraped; a disallowed path
// records a 'skipped_robots' finding instead of being fetched. Sweeps are
// rate-limited per subject via a KV counter.
//
// What a sweep actually is (R2 honesty): Firecrawl reads public broker
// listing pages and returns markdown; we look for the subject's own details
// in that markdown. No IP tracing, no network wizardry — reading web pages.
//
// Progress is REAL: `done` increments as each broker fetch actually resolves.
// The frontend progress bar tracks this number, never a setTimeout fiction.

import { HttpError, json, nowISO } from '../http.js';
import { decryptPII, uuid } from '../crypto.js';
import { requireSession } from '../auth.js';
import { SWEEPABLE_BROKERS, brokerById, buildSearchUrl, assertAllowlistedUrl } from '../brokers.js';

const MAX_SWEEPS_PER_DAY = 3;        // per subject (R4 rate limit)
const POLITENESS_DELAY_MS = 750;     // between broker fetches
const SCRAPE_TIMEOUT_MS = 20000;     // per Firecrawl call
const STALL_SECONDS = 90;            // resume a 'running' sweep with no heartbeat for this long

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- POST /api/sweep ---------------------------------------------------------

export async function postSweep(request, env, ctx) {
  const { subjectId } = await requireSession(request, env); // R3 gate

  // R4 rate limit — KV counter per subject, 24h window.
  const rlKey = `rl:sweep:${subjectId}`;
  const used = parseInt((await env.SESSIONS.get(rlKey)) || '0', 10);
  if (used >= MAX_SWEEPS_PER_DAY) {
    throw new HttpError(429, 'rate_limited: sweep limit reached — try again tomorrow');
  }
  await env.SESSIONS.put(rlKey, String(used + 1), { expirationTtl: 86400 });

  const sweepId = uuid();
  const now = nowISO();
  await env.DB.prepare(
    `INSERT INTO sweeps (id, subject_id, status, total, done, created_at, updated_at)
     VALUES (?, ?, 'running', ?, 0, ?, ?)`,
  ).bind(sweepId, subjectId, SWEEPABLE_BROKERS.length, now, now).run();

  // Process after the response goes out. Note: waitUntil wall-clock limits
  // apply; processSweep is resumable, and GET /api/sweep/:id restarts a
  // stalled run, so a cut-off sweep finishes on the next poll.
  ctx.waitUntil(processSweep(env, sweepId, subjectId));

  return json({ sweepId, status: 'running' }, 202);
}

// --- GET /api/sweep/:id ------------------------------------------------------

export async function getSweep(request, env, ctx, params) {
  const { subjectId } = await requireSession(request, env); // R3 gate

  const sweep = await env.DB.prepare('SELECT * FROM sweeps WHERE id = ?')
    .bind(params.id).first();
  // Ownership check: you can only watch your own sweep. 404 (not 403) so the
  // endpoint doesn't confirm other sweep ids exist.
  if (!sweep || sweep.subject_id !== subjectId) {
    throw new HttpError(404, 'sweep_not_found');
  }

  // Resume a stalled run (waitUntil got cut off). Poll-driven self-healing.
  if (sweep.status === 'running') {
    const ageSeconds = (Date.now() - Date.parse(sweep.updated_at)) / 1000;
    if (ageSeconds > STALL_SECONDS) {
      ctx.waitUntil(processSweep(env, sweep.id, subjectId));
    }
  }

  const { results } = await env.DB.prepare(
    'SELECT * FROM findings WHERE sweep_id = ? ORDER BY created_at',
  ).bind(sweep.id).all();

  return json({
    status: sweep.status,
    progress: { done: sweep.done, total: sweep.total },
    findings: results.map((f) => {
      const broker = brokerById(f.broker_id);
      return {
        findingId: f.id,
        brokerId: f.broker_id,
        brokerName: broker ? broker.name : f.broker_id,
        status: f.status,                       // ok | skipped_robots | error
        matched: !!f.matched,
        publishedFields: JSON.parse(f.published_fields), // field NAMES only
        errorCode: f.error_code || null,        // real errors surface (house rule)
      };
    }),
  });
}

// --- the sweep engine --------------------------------------------------------

/**
 * Process all not-yet-attempted brokers for a sweep. Idempotent and
 * resumable: brokers that already have a findings row are skipped, so calling
 * this twice (initial run + stall-resume) can't double-record.
 */
async function processSweep(env, sweepId, subjectId) {
  try {
    const row = await env.DB.prepare(
      'SELECT pii_ciphertext FROM subjects WHERE id = ? AND purged_at IS NULL',
    ).bind(subjectId).first();
    if (!row || !row.pii_ciphertext) throw new Error('subject_missing');

    // Decrypted PII lives only in this function's scope, only for the sweep.
    const pii = JSON.parse(await decryptPII(env, row.pii_ciphertext));
    const nameParts = pii.fullName.trim().split(/\s+/);
    const subject = {
      first: nameParts[0],
      last: nameParts[nameParts.length - 1],
      fullName: pii.fullName,
      city: pii.city,
      state: pii.state,
    };

    const doneRows = await env.DB.prepare(
      'SELECT broker_id FROM findings WHERE sweep_id = ?',
    ).bind(sweepId).all();
    const alreadyDone = new Set(doneRows.results.map((r) => r.broker_id));

    for (const broker of SWEEPABLE_BROKERS) {
      if (alreadyDone.has(broker.id)) continue;

      let status = 'ok';
      let matched = 0;
      let fields = [];
      let errorCode = null;
      try {
        // R4: build from the allowlist, validate origin, THEN robots.txt.
        const url = buildSearchUrl(broker, subject);
        if (!(await robotsAllows(env, url))) {
          status = 'skipped_robots';
        } else {
          const markdown = await firecrawlScrape(env, url);
          fields = detectPublishedFields(markdown, pii);
          // A results page echoes the searched name back, so the name alone
          // proves nothing. "Matched" requires the name PLUS at least one
          // corroborating detail the broker had no reason to echo.
          matched = fields.includes('name') && fields.length >= 2 ? 1 : 0;
        }
      } catch (err) {
        // Real failure, really recorded (house rule: never fake success).
        // errorCode is a machine code, never PII (R5).
        status = 'error';
        errorCode = err.publicCode || (String(err.message).startsWith('allowlist_violation') ? 'allowlist_violation' : 'scrape_failed');
      }

      const now = nowISO();
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO findings (id, sweep_id, subject_id, broker_id, status, matched, published_fields, error_code, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(uuid(), sweepId, subjectId, broker.id, status, matched, JSON.stringify(fields), errorCode, now),
        env.DB.prepare('UPDATE sweeps SET done = done + 1, updated_at = ? WHERE id = ?')
          .bind(now, sweepId),
      ]);

      await sleep(POLITENESS_DELAY_MS); // R4: be polite to broker origins
    }

    // Finalize. If literally every broker errored, the sweep FAILED — say so.
    const tally = await env.DB.prepare(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors
         FROM findings WHERE sweep_id = ?`,
    ).bind(sweepId).all();
    const { total, errors } = tally.results[0];
    const failed = total > 0 && errors === total;
    await env.DB.prepare(
      `UPDATE sweeps SET status = ?, error_code = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
    ).bind(failed ? 'failed' : 'complete', failed ? 'all_brokers_failed' : null, nowISO(), nowISO(), sweepId).run();
  } catch (err) {
    // Hard failure (decrypt, D1, …): mark the sweep failed for real. Log ids
    // and an error name only — never PII, never scraped content (R5).
    console.error('sweep_failed', sweepId, err.name || 'Error');
    await env.DB.prepare(
      `UPDATE sweeps SET status = 'failed', error_code = ?, completed_at = ?, updated_at = ? WHERE id = ? AND status = 'running'`,
    ).bind('sweep_processing_failed', nowISO(), nowISO(), sweepId).run();
  }
}

// --- Firecrawl ---------------------------------------------------------------

/**
 * Scrape one allowlisted URL via Firecrawl's scrape endpoint → markdown.
 * Firecrawl is an HTML→markdown scraper — it reads the page a browser would
 * show; it does not trace IPs or anything of the sort (R2/R4).
 */
async function firecrawlScrape(env, url) {
  if (!env.FIRECRAWL_API_KEY) {
    const e = new Error('firecrawl_not_configured');
    e.publicCode = 'firecrawl_not_configured';
    throw e;
  }
  assertAllowlistedUrl(url); // R4, belt and suspenders at the last hop

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const e = new Error(`firecrawl_http_${res.status}`);
      e.publicCode = `firecrawl_http_${res.status}`; // real status, surfaced
      throw e;
    }
    const data = await res.json();
    if (!data.success || !data.data || typeof data.data.markdown !== 'string') {
      const e = new Error('firecrawl_bad_response');
      e.publicCode = 'firecrawl_bad_response';
      throw e;
    }
    return data.data.markdown;
  } catch (err) {
    if (err.name === 'AbortError') {
      const e = new Error('firecrawl_timeout');
      e.publicCode = 'firecrawl_timeout';
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// --- robots.txt (R4) ---------------------------------------------------------

/**
 * Minimal robots.txt check for the `*` user-agent, cached per host in KV for
 * 24h. Longest-match precedence between Allow and Disallow, `*` wildcards and
 * `$` anchors supported. Fail-safe posture: unreachable robots (5xx/network)
 * → treat as DISALLOWED for now; absent robots (4xx) → allowed, per convention.
 */
async function robotsAllows(env, urlString) {
  const u = new URL(urlString);
  const cacheKey = `robots:${u.host}`;
  let rules = null;

  const cached = await env.SESSIONS.get(cacheKey);
  if (cached) {
    rules = JSON.parse(cached);
  } else {
    let res;
    try {
      res = await fetch(`${u.origin}/robots.txt`, {
        headers: { 'user-agent': 'ConsentArchaeology/1.0 (+https://dig.doziertechgroup.com)' },
      });
    } catch {
      return false; // network failure → conservative: don't crawl
    }
    if (res.status >= 500) return false;           // conservative on server errors
    if (!res.ok) {
      rules = { allow: [], disallow: [] };         // no robots.txt → all allowed
    } else {
      rules = parseRobots(await res.text());
    }
    await env.SESSIONS.put(cacheKey, JSON.stringify(rules), { expirationTtl: 86400 });
  }

  const path = u.pathname + u.search;
  const best = (patterns) => {
    let len = -1;
    for (const p of patterns) {
      if (p.length > len && robotsPatternMatches(p, path)) len = p.length;
    }
    return len;
  };
  const allowLen = best(rules.allow);
  const disallowLen = best(rules.disallow);
  return allowLen >= disallowLen; // no matching disallow (−1 vs −1) → allowed
}

/** Extract Allow/Disallow rules for User-agent: * groups. */
function parseRobots(text) {
  const rules = { allow: [], disallow: [] };
  let applies = false;
  let inGroupHeader = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === 'user-agent') {
      if (!inGroupHeader) applies = false;      // new group starts
      inGroupHeader = true;
      if (value === '*') applies = true;
    } else {
      inGroupHeader = false;
      if (!applies) continue;
      if (field === 'disallow' && value) rules.disallow.push(value);
      if (field === 'allow' && value) rules.allow.push(value);
    }
  }
  return rules;
}

/** robots pattern match: literal prefix with `*` wildcards, optional `$` end anchor. */
function robotsPatternMatches(pattern, path) {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const regex = new RegExp(
    '^' + body.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (anchored ? '$' : ''),
  );
  return regex.test(path);
}

// --- match heuristics --------------------------------------------------------

/**
 * Which of the subject's OWN details appear on the scraped page? Returns
 * field NAMES only (["name","city","phone",…]) — the values are the
 * subject's, already known to them, and are never stored or logged (R5).
 * This is a heuristic, and the dossier presents it as one.
 */
function detectPublishedFields(markdown, pii) {
  const hay = markdown.toLowerCase().replace(/\s+/g, ' ');
  const hayDigits = markdown.replace(/\D+/g, '');
  const fields = [];

  const norm = (s) => s.toLowerCase().trim().replace(/\s+/g, ' ');
  if (hay.includes(norm(pii.fullName))) fields.push('name');
  if (pii.city && hay.includes(norm(pii.city))) fields.push('city');
  if (pii.phone) {
    const digits = pii.phone.replace(/\D+/g, '').slice(-10);
    if (digits.length === 10 && hayDigits.includes(digits)) fields.push('phone');
  }
  if (pii.email && hay.includes(pii.email.toLowerCase())) fields.push('email');
  if (pii.birthYear && hay.includes(String(pii.birthYear))) fields.push('birthYear');
  if (Array.isArray(pii.priorAddresses)) {
    if (pii.priorAddresses.some((a) => a && hay.includes(norm(a)))) fields.push('priorAddress');
  }
  return fields;
}
