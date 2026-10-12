// The clock for a game against the engine (Play).
//
// Pure: it imports nothing, starts no timer and never reads the time itself.
// Every function that needs "now" is handed it, in milliseconds. That is what
// lets tests/unit/play-clock.test.js run under plain Node, and it is also the
// rule that makes a locked phone honest: the time left is worked out from when
// the running side's clock was started, not counted down tick by tick, so a
// browser that stops ticking in the background loses nothing.
//
// Rush counts its own seconds down with a 1 s interval, and a Duel reads the
// server's clock (js/pulso-match.js). Neither has two sides or an increment.

// The choices on Play's setup screen. `base` is in seconds, `inc` in seconds
// added after each move. No clock is the default and is not in this list.
export const TIME_CONTROLS = Object.freeze([
  { id: '3+2', base: 180, inc: 2 },
  { id: '5+0', base: 300, inc: 0 },
  { id: '5+3', base: 300, inc: 3 },
  { id: '10+0', base: 600, inc: 0 },
  { id: '10+5', base: 600, inc: 5 },
  { id: '15+10', base: 900, inc: 10 },
].map(c => Object.freeze(c)));

export function controlById(id) {
  const c = TIME_CONTROLS.find(tc => tc.id === id);
  return c ? { ...c } : null;
}

// "5+3": minutes, then the seconds added per move. The same in every language.
export function controlLabel(c) { return `${c.base / 60}+${c.inc}`; }

// Under this a clock is shown in red, and the engine starts to hurry.
export const LOW_MS = 20000;

export function createClock({ base, inc = 0, turn = 'w' }) {
  return {
    left: { w: base * 1000, b: base * 1000 },
    incMs: inc * 1000,
    turn,          // whose clock runs
    since: null,   // when it started running; null while stopped
    flag: null,    // 'w' or 'b' once that side has run out
  };
}

export function startClock(c, now) {
  if (!c.flag) c.since = now;
  return c;
}

export function timeLeft(c, side, now) {
  const running = c.since !== null && side === c.turn;
  return Math.max(0, c.left[side] - (running ? now - c.since : 0));
}

// Who has run out of time, or null. Only the side to move can.
export function flagged(c, now) {
  if (c.flag) return c.flag;
  if (c.since === null) return null;
  return timeLeft(c, c.turn, now) <= 0 ? c.turn : null;
}

// Freezes both clocks where they are (the game is over, or was left).
export function stopClock(c, now) {
  if (c.since === null) return c;
  if (flagged(c, now)) c.flag = c.turn;
  c.left[c.turn] = timeLeft(c, c.turn, now);
  c.since = null;
  return c;
}

// The side to move has moved. Returns the side whose flag is down, or null.
// A move made after the time had gone does not count: no increment, the turn
// does not pass, and the clock stops with the flag down.
export function pressClock(c, now) {
  if (c.flag) return c.flag;
  if (c.since === null) return null;
  if (flagged(c, now)) { stopClock(c, now); return c.flag; }
  c.left[c.turn] = timeLeft(c, c.turn, now) + c.incMs;
  c.turn = c.turn === 'w' ? 'b' : 'w';
  c.since = now;
  return null;
}

// Rounded up, so a clock that still has a fraction of a second never reads
// 0:00: that is shown only when the flag is down.
export function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// How long the engine may search on this move. Its level's own time is what
// sets its strength, so that is kept for as long as there is time in hand; only
// with a twentieth of the clock smaller than that does it think for less.
export function thinkTime(movetime, leftMs) {
  return Math.max(50, Math.min(movetime, Math.floor(leftMs / 20)));
}

// Does `side` have a king and nothing else? Read from the FEN's board field.
export function bareKing(fen, side) {
  const board = fen.split(' ')[0].replace(/[\d/]/g, '');
  const mine = [...board].filter(ch => (ch === ch.toUpperCase()) === (side === 'w'));
  return mine.length === 1;
}

// The result of a game that ended on the clock. Running out of time loses,
// unless the side that still has time has only a king and so could never have
// given mate: then it is a draw.
export function flagOutcome({ flag, playerColor, fen }) {
  const other = flag === 'w' ? 'b' : 'w';
  if (bareKing(fen, other)) return { result: '1/2-1/2', outcome: 'draw' };
  return { result: other === 'w' ? '1-0' : '0-1', outcome: flag === playerColor ? 'loss' : 'win' };
}
