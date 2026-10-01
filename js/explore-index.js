// Position index behind the Analysis tab's live "search games in a database".
//
// The old search re-parsed every game of the base on each press. Doing that on
// every move would freeze a large base, so each game is parsed ONCE and reduced
// to the list of positions it passes through; a search is then a lookup.
//
// A position is kept as one 53-bit number (a hash of its fenKey), not as the FEN
// text: ~8 bytes a position instead of ~100, which is what keeps a big base
// affordable on a phone. Two different positions sharing a number is possible in
// theory (1 in 9,000,000,000,000,000 per comparison) and would only ever show a
// game that does not belong in the list.
//
// Imports only ../vendor/chess.js, so it is unit-tested under plain Node
// (tests/unit/explore-index.test.js) with the database handed in by the caller.
import { Chess } from '../vendor/chess.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// Board, side to move, castling, en passant — not the two move counters.
export function fenKey(fen) { return fen.split(' ').slice(0, 4).join(' '); }

// cyrb53 (public domain): two 32-bit hashes folded into one 53-bit integer,
// which a JS number — and a Float64Array slot — holds exactly.
function hash53(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

// --- reading a game's positions, fast -----------------------------------
// parsePgn() in tree.js would do, but it spends ~70 µs a move inside
// chess.move(san): to recognise the move the library writes out the SAN of every
// candidate, testing each for check and mate. Measured, that is 3–4 ms a game —
// minutes for a large base on a phone. Here the SAN is matched by its squares
// instead, and chess.js is still what generates the moves and judges legality,
// so no chess rules are re-implemented. About 10x faster, and
// tests/unit/explore-index.test.js holds it to parsePgn()'s exact positions.
//
// _moves/_makeMove/_undoMove/_isKingAttacked are chess.js internals. The library
// is vendored, so they cannot change under us; if vendor/chess.js is ever
// upgraded, that test is what says whether this still holds.
const SAN_RE = /^([NBRQK])?([a-h])?([1-8])?x?([a-h])([1-8])(?:=?([NBRQ]))?[+#]?$/;

function playSan(chess, san) {
  const m = SAN_RE.exec(san);
  if (m) {
    // 0x88 square numbering: file + 16 * (rows down from rank 8)
    const to = (m[4].charCodeAt(0) - 97) + (56 - m[5].charCodeAt(0)) * 16;
    const promo = m[6] ? m[6].toLowerCase() : undefined;
    const us = chess._turn;
    let pick = null, n = 0;
    for (const mv of chess._moves({ legal: false, piece: m[1] ? m[1].toLowerCase() : 'p' })) {
      if (mv.to !== to || mv.promotion !== promo) continue;
      if (m[2] && (mv.from & 15) !== m[2].charCodeAt(0) - 97) continue;
      if (m[3] && (mv.from >> 4) !== 56 - m[3].charCodeAt(0)) continue;
      // Legality only for the few moves that fit — a pinned knight is what makes
      // "Nd2" unambiguous when two knights could otherwise go there.
      chess._makeMove(mv);
      const legal = !chess._isKingAttacked(us);
      chess._undoMove();
      if (legal) { pick = mv; n++; }
    }
    if (n === 1) { chess._makeMove(pick); return; }
  }
  // Castling, unusual notation, anything not settled above: the library's own
  // reader, which throws on a move that cannot be played.
  chess.move(san);
}

// Every position a PGN passes through, side variations included, as FENs.
// Same tokens and same variation rule as parsePgn(): "(" replaces the LAST move.
export function pgnPositions(text) {
  const headerRe = /^\s*\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]\s*$/gm;
  let m, lastHeaderEnd = 0, start = START_FEN;
  while ((m = headerRe.exec(text)) !== null) {
    if (m[1] === 'FEN') start = m[2];
    lastHeaderEnd = headerRe.lastIndex;
  }
  const body = text.slice(lastHeaderEnd).replace(/;[^\n]*/g, '');
  const re = /\{([^}]*)\}|\(|\)|\$(\d+)|(1-0|0-1|1\/2-1\/2|\*)|([^\s(){}]+)/g;
  const chess = new Chess(start);
  let cur = start, prev = start;   // position now, and before the last move
  const out = [cur];
  const stack = [];
  let tk;
  while ((tk = re.exec(body)) !== null) {
    if (tk[0] === '(') {
      stack.push(cur, prev);
      cur = prev;
      chess.load(cur, { skipValidation: true });
    } else if (tk[0] === ')') {
      if (stack.length) { prev = stack.pop(); cur = stack.pop(); } else { cur = prev = start; }
      chess.load(cur, { skipValidation: true });
    } else if (tk[4] !== undefined) {
      const san = tk[4].replace(/^\d+\.+/, '').replace(/^\.+/, '').replace(/[!?]{1,2}$/, '');
      if (!san || /^\d/.test(san)) continue;
      try { playSan(chess, san); } catch { continue; }   // skip junk tokens
      prev = cur; cur = chess.fen(); out.push(cur);
    }
  }
  return out;
}

// One game as a sorted list of position numbers, ready for binary search.
function positionHashes(pgn) {
  return Float64Array.from(pgnPositions(pgn), fen => hash53(fenKey(fen))).sort();
}

function has(sorted, h) {
  let lo = 0, hi = sorted.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] === h) return true;
    if (sorted[mid] < h) lo = mid + 1; else hi = mid - 1;
  }
  return false;
}

const EMPTY = new Float64Array(0);

export class PositionIndex {
  constructor() {
    this.games = new Map();   // game id → { summary, updatedAt, hashes }
  }

  get size() { return this.games.size; }

  // Bytes held by the position lists (the summaries are the same small records
  // the Bases list already keeps).
  get bytes() {
    let n = 0;
    for (const g of this.games.values()) n += g.hashes.byteLength;
    return n;
  }

  // Brings the index in line with the base as it is now. `summaries` is the
  // base's game list WITHOUT the PGN; `getPgn(id)` fetches one game's text and
  // is called only for games that are new or whose updatedAt changed — so a
  // base that gained one game costs one parse, not a rebuild. Parsing is the
  // slow part, so the loop hands the thread back every `sliceMs` to keep the
  // board responsive, reporting progress as it does.
  async sync(summaries, getPgn, { onProgress = null, sliceMs = 40 } = {}) {
    const next = new Map();
    const todo = [];
    for (const s of summaries) {
      const old = this.games.get(s.id);
      if (old && old.updatedAt === s.updatedAt) next.set(s.id, { ...old, summary: s });
      else { next.set(s.id, { summary: s, updatedAt: s.updatedAt, hashes: EMPTY }); todo.push(s.id); }
    }
    const removed = [...this.games.keys()].filter(id => !next.has(id)).length;
    let done = 0;
    let sliceStart = performance.now();
    for (const id of todo) {
      // A game that is gone or will not parse simply matches nothing.
      try { next.get(id).hashes = positionHashes(await getPgn(id)); } catch {}
      done++;
      if (performance.now() - sliceStart >= sliceMs || done === todo.length) {
        if (onProgress) onProgress(done, todo.length);
        await new Promise(r => setTimeout(r));
        sliceStart = performance.now();
      }
    }
    this.games = next;
    return { parsed: todo.length, removed };
  }

  // The games that pass through this position, in the base's own order.
  find(fen) {
    const h = hash53(fenKey(fen));
    const out = [];
    for (const g of this.games.values()) if (has(g.hashes, h)) out.push(g.summary);
    return out;
  }
}
