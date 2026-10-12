// The Play engine's opening: the book, the guard, and when both hand back to
// the limited engine.
//
// js/play-book.js imports only the opening list, so this runs under plain Node.
//
// Run: npm run test:tree
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../../vendor/chess.js';
import { OPENINGS_ECO } from '../../js/openings-eco.js';
import { LEVELS } from '../../js/engine.js';
import { OPENING_MOVES, GUARD_LINES, guardMargin, guardFloor, pickBookMove, pickGuarded, openingMove } from '../../js/play-book.js';

// A dice that walks evenly through 0..1, so every choice gets its turn.
const sweep = (n = 200) => { let i = 0; return () => ((i++ % n) + 0.5) / n; };

test('every book move is a legal move in its position', () => {
  for (const e of OPENINGS_ECO) {
    const chess = new Chess();
    for (const san of e.moves) assert.doesNotThrow(() => chess.move(san), `${e.moves.join(' ')} (${e.name})`);
  }
});

test('the first move varies and is a main one, never a one-line curiosity', () => {
  const rnd = sweep();
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(pickBookMove([], rnd));
  assert.ok(seen.has('e4') && seen.has('d4'));
  for (const odd of ['g4', 'b4', 'f4', 'c3', 'b3', 'g3', 'Nc3']) assert.ok(!seen.has(odd), odd);
});

test('the reply to 1.e4 varies', () => {
  const rnd = sweep();
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(pickBookMove(['e4'], rnd));
  for (const san of ['e5', 'c5', 'e6', 'c6']) assert.ok(seen.has(san), san);
  assert.ok(!seen.has('a6'));
});

test('a move only one line plays is still played when it is all the book has', () => {
  assert.equal(pickBookMove(['g4']), null);          // the Grob is a name with no continuation
  const only = pickBookMove(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O'], sweep());
  assert.equal(only, 'Be7');
});

test('check and mate marks on the moves played do not hide the book', () => {
  assert.equal(pickBookMove(['e4+', 'e5#']) !== null, true);
});

test('out of the book there is no book move', () => {
  assert.equal(pickBookMove(['a4']), null);
  assert.equal(pickBookMove(['e4', 'e5', 'Ke2']), null);
});

test('the margin shrinks as the level rises and the top level has none', () => {
  assert.equal(LEVELS.length, 8);
  for (let lv = 1; lv < 7; lv++) assert.ok(guardMargin(lv) < guardMargin(lv - 1), `level ${lv}`);
  assert.ok(guardMargin(0) <= 100, 'not even level 1 gives up a pawn on one move');
  assert.ok(guardMargin(6) > 0);
  assert.equal(guardMargin(7), 0);
  for (let lv = 0; lv < 7; lv++) assert.ok(guardFloor(lv) < 0 && guardFloor(lv) >= -150, `floor ${lv}`);
});

test('the guard never plays a move outside the margin', () => {
  const lines = [{ uci: 'e2e4', score: 30 }, { uci: 'd2d4', score: 10 }, { uci: 'g1f3', score: -20 }, { uci: 'a2a4', score: -300 }];
  const rnd = sweep();
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(pickGuarded(lines, 60, -Infinity, rnd));
  assert.deepEqual([...seen].sort(), ['d2d4', 'e2e4', 'g1f3']);
  const tight = new Set();
  for (let i = 0; i < 200; i++) tight.add(pickGuarded(lines, 20, -Infinity, rnd));
  assert.deepEqual([...tight].sort(), ['d2d4', 'e2e4']);
});

test('the better move is played more often', () => {
  const lines = [{ uci: 'best', score: 0 }, { uci: 'worse', score: -80 }];
  const rnd = sweep(1000);
  let best = 0;
  for (let i = 0; i < 1000; i++) if (pickGuarded(lines, 90, -Infinity, rnd) === 'best') best++;
  assert.ok(best > 650, `best played ${best} of 1000`);
});

test('no margin, or already standing badly, means the best move', () => {
  const lines = [{ uci: 'second', score: -130 }, { uci: 'best', score: -120 }];
  assert.equal(pickGuarded(lines, 0), 'best');
  for (let i = 0; i < 50; i++) assert.equal(pickGuarded(lines, 90, -100), 'best');
  // near the floor: only the moves that stay above it
  const edge = [{ uci: 'best', score: -80 }, { uci: 'sinks', score: -140 }];
  for (let i = 0; i < 50; i++) assert.equal(pickGuarded(edge, 90, -100), 'best');
});

test('a mate is never thrown away and a failed search gives nothing', () => {
  const lines = [{ uci: 'mate', score: 9998 }, { uci: 'pawn', score: 150 }];
  for (let i = 0; i < 50; i++) assert.equal(pickGuarded(lines, 90), 'mate');
  assert.equal(pickGuarded([], 90), null);
  assert.equal(pickGuarded(null, 90), null);
  assert.equal(pickGuarded([{ uci: 'x', score: NaN }], 90), null);
});

test('in the book: a book move, and the engine is not asked', async () => {
  let asked = 0;
  const r = await openingMove({ sans: ['e4'], level: 0, topMoves: async () => { asked++; return []; } });
  assert.equal(r.book, true);
  assert.ok(typeof r.san === 'string');
  assert.equal(asked, 0);
});

test('out of the book: the guard asks for the best few moves and plays one', async () => {
  let count = 0;
  const r = await openingMove({ sans: ['a4'], level: 0, topMoves: async n => { count = n; return [{ uci: 'e7e5', score: 40 }]; } });
  assert.deepEqual(r, { uci: 'e7e5', book: false });
  assert.equal(count, GUARD_LINES);
});

test('the top level out of the book, a failed search, and the opening being over all hand back', async () => {
  const top = async () => [{ uci: 'e7e5', score: 40 }];
  assert.equal(await openingMove({ sans: ['a4'], level: 7, topMoves: top }), null);
  assert.equal(await openingMove({ sans: ['a4'], level: 0, topMoves: async () => [] }), null);
  const long = Array(OPENING_MOVES * 2).fill('x');
  assert.equal(await openingMove({ sans: long, level: 0, topMoves: top }), null);
  assert.equal(await openingMove({ sans: [...long, 'x'], level: 0, topMoves: top }), null);
  // the engine's 12th move as Black (23 plies played) is still the opening
  assert.notEqual(await openingMove({ sans: Array(OPENING_MOVES * 2 - 1).fill('x'), level: 0, topMoves: top }), null);
});
