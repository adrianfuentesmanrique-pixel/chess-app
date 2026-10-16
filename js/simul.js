// Simul — the pure half: the start position of a board, the opening played on
// it, the packed moves, whose turn it is, the clock, how a game ends, which
// board the teacher sees next. No DOM, no Firestore, no clock of its own:
// everything is passed in, so tests/unit/simul.test.js runs it under plain
// Node. Spec: docs/superpowers/specs/2026-10-11-students-simul-design.md,
// sections 3d, 3f, 3g, 3i and 3k.
//
// THE DOCUMENT — simulGames/{teacherUid}_{studentUid}, one per pair, reused for
// every simul. These names are the contract the rules are written against.
//
//   t, s        the teacher's uid, the student's uid
//   cls         uids of every student invited to this simul (at most 10)
//   status      'invited' | 'joined' | 'live' | 'done' | 'out'
//   invitedAt   server stamp of the invitation
//   startAt     server stamp of Start; null before it
//   at          server stamp of the last move; startAt until the first one
//   prevAt      server stamp of the move before that; startAt until the second
//   fen         the start position, handicap applied, BEFORE the opening.
//               White is always to move in it.
//   op          the opening, packed like mv: '' or up to 40 moves
//   tc          the teacher's colour, 'w' | 'b'
//   base, inc   the clock in seconds; base 0 is "no clock"
//   tMs, sMs    time left in ms, teacher and student, settled up to the move
//               BEFORE the last one (see "The clock" below)
//   mv          the game's moves after the opening, five characters each, only
//               ever added to
//   n           how many moves mv holds
//   draw        who has a draw offer standing: null | 't' | 's'
//   tDr, sDr    n when each last offered a draw; -1 if never
//   winner      null | 't' | 's' | 'draw'
//   reason      null | 'mate' | 'stalemate' | 'repetition' | 'fifty' |
//               'material' | 'resign' | 'agreed' | 'flag' | 'void' | 'unfinished'
//   by          who voided the board: null | 't' | 's'
//
// Every function here that takes a game `g` takes that document with its
// stamps already turned into milliseconds (Timestamp.toMillis()).
import { Chess, validateFen } from '../vendor/chess.js';
import { START_FEN } from './tree.js';
import { clockOffset } from './pulso.js';

// Server time minus this phone's time, from one stamped write. Duel's, not a
// second one: add it to Date.now() for the `nowMs` the clock functions take.
export { clockOffset };

export const MAX_SIMUL_BOARDS = 10;

export const SIMUL = {
  MAX_BOARDS: MAX_SIMUL_BOARDS,
  // Seconds each, and seconds added after every move.
  CLOCKS: [
    { base: 600, inc: 5 },
    { base: 900, inc: 10 },
    { base: 1800, inc: 20 },
    { base: 3600, inc: 30 },
  ],
  NO_CLOCK: { base: 0, inc: 0 },
  // The teacher's extra time on every board: 0 to 60 minutes in steps of 5,
  // the app suggesting 2 minutes a board.
  EXTRA_MAX_S: 3600,
  EXTRA_STEP_S: 300,
  EXTRA_PER_BOARD_S: 120,
  INVITE_MS: 600_000,        // an invitation waits 10 minutes, from invitedAt
  ABANDONED_MS: 10_800_000,  // a simul nobody closed can be replaced 3 hours after startAt
  DRAW_GAP_MOVES: 10,        // one draw offer per player per 10 moves (20 single moves)
  OPENING_MAX_MOVES: 20,     // by each side
  MOVE_LEN: 5,
  // One packed move: from, to, then the promotion piece or '-'. The rules
  // match mv and op with this, repeated.
  MOVE_PATTERN: '[a-h][1-8][a-h][1-8][qrbn-]',
};

const SQ_RE = /^[a-h][1-8]$/;
const MOVES_RE = new RegExp(`^(?:${SIMUL.MOVE_PATTERN})*$`);
const FILES = 'abcdefgh';
// The endings the chess library decides; the rest are choices or the clock.
const BOARD_REASONS = ['mate', 'stalemate', 'repetition', 'fifty', 'material'];

const other = who => (who === 't' ? 's' : 't');
const flip = c => (c === 'w' ? 'b' : 'w');
const msKey = who => (who === 't' ? 'tMs' : 'sMs');

