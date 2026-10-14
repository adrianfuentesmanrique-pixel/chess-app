// Endings (Learn tab): how many days ago an endgame was solved, which colour
// that is, and how two phones' dates become one.
//
// js/endgame-fresh.js imports nothing, so this runs under plain Node.
//
// Run: npm run test:tree
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysSince, freshState, mergeSolved, solvedNewer } from '../../js/endgame-fresh.js';

const TODAY = '2026-10-13';
// The day n days before TODAY, built from the calendar, not from the code under test.
const ago = n => { const d = new Date(2026, 9, 13); d.setDate(d.getDate() - n);
  const p = x => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

test('the colour rule, at every edge', () => {
  const rule = [[0, 'green'], [1, 'green'], [60, 'green'], [61, 'orange'], [90, 'orange'], [91, 'red'], [400, 'red']];
  for (const [n, state] of rule) assert.deepEqual(freshState(ago(n), TODAY), { state, days: n }, `${n} days ago`);
});

test('never solved is its own state', () => {
  for (const v of [undefined, null, '', 'yesterday', 20261013, true, '2026-13-45x'])
    assert.deepEqual(freshState(v, TODAY), { state: 'never', days: null });
});

test('a day in the future, from another phone, counts as today', () => {
  assert.deepEqual(freshState('2026-10-14', TODAY), { state: 'green', days: 0 });
  assert.deepEqual(freshState('2027-01-01', TODAY), { state: 'green', days: 0 });
});

test('days are calendar days: across a month, a year and a clock change', () => {
  assert.equal(daysSince('2026-09-30', '2026-10-01'), 1);
  assert.equal(daysSince('2025-12-31', '2026-01-01'), 1);
  assert.equal(daysSince('2024-02-28', '2024-03-01'), 2);      // leap year
  assert.equal(daysSince('2026-03-07', '2026-03-09'), 2);      // US clocks go forward on the 8th
  assert.equal(daysSince('2026-10-13', 'not a day'), null);
});

test('two phones: the newer day wins for each endgame, nothing is lost', () => {
  const a = { p1: '2026-10-01', r2: '2026-08-01' };
  const b = { p1: '2026-09-01', r2: '2026-10-10', q3: '2026-07-07' };
  const want = { p1: '2026-10-01', r2: '2026-10-10', q3: '2026-07-07' };
  assert.deepEqual(mergeSolved(a, b), want);
  assert.deepEqual(mergeSolved(b, a), want);
  assert.deepEqual(mergeSolved(a, null), a);
  assert.deepEqual(mergeSolved(undefined, []), {});
  assert.deepEqual(mergeSolved({ p1: 'junk', p2: 5 }, { p1: '2026-10-01' }), { p1: '2026-10-01' });
});

test('only what the other side lacks or has older is sent', () => {
  const mine = { p1: '2026-10-01', r2: '2026-08-01', q3: '2026-07-07', x: 'junk' };
  const theirs = { p1: '2026-09-01', r2: '2026-10-10', q3: '2026-07-07' };
  assert.deepEqual(solvedNewer(mine, theirs), { p1: '2026-10-01' });
  assert.deepEqual(solvedNewer(mine, null), { p1: '2026-10-01', r2: '2026-08-01', q3: '2026-07-07' });
  assert.deepEqual(solvedNewer({}, theirs), {});
});
