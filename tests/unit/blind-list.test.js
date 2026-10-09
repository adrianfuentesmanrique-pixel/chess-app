// Blindfold "List" mode: the position written out as two lines of squares.
//
// js/blind-list.js imports nothing at all, so this runs under plain Node.
//
// Run: npm run test:tree
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blindPieceList, blindSanLocal } from '../../js/blind-list.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

test("Adrian's own example comes out exactly as he wrote it", () => {
  const l = blindPieceList('6k1/1p6/p7/2p5/8/2BQ1N2/PPP5/R4RK1 w - - 0 1', 'en');
  assert.equal(l.w.join(', '), 'Kg1, Qd3, Ra1, Rf1, Bc3, Nf3, a2, b2, c2');
  assert.equal(l.b.join(', '), 'Kg8, a6, b7, c5');
});

test('the start position: 16 a side, king first, pawns last as bare squares', () => {
  const l = blindPieceList(START, 'en');
  assert.equal(l.w.join(', '), 'Ke1, Qd1, Ra1, Rh1, Bc1, Bf1, Nb1, Ng1, a2, b2, c2, d2, e2, f2, g2, h2');
  assert.equal(l.b.join(', '), 'Ke8, Qd8, Ra8, Rh8, Bc8, Bf8, Nb8, Ng8, a7, b7, c7, d7, e7, f7, g7, h7');
});

test('Spanish letters: R D T A C', () => {
  const l = blindPieceList(START, 'es');
  assert.equal(l.w.join(', '), 'Re1, Dd1, Ta1, Th1, Ac1, Af1, Cb1, Cg1, a2, b2, c2, d2, e2, f2, g2, h2');
  assert.equal(l.b[0], 'Re8');
});

test('bare kings, and an unknown language falls back to English', () => {
  assert.deepEqual(blindPieceList('4k3/8/8/8/8/8/8/4K3 w - - 0 1', 'fr'), { w: ['Ke1'], b: ['Ke8'] });
});

test('inside one kind: by file a→h, then by rank', () => {
  const l = blindPieceList('4k3/8/8/3P4/8/3P4/1P6/R3K2R w - - 0 1', 'en');
  assert.equal(l.w.join(', '), 'Ke1, Ra1, Rh1, b2, d3, d5');
});

test('a move is rewritten in the app language', () => {
  assert.equal(blindSanLocal('Rxe5+', 'es'), 'Txe5+');
  assert.equal(blindSanLocal('Nbd7', 'es'), 'Cbd7');
  assert.equal(blindSanLocal('e8=Q#', 'es'), 'e8=D#');
  assert.equal(blindSanLocal('O-O-O', 'es'), 'O-O-O');
  assert.equal(blindSanLocal('Kg2', 'es'), 'Rg2');
  assert.equal(blindSanLocal('Rxe5+', 'en'), 'Rxe5+');
});
