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
  // support at position p = the strongest profile value within ±2 px (forgives
  // sub-pixel line placement)
  const sup = p => {
    let m = 0; const a = Math.max(lo, p - 2), b = Math.min(hi, p + 2);
    for (let q = a; q <= b; q++) if (sp[q] > m) m = sp[q];
    return m;
  };
  let mean = 0; for (let i = lo; i <= hi; i++) mean += sp[i]; mean /= (hi - lo + 1);

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
  // Gate out non-boards: every tooth must clear the local background by a margin,
  // so a block of text or a table never passes as a grid.
  if (best.mn < mean * 1.3 || best.sum < 9 * mean * 1.8) return null;
  const lines = [];
  for (let k = 0; k <= 8; k++) lines.push(best.o + k * best.s);
  return { lines, s: best.s };
}

// ── board detection ─────────────────────────────────────────────────────────
// Returns { x0, y0, cw, ch } (top-left of the a8 square + cell size) or null.
export function detectBoard(imageData, tapX, tapY) {
  const { g, W, H } = toGray(imageData);
  tapX = Math.round(tapX); tapY = Math.round(tapY);
  if (tapX < 1 || tapY < 1 || tapX >= W - 1 || tapY >= H - 1) return null;

  // Focus a window on the tap so distant page structure (text columns, other
  // diagrams) does not swamp the profiles.
  const S = Math.round(0.46 * Math.min(W, H));
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
  if (ratio < 0.8 || ratio > 1.25) return null;

  const board = { x0: vx.lines[0], y0: hy.lines[0], cw: vx.s, ch: hy.s };
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
// Returns { feat: Float32Array(N*N), energy } — energy separates empty from
// occupied before the (noise-amplifying) normalization.
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
  return { feat: blur, energy };
}

function cosDist(a, b) {   // a,b already L2-normalized → 1 - dot ∈ [0,2]
  let dot = 0; for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return 1 - dot;
}

// ── calibration: templates from a confirmed starting position ───────────────
// Returns a JSON/structured-clone-safe object stored on the book record.
export function buildTemplates(imageData, board) {
  const { g, W, H } = toGray(imageData);
  const acc = {}, cnt = {};
  const emptyEnergies = [], pieceEnergies = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const code = START_GRID[r][c];
    const { feat, energy } = cellFeature(g, W, H, board, r, c);
    if (!code) { emptyEnergies.push(energy); continue; }
    pieceEnergies.push(energy);
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
  // Empty threshold sits between the noisiest empty and the quietest piece.
  emptyEnergies.sort((a, b) => a - b); pieceEnergies.sort((a, b) => a - b);
  const maxEmpty = emptyEnergies[emptyEnergies.length - 1] || 0;
  const minPiece = pieceEnergies[0] || (maxEmpty * 3 + 1);
  const emptyThresh = minPiece > maxEmpty ? (maxEmpty + minPiece) / 2 : maxEmpty * 1.6 + 0.5;
  return { n: N, ver: 1, pieces, emptyThresh };
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
      const { feat, energy } = cellFeature(g, W, H, board, r, c);
      if (energy < templates.emptyThresh) { row.push(''); continue; }
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
// Adds a thin margin so the outermost squares are not clipped.
export function cropBoardCanvas(sourceCanvas, board) {
  const pad = board.cw * 0.05;
  const x = Math.max(0, board.x0 - pad), y = Math.max(0, board.y0 - pad);
  const w = Math.min(sourceCanvas.width - x, board.cw * 8 + 2 * pad);
  const h = Math.min(sourceCanvas.height - y, board.ch * 8 + 2 * pad);
  const out = document.createElement('canvas');
  const target = 240;
  out.width = target; out.height = Math.round(target * (h / w));
  out.getContext('2d').drawImage(sourceCanvas, x, y, w, h, 0, 0, out.width, out.height);
  return out;
}
