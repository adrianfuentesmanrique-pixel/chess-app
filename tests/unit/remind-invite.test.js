// Unit tests for js/remind-invite.js. Run with: npm.cmd run test:tree
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldInvite, ASK_AGAIN_MS, MAX_ASKS } from '../../js/remind-invite.js';

const NOW = Date.UTC(2026, 9, 9, 12);
const DAY = 24 * 60 * 60 * 1000;
// A user who should be asked: everything else changes one thing from this.
const ok = { owed: true, state: 'off', asks: 0, lastAsk: 0, now: NOW, online: true, busy: false };

test('asks a user whose reminder is off and who was never asked', () => {
  assert.equal(shouldInvite(ok), true);
});

test('does not ask unless a day was credited in this session', () => {
  assert.equal(shouldInvite({ ...ok, owed: false }), false);
});

test('only the plain "off" state is invited', () => {
  for (const state of ['on', 'denied', 'signed-out', 'unsupported', 'failed', 'ios-needs-install'])
    assert.equal(shouldInvite({ ...ok, state }), false, state);
});

test('waits while something is in progress, and while offline', () => {
  assert.equal(shouldInvite({ ...ok, busy: true }), false);
  assert.equal(shouldInvite({ ...ok, online: false }), false);
});

test('after one "Not now" it stays quiet for a week', () => {
  assert.equal(shouldInvite({ ...ok, asks: 1, lastAsk: NOW - DAY }), false);
  assert.equal(shouldInvite({ ...ok, asks: 1, lastAsk: NOW - ASK_AGAIN_MS + 1 }), false);
});

test('a week after one "Not now" it asks once more', () => {
  assert.equal(ASK_AGAIN_MS, 7 * DAY);
  assert.equal(shouldInvite({ ...ok, asks: 1, lastAsk: NOW - ASK_AGAIN_MS }), true);
  assert.equal(shouldInvite({ ...ok, asks: 1, lastAsk: NOW - 30 * DAY }), true);
});

test('never a third time', () => {
  assert.equal(MAX_ASKS, 2);
  assert.equal(shouldInvite({ ...ok, asks: 2, lastAsk: NOW - 365 * DAY }), false);
  assert.equal(shouldInvite({ ...ok, asks: 9, lastAsk: 0 }), false);
});

test('a clock set backwards does not bring the question back early', () => {
  assert.equal(shouldInvite({ ...ok, asks: 1, lastAsk: NOW + DAY }), false);
});

test('a damaged stored count reads as never asked, not as a crash', () => {
  assert.equal(shouldInvite({ ...ok, asks: undefined, lastAsk: undefined }), true);
  assert.equal(shouldInvite({ ...ok, asks: NaN }), true);
});
