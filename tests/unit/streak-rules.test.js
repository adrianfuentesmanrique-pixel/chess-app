import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isYesterday, mergeStreak } from '../../js/streak-rules.js';

test('the day after a clock change is still "yesterday" (25 or 23 hours long)', () => {
  assert.equal(isYesterday('2026-10-25', '2026-10-26'), true);  // Spain, clocks back
  assert.equal(isYesterday('2026-11-01', '2026-11-02'), true);  // US, clocks back
  assert.equal(isYesterday('2026-09-06', '2026-09-07'), true);  // Chile, clocks forward
  assert.equal(isYesterday('2026-03-28', '2026-03-29'), true);  // Spain, clocks forward
});

test('ordinary days, month and year ends; gaps and junk are not yesterday', () => {
  assert.equal(isYesterday('2026-11-20', '2026-11-21'), true);
  assert.equal(isYesterday('2026-10-31', '2026-11-01'), true);
  assert.equal(isYesterday('2026-12-31', '2027-01-01'), true);
  assert.equal(isYesterday('2028-02-28', '2028-02-29'), true);
  assert.equal(isYesterday('2026-11-19', '2026-11-21'), false);
  assert.equal(isYesterday('2026-11-21', '2026-11-21'), false);
  assert.equal(isYesterday(null, '2026-11-21'), false);
  assert.equal(isYesterday('yesterday', '2026-11-21'), false);
});

test('sign-in: a phone ahead of the account keeps its streak and fixes the account', () => {
  const m = mergeStreak({ count: 12, lastDate: '2026-11-21', best: 12 }, { count: 10, lastDate: '2026-11-19', best: 10 });
  assert.deepEqual(m, { count: 12, lastDate: '2026-11-21', best: 12, push: true });
});

test('sign-in: an account ahead of the phone (another phone played) wins', () => {
  const m = mergeStreak({ count: 3, lastDate: '2026-11-18', best: 40 }, { count: 6, lastDate: '2026-11-21', best: 6 });
  assert.deepEqual(m, { count: 6, lastDate: '2026-11-21', best: 40, push: true });
});

test('sign-in: the same day keeps the higher count; equal copies need no write', () => {
  assert.equal(mergeStreak({ count: 5, lastDate: '2026-11-21', best: 5 }, { count: 1, lastDate: '2026-11-21', best: 5 }).count, 5);
  assert.equal(mergeStreak({ count: 5, lastDate: '2026-11-21', best: 9 }, { count: 5, lastDate: '2026-11-21', best: 9 }).push, false);
});

test('sign-in: today credited before the account arrived continues the account run', () => {
  const m = mergeStreak({ count: 1, lastDate: '2026-11-21', best: 3 }, { count: 20, lastDate: '2026-11-20', best: 20 });
  assert.deepEqual(m, { count: 21, lastDate: '2026-11-21', best: 21, push: true });
  // ...but not across a real gap
  assert.equal(mergeStreak({ count: 1, lastDate: '2026-11-21', best: 3 }, { count: 20, lastDate: '2026-11-19', best: 20 }).count, 1);
});

test('sign-in: missing or junk on either side', () => {
  assert.deepEqual(mergeStreak({ count: 4, lastDate: '2026-11-21', best: 4 }, { count: undefined, lastDate: undefined, best: undefined }),
    { count: 4, lastDate: '2026-11-21', best: 4, push: true });
  assert.deepEqual(mergeStreak({ count: 0, lastDate: null, best: 0 }, { count: 7, lastDate: '2026-11-20', best: 7 }),
    { count: 7, lastDate: '2026-11-20', best: 7, push: false });
});
