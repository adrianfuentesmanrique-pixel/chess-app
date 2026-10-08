// Unit tests for tools/reminder/due.mjs. Run with: npm.cmd run test:tree
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENDPOINT_OK, MAX_SUBS, localParts, isDue, usableSub } from '../../tools/reminder/due.mjs';

// 2026-10-09 00:17 UTC  =  2026-10-08 19:17 in Panama (UTC-5, no DST).
const NOW = new Date('2026-10-09T00:17:00Z');
const user = (over = {}) => ({
  streakCount: 11, streakLastDate: '2026-10-07', timeZone: 'America/Panama', remindHourLocal: 19, ...over,
});

test('localParts gives the date, hour and minute in the user\'s own zone', () => {
  assert.deepEqual(localParts(NOW, 'America/Panama'), { date: '2026-10-08', hour: 19, minute: 17 });
  assert.deepEqual(localParts(NOW, 'Asia/Kolkata'), { date: '2026-10-09', hour: 5, minute: 47 });
  assert.deepEqual(localParts(NOW, 'Pacific/Kiritimati'), { date: '2026-10-09', hour: 14, minute: 17 });
  assert.deepEqual(localParts(new Date('2026-10-08T05:00:00Z'), 'America/Panama'), { date: '2026-10-08', hour: 0, minute: 0 });
});
test('localParts refuses a zone it cannot read', () => {
  assert.equal(localParts(NOW, 'Mars/Olympus'), null);
  assert.equal(localParts(NOW, ''), null);
  assert.equal(localParts(NOW, undefined), null);
});
test('due: trained yesterday, not today, at the chosen hour', () => {
  assert.equal(isDue(user(), NOW), true);
});
test('not due: already trained today', () => {
  assert.equal(isDue(user({ streakLastDate: '2026-10-08' }), NOW), false);
});
test('not due: the streak died (last trained two days ago) even though the count is stale', () => {
  assert.equal(isDue(user({ streakLastDate: '2026-10-06' }), NOW), false);
});
test('not due: no streak, or no date', () => {
  assert.equal(isDue(user({ streakCount: 0 }), NOW), false);
  assert.equal(isDue(user({ streakLastDate: undefined }), NOW), false);
  assert.equal(isDue(user({ streakCount: undefined }), NOW), false);
});
test('a late run still sends up to two hours after the chosen hour, not later, never before', () => {
  assert.equal(isDue(user({ remindHourLocal: 18 }), NOW), true);
  assert.equal(isDue(user({ remindHourLocal: 17 }), NOW), true);
  assert.equal(isDue(user({ remindHourLocal: 16 }), NOW), false);
  assert.equal(isDue(user({ remindHourLocal: 20 }), NOW), false);
});
test('a reminder set for 23:00 is NOT sent after local midnight', () => {
  const late = new Date('2026-10-09T05:10:00Z');   // 00:10 on the 9th in Panama
  assert.equal(isDue(user({ remindHourLocal: 23, streakLastDate: '2026-10-07' }), late), false);
  assert.equal(isDue(user({ remindHourLocal: 23, streakLastDate: '2026-10-08' }), late), false);
});
test('Review Focus 2: India is judged on India\'s date', () => {
  const u = user({ timeZone: 'Asia/Kolkata', remindHourLocal: 5, streakLastDate: '2026-10-08' });
  assert.equal(isDue(u, NOW), true);                                   // local date is the 9th
  assert.equal(isDue({ ...u, streakLastDate: '2026-10-07' }, NOW), false);
});
test('Review Focus 2: Kiritimati (UTC+14) is judged on Kiritimati\'s date', () => {
  // 00:17 UTC on the 9th is 14:17 on the 9th there, while Panama is still on the 8th.
  const u = user({ timeZone: 'Pacific/Kiritimati', remindHourLocal: 14, streakLastDate: '2026-10-08' });
  assert.equal(isDue(u, NOW), true);
  assert.equal(isDue({ ...u, streakLastDate: '2026-10-09' }, NOW), false);   // trained today, their today
  assert.equal(isDue({ ...u, streakLastDate: '2026-10-07' }, NOW), false);   // Panama's "yesterday" is not theirs
});
test('a half-hour zone is reminded in the UTC hour the app stored, which is before the local hour', () => {
  // The app stores the UTC hour rounded DOWN (js/remind-time.js): 19:00 in India
  // is 13:30 UTC, stored as 13. The 13:17 UTC run is the ONLY run that asks about
  // this user, and it is 18:47 in India. It must send.
  const u = user({ timeZone: 'Asia/Kolkata', remindHourLocal: 19, streakLastDate: '2026-10-07' });
  assert.equal(isDue(u, new Date('2026-10-08T13:17:00Z')), true);     // 18:47, the stored hour
  assert.equal(isDue(u, new Date('2026-10-08T12:17:00Z')), false);    // 17:47, an hour too soon
  assert.equal(isDue(u, new Date('2026-10-08T15:05:00Z')), true);     // 20:35, caught up by a late run
  assert.equal(isDue(u, new Date('2026-10-08T16:17:00Z')), false);    // 21:47, too late
  // Newfoundland (UTC-2:30 in October): 19:00 is 21:30 UTC, stored as 21.
  const nl = user({ timeZone: 'America/St_Johns', remindHourLocal: 19, streakLastDate: '2026-10-07' });
  assert.equal(isDue(nl, new Date('2026-10-08T21:17:00Z')), true);    // 18:47 there
  assert.equal(isDue(nl, new Date('2026-10-08T20:17:00Z')), false);
});
test('a whole-hour zone is never reminded early, whatever minute the run starts', () => {
  for (const min of ['00', '17', '59']) {
    assert.equal(isDue(user(), new Date(`2026-10-08T23:${min}:00Z`)), false, `18:${min} Panama`);
    assert.equal(isDue(user(), new Date(`2026-10-09T00:${min}:00Z`)), true, `19:${min} Panama`);
    assert.equal(isDue(user(), new Date(`2026-10-09T02:${min}:00Z`)), true, `21:${min} Panama`);
    assert.equal(isDue(user(), new Date(`2026-10-09T03:${min}:00Z`)), false, `22:${min} Panama`);
  }
});
test('not due: unreadable zone or hour', () => {
  assert.equal(isDue(user({ timeZone: 'Mars/Olympus' }), NOW), false);
  assert.equal(isDue(user({ remindHourLocal: undefined }), NOW), false);
  assert.equal(isDue(user({ remindHourLocal: 19.5 }), NOW), false);
  assert.equal(isDue(null, NOW), false);
});
test('Review Focus 4: only real push services pass the allowlist', () => {
  for (const ok of ['https://fcm.googleapis.com/fcm/send/x', 'https://web.push.apple.com/x',
    'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://db5p.notify.windows.com/w/?t=x']) {
    assert.equal(ENDPOINT_OK.test(ok), true, ok);
  }
  for (const bad of ['https://evil.example.com/x', 'http://fcm.googleapis.com/x',
    'https://fcm.googleapis.com.evil.example.com/x', 'https://evil.example.com/https://fcm.googleapis.com/', '']) {
    assert.equal(ENDPOINT_OK.test(bad), false, bad);
  }
});

const sub = (over = {}) => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', p256dh: 'BKey', auth: 'secret', ...over });
test('Review Focus 4: a subscription whose endpoint is not a push service is never usable', () => {
  assert.equal(usableSub(sub()), true);
  assert.equal(usableSub(sub({ endpoint: 'https://evil.example.com/x' })), false);
  assert.equal(usableSub(sub({ endpoint: undefined })), false);
  assert.equal(usableSub(sub({ endpoint: 42 })), false);
});
test('Task 1 audit: a subscription with an empty or missing key is skipped, not sent', () => {
  assert.equal(usableSub(sub({ p256dh: '' })), false);
  assert.equal(usableSub(sub({ auth: '' })), false);
  assert.equal(usableSub(sub({ p256dh: undefined })), false);
  assert.equal(usableSub(sub({ auth: null })), false);
  assert.equal(usableSub(sub({ p256dh: 7 })), false);
  assert.equal(usableSub(null), false);
  assert.equal(usableSub(undefined), false);
});
test('Task 1 audit: at most five subscriptions are read per user', () => {
  assert.equal(MAX_SUBS, 5);
});
