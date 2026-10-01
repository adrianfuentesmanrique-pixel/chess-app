// The live "search games in a database" index, tested under plain Node.
//
// js/explore-index.js imports only ./tree.js, so — like tree.js itself — it runs
// with no browser and no IndexedDB. The games and their PGN are handed in by the
// caller, which is what lets these tests stand in for the database.
//
// Run: npm run test:tree
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePgn } from '../../js/tree.js';
import { Chess } from '../../vendor/chess.js';
import { fenKey, pgnPositions, PositionIndex } from '../../js/explore-index.js';

const PGN = {
  1: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *',                 // Ruy Lopez
  2: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 *',                // Italian
  3: '1. d4 d5 2. c4 e6 (2... c6 3. Nf3) 3. Nc3 *',     // QGD, Slav as a variation
  4: '1. Nf3 Nc6 2. e4 e5 3. Bb5 *',                    // Ruy Lopez by another move order
  5: '1. c4 e5 *',                                      // only the stored-index tests use this one
};
const summaries = ids => ids.map(id => ({ id, baseId: 7, white: 'W' + id, black: 'B' + id, updatedAt: 100 }));
const fenAfter = moves => { const tr = parsePgn(moves + ' *'); tr.toEnd(); return tr.fen(); };
const ids = list => list.map(g => g.id);

async function build(gameIds = [1, 2, 3, 4]) {
  const idx = new PositionIndex();
  const calls = [];
  const stats = await idx.sync(summaries(gameIds), async id => { calls.push(id); return PGN[id]; });
  return { idx, calls, stats };
}

test('1. the starting position is in every game', async () => {
  const { idx, stats } = await build();
  assert.deepEqual(ids(idx.find(fenAfter(''))), [1, 2, 3, 4]);
  assert.equal(stats.parsed, 4);
});

test('2. a move narrows the list; stepping back widens it again', async () => {
  const { idx } = await build();
  assert.deepEqual(ids(idx.find(fenAfter('1. e4 e5 2. Nf3 Nc6'))), [1, 2, 4]);
  assert.deepEqual(ids(idx.find(fenAfter('1. e4 e5 2. Nf3 Nc6 3. Bc4'))), [2]);
  assert.deepEqual(ids(idx.find(fenAfter('1. e4 e5 2. Nf3 Nc6'))), [1, 2, 4]);
});

test('3. a position reached by a different move order still matches', async () => {
  const { idx } = await build();
  assert.deepEqual(ids(idx.find(fenAfter('1. e4 e5 2. Nf3 Nc6 3. Bb5'))), [1, 4]);
});

test('4. positions inside a side variation are found', async () => {
  const { idx } = await build();
  assert.deepEqual(ids(idx.find(fenAfter('1. d4 d5 2. c4 c6 3. Nf3'))), [3]);
});

test('5. a position in no game finds nothing', async () => {
  const { idx } = await build();
  assert.deepEqual(idx.find(fenAfter('1. h4 h5 2. a4')), []);
});

test('6. a base with one game', async () => {
  const { idx } = await build([2]);
  assert.deepEqual(ids(idx.find(fenAfter('1. e4'))), [2]);
  assert.deepEqual(idx.find(fenAfter('1. d4')), []);
});

test('7. a second sync reads only the game that was added', async () => {
  const { idx } = await build([1, 2]);
  const calls = [];
  const stats = await idx.sync(summaries([1, 2, 3]), async id => { calls.push(id); return PGN[id]; });
  assert.deepEqual(calls, [3]);
  assert.equal(stats.parsed, 1);
  assert.deepEqual(ids(idx.find(fenAfter('1. d4 d5'))), [3]);
});

test('8. an edited game is re-read, a deleted game is dropped', async () => {
  const { idx } = await build([1, 2]);
  const next = summaries([2]);
  next[0].updatedAt = 200;                               // game 2 was edited...
  const calls = [];
  await idx.sync(next, async id => { calls.push(id); return PGN[3]; }); // ...into a d4 game
  assert.deepEqual(calls, [2]);
  assert.deepEqual(idx.find(fenAfter('1. e4')), []);     // game 1 gone, game 2 no longer e4
  assert.deepEqual(ids(idx.find(fenAfter('1. d4'))), [2]);
  assert.equal(idx.size, 1);
});

