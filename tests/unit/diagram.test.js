// Read tab, diagram reader: the strict placement rule, the whole-board gate and
// the templates that learn. Only the per-square decision is tested here, on
// made-up square measurements — what the reader does on real pages is measured
// by tools/measure-pieces.mjs.
//
// js/diagram.js imports nothing and touches no DOM, so this runs under plain Node.
//
// Run: npm run test:tree
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templatesFromCells, learnFromCells, classifyCells, boardSanity, gridToFen, START_GRID, STRICT, LEARN_MAX_CONTRA } from '../../js/diagram.js';

const N = 24;
// A made-up "glyph": a few soft blobs at fixed places, as a unit vector. Soft, so
// sliding it one cell barely changes it — like a real piece one pixel off.
function glyph(seed, blobs = 5) {
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const f = new Float32Array(N * N);
  for (let b = 0; b < blobs; b++) {
    const cx = 4 + rnd() * 16, cy = 4 + rnd() * 16;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) f[y * N + x] += Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / 5);
  }
  return unit(f);
}
function unit(f) { let n = 0; for (const v of f) n += v * v; n = Math.sqrt(n); return f.map(v => v / n); }
const mix = (a, b, w) => unit(a.map((v, i) => v * (1 - w) + b[i] * w));
const slide = (f, dx) => { const o = new Float32Array(N * N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const xx = x + dx; if (xx >= 0 && xx < N) o[y * N + x] = f[y * N + xx]; } return unit(o); };

const dist = (a, b) => 1 - a.reduce((s, v, i) => s + v * b[i], 0);
// six glyphs picked so that every pair is clearly apart
const SHAPE = {};
for (let seed = 1; Object.keys(SHAPE).length < 6; seed++) {
  const g = glyph(seed);
  if (Object.values(SHAPE).every(o => dist(g, o) > 0.3)) SHAPE['kqrbnp'[Object.keys(SHAPE).length]] = g;
}
const EMPTY = [glyph(40, 2), glyph(41, 2)];   // the two square colours' own texture
const WHITE = 0.72, BLACK = 0.32;             // fill of a hollow / a solid piece

// The 64 measurements of a board showing `grid` (overrides: {'r,c': cell}).
function cellsFor(grid, over = {}) {
  const cells = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const code = grid[r][c];
    cells.push(over[`${r},${c}`] || (code
      ? { feat: SHAPE[code.toLowerCase()], lumStd: 60, colorScore: code === code.toUpperCase() ? WHITE : BLACK }
      : { feat: EMPTY[(r + c) % 2], lumStd: 2, colorScore: 0.5 }));
  }
  return cells;
}
const blank = () => Array.from({ length: 8 }, () => Array(8).fill(''));
const put = (pairs) => { const g = blank(); for (const [sq, code] of Object.entries(pairs)) g[8 - +sq[1]]['abcdefgh'.indexOf(sq[0])] = code; return g; };

const FULL = templatesFromCells(cellsFor(START_GRID), START_GRID);
const ENDGAME = put({ e1: 'K', e8: 'k', a2: 'P', h7: 'p', a1: 'R', h8: 'r' });
const PARTIAL = templatesFromCells(cellsFor(ENDGAME), ENDGAME);   // never saw a queen, bishop or knight

test('the made-up glyphs are far enough apart for the rule to tell them', () => {
  const types = Object.keys(SHAPE);
  for (const a of types) for (const b of types) {
    if (a >= b) continue;
    const d = dist(SHAPE[a], SHAPE[b]);
    assert.ok(d > STRICT.full.match + STRICT.full.lead, `${a}/${b} only ${d.toFixed(3)} apart`);
  }
});

test('a clean diagram is read whole: every piece, right colour, nothing extra', () => {
  const pos = put({ g1: 'K', g8: 'k', d1: 'Q', d8: 'q', a1: 'R', f8: 'r', c4: 'B', e7: 'b', f3: 'N', c6: 'n', e4: 'P', e5: 'p' });
  const res = classifyCells(cellsFor(pos), FULL);
  assert.deepEqual(res.grid, pos);
  assert.equal(res.uncertain, 0);
  assert.equal(res.confident, true);
  assert.equal(res.refused, '');
});