// ── The start position ────────────────────────────────────────────────────
// `squares` are the teacher's own squares to empty: any pawns and pieces, as
// many as they like, never the king. Takes away the castling right of a corner
// whose rook is gone: chess.js accepts `1NBQKBNR w KQkq` as written and would
// carry the wrong right into the saved game.
export function buildStart(tc, squares = []) {
  const bad = (reason, square) => ({ ok: false, reason, square });
  if (tc !== 'w' && tc !== 'b') return bad('colour', null);
  const rows = START_FEN.split(' ')[0].split('/')
    .map(r => r.replace(/\d/g, d => '.'.repeat(+d)).split(''));
  const removed = [];
  for (const sq of new Set(squares)) {
    if (typeof sq !== 'string' || !SQ_RE.test(sq)) return bad('square', sq);
    const r = 8 - +sq[1], f = FILES.indexOf(sq[0]);
    const p = rows[r][f];
    if (p === '.' || (p === p.toUpperCase()) !== (tc === 'w')) return bad('piece', sq);
    if (p.toLowerCase() === 'k') return bad('king', sq);
    rows[r][f] = '.';
    removed.push({ square: sq, type: p.toLowerCase() });
  }
  const placement = rows.map(r => r.join('').replace(/\.+/g, m => m.length)).join('/');
  const gone = sq => removed.some(x => x.square === sq);
  const rights = (gone('h1') ? '' : 'K') + (gone('a1') ? '' : 'Q')
    + (gone('h8') ? '' : 'k') + (gone('a8') ? '' : 'q');
  return { ok: true, fen: `${placement} w ${rights || '-'} - 0 1`, removed };
}

// The two stored clocks for a control and the teacher's extra seconds.
export function startClocks(clock, extraS = 0) {
  if (!clock || !clock.base) return { base: 0, inc: 0, tMs: 0, sMs: 0 };
  return { base: clock.base, inc: clock.inc, tMs: (clock.base + extraS) * 1000, sMs: clock.base * 1000 };
}

// ── Moves ─────────────────────────────────────────────────────────────────
// {from, to, promotion} → 'e2e4-' / 'e7e8q'. null for anything else.
export function packMove(m) {
  if (!m || !SQ_RE.test(m.from) || !SQ_RE.test(m.to)) return null;
  const p = m.promotion || '-';
  return 'qrbn-'.includes(p) && p.length === 1 ? m.from + m.to + p : null;
}

export function unpackMove(s) {
  if (typeof s !== 'string' || s.length !== SIMUL.MOVE_LEN || !MOVES_RE.test(s)) return null;
  const m = { from: s.slice(0, 2), to: s.slice(2, 4) };
  if (s[4] !== '-') m.promotion = s[4];
  return m;
}

export function unpackMoves(str) {
  if (typeof str !== 'string' || !MOVES_RE.test(str)) return null;
  const out = [];
  for (let i = 0; i < str.length; i += SIMUL.MOVE_LEN) out.push(unpackMove(str.slice(i, i + SIMUL.MOVE_LEN)));
  return out;
}

// Plays one packed move on `chess`. An illegal one leaves the board as it was.
export function tryMove(chess, packed) {
  const m = unpackMove(packed);
  if (!m) return { ok: false };
  let played;
  try { played = chess.move(m); } catch { return { ok: false }; }
  // The library lets a promotion letter ride on a move that is not one. One
  // move, one spelling: the string must be exactly what packMove makes of it.
  if (packMove(played) !== packed) { chess.undo(); return { ok: false }; }
  return { ok: true, san: played.san };
}

function replayPacked(chess, packed) {
  const sans = [];
  for (let i = 0; i < packed.length; i += SIMUL.MOVE_LEN) {
    const move = packed.slice(i, i + SIMUL.MOVE_LEN);
    const r = tryMove(chess, move);
    if (!r.ok) return { ok: false, index: i / SIMUL.MOVE_LEN, move };
    sans.push(r.san);
  }
  return { ok: true, sans };
}

