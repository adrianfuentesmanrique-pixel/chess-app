// Coordinates (Learn tab): which square is asked, what a right and a wrong
// answer do, the name typed on the two rows of keys, and when a run counts.
//
// js/coord.js imports nothing, so this runs under plain Node.
//
// Run: npm run test:tree
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COORD_SQUARES, COORD_SECONDS, COORD_STREAK_MIN, coordNext, coordSide, coordNewRun, coordAnswer, coordKey,
  coordBestKey, coordIsBest, coordCountsForStreak, coordClock } from '../../js/coord.js';

// A random source that hands out the given numbers in turn, then repeats.
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };

test('there are 64 squares, a1 to h8, each once', () => {
  assert.equal(COORD_SQUARES.length, 64);
  assert.equal(new Set(COORD_SQUARES).size, 64);
  assert.ok(COORD_SQUARES.every(s => /^[a-h][1-8]$/.test(s)));
});

test('the next square is never the one just asked', () => {
  for (const prev of COORD_SQUARES) {
    for (const r of [0, 0.25, 0.5, 0.999999]) {
      const next = coordNext(prev, () => r);
      assert.notEqual(next, prev);
      assert.ok(COORD_SQUARES.includes(next));
    }
  }
});

test('every other square can come next', () => {
  const seen = new Set();
  for (let i = 0; i < 63; i++) seen.add(coordNext('e4', () => (i + 0.5) / 63));
  assert.equal(seen.size, 63);
  assert.ok(!seen.has('e4'));
});

test('with no square before, any of the 64 can be asked', () => {
  assert.equal(coordNext(null, () => 0), COORD_SQUARES[0]);
  assert.equal(coordNext(null, () => 0.999999), COORD_SQUARES[63]);
});

test('the side below: White, Black, or one of the two at random', () => {
  assert.equal(coordSide('w'), 'w');
  assert.equal(coordSide('b'), 'b');
  assert.equal(coordSide('random', () => 0.1), 'w');
  assert.equal(coordSide('random', () => 0.9), 'b');
});

test('a new run starts at nothing, with a square asked and a different one waiting', () => {
  const run = coordNewRun({ mode: 'find', timed: true, side: 'b' });
  assert.deepEqual({ mode: run.mode, timed: run.timed, orientation: run.orientation, score: run.score, wrong: run.wrong },
    { mode: 'find', timed: true, orientation: 'b', score: 0, wrong: 0 });
  assert.ok(COORD_SQUARES.includes(run.asked));
  assert.notEqual(run.next, run.asked);
});

test('a right answer scores one and moves on to the square that was waiting', () => {
  const run = coordNewRun({ mode: 'find', timed: true, side: 'w' });
  const { asked, next } = run;
  assert.equal(coordAnswer(run, asked), true);
  assert.equal(run.score, 1);
  assert.equal(run.wrong, 0);
  assert.equal(run.asked, next);
  assert.notEqual(run.next, run.asked);
});

test('a wrong answer costs no point and the same square stays asked', () => {
  const run = coordNewRun({ mode: 'find', timed: true, side: 'w' });
  coordAnswer(run, run.asked);
  const { asked, next } = run;
  const other = COORD_SQUARES.find(s => s !== asked);
  assert.equal(coordAnswer(run, other), false);
  assert.equal(run.score, 1);
  assert.equal(run.wrong, 1);
  assert.equal(run.asked, asked);
  assert.equal(run.next, next);
});

test('over a long run the same square is never asked twice running', () => {
  const run = coordNewRun({ mode: 'name', timed: false, side: 'w' });
  for (let i = 0; i < 2000; i++) {
    const before = run.asked;
    coordAnswer(run, before);
    assert.notEqual(run.asked, before);
  }
  assert.equal(run.score, 2000);
});

test('the same random numbers ask the same squares', () => {
  const a = coordNewRun({ mode: 'find', timed: true, side: 'w', rnd: seq(0.1, 0.7, 0.3) });
  const b = coordNewRun({ mode: 'find', timed: true, side: 'w', rnd: seq(0.1, 0.7, 0.3) });
  assert.deepEqual([a.asked, a.next], [b.asked, b.next]);
});

test('the keys: a letter, then a number, make a name', () => {
  assert.deepEqual(coordKey('', 'f'), { entry: 'f', square: null });
  assert.deepEqual(coordKey('f', '3'), { entry: '', square: 'f3' });
});

test('the keys: a second letter replaces the first, a number alone does nothing', () => {
  assert.deepEqual(coordKey('f', 'c'), { entry: 'c', square: null });
  assert.deepEqual(coordKey('', '3'), { entry: '', square: null });
  assert.deepEqual(coordKey('', 'z'), { entry: '', square: null });
  assert.deepEqual(coordKey('f', '9'), { entry: 'f', square: null });
});

test('each exercise keeps its own best', () => {
  assert.equal(coordBestKey('find'), 'coordBestFind');
  assert.equal(coordBestKey('name'), 'coordBestName');
});

test('a best is a timed run that beats the one before', () => {
  assert.equal(coordIsBest({ timed: true, score: 12 }, 11), true);
  assert.equal(coordIsBest({ timed: true, score: 12 }, 12), false);
  assert.equal(coordIsBest({ timed: true, score: 0 }, 0), false);
  assert.equal(coordIsBest({ timed: false, score: 50 }, 11), false);
});

test('the day counts after a timed run with enough right answers, never an untimed one', () => {
  assert.equal(COORD_STREAK_MIN, 10);
  assert.equal(coordCountsForStreak({ timed: true, score: 10 }), true);
  assert.equal(coordCountsForStreak({ timed: true, score: 9 }), false);
  assert.equal(coordCountsForStreak({ timed: false, score: 40 }), false);
});

test('the clock is read in whole seconds, rounded up, and never below zero', () => {
  assert.equal(COORD_SECONDS, 30);
  assert.equal(coordClock(30000), '0:30');
  assert.equal(coordClock(29001), '0:30');
  assert.equal(coordClock(9000), '0:09');
  assert.equal(coordClock(1), '0:01');
  assert.equal(coordClock(0), '0:00');
  assert.equal(coordClock(-40), '0:00');
});
