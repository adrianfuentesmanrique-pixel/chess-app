// Diagram → FEN, Stage 2 of the Read tab. Pure image work, NO DOM and NO import
// from app.js, so it can be exercised straight from a test harness with a plain
// ImageData. read.js owns the gesture, the calibration dialog and the hand-off
// to the Setup screen; this file only turns pixels into a board.
//
// The whole approach rests on one fact about a PDF chess diagram (NOT a photo):
// it is clean, axis-aligned, square, and every piece of one type inside one book
// is pixel-identical. So there is no machine learning and nothing leaves the
// phone —
//   1. find the 8x8 grid from the strong, evenly-spaced luminance edges its
//      square boundaries make,
//   2. slice it into 64 cells,
//   3. classify each cell against templates calibrated ONCE per book from a
//      confirmed starting position.
//
// Classification compares EDGE MAPS, not raw pixels: a cell's gradient-magnitude
// map is flat over the (single-shade) square background and only lights up on the
// piece glyph, so the same piece reads almost identically on a light or a dark
// square. Empty squares carry almost no edge energy and are found by that alone.

// Feature resolution: each square is reduced to N×N average-gradient cells. Small
// enough to shrug off a pixel or two of misalignment between the calibration
// board and a later one, big enough to tell a rook from a queen.
const N = 24;
const INSET = 0.07;   // ignore this fraction at each square edge (grid lines, borders)

// Starting position, row 0 = rank 8 (top of a White-at-bottom diagram), col 0 =
// file a. Uppercase = White, lowercase = black; '' = empty. This is the ground
// truth the calibration reads its 12 templates from.
export const START_GRID = [
  ['r','n','b','q','k','b','n','r'],
  ['p','p','p','p','p','p','p','p'],
  ['','','','','','','',''],
  ['','','','','','','',''],
  ['','','','','','','',''],
  ['','','','','','','',''],
  ['P','P','P','P','P','P','P','P'],
  ['R','N','B','Q','K','B','N','R'],
];

// ── grayscale + gradient ────────────────────────────────────────────────────
function toGray(imageData) {
  const { width: W, height: H, data } = imageData;
  const g = new Float32Array(W * H);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    g[i] = data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114;
  }
  return { g, W, H };
}

// Absolute gradient magnitude |dx|+|dy| at an interior pixel.
function gradAt(g, W, H, x, y) {
  if (x <= 0 || y <= 0 || x >= W - 1 || y >= H - 1) return 0;
  const i = y * W + x;
  return Math.abs(g[i + 1] - g[i - 1]) + Math.abs(g[i + W] - g[i - W]);
}

// ── 1-D helpers for grid finding ────────────────────────────────────────────
function smooth(a) {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) {
    let s = 0, n = 0;
    for (let k = -1; k <= 1; k++) { const j = i + k; if (j >= 0 && j < a.length) { s += a[j]; n++; } }
    out[i] = s / n;
  }
  return out;
}

// A chess board is 8 equal squares → 9 evenly-spaced boundary lines, and each
// boundary spans the whole board, so in an EDGE profile it makes a tall peak that
// repeats at the square period. Piece glyphs make edges too, but scattered ones —
// they never line up as a full 9-tooth comb. So instead of trusting individual
// peaks (which piece texture can fake), we slide a 9-tooth comb over every period
// and origin and keep the one whose teeth all land on profile support. Scoring by
// the total support PLUS the weakest tooth rewards a complete grid over a partial
// coincidence.
function findGrid(prof, lo, hi, tap, minGap, maxGap) {
  const sp = smooth(prof);
  // Cap the profile at the 99th percentile. A printed page has strong edges that
  // are NOT board lines — the gutter between text columns, a table rule, a heavy
  // heading — and just one such spike, several times taller than a board boundary,
  // can drag the comb's origin off. Clamping only the extreme top ~1% flattens
  // such a lone spike to near board-line level without touching the board's own
  // nine boundaries (which, when a diagram fills the window, are themselves a few
  // percent of positions — a lower percentile would clip them and break detection).
  const win = []; for (let i = lo; i <= hi; i++) win.push(sp[i]);
  win.sort((a, b) => a - b);
  const cap = win[Math.floor(win.length * 0.99)] || Infinity;

  // support at position p = the strongest profile value within ±2 px (forgives
  // sub-pixel line placement), clamped to the cap above.
  const sup = p => {
    let m = 0; const a = Math.max(lo, p - 2), b = Math.min(hi, p + 2);
    for (let q = a; q <= b; q++) if (sp[q] > m) m = sp[q];
    return m < cap ? m : cap;
  };
  let mean = 0; for (let i = lo; i <= hi; i++) mean += (sp[i] < cap ? sp[i] : cap); mean /= (hi - lo + 1);

  let best = null;
  for (let s = minGap; s <= maxGap; s++) {
    const oLo = Math.max(lo, tap - 8 * s), oHi = Math.min(hi - 8 * s, tap);
    for (let o = oLo; o <= oHi; o++) {
      let sum = 0, mn = Infinity;
      for (let k = 0; k <= 8; k++) { const v = sup(o + k * s); sum += v; if (v < mn) mn = v; }
      const score = sum + 3 * mn;   // completeness (weakest tooth) matters most
      if (!best || score > best.score) best = { score, s, o, mn, sum };
    }
  }
  if (!best) return null;
  // Coarse completeness gate: every tooth must clear the local background by a
  // margin, so the comb has not merely landed on near-uniform noise. This is NOT
  // the board-vs-text discriminator — that job is done downstream by lineContrast
  // (boundaries must dominate cell centres) AND by the requirement that BOTH axes
  // form a grid (a text column has no periodic vertical lines). So this margin is
  // kept deliberately low: on a REAL scanned book the dark squares are hatched,
  // not solid, so the internal white↔hatch boundaries are systematically weaker
  // than a solid board's — measured across a shelf of endgame diagrams the weakest
  // HORIZONTAL tooth ran 1.16–1.27× the mean (vertical ~1.4×). A 1.3× gate rejected
  // the correct grid on almost every real page; 1.15× passes them and still leans
  // on the two strong downstream filters to keep text out.
  // Blank paper has no edges at all: mean is 0, the gate below compares 0 with 0
  // and passes, and a press on a white margin came back as a "board".
  if (!(mean > 0)) return null;
  if (best.mn < mean * 1.15 || best.sum < 9 * mean * 1.8) return null;
  const lines = [];
  for (let k = 0; k <= 8; k++) lines.push(best.o + k * best.s);
  return { lines, s: best.s };
}

