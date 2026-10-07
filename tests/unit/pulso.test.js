// Pulso: the puzzle sequence, the pull arithmetic and the result — the pure
// half of the mode. The other half (the writes) is js/firebase.js, checked
// against the emulator by tools/emu-verify-pulso.mjs.
//
// js/pulso.js imports only js/puzzles.js, which touches nothing until a band is
// asked for, so this runs under plain Node. The puzzle list is passed in.
//
// The referee is firestore.rules (the pulso block). stepOk() and timeWinner()
// here are that block's pulsoStepOk and pulsoTimeWinner copied line for line,
// and the tests below hold the arithmetic to them.
//
// Run: npm run test:tree
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PULSO, targetRating, bandOfIndex, bandsNeeded, buildList, packIds, unpackIds,
  idAt, puzzleAt, resolveList, applySolve, applyMistake, stepOk, markerPos,
  timeWinner, decideResult, clockOffset,
} from '../../js/pulso.js';
import { BANDS } from '../../js/puzzles.js';

// A library with `perBand` puzzles in each of bands 1 to 6, ratings spread
// evenly across the band. Ids are five characters, like the real ones.
function library(perBand = 400, bands = [1, 2, 3, 4, 5, 6]) {
  const out = [];
  for (const b of bands) {
    const [lo, hi] = BANDS[b];
    for (let k = 0; k < perBand; k++) {
      out.push({ id: `${b}${String(k).padStart(4, '0')}`, rating: lo + Math.floor((hi - lo + 1) * k / perBand) });
    }
  }
  return out;
}

// A repeatable stand-in for Math.random.
function seeded(seed = 1) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

const ZERO = { S: 0, M: 0, K: 0, P: 0 };
const arr = c => [c.S, c.M, c.K, c.P];

// ── The ramp ──────────────────────────────────────────────────────────────
test('target rating starts at 800 and climbs 30 a puzzle', () => {
  assert.equal(targetRating(0), 800);
  assert.equal(targetRating(1), 830);
  assert.equal(targetRating(38), 1940);
});

test('target rating is capped at 1950 from index 39 on (39, 40 and 59)', () => {
  assert.equal(targetRating(39), 1950);   // 800 + 30 x 39 = 1970, capped
  assert.equal(targetRating(40), 1950);
  assert.equal(targetRating(59), 1950);
});

test('the band is known from the index alone, and only bands 1 to 6 are ever needed', () => {
  assert.equal(bandOfIndex(0), 1);     // 800
  assert.equal(bandOfIndex(6), 1);     // 980
  assert.equal(bandOfIndex(7), 2);     // 1010
  assert.equal(bandOfIndex(39), 6);    // 1950
  assert.equal(bandOfIndex(59), 6);
  assert.deepEqual(bandsNeeded(), [1, 2, 3, 4, 5, 6]);
});

// ── Building the list ─────────────────────────────────────────────────────
test('the list has 60 ids, none repeated', () => {
  const ids = buildList(library(), seeded());
  assert.equal(ids.length, PULSO.COUNT);
  assert.equal(new Set(ids).size, 60);
});

test('every puzzle comes from the band of its own target rating', () => {
  const lib = library();
  const byId = new Map(lib.map(p => [p.id, p]));
  const ids = buildList(lib, seeded(7));
  ids.forEach((id, i) => {
    const [lo, hi] = BANDS[bandOfIndex(i)];
    const r = byId.get(id).rating;
    assert.ok(r >= lo && r <= hi, `puzzle ${i} rated ${r} is outside ${lo}-${hi}`);
  });
});

test('with enough to choose from, every puzzle is within 50 points of its target', () => {
  const lib = library(2000);      // 10 per rating point: the 50-point window always holds 30+
  const byId = new Map(lib.map(p => [p.id, p]));
  buildList(lib, seeded(3)).forEach((id, i) => {
    assert.ok(Math.abs(byId.get(id).rating - targetRating(i)) <= 50, `puzzle ${i}`);
  });
});

test('the choice is spread evenly, not the same closest few every time', () => {
  const lib = library(2000);
  const firsts = new Set();
  const rnd = seeded(11);
  for (let n = 0; n < 40; n++) firsts.add(buildList(lib, rnd)[0]);
  assert.ok(firsts.size > 20, `only ${firsts.size} different first puzzles in 40 lists`);
});

