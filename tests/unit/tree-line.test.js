// The live board's protocol, tested where it can actually be tested.
//
// js/tree.js imports only ../vendor/chess.js, so it runs under plain Node with
// no browser, no Firebase and no App Check. js/masterclass.js — where the old
// nodePath()/gotoPath() pair lived — imports i18n, firebase and app.js and can
// never be unit-tested. That is not a detail: those two functions carried a
// comment saying they were "exported only so the round trip can be exercised
// directly", nothing ever exercised it, and BUG A reached production because of
// it. lineOf()/gotoLine() live in tree.js so this file can exist.
//
// Run: npm run test:tree
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePgn, lineOf, gotoLine } from '../../js/tree.js';

// Six moves. The first five are the chapter; the sixth is the move a teacher
// plays during the lesson, which is never saved to the chapter.
const BUG_A_FEN = 'r1bqkbnr/pppp1ppp/8/1B2p3/1n2P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';

const countNodes = (n) => 1 + n.children.reduce((sum, c) => sum + countNodes(c), 0);

test('1. round trip: lineOf() out, gotoLine() back, same position', () => {
  const a = parsePgn('1. e4 e5 2. Nf3 Nc6 3. Bb5 *');
  a.toEnd();
  assert.equal(lineOf(a), 'e4 e5 Nf3 Nc6 Bb5');

  // A SECOND tree, parsed independently — the teacher and the student are two
  // machines, and a test that reuses one tree proves nothing about the pair.
  const b = parsePgn('1. e4 e5 2. Nf3 Nc6 3. Bb5 *');
  gotoLine(b, lineOf(a));
  assert.equal(b.fen(), a.fen());
});

test('2. BUG A: a line past the end of the stored chapter extends the tree', () => {
  // The chapter as Firestore holds it: two plies.
  const tree = parsePgn('1. e4 e5 *');
  const before = countNodes(tree.root);

  // What the teacher is actually broadcasting: six plies. Under the old
  // pointer protocol the follower's board froze here, because nodes 3 to 6 do
  // not exist in this tree and no pointer can name them.
  gotoLine(tree, 'e4 e5 Nf3 Nc6 Bb5 Nb4');

  assert.equal(tree.fen(), BUG_A_FEN);
  assert.equal(countNodes(tree.root) - before, 4, 'four new nodes were grown');
  assert.equal(lineOf(tree), 'e4 e5 Nf3 Nc6 Bb5 Nb4');
});

test('3. idempotent: applying the same line twice grows nothing the second time', () => {
  const tree = parsePgn('1. e4 e5 *');
  gotoLine(tree, 'e4 e5 Nf3 Nc6 Bb5 Nb4');
  const after1 = countNodes(tree.root);

  gotoLine(tree, 'e4 e5 Nf3 Nc6 Bb5 Nb4');
  assert.equal(countNodes(tree.root), after1, 'no duplicate branch');
  assert.equal(tree.fen(), BUG_A_FEN);
});

test('4. a line into a variation lands in the variation, not on the mainline twin', () => {
  // 3. Bc4 in the mainline and 3. Nf3 in the sideline reach the SAME position
  // by transposition. This is the property `path` was chosen over `fen` for in
  // the first place, and it must survive the swap to a move list.
  const tree = parsePgn('1. e4 e5 2. Nf3 (2. Bc4 Nc6 3. Nf3) 2... Nc6 3. Bc4 *');

  gotoLine(tree, 'e4 e5 Bc4 Nc6 Nf3');
  const inVariation = tree.current;

  gotoLine(tree, 'e4 e5 Nf3 Nc6 Bc4');
  const inMainline = tree.current;

  assert.equal(inVariation.fen, inMainline.fen, 'the two really do transpose');
  assert.notEqual(inVariation, inMainline, 'and they are still different nodes');
  assert.equal(inVariation.san, 'Nf3');
  assert.equal(inMainline.san, 'Bc4');
});

test('5. an illegal move stops the walk at the last good node, without throwing', () => {
  const tree = parsePgn('1. e4 e5 *');
  gotoLine(tree, 'e4 e5 Qxq7');
  assert.equal(lineOf(tree), 'e4 e5');
});

test('6. the empty line is the start position', () => {
  const tree = parsePgn('1. e4 e5 2. Nf3 *');
  tree.toEnd();
  gotoLine(tree, '');
  assert.equal(tree.current, tree.root);
  assert.equal(lineOf(tree), '');
});
