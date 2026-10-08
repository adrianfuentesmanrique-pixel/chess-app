// Unit tests for hoursToHandle() in tools/reminder/due.mjs — the rule that
// stops a late or repeated run sending twice. Run with: npm.cmd run test:tree
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hoursToHandle, hourIso } from '../../tools/reminder/due.mjs';

const at = iso => new Date(iso);

test('hourIso names the UTC hour', () => {
  assert.equal(hourIso(at('2026-10-08T19:17:00Z')), '2026-10-08T19');
});
test('first run ever: the current hour only', () => {
  assert.deepEqual(hoursToHandle(null, at('2026-10-08T19:17:00Z')), ['2026-10-08T19']);
});
test('the normal case: one new hour', () => {
  assert.deepEqual(hoursToHandle('2026-10-08T18', at('2026-10-08T19:17:00Z')), ['2026-10-08T19']);
});
test('Review Focus 3: a repeated or manual run in the same hour handles nothing', () => {
  assert.deepEqual(hoursToHandle('2026-10-08T19', at('2026-10-08T19:55:00Z')), []);
});
test('Review Focus 3: a run that slipped past the hour does not repeat the next one', () => {
  // The 19:17 run started at 20:03 and handled 19 and 20; the 20:17 run finds nothing.
  assert.deepEqual(hoursToHandle('2026-10-08T18', at('2026-10-08T20:03:00Z')), ['2026-10-08T19', '2026-10-08T20']);
  assert.deepEqual(hoursToHandle('2026-10-08T20', at('2026-10-08T20:40:00Z')), []);
});
test('after a long gap only the last three hours are caught up', () => {
  assert.deepEqual(hoursToHandle('2026-10-08T10', at('2026-10-08T19:17:00Z')),
    ['2026-10-08T17', '2026-10-08T18', '2026-10-08T19']);
});
test('it crosses midnight', () => {
  assert.deepEqual(hoursToHandle('2026-10-08T23', at('2026-10-09T00:17:00Z')), ['2026-10-09T00']);
});
test('a remembered hour in the future handles nothing; rubbish is treated as no memory', () => {
  assert.deepEqual(hoursToHandle('2026-10-09T05', at('2026-10-08T19:17:00Z')), []);
  assert.deepEqual(hoursToHandle('garbage', at('2026-10-08T19:17:00Z')), ['2026-10-08T19']);
  assert.deepEqual(hoursToHandle('', at('2026-10-08T19:17:00Z')), ['2026-10-08T19']);
});
