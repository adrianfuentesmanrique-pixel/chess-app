import { test } from 'node:test';
import assert from 'node:assert/strict';
import { streakAlive, wallRows, streakAvatarOpen } from '../../js/wall-rules.js';

const NOON = new Date(2026, 10, 11, 12, 0);      // 11 Nov 2026, local noon
const EARLY = new Date(2026, 10, 11, 1, 0);      // 11 Nov 2026, 01:00

test('a streak kept today or yesterday is alive', () => {
  assert.equal(streakAlive('2026-11-11', NOON), true);
  assert.equal(streakAlive('2026-11-10', NOON), true);
});

test('a streak last kept two days ago is broken', () => {
  assert.equal(streakAlive('2026-11-09', NOON), false);
});

test('just after midnight, a player behind us still on the day before yesterday is kept', () => {
  assert.equal(streakAlive('2026-11-09', EARLY), true);
});

test('a later date (a player ahead of us) is alive; junk is not', () => {
  assert.equal(streakAlive('2026-11-12', NOON), true);
  for (const bad of [null, undefined, '', 'yesterday', 20261111, '2026-1-1']) assert.equal(streakAlive(bad, NOON), false);
});

const E = [
  { uid: 'a', streakCount: 40, streakLastDate: '2026-11-11', bestStreak: 40 },
  { uid: 'b', streakCount: 90, streakLastDate: '2026-11-01', bestStreak: 120 },  // broken
  { uid: 'c', streakCount: 12, streakLastDate: '2026-11-10', bestStreak: 300 },
  { uid: 'd', streakCount: 0, streakLastDate: '2026-11-11', bestStreak: 0 },
  { uid: 'e' },                                                                   // private: no fields
];

test('Now: live streaks only, longest first, zeros and private players left out', () => {
  assert.deepEqual(wallRows(E, 'now', NOON).map(r => [r.uid, r.days]), [['a', 40], ['c', 12]]);
});

test('Record: best streak ever, broken ones included', () => {
  assert.deepEqual(wallRows(E, 'record', NOON).map(r => [r.uid, r.days]), [['c', 300], ['b', 120], ['a', 40]]);
});

test('streak icons open at their number of days, from the best streak', () => {
  const fire = { id: 'fire', streakDays: 7 };
  assert.equal(streakAvatarOpen(fire, 6), false);
  assert.equal(streakAvatarOpen(fire, 7), true);
  assert.equal(streakAvatarOpen(fire, null), false);
  assert.equal(streakAvatarOpen({ id: 'wolf' }, 0), true);
});
