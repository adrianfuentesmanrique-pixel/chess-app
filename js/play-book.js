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
//  3. After OPENING_MOVES, `playMove` below (the rest of the game).
//
// THE REST OF THE GAME, measured on 2026-10-12 over 312 whole games
// (tools/measure-game.mjs): left alone, the limiter went on giving pieces away.
// "Expert" threw a queen or walked into a mate from a level game in one game in
// seven, and levels 3 to 6 were nearly the same player.
//  - Levels 1 to 5 (VETO): the limiter still chooses, so the play stays varied,
//    but a full-strength search looks at the same position at the same time and
//    a move that costs more than the level may give away is refused. A weak
//    level is let off now and then, so it still drops a piece; no level throws
//    a queen away or walks into a short mate.
//  - Levels 6 and 7 (PLAY_MARGIN): the guard for the whole game.
//  - Level 8: the engine at full strength, as before.
import { OPENINGS_ECO } from './openings-eco.js';

export const OPENING_MOVES = 12;   // the engine's own moves, not plies
export const GUARD_LINES = 4;      // how many best moves the guard looks at

// The most a level may give up on ONE guarded move, in centipawns, by LEVELS
// index. The top level (index 7) is not limited at all and never comes here.
const GUARD_MARGIN = [90, 80, 65, 50, 40, 30, 20, 0];
// Once the engine stands this much worse it stops choosing second-best moves:
// small slips must not add up to a lost game before the opening is over.
const GUARD_FLOOR = [-150, -130, -110, -90, -70, -60, -50, 0];

// After the opening, by LEVELS index. `refuse`: the most the limiter's move may
// cost, in centipawns. `through`: how often a move that costs more is played
// anyway, while it costs less than THROUGH_MAX (a piece goes, a queen does
// not). `margin`: the guard's margin for the move played instead.
const VETO = [
  { refuse: 280, through: 0.5, margin: 90 },
  { refuse: 240, through: 0.45, margin: 80 },
  { refuse: 190, through: 0.25, margin: 65 },
  { refuse: 160, through: 0.15, margin: 50 },
  { refuse: 120, through: 0, margin: 40 },
];
export const THROUGH_MAX = 600;
// Levels that play the guard for the whole game, and their margin.
const PLAY_MARGIN = { 5: 90, 6: 35 };

export function vetoRule(level) { return VETO[level] || null; }
export function playMargin(level) { return PLAY_MARGIN[level] || 0; }
// Does this level keep its second engine after the opening?
export function usesGuardAllGame(level) { return !!(VETO[level] || PLAY_MARGIN[level]); }

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

// The engine's move once the opening is over (or from a set-up position), or
// null when the caller should ask the engine itself (the top level, or nothing
// here could be searched).
//   level       LEVELS index
//   limited     async () => uci, the strength-limited engine's own choice
//   topMoves    async (count) => [{ uci, score }], a full-strength search of
//               this position on ANOTHER engine, so both run at the same time
//   scoreAfter  async (uci) => the mover's score once that move is played, for
//               a move the search did not list; null when it cannot say
export async function playMove({ level, limited, topMoves, scoreAfter, rnd = Math.random }) {
  const margin = playMargin(level);
  if (margin) return pickGuarded(await topMoves(GUARD_LINES).catch(() => null), margin, -Infinity, rnd);
  const rule = vetoRule(level);
  if (!rule) return null;
  const [uci, found] = await Promise.all([limited(), topMoves(GUARD_LINES).catch(() => null)]);
  const lines = (found || []).filter(l => l && l.uci && Number.isFinite(l.score));
  if (!uci) return lines.length ? pickGuarded(lines, rule.margin, -Infinity, rnd) : null;
  if (!lines.length) return uci;
  const best = lines.reduce((a, b) => (b.score > a.score ? b : a));
  const listed = lines.find(l => l.uci === uci);
  let cost;
  if (listed) cost = best.score - listed.score;
  else {
    const after = scoreAfter ? await scoreAfter(uci).catch(() => null) : null;
    cost = Number.isFinite(after) ? best.score - after : 0;
  }
  if (cost <= rule.refuse) return uci;
  if (cost < THROUGH_MAX && rnd() < rule.through) return uci;
  return pickGuarded(lines, rule.margin, -Infinity, rnd);
}