// Ratio of edge energy ON the grid lines to edge energy at the cell CENTRES
// (midway between consecutive lines). >1 means the boundaries dominate — the mark
// of a real board; ~1 means the "grid" is just as busy between its lines as on
// them — the mark of text. Each sample takes the strongest profile value within
// ±2 px so a slightly displaced boundary still counts.
function lineContrast(prof, lines, s) {
  const at = p => {
    let m = 0; const a = Math.max(0, Math.round(p) - 2), b = Math.min(prof.length - 1, Math.round(p) + 2);
    for (let q = a; q <= b; q++) if (prof[q] > m) m = prof[q];
    return m;
  };
  let lineMean = 0; for (const L of lines) lineMean += at(L); lineMean /= lines.length;
  let midMean = 0; for (let k = 0; k < 8; k++) midMean += at(lines[k] + s / 2); midMean /= 8;
  return midMean > 0 ? lineMean / midMean : 999;
}

// ── board detection ─────────────────────────────────────────────────────────
// Returns { x0, y0, cw, ch } (top-left of the a8 square + cell size) or null.
//
// The single biggest thing that broke this on a REAL book page (vs a synthetic
// one-diagram test page) was the search window. A printed page is two dense
// columns of text; a window sized to the whole page fills the edge profiles with
// text and column-gutter edges that dwarf the board's nine grid lines, so the
// comb never locks on. The user, though, long-presses ON the diagram, so the
// board is centred near the tap. We therefore search a TAP-CENTRED window and go
// COARSE-TO-FINE: a small window first, which for a compact diagram already
// excludes the surrounding text, growing only if nothing validates — so a large
// diagram (or a whole-page one, like the synthetic test) is still found.
//
// That window search is now the FALLBACK. It was measured on Dvoretsky's Endgame
// Manual (dark squares diagonally HATCHED, not solid) and missed about four
// presses in ten that were plainly on a board, for two reasons:
//   - hatching is all edges, so every row and column of the board is busy and
//     the square boundaries barely rise above it. Whether the comb passed came
//     down to how much white margin the window happened to take in — i.e. to
//     where on the board the finger was;
//   - a window centred on the finger needs to be board-sized to hold the board
//     when the press is near its edge, and then it is half full of the text
//     beside or below the diagram.
// So the first attempt is detectFromBand (below), which works on a TONE map —
// the page blurred just enough that hatching becomes flat grey — and searches a
// strip through the finger rather than a box around it. x0/y0/cw/ch may now be
// fractions of a pixel.
export function detectBoard(imageData, tapX, tapY) {
  const { g, W, H } = toGray(imageData);
  tapX = Math.round(tapX); tapY = Math.round(tapY);
  if (tapX < 1 || tapY < 1 || tapX >= W - 1 || tapY >= H - 1) return null;

  const minDim = Math.min(W, H);

  // Blur radius follows the page width (3 px on the 1065-px canvas of a 375px
  // phone), so a zoomed-in, re-rendered page is smoothed by the same amount of
  // paper. Band half-heights smallest first: a low band sees only the board's
  // own rows; taller ones are for boards whose squares are bigger than the band.
  const r = Math.max(2, Math.round(W / 355));
  const tone = toneMap(g, W, H, r);
  for (const frac of [0.03, 0.06, 0.12, 0.25]) {
    const board = detectFromBand(tone, g, W, H, tapX, tapY, Math.round(frac * minDim), r);
    if (board) return board;
  }

  // Half-window sizes to try, smallest first (fractions of the shorter side).
  // ~0.16 covers a typical one-third-of-the-page book diagram while shutting out
  // the neighbouring column; the larger sizes catch big or full-page diagrams.
  for (const frac of [0.16, 0.22, 0.30, 0.40, 0.48]) {
    const S = Math.round(frac * minDim);
    if (S < 40) continue;
    const found = detectInWindow(g, W, H, tapX, tapY, S);
    if (!found) continue;
    // A window-search grid on a SHADED board must sit on its light/dark pattern.
    // If the pattern says the board is elsewhere on this lattice (a press on the
    // margin just outside a diagram gave a grid stretched over the text above
    // it), take the board the pattern points at, or nothing.
    //
    // And whatever comes back must show the same plain checker pattern the tone
    // search demands (checkerVotes >= 80 of 112). Measured 2026-10-02 over ~144,000
    // presses on 147 pages (Chess Life, Dvoretsky, Hellsten, Silman, FCE): every
    // real board this search found scored >= 80 (388 presses, incl. a Chess Life
    // board the tone search never finds); every grid over text or photos scored
    // under 80, most under 15 (207 of 223 false boards). So line-only boards (no
    // shades) are no longer found here — none exist in those books, and on text
    // they cannot be told apart.
    //
    // One more look after the fit, as detectFromBand does: the window search's
    // lattice can be a few pixels out, and only on the fitted one does a board
    // slid a rank into its caption show (Chess Life p19).
    const minGap = Math.max(10, 5 * r);
    let moved = placeByTone(g, W, H, found, 7, tapX, tapY);
    let board = moved ? fitBoard(tone, W, H, moved, minGap, r) : found;
    const again = board && placeByTone(g, W, H, board, 2, tapX, tapY);
    if (again) { moved = again; board = fitBoard(tone, W, H, again, minGap, r); }
    if (moved) board = accept(g, W, H, board);
    if (board && checkerVotes(g, W, board) >= 80 && !isSlid(g, W, H, board)) return board;
  }
  return null;
}

// The guards a fitted board must pass — the same three the window search
// applies: square squares, lines that stand out from the cell interiors, and a
// checkerboard (or flat paper). `shaded` is for the tone search, which exists
// for SHADED boards: there the light/dark alternation itself must be plain
// (checkerVotes) — text and photos never alternate square by square, so that is
// what keeps them out — and the line test is relaxed, because on a small board
// crowded with pieces (Chess Life, 22–27 px squares) the pieces fill the square
// middles and line contrast came out as low as 1.2. Measured over the whole
// Chess Life issue: every real board scored 89–112 votes of 112, every false
// one (text, or a block slid half off a board) 68 or less. A line-only board has no
// shades: it fails here, and since v132 the window search demands the same
// pattern, so it is not found at all (none in any book measured).
function accept(g, W, H, board, shaded) {
  if (!board) return null;
  const ratio = board.cw / board.ch;
  if (ratio < 0.85 || ratio > 1.18) return null;
  if (board.x0 < 0 || board.y0 < 0 || board.x0 + 8 * board.cw > W || board.y0 + 8 * board.ch > H) return null;
  const lc = Math.min(board.lcV, board.lcH);
  if (shaded ? (lc < 1.1 || checkerVotes(g, W, board) < 80 || isSlid(g, W, H, board)) : lc < 1.35) return null;
  if (!validateCheckerboard(g, W, H, board)) return null;
  return { x0: board.x0, y0: board.y0, cw: board.cw, ch: board.ch };
}

