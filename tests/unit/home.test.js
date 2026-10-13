// Unit tests for js/home.js. Run with: npm.cmd run test:tree
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MISSION_KEYS, missionsDone, kaelRule, dayPart, greetName, kaelLine } from '../../js/home.js';

test('missionsDone counts only the three missions, and survives junk', () => {
  assert.equal(missionsDone({ puzzle: false, play: false, opening: false }), 0);
  assert.equal(missionsDone({ puzzle: true, play: false, opening: true }), 2);
  assert.equal(missionsDone({ puzzle: true, play: true, opening: true, other: true }), 3);
  assert.equal(missionsDone(null), 0);
  assert.equal(missionsDone(undefined), 0);
  assert.equal(MISSION_KEYS.length, 3);
});

test('rule 1: someone who never used the app is welcomed', () => {
  assert.equal(kaelRule({ streak: 0, pending: false, bestStreak: 0, done: 0, everMission: false }), 'welcome');
  assert.equal(kaelRule(), 'welcome');
});

test('rule 1 does not fit once anything was ever done', () => {
  assert.equal(kaelRule({ streak: 0, bestStreak: 4, done: 0 }), 'start');
  assert.equal(kaelRule({ streak: 0, bestStreak: 0, done: 0, everMission: true }), 'start');
  assert.equal(kaelRule({ streak: 0, bestStreak: 0, done: 1 }), 'start');
});

test('rule 2: all three missions done wins over both streak rules', () => {
  assert.equal(kaelRule({ streak: 12, pending: true, bestStreak: 12, done: 3 }), 'alldone');
  assert.equal(kaelRule({ streak: 12, pending: false, bestStreak: 12, done: 3 }), 'alldone');
  assert.equal(kaelRule({ streak: 0, bestStreak: 0, done: 3 }), 'alldone');
});

test('rule 3: a live streak not yet counted today is waiting', () => {
  assert.equal(kaelRule({ streak: 12, pending: true, bestStreak: 30, done: 1 }), 'pending');
});

test('rule 4: a streak already counted today', () => {
  assert.equal(kaelRule({ streak: 1, pending: false, bestStreak: 1, done: 0 }), 'counted');
  assert.equal(kaelRule({ streak: 12, pending: false, bestStreak: 12, done: 2 }), 'counted');
});

test('rule 5: no streak, but not new: start one today', () => {
  assert.equal(kaelRule({ streak: 0, pending: false, bestStreak: 9, done: 2 }), 'start');
  // pending without a streak cannot happen; it must not read as a streak
  assert.equal(kaelRule({ streak: 0, pending: true, bestStreak: 9, done: 0 }), 'start');
});

test('every combination gives exactly one of the five rules', () => {
  const rules = new Set(['welcome', 'alldone', 'pending', 'counted', 'start']);
  for (const streak of [0, 1, 12]) for (const pending of [false, true]) for (const bestStreak of [0, 12])
    for (const done of [0, 1, 2, 3]) for (const everMission of [false, true])
      assert.ok(rules.has(kaelRule({ streak, pending, bestStreak, done, everMission })));
});

test('dayPart splits the day in three', () => {
  assert.equal(dayPart(5), 'morning');
  assert.equal(dayPart(11), 'morning');
  assert.equal(dayPart(12), 'afternoon');
  assert.equal(dayPart(18), 'afternoon');
  assert.equal(dayPart(19), 'evening');
  assert.equal(dayPart(23), 'evening');
  assert.equal(dayPart(0), 'evening');
  assert.equal(dayPart(4), 'evening');
});

test('greetName: the profile name, else a first name, never an e-mail', () => {
  assert.equal(greetName('Adrián', 'Someone Else'), 'Adrián');
  assert.equal(greetName('', 'Marta Ruiz'), 'Marta');
  assert.equal(greetName('  ', null), '');
  assert.equal(greetName('', 'marta@example.com'), '');
  assert.equal(greetName(null, undefined), '');
});

test('kaelLine: greets only when there is a name', () => {
  const signedOut = kaelLine({ streak: 3, pending: true, bestStreak: 3, done: 0, name: '', hour: 9 });
  assert.deepEqual(signedOut, { rule: 'pending', n: 3, greet: null });
  const named = kaelLine({ streak: 3, pending: false, bestStreak: 3, done: 1, name: 'Adrián', hour: 15 });
  assert.deepEqual(named, { rule: 'counted', n: 3, greet: { part: 'afternoon', name: 'Adrián' } });
});
