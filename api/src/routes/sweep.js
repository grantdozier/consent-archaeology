// routes/sweep.js — POST /api/sweep, GET /api/sweep/{id}
//
// R3: BOTH endpoints sit behind requireSession(). A session exists only
// because THIS subject clicked a magic link sent to THEIR email. There is no
// admin bypass, no env override, no debug flag — a sweep can only ever be run
// by a person against themself. That is the anti-doxing control and the
// entire ethical basis of the project; do not weaken it.
//
// R4: every URL fetched goes through buildSearchUrl()/assertAllowlistedUrl()
// from lib/brokers.js — allowlisted origins only, https only. robots.txt is
// checked (and cached) before each origin is scraped; a disallowed path
// records a 'skipped_robots' finding instead of being fetched. Sweeps are
// rate-limited per subject via a counter in the sessions container.
//
// What a sweep actually is (R2 honesty): Firecrawl reads public broker
// listing pages and returns markdown; we look for the subject's own details
// in that markdown. No IP tracing, no network wizardry — reading web pages.
//
// Progress is REAL: `done` is the number of brokers that actually have a
// findings row, recomputed from storage on every poll. The frontend progress
// bar tracks that number, never a setTimeout fiction and never an estimate.
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │ PORT NOTE — HOW THE SWEEP RUNS WITHOUT `ctx.waitUntil`                   │
// │                                                                          │
// │ The Worker kicked the sweep off with ctx.waitUntil() and let it run      │
// │ after the response flushed; GET /api/sweep/:id restarted a run that had  │
// │ stalled. Azure Functions has no waitUntil equivalent: once a handler     │
// │ resolves, the host may freeze or recycle the instance, and a promise     │
// │ still pending is not guaranteed to run. Firing one anyway and telling    │
// │ the user a sweep is in progress would be work we CLAIM is happening and  │
// │ cannot promise is — the "never fake success" rule, in its progress-bar   │
// │ form.                                                                    │
// │                                                                          │
// │ So the sweep is POLL-DRIVEN. POST /api/sweep only creates the sweep      │
// │ record (status 'running', done 0) and returns. Every GET /api/sweep/{id} │
// │ for a still-running sweep does a bounded slice of the real work INLINE,  │
// │ awaited, before it answers — so the numbers it returns describe work     │
// │ that has already finished and been written down. Nothing is in flight    │
// │ when the response goes out.                                              │
// │                                                                          │
// │ The slice is bounded by wall clock, not by broker count, because the     │
// │ frontend aborts a request after 12s (REQUEST_TIMEOUT_MS in              │
// │ docs/assets/api.js). POLL_WORK_BUDGET_MS sits below that with room to    │
// │ spare, and each scrape's timeout is clamped to the budget that is left,  │
// │ so a poll cannot outlive the client that asked for it.                   │
// │                                                                          │
// │ Consequence, stated plainly: if the client stops polling, the sweep      │
// │ stops advancing. It stays 'running' and resumes on the next poll (the    │
// │ frontend keeps the sweep id in sessionStorage). Nothing is lost, no      │
// │ finding is double-recorded, and no progress number is ever inflated —    │
// │ but a sweep no longer finishes itself in the background.                 │
// └──────────────────────────────────────────────────────────────────────────┘

import { HttpError, json, nowISO } from '../lib/http.js';
import { decryptPII, uuid } from '../lib/crypto.js';
import { requireSession } from '../lib/auth.js';
import { config } from '../lib/config.js';
import { SWEEPABLE_BROKERS, brokerById, buildSearchUrl, assertAllowlistedUrl } from '../lib/brokers.js';
import * as sessions from '../lib/sessions.js';
import * as repo from '../lib/repo.js';

const MAX_SWEEPS_PER_DAY = 3;        // per subject (R4 rate limit)
const POLITENESS_DELAY_MS = 750;     // between broker fetches (R4)

