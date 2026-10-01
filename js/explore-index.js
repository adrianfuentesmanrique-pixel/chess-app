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

// --- keeping the index on disk -------------------------------------------
// Building the index is the slow part (minutes for a large base on a phone), so
// the caller stores it and reopens it on the next app start. It is stored in
// BLOCKS of games, not game by game and not as one piece: measured on a
// 177,000-game base, blocks reopen in 0.4 s against 2.1 s for a record a game,
// and an edited game rewrites one block (~1.4 MB) instead of the whole 120 MB.
const BLOCK = 2000;

// One block as it is stored: the games' summaries, and their position lists
// laid end to end with the length of each.
function packBlock(games) {
  if (!games || !games.length) return null;
  let total = 0;
  for (const g of games) total += g.hashes.length;
  const hashes = new Float64Array(total), counts = new Uint32Array(games.length);
  let at = 0;
  games.forEach((g, i) => { hashes.set(g.hashes, at); at += g.hashes.length; counts[i] = g.hashes.length; });
  return { summaries: games.map(g => g.summary), counts, hashes };
}

export class PositionIndex {
  constructor() {
    this.games = new Map();   // game id → { summary, updatedAt, hashes, block }
  }

  // Takes back blocks that sync() handed to onBlock, each with its number `n`.
  // The games then count as already read: the next sync() re-reads only those
  // whose updatedAt no longer matches.
  load(blocks) {
    const games = new Map();
    for (const b of [...blocks].sort((x, y) => x.n - y.n)) {
      let at = 0;
      b.summaries.forEach((s, i) => {
        games.set(s.id, { summary: s, updatedAt: s.updatedAt, hashes: b.hashes.subarray(at, at + b.counts[i]), block: b.n });
        at += b.counts[i];
      });
    }
    this.games = games;
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
  //
  // `onBlock(n, block)` is how the caller keeps the index on disk: it is called
  // (and awaited) for every block whose games changed, as soon as that block is
  // complete — so a long first build is saved as it goes and can carry on after
  // being cut short. `block` is null when the block has no games left.
  async sync(summaries, getPgn, { onProgress = null, sliceMs = 40, onBlock = null, blockSize = BLOCK } = {}) {
    const next = new Map();
    const todo = [];
    const fill = new Map();     // block → how many games it holds
    const changed = new Set();  // blocks whose stored copy is now out of date
    for (const s of summaries) {
      const old = this.games.get(s.id);
      let g;
      if (old && old.updatedAt === s.updatedAt) g = { ...old, summary: s };
      else { g = { summary: s, updatedAt: s.updatedAt, hashes: EMPTY, block: old ? old.block : undefined }; todo.push(g); }
      next.set(s.id, g);
      if (g.block !== undefined) fill.set(g.block, (fill.get(g.block) || 0) + 1);
    }
    let removed = 0;
    for (const [id, g] of this.games) if (!next.has(id)) { removed++; changed.add(g.block); }
    // An edited game stays in its block; a new one goes into the last block
    // until that is full. `waiting` counts the games each block still needs read.
    let last = 0;
    for (const n of fill.keys()) if (n > last) last = n;
    const waiting = new Map();
    for (const g of todo) {
      if (g.block === undefined) {
        if ((fill.get(last) || 0) >= blockSize) last++;
        g.block = last;
        fill.set(last, (fill.get(last) || 0) + 1);
      }
      changed.add(g.block);
      waiting.set(g.block, (waiting.get(g.block) || 0) + 1);
    }
    const members = new Map();
    if (onBlock) {
      for (const g of next.values()) {
        if (!changed.has(g.block)) continue;
        if (!members.has(g.block)) members.set(g.block, []);
        members.get(g.block).push(g);
      }
      // Blocks that only lost games are final already.
      for (const n of changed) if (!waiting.has(n)) await onBlock(n, packBlock(members.get(n)));
    }
    let done = 0;
    let sliceStart = performance.now();
    for (const g of todo) {
      // A game that is gone or will not parse simply matches nothing.
      try { g.hashes = positionHashes(await getPgn(g.summary.id)); } catch {}
      done++;
      const left = waiting.get(g.block) - 1;
      waiting.set(g.block, left);
      if (!left && onBlock) await onBlock(g.block, packBlock(members.get(g.block)));
      if (performance.now() - sliceStart >= sliceMs || done === todo.length) {
        if (onProgress) onProgress(done, todo.length);
        await new Promise(r => setTimeout(r));
        sliceStart = performance.now();
      }
    }
    this.games = next;
    return { parsed: todo.length, removed };
  }

  // The same result as sync() when the caller KNOWS which games were written
  // (db.js keeps a short list of them): only those ids are looked at, so the
  // base's game list is not read at all. `getGame(id)` gives { summary, pgn },
  // or null when the game is gone from this base. An id that turns out to be
  // unchanged costs that one look and nothing else.
  async patch(ids, getGame, { onProgress = null, sliceMs = 40, onBlock = null, blockSize = BLOCK } = {}) {
    const changed = new Set();  // blocks whose stored copy is now out of date
    let fill = null, last = 0;  // counted the first time a NEW game needs a place
    let parsed = 0, removed = 0, done = 0;
    let sliceStart = performance.now();
    for (const id of ids) {
      const rec = await getGame(id);
      const old = this.games.get(id);
      if (!rec) {
        if (old) {
          this.games.delete(id); changed.add(old.block); removed++;
          if (fill) fill.set(old.block, fill.get(old.block) - 1);
        }
      } else if (!old || old.updatedAt !== rec.summary.updatedAt) {
        let block = old && old.block;
        if (!old) {
          if (!fill) {
            fill = new Map();
            for (const g of this.games.values()) { fill.set(g.block, (fill.get(g.block) || 0) + 1); if (g.block > last) last = g.block; }
          }
          if ((fill.get(last) || 0) >= blockSize) last++;
          block = last;
          fill.set(last, (fill.get(last) || 0) + 1);
        }
        let hashes = EMPTY;
        // A game that will not parse simply matches nothing.
        try { hashes = positionHashes(rec.pgn); } catch {}
        this.games.set(id, { summary: rec.summary, updatedAt: rec.summary.updatedAt, hashes, block });
        changed.add(block); parsed++;
      }
      done++;
      if (performance.now() - sliceStart >= sliceMs) {
        if (onProgress) onProgress(done, ids.length);
        await new Promise(r => setTimeout(r));
        sliceStart = performance.now();
      }
    }
    if (onBlock && changed.size) {
      const members = new Map();
      for (const g of this.games.values()) {
        if (!changed.has(g.block)) continue;
        if (!members.has(g.block)) members.set(g.block, []);
        members.get(g.block).push(g);
      }
      for (const n of changed) await onBlock(n, packBlock(members.get(n)));
    }
    return { parsed, removed };
  }

  // The games that pass through this position, in the base's own order.
  find(fen) {
    const h = hash53(fenKey(fen));
    const out = [];
    for (const g of this.games.values()) if (has(g.hashes, h)) out.push(g.summary);
    return out;
  }
}