test('a thin window doubles, as in Rush, but never leaves the band', () => {
  // 40 puzzles per band = one every 5 points: 50 points either side of 800
  // holds only 11 inside the band, so the window has to widen.
  const lib = library(40);
  const byId = new Map(lib.map(p => [p.id, p]));
  const ids = buildList(lib, seeded(5));
  assert.equal(new Set(ids).size, 60);
  ids.forEach((id, i) => {
    const [lo, hi] = BANDS[bandOfIndex(i)];
    assert.ok(byId.get(id).rating >= lo && byId.get(id).rating <= hi);
  });
});

test('a band too thin to fill gives no list at all, never a repeat', () => {
  // Band 6 is asked for 26 puzzles (indexes 34 to 59). Give it 25.
  const lib = [...library(400, [1, 2, 3, 4, 5]), ...library(25, [6])];
  assert.equal(buildList(lib, seeded()), null);
  // 26 is exactly enough.
  const ok = buildList([...library(400, [1, 2, 3, 4, 5]), ...library(26, [6])], seeded());
  assert.equal(new Set(ok).size, 60);
});

test('a band that is not loaded gives no list', () => {
  assert.equal(buildList(library(400, [1, 2, 3, 4, 5]), seeded()), null);
  assert.equal(buildList([], seeded()), null);
});

test('a puzzle whose id is not five letters or digits is never picked', () => {
  const lib = library();
  lib.push({ id: 'toolong', rating: 800 }, { id: 'ab_cd', rating: 800 }, { id: 'abcd', rating: 800 });
  const rnd = seeded(2);
  for (let n = 0; n < 20; n++) {
    for (const id of buildList(lib, rnd)) assert.match(id, /^[A-Za-z0-9]{5}$/);
  }
});

// ── pz: 60 ids in one 300-character string ────────────────────────────────
test('packing gives the 300 characters the rules ask for, and unpacking gives the ids back', () => {
  const ids = buildList(library(), seeded());
  const pz = packIds(ids);
  assert.equal(pz.length, 300);
  assert.match(pz, /^[A-Za-z0-9]{300}$/);
  assert.deepEqual(unpackIds(pz), ids);
});

test('packing refuses a short list, a wrong-length id and a repeated id', () => {
  const ids = buildList(library(), seeded());
  assert.equal(packIds(ids.slice(0, 59)), null);
  assert.equal(packIds([...ids.slice(0, 59), 'abcdef']), null);
  assert.equal(packIds([...ids.slice(0, 59), 'ab-cd']), null);
  assert.equal(packIds([...ids.slice(0, 59), ids[0]]), null);
  assert.equal(packIds(null), null);
});

test('unpacking refuses anything that is not exactly 300 letters and digits', () => {
  assert.equal(unpackIds('a'.repeat(299)), null);
  assert.equal(unpackIds('a'.repeat(301)), null);
  assert.equal(unpackIds('a'.repeat(299) + '-'), null);
  assert.equal(unpackIds(null), null);
  assert.equal(unpackIds(undefined), null);
});

test('puzzle i is found from pz, first and last included', () => {
  const lib = library();
  const ids = buildList(lib, seeded(9));
  const pz = packIds(ids);
  assert.equal(idAt(pz, 0), ids[0]);
  assert.equal(idAt(pz, 59), ids[59]);
  assert.equal(puzzleAt(pz, 0, lib).id, ids[0]);
  assert.equal(puzzleAt(pz, 59, lib).id, ids[59]);
  assert.equal(puzzleAt(pz, 33, lib).id, ids[33]);
});

test('there is no puzzle 60, and no puzzle -1', () => {
  const lib = library();
  const pz = packIds(buildList(lib, seeded()));
  assert.equal(idAt(pz, 60), null);
  assert.equal(idAt(pz, -1), null);
  assert.equal(puzzleAt(pz, 60, lib), null);
});