test('9. a game that will not parse is skipped, not fatal', async () => {
  const idx = new PositionIndex();
  await idx.sync(summaries([1, 2]), async id => { if (id === 1) throw new Error('gone'); return PGN[id]; });
  assert.deepEqual(ids(idx.find(fenAfter('1. e4'))), [2]);
});

test('10. progress is reported and reaches the total', async () => {
  const idx = new PositionIndex();
  const seen = [];
  await idx.sync(summaries([1, 2, 3, 4]), async id => PGN[id], { onProgress: (d, n) => seen.push([d, n]), sliceMs: 0 });
  assert.deepEqual(seen.at(-1), [4, 4]);
});

// --- the fast reader against parsePgn() ----------------------------------
// pgnPositions() exists only for speed; parsePgn() is the reference. If the two
// ever disagree the search silently loses games, so they are compared position
// for position.
const viaTree = pgn => {
  const out = [], st = [parsePgn(pgn).root];
  while (st.length) { const n = st.pop(); out.push(fenKey(n.fen)); for (const c of n.children) st.push(c); }
  return [...new Set(out)].sort();
};
const viaFast = pgn => [...new Set(pgnPositions(pgn).map(fenKey))].sort();

test('12. fast reader = parsePgn on the awkward cases', () => {
  const cases = {
    'comments, NAGs, suffixes': '1. e4! {best by test} e5 $1 2. Nf3?! Nc6 ; a line comment\n3. Bb5!! a6?? *',
    'nested variations': '1. e4 e5 2. Nf3 (2. Bc4 Nf6 (2... Bc5 3. c3 (3. b4 Bxb4)) 3. d3) 2... Nc6 3. Bb5 a6 (3... Nf6 4. O-O) 4. Ba4 *',
    'variation on the first move': '1. e4 (1. d4 d5) (1. c4) 1... c5 *',
    'castling both sides, zeros too': '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Nf6 5. d3 d6 6. Nc3 Bg4 7. Be3 Qd7 8. Qd2 0-0-0 *',
    'en passant': '1. e4 a6 2. e5 d5 3. exd6 exd6 4. d4 h6 5. d5 c5 6. dxc6 *',
    'promotion and underpromotion': '[FEN "8/P6k/8/8/8/8/p6K/8 w - - 0 1"]\n\n1. a8=Q a1=N 2. Qb7+ Kg6 *',
    'promotion written without =': '[FEN "8/P6k/8/8/8/8/p6K/8 w - - 0 1"]\n\n1. a8Q a1N *',
    'a pin decides which knight': '[FEN "4k3/8/8/8/1b6/2N5/8/4K1N1 w - - 0 1"]\n\n1. Ne2 Kd8 *',
    'file and rank disambiguation': '[FEN "k7/8/8/8/R6R/8/8/R3K3 w - - 0 1"]\n\n1. Rhd4 Kb8 2. R1a3 Kc8 3. Rdb4 *',
    'junk tokens are skipped': '1. e4 e5 2. Zz9 Nf3 xx 2... Nc6 3. Ke8 Bb5 *',
    'unbalanced brackets': '1. e4 e5 ) 2. Nf3 ( 2. f4 *',
    'long algebraic falls back': '1. e2e4 e7e5 2. Ng1f3 *',
    'empty game': '*',
  };
  for (const [name, pgn] of Object.entries(cases)) assert.deepEqual(viaFast(pgn), viaTree(pgn), name);
});

test('13. fast reader = parsePgn on 30 random games with side lines', () => {
  let seed = 20261001;
  const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  let positions = 0;
  for (let g = 0; g < 30; g++) {
    const tree = parsePgn('*');
    const c = new Chess();
    for (let ply = 0; ply < 100 && !c.isGameOver(); ply++) {
      const ms = c.moves();
      if (rnd(6) === 0) {                                // a side line of a few moves
        const back = tree.current, c2 = new Chess(c.fen());
        for (let k = 1 + rnd(5); k > 0 && !c2.isGameOver(); k--) { const m2 = c2.moves(); const s2 = m2[rnd(m2.length)]; c2.move(s2); tree.play(s2); }
        tree.goto(back);
      }
      const san = ms[rnd(ms.length)];
      c.move(san); tree.play(san);
    }
    const pgn = tree.toPgn(), want = viaTree(pgn);
    positions += want.length;
    assert.deepEqual(viaFast(pgn), want, 'game ' + g + ': ' + pgn.slice(0, 200));
  }
  assert.ok(positions > 3000, 'the comparison covered ' + positions + ' positions');
});