// ── The opening ───────────────────────────────────────────────────────────
// Replays SAN moves on a start position. Either the position they lead to and
// the moves packed for `op`, or which move failed: `index` (0 is White's
// first), its `san`, and why — 'illegal' on this board, 'long' past 20 moves
// a side, 'over' if the line ends the game, 'fen' for a start position the
// library refuses.
export function replayOpening(startFen, sans = []) {
  let chess;
  try { chess = new Chess(startFen); } catch { return { ok: false, reason: 'fen', index: -1, san: null }; }
  const max = SIMUL.OPENING_MAX_MOVES * 2;
  if (sans.length > max) return { ok: false, reason: 'long', index: max, san: sans[max] };
  const played = [];
  let op = '';
  for (let i = 0; i < sans.length; i++) {
    let m;
    try { m = chess.move(sans[i]); } catch { return { ok: false, reason: 'illegal', index: i, san: sans[i] }; }
    played.push(m.san);
    op += packMove(m);
  }
  if (sans.length && boardResult(chess)) return { ok: false, reason: 'over', index: sans.length - 1, san: sans[sans.length - 1] };
  return { ok: true, fen: chess.fen(), op, sans: played };
}

// The same opening on a board with pieces missing. By squares (`op`, as the
// full board packed it), not by SAN: 'Nbd2' is the full board's spelling, and
// on a board without the g1 knight the library reads it as no move at all.
// `sans` are only there to name the move that fails. Same answers as
// replayOpening.
export function replayOpeningOn(startFen, op = '', sans = []) {
  let chess;
  try { chess = new Chess(startFen); } catch { return { ok: false, reason: 'fen', index: -1, san: null }; }
  const max = SIMUL.OPENING_MAX_MOVES * 2, n = Math.ceil(op.length / SIMUL.MOVE_LEN);
  if (n > max) return { ok: false, reason: 'long', index: max, san: sans[max] ?? null };
  const r = replayPacked(chess, op);
  if (!r.ok) return { ok: false, reason: 'illegal', index: r.index, san: sans[r.index] ?? null };
  if (n && boardResult(chess)) return { ok: false, reason: 'over', index: n - 1, san: sans[n - 1] ?? null };
  return { ok: true, fen: chess.fen(), op, sans: r.sans };
}

// A stored opening in SAN as the FULL board spells it, which is how the list
// of named openings spells it; as the board itself does if it cannot be played
// there. [] for none.
export function openingSans(fen, op = '') {
  if (typeof op !== 'string' || !op || !MOVES_RE.test(op)) return [];
  for (const start of [START_FEN, fen]) {
    try {
      const r = replayPacked(new Chess(start), op);
      if (r.ok) return r.sans;
    } catch {}
  }
  return [];
}

// ── The handicap ──────────────────────────────────────────────────────────
// A handicap is kept as WHITE's squares (a1, d1, e2), whatever colour the
// teacher has on that board, so it follows them when the colour changes: the
// queen stays the queen, the a-rook the a-rook.
export function mirrorSquare(sq) {
  return sq[0] + (9 - +sq[1]);
}
export function handicapSquares(tc, squares = []) {
  return tc === 'b' ? squares.map(mirrorSquare) : [...squares];
}

// What the teacher plays without on a stored board: [{ square, type }], the
// queen first, then rooks, bishops, knights and pawns, each from the a-file.
export function missingPieces(fen, tc) {
  const open = p => p.split('/').map(r => r.replace(/\d/g, d => '.'.repeat(+d)));
  const full = open(START_FEN.split(' ')[0]);
  const now = open(String(fen).split(' ')[0]);
  const out = [];
  for (const r of tc === 'b' ? [0, 1] : [6, 7]) {
    for (let f = 0; f < 8; f++) {
      if (now[r]?.[f] !== full[r][f]) out.push({ square: FILES[f] + (8 - r), type: full[r][f].toLowerCase() });
    }
  }
  const rank = x => 'qrbnp'.indexOf(x.type);
  return out.sort((a, b) => rank(a) - rank(b) || (a.square < b.square ? -1 : 1));
}

