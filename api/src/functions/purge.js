// functions/purge.js — R5: the 90-day PII purge, on a timer trigger.
//
// THIS FUNCTION IS WHY THIS PROJECT IS NOT ON STATIC WEB APPS.
// Same-origin managed functions would have removed the CORS problem entirely,
// but they do not support timer triggers, and R5's "auto-purge raw PII 90 days
// after last activity" is not optional. A retention promise with no mechanism
// behind it is a lie in a privacy policy, so the deployment target bent, not
// the rule. (api/CONTRACT.md §"Why Cosmos, and why not Static Web Apps".)
//
// Subjects idle for 90+ days lose their PII ciphertext, their encrypted demand
// letters, and their encrypted evidence narratives. What remains: the salted
// email hash (dedup), aggregate documents (stats), and the evidence chain
// hashes (so a user-exported plaintext copy stays verifiable).
//
// Schedule is NCRONTAB — six fields, {second} {minute} {hour} {day} {month}
// {day-of-week} — so the Worker's cron "17 6 * * *" becomes "0 17 6 * * *":
// 06:17 daily. Timer triggers run in UTC unless WEBSITE_TIME_ZONE is set on the
// Function App; leave it unset so this keeps matching the Worker's UTC cron.

import { app } from '@azure/functions';
import * as repo from '../lib/repo.js';

const RETENTION_DAYS = 90;

export async function purgeStalePii(_timer, context) {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  const stale = await repo.listStaleUnpurged(cutoff);

  let purged = 0;
  let skipped = 0;
  let failed = 0;
  for (const { id } of stale) {
    try {
      // Cosmos has no cross-container batch. Order matters: the subject's own
      // ciphertext goes first, so a crash mid-subject can never leave a
      // subject marked purged while its PII is still readable.
      //
      // purgeSubject returns false when no document matched — the subject was
      // deleted (export-and-delete) or purged by a concurrent run between the
      // scan and the patch. Not an error, but not a purge either: counted
      // separately rather than folded into the success number.
      const applied = await repo.purgeSubject(id, now);
      await repo.nullDemandCiphertextBySubject(id);
      await repo.nullEvidenceCiphertextBySubject(id);
      if (applied) purged++; else skipped++;
    } catch (err) {
      // One bad subject must not abort the whole run — but it also must not be
      // silently swallowed. Count it, name the error class, move on. The next
      // run retries it because purgeSubject left it un-purged, or because the
      // children still hold ciphertext.
      failed++;
      context.error('pii_purge_subject_failed', (err && err.name) || 'Error');
    }
  }

  // Counts only — never ids-with-context beyond this, never PII (R5).
  context.log(
    'pii_purge_complete',
    'subjects_purged=' + purged,
    'subjects_skipped=' + skipped,
    'subjects_failed=' + failed,
  );

  if (failed > 0) {
    // Surface a failed run as a failed invocation so it shows up in monitoring
    // instead of looking like a clean nightly pass (house rule: never fake
    // success). The successful purges above are already committed.
    throw new Error(`pii_purge_incomplete: ${failed} of ${stale.length} subjects could not be purged`);
  }
}

app.timer('piiPurge', {
  schedule: '0 17 6 * * *', // 06:17 UTC daily — the Worker's cron, in NCRONTAB
  runOnStartup: false,      // never on deploy: a purge is not a warm-up task
  useMonitor: true,         // catch up if the app was asleep at 06:17
  handler: purgeStalePii,
});