// --- the index kept on disk ----------------------------------------------
// sync() hands out the index in blocks of games as it goes (onBlock); load()
// takes them back. `disk` stands in for the IndexedDB store.
const START = fenAfter('');
async function stored(gameIds, disk = new Map(), idx = new PositionIndex(), sums = summaries(gameIds)) {
  const calls = [], written = [];
  await idx.sync(sums, async id => { calls.push(id); return PGN[id]; }, {
    blockSize: 2,
    onBlock: (n, block) => { written.push(n); if (block) disk.set(n, block); else disk.delete(n); },
  });
  return { idx, disk, calls, written };
}
const reopen = disk => { const idx = new PositionIndex(); idx.load([...disk].map(([n, b]) => ({ n, ...b }))); return idx; };

test('14. an index written in blocks reopens with the same answers and reads no game', async () => {
  const { idx, disk, written } = await stored([1, 2, 3, 4]);
  assert.deepEqual(written, [0, 1]);
  const again = reopen(disk);
  for (const moves of ['', '1. e4 e5 2. Nf3 Nc6', '1. e4 e5 2. Nf3 Nc6 3. Bb5', '1. d4 d5 2. c4 c6 3. Nf3', '1. h4']) {
    assert.deepEqual(ids(again.find(fenAfter(moves))), ids(idx.find(fenAfter(moves))), moves);
  }
  assert.equal(again.bytes, idx.bytes);
  const next = await stored([1, 2, 3, 4], disk, again);
  assert.deepEqual(next.calls, []);
  assert.deepEqual(next.written, []);
});

test('15. after reopening, an edit or a delete rewrites only its own block', async () => {
  const { disk } = await stored([1, 2, 3, 4]);
  const sums = summaries([1, 2, 3]);                     // game 4 deleted...
  sums[0].updatedAt = 200;                               // ...and game 1 edited
  const next = await stored(null, disk, reopen(disk), sums);
  assert.deepEqual(next.calls, [1]);
  assert.deepEqual(next.written.sort(), [0, 1]);
  assert.deepEqual(ids(reopen(disk).find(START)), [1, 2, 3]);
  // deleting the only game left in a block removes the block
  const last = await stored([1, 2], disk, reopen(disk), sums.slice(0, 2));
  assert.deepEqual(last.written, [1]);
  assert.deepEqual([...disk.keys()], [0]);
});

test('16. an added game goes into the last block until it is full, then a new one', async () => {
  const { disk } = await stored([1, 2, 3]);              // blocks: [1,2] [3]
  const a = await stored([1, 2, 3, 4], disk, reopen(disk));
  assert.deepEqual(a.calls, [4]);
  assert.deepEqual(a.written, [1]);
  const b = await stored([1, 2, 3, 4, 5], disk, reopen(disk));
  assert.deepEqual(b.calls, [5]);
  assert.deepEqual(b.written, [2]);
  assert.deepEqual(ids(reopen(disk).find(START)), [1, 2, 3, 4, 5]);
});

test('17. a build that was cut short carries on from the blocks it saved', async () => {
  const { disk } = await stored([1, 2, 3, 4]);
  disk.delete(1);                                        // the app closed before block 1 was written
  const next = await stored([1, 2, 3, 4], disk, reopen(disk));
  assert.deepEqual(next.calls, [3, 4]);
  assert.deepEqual(ids(reopen(disk).find(fenAfter('1. d4 d5'))), [3]);
});