// ── The check a phone makes on a start position it is sent ────────────────
// The database cannot judge `fen` and `op`, so the student's phone does before
// it offers Join.
function openBoard(fen, op = '') {
  const bad = reason => ({ ok: false, reason });
  if (typeof fen !== 'string' || !validateFen(fen).ok) return bad('fen');
  const [placement, turn, rights] = fen.split(' ');
  if ((placement.match(/K/g) || []).length !== 1 || (placement.match(/k/g) || []).length !== 1) return bad('kings');
  let chess;
  try { chess = new Chess(fen); } catch { return bad('fen'); }
  // A castling right needs its king and its rook at home.
  const home = { K: ['e1', 'h1'], Q: ['e1', 'a1'], k: ['e8', 'h8'], q: ['e8', 'a8'] };
  for (const c of rights === '-' ? '' : rights) {
    const [k, r] = home[c].map(sq => chess.get(sq));
    const col = c === c.toUpperCase() ? 'w' : 'b';
    if (!k || k.type !== 'k' || k.color !== col || !r || r.type !== 'r' || r.color !== col) return bad('castling');
  }
  // The side that is NOT to move cannot be in check.
  const rows = chess.board();
  for (const row of rows) for (const p of row) {
    if (p && p.type === 'k' && p.color !== turn && chess.isAttacked(p.square, turn)) return bad('check');
  }
  if (boardResult(chess)) return bad('over');
  if (typeof op !== 'string' || !MOVES_RE.test(op) || op.length > SIMUL.OPENING_MAX_MOVES * 2 * SIMUL.MOVE_LEN) return bad('opening');
  const r = replayPacked(chess, op);
  if (!r.ok) return bad('opening');
  if (op && boardResult(chess)) return bad('over');
  return { ok: true, chess, sans: r.sans };
}

// { ok, fen, sans }: the position play starts from (after the opening) and
// the opening in SAN. Or { ok: false, reason }: 'fen', 'kings', 'castling',
// 'check', 'over' (already mate, stalemate or a dead draw), 'opening'.
export function checkStart(fen, op = '') {
  const b = openBoard(fen, op);
  return b.ok ? { ok: true, fen: b.chess.fen(), sans: b.sans } : b;
}

// ── Whose turn ────────────────────────────────────────────────────────────
// From the start position, the length of the opening and the move count.
export function colourToMove(g) {
  const start = g.fen.split(' ')[1];
  return (g.op.length / SIMUL.MOVE_LEN + g.n) % 2 === 0 ? start : flip(start);
}

export function roleOf(g, colour) {
  return colour === g.tc ? 't' : 's';
}

// 't' or 's'.
export function sideToMove(g) {
  return roleOf(g, colourToMove(g));
}

// ── The position ──────────────────────────────────────────────────────────
// The whole game replayed on one board: start position, opening, moves (the
// library needs all of it to see a repetition). { ok, chess, opening, sans },
// or { ok: false, where: 'start' | 'mv', ... }. `where: 'mv'` is the other
// side's impossible move at `index`: that is what voids a board (spec 3k).
export function positionOf(g) {
  const b = openBoard(g.fen, g.op);
  if (!b.ok) return { ok: false, where: 'start', reason: b.reason };
  if (typeof g.mv !== 'string' || !MOVES_RE.test(g.mv) || g.mv.length !== g.n * SIMUL.MOVE_LEN) {
    return { ok: false, where: 'mv', index: -1, move: null };
  }
  const r = replayPacked(b.chess, g.mv);
  if (!r.ok) return { ok: false, where: 'mv', index: r.index, move: r.move };
  return { ok: true, chess: b.chess, opening: b.sans, sans: r.sans };
}

// ── The clock ─────────────────────────────────────────────────────────────
// All of it is server time. Every move is stamped by the server (`at`), and
// what a move cost is the gap between two stamps, so the mover cannot write
// their own cost: the stamp does not exist yet. Instead EACH MOVE SETTLES THE
// MOVE BEFORE IT, from the two stamps already stored:
//
//   the one who moved last:  left = left - (at - prevAt) + inc
//   the one moving now:      unchanged
//   then prevAt = the old at, and at = this write's server stamp
//
// The first move of a game settles nothing: no move came before it. So tMs
// and sMs are always one move behind — the last move is never in them — and
// timeLeft() below adds it back for the screen.
//
// A move is in time when (server time of the write - at) is LESS than the
// mover's stored time; from the instant it is equal, the flag is down and the
// move is refused. So a stored time never reaches zero.

