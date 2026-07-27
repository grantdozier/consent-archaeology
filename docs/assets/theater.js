/* ============================================================
   CONSENT ARCHAEOLOGY — theater.js
   The two-panel theater/truth engine (DESIGN.md §3).

   Contract, enforced here and nowhere weaseled:
   - Progress bars reflect REAL async state only. Determinate
     values come from server-reported counts. "Indeterminate"
     means exactly one thing: a real request is currently in
     flight. The moment it settles, the bar settles. There is
     no setTimeout that moves a progress bar in this file.
   - Theater narration is decoration layered OVER real work.
     It types flavor lines WHILE a real promise is pending and
     shuts up the instant the promise settles. It never prints
     an outcome — outcomes are printed by the caller from the
     actual result.
   ============================================================ */

'use strict';

window.CA = window.CA || {};

CA.theater = (function () {

  /* ------------------------------------------------------------
   * progress(el): wrap a .progress element with an honest API.
   *
   *   const bar = CA.theater.progress(document.querySelector('#bar'));
   *   bar.busy('CONTACTING ARCHIVE');   // a real fetch is in flight
   *   bar.set(done, total, 'label');    // real counts from the server
   *   bar.done('COMPLETE');             // the real work really finished
   *   bar.fail('TRANSMISSION FAILED');  // the real work really failed
   * ------------------------------------------------------------ */
  function progress(el) {
    el.classList.add('progress');
    el.setAttribute('role', 'progressbar');
    el.setAttribute('aria-valuemin', '0');
    el.setAttribute('aria-valuemax', '100');

    let fill = el.querySelector('.progress-fill');
    if (!fill) {
      fill = document.createElement('div');
      fill.className = 'progress-fill';
      el.appendChild(fill);
    }

    // Text line under the bar (created if the page didn't provide one).
    let text = el.parentElement ? el.parentElement.querySelector('.progress-text') : null;
    if (!text) {
      text = document.createElement('div');
      text.className = 'progress-text';
      el.insertAdjacentElement('afterend', text);
    }

    function setText(t, isAmber) {
      text.textContent = t || '';
      text.classList.toggle('amber', !!isAmber);
    }

    return {
      /** A real request is in flight; completion fraction is unknown. */
      busy: function (label) {
        el.classList.add('indeterminate');
        el.classList.remove('failed');
        el.removeAttribute('aria-valuenow');       // ARIA: no valuenow = indeterminate
        el.setAttribute('aria-valuetext', (label || 'working') + ' — request in flight');
        setText((label || 'WORKING') + ' …');
      },

      /** Real counts, from the server. Never called with invented numbers. */
      set: function (done, total, label) {
        el.classList.remove('indeterminate', 'failed');
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        fill.style.width = pct + '%';
        el.setAttribute('aria-valuenow', String(pct));
        el.setAttribute('aria-valuetext', done + ' of ' + total + (label ? ' — ' + label : ''));
        setText('[' + String(pct).padStart(3, ' ') + '%] ' + done + '/' + total + (label ? '  ' + label : ''));
      },

      /** The actual work actually finished. */
      done: function (label) {
        el.classList.remove('indeterminate', 'failed');
        fill.style.width = '100%';
        el.setAttribute('aria-valuenow', '100');
        el.setAttribute('aria-valuetext', label || 'complete');
        setText('[100%] ' + (label || 'COMPLETE'));
      },

      /** The actual work actually failed. Bar goes amber and says so. */
      fail: function (label) {
        el.classList.remove('indeterminate');
        el.classList.add('failed');
        el.setAttribute('aria-valuetext', label || 'failed');
        setText('[ !! ] ' + (label || 'FAILED'), true);
      }
    };
  }

  /* ------------------------------------------------------------
   * narrate(logEl, beats, promise)
   *
   * Types theater flavor lines while a REAL promise is pending.
   * Stops the moment it settles (either way). Never announces an
   * outcome; the caller does that from the real result. Any
   * rejection is observed by the caller, not swallowed here.
   *
   * beats: array of strings or {text, cls, hold}
   * Returns a promise that resolves when narration stops.
   * ------------------------------------------------------------ */
  async function narrate(logEl, beats, promise) {
    let settled = false;
    // Observe settlement without interfering with the caller's own await.
    promise.then(function () { settled = true; }, function () { settled = true; });

    for (let i = 0; i < beats.length; i++) {
      if (settled) return;
      const b = typeof beats[i] === 'string' ? { text: beats[i] } : beats[i];
      await CA.term.line(logEl, b.text, { cls: b.cls });
      if (settled) return;
      await CA.term.pause(b.hold != null ? b.hold : 300);
    }
    // Out of beats but the work is still going: leave a live caret so the
    // terminal visibly waits with us, honestly.
    if (!settled) {
      await CA.term.line(logEl, '', { caret: true });
    }
  }

  /* ------------------------------------------------------------
   * gate(opts): shared session gate for pages behind R3.
   * If there is no session token, writes an honest explanation to
   * both panels and returns false. No redirect tricks, no faking.
   *   opts: { logEl, statusEl, backHref }
   * ------------------------------------------------------------ */
  function gate(opts) {
    if (CA.api.hasSession()) return true;
    if (opts.logEl) {
      CA.term.line(opts.logEl, '> CLEARANCE CHECK ............ FAILED', { cls: 'amber' });
      CA.term.line(opts.logEl, '> NO CREDENTIAL IN THIS TAB', { cls: 'amber' });
    }
    if (opts.statusEl) {
      CA.term.status(
        opts.statusEl,
        'No verified session in this tab. That is not a bug — it is Hard Rule R3: ' +
        'no email verification, no sweep, no exceptions. Start at the intake form ' +
        'and click the link we email you. (Sessions live in this tab only and end ' +
        'when you close it.)',
        true
      );
    }
    if (opts.backHref) {
      const a = document.createElement('a');
      a.className = 'btn';
      a.href = opts.backHref;
      a.textContent = 'GO TO INTAKE';
      if (opts.statusEl) opts.statusEl.insertAdjacentElement('afterend', a);
    }
    return false;
  }

  /* ------------------------------------------------------------
   * apiFail(statusEl, err, doing)
   * One honest place to render an ApiError into a truth panel.
   * ------------------------------------------------------------ */
  function apiFail(statusEl, err, doing) {
    const prefix = doing ? doing + ' failed. ' : '';
    CA.term.status(statusEl, prefix + (err && err.message ? err.message : String(err)) +
      ' Nothing was saved and nothing was sent — we do not pretend otherwise.', true);
  }

  return {
    progress: progress,
    narrate: narrate,
    gate: gate,
    apiFail: apiFail
  };
})();
