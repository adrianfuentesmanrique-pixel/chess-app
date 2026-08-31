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
export function detectBoard(imageData, tapX, tapY) {
  const { g, W, H } = toGray(imageData);
  tapX = Math.round(tapX); tapY = Math.round(tapY);
  if (tapX < 1 || tapY < 1 || tapX >= W - 1 || tapY >= H - 1) return null;

  const minDim = Math.min(W, H);
  // Half-window sizes to try, smallest first (fractions of the shorter side).
  // ~0.16 covers a typical one-third-of-the-page book diagram while shutting out
  // the neighbouring column; the larger sizes catch big or full-page diagrams.
  for (const frac of [0.16, 0.22, 0.30, 0.40, 0.48]) {
    const S = Math.round(frac * minDim);
    if (S < 40) continue;
    const board = detectInWindow(g, W, H, tapX, tapY, S);
    if (board) return board;
  }
  return null;
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
  let sL = 0, sL2 = 0, nL = 0;
  const lx1 = Math.max(1, Math.round(R.x0)), lx2 = Math.min(W - 2, Math.round(R.x0 + R.w));
  const ly1 = Math.max(1, Math.round(R.y0)), ly2 = Math.min(H - 2, Math.round(R.y0 + R.h));
  for (let y = ly1; y < ly2; y++) for (let x = lx1; x < lx2; x++) { const L = g[y * W + x]; sL += L; sL2 += L * L; nL++; }
  nL = nL || 1;
  const lumMean = sL / nL;
  const lumStd = Math.sqrt(Math.max(0, sL2 / nL - lumMean * lumMean));
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
  return { feat: blur, energy, lumStd };
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
  const emptyStd = [], pieceStd = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const code = grid[r][c];
    const { feat, lumStd } = cellFeature(g, W, H, board, r, c);
    if (!code) { emptyStd.push(lumStd); continue; }
    pieceStd.push(lumStd);
    if (!acc[code]) { acc[code] = new Float32Array(N * N); cnt[code] = 0; }
    for (let i = 0; i < feat.length; i++) acc[code][i] += feat[i];
    cnt[code]++;
  }
  const pieces = {};
  for (const code of Object.keys(acc)) {
    const f = acc[code];
    for (let i = 0; i < f.length; i++) f[i] /= cnt[code];
    // re-normalize the average so distances stay comparable
    let norm = 0; for (let i = 0; i < f.length; i++) norm += f[i] * f[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < f.length; i++) f[i] /= norm;
    pieces[code] = Array.from(f);
  }
  // Occupancy threshold on luminance spread, learned from the labelled cells: it
  // sits between the most-textured empty and the flattest piece. Robust ends
  // (95th empty / 5th piece percentile) shrug off one odd square. A comfortable
  // fallback covers the degenerate all-empty or all-piece calibration.
  emptyStd.sort((a, b) => a - b); pieceStd.sort((a, b) => a - b);
  const pct = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.max(0, Math.round((arr.length - 1) * p)))] : null;
  const emptyHi = pct(emptyStd, 0.95), pieceLo = pct(pieceStd, 0.05);
  let emptyThresh;
  if (emptyHi == null) emptyThresh = (pieceLo ?? 20) * 0.5;
  else if (pieceLo == null) emptyThresh = emptyHi * 1.5 + 4;
  else emptyThresh = pieceLo > emptyHi ? (emptyHi + pieceLo) / 2 : (emptyHi + pieceLo) / 2 + 2;
  return { n: N, ver: 2, pieces, emptyThresh };
}

// ── classification ──────────────────────────────────────────────────────────
// Returns { grid:8×8 codes, fen, confident:bool, uncertain:int, kingsOk:bool }.
export function classifyBoard(imageData, board, templates, turn = 'w') {
  const { g, W, H } = toGray(imageData);
  const codes = Object.keys(templates.pieces);
  const tmpl = {};
  for (const c of codes) tmpl[c] = Float32Array.from(templates.pieces[c]);

  const grid = [];
  let uncertain = 0, wk = 0, bk = 0, maxD1 = 0, minMargin = Infinity;
  for (let r = 0; r < 8; r++) {
    const row = [];
    for (let c = 0; c < 8; c++) {
      const { feat, lumStd } = cellFeature(g, W, H, board, r, c);
      if (lumStd < templates.emptyThresh) { row.push(''); continue; }
      let d1 = Infinity, d2 = Infinity, best = '';
      for (const code of codes) {
        const d = cosDist(feat, tmpl[code]);
        if (d < d1) { d2 = d1; d1 = d; best = code; }
        else if (d < d2) { d2 = d; }
      }
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