// The page with every pixel replaced by the average of its neighbourhood (a box
// blur run twice, which is close to a Gaussian). Hatching, wood grain and scan
// speckle average out to the square's overall shade, so a dark square becomes a
// flat grey block and its boundary with a light square a single clean step.
function toneMap(g, W, H, r) {
  const a = new Float32Array(W * H), b = new Float32Array(W * H), n = 2 * r + 1;
  const pass = src => {
    for (let y = 0; y < H; y++) {            // along the rows: src → a
      const row = y * W; let s = 0;
      for (let x = -r; x <= r; x++) s += src[row + Math.min(W - 1, Math.max(0, x))];
      for (let x = 0; x < W; x++) {
        a[row + x] = s / n;
        s += src[row + Math.min(W - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < W; x++) {            // down the columns: a → b
      let s = 0;
      for (let y = -r; y <= r; y++) s += a[Math.min(H - 1, Math.max(0, y)) * W + x];
      for (let y = 0; y < H; y++) {
        b[y * W + x] = s / n;
        s += a[Math.min(H - 1, y + r + 1) * W + x] - a[Math.max(0, y - r) * W + x];
      }
    }
  };
  pass(g); pass(b);
  return b;
}

// Edge profiles over a rectangle: vertical edges summed down each column, and
// horizontal edges summed along each row. Same measure detectInWindow uses.
function colProfile(e, W, xLo, xHi, yLo, yHi) {
  const p = new Float32Array(W);
  for (let y = yLo; y <= yHi; y++) {
    const row = y * W;
    for (let x = xLo; x <= xHi; x++) p[x] += Math.abs(e[row + x + 1] - e[row + x - 1]);
  }
  return p;
}
function rowProfile(e, W, H, xLo, xHi, yLo, yHi) {
  const p = new Float32Array(H);
  for (let y = yLo; y <= yHi; y++) {
    const row = y * W; let s = 0;
    for (let x = xLo; x <= xHi; x++) s += Math.abs(e[row + x + W] - e[row + x - W]);
    p[y] = s;
  }
  return p;
}

// The tone search's comb. Like findGrid, but each tooth scores by how far it
// stands ABOVE the profile half a square either side (the square middles), not
// by its height alone. Two failures this removes, both measured on Chess Life
// (small boards, two text columns):
//   - text is busy everywhere, so it supports a comb at any spacing; by height
//     alone a comb half on the board and half on the next column won;
//   - a comb at TWICE the square size lands on every other line and also scores
//     well by height; here its half-way points fall on the lines it skipped, so
//     it scores nothing.
// No mean-based gate: the guards in accept() decide.
function findComb(prof, lo, hi, tap, minGap, maxGap) {
  const sp = smooth(prof);
  const win = []; for (let i = lo; i <= hi; i++) win.push(sp[i]);
  win.sort((a, b) => a - b);
  const cap = win[Math.floor(win.length * 0.99)] || Infinity;
  const at = p => { p = Math.round(p); if (p < lo || p > hi) return 0; return sp[p] < cap ? sp[p] : cap; };
  const sup = p => { let m = 0; for (let q = Math.max(lo, p - 2); q <= Math.min(hi, p + 2); q++) if (sp[q] > m) m = sp[q]; return m < cap ? m : cap; };
  let best = null;
  for (let s = minGap; s <= maxGap; s++) {
    const oLo = Math.max(lo, tap - 8 * s), oHi = Math.min(hi - 8 * s, tap);
    for (let o = oLo; o <= oHi; o++) {
      let sum = 0, mn = Infinity;
      for (let k = 0; k <= 8; k++) {
        const t = o + k * s;
        const c = sup(t) - 0.5 * (at(t - s / 2) + at(t + s / 2));
        sum += c; if (c < mn) mn = c;
      }
      const score = sum + 3 * mn;
      if (!best || score > best.score) best = { score, s, o, mn };
    }
  }
  if (!best || !(best.mn > 0)) return null;
  const lines = [];
  for (let k = 0; k <= 8; k++) lines.push(best.o + k * best.s);
  return { lines, s: best.s };
}

// The finger is ON the board, so:
//   1. a low band of rows through the finger, as wide as the page, holds the
//      board's vertical lines and (inside the board's own width) nothing else →
//      the files;
//   2. only the columns just found, over the rows boardRows says the board
//      covers (or a board-height either side of the finger) → the ranks. Text
//      beside the diagram never enters this profile;
//   3. the comb can still sit a rank or a file off (a caption line or the rank
//      numbers stand in for the missing boundary), so the light/dark pattern
//      picks the 8x8 block (placeByTone), and the grid is fitted again from
//      exactly that block (fitBoard).
// From step 3 on nothing depends on where the finger was, which is why every
// press on a board ends on the same grid. `e` is the tone map, `g` the page.
function detectFromBand(e, g, W, H, tapX, tapY, h, r) {
  const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));
  const minGap = Math.max(10, 5 * r);       // a square the blur would swallow is not seen here

  const vx = findComb(colProfile(e, W, 1, W - 2, cl(tapY - h, 1, H - 2), cl(tapY + h, 1, H - 2)),
                      1, W - 2, tapX, minGap, Math.floor((W - 3) / 8));
  if (!vx) return null;

  // Squares are square to within the 0.85–1.18 allowed below, so the board lies
  // within 9.5 file-widths of the finger.
  const ext = boardRows(e, W, H, vx, tapY);
  const yLo = ext ? cl(ext[0] - 1.2 * vx.s, 1, H - 2) : cl(tapY - 9.5 * vx.s, 1, H - 2);
  const yHi = ext ? cl(ext[1] + 1.2 * vx.s, 1, H - 2) : cl(tapY + 9.5 * vx.s, 1, H - 2);
  const hy = findComb(rowProfile(e, W, H, cl(vx.lines[0], 1, W - 2), cl(vx.lines[8], 1, W - 2), yLo, yHi),
                      yLo, yHi, tapY, Math.max(minGap, Math.floor(vx.s * 0.85)), Math.ceil(vx.s * 1.18));
  if (!hy) return null;

  let board = { x0: vx.lines[0], y0: hy.lines[0], cw: vx.s, ch: hy.s };
  // Up to 7 squares off is possible while the finger is still inside the comb;
  // after the first fit the lattice is exact and one more look settles it.
  board = fitBoard(e, W, H, placeByTone(g, W, H, board, 7, tapX, tapY) || board, minGap, r);
  if (!board) return null;
  const moved = placeByTone(g, W, H, board, 2, tapX, tapY);
  if (moved) { board = fitBoard(e, W, H, moved, minGap, r); if (!board) return null; }

  return accept(g, W, H, board, true);
}

// How far up and down from the finger the board goes, from the files just
// found: inside a board every row crosses a light/dark step at each inner file
// line, and hardly any at the square middles; text rows do not line up with
// the files. Returns [top, bottom] rows, or null (then the ranks are searched in
// a board-height either side of the finger). Measured on Chess Life: without
// this the lines of bold moves just above and below a small diagram swamped
// its pale rank lines.
function boardRows(e, W, H, vx, tapY) {
  const s = vx.s, L = vx.lines, lo = Math.max(3, Math.round(tapY - 9.5 * s)), hi = Math.min(H - 4, Math.round(tapY + 9.5 * s));
  if (L[0] < 3 || L[8] > W - 4) return null;
  const n = hi - lo + 1, a = new Float32Array(n), b = new Float32Array(n);
  for (let y = lo; y <= hi; y++) {
    const row = y * W; let sa = 0, sb = 0;
    for (let k = 1; k <= 7; k++) { const x = Math.round(L[k]); sa += Math.abs(e[row + x + 2] - e[row + x - 2]); }
    for (let k = 0; k < 8; k++) { const x = Math.round(L[k] + s / 2); sb += Math.abs(e[row + x + 2] - e[row + x - 2]); }
    a[y - lo] = sa / 7; b[y - lo] = sb / 8;
  }
  const w = Math.max(2, Math.round(s / 4));
  const ok = i => { let sa = 0, sb = 0, c = 0;
    for (let j = Math.max(0, i - w); j <= Math.min(n - 1, i + w); j++) { sa += a[j]; sb += b[j]; c++; }
    return sa / c > 1.5 * (sb / c) + 2; };
  let t = tapY - lo; if (!ok(t)) return null;
  let top = t, bot = t;
  while (top > 0 && ok(top - 1)) top--;
  while (bot < n - 1 && ok(bot + 1)) bot++;
  if (bot - top < 5 * s) return null;
  return [top + lo, bot + lo];
}

// Re-find the grid from exactly the block `b` (plus half a square of margin, so
// the comb cannot slide a whole square), then fit it to a fraction of a pixel.
// Returns the board with its two line contrasts, or null.
function fitBoard(e, W, H, b, minGap, r) {
  const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));
  const cx = Math.round(b.x0 + 4 * b.cw), cy = Math.round(b.y0 + 4 * b.ch);
  const sx = Math.round(b.cw), sy = Math.round(b.ch);
  const xLo = cl(b.x0 - 0.5 * b.cw, 1, W - 2), xHi = cl(b.x0 + 8.5 * b.cw, 1, W - 2);
  const yLo = cl(b.y0 - 0.5 * b.ch, 1, H - 2), yHi = cl(b.y0 + 8.5 * b.ch, 1, H - 2);

  const vcol = colProfile(e, W, xLo, xHi, cl(b.y0, 1, H - 2), cl(b.y0 + 8 * b.ch, 1, H - 2));
  const vx = findComb(vcol, xLo, xHi, cx, Math.max(minGap, sx - 2), sx + 2);
  if (!vx) return null;
  const hrow = rowProfile(e, W, H, cl(vx.lines[0], 1, W - 2), cl(vx.lines[8], 1, W - 2), yLo, yHi);
  const hy = findComb(hrow, yLo, yHi, cy, Math.max(minGap, sy - 2), sy + 2);
  if (!hy) return null;

  const fx = refineAxis(vcol, xLo, xHi, vx, r), fy = refineAxis(hrow, yLo, yHi, hy, r);
  const lines = f => { const a = []; for (let k = 0; k <= 8; k++) a.push(f.o + k * f.s); return a; };
  return { x0: fx.o, y0: fy.o, cw: fx.s, ch: fy.s,
           lcV: lineContrast(vcol, lines(fx), fx.s), lcH: lineContrast(hrow, lines(fy), fy.s) };
}

