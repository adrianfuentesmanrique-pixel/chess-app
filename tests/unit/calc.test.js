// Sealed Moves ("calc"): the puzzle's main line, the answer tree's grading,
// what is still owed, and the verdict.
//
// js/calc.js imports only js/tree.js, so this runs under plain Node.
//
// Run: npm run test:tree
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcMainLine, calcNewTree, calcIsMine, calcEnter, calcGrade, calcVerdict, calcAddReply, calcRows } from '../../js/calc.js';

// Black answers three times: ...e5, ...Nc6, ...a6. White's replies are Nf3, Bb5.
const THREE = { id: 't3', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6'], rating: 1200, themes: [] };
// White mates in one after ...Ra2: the puzzle says Re8#, and Qd8# mates too.
const MATE = { id: 'm1', fen: 'r5k1/5ppp/8/8/8/8/5PPP/3QR1K1 b - - 0 1',
  moves: ['a8a2', 'e1e8'], rating: 800, themes: ['mateIn1'] };

// An answer tree with these moves written down the first-written line.
function answer(puzzle, sans) {
  const main = calcMainLine(puzzle);
  const tree = calcNewTree(main);
  let node = tree.root;
  for (const san of sans) node = calcEnter(tree, node, san).node;
  return { main, tree, last: node };
}
const marksBySan = (tree, g) => {
  const out = {};
  const walk = n => { for (const c of n.children) { out[c.san] = g.marks.get(c.id); walk(c); } };
  walk(tree.root);
  return out;
};

test('the main line starts after the opponent\'s first move', () => {
  const main = calcMainLine(THREE);
  assert.equal(main.turn, 'b');
  assert.equal(main.fen.split(' ')[0], 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR');
  assert.deepEqual({ from: main.lead.from, to: main.lead.to, san: main.lead.san }, { from: 'e2', to: 'e4', san: 'e4' });
  assert.deepEqual(main.line.map(m => m.san), ['e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
  assert.equal(main.line[4].fen.split(' ')[1], 'w');
});

test('a promotion in engine notation is read', () => {
  const main = calcMainLine({ fen: '8/4P1k1/8/8/8/8/6K1/8 b - - 0 1', moves: ['g7f7', 'e7e8q'] });
  assert.deepEqual(main.line.map(m => m.san), ['e8=Q+']);
});

test('a puzzle whose moves do not play is refused, and so is one with no answer', () => {
  assert.equal(calcMainLine({ fen: THREE.fen, moves: ['e2e5', 'e7e5'] }), null);
  assert.equal(calcMainLine({ fen: THREE.fen, moves: ['e2e4'] }), null);
  assert.equal(calcMainLine({ fen: 'nonsense', moves: ['e2e4', 'e7e5'] }), null);
});

test('a reply left at the end of the puzzle\'s line is not owed', () => {
  const main = calcMainLine({ ...THREE, moves: THREE.moves.slice(0, 5) });
  assert.deepEqual(main.line.map(m => m.san), ['e5', 'Nf3', 'Nc6']);
});

test('whose move a chip is', () => {
  const { tree } = answer(THREE, ['e5', 'Nf3']);
  const e5 = tree.root.children[0];
  assert.equal(calcIsMine(e5), true);
  assert.equal(calcIsMine(e5.children[0]), false);
});

test('entering: an illegal move in the imagined position is refused', () => {
  const { tree, last } = answer(THREE, ['e5']);
  // After 1.e4 e5 it is White to move: Black's knight cannot go.
  assert.deepEqual(calcEnter(tree, last, { from: 'b8', to: 'c6' }), { error: 'illegal' });
  // The e-pawn has already left e7 in the player's head.
  assert.deepEqual(calcEnter(tree, last, { from: 'e7', to: 'e6' }), { error: 'illegal' });
  assert.equal(last.children.length, 0);
});

test('entering: one move of my own per position, any number of replies', () => {
  const { tree } = answer(THREE, ['e5']);
  const e5 = tree.root.children[0];
  assert.deepEqual(calcEnter(tree, tree.root, 'c5'), { error: 'taken' });
  assert.equal(tree.root.children.length, 1);
  // The same move again just lands on the chip that is there.
  assert.equal(calcEnter(tree, tree.root, 'e5').node, e5);
  assert.ok(calcEnter(tree, e5, 'Nf3').node);
  assert.ok(calcEnter(tree, e5, 'Bc4').node);
  assert.deepEqual(e5.children.map(c => c.san), ['Nf3', 'Bc4']);
});

test('the whole main line right is solved, every chip right', () => {
  const { main, tree } = answer(THREE, ['e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
  const g = calcGrade(tree, main.line);
  assert.equal(g.state, 'solved');
  assert.equal(g.missing, null);
  assert.deepEqual(marksBySan(tree, g), { e5: 'right', Nf3: 'right', Nc6: 'right', Bb5: 'right', a6: 'right' });
});

test('a wrong move of my own fails, and what follows it is not checked', () => {
  const { main, tree } = answer(THREE, ['c5', 'Nf3', 'd6']);
  const g = calcGrade(tree, main.line);
  assert.equal(g.state, 'failed');
  assert.deepEqual(marksBySan(tree, g), { c5: 'wrong', Nf3: 'unchecked', d6: 'unchecked' });
});

test('a wrong move later on the main line fails too', () => {
  const { main, tree } = answer(THREE, ['e5', 'Nf3', 'd6']);
  const g = calcGrade(tree, main.line);
  assert.equal(g.state, 'failed');
  assert.equal(g.wrong.san, 'd6');
  assert.deepEqual(marksBySan(tree, g), { e5: 'right', Nf3: 'right', d6: 'wrong' });
});

test('right so far with the puzzle\'s reply not written: the reply is owed', () => {
  const { main, tree } = answer(THREE, ['e5']);
  const g = calcGrade(tree, main.line);
  assert.equal(g.state, 'unfinished');
  assert.equal(g.missing.after, tree.root.children[0]);
  assert.equal(g.missing.reply, 'Nf3');
});

test('right so far with the reply written and no answer to it: my move is owed', () => {
  const { main, tree, last } = answer(THREE, ['e5', 'Nf3']);
  const g = calcGrade(tree, main.line);
  assert.equal(g.state, 'unfinished');
  assert.equal(g.missing.after, last);
  assert.equal(g.missing.reply, null);
});

test('a different reply is a side variation: drawn "not checked", the puzzle\'s reply still owed', () => {
  const { main, tree } = answer(THREE, ['e5', 'Bc4', 'Nf6']);
  const g = calcGrade(tree, main.line);
  assert.equal(g.state, 'unfinished');
  assert.equal(g.missing.reply, 'Nf3');
  assert.deepEqual(marksBySan(tree, g), { e5: 'right', Bc4: 'unchecked', Nf6: 'unchecked' });
  assert.equal(g.side, 2);
});

test('a side variation next to a finished main line does not change the result', () => {
  const { main, tree } = answer(THREE, ['e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
  const e5 = tree.root.children[0];
  const bc4 = calcEnter(tree, e5, 'Bc4').node;
  calcEnter(tree, bc4, 'Nf6');
  const g = calcGrade(tree, main.line);
  assert.equal(g.state, 'solved');
  assert.equal(g.marks.get(bc4.id), 'unchecked');
  assert.equal(g.side, 2);
});

test('Kael writes the owed reply in, and the next hand-in asks for my move after it', () => {
  const { main, tree } = answer(THREE, ['e5']);
  const node = calcAddReply(tree, calcGrade(tree, main.line).missing);
  assert.equal(node.san, 'Nf3');
  assert.equal(node.kael, true);
  const g = calcGrade(tree, main.line);
  assert.equal(g.state, 'unfinished');
  assert.equal(g.missing.after, node);
  assert.equal(g.missing.reply, null);
  assert.equal(calcAddReply(tree, g.missing), null);
});

test('a one-move puzzle is a one-chip answer', () => {
  const { main, tree } = answer(MATE, ['Re8#']);
  assert.equal(calcGrade(tree, main.line).state, 'solved');
});

test('a different move that mates on the spot is right', () => {
  const { main, tree } = answer(MATE, ['Qd8#']);
  const g = calcGrade(tree, main.line);
  assert.equal(g.state, 'solved');
  assert.deepEqual(marksBySan(tree, g), { 'Qd8#': 'right' });
});

test('a different move that does not mate is wrong', () => {
  const { main, tree } = answer(MATE, ['Qd7']);
  assert.equal(calcGrade(tree, main.line).state, 'failed');
});

test('an empty answer is unfinished, with my first move owed', () => {
  const { main, tree } = answer(THREE, []);
  const g = calcGrade(tree, main.line);
  assert.equal(g.state, 'unfinished');
  assert.equal(g.missing.after, tree.root);
  assert.equal(g.missing.reply, null);
});

test('the verdict: perfect only on a first hand-in with no help', () => {
  assert.equal(calcVerdict({ state: 'solved' }, { handIns: 1, helped: false }), 'perfect');
  assert.equal(calcVerdict({ state: 'solved' }, { handIns: 2, helped: false }), 'solved');
  assert.equal(calcVerdict({ state: 'solved' }, { handIns: 1, helped: true }), 'solved');
  assert.equal(calcVerdict({ state: 'solved' }, { handIns: 1, helped: false, sideWrong: 1 }), 'solved');
  assert.equal(calcVerdict({ state: 'failed' }, { handIns: 1, helped: false }), 'failed');
  assert.equal(calcVerdict({ state: 'unfinished' }, { handIns: 1, helped: false }), 'unfinished');
});

test('rows: my first move alone, then one row per reply with my answer beside it', () => {
  const { tree } = answer(THREE, ['e5', 'Nf3', 'Nc6']);
  const e5 = tree.root.children[0];
  calcEnter(tree, e5, 'Bc4');
  const rows = calcRows(tree).map(r => [r.depth, r.reply ? r.reply.san : null, r.own ? r.own.san : null, r.at.san]);
  assert.deepEqual(rows, [
    [0, null, 'e5', null],
    [1, 'Nf3', 'Nc6', 'Nf3'],
    [1, 'Bc4', null, 'Bc4'],
  ]);
});

test('rows: an empty answer is one row with an empty slot', () => {
  const { tree } = answer(THREE, []);
  const rows = calcRows(tree);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].own, null);
  assert.equal(rows[0].at, tree.root);
});

test('rows: replies to a deeper move sit one step further in, under their own row', () => {
  const { tree } = answer(THREE, ['e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
  const e5 = tree.root.children[0];
  calcEnter(tree, e5, 'Bc4');
  assert.deepEqual(calcRows(tree).map(r => [r.depth, r.reply ? r.reply.san : null]),
    [[0, null], [1, 'Nf3'], [2, 'Bb5'], [1, 'Bc4']]);
});
