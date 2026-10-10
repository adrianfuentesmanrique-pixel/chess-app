// Move feel: the reply waits, the slide, and which sound a move makes.
//
// js/move-feel.js imports nothing at all, so this runs under plain Node.
//
// Run: npm run test:tree
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLIDE_MS, REPLY_MS, THINK_MS, MIN_REPLY_MS, SOUND_NAMES, moveSoundKind, moveTraits, castleRookMove } from '../../js/move-feel.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('one sound per move: check > promotion > castle > capture > move', () => {
  assert.equal(moveSoundKind({}), 'move');
  assert.equal(moveSoundKind(), 'move');
  assert.equal(moveSoundKind({ capture: true }), 'capture');
  assert.equal(moveSoundKind({ castle: true }), 'castle');
  assert.equal(moveSoundKind({ promotion: true, capture: true }), 'promote');
  assert.equal(moveSoundKind({ check: true, capture: true, promotion: true, castle: true }), 'check');
  assert.equal(moveSoundKind({ check: true }), 'check');
});

test('every sound a move can make is a real sound file', () => {
  for (const flags of [{}, { capture: true }, { castle: true }, { promotion: true }, { check: true }]) {
    assert.ok(SOUND_NAMES.includes(moveSoundKind(flags)), moveSoundKind(flags));
  }
});

test('the sound list, the sounds folder and the precache list are the same set', () => {
  const onDisk = fs.readdirSync(path.join(ROOT, 'sounds')).filter(f => f.endsWith('.wav')).map(f => f.slice(0, -4)).sort();
  assert.deepEqual([...SOUND_NAMES].sort(), onDisk);
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const assets = sw.match(/const ASSETS = \[([\s\S]*?)\n\];/)[1];
  const precached = [...assets.matchAll(/'sounds\/([^']+)\.wav'/g)].map(m => m[1]).sort();
  assert.deepEqual(precached, onDisk);
});

test('no reply is drawn over the slide of the move it answers', () => {
  assert.ok(MIN_REPLY_MS >= 100);
  for (const [name, ms] of Object.entries(REPLY_MS)) assert.ok(ms >= MIN_REPLY_MS, `${name} = ${ms}`);
  for (const [name, ms] of Object.entries(THINK_MS)) assert.ok(ms >= MIN_REPLY_MS, `${name} = ${ms}`);
  assert.ok(SLIDE_MS >= 70 && SLIDE_MS <= 300);
});

test('Blindfold waits longer than Puzzles: its replies are heard, not seen', () => {
  assert.ok(REPLY_MS.blindReply >= 400);
  assert.ok(REPLY_MS.blindReply > REPLY_MS.puzzleReply);
  assert.ok(REPLY_MS.rushReply < REPLY_MS.puzzleReply);
});

const P = (color, type) => ({ color, type });

test('moveTraits: a quiet move, a capture, en passant', () => {
  const before = { e2: P('w', 'p'), d5: P('b', 'p'), e1: P('w', 'k') };
  assert.deepEqual(moveTraits(before, { e4: P('w', 'p'), d5: P('b', 'p'), e1: P('w', 'k') }, 'e2', 'e4'),
    { capture: false, castle: false, promotion: false });
  const b2 = { e4: P('w', 'p'), d5: P('b', 'p') };
  assert.equal(moveTraits(b2, { d5: P('w', 'p') }, 'e4', 'd5').capture, true);
  // en passant: the taken pawn is not on the square moved to
  const ep = { e5: P('w', 'p'), d5: P('b', 'p') };
  assert.equal(moveTraits(ep, { d6: P('w', 'p') }, 'e5', 'd6').capture, true);
});

test('moveTraits: castling is a king going two files, nothing else', () => {
  const before = { e1: P('w', 'k'), h1: P('w', 'r'), a1: P('w', 'r') };
  assert.equal(moveTraits(before, { g1: P('w', 'k'), f1: P('w', 'r'), a1: P('w', 'r') }, 'e1', 'g1').castle, true);
  assert.equal(moveTraits(before, { c1: P('w', 'k'), d1: P('w', 'r'), h1: P('w', 'r') }, 'e1', 'c1').castle, true);
  assert.equal(moveTraits(before, { f1: P('w', 'k'), h1: P('w', 'r'), a1: P('w', 'r') }, 'e1', 'f1').castle, false);
  // a rook going two files is not castling
  assert.equal(moveTraits({ a1: P('w', 'r') }, { c1: P('w', 'r') }, 'a1', 'c1').castle, false);
});

test('moveTraits: promotion, with and without a capture', () => {
  assert.deepEqual(moveTraits({ a7: P('w', 'p') }, { a8: P('w', 'q') }, 'a7', 'a8'),
    { capture: false, castle: false, promotion: true });
  assert.deepEqual(moveTraits({ a7: P('w', 'p'), b8: P('b', 'r') }, { b8: P('w', 'n') }, 'a7', 'b8'),
    { capture: true, castle: false, promotion: true });
  assert.equal(moveTraits({ a6: P('w', 'p') }, { a7: P('w', 'p') }, 'a6', 'a7').promotion, false);
});

test('moveTraits: an empty from-square is a plain move, not a crash', () => {
  assert.deepEqual(moveTraits({}, {}, 'e2', 'e4'), { capture: false, castle: false, promotion: false });
});

test('castleRookMove: both sides, both colours, and nothing for other moves', () => {
  assert.deepEqual(castleRookMove('e1', 'g1'), { from: 'h1', to: 'f1' });
  assert.deepEqual(castleRookMove('e1', 'c1'), { from: 'a1', to: 'd1' });
  assert.deepEqual(castleRookMove('e8', 'g8'), { from: 'h8', to: 'f8' });
  assert.deepEqual(castleRookMove('e8', 'c8'), { from: 'a8', to: 'd8' });
  assert.equal(castleRookMove('e1', 'e2'), null);
  assert.equal(castleRookMove('d1', 'f1'), null);
  assert.equal(castleRookMove('e1', 'g2'), null);
});