// tMs and sMs as `who`'s move must write them.
export function settle(g, who) {
  const out = { tMs: g.tMs, sMs: g.sMs };
  if (!g.base || g.n === 0) return out;
  const last = msKey(other(who));
  out[last] = g[last] - (g.at - g.prevAt) + g.inc * 1000;
  return out;
}

// What `who` sees on their clock or the other one, in ms, at server time
// `nowMs`. null when there is no clock.
export function timeLeft(g, who, nowMs) {
  if (!g.base) return null;
  const stored = g[msKey(who)];
  if (g.status !== 'live' && g.status !== 'done') return stored;
  if (who !== sideToMove(g)) return g.n === 0 ? stored : stored - (g.at - g.prevAt) + g.inc * 1000;
  if (g.status === 'done') return g.reason === 'flag' && g.winner !== who ? 0 : stored;
  return Math.max(0, stored - Math.max(0, nowMs - g.at));
}

// May `who` still move at server time `nowMs`? (Their turn is a separate
// question: sideToMove.)
export function inTime(g, who, nowMs) {
  return !g.base || nowMs - g.at < g[msKey(who)];
}

// Whose flag is down: the side to move, once its time is used up. null while
// it is not, and always when there is no clock or the game is not live.
export function flagged(g, nowMs) {
  if (g.status !== 'live' || !g.base) return null;
  const who = sideToMove(g);
  return inTime(g, who, nowMs) ? null : who;
}

// Either player may claim it, the loser included; nobody else.
export function mayClaimFlag(g, who, nowMs) {
  return (who === 't' || who === 's') && flagged(g, nowMs) !== null;
}

// The winner on a flag of `g`, the side to move being the one out of time:
// the other side, or 'draw' when the other side cannot mate (Adrian,
// 2026-10-15: a bare king, or a king and ONE knight or ONE bishop; two knights
// still win). Read from the position the stored moves reached, so the phones
// of both players come to the same answer. Moves that do not play give the
// plain flag; that board is voided anyway.
export function flagResult(g) {
  const out = sideToMove(g), winner = other(out);
  const p = positionOf(g);
  if (!p.ok) return winner;
  const colour = winner === 't' ? g.tc : flip(g.tc);
  const kept = p.chess.board().flat().filter(sq => sq && sq.color === colour && sq.type !== 'k');
  return kept.length === 0 || (kept.length === 1 && (kept[0].type === 'n' || kept[0].type === 'b')) ? 'draw' : winner;
}

// The fields `who`'s move writes, beside `at` (the server's stamp) and, when
// this move ends the game, status / winner / reason. null if it is not a live
// game, not their turn, or not a well-formed move. Whether the move is legal
// chess is tryMove's question, and whether it is in time is inTime's.
export function moveWrite(g, who, packed) {
  if (g.status !== 'live' || sideToMove(g) !== who || !unpackMove(packed)) return null;
  return {
    mv: g.mv + packed,
    n: g.n + 1,
    ...settle(g, who),
    prevAt: g.at,
    // An offer stands until the OTHER side moves; the offerer's own move
    // leaves it standing.
    draw: g.draw === who ? who : null,
  };
}

// ── Endings ───────────────────────────────────────────────────────────────
// What the board itself says: { winner: 'w' | 'b' | 'draw', reason }, or null
// while the game goes on.
export function boardResult(chess) {
  if (chess.isCheckmate()) return { winner: flip(chess.turn()), reason: 'mate' };
  if (chess.isStalemate()) return { winner: 'draw', reason: 'stalemate' };
  if (chess.isInsufficientMaterial()) return { winner: 'draw', reason: 'material' };
  if (chess.isThreefoldRepetition()) return { winner: 'draw', reason: 'repetition' };
  if (chess.isDrawByFiftyMoves()) return { winner: 'draw', reason: 'fifty' };
  return null;
}

// The result of a game: { winner: 't' | 's' | 'draw' | null, reason, by }.
// A finished game gives what is stored (resign, draw agreed, flag, void and
// "not finished" are choices or the clock, not something a position shows; the
// last two have no winner). A live one gives what the board says, which is
// what the phone that just moved must write. null: still being played, or not
// started.
export function resultOf(g, chess) {
  if (g.status === 'done') return { winner: g.winner, reason: g.reason, by: g.by ?? null };
  if (g.status !== 'live') return null;
  const r = boardResult(chess);
  return r && { winner: r.winner === 'draw' ? 'draw' : roleOf(g, r.winner), reason: r.reason, by: null };
}

