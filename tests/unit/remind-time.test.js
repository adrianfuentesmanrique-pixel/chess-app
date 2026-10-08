// Unit tests for js/remind-time.js. Run with: npm.cmd run test:tree
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { utcHourFor, hourLabel, keyBytes, sameBytes } from '../../js/remind-time.js';

test('utcHourFor is the UTC hour the local hour falls in, rounded down', () => {
  const now = new Date();
  for (const h of [0, 7, 19, 23]) {
    const mins = (((h * 60 + now.getTimezoneOffset()) % 1440) + 1440) % 1440;
    assert.equal(utcHourFor(h, now), Math.floor(mins / 60));
  }
});
test('utcHourFor always returns a whole hour 0..23', () => {
  for (let h = 0; h < 24; h++) {
    const u = utcHourFor(h);
    assert.ok(Number.isInteger(u) && u >= 0 && u <= 23);
  }
});
test('hourLabel pads to HH:00', () => {
  assert.equal(hourLabel(7), '07:00');
  assert.equal(hourLabel(19), '19:00');
});
test('keyBytes decodes base64url, with or without padding', () => {
  assert.deepEqual([...keyBytes('AQID')], [1, 2, 3]);
  assert.deepEqual([...keyBytes('-_8')], [251, 255]);
});
test('sameBytes compares content, not identity', () => {
  assert.equal(sameBytes(new Uint8Array([1, 2]).buffer, new Uint8Array([1, 2])), true);
  assert.equal(sameBytes(new Uint8Array([1, 2]).buffer, new Uint8Array([1, 3])), false);
  assert.equal(sameBytes(null, new Uint8Array([1])), false);
});
