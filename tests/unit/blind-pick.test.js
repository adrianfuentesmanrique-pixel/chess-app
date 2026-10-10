// Blindfold: which puzzles the next one is drawn from, with or without a theme.
//
// js/blind-pick.js imports nothing at all, so this runs under plain Node.
//
// Run: npm run test:tree
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blindPick, BLIND_PICK_MIN } from '../../js/blind-pick.js';

let nextId = 0;
const mk = (rating, ...themes) => ({ id: 'p' + nextId++, rating, themes });
const many = (n, rating, ...themes) => Array.from({ length: n }, () => mk(rating, ...themes));

test('no theme: every puzzle within 300 points, nothing further', () => {
  const near = [mk(1200, 'fork'), mk(1500, 'pin'), mk(900, 'pin')];
  const r = blindPick([...near, mk(1501, 'fork'), mk(899, 'fork')], 1200, null);
  assert.deepEqual(r.list, near);
  assert.equal(r.fallback, false);
});

test('no theme and nothing within 300: everything loaded, as before', () => {
  const all = [mk(2000, 'fork'), mk(2500, 'pin')];
  const r = blindPick(all, 1000, null);
  assert.deepEqual(r.list, all);
  assert.equal(r.fallback, false);
});

test('an empty theme set counts as no theme', () => {
  const r = blindPick([mk(1200, 'fork'), mk(1200, 'pin')], 1200, new Set());
  assert.equal(r.list.length, 2);
  assert.equal(r.fallback, false);
});

test('a theme with enough puzzles within 300: only those', () => {
  const forks = many(BLIND_PICK_MIN, 1300, 'fork', 'pin');
  const r = blindPick([...forks, ...many(20, 1200, 'pin'), ...many(5, 1700, 'fork')], 1200, new Set(['fork']));
  assert.deepEqual(r.list, forks);
  assert.equal(r.fallback, false);
});

test('several themes: a puzzle with any of them is in', () => {
  const a = many(6, 1200, 'fork'), b = many(6, 1200, 'skewer');
  const r = blindPick([...a, ...b, ...many(9, 1200, 'pin')], 1200, new Set(['fork', 'skewer']));
  assert.equal(r.list.length, 12);
  assert.ok(r.list.every(p => p.themes[0] !== 'pin'));
});

test('too few within 300: the window widens 100 at a time until there are enough', () => {
  const close = many(4, 1200, 'fork');
  const at400 = many(6, 1600, 'fork');
  const at500 = many(6, 1700, 'fork');
  const r = blindPick([...close, ...at400, ...at500], 1200, new Set(['fork']));
  assert.deepEqual(r.list, [...close, ...at400]);     // stopped at 400, never reached 500
  assert.equal(r.fallback, false);
});

test('still under the minimum at 600: plays the few there are, nothing past 600', () => {
  const few = [mk(1200, 'fork'), mk(1800, 'fork')];
  const r = blindPick([...few, mk(1801, 'fork'), ...many(30, 1200, 'pin')], 1200, new Set(['fork']));
  assert.deepEqual(r.list, few);
  assert.equal(r.fallback, false);
});

test('none of the theme within 600: a puzzle at the level, and it says so', () => {
  const pins = many(30, 1200, 'pin');
  const r = blindPick([...pins, mk(1900, 'fork')], 1200, new Set(['fork']));
  assert.deepEqual(r.list, pins);
  assert.equal(r.fallback, true);
});

test('nothing loaded: an empty list, never a crash', () => {
  assert.deepEqual(blindPick([], 1200, new Set(['fork'])), { list: [], fallback: false });
  assert.deepEqual(blindPick([], 1200, null), { list: [], fallback: false });
});
