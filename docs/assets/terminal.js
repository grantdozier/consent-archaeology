/* ============================================================
   CONSENT ARCHAEOLOGY — terminal.js
   Shared terminal UI primitives: typewriter, boot sequence,
   log lines, small utilities. Vanilla JS, no dependencies.

   Accessibility contract:
   - Every typed line carries its FULL text in a .sr-only span
     immediately, so screen readers never sit through the
     animation. The animated span is aria-hidden.
   - prefers-reduced-motion disables the typewriter entirely
     (text appears instantly). Scanlines/flicker/caret-blink
     are killed in CSS under the same media query.
   ============================================================ */

'use strict';

window.CA = window.CA || {};

CA.term = (function () {

  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');

  /** True when it's OK to animate. Live — respects OS toggle mid-session. */
  function motionOK() { return !mq.matches; }

  /** Escape untrusted text before any innerHTML use. */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /**
   * Cosmetic pause. Skipped under reduced motion. NEVER use this
   * to pace real work or fake progress — it paces decoration only.
   */
  function pause(ms) {
    if (!motionOK()) return Promise.resolve();
    return new Promise(function (res) { setTimeout(res, ms); });
  }

  /** Real wait (polling cadence etc). Always waits, motion or not. */
  function sleep(ms) {
    return new Promise(function (res) { setTimeout(res, ms); });
  }

  /** Remove any caret currently in a log. */
  function dropCaret(logEl) {
    logEl.querySelectorAll('.caret').forEach(function (c) { c.remove(); });
  }

  /**
   * Append one line to a terminal log, typewriter-style.
   * Returns a Promise that resolves when the line is fully drawn.
   * opts: { cls: 'amber'|'dim'|'loud', caret: bool (leave caret on line) }
   */
  function line(logEl, text, opts) {
    opts = opts || {};
    dropCaret(logEl);

    const row = document.createElement('div');
    row.className = 'term-line' + (opts.cls ? ' ' + opts.cls : '');

    // Full text available to assistive tech immediately.
    const srSpan = document.createElement('span');
    srSpan.className = 'sr-only';
    srSpan.textContent = text;
    row.appendChild(srSpan);

    // The animated (or instant) visual copy.
    const vis = document.createElement('span');
    vis.setAttribute('aria-hidden', 'true');
    row.appendChild(vis);

    const caret = document.createElement('span');
    caret.className = 'caret';
    caret.setAttribute('aria-hidden', 'true');
    row.appendChild(caret);

    logEl.appendChild(row);

    function finish() {
      vis.textContent = text;
      if (!opts.caret) caret.remove();
    }

    if (!motionOK() || !text) {
      finish();
      return Promise.resolve(row);
    }

    // Long lines type faster: whole line lands within ~650ms.
    const per = Math.max(4, Math.min(16, Math.floor(650 / Math.max(text.length, 1))));

    return new Promise(function (resolve) {
      let i = 0;
      const timer = setInterval(function () {
        i += 1;
        vis.textContent = text.slice(0, i);
        if (i >= text.length) {
          clearInterval(timer);
          finish();
          resolve(row);
        }
      }, per);
    });
  }

  /**
   * Type a boot sequence: array of strings or {text, cls, hold}.
   * Sequential. Resolves when the last line lands.
   */
  async function boot(logEl, lines) {
    for (let i = 0; i < lines.length; i++) {
      const item = typeof lines[i] === 'string' ? { text: lines[i] } : lines[i];
      await line(logEl, item.text, { cls: item.cls });
      await pause(item.hold != null ? item.hold : 120);
    }
  }

  /** Instantly set a status region (used for truth-panel live status). */
  function status(el, text, isError) {
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('error', !!isError);
  }

  /** Trigger a client-side download of text or a Blob. Real file, real bytes. */
  function download(filename, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  return {
    motionOK: motionOK,
    esc: esc,
    pause: pause,
    sleep: sleep,
    line: line,
    boot: boot,
    status: status,
    download: download,
    dropCaret: dropCaret
  };
})();
