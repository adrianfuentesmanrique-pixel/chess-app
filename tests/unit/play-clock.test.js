// The clock for a game against the engine: time left for each side, the
// increment, whose turn it is, and the flag.
//
// js/play-clock.js imports nothing and is handed the time as an argument, so
// this runs under plain Node with no timers and no waiting.
//
// Run: npm run test:tree
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIME_CONTROLS, controlById, controlLabel, createClock, startClock, stopClock, timeLeft,
  flagged, pressClock, formatClock, thinkTime, bareKing, flagOutcome, LOW_MS } from '../../js/play-clock.js';

const T0 = 1_000_000;
const five = () => startClock(createClock({ base: 300, inc: 3 }), T0);

test('the list offers the six agreed controls, each with a distinct id', () => {
  assert.deepEqual(TIME_CONTROLS.map(c => c.id), ['3+2', '5+0', '5+3', '10+0', '10+5', '15+10']);
  for (const c of TIME_CONTROLS) {
    assert.equal(c.id, `${c.base / 60}+${c.inc}`);
    assert.equal(controlLabel(c), c.id);
  }
});

test('no clock is the answer for no id, an empty id and an unknown id', () => {
  assert.equal(controlById(''), null);
  assert.equal(controlById(undefined), null);
  assert.equal(controlById('7+7'), null);
  assert.deepEqual(controlById('5+3'), { id: '5+3', base: 300, inc: 3 });
});

test('a new clock gives both sides the full time and does not run until started', () => {
  const c = createClock({ base: 300, inc: 3 });
  assert.equal(timeLeft(c, 'w', T0), 300000);
  assert.equal(timeLeft(c, 'b', T0), 300000);
  assert.equal(timeLeft(c, 'w', T0 + 60000), 300000);
  assert.equal(flagged(c, T0 + 999999), null);
});

test('only the side to move counts down', () => {
  const c = five();
  assert.equal(c.turn, 'w');
  assert.equal(timeLeft(c, 'w', T0 + 12000), 288000);
  assert.equal(timeLeft(c, 'b', T0 + 12000), 300000);
});

test('the clock starts on the side given, for a game begun with Black to move', () => {
  const c = startClock(createClock({ base: 300, inc: 0, turn: 'b' }), T0);
  assert.equal(timeLeft(c, 'b', T0 + 5000), 295000);
  assert.equal(timeLeft(c, 'w', T0 + 5000), 300000);
});

test('pressing takes the time used, adds the increment and passes the turn', () => {
  const c = five();
  assert.equal(pressClock(c, T0 + 10000), null);
  assert.equal(c.turn, 'b');
  assert.equal(timeLeft(c, 'w', T0 + 10000), 293000);
  // White's clock is now still; Black's runs.
  assert.equal(timeLeft(c, 'w', T0 + 40000), 293000);
  assert.equal(timeLeft(c, 'b', T0 + 40000), 270000);
  assert.equal(pressClock(c, T0 + 40000), null);
  assert.equal(c.turn, 'w');
  assert.equal(timeLeft(c, 'b', T0 + 40000), 273000);
});

test('with no increment nothing is added', () => {
  const c = startClock(createClock({ base: 300, inc: 0 }), T0);
  pressClock(c, T0 + 10000);
  assert.equal(timeLeft(c, 'w', T0 + 10000), 290000);
});

test('an instant move (a pre-move) still earns the increment', () => {
  const c = five();
  pressClock(c, T0);
  assert.equal(timeLeft(c, 'w', T0), 303000);
});

test('the flag falls exactly when the time is gone, never before', () => {
  const c = five();
  assert.equal(flagged(c, T0 + 299999), null);
  assert.equal(flagged(c, T0 + 300000), 'w');
  assert.equal(timeLeft(c, 'w', T0 + 300000), 0);
  assert.equal(timeLeft(c, 'w', T0 + 900000), 0, 'never negative');
});

test('a press after the time is gone is a flag: no increment, no change of turn', () => {
  const c = five();
  assert.equal(pressClock(c, T0 + 300500), 'w');
  assert.equal(c.turn, 'w');
  assert.equal(c.flag, 'w');
  assert.equal(timeLeft(c, 'w', T0 + 300500), 0);
  // and it stays fallen, whatever is pressed afterwards
  assert.equal(pressClock(c, T0 + 301000), 'w');
  assert.equal(flagged(c, T0 + 301000), 'w');
  assert.equal(timeLeft(c, 'b', T0 + 999999), 300000, 'the other clock never started');
});

test('the second side can flag too', () => {
  const c = five();
  pressClock(c, T0 + 1000);
  assert.equal(flagged(c, T0 + 1000 + 299999), null);
  assert.equal(flagged(c, T0 + 1000 + 300000), 'b');
});

