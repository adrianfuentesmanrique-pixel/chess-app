// Pulso — the pure half: which 60 puzzles a match uses, what a solve and a
// mistake do to the bar, and who has won. No DOM, no Firestore, no clock of its
// own: everything is passed in, so tests/unit/pulso.test.js runs it under plain
// Node. The writes are in js/firebase.js (the Pulso section).
//
// THE REFEREE IS firestore.rules (the `pulso/{pairId}` block). Every number and
// every comparison here is a copy of something there; if the two ever disagree
// the rules win and a write is refused. Spec:
// docs/superpowers/plans/2026-10-pulso.md, sections 3 to 5.
import { BANDS, bandOf } from './puzzles.js';

export const PULSO = {
  COUNT: 60,              // puzzles in a match
  ID_LEN: 5,              // every puzzle id is exactly this long
  WIN: 10,                // steps from the centre to either end of the bar
  // All counted from startAt, in SERVER time.
  COUNTDOWN_MS: 6_000,    // play begins at startAt + 6 s
  PLAY_MS: 180_000,       // and lasts 3 minutes
  GRACE_MS: 3_000,        // moves still in the air are taken for 3 s more
  ABANDONED_MS: 196_000,  // a match nobody closed can be replaced from here
  // Counted from invitedAt.
  INVITE_MS: 300_000,     // a challenge waits 5 minutes
};

const ID_RE = /^[A-Za-z0-9]{5}$/;
const PZ_RE = /^[A-Za-z0-9]{300}$/;

// ── The ramp ──────────────────────────────────────────────────────────────
// Harder by POSITION in the list, never by score, so the list is the same for
// both players whatever either of them does.
export function targetRating(i) {
  return Math.min(1950, 800 + 30 * i);
}

// The rating band puzzle i is drawn from — and so the file the friend's phone
// finds it in, known from i alone.
export function bandOfIndex(i) {
  return bandOf(targetRating(i));
}

// The files both phones must have loaded before the clock starts. The cap is
// 1950 rather than 2000 so this stops at band 6.
export function bandsNeeded() {
  const out = [];
  for (let i = 0; i < PULSO.COUNT; i++) {
    const b = bandOfIndex(i);
    if (!out.includes(b)) out.push(b);
  }
  return out;
}

// ── The list ──────────────────────────────────────────────────────────────
// 60 ids, picked the way Rush.pickNext() picks one (js/app.js): evenly from
// every puzzle within 50 points of the target, the window doubling while it
// holds fewer than 30. Two differences, both on purpose:
//   - only puzzles inside the target's own band, so the band follows from i;
//   - never a repeat. Rush starts its used-list again when it runs dry; here a
//     band too thin to fill gives null and no match is offered.
// `puzzles` is whatever is loaded (PUZZLES); `rnd` is Math.random in the app.
export function buildList(puzzles, rnd = Math.random) {
  const byBand = new Map();
  for (const p of puzzles || []) {
    if (!p || !ID_RE.test(p.id)) continue;
    const b = bandOf(p.rating);
    if (!byBand.has(b)) byBand.set(b, []);
    byBand.get(b).push(p);
  }
  const used = new Set();
  const ids = [];
  for (let i = 0; i < PULSO.COUNT; i++) {
    const target = targetRating(i);
    const candidates = (byBand.get(bandOfIndex(i)) || []).filter(p => !used.has(p.id));
    let top = [];
    for (let w = 50; top.length < 30 && w <= 3200; w *= 2) top = candidates.filter(p => Math.abs(p.rating - target) <= w);
    if (!top.length) return null;
    const pick = top[Math.floor(rnd() * top.length)];
    used.add(pick.id);
    ids.push(pick.id);
  }
  return ids;
}

// ── pz ────────────────────────────────────────────────────────────────────
// The 60 ids joined with nothing between them: the 300 characters the rules
// check with one pattern. null rather than a string the rules would refuse.
export function packIds(ids) {
  if (!Array.isArray(ids) || ids.length !== PULSO.COUNT) return null;
  if (!ids.every(id => ID_RE.test(id)) || new Set(ids).size !== ids.length) return null;
  return ids.join('');
}

export function unpackIds(pz) {
  if (typeof pz !== 'string' || !PZ_RE.test(pz)) return null;
  const ids = [];
  for (let i = 0; i < PULSO.COUNT; i++) ids.push(pz.slice(i * PULSO.ID_LEN, (i + 1) * PULSO.ID_LEN));
  return ids;
}

