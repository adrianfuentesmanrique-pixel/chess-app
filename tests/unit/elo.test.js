// The shared rating arithmetic (js/elo.js). It was written inline in
// Puzzles.recordResult() until Sealed Moves needed it too; the first test holds
// the moved function to exactly what that inline code paid.
//
// Run: npm run test:tree
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eloAfter, eloExpected, eloK, ELO_FLOOR } from '../../js/elo.js';

// Puzzles.recordResult() as it stood at commit 5f7ec9b, word for word.
function puzzlesInline(elo, rating, win, attemptCount) {
  const K = attemptCount < 10 ? 192 : 24;
  const expected = 1 / (1 + Math.pow(10, (rating - elo) / 400));
  const score = win ? 1 : 0;
  return Math.max(600, elo + K * (score - expected));
}

test('Puzzles is paid exactly what the inline arithmetic paid', () => {
  for (const elo of [600, 612.5, 987.3, 1200, 1499.99, 1873.4, 2400, 3100]) {
    for (const rating of [400, 800, 1200, 1350, 1900, 2600, 3200]) {
      for (const attemptCount of [0, 1, 9, 10, 11, 250]) {
        for (const win of [true, false]) {
          assert.equal(eloAfter({ elo, rating, win, attemptCount }), puzzlesInline(elo, rating, win, attemptCount),
            `elo ${elo}, puzzle ${rating}, attempt ${attemptCount}, ${win ? 'win' : 'loss'}`);
        }
      }
    }
  }
});

test('K: 192 for the first ten attempts, then 24', () => {
  assert.equal(eloK(0), 192);
  assert.equal(eloK(9), 192);
  assert.equal(eloK(10), 24);
  assert.equal(eloK(500), 24);
});

test('an even puzzle is a coin toss: +12 or -12 once settled', () => {
  assert.equal(eloExpected(1500, 1500), 0.5);
  assert.equal(eloAfter({ elo: 1500, rating: 1500, win: true, attemptCount: 30 }), 1512);
  assert.equal(eloAfter({ elo: 1500, rating: 1500, win: false, attemptCount: 30 }), 1488);
});

test('the rating never goes under the floor', () => {
  assert.equal(eloAfter({ elo: 605, rating: 600, win: false, attemptCount: 0 }), ELO_FLOOR);
});

test('factor scales the move and nothing else', () => {
  const base = { elo: 1500, rating: 1500, attemptCount: 30 };
  assert.equal(eloAfter({ ...base, win: true, factor: 1.25 }), 1515);
  assert.equal(eloAfter({ ...base, win: true, factor: 0.5 }), 1506);
  assert.equal(eloAfter({ ...base, win: true, factor: 1 }), eloAfter({ ...base, win: true }));
});