test('a missing id is reported, not skipped: the other phone has different files', () => {
  const lib = library();
  const ids = buildList(lib, seeded(4));
  const pz = packIds(ids);
  const theirs = lib.filter(p => p.id !== ids[17]);
  assert.equal(puzzleAt(pz, 17, theirs), null);
  assert.equal(puzzleAt(pz, 16, theirs).id, ids[16]);
  assert.equal(resolveList(pz, theirs), null);
  assert.deepEqual(resolveList(pz, lib).map(p => p.id), ids);
});

test('an id that exists but in the wrong band counts as missing', () => {
  // The band is how the friend's phone knows which file to open, so a puzzle
  // that has moved band between two versions of the app is a mismatch too.
  const lib = library();
  const ids = buildList(lib, seeded(6));
  const pz = packIds(ids);
  const moved = lib.map(p => p.id === ids[0] ? { ...p, rating: 1500 } : p);
  assert.equal(puzzleAt(pz, 0, moved), null);
  assert.equal(resolveList(pz, moved), null);
});

// ── The pull ──────────────────────────────────────────────────────────────
test('a solve pulls 1 step and adds to the streak', () => {
  assert.deepEqual(applySolve(ZERO), { S: 1, M: 0, K: 1, P: 1 });
  assert.deepEqual(applySolve({ S: 1, M: 0, K: 1, P: 1 }), { S: 2, M: 0, K: 2, P: 2 });
});

test('from the third solve in a row every solve pulls 2', () => {
  assert.deepEqual(applySolve({ S: 2, M: 0, K: 2, P: 2 }), { S: 3, M: 0, K: 3, P: 4 });
  assert.deepEqual(applySolve({ S: 3, M: 0, K: 3, P: 4 }), { S: 4, M: 0, K: 4, P: 6 });
});

test('a mistake gives back 1 step and ends the streak; the pull may go below zero', () => {
  assert.deepEqual(applyMistake({ S: 3, M: 0, K: 3, P: 4 }), { S: 3, M: 1, K: 0, P: 3 });
  assert.deepEqual(applyMistake(ZERO), { S: 0, M: 1, K: 0, P: -1 });
});

test('after a mistake the streak has to be earned again', () => {
  let c = { S: 5, M: 0, K: 5, P: 8 };
  c = applyMistake(c);
  c = applySolve(c); assert.equal(c.P, 8);     // +1
  c = applySolve(c); assert.equal(c.P, 9);     // +1
  c = applySolve(c); assert.equal(c.P, 11);    // +2
});

test('six solves in a row are worth 10 steps: the whole bar', () => {
  let c = ZERO;
  for (let n = 0; n < 6; n++) c = applySolve(c);
  assert.equal(c.P, PULSO.WIN);
});

test('nobody goes past puzzle 60', () => {
  assert.equal(applySolve({ S: 50, M: 10, K: 0, P: 40 }), null);
  assert.equal(applyMistake({ S: 50, M: 10, K: 0, P: 40 }), null);
  assert.deepEqual(applySolve({ S: 50, M: 9, K: 0, P: 40 }), { S: 51, M: 9, K: 1, P: 41 });
});

test('the rules check: +2 is refused without a streak', () => {
  assert.equal(stepOk([0, 0, 0, 0], [1, 0, 1, 2]), false);
  assert.equal(stepOk([1, 0, 1, 1], [2, 0, 2, 3]), false);
  assert.equal(stepOk([2, 0, 2, 2], [3, 0, 3, 4]), true);
  // ...and +1 is refused once the streak is on.
  assert.equal(stepOk([2, 0, 2, 2], [3, 0, 3, 3]), false);
});

test('the rules check: one attempt per write, a solve or a mistake, never both', () => {
  assert.equal(stepOk([0, 0, 0, 0], [2, 0, 2, 2]), false);     // two solves at once
  assert.equal(stepOk([0, 0, 0, 0], [1, 1, 0, 0]), false);     // a solve and a mistake
  assert.equal(stepOk([3, 0, 3, 4], [3, 1, 3, 3]), false);     // a mistake that keeps the streak
  assert.equal(stepOk([3, 0, 3, 4], [3, 1, 0, 4]), false);     // a mistake that gives no ground
  assert.equal(stepOk([0, 0, 0, 0], [0, 0, 0, 0]), false);     // nothing
  assert.equal(stepOk([50, 10, 0, 40], [51, 10, 1, 41]), false); // puzzle 61
});

