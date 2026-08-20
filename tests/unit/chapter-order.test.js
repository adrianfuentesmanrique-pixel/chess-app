// The arithmetic of moving a chapter one step, tested with no Firestore.
//
// js/chapter-order.js imports nothing at all, so this runs under plain Node.
//
// Run: npm run test:tree
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planMove } from '../../js/chapter-order.js';

// The shape fetchChapters() returns, cut down to what planMove reads.
const rows = (...orders) => orders.map((order, i) => ({ id: `c${i}`, order }));

test('moving a chapter up swaps the two order numbers, and nothing else', () => {
  const list = rows(1, 2, 3);
  assert.deepEqual(planMove(list, 1, -1), [
    { id: 'c1', order: 1 },
    { id: 'c0', order: 2 },
  ]);
});

test('moving a chapter down swaps the same pair the other way', () => {
  const list = rows(1, 2, 3);
  assert.deepEqual(planMove(list, 1, 1), [
    { id: 'c1', order: 3 },
    { id: 'c2', order: 2 },
  ]);
});

// The gaps addChapter() leaves behind once chapters have been deleted. A swap
// carries the numbers themselves, so gaps survive the move untouched.
test('a swap keeps whatever numbers the two rows had, gaps and all', () => {
  const list = rows(4, 17, 92);
  assert.deepEqual(planMove(list, 2, -1), [
    { id: 'c2', order: 17 },
    { id: 'c1', order: 92 },
  ]);
});

test('the first chapter cannot move up and the last cannot move down', () => {
  const list = rows(1, 2, 3);
  assert.deepEqual(planMove(list, 0, -1), []);
  assert.deepEqual(planMove(list, 2, 1), []);
});

test('an index off the list, or a dir that is not one step, writes nothing', () => {
  const list = rows(1, 2, 3);
  assert.deepEqual(planMove(list, -1, 1), []);
  assert.deepEqual(planMove(list, 3, -1), []);
  assert.deepEqual(planMove(list, 1, 2), []);
  assert.deepEqual(planMove(list, 1, 0), []);
  assert.deepEqual(planMove([], 0, 1), []);
});

// The case a plain swap gets silently wrong: trading 2 for 2 stores the same
// two documents and the list does not move.
test('a tied pair renumbers instead of swapping nothing', () => {
  const list = rows(1, 2, 2, 5);
  const writes = planMove(list, 1, 1);
  // Renumbered 1..n with the tied pair exchanged: c0 1, c2 2, c1 3, c3 4. c0 and
  // c2 already hold the number they want, so only two documents are written.
  assert.deepEqual(writes, [
    { id: 'c1', order: 3 },
    { id: 'c3', order: 4 },
  ]);
  assert.ok(!writes.some(w => w.id === 'c0' || w.id === 'c2'));
});

// A renumber is a fallback, not an excuse to rewrite the class: only the rows
// whose number actually changes are returned.
test('a renumber writes only the rows whose number changes', () => {
  const list = rows(1, 2, 3, 3, 5, 6);
  const writes = planMove(list, 2, 1);
  // Six chapters, one tied pair, and the renumber lands five of them back on the
  // number they already had. One document is written.
  assert.deepEqual(writes, [{ id: 'c2', order: 4 }]);
});

// Every chapter tied at once — the shape a class made before `order` existed
// would have, if one ever escaped with the field defaulted.
test('a list tied end to end still moves one step', () => {
  const list = rows(0, 0, 0);
  assert.deepEqual(planMove(list, 2, -1), [
    { id: 'c0', order: 1 },
    { id: 'c2', order: 2 },
    { id: 'c1', order: 3 },
  ]);
});

// A missing or junk `order` reads as 0 in fetchChapters()'s sort, so it has to
// read as 0 here too or the two disagree about what the list looks like.
test('a missing order counts as zero, so it ties with a stored zero', () => {
  const list = [{ id: 'a' }, { id: 'b', order: 0 }, { id: 'c', order: 9 }];
  // A tie forces the renumber, and a renumber is 1..n over the WHOLE list, so
  // the untied chapter sitting out at 9 is pulled in to 3 with the rest.
  assert.deepEqual(planMove(list, 0, 1), [
    { id: 'b', order: 1 },
    { id: 'a', order: 2 },
    { id: 'c', order: 3 },
  ]);
});