// Does the board agree with a stored mate or automatic draw? The database
// cannot check "checkmate", so the other phone does, and voids the board when
// this is false. Draws are not held to their exact reason, only to being one.
export function resultHolds(g, chess) {
  if (g.status !== 'done' || !BOARD_REASONS.includes(g.reason)) return true;
  const r = boardResult(chess);
  if (!r) return false;
  if (g.reason === 'mate' || r.reason === 'mate') return r.reason === g.reason && roleOf(g, r.winner) === g.winner;
  return g.winner === 'draw';
}

// Can a board still be voided? A game in play, or one that a MOVE ended (mate,
// or a draw the board decides): those are the endings no rule can check.
export function voidable(g) {
  return g.status === 'live' || (g.status === 'done' && BOARD_REASONS.includes(g.reason));
}

// What a phone shows of a board: the game as far as it can be played.
// { chess, fen, last, n, bad }: `n` moves of mv are on the board, `last` is the
// newest of them ({ from, to }, or null). `bad`: the stored moves stop being
// playable at move n (the board then stands as it was before that move), or a
// stored mate or automatic draw is not on the board. Either voids the board
// (spec 3k). null: the start position itself does not hold.
export function shownPosition(g) {
  let p = positionOf(g), bad = false;
  if (!p.ok) {
    if (p.where !== 'mv') return null;
    bad = true;
    const n = Math.max(0, p.index);
    p = positionOf({ ...g, mv: n ? g.mv.slice(0, n * SIMUL.MOVE_LEN) : '', n });
    if (!p.ok) return null;
  } else if (!resultHolds(g, p.chess)) bad = true;
  const h = p.chess.history({ verbose: true });
  const m = p.sans.length ? h[h.length - 1] : null;
  return { chess: p.chess, fen: p.chess.fen(), last: m && { from: m.from, to: m.to }, n: p.sans.length, bad };
}

// One offer per player per 10 moves, and never while an offer is standing.
export function mayOfferDraw(g, who) {
  if (g.status !== 'live' || g.draw != null) return false;
  const last = who === 't' ? g.tDr : g.sDr;
  return last < 0 || g.n - last >= SIMUL.DRAW_GAP_MOVES * 2;
}

// ── The teacher's boards ──────────────────────────────────────────────────
// Live boards where it is the teacher's turn, the one waiting longest first.
export function waitingBoards(games) {
  return (games || [])
    .filter(g => g && g.status === 'live' && sideToMove(g) === 't')
    .sort((a, b) => a.at - b.at || (a.s < b.s ? -1 : a.s > b.s ? 1 : 0));
}

// The board to jump to: the one whose last move is oldest; null when no board
// is waiting. With `after` (the student of the board on screen, for the skip
// button): the next one in that order, round and round; null if no OTHER
// board is waiting.
export function nextBoard(games, after = null) {
  const w = waitingBoards(games);
  if (after == null) return w[0] || null;
  const i = w.findIndex(g => g.s === after);
  if (i < 0) return w[0] || null;
  return w.length > 1 ? w[(i + 1) % w.length] : null;
}

// The teacher's colour on each board, in the order the students are listed:
// 'white', 'black', or 'alt' (first board White, second Black, and so on).
export function coloursFor(mode, students) {
  return (students || []).map((_, i) => (mode === 'black' || (mode === 'alt' && i % 2 === 1) ? 'b' : 'w'));
}

// ── Invitations ───────────────────────────────────────────────────────────
// Can the student still join, can the teacher still press Start?
export function inviteOpen(g, nowMs) {
  return (g.status === 'invited' || g.status === 'joined') && nowMs <= g.invitedAt + SIMUL.INVITE_MS;
}

// May a new invitation replace what is stored? Yes over nothing, a finished
// game, an invitation older than 10 minutes, or a simul started more than 3
// hours ago. Not over an invitation still waiting or a game in play.
export function mayReplace(g, nowMs) {
  if (!g || g.status === 'done' || g.status === 'out') return true;
  if (g.status === 'live') return nowMs > g.startAt + SIMUL.ABANDONED_MS;
  return nowMs > g.invitedAt + SIMUL.INVITE_MS;
}