test('the starting position reads back as itself from its own templates', () => {
  const res = classifyCells(cellsFor(START_GRID), FULL);
  assert.equal(res.fen, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1');
  assert.equal(res.confident, true);
});

test('a piece one cell off its taught place is still recognised', () => {
  const pos = put({ e1: 'K', e8: 'k', d4: 'Q' });
  const res = classifyCells(cellsFor(pos, { '4,3': { feat: slide(SHAPE.q, 1), lumStd: 60, colorScore: WHITE } }), FULL);
  assert.equal(res.grid[4][3], 'Q');
});

test('a shape halfway between two pieces is left EMPTY and marked, not guessed', () => {
  const pos = put({ e1: 'K', e8: 'k', d4: 'Q' });
  const res = classifyCells(cellsFor(pos, { '4,3': { feat: mix(SHAPE.q, SHAPE.k, 0.5), lumStd: 60, colorScore: WHITE } }), FULL);
  assert.equal(res.grid[4][3], '');
  assert.equal(res.doubt[4][3], true);
  assert.equal(res.uncertain, 1);
  assert.equal(res.confident, false);
  assert.equal(res.grid[7][4], 'K');           // the sure squares are still shown
});

test('a fill that is neither clearly white nor clearly black leaves the square empty', () => {
  const pos = put({ e1: 'K', e8: 'k', a1: 'R' });
  const res = classifyCells(cellsFor(pos, { '7,0': { feat: SHAPE.r, lumStd: 60, colorScore: (WHITE + BLACK) / 2 } }), FULL);
  assert.equal(res.grid[7][0], '');
  assert.equal(res.doubt[7][0], true);
});

test('a smudge that matches nothing well is left empty', () => {
  const pos = put({ e1: 'K', e8: 'k' });
  const res = classifyCells(cellsFor(pos, { '3,3': { feat: glyph(99), lumStd: 60, colorScore: WHITE } }), FULL);
  assert.equal(res.grid[3][3], '');
});

test('a book never taught a queen does not show one as its nearest look-alike', () => {
  // A queen that sits between the two match limits from the taught king: close
  // enough to pass in a book that knows every piece, not while some are unknown.
  let nearKing, d = 0;
  for (let w = 0.05; d < STRICT.partial.match + 0.02; w += 0.01) { nearKing = mix(SHAPE.k, SHAPE.q, w); d = dist(nearKing, SHAPE.k); }
  assert.ok(d > STRICT.partial.match && d < STRICT.full.match, `test glyph is ${d.toFixed(3)} from the king`);
  const pos = put({ e1: 'K', e8: 'k', d5: 'Q' });
  const res = classifyCells(cellsFor(pos, { '3,3': { feat: nearKing, lumStd: 60, colorScore: WHITE } }), PARTIAL);
  assert.equal(res.grid[3][3], '');
  assert.equal(res.doubt[3][3], true);
  assert.equal(res.grid[7][4], 'K');           // an exact copy of a taught piece is still shown
});

test('an impossible position is shown as an empty board, with the reason', () => {
  const kings = put({ a1: 'K', b1: 'K', c1: 'K', e8: 'k' });
  const res = classifyCells(cellsFor(kings), FULL);
  assert.equal(res.refused, 'kings');
  assert.deepEqual(res.grid, blank());
  assert.equal(res.confident, false);
  assert.equal(res.fen, '8/8/8/8/8/8/8/8 w - - 0 1');
});

test('boardSanity: what a real game can and cannot produce', () => {
  assert.equal(boardSanity(START_GRID), '');
  assert.equal(boardSanity(blank()), '');
  assert.equal(boardSanity(put({ e1: 'K' })), '', 'a missing king is a doubtful square, not an impossible board');
  assert.equal(boardSanity(put({ e1: 'K', e8: 'k', d1: 'Q', d2: 'Q', d3: 'Q' })), '', 'two promoted queens are possible');
  assert.equal(boardSanity(put({ e1: 'K', d1: 'K' })), 'kings');
  assert.equal(boardSanity(put({ e1: 'K', a8: 'P' })), 'pawn-on-end-rank');
  assert.equal(boardSanity(put({ e1: 'K', a1: 'p' })), 'pawn-on-end-rank');
  const nine = put({ a2: 'P', b2: 'P', c2: 'P', d2: 'P', e2: 'P', f2: 'P', g2: 'P', h2: 'P', a3: 'P' });
  assert.equal(boardSanity(nine), 'pawns');
  // eight pawns still on the board and three rooks: the third rook has no pawn to come from
  const g = START_GRID.map(r => r.slice()); g[4][4] = 'R';
  assert.equal(boardSanity(g), 'too-many');
  g[7][1] = '';                                // 16 pieces again, but still a rook too many
  assert.equal(boardSanity(g), 'promotions');
  const rooks = blank(); for (let c = 0; c < 8; c++) { rooks[2][c] = 'r'; rooks[3][c] = 'r'; rooks[4][c] = 'r'; }
  assert.equal(boardSanity(rooks), 'too-many');
});

test('templates keep samples, skip near-copies, and learn a new piece from a confirmed position', () => {
  assert.equal(PARTIAL.ver, 4);
  assert.deepEqual(Object.keys(PARTIAL.samples).sort(), ['K', 'P', 'R', 'k', 'p', 'r']);
  assert.equal(PARTIAL.samples.K.length, 1);
  assert.equal(PARTIAL.empties[0].length, 1, 'identical empty squares are kept once');

  const t = JSON.parse(JSON.stringify(PARTIAL));   // as it comes back from storage
  const withQueen = put({ e1: 'K', e8: 'k', d5: 'Q', c3: 'b', f6: 'N' });
  const rep = learnFromCells(t, cellsFor(withQueen), withQueen);
  assert.equal(rep.learned, true);
  assert.equal(rep.contradictions, 0);
  assert.equal(t.samples.K.length, 1, 'the king it already knew adds nothing');
  assert.equal(t.samples.Q.length, 1);
  // all six types are known now, so a later queen is read
  const later = put({ g1: 'K', g8: 'k', a4: 'q', h4: 'n', b2: 'B' });
  const res = classifyCells(cellsFor(later), t);
  assert.deepEqual(res.grid, later);
});

test('learned samples rotate, 12 per piece; what was TAUGHT is never pushed out', () => {
  const t = JSON.parse(JSON.stringify(PARTIAL));
  const taught = JSON.stringify(t.samples.P[0]);
  for (let i = 0; i < 30; i++) {
    const g = put({ e1: 'K', e8: 'k', d4: 'P' });
    learnFromCells(t, cellsFor(g, { '4,3': { feat: glyph(200 + i), lumStd: 60, colorScore: WHITE } }), g);
  }
  assert.equal(t.samples.P.length, 13);
  assert.equal(JSON.stringify(t.samples.P[0]), taught);
});

test('a confirmed board that calls a known king a queen does not teach that', () => {
  const t = JSON.parse(JSON.stringify(FULL));
  const wrong = put({ e1: 'Q', e8: 'k', a2: 'P' });           // the piece on e1 is the king glyph
  const cells = cellsFor(put({ e1: 'K', e8: 'k', a2: 'P' }));
  const rep = learnFromCells(t, cells, wrong);
  assert.equal(rep.contradictions, 1);
  assert.equal(t.samples.Q.length, FULL.samples.Q.length, 'no king shape was filed under queen');
  assert.equal(classifyCells(cells, t).grid[7][4], 'K');
});

test('a known piece the user forgot to place is not learned as an empty square', () => {
  const t = JSON.parse(JSON.stringify(FULL));
  const real = put({ e1: 'K', e8: 'k', d4: 'R' }), confirmed = put({ e1: 'K', e8: 'k' });
  const rep = learnFromCells(t, cellsFor(real), confirmed);
  assert.equal(rep.contradictions, 1);
  assert.equal(classifyCells(cellsFor(real), t).grid[4][3], 'R', 'the rook is still read afterwards');
});

test('a piece confirmed in the wrong colour is not learned', () => {
  const t = JSON.parse(JSON.stringify(FULL));
  const real = put({ e1: 'K', e8: 'k', d4: 'R' }), confirmed = put({ e1: 'K', e8: 'k', d4: 'r' });
  assert.equal(learnFromCells(t, cellsFor(real), confirmed).contradictions, 1);
  assert.equal(t.samples.r.length, FULL.samples.r.length);
  assert.ok(!t.fills.b.includes(WHITE), 'the hollow rook did not shift what the book takes for a black fill');
});

test('a board that disagrees with the book on more than a few squares teaches nothing', () => {
  const t = JSON.parse(JSON.stringify(FULL)), before = JSON.stringify(t.samples);
  // every pawn confirmed as a king-less nonsense: four known pawns called knights, plus a new shape
  const real = put({ e1: 'K', e8: 'k', a2: 'P', b2: 'P', c2: 'P', d2: 'P', h5: 'P' });
  const confirmed = put({ e1: 'K', e8: 'k', a2: 'N', b2: 'N', c2: 'N', d2: 'N', h5: 'B' });
  const cells = cellsFor(real, { '3,7': { feat: glyph(77), lumStd: 60, colorScore: WHITE } });
  const rep = learnFromCells(t, cells, confirmed);
  assert.ok(rep.contradictions > LEARN_MAX_CONTRA);
  assert.equal(rep.learned, false);
  assert.equal(JSON.stringify(t.samples), before, 'not even the new shape on h5 was taken');
});

test('an impossible confirmed position teaches nothing', () => {
  const t = JSON.parse(JSON.stringify(FULL)), g = put({ e1: 'K', d1: 'K', e8: 'k' });
  assert.equal(learnFromCells(t, cellsFor(g), g).learned, false);
});

test('ink on a square left empty (an arrow, a forgotten unknown piece) is not learned as empty', () => {
  const t = JSON.parse(JSON.stringify(FULL)), n = t.empties[1].length + t.empties[0].length;
  const g = put({ e1: 'K', e8: 'k' });
  const rep = learnFromCells(t, cellsFor(g, { '3,3': { feat: glyph(88), lumStd: 70, colorScore: 0.5 } }), g);
  assert.equal(rep.skipped, 1);
  assert.equal(rep.contradictions, 0);
  assert.equal(t.empties[1].length + t.empties[0].length, n);
});

test('a book taught before v137 is upgraded on its first lesson and keeps its old shapes', () => {
  const pieces = {};
  for (const code of Object.keys(PARTIAL.samples)) pieces[code] = PARTIAL.samples[code][0];
  const t = { n: N, ver: 3, pieces, empties: { 0: PARTIAL.empties[0][0], 1: PARTIAL.empties[1][0] }, emptyThresh: PARTIAL.emptyThresh, colorRef: PARTIAL.colorRef };
  const g = put({ e1: 'K', e8: 'k', d5: 'Q', c3: 'b', f6: 'N' });
  assert.equal(learnFromCells(t, cellsFor(g), g).learned, true);
  assert.equal(t.ver, 4);
  assert.deepEqual(Object.keys(t.samples).sort(), ['K', 'N', 'P', 'Q', 'R', 'b', 'k', 'p', 'r']);
  assert.deepEqual(classifyCells(cellsFor(g), t).grid, g);
});

test('templates from before v137 (one average per piece) still read', () => {
  const pieces = {}, src = FULL.samples;
  for (const code of Object.keys(src)) pieces[code] = src[code][0];
  const legacy = { n: N, ver: 3, pieces, empties: { 0: FULL.empties[0][0], 1: FULL.empties[1][0] }, emptyThresh: FULL.emptyThresh, colorRef: FULL.colorRef };
  const pos = put({ e1: 'K', e8: 'k', d4: 'Q', a7: 'p' });
  assert.deepEqual(classifyCells(cellsFor(pos), legacy).grid, pos);
});

test('gridToFen writes the placement with a bare, legal tail', () => {
  assert.equal(gridToFen(put({ e1: 'K', e8: 'k', a2: 'P' }), 'b'), '4k3/8/8/8/8/8/P7/4K3 b - - 0 1');
});