test('time that passes while nobody looks is still counted (real time, not ticks)', () => {
  // The phone was locked for four minutes: one reading, four minutes later.
  const c = five();
  assert.equal(timeLeft(c, 'w', T0 + 240000), 60000);
  // ...and for six: the flag is already down when the app comes back.
  assert.equal(flagged(c, T0 + 360000), 'w');
});

test('a stopped clock keeps what was left and no longer runs', () => {
  const c = five();
  stopClock(c, T0 + 20000);
  assert.equal(timeLeft(c, 'w', T0 + 20000), 280000);
  assert.equal(timeLeft(c, 'w', T0 + 500000), 280000);
  assert.equal(flagged(c, T0 + 500000), null);
  assert.equal(pressClock(c, T0 + 500000), null, 'pressing a stopped clock does nothing');
  assert.equal(c.turn, 'w');
});

test('stopping a clock whose time had already gone records the flag', () => {
  const c = five();
  stopClock(c, T0 + 400000);
  assert.equal(c.flag, 'w');
});

test('the display rounds up, so 0:00 is only ever shown on a fallen flag', () => {
  assert.equal(formatClock(300000), '5:00');
  assert.equal(formatClock(299001), '5:00');
  assert.equal(formatClock(299000), '4:59');
  assert.equal(formatClock(61000), '1:01');
  assert.equal(formatClock(9500), '0:10');
  assert.equal(formatClock(1), '0:01');
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(-50), '0:00');
  assert.equal(formatClock(900000), '15:00');
  assert.equal(formatClock(3725000), '62:05');
});

test('the engine keeps its level\'s thinking time while it has time in hand', () => {
  for (const movetime of [300, 500, 800, 1200]) {
    assert.equal(thinkTime(movetime, 300000), movetime);
    assert.equal(thinkTime(movetime, 60000), movetime);
    assert.equal(thinkTime(movetime, 24000), movetime);
  }
  assert.ok(LOW_MS >= 20000);
});

test('short of time it thinks for less, and never for nothing', () => {
  assert.equal(thinkTime(1200, 10000), 500);
  assert.equal(thinkTime(300, 4000), 200);
  assert.equal(thinkTime(300, 500), 50);
  assert.equal(thinkTime(300, 0), 50);
  // never more than the level's own time, never rising as the clock falls
  let last = Infinity;
  for (let left = 60000; left >= 0; left -= 500) {
    const ms = thinkTime(800, left);
    assert.ok(ms <= 800 && ms >= 50 && ms <= last);
    last = ms;
  }
});

test('a bare king is a king alone', () => {
  assert.equal(bareKing('8/8/8/4k3/8/8/8/4K2R w - - 0 1', 'b'), true);
  assert.equal(bareKing('8/8/8/4k3/8/8/8/4K2R w - - 0 1', 'w'), false);
  assert.equal(bareKing('8/8/8/4k3/8/8/4p3/4K3 w - - 0 1', 'b'), false);
  assert.equal(bareKing('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'w'), false);
});

test('running out of time loses, unless the other side has only a king: then a draw', () => {
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  // I am White and my flag fell.
  assert.deepEqual(flagOutcome({ flag: 'w', playerColor: 'w', fen: start }), { result: '0-1', outcome: 'loss' });
  // I am Black and my flag fell.
  assert.deepEqual(flagOutcome({ flag: 'b', playerColor: 'b', fen: start }), { result: '1-0', outcome: 'loss' });
  // The engine's flag fell: a win is a win.
  assert.deepEqual(flagOutcome({ flag: 'b', playerColor: 'w', fen: start }), { result: '1-0', outcome: 'win' });
  assert.deepEqual(flagOutcome({ flag: 'w', playerColor: 'b', fen: start }), { result: '0-1', outcome: 'win' });
  // My flag fell but the engine has a king alone.
  const lone = '8/8/8/4k3/8/8/8/4K2R w - - 0 1';
  assert.deepEqual(flagOutcome({ flag: 'w', playerColor: 'w', fen: lone }), { result: '1/2-1/2', outcome: 'draw' });
  // The engine's flag fell and I still have my rook: a win.
  assert.deepEqual(flagOutcome({ flag: 'b', playerColor: 'w', fen: lone }), { result: '1-0', outcome: 'win' });
  // The engine's flag fell and I have a king alone: a draw for me too.
  assert.deepEqual(flagOutcome({ flag: 'w', playerColor: 'b', fen: lone }), { result: '1/2-1/2', outcome: 'draw' });
  assert.deepEqual(flagOutcome({ flag: 'b', playerColor: 'w', fen: '8/8/8/4k2r/8/8/8/4K3 b - - 0 1' }), { result: '1/2-1/2', outcome: 'draw' });
});