// findGrid works in whole pixels and forgives ±2, which over eight squares let
// Dvoretsky's 47-px squares read as 48 and the far side drift by 8 px. Fit the
// period and origin to a fraction of a pixel instead — on the SEVEN INNER lines
// only: the outer two sit beside a frame, often a double one, whose own edges
// would pull the fit outward.
function refineAxis(prof, lo, hi, grid, r) {
  const n = hi - lo + 1, sp = new Float32Array(n);
  for (let i = 0; i < n; i++) {             // smooth over the blur width: one peak per line
    let s = 0, c = 0;
    for (let k = -r; k <= r; k++) { const j = i + k; if (j >= 0 && j < n) { s += prof[lo + j]; c++; } }
    sp[i] = s / c;
  }
  const at = p => {
    const q = p - lo; if (q < 0 || q > n - 1) return 0;
    const i = Math.floor(q), f = q - i;
    return sp[i] * (1 - f) + (i + 1 < n ? sp[i + 1] : sp[i]) * f;
  };
  const o0 = grid.lines[0], s0 = grid.s;
  let best = { score: -1, o: o0, s: s0 };
  for (let s = s0 - 1.5; s <= s0 + 1.5; s += 0.125) {
    for (let o = o0 - 4; o <= o0 + 4; o += 0.25) {
      let sum = 0; for (let k = 1; k <= 7; k++) sum += at(o + k * s);
      if (sum > best.score) best = { score: sum, o, s };
    }
  }
  return best;
}