test('whatever is played, applySolve and applyMistake only produce steps the rules accept', () => {
  const rnd = seeded(13);
  for (let run = 0; run < 200; run++) {
    let c = ZERO;
    for (;;) {
      const n = rnd() < 0.7 ? applySolve(c) : applyMistake(c);
      if (!n) break;
      assert.ok(stepOk(arr(c), arr(n)), `${JSON.stringify(c)} -> ${JSON.stringify(n)}`);
      c = n;
    }
    assert.equal(c.S + c.M, 60);
  }
});

// ── The marker ────────────────────────────────────────────────────────────
test('the marker sits at my pull minus yours, seen from my side', () => {
  assert.equal(markerPos(4, 1), 3);
  assert.equal(markerPos(1, 4), -3);
  assert.equal(markerPos(0, 0), 0);
  assert.equal(markerPos(-2, -5), 3);
});

test('the marker stops at the end of the bar', () => {
  assert.equal(markerPos(13, 2), 10);    // a +2 can overshoot
  assert.equal(markerPos(2, 13), -10);
});

// ── The result ────────────────────────────────────────────────────────────
const at = (aP, bP, aM = 0, bM = 0) => ({ aP, bP, aM, bM });

test('pull: 10 steps ahead wins at once, for either player, with time still on the clock', () => {
  assert.deepEqual(decideResult(at(10, 0), false), { winner: 'a', reason: 'pull' });
  assert.deepEqual(decideResult(at(3, 14), false), { winner: 'b', reason: 'pull' });
  assert.deepEqual(decideResult(at(12, 1), false), { winner: 'a', reason: 'pull' });
});

test('9 steps ahead is not a win while the clock runs', () => {
  assert.equal(decideResult(at(9, 0), false), null);
  assert.equal(decideResult(at(0, 9), false), null);
  assert.equal(decideResult(at(0, 0), false), null);
});

test('a full pull is still a pull after the clock has run out', () => {
  assert.deepEqual(decideResult(at(10, 0), true), { winner: 'a', reason: 'pull' });
});

test('time: whoever has the marker on their side', () => {
  assert.deepEqual(decideResult(at(5, 4), true), { winner: 'a', reason: 'time' });
  assert.deepEqual(decideResult(at(-1, 0), true), { winner: 'b', reason: 'time' });
});

test('time, marker dead centre: fewer mistakes wins', () => {
  assert.deepEqual(decideResult(at(6, 6, 1, 2), true), { winner: 'a', reason: 'time' });
  assert.deepEqual(decideResult(at(6, 6, 3, 2), true), { winner: 'b', reason: 'time' });
});

test('time, level on the bar and on mistakes: a draw', () => {
  assert.deepEqual(decideResult(at(6, 6, 2, 2), true), { winner: 'draw', reason: 'time' });
  assert.deepEqual(decideResult(at(0, 0), true), { winner: 'draw', reason: 'time' });
});

test('mistakes only matter when the bar is level', () => {
  assert.equal(timeWinner(at(5, 4, 9, 0)), 'a');
  assert.equal(timeWinner(at(4, 5, 0, 9)), 'b');
});

// ── The clock ─────────────────────────────────────────────────────────────
test('clock offset is the server stamp minus the midpoint of sent and confirmed', () => {
  assert.equal(clockOffset(10_500, 10_000, 10_400), 300);     // phone 300 ms behind
  assert.equal(clockOffset(9_000, 10_000, 10_400), -1_200);   // phone ahead
});

test('the clock numbers are the ones in the rules', () => {
  assert.equal(PULSO.COUNTDOWN_MS, 6_000);
  assert.equal(PULSO.COUNTDOWN_MS + PULSO.PLAY_MS, 186_000);
  assert.equal(PULSO.COUNTDOWN_MS + PULSO.PLAY_MS + PULSO.GRACE_MS, 189_000);
  assert.equal(PULSO.INVITE_MS, 300_000);
  assert.equal(PULSO.ABANDONED_MS, 196_000);
});
