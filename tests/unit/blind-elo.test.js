// Blindfold rating maths: the time extra, the peek rule and the fast start.
//
// js/blind-elo.js imports nothing at all, so this runs under plain Node.
//
// Run: npm run test:tree
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blindEloResult, blindExtraFactor, blindLongLookFactor, blindExtraPreview, clampBlindSeconds, BLIND_LIST_PAY_SECONDS } from '../../js/blind-elo.js';

// The formula Blindfold used before the time control existed (K 32, no peek).
const oldElo = (elo, rating, win) =>
  Math.max(600, elo + 32 * ((win ? 1 : 0) - 1 / (1 + Math.pow(10, (rating - elo) / 400))));

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
const after10 = { attemptCount: 10 };

test('10 s with no peek pays exactly what it paid before', () => {
  for (const [elo, rating] of [[1500, 1500], [1200, 1480], [1830, 1600], [610, 900]]) {
    for (const win of [true, false]) {
      const r = blindEloResult({ elo, rating, win, seconds: 10, peeked: false, ...after10 });
      near(r.elo, oldElo(elo, rating, win));
      assert.equal(r.extra, 0);
    }
  }
});

test('a short look pays extra on a clean win: 2 s doubles the normal points', () => {
  const r = blindEloResult({ elo: 1500, rating: 1500, win: true, seconds: 2, ...after10 });
  near(r.normal, 16);
  near(r.extra, 16);
  near(r.elo, 1532);
  near(blindEloResult({ elo: 1500, rating: 1500, win: true, seconds: 1, ...after10 }).extra, 18);
  near(blindEloResult({ elo: 1500, rating: 1500, win: true, seconds: 5, ...after10 }).extra, 10);
});

test('the extra shrinks steadily from 1 s to 10 s and is never negative', () => {
  let prev = Infinity;
  for (let s = 1; s <= 20; s++) {
    const f = blindExtraFactor(s);
    assert.ok(f >= 0);
    assert.ok(f <= prev);
    if (s >= 10) assert.equal(f, 0);
    prev = f;
  }
});

test('a win after a peek pays the normal points exactly, with zero extra', () => {
  for (const seconds of [1, 2, 5, 10]) {
    const r = blindEloResult({ elo: 1500, rating: 1500, win: true, seconds, peeked: true, ...after10 });
    assert.equal(r.extra, 0);
    near(r.normal, 16);
    near(r.elo, 1516);
  }
  // Away from an even match too: the full pre-existing K 32 win, not the old K 12 one.
  const r = blindEloResult({ elo: 1400, rating: 1650, win: true, seconds: 3, peeked: true, ...after10 });
  near(r.elo, oldElo(1400, 1650, true));
});

test('a wrong move or Show solution pays no extra and loses the normal points', () => {
  for (const seconds of [1, 2, 5, 10, 15, 20]) {
    for (const peeked of [false, true]) {
      const r = blindEloResult({ elo: 1500, rating: 1500, win: false, seconds, peeked, ...after10 });
      assert.equal(r.extra, 0);
      near(r.elo, 1484);
    }
  }
});

test('a loss is never bigger because of a short time', () => {
  const at10 = blindEloResult({ elo: 1700, rating: 1550, win: false, seconds: 10, ...after10 }).elo;
  for (let s = 1; s <= 20; s++) {
    near(blindEloResult({ elo: 1700, rating: 1550, win: false, seconds: s, ...after10 }).elo, at10);
  }
});

test('over 10 s a win pays less: 75% at 15 s, 50% at 20 s, peek or not', () => {
  near(blindLongLookFactor(10), 1);
  near(blindLongLookFactor(15), 0.75);
  near(blindLongLookFactor(20), 0.5);
  for (const peeked of [false, true]) {
    near(blindEloResult({ elo: 1500, rating: 1500, win: true, seconds: 15, peeked, ...after10 }).elo, 1512);
    near(blindEloResult({ elo: 1500, rating: 1500, win: true, seconds: 20, peeked, ...after10 }).elo, 1508);
  }
});

test('the first 10 puzzles calibrate fast, then the normal speed returns', () => {
  for (let n = 0; n < 10; n++) {
    near(blindEloResult({ elo: 1200, rating: 1200, win: true, seconds: 10, attemptCount: n }).elo, 1296);
    near(blindEloResult({ elo: 1200, rating: 1200, win: false, seconds: 10, attemptCount: n }).elo, 1104);
  }
  near(blindEloResult({ elo: 1200, rating: 1200, win: true, seconds: 10, attemptCount: 10 }).elo, 1216);
  near(blindEloResult({ elo: 1200, rating: 1200, win: false, seconds: 10, attemptCount: 10 }).elo, 1184);
});

test('the time extra stays normal-sized during the fast start', () => {
  const r = blindEloResult({ elo: 1200, rating: 1200, win: true, seconds: 2, attemptCount: 0 });
  near(r.normal, 96);
  near(r.extra, 16);
});

test('the preview matches what a clean win then pays', () => {
  const args = { elo: 1430, rating: 1590, seconds: 3 };
  near(blindExtraPreview(args), blindEloResult({ ...args, win: true, ...after10 }).extra);
});

test('list mode pays exactly like a 2-second look: win, peeked win and loss', () => {
  assert.equal(BLIND_LIST_PAY_SECONDS, 2);
  assert.equal(blindExtraFactor(BLIND_LIST_PAY_SECONDS), 1);
  assert.equal(blindLongLookFactor(BLIND_LIST_PAY_SECONDS), 1);
  const base = { elo: 1500, rating: 1500, seconds: BLIND_LIST_PAY_SECONDS, ...after10 };
  const clean = blindEloResult({ ...base, win: true });
  near(clean.normal, 16);
  near(clean.extra, 16);
  const peeked = blindEloResult({ ...base, win: true, peeked: true });
  near(peeked.normal, 16);
  assert.equal(peeked.extra, 0);
  near(blindEloResult({ ...base, win: false }).elo, 1484);
});

test('the rating never drops under 600', () => {
  assert.equal(blindEloResult({ elo: 601, rating: 600, win: false, seconds: 1, attemptCount: 0 }).elo, 600);
});

test('seconds outside 1-20, or junk, are pulled back into range', () => {
  assert.equal(clampBlindSeconds(0), 1);
  assert.equal(clampBlindSeconds(99), 20);
  assert.equal(clampBlindSeconds('7'), 7);
  assert.equal(clampBlindSeconds(undefined), 10);
  assert.equal(clampBlindSeconds(null), 1);
});