// Wall-clock budget for the work one poll may do. The frontend aborts a
// request at 12s (REQUEST_TIMEOUT_MS, docs/assets/api.js) and gives up after 3
// consecutive failures (docs/sweep.html), so this leaves ~4s of headroom for
// storage round trips and a cold start. A poll that outlives its client shows
// the user a timeout while the server is still working — which reads as
// "broken" and is the opposite of honest progress.
const POLL_WORK_BUDGET_MS = 8000;
// Per-Firecrawl-call ceiling. The Worker used 20s and could afford to, because
// its scraping happened after the response had flushed. Here the call sits
// inside a request the browser is timing, so it is clamped to the budget that
// remains. Real consequence: a broker that habitually takes >7s is recorded as
// a real 'firecrawl_timeout' error finding rather than silently waited on.
const SCRAPE_TIMEOUT_MS = 7000;
// Don't start another broker unless at least this much budget remains —
// starting one with 400ms left would just manufacture a timeout error.
const MIN_SCRAPE_BUDGET_MS = 3500;
const ROBOTS_TIMEOUT_MS = 5000;      // robots.txt fetch, also inside the budget

// Advisory lease so two overlapping polls don't scrape the same broker twice.
// Short TTL: if a poll dies mid-slice, the next poll picks the sweep back up
// once the lease expires — the same self-healing the Worker got from its
// STALL_SECONDS check, with a much shorter stall.
const LEASE_TTL_SECONDS = 30;

// Route-param shape the Worker's router enforced with a regex; kept so an
// obviously-bogus id is a clean 404 rather than a storage lookup.
const SWEEP_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- POST /api/sweep ---------------------------------------------------------

export async function postSweep(request) {
  const { subjectId } = await requireSession(request); // R3 gate

  // R4 rate limit — counter per subject, 24h window.
  const rlKey = `rl:sweep:${subjectId}`;
  const used = parseInt((await sessions.get(rlKey)) || '0', 10);
  if (used >= MAX_SWEEPS_PER_DAY) {
    throw new HttpError(429, 'rate_limited: sweep limit reached — try again tomorrow');
  }
  await sessions.put(rlKey, String(used + 1), 86400);

  const sweepId = uuid();
  const now = nowISO();
  await repo.createSweep({
    id: sweepId,
    subjectId,
    status: 'running',
    total: SWEEPABLE_BROKERS.length,
    done: 0,
    createdAt: now,
    updatedAt: now,
  });

  // No scraping happens here — see the PORT NOTE. The record says 'running'
  // with done:0, which is exactly true: nothing has been done yet.
  return json({ sweepId, status: 'running' }, 202);
}

// --- GET /api/sweep/{id} -----------------------------------------------------

export async function getSweep(request, context) {
  const { subjectId } = await requireSession(request); // R3 gate

  const sweepId = request.params.id || '';
  if (!SWEEP_ID_RE.test(sweepId)) throw new HttpError(404, 'sweep_not_found');

  // Passing subjectId makes this a point read inside the caller's own
  // partition: someone else's sweep simply isn't there. The explicit
  // ownership check below stays anyway — defence in depth, and it keeps the
  // 404-not-403 behaviour obvious to a reader (R3).
  let sweep = await repo.getSweep(sweepId, subjectId);
  if (!sweep || sweep.subjectId !== subjectId) {
    throw new HttpError(404, 'sweep_not_found');
  }

  // Poll-driven engine: a bounded slice of REAL work, awaited, before we
  // answer. See the PORT NOTE at the top of this file.
  if (sweep.status === 'running') {
    await advanceSweep(context, sweepId, subjectId);
    sweep = (await repo.getSweep(sweepId, subjectId)) || sweep;
  }

  const findings = await repo.listFindingsBySweep(sweepId, subjectId);

  // `done` is recomputed from storage, not read from the counter: it is the
  // number of distinct brokers that actually have a recorded outcome. The
  // stored counter is a separate round trip from the findings write and can
  // drift; this number cannot overstate what happened.
  const done = new Set(findings.map((f) => f.brokerId)).size;

  return json({
    status: sweep.status,
    progress: { done, total: sweep.total },
    findings: findings.map((f) => {
      const broker = brokerById(f.brokerId);
      return {
        findingId: f.id,
        brokerId: f.brokerId,
        brokerName: broker ? broker.name : f.brokerId,
        status: f.status,                          // ok | skipped_robots | error
        matched: !!f.matched,
        publishedFields: f.publishedFields || [],  // field NAMES only
        errorCode: f.errorCode || null,            // real errors surface (house rule)
      };
    }),
  });
}

