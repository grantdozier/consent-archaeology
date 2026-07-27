/* ============================================================
   CONSENT ARCHAEOLOGY — api.js
   Fetch wrapper for the Worker API. Vanilla, no dependencies.

   House rule #1: NEVER FAKE SUCCESS. Every method here either
   returns what the server actually said, or throws an ApiError
   with the real reason. There is no catch-and-pretend anywhere
   in this file, and there never will be.
   ============================================================ */

'use strict';

// TODO(deploy): confirm this matches the deployed Worker URL, or swap to a
// custom route (e.g. https://dig-api.doziertechgroup.com) once DNS is set.
// This const is the single source of truth for the API origin.
const API_BASE = 'https://dig-api.doziertechgroup.workers.dev';

// How long to wait before giving up on a request. Generous enough for a cold
// Worker start on a slow phone connection, short enough that a dead backend
// reports itself as dead instead of looking like a hung page.
const REQUEST_TIMEOUT_MS = 12000;

window.CA = window.CA || {};

CA.api = (function () {

  const SESSION_KEY = 'ca_session_token';
  const SWEEP_KEY = 'ca_sweep_id';

  /** Typed error the UI can render honestly in the truth panel. */
  class ApiError extends Error {
    constructor(message, info) {
      super(message);
      this.name = 'ApiError';
      info = info || {};
      this.status = info.status || 0;      // 0 = network-level failure
      this.detail = info.detail || null;   // parsed server body, if any
    }
  }

  /* ---- session token (sessionStorage: dies with the tab, on purpose — R3) ---- */

  function getSession() {
    try { return sessionStorage.getItem(SESSION_KEY); } catch (e) { return null; }
  }
  function setSession(token) {
    try { sessionStorage.setItem(SESSION_KEY, token); } catch (e) { /* private mode */ }
  }
  function clearSession() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SWEEP_KEY);
    } catch (e) { /* ignore */ }
  }
  function hasSession() { return !!getSession(); }

  function getSweepId() {
    try { return sessionStorage.getItem(SWEEP_KEY); } catch (e) { return null; }
  }
  function setSweepId(id) {
    try { sessionStorage.setItem(SWEEP_KEY, id); } catch (e) { /* ignore */ }
  }

  /* ---- core request ---- */

  async function request(path, opts) {
    opts = opts || {};
    const headers = {};
    let body;

    if (opts.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }

    if (opts.auth) {
      const token = getSession();
      if (!token) {
        throw new ApiError(
          'No session token in this tab. You need to verify your email first — ' +
          'the magic link is the entire security model, so there is no way around it.',
          { status: 401 }
        );
      }
      headers['authorization'] = 'Bearer ' + token;
    }

    // Hard timeout. Without one, a request to a host that does not resolve —
    // which is exactly the state before the Worker is first deployed — hangs on
    // the browser's own default, tens of seconds, with the UI stuck on
    // "working…". A spinner that never resolves is indistinguishable from a
    // frozen page, and silently reads as "it might still succeed" when it never
    // will. Failing fast and saying so is the honest behaviour.
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, opts.timeoutMs || REQUEST_TIMEOUT_MS);

    let res;
    try {
      res = await fetch(API_BASE + path, {
        method: opts.method || 'GET',
        headers: headers,
        body: body,
        signal: ctrl.signal
      });
    } catch (err) {
      if (err && err.name === 'AbortError') {
        throw new ApiError(
          'The backend did not answer within ' + Math.round(REQUEST_TIMEOUT_MS / 1000) +
          ' seconds, so we stopped waiting. Nothing was saved and nothing was sent. ' +
          'Most likely the Worker is not deployed yet.',
          { status: 0, timedOut: true }
        );
      }
      // Network-level failure: backend not deployed, DNS, offline, CORS.
      throw new ApiError(
        "Could not reach the backend at all. Most likely the Worker isn't deployed " +
        'yet, or your connection dropped. Raw error: ' + err.message,
        { status: 0 }
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      let detail = null;
      try { detail = await res.json(); } catch (e) { /* body wasn't JSON */ }
      const serverMsg = detail && (detail.error || detail.message);
      throw new ApiError(
        'The backend answered with an error: ' +
        (serverMsg ? serverMsg : res.status + ' ' + res.statusText),
        { status: res.status, detail: detail }
      );
    }

    if (opts.raw) return res;   // caller wants the Response (file export)

    try {
      return await res.json();
    } catch (err) {
      throw new ApiError(
        'The backend answered 200 but the body was not valid JSON. That is a bug ' +
        'worth reporting. Raw error: ' + err.message,
        { status: res.status }
      );
    }
  }

  /* ---- endpoints (contract per DESIGN.md / worker agent brief) ---- */

  // POST /api/intake — public. Starts verification. No SSN in this payload,
  // ever, by Hard Rule R1. There is no field for it; do not add one.
  function intake(data) {
    return request('/api/intake', { method: 'POST', body: data });
  }

  // GET /api/verify?token= — public. Magic-link redemption.
  function verify(token) {
    return request('/api/verify?token=' + encodeURIComponent(token));
  }

  // POST /api/sweep — auth. Kicks off the broker sweep.
  function startSweep() {
    return request('/api/sweep', { method: 'POST', auth: true });
  }

  // GET /api/sweep/:id — auth. Real progress: {status, progress:{done,total}, findings}.
  function getSweep(id) {
    return request('/api/sweep/' + encodeURIComponent(id), { auth: true });
  }

  // GET /api/dossier — auth.
  function getDossier() {
    return request('/api/dossier', { auth: true });
  }

  // POST /api/demand — auth. type: 'rtk' | 'disclosure' | 'delete' | 'provenance'
  function demand(findingId, type) {
    return request('/api/demand', { method: 'POST', auth: true, body: { findingId: findingId, type: type } });
  }

  // POST /api/evidence — auth. element: 1|2|3|4 (the four claim elements).
  function evidence(entry) {
    return request('/api/evidence', { method: 'POST', auth: true, body: entry });
  }

  // GET /api/evidence/export — auth. Returns the raw Response so the page can
  // hand the actual bytes to a download. No massaging.
  function exportEvidence() {
    return request('/api/evidence/export', { auth: true, raw: true });
  }

  // POST /api/donate/dismiss — auth. Server-side permanent dismissal flag.
  function dismissDonate() {
    return request('/api/donate/dismiss', { method: 'POST', auth: true });
  }

  // GET /api/stats — public, aggregate counts only (R5).
  function stats() {
    return request('/api/stats');
  }

  return {
    ApiError: ApiError,
    getSession: getSession,
    setSession: setSession,
    clearSession: clearSession,
    hasSession: hasSession,
    getSweepId: getSweepId,
    setSweepId: setSweepId,
    intake: intake,
    verify: verify,
    startSweep: startSweep,
    getSweep: getSweep,
    getDossier: getDossier,
    demand: demand,
    evidence: evidence,
    exportEvidence: exportEvidence,
    dismissDonate: dismissDonate,
    stats: stats
  };
})();