// Which 8x8 block of the lattice is the board? On a shaded board neighbouring
// squares alternate light/dark and the paper around them does not, so the
// block with the most neighbour pairs that alternate the right way is the
// board: slid one square off, it trades a real rank or file for a strip of
// paper. Each pair is a VOTE (+1/−1/0), not a sum of brightness differences, so
// a photo next to a pale magazine board cannot outweigh it by contrast alone.
// Only blocks within two squares of the finger count, and one that holds the
// finger wins unless another scores clearly (5%) higher — on a page of puzzle
// boards laid out on one grid, a neighbouring board fits the lattice just as
// well; a block slid one square off a board scores ~1/8 lower.
// Looks up to R squares each way. Returns the moved board, or null to stay put
// (already right, or a line-only board with no shades to go by).
function placeByTone(g, W, H, b, R, tapX, tapY) {
  const n = 8 + 2 * R, t = new Float32Array(n * n).fill(NaN);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = b.x0 + (i - R) * b.cw, y = b.y0 + (j - R) * b.ch;
    if (x < 1 || y < 1 || x + b.cw > W - 1 || y + b.ch > H - 1) continue;   // off the page
    t[j * n + i] = cellTone(g, W, b, j - R, i - R);
  }
  const T = (r, c) => (r < 0 || c < 0 || r >= n || c >= n) ? NaN : t[r * n + c];
  let best = null, held = null, here = 0;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const bx = b.x0 + dx * b.cw, by = b.y0 + dy * b.ch;
    if (tapX < bx - 2 * b.cw || tapX > bx + 10 * b.cw || tapY < by - 2 * b.ch || tapY > by + 10 * b.ch) continue;
    const holds = tapX >= bx && tapX <= bx + 8 * b.cw && tapY >= by && tapY <= by + 8 * b.ch;
    let s = 0, bad = false;
    for (let r = 0; r < 8 && !bad; r++) for (let c = 0; c < 8; c++) {
      const v = T(r + dy + R, c + dx + R);
      if (v !== v) { bad = true; break; }
      const sg = ((r + c) & 1) ? -1 : 1;
      if (c < 7) { const d = sg * (v - T(r + dy + R, c + 1 + dx + R)); s += d > 3 ? 1 : d < -3 ? -1 : 0; }
      if (r < 7) { const d = sg * (v - T(r + 1 + dy + R, c + dx + R)); s += d > 3 ? 1 : d < -3 ? -1 : 0; }
    }
    if (bad) continue;                       // block runs off the page
    // `line` signs by lattice position, `s` by position in the block
    if (slidBlock(T, dy + R, dx + R, (s < 0 ? -1 : 1) * (((dx + dy) & 1) ? -1 : 1))) continue;
    s = Math.abs(s);
    if (dx === 0 && dy === 0) here = s;
    if (!best || s > best.s) best = { s, dx, dy };
    if (holds && (!held || s > held.s)) held = { s, dx, dy };
  }
  if (held && held.s >= 0.95 * best.s) best = held;
  if (!best || (best.dx === 0 && best.dy === 0) || best.s <= here) return null;
  if (best.s < 40) return null;              // under 40 of 112 pairs: no shades to go by
  return { x0: b.x0 + best.dx * b.cw, y0: b.y0 + best.dy * b.ch, cw: b.cw, ch: b.ch };
}

// Is the 8x8 block whose top-left cell is (r, c) a board slid one square? Then
// its outer rank (or file) on one side is paper or a caption — which does not
// alternate ALONG the line — while the line just beyond the opposite side still
// does: the real rank it dropped. The block's total cannot tell: paper tinted
// between the two square shades (Chess Life puzzle pages: paper 241, squares
// 254/194) votes with every square of the rank beside it, so the slid block lost
// only the 7 pairs along the line, and a title's letters won some of those back
// (measured: 106–109 of 112 against the true block's 112) — close enough for the
// block that holds the finger to win. `T(r, c)` gives a cell's tone (NaN off the
// page: no vote); `sign` is the block's own vote sign on T's lattice.
//
// Counting the pairs is not enough: a caption or a line of text can alternate by
// chance, but FAINTLY. FCE p120: the text line above the board alternated on all
// 7 pairs, by ~20 shades against the board's ~50; Chess Life p52: the blue caption
// scored 3, the same as the true top rank with its two pieces — and there the
// slid board came back even from presses inside the board. So each line is also
// scored by HOW MUCH it alternates (`w`: every pair as a share of the block's own
// light/dark step, capped at 1). Measured over 133 pages / ~129,000 presses:
// slid presses 201 -> 7, no press that gave the true board lost it.
function slidBlock(T, r, c, sign) {
  // the block's own light/dark step: the median difference between neighbours
  const ds = [];
  for (let i = 0; i < 8; i++) for (let j = 0; j < 7; j++) { const d = Math.abs(T(r + i, c + j) - T(r + i, c + j + 1)); if (d === d) ds.push(d); }
  ds.sort((a, b) => a - b);
  const C = Math.max(4, ds[ds.length >> 1] || 0);
  const line = (r, c, dr, dc) => {           // the 7 neighbour pairs along 8 cells
    let s = 0, w = 0;
    for (let k = 0; k < 7; k++, r += dr, c += dc) {
      const d = (((r + c) & 1) ? -1 : 1) * (T(r, c) - T(r + dr, c + dc));
      s += d > 3 ? 1 : d < -3 ? -1 : 0;
      if (d > 3 || d < -3) w += Math.max(-1, Math.min(1, d / C));
    }
    return { s: sign * s, w: sign * w };
  };
  const weak = (outer, beyond) => (beyond.s >= 5 && outer.s <= beyond.s - 3) || (beyond.w >= 4 && outer.w <= beyond.w - 2.5);
  return weak(line(r, c, 0, 1), line(r + 8, c, 0, 1)) || weak(line(r + 7, c, 0, 1), line(r - 1, c, 0, 1)) ||
         weak(line(r, c, 1, 0), line(r, c + 8, 1, 0)) || weak(line(r, c + 7, 1, 0), line(r, c - 1, 1, 0));
}

// The same test on a finished board: placeByTone only looks within two squares
// of the finger, so a press further out (in the text above a puzzle board) can
// still end on a slid block with nothing better in reach. Then there is no board.
function isSlid(g, W, H, b) {
  const t = new Map();
  const T = (r, c) => {
    const k = r * 16 + c;
    if (!t.has(k)) {
      const x = b.x0 + c * b.cw, y = b.y0 + r * b.ch;
      t.set(k, (x < 1 || y < 1 || x + b.cw > W - 1 || y + b.ch > H - 1) ? NaN : cellTone(g, W, b, r, c));
    }
    return t.get(k);
  };
  let s = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 7; c++) {
    const d = (((r + c) & 1) ? -1 : 1) * (T(r, c) - T(r, c + 1));
    s += d > 3 ? 1 : d < -3 ? -1 : 0;
  }
  return slidBlock(T, 0, 0, s < 0 ? -1 : 1);
}

// placeByTone's vote for one block, as a count of the 112 neighbour pairs.
function checkerVotes(g, W, b) {
  const t = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) t.push(cellTone(g, W, b, r, c));
  let s = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const v = t[r * 8 + c], sg = ((r + c) & 1) ? -1 : 1;
    if (c < 7) { const d = sg * (v - t[r * 8 + c + 1]); s += d > 3 ? 1 : d < -3 ? -1 : 0; }
    if (r < 7) { const d = sg * (v - t[r * 8 + c + 8]); s += d > 3 ? 1 : d < -3 ? -1 : 0; }
  }
  return Math.abs(s);
}