// --- patch(): only the games the caller knows were written ----------------
// `base` stands in for the games store: id → { updatedAt, pgn }, absent = gone.
async function patched(idx, disk, changedIds, base) {
  const calls = [], written = [];
  const stats = await idx.patch(changedIds, async id => {
    calls.push(id);
    return base[id] ? { summary: { ...summaries([id])[0], updatedAt: base[id].updatedAt }, pgn: base[id].pgn } : null;
  }, { blockSize: 2, onBlock: (n, block) => { written.push(n); if (block) disk.set(n, block); else disk.delete(n); } });
  return { stats, calls, written };
}
const rec = (id, updatedAt = 100) => ({ updatedAt, pgn: PGN[id] });

test('18. patch: an added, an edited and a deleted game, looking at those three only', async () => {
  const { idx, disk } = await stored([1, 2, 3, 4]);      // blocks: [1,2] [3,4]
  const base = { 1: { updatedAt: 200, pgn: PGN[5] }, 5: rec(5) };   // 1 edited into 1.c4, 4 deleted, 5 added
  const p = await patched(idx, disk, [1, 4, 5], base);
  assert.deepEqual(p.calls, [1, 4, 5]);
  assert.deepEqual(p.stats, { parsed: 2, removed: 1 });
  assert.deepEqual(p.written.sort(), [0, 1]);            // 5 took the place 4 left in block 1
  assert.deepEqual(ids(idx.find(START)), [1, 2, 3, 5]);
  assert.deepEqual(ids(idx.find(fenAfter('1. c4 e5'))), [1, 5]);
  assert.deepEqual(ids(idx.find(fenAfter('1. e4 e5 2. Nf3 Nc6'))), [2]);
  // what was saved says the same after a restart, and a full check finds nothing to do
  const again = reopen(disk);
  assert.deepEqual(ids(again.find(fenAfter('1. c4 e5'))), [1, 5]);
  const sums = summaries([1, 2, 3, 5]); sums[0].updatedAt = 200;
  const full = await stored(null, disk, again, sums);
  assert.deepEqual(full.calls, []);
  assert.deepEqual(full.written, []);
});

test('19. patch: a new game fills the last block, then opens a new one; an emptied block goes', async () => {
  const { idx, disk } = await stored([1, 2, 3]);         // blocks: [1,2] [3]
  let p = await patched(idx, disk, [4], { 4: rec(4) });
  assert.deepEqual(p.written, [1]);
  p = await patched(idx, disk, [5], { 5: rec(5) });
  assert.deepEqual(p.written, [2]);
  p = await patched(idx, disk, [5], {});
  assert.deepEqual(p.written, [2]);
  assert.deepEqual([...disk.keys()].sort(), [0, 1]);
  assert.deepEqual(ids(reopen(disk).find(START)), [1, 2, 3, 4]);
});

test('20. patch: ids that turn out unchanged or unknown cost a look, not a parse or a save', async () => {
  const { idx, disk } = await stored([1, 2]);
  const p = await patched(idx, disk, [1, 99], { 1: rec(1) });   // 1 as indexed; 99 added then deleted
  assert.deepEqual(p.stats, { parsed: 0, removed: 0 });
  assert.deepEqual(p.written, []);
  assert.deepEqual(ids(idx.find(START)), [1, 2]);
});

test('21. patch then a full sync agree — the walk stays a valid fallback', async () => {
  const a = await stored([1, 2, 3]);
  await patched(a.idx, a.disk, [2, 4], { 4: rec(4) });   // 2 deleted, 4 added
  const b = await stored([1, 3, 4]);
  for (const moves of ['', '1. e4 e5 2. Nf3 Nc6', '1. d4 d5', '1. Nf3 Nc6 2. e4 e5 3. Bb5']) {
    assert.deepEqual(ids(a.idx.find(fenAfter(moves))), ids(b.idx.find(fenAfter(moves))), moves);
  }
  const full = await stored([1, 3, 4], a.disk, reopen(a.disk));
  assert.deepEqual(full.calls, []);
});

test('11. the move counters do not matter, the side to move does', () => {
  assert.equal(fenKey('8/8/8/8/8/8/8/K6k w - - 0 1'), fenKey('8/8/8/8/8/8/8/K6k w - - 12 40'));
  assert.notEqual(fenKey('8/8/8/8/8/8/8/K6k w - - 0 1'), fenKey('8/8/8/8/8/8/8/K6k b - - 0 1'));
});