export function idAt(pz, i) {
  if (typeof pz !== 'string' || !PZ_RE.test(pz)) return null;
  if (!Number.isInteger(i) || i < 0 || i >= PULSO.COUNT) return null;
  return pz.slice(i * PULSO.ID_LEN, (i + 1) * PULSO.ID_LEN);
}

// Puzzle i of the match, or null when this phone does not have it. It has to
// be in the band its position says: that is the file the phone loaded for it,
// so a puzzle that sits in another band here is a different library.
export function puzzleAt(pz, i, puzzles) {
  const id = idAt(pz, i);
  if (!id) return null;
  const [lo, hi] = BANDS[bandOfIndex(i)];
  return (puzzles || []).find(p => p.id === id && p.rating >= lo && p.rating <= hi) || null;
}

// All 60 at once — the check both phones make before the clock starts. null if
// even one is missing ("one of you needs to update the app").
export function resolveList(pz, puzzles) {
  const ids = unpackIds(pz);
  if (!ids) return null;
  const byId = new Map();
  for (const p of puzzles || []) if (p) byId.set(p.id, p);
  const out = [];
  for (let i = 0; i < ids.length; i++) {
    const p = byId.get(ids[i]);
    const [lo, hi] = BANDS[bandOfIndex(i)];
    if (!p || p.rating < lo || p.rating > hi) return null;
    out.push(p);
  }
  return out;
}

// ── The pull ──────────────────────────────────────────────────────────────
// One player's four counters: S solved, M mistakes, K streak, P pull. Each
// returns the counters after the attempt, or null when there is no puzzle left
// to attempt (S + M is already 60).

// 1 step; 2 once the two solves before this one were also solves.
export function applySolve(c) {
  if (c.S + c.M >= PULSO.COUNT) return null;
  return { S: c.S + 1, M: c.M, K: c.K + 1, P: c.P + (c.K < 2 ? 1 : 2) };
}

// Gives back 1 step and ends the streak. The pull may go below zero.
export function applyMistake(c) {
  if (c.S + c.M >= PULSO.COUNT) return null;
  return { S: c.S, M: c.M + 1, K: 0, P: c.P - 1 };
}

// pulsoStepOk from firestore.rules, line for line: o and n are one player's
// [solved, mistakes, streak, pull] before and after one write.
export function stepOk(o, n) {
  return n[0] + n[1] <= 60
    && ((n[0] === o[0] + 1 && n[1] === o[1] && n[2] === o[2] + 1
         && n[3] === o[3] + (o[2] < 2 ? 1 : 2))
        || (n[1] === o[1] + 1 && n[0] === o[0] && n[2] === 0 && n[3] === o[3] - 1));
}

// ── The marker ────────────────────────────────────────────────────────────
// Never stored. Seen from MY side: +10 is my end, -10 is the friend's. A
// 2-step pull can carry the difference past 10; the marker stops at the end.
export function markerPos(myPull, theirPull) {
  return Math.max(-PULSO.WIN, Math.min(PULSO.WIN, myPull - theirPull));
}

// ── The result ────────────────────────────────────────────────────────────
// pulsoTimeWinner from firestore.rules: the marker's side; level → fewer
// mistakes; still level → a draw. m needs aP, bP, aM, bM.
export function timeWinner(m) {
  return m.aP > m.bP ? 'a'
    : m.aP < m.bP ? 'b'
    : m.aM < m.bM ? 'a'
    : m.aM > m.bM ? 'b'
    : 'draw';
}

// What the stored counters say, or null while the match is still open. A full
// pull wins whenever it is seen, clock or no clock; otherwise nothing is
// decided until `timeUp` — startAt + 189 s in server time, the grace included.
// 'left' is not here: that one is a choice, not something the numbers show.
export function decideResult(m, timeUp) {
  const d = m.aP - m.bP;
  if (d >= PULSO.WIN) return { winner: 'a', reason: 'pull' };
  if (d <= -PULSO.WIN) return { winner: 'b', reason: 'pull' };
  if (timeUp) return { winner: timeWinner(m), reason: 'time' };
  return null;
}

// ── The clock ─────────────────────────────────────────────────────────────
// How far this phone's clock is from the server's, from one write the server
// stamped: the stamp minus the middle of "sent" and "confirmed" here. Add the
// result to Date.now() to get server time. Out by about half a round trip.
export function clockOffset(serverMs, sentMs, confirmedMs) {
  return serverMs - (sentMs + confirmedMs) / 2;
}