// --- the sweep engine --------------------------------------------------------

/**
 * Process as many not-yet-attempted brokers as fit in POLL_WORK_BUDGET_MS,
 * then finalize the sweep once every broker has an outcome.
 *
 * Idempotent and resumable: brokers that already have a findings row are
 * skipped (re-read from storage before each one), so overlapping polls can't
 * double-record. An advisory lease keeps two concurrent polls from working the
 * same sweep at all.
 */
async function advanceSweep(context, sweepId, subjectId) {
  const leaseKey = `sweeplock:${sweepId}`;
  const leaseToken = uuid();

  // Advisory lease. The sessions store has no compare-and-set, so this is a
  // write-then-read-back check: it closes all but a few milliseconds of the
  // race, and the per-broker "already recorded?" re-read below closes the
  // rest. Worst case two polls interleave and one wastes a fetch; a duplicate
  // findings row still cannot inflate `done`, which counts distinct brokers.
  if (await sessions.get(leaseKey)) return;
  await sessions.put(leaseKey, leaseToken, LEASE_TTL_SECONDS);
  if ((await sessions.get(leaseKey)) !== leaseToken) return;

  const deadline = Date.now() + POLL_WORK_BUDGET_MS;

  try {
    const piiCiphertext = await repo.getSubjectPii(subjectId);
    if (!piiCiphertext) throw new Error('subject_missing');

    // Decrypted PII lives only in this function's scope, only for the sweep.
    const pii = JSON.parse(await decryptPII(config, piiCiphertext));
    const nameParts = pii.fullName.trim().split(/\s+/);
    const subject = {
      first: nameParts[0],
      last: nameParts[nameParts.length - 1],
      fullName: pii.fullName,
      city: pii.city,
      state: pii.state,
    };

    let attempted = new Set(await repo.brokerIdsBySweep(sweepId, subjectId));
    let fetchedThisPoll = 0;

    for (const broker of SWEEPABLE_BROKERS) {
      if (attempted.has(broker.id)) continue;

      if (deadline - Date.now() < MIN_SCRAPE_BUDGET_MS) break; // resume next poll

      // R4 politeness between fetches inside one invocation. Across
      // invocations the poll interval already provides the gap.
      if (fetchedThisPoll > 0) await sleep(POLITENESS_DELAY_MS);

      // Re-read ownership of this broker slot immediately before the work, so
      // a poll that overlapped us cannot cause a duplicate row.
      const fresh = new Set(await repo.brokerIdsBySweep(sweepId, subjectId));
      if (fresh.has(broker.id)) { attempted = fresh; continue; }

      let status = 'ok';
      let matched = 0;
      let fields = [];
      let errorCode = null;
      try {
        // R4: build from the allowlist, validate origin, THEN robots.txt.
        const url = buildSearchUrl(broker, subject);
        if (!(await robotsAllows(url))) {
          status = 'skipped_robots';
        } else {
          const budget = Math.min(SCRAPE_TIMEOUT_MS, Math.max(0, deadline - Date.now()));
          const markdown = await firecrawlScrape(url, budget);
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
      await repo.createFinding({
        id: uuid(),
        sweepId,
        subjectId,
        brokerId: broker.id,
        status,
        matched,
        publishedFields: fields,
        errorCode,
        createdAt: now,
      });
      await repo.incrementSweepDone(sweepId, subjectId, now);

      attempted.add(broker.id);
      fetchedThisPoll++;
    }

    // Finalize only once every sweepable broker has a recorded outcome.
    const findings = await repo.listFindingsBySweep(sweepId, subjectId);
    const covered = new Set(findings.map((f) => f.brokerId));
    if (covered.size < SWEEPABLE_BROKERS.length) return; // more to do next poll

    // If literally every broker errored, the sweep FAILED — say so.
    const total = findings.length;
    const errors = findings.filter((f) => f.status === 'error').length;
    const failed = total > 0 && errors === total;
    const ts = nowISO();
    await repo.setSweepStatus(sweepId, subjectId, {
      status: failed ? 'failed' : 'complete',
      errorCode: failed ? 'all_brokers_failed' : null,
      completedAt: ts,
      updatedAt: ts,
      ifStatus: 'running', // don't clobber a sweep another poll already finished
    });
  } catch (err) {
    // Hard failure (decrypt, storage, …): mark the sweep failed for real. Log
    // ids and an error name only — never PII, never scraped content (R5).
    const log = context && typeof context.error === 'function' ? context.error.bind(context) : console.error;
    log('sweep_failed', sweepId, (err && err.name) || 'Error');
    const ts = nowISO();
    await repo.setSweepStatus(sweepId, subjectId, {
      status: 'failed',
      errorCode: 'sweep_processing_failed',
      completedAt: ts,
      updatedAt: ts,
      ifStatus: 'running', // the Worker's `AND status = 'running'` guard
    });
  } finally {
    // Release the lease so the very next poll can continue immediately.
    await sessions.del(leaseKey);
  }
}

// --- Firecrawl ---------------------------------------------------------------

/**
 * Scrape one allowlisted URL via Firecrawl's scrape endpoint → markdown.
 * Firecrawl is an HTML→markdown scraper — it reads the page a browser would
 * show; it does not trace IPs or anything of the sort (R2/R4).
 *
 * @param {string} url allowlisted broker URL
 * @param {number} timeoutMs remaining poll budget for this call
 */
async function firecrawlScrape(url, timeoutMs) {
  if (!config.FIRECRAWL_API_KEY) {
    const e = new Error('firecrawl_not_configured');
    e.publicCode = 'firecrawl_not_configured';
    throw e;
  }
  assertAllowlistedUrl(url); // R4, belt and suspenders at the last hop

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.FIRECRAWL_API_KEY}`,
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
 * Minimal robots.txt check for the `*` user-agent, cached per host for 24h.
 * Longest-match precedence between Allow and Disallow, `*` wildcards and `$`
 * anchors supported. Fail-safe posture: unreachable robots (5xx/network/
 * timeout) → treat as DISALLOWED for now; absent robots (4xx) → allowed, per
 * convention.
 *
 * PORT NOTE: the fetch now carries a timeout the Worker didn't need, because
 * this runs inside a request the client is timing (see POLL_WORK_BUDGET_MS).
 * A robots.txt that hangs is treated exactly like a robots.txt we could not
 * reach: we don't crawl.
 */
async function robotsAllows(urlString) {
  const u = new URL(urlString);
  const cacheKey = `robots:${u.host}`;
  let rules = null;

  const cached = await sessions.get(cacheKey);
  if (cached) {
    rules = JSON.parse(cached);
  } else {
    let res;
    try {
      res = await fetch(`${u.origin}/robots.txt`, {
        headers: { 'user-agent': 'ConsentArchaeology/1.0 (+https://dig.doziertechgroup.com)' },
        signal: AbortSignal.timeout(ROBOTS_TIMEOUT_MS),
      });
    } catch {
      return false; // network failure or timeout → conservative: don't crawl
    }
    if (res.status >= 500) return false;           // conservative on server errors
    if (!res.ok) {
      rules = { allow: [], disallow: [] };         // no robots.txt → all allowed
    } else {
      rules = parseRobots(await res.text());
    }
    await sessions.put(cacheKey, JSON.stringify(rules), 86400);
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