// Shade of one square's background: the median of four small patches near its
// corners, where a centred piece glyph does not reach. (The cell's mean was
// measured wrong on Chess Life: a black piece on a light square made it darker
// than an empty dark square.) r/c may be outside 0–7 (placeByTone looks around
// the board).
function cellTone(g, W, board, r, c) {
  const x0 = board.x0 + c * board.cw, y0 = board.y0 + r * board.ch;
  const patch = (fx, fy) => {
    const xa = Math.round(x0 + fx * board.cw), xb = Math.round(x0 + (fx + 0.15) * board.cw);
    const ya = Math.round(y0 + fy * board.ch), yb = Math.round(y0 + (fy + 0.15) * board.ch);
    let s = 0, n = 0;
    for (let y = ya; y < yb; y++) { const row = y * W; for (let x = xa; x < xb; x++) { s += g[row + x]; n++; } }
    return n ? s / n : 255;
  };
  const p = [patch(0.1, 0.1), patch(0.75, 0.1), patch(0.1, 0.75), patch(0.75, 0.75)].sort((a, b) => a - b);
  return (p[1] + p[2]) / 2;
}

// One coarse-to-fine attempt: build the edge profiles inside a tap-centred window
// of half-size S, find the grid on each axis, and validate squareness + a
// checkerboard/flat-paper parity. Returns the board or null.
function detectInWindow(g, W, H, tapX, tapY, S) {
  const xLo = Math.max(1, tapX - S), xHi = Math.min(W - 2, tapX + S);
  const yLo = Math.max(1, tapY - S), yHi = Math.min(H - 2, tapY + S);

  const vcol = new Float32Array(W);   // vertical edges → vertical grid lines
  const hrow = new Float32Array(H);   // horizontal edges → horizontal grid lines
  for (let y = yLo; y <= yHi; y++) {
    const row = y * W;
    for (let x = xLo; x <= xHi; x++) {
      vcol[x] += Math.abs(g[row + x + 1] - g[row + x - 1]);
      hrow[y] += Math.abs(g[row + x + W] - g[row + x - W]);
    }
  }

  const minGap = 10;                        // a square smaller than this is noise
  const maxGap = Math.round((2 * S) / 8);   // board can fill the window at most
  const vx = findGrid(vcol, xLo, xHi, tapX, minGap, maxGap);
  const hy = findGrid(hrow, yLo, yHi, tapY, minGap, maxGap);
  if (!vx || !hy) return null;

  // Squares must be square: the two spacings agree, or it is not a chess board.
  const ratio = vx.s / hy.s;
  if (ratio < 0.85 || ratio > 1.18) return null;

  // Grid lines must stand out from cell interiors. On a real board the square
  // BOUNDARIES (where shades flip, or the printed lines) carry far more edge
  // energy than the cell CENTRES (flat shade, or a sparse centred glyph). In a
  // block of text a coincidental "grid" has as much energy between its lines as
  // on them, so this contrast is the strong, size-independent filter that a bare
  // squareness/parity test lacks — it kills the text false positives.
  if (lineContrast(vcol, vx.lines, vx.s) < 1.35) return null;
  if (lineContrast(hrow, hy.lines, hy.s) < 1.35) return null;

  const board = { x0: vx.lines[0], y0: hy.lines[0], cw: vx.s, ch: hy.s };

  // Reject a board that reaches the window edge: the window then almost certainly
  // CLIPPED it, and the comb locked onto a truncated span with the wrong period
  // and origin (this is what made a real board read one file inward). A board
  // that touches the edge is discarded so the coarse-to-fine search grows the
  // window until the whole board fits with a margin — only then is it trusted.
  const mx = board.cw * 0.2, my = board.ch * 0.2;
  if (board.x0 < xLo + mx || board.x0 + 8 * board.cw > xHi - mx ||
      board.y0 < yLo + my || board.y0 + 8 * board.ch > yHi - my) return null;

  if (!validateCheckerboard(g, W, H, board)) return null;
  return board;
}

// Guards against locking onto a table or a block of text. A real diagram's empty
// squares are either two shades in a checkerboard, or all one paper shade
// (line-only boards). Either is fine; a grid with neither is not a board.
function validateCheckerboard(g, W, H, board) {
  const bright = [];   // mean luminance of each cell's core
  const energy = [];   // mean edge energy of each cell's core
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const m = cellStats(g, W, H, board, r, c);
      bright.push(m.bright); energy.push(m.energy);
    }
  }
  const eSorted = [...energy].sort((a, b) => a - b);
  const emptyCut = eSorted[Math.floor(eSorted.length * 0.4)];   // ~empty squares
  const light = [], dark = [];
  for (let i = 0; i < 64; i++) {
    if (energy[i] > emptyCut) continue;                 // skip occupied squares
    ((((i / 8) | 0) + (i % 8)) % 2 === 0 ? light : dark).push(bright[i]);
  }
  if (light.length < 4 || dark.length < 4) return true; // too few empties to judge → trust the grid
  const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
  const la = avg(light), da = avg(dark);
  const all = [...light, ...dark];
  const spread = Math.max(...all) - Math.min(...all);
  if (spread < 26) return true;                         // flat → line-only board, fine
  return Math.abs(la - da) > spread * 0.35;             // shaded → parity must separate
}

// ── per-cell feature ────────────────────────────────────────────────────────
function cellRect(board, r, c) {
  const x = board.x0 + c * board.cw, y = board.y0 + r * board.ch;
  const ix = board.cw * INSET, iy = board.ch * INSET;
  return { x0: x + ix, y0: y + iy, w: board.cw - 2 * ix, h: board.ch - 2 * iy };
}

function cellStats(g, W, H, board, r, c) {
  const R = cellRect(board, r, c);
  let sB = 0, sE = 0, n = 0;
  const x1 = Math.max(1, Math.round(R.x0)), x2 = Math.min(W - 2, Math.round(R.x0 + R.w));
  const y1 = Math.max(1, Math.round(R.y0)), y2 = Math.min(H - 2, Math.round(R.y0 + R.h));
  for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) {
    sB += g[y * W + x]; sE += gradAt(g, W, H, x, y); n++;
  }
  n = n || 1;
  return { bright: sB / n, energy: sE / n };
}

