// Step 2 of the job: find who is due in the given hours and send.
//
// SAFETY, all deliberate — see the spec, section 7. tests/unit/reminder-safety.test.js
// reads this file and fails if any of these is loosened:
//  * Reads only. This file contains no set(), update(), delete() or add().
//  * The query selects four fields; names and dates of birth are not downloaded.
//  * Logs are PUBLIC. Print counts only. Never a uid, an endpoint, a key or an
//    error message (a push error message can contain the endpoint) — status
//    numbers and error codes only.
//  * At most MAX_SUBS subscriptions are read per user, and one that is not
//    usable (wrong endpoint, empty key) is skipped.
import { Firestore } from '@google-cloud/firestore';
import webpush from 'web-push';
import { MAX_SUBS, isDue, usableSub } from './due.mjs';
import { VAPID_PUBLIC_KEY } from '../../js/vapid-public.js';

// Node prints the whole error, message included, when a script dies on its
// own. These logs are public, so it must never get the chance.
function crashed() {
  console.log('stopped on an unexpected error');
  process.exit(1);
}
process.on('uncaughtException', crashed);
process.on('unhandledRejection', crashed);

const hours = (process.env.HOURS || '').split(',').filter(Boolean);
const dry = process.env.DRY_RUN === 'true';
const count = { hours: hours.length, matched: 0, due: 0, subs: 0, sent: 0, gone: 0, failed: 0, skipped: 0 };
const codes = {};

function done(exit) {
  console.log(JSON.stringify({ dryRun: dry, ...count, errorCodes: codes }));
  process.exit(exit);
}
if (!hours.length) done(0);

let db;
try {
  const key = JSON.parse(process.env.GCP_SA_KEY);
  db = new Firestore({ projectId: key.project_id, credentials: { client_email: key.client_email, private_key: key.private_key } });
  webpush.setVapidDetails('https://chesstrainingcenter.app', VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY.trim());
} catch (_) {
  console.log('could not read the secrets');   // never the reason: it may quote them
  process.exit(1);
}

const now = new Date();
try {
  for (const iso of hours) {
    const utcHour = Number(iso.slice(11, 13));
    const users = await db.collection('users')
      .where('notifyHourUtc', '==', utcHour)
      .where('notifPrefs.daily', '==', true)
      .select('streakLastDate', 'streakCount', 'timeZone', 'remindHourLocal')
      .get();
    count.matched += users.size;
    for (const u of users.docs) {
      const data = u.data();
      if (!isDue(data, now)) continue;
      count.due++;
      const subs = await u.ref.collection('pushSubs').orderBy('createdAt', 'desc').limit(MAX_SUBS).get();
      for (const s of subs.docs) {
        const d = s.data();
        if (!usableSub(d)) { count.skipped++; continue; }
        count.subs++;
        if (dry) continue;
        try {
          await webpush.sendNotification(
            { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
            JSON.stringify({ t: 'daily', lang: d.lang === 'en' ? 'en' : 'es', n: data.streakCount }),
            { TTL: 3 * 3600, urgency: 'normal', topic: 'daily', timeout: 15000 });
          count.sent++;
        } catch (e) {
          // A push service answer (410 = the subscription is gone), or 0 for
          // anything else: no answer, a timeout, a key the library refused.
          const status = Number.isInteger(e?.statusCode) ? e.statusCode : 0;
          if (status === 404 || status === 410) count.gone++; else count.failed++;
          codes[status] = (codes[status] || 0) + 1;
        }
      }
    }
  }
} catch (e) {
  // A Firestore failure. The code only (e.g. 7 = permission denied, 9 = an
  // index is required) — the message can carry a document path.
  codes['firestore:' + (Number.isInteger(e?.code) ? e.code : 'unknown')] = 1;
  done(1);
}
done(0);
