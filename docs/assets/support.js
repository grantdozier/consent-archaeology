/* ============================================================
   CONSENT ARCHAEOLOGY — support.js
   The "chip in" block, in one place, so every surface that
   offers it points at the same account and says the same thing.

   Two hard constraints carried over from DESIGN.md §5 and the
   house rules, neither of which this file relaxes:

   - Nothing here gates anything. Every feature is free whether
     this block is ignored, dismissed, or never rendered. It is
     a link, not a paywall, and there is no "maybe later" that
     comes back.
   - No dark patterns. One link, one dismissal, no countdown,
     no pre-checked anything, no "are you sure?" interstitial.

   It IS rendered on the intake confirmation screen even when
   the backend just failed, because a failed submission is
   still someone who showed up — but the honest status line
   next to it always says what actually happened. Asking for
   money is never allowed to be the reason a real error goes
   unmentioned.
   ============================================================ */

'use strict';

window.CA = window.CA || {};

CA.support = (function () {

  // ---- the single source of truth for where money goes --------------------
  // Dozier Tech Group, PayPal hosted checkout. Change this ONE line if the
  // account ever moves; nothing else in the frontend hardcodes a pay URL.
  const PAY_URL = 'https://www.paypal.com/ncp/payment/QNK2BLFLVUR9L';
  const PAY_LABEL = 'CHIP IN VIA PAYPAL';

  /**
   * Build the support block as a detached element.
   *
   * opts:
   *   heading  — h3 text (default: 'SUSTAINMENT — STRICTLY VOLUNTARY')
   *   blurb    — one-line plain-English note under the button
   *   compact  — smaller variant for inline use on the intake screen
   */
  function build(opts) {
    opts = opts || {};

    const box = document.createElement('div');
    box.className = 'support-block' + (opts.compact ? ' support-compact' : '');

    const h = document.createElement('h3');
    h.className = 'support-head';
    h.textContent = opts.heading || 'SUSTAINMENT — STRICTLY VOLUNTARY';
    box.appendChild(h);

    const row = document.createElement('p');
    row.className = 'btn-row';
    const a = document.createElement('a');
    a.className = 'btn';
    a.id = opts.linkId || '';
    a.href = PAY_URL;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = PAY_LABEL;
    row.appendChild(a);
    box.appendChild(row);

    const p = document.createElement('p');
    p.className = 'small';
    p.textContent = opts.blurb ||
      'Goes to Dozier Tech Group, which pays for the hosting and the email ' +
      'that sends your verification link. Every part of this tool is free ' +
      'whether you click that or not, and we will not ask you twice.';
    box.appendChild(p);

    return box;
  }

  /** Build and append into a container element. Returns the block. */
  function render(container, opts) {
    if (!container) return null;
    const box = build(opts);
    container.appendChild(box);
    return box;
  }

  return { PAY_URL: PAY_URL, PAY_LABEL: PAY_LABEL, build: build, render: render };
})();
