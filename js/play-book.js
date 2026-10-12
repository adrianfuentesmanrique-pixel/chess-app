// How the Play engine chooses its OPENING moves (its first OPENING_MOVES moves
// of a game from the normal starting position). Imports only the opening list,
// so it runs under Node for the unit tests and tools/measure-opening.mjs.
//
// Why this exists: measured on 2026-10-11, the strength-limited Stockfish gave
// away 270-430 centipawns in its first 12 moves at EVERY level below the top
// one, pieces included, while the same engine at full strength lost 35-57 even
// with 60 ms. The limiter was the cause, not the thinking time.
//
//  1. BOOK: while the game follows a line of openings-eco.js, play a move from
//     it, picked at random among the lines that go on from here.
//  2. GUARD: out of the book, the engine searches at FULL strength for its few
//     best moves and one within the level's margin of the best is picked. A
//     weak level still plays second-rate moves; no level drops a piece.
//  3. After OPENING_MOVES the caller goes back to the limited engine.
import { OPENINGS_ECO } from './openings-eco.js';

export const OPENING_MOVES = 12;   // the engine's own moves, not plies
export const GUARD_LINES = 4;      // how many best moves the guard looks at

// The most a level may give up on ONE guarded move, in centipawns, by LEVELS
// index. The top level (index 7) is not limited at all and never comes here.
const GUARD_MARGIN = [90, 80, 65, 50, 40, 30, 20, 0];
// Once the engine stands this much worse it stops choosing second-best moves:
// small slips must not add up to a lost game before the opening is over.
const GUARD_FLOOR = [-150, -130, -110, -90, -70, -60, -50, 0];

export function guardMargin(level) { return GUARD_MARGIN[level] ?? 0; }
export function guardFloor(level) { return GUARD_FLOOR[level] ?? 0; }

const norm = san => san.replace(/[+#]$/, '');

// position (the moves so far, joined) -> Map(next move -> how many lines play it)
const BOOK = new Map();
for (const e of OPENINGS_ECO) {
  for (let i = 0; i < e.moves.length; i++) {
    const key = e.moves.slice(0, i).join(' ');
    if (!BOOK.has(key)) BOOK.set(key, new Map());
    const next = BOOK.get(key);
    next.set(e.moves[i], (next.get(e.moves[i]) || 0) + 1);
  }
}

// A book move for the side to move, or null when the game has left the list.
// Moves that several lines play are likelier. A move only ONE line plays is
// left out while a better-trodden one exists, so the engine does not open
// 1.g4 because the Grob has a name.
export function pickBookMove(sanHistory, rnd = Math.random) {
  const next = BOOK.get(sanHistory.map(norm).join(' '));
  if (!next) return null;
  let moves = [...next.entries()];
  if (moves.some(([, n]) => n > 1)) moves = moves.filter(([, n]) => n > 1);
  const total = moves.reduce((s, [, n]) => s + n, 0);
  let roll = rnd() * total;
  for (const [san, n] of moves) { roll -= n; if (roll < 0) return san; }
  return moves[moves.length - 1][0];
}

// The guard's choice among the engine's best moves. `lines` is
// [{ uci, score }], score in centipawns for the side to move. Every move
// within `margin` of the best can be played, the better ones more often.
export function pickGuarded(lines, margin, floor = -Infinity, rnd = Math.random) {
  const ok = (lines || []).filter(l => l && l.uci && Number.isFinite(l.score));
  if (!ok.length) return null;
  const best = ok.reduce((a, b) => (b.score > a.score ? b : a));
  if (margin <= 0 || best.score < floor) return best.uci;
  const near = ok.filter(l => best.score - l.score <= margin && l.score >= floor);
  if (!near.length) return best.uci;
  const weight = l => margin - (best.score - l.score) + margin / 4;
  const total = near.reduce((s, l) => s + weight(l), 0);
  let roll = rnd() * total;
  for (const l of near) { roll -= weight(l); if (roll < 0) return l.uci; }
  return near[near.length - 1].uci;
}

// The engine's opening move, or null when the caller should ask the limited
// engine as before (opening over, top level out of book, or the search failed).
//   sans      the game so far in SAN, from the normal starting position
//   level     LEVELS index
//   topMoves  async (count) => [{ uci, score }], a full-strength search
// Returns { san, book: true } or { uci, book: false }.
export async function openingMove({ sans, level, topMoves, rnd = Math.random }) {
  if (Math.floor(sans.length / 2) >= OPENING_MOVES) return null;
  const san = pickBookMove(sans, rnd);
  if (san) return { san, book: true };
  const margin = guardMargin(level);
  if (margin <= 0) return null;
  const uci = pickGuarded(await topMoves(GUARD_LINES), margin, guardFloor(level), rnd);
  return uci ? { uci, book: false } : null;
}