// N×N average-gradient map of one cell, box-blurred a touch and L2-normalized.
// Returns { feat: Float32Array(N*N), energy, lumStd }. `feat` matches piece to
// piece. Occupancy (empty vs a piece) is decided by `lumStd`, the standard
// deviation of luminance across the cell core — NOT by `energy` (mean gradient).
// On a REAL printed board every square carries a wood-grain / paper texture whose
// scattered edges give an empty square almost as much gradient energy as a sparse
// piece, so the old energy test read a whole board as empty. Texture is low in
// amplitude though: its luminance barely strays from the square's shade, while a
// piece is a large blob far from it, so lumStd separates them cleanly. `energy`
// is still returned for the checkerboard/parity gate.
function cellFeature(g, W, H, board, r, c) {
  const R = cellRect(board, r, c);
  const grid = new Float32Array(N * N);
  let energy = 0;
  for (let sy = 0; sy < N; sy++) {
    for (let sx = 0; sx < N; sx++) {
      const gx0 = R.x0 + (sx / N) * R.w, gx1 = R.x0 + ((sx + 1) / N) * R.w;
      const gy0 = R.y0 + (sy / N) * R.h, gy1 = R.y0 + ((sy + 1) / N) * R.h;
      let s = 0, n = 0;
      for (let y = Math.round(gy0); y < Math.round(gy1); y++) {
        for (let x = Math.round(gx0); x < Math.round(gx1); x++) {
          s += gradAt(g, W, H, x, y); n++;
        }
      }
      const v = n ? s / n : 0;
      grid[sy * N + sx] = v; energy += v;
    }
  }
  energy /= (N * N);
  // Luminance spread across the cell core — the texture-robust occupancy signal.
  // Also gather a square-INDEPENDENT colour cue: where the centre of the cell (a
  // piece's body) sits within the cell's own dark→light range. A solid black
  // piece has a dark centre (near the cell minimum); a hollow white piece has a
  // light centre (near the maximum). Using the cell's OWN range as the reference
  // cancels the square shade, which a raw luminance can't.
  let sL = 0, sL2 = 0, nL = 0, cMin = 255, cMax = 0, cenS = 0, cenN = 0;
  const lx1 = Math.max(1, Math.round(R.x0)), lx2 = Math.min(W - 2, Math.round(R.x0 + R.w));
  const ly1 = Math.max(1, Math.round(R.y0)), ly2 = Math.min(H - 2, Math.round(R.y0 + R.h));
  const cx0 = R.x0 + R.w * 0.28, cx1 = R.x0 + R.w * 0.72, cy0 = R.y0 + R.h * 0.28, cy1 = R.y0 + R.h * 0.72;
  for (let y = ly1; y < ly2; y++) for (let x = lx1; x < lx2; x++) {
    const L = g[y * W + x]; sL += L; sL2 += L * L; nL++;
    if (L < cMin) cMin = L; if (L > cMax) cMax = L;
    if (x >= cx0 && x < cx1 && y >= cy0 && y < cy1) { cenS += L; cenN++; }
  }
  nL = nL || 1;
  const lumMean = sL / nL;
  const lumStd = Math.sqrt(Math.max(0, sL2 / nL - lumMean * lumMean));
  const centerLum = cenN ? cenS / cenN : lumMean;
  const colorScore = cMax > cMin ? (centerLum - cMin) / (cMax - cMin) : 0.5;  // 0 = dark centre, 1 = light
  // 3×3 blur to forgive sub-cell misalignment between two diagrams.
  const blur = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = y + dy, xx = x + dx;
      if (yy >= 0 && yy < N && xx >= 0 && xx < N) { s += grid[yy * N + xx]; n++; }
    }
    blur[y * N + x] = s / n;
  }
  let norm = 0; for (let i = 0; i < blur.length; i++) norm += blur[i] * blur[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < blur.length; i++) blur[i] /= norm;
  return { feat: blur, energy, lumStd, colorScore };
}

function cosDist(a, b) {   // a,b already L2-normalized → 1 - dot ∈ [0,2]
  let dot = 0; for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return 1 - dot;
}

// ── calibration: templates from a confirmed starting position ───────────────
// Returns a JSON/structured-clone-safe object stored on the book record.
// The starting position is the common case (most books open on one), so this is
// a thin wrapper over buildTemplatesFromGrid with the known START_GRID layout.
export function buildTemplates(imageData, board) {
  return buildTemplatesFromGrid(imageData, board, START_GRID);
}

// Same edge-map features, but the ground-truth layout is supplied by the caller
// instead of assumed to be the start. read.js's tap-to-teach fallback uses this
// for a book that opens on a NON-start diagram: the user taps each occupied
// square, names the piece, and that hand-built 8×8 grid teaches this book's own
// figurine style exactly as a confirmed start would. Only the piece codes that
// actually appear in `grid` get templates — a later diagram containing a piece
// type the user never taught can't match, so it reads as uncertain (honest
// degradation) rather than a confident wrong guess.
export function buildTemplatesFromGrid(imageData, board, grid) {
  const { g, W, H } = toGray(imageData);
  const acc = {}, cnt = {};
  // Empty-square templates, kept separate per square colour (parity 0 = the
  // a8-coloured squares, 1 = the other). An empty square's own edge texture —
  // the diagonal hatching many books shade dark squares with, or flat paper —
  // is a signature the classifier can match against, which lumStd alone cannot
  // do when the hatching is bold enough to spread luminance as much as a piece.
  const empAcc = { 0: new Float32Array(N * N), 1: new Float32Array(N * N) };
  const empCnt = { 0: 0, 1: 0 };
  const emptyStd = [], pieceStd = [], pieceCol = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const code = grid[r][c];
    const { feat, lumStd, colorScore } = cellFeature(g, W, H, board, r, c);
    const par = (r + c) % 2;
    if (!code) {
      emptyStd.push(lumStd);
      for (let i = 0; i < feat.length; i++) empAcc[par][i] += feat[i];
      empCnt[par]++;
      continue;
    }
    pieceStd.push(lumStd);
    pieceCol.push({ code, colorScore });
    if (!acc[code]) { acc[code] = new Float32Array(N * N); cnt[code] = 0; }
    for (let i = 0; i < feat.length; i++) acc[code][i] += feat[i];
    cnt[code]++;
  }
  const normalize = f => { let n = 0; for (let i = 0; i < f.length; i++) n += f[i] * f[i]; n = Math.sqrt(n) || 1; for (let i = 0; i < f.length; i++) f[i] /= n; };
  const pieces = {};
  for (const code of Object.keys(acc)) {
    const f = acc[code];
    for (let i = 0; i < f.length; i++) f[i] /= cnt[code];
    normalize(f);   // re-normalize the average so distances stay comparable
    pieces[code] = Array.from(f);
  }
  // Per-colour empty templates need at least two samples to average out a stray
  // square; a colour with too few empties simply gets none (classification then
  // falls back to the lumStd threshold for that colour).
  const empties = {};
  for (const par of [0, 1]) {
    if (empCnt[par] < 2) continue;
    const f = empAcc[par];
    for (let i = 0; i < f.length; i++) f[i] /= empCnt[par];
    normalize(f);
    empties[par] = Array.from(f);
  }
  // lumStd threshold retained as the ver-2 fallback for classification (legacy
  // templates, or a colour with too few empties to build an empty pattern).
  const pct = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.max(0, Math.round((arr.length - 1) * p)))] : null;
  emptyStd.sort((a, b) => a - b); pieceStd.sort((a, b) => a - b);
  const emptyHi = pct(emptyStd, 0.95), pieceLo = pct(pieceStd, 0.05);
  let emptyThresh;
  if (emptyHi == null) emptyThresh = (pieceLo ?? 20) * 0.5;
  else if (pieceLo == null) emptyThresh = emptyHi * 1.5 + 4;
  else emptyThresh = pieceLo > emptyHi ? (emptyHi + pieceLo) / 2 : (emptyHi + pieceLo) / 2 + 2;
  // Piece COLOUR from fill. Edge shape alone can't tell a hollow white piece from
  // a solid black one of the same type, so classification kept swapping colours.
  // colorScore (0 = dark centre, 1 = light centre, measured against the cell's own
  // range so the square shade cancels) separates them: learn each colour's average
  // so classification takes the TYPE from the shape and the COLOUR from the fill —
  // but only when the two colours clearly separate in this book.
  const wC = [], bC = [];
  for (const p of pieceCol) (p.code === p.code.toUpperCase() ? wC : bC).push(p.colorScore);
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  let colorRef = null;
  if (wC.length && bC.length) {
    const white = mean(wC), black = mean(bC);
    if (white - black > 0.15) colorRef = { white, black };  // clearly separable
  }
  return { n: N, ver: 3, pieces, emptyThresh, empties, colorRef };
}

