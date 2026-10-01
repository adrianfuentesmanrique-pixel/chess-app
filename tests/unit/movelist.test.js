// The shape of the move list, tested with no browser.
//
// moveListItems() in js/movelist.js decides which moves share a row, and where a
// row has to be cut because a comment or a variation interrupts it. It touches
// no DOM, so it runs under plain Node. The drawing (renderMoveList) is checked
// in headless Chrome by tools/cdp-verify-movelist.mjs.
//
// Run: npm run test:tree
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePgn } from '../../js/tree.js';
import { moveListItems } from '../../js/movelist.js';

// Cut the items down to something readable: "1 e4 e5", "2 Nf3 -", "{text}",
// and a nested array for a variation.
const shape = items => items.map(it => {
  if (it.type === 'comment') return `{${it.text}}`;
  if (it.type === 'var') return shape(it.items);
  return `${it.num} ${it.white ? it.white.san : '-'} ${it.black ? it.black.san : '-'}`;
});
const items = pgn => shape(moveListItems(parsePgn(pgn)));

test('a plain game is one full pair per move number', () => {
  assert.deepEqual(items('1. e4 e5 2. Nf3 Nc6 *'), ['1 e4 e5', '2 Nf3 Nc6']);
});

test('a game that stops on a White move leaves White alone on the last row', () => {
  assert.deepEqual(items('1. e4 e5 2. Nf3 *'), ['1 e4 e5', '2 Nf3 -']);
});

test('a comment after White cuts the row; Black continues on its own row', () => {
  assert.deepEqual(items('1. e4 {best by test} e5 2. Nf3 *'),
    ['1 e4 -', '{best by test}', '1 - e5', '2 Nf3 -']);
});

test('a comment after Black does not cut the pair', () => {
  assert.deepEqual(items('1. e4 e5 {solid} 2. Nf3 Nc6 *'),
    ['1 e4 e5', '{solid}', '2 Nf3 Nc6']);
});

test('a variation on a White move cuts the row the same way', () => {
  assert.deepEqual(items('1. e4 e5 2. Nf3 (2. Bc4 Nf6) Nc6 *'),
    ['1 e4 e5', '2 Nf3 -', ['2 Bc4 Nf6'], '2 - Nc6']);
});

test('a variation that starts on a Black move starts with a Black-only unit', () => {
  assert.deepEqual(items('1. e4 e5 (1... c5 2. Nf3 d6) 2. Nf3 Nc6 *'),
    ['1 e4 e5', ['1 - c5', '2 Nf3 d6'], '2 Nf3 Nc6']);
});

test('the comment before the first move comes first', () => {
  assert.deepEqual(items('{Game of the day} 1. e4 e5 *'), ['{Game of the day}', '1 e4 e5']);
});

test('variations nest three deep and each level knows its depth', () => {
  const tree = parsePgn('1. e4 e5 2. Nf3 (2. Bc4 Nf6 (2... Bc5 3. c3 (3. b4 Bxb4) Nf6) 3. d3) Nc6 *');
  const top = moveListItems(tree);
  assert.deepEqual(shape(top), [
    '1 e4 e5', '2 Nf3 -',
    ['2 Bc4 Nf6', ['2 - Bc5', '3 c3 -', ['3 b4 Bxb4'], '3 - Nf6'], '3 d3 -'],
    '2 - Nc6',
  ]);
  const v1 = top.find(it => it.type === 'var');
  const v2 = v1.items.find(it => it.type === 'var');
  const v3 = v2.items.find(it => it.type === 'var');
  assert.deepEqual([v1.depth, v2.depth, v3.depth], [1, 2, 3]);
});

test('two variations on the same move are two separate blocks', () => {
  assert.deepEqual(items('1. e4 (1. d4 d5) (1. c4 e5) e5 *'),
    ['1 e4 -', ['1 d4 d5'], ['1 c4 e5'], '1 - e5']);
});