// ── classification ──────────────────────────────────────────────────────────
// Returns { grid:8×8 codes, fen, confident:bool, uncertain:int, kingsOk:bool }.
export function classifyBoard(imageData, board, templates, turn = 'w') {
  const { g, W, H } = toGray(imageData);
  const codes = Object.keys(templates.pieces);
  const tmpl = {};
  for (const c of codes) tmpl[c] = Float32Array.from(templates.pieces[c]);
  // Per-colour empty templates (ver ≥ 3) drive the occupancy test below —
  // robust to bold hatching, which the lumStd threshold (the ver-2 fallback,
  // still used for legacy templates or a colour with too few empties) reads as
  // a piece.
  const empVec = {};
  if (templates.empties) for (const p of Object.keys(templates.empties)) empVec[p] = Float32Array.from(templates.empties[p]);

  const grid = [];
  let uncertain = 0, wk = 0, bk = 0, maxD1 = 0, minMargin = Infinity;
  for (let r = 0; r < 8; r++) {
    const row = [];
    for (let c = 0; c < 8; c++) {
      const { feat, lumStd, colorScore } = cellFeature(g, W, H, board, r, c);
      let d1 = Infinity, d2 = Infinity, best = '';
      for (const code of codes) {
        const d = cosDist(feat, tmpl[code]);
        if (d < d1) { d2 = d1; d1 = d; best = code; }
        else if (d < d2) { d2 = d; }
      }
      // Shape gives the TYPE but can't tell a hollow white piece from a solid
      // black one. Use fill (colorScore) as a tie-breaker for the COLOUR — but
      // only when it lands DECISIVELY on the light or dark side of the two learned
      // averages. A fill near the midpoint is ambiguous, so trust the shape rather
      // than risk flipping a colour the shape already had right.
      const cr = templates.colorRef;
      if (best && cr) {
        const mid = (cr.white + cr.black) / 2, band = (cr.white - cr.black) * 0.25;
        if (colorScore > mid + band) best = best.toUpperCase();
        else if (colorScore < mid - band) best = best.toLowerCase();
      }
      // Occupied only when the cell sits closer to some piece template than to
      // its colour's empty pattern. A real piece hugs its own template (d1≈0)
      // while standing well clear of the empty pattern — including a dark piece
      // on a dark hatched square, which is nearly uniform and so fools the
      // luminance-spread test. An empty square, hatched or not, sits at least as
      // close to the empty pattern as to any piece, so it stays empty instead of
      // turning into a spurious queen. Legacy templates and colours with no empty
      // pattern fall back to the lumStd threshold.
      const empP = empVec[(r + c) % 2];
      const isEmpty = empP ? d1 >= cosDist(feat, empP)
                           : lumStd < templates.emptyThresh;
      if (isEmpty) { row.push(''); continue; }
      row.push(best);
      if (best === 'K') wk++; else if (best === 'k') bk++;
      if (d1 > maxD1) maxD1 = d1;
      if (d2 - d1 < minMargin) minMargin = d2 - d1;
      // Absolute match is the trustworthy signal (within a book, a piece is
      // pixel-identical to its template, so a good match sits near 0). A very
      // tight race with the runner-up is a weaker warning sign on top of that.
      if (d1 > 0.3 || (d2 - d1) < 0.015) uncertain++;
    }
    grid.push(row);
  }
  const kingsOk = wk === 1 && bk === 1;
  const confident = uncertain === 0 && kingsOk;
  return { grid, fen: gridToFen(grid, turn), confident, uncertain, kingsOk,
           maxD1: +maxD1.toFixed(3), minMargin: +(minMargin === Infinity ? 0 : minMargin).toFixed(3) };
}

// ── FEN ─────────────────────────────────────────────────────────────────────
export function gridToFen(grid, turn = 'w') {
  const rows = [];
  for (let r = 0; r < 8; r++) {
    let row = '', empty = 0;
    for (let c = 0; c < 8; c++) {
      const code = grid[r][c];
      if (!code) { empty++; continue; }
      if (empty) { row += empty; empty = 0; }
      row += code;
    }
    if (empty) row += empty;
    rows.push(row);
  }
  // Castling '-': a scanned diagram cannot prove rights. The user fixes turn and
  // rights in Setup; a bare, legal placement is the honest default.
  return `${rows.join('/')} ${turn} - - 0 1`;
}

// Crops the detected board to its own small canvas for the calibration preview.
// padFrac adds a margin (as a fraction of a cell) so the outermost squares are
// not clipped — the default 0.05 suits the "is this the start?" preview. The
// tap-to-teach overlay passes 0 so the crop is EXACTLY the 8×8 board and its
// square grid maps to clean eighths of the image with no offset maths.
export function cropBoardCanvas(sourceCanvas, board, padFrac = 0.05) {
  const pad = board.cw * padFrac;
  const x = Math.max(0, board.x0 - pad), y = Math.max(0, board.y0 - pad);
  const w = Math.min(sourceCanvas.width - x, board.cw * 8 + 2 * pad);
  const h = Math.min(sourceCanvas.height - y, board.ch * 8 + 2 * pad);
  const out = document.createElement('canvas');
  const target = 240;
  out.width = target; out.height = Math.round(target * (h / w));
  out.getContext('2d').drawImage(sourceCanvas, x, y, w, h, 0, 0, out.width, out.height);
  return out;
}
