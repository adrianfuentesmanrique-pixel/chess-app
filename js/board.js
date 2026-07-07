// Touch-friendly chess board. Tap a piece then tap a destination, or drag.
// Uses chess.js (passed per-position) for legal move hints; the owner decides
// what happens with a move via the onMove callback.
import { Chess } from '../vendor/chess.js';

const FILES = 'abcdefgh';

let PIECE_SET = 'pieces';
const ALL_BOARDS = [];

export function setPieceSet(name) {
  PIECE_SET = name;
  for (const b of ALL_BOARDS) b.render();
}
export function getPieceSet() { return PIECE_SET; }

export class Board {
  constructor(container, opts = {}) {
    this.el = container;
    this.el.classList.add('board');
    this.onMove = opts.onMove || (() => {});
    this.interactive = opts.interactive !== false;
    this.orientation = opts.orientation || 'w';
    this.fen = opts.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    this.selected = null;
    this.lastMove = null;      // {from,to}
    this.editorMode = false;   // when true, taps are reported raw via onEditorTap
    this.onEditorTap = opts.onEditorTap || (() => {});
    this.freeMove = false;     // allow moving either color (setup/analysis root)
    this.shapes = { squares: [], arrows: [] };
    this.piecesHidden = false; // Blind Puzzles: pieces invisible, but moves still work normally
    this.drawColor = null;     // 'green'|'yellow'|'red'|null — when set, taps/drags annotate instead of moving
    this.onShapesChange = opts.onShapesChange || (() => {});
    this._dragStart = null;
    this._buildSquares();
    this._bindEvents();
    ALL_BOARDS.push(this);
    this.render();
  }

  _buildSquares() {
    this.el.innerHTML = '';
    this.squares = {};
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const sq = document.createElement('div');
        const name = FILES[f] + (8 - r);
        sq.className = 'sq ' + (((r + f) % 2 === 0) ? 'light' : 'dark');
        sq.dataset.sq = name;
        this.el.appendChild(sq);
        this.squares[name] = sq;
      }
    }
    // coordinates
    const coords = document.createElement('div');
    coords.className = 'coords';
    this.el.appendChild(coords);
    this.coordsEl = coords;
    // annotation overlay (arrows + colored squares), always on top, never blocks input
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.classList.add('shapes-layer');
    this.el.appendChild(svg);
    this.shapesEl = svg;
  }

  setOrientation(o) { this.orientation = o; this.render(); }
  flip() { this.setOrientation(this.orientation === 'w' ? 'b' : 'w'); }

  setPiecesHidden(hidden) { this.piecesHidden = hidden; this.render(); }

  setPosition(fen, lastMove = null, lastMoveColor = 'green') {
    this.fen = fen;
    this.lastMove = lastMove;
    this.lastMoveColor = lastMoveColor;
    this.selected = null;
    this.render();
  }

  setShapes(shapes) {
    this.shapes = shapes || { squares: [], arrows: [] };
    this._renderShapes();
  }

  setDrawColor(color) { this.drawColor = color; }

  clearShapes() {
    this.shapes = { squares: [], arrows: [] };
    this.onShapesChange(this.shapes);
    this._renderShapes();
  }

  _renderShapes() {
    if (!this.shapesEl) return;
    const flipped = this.orientation === 'b';
    const colorMap = { green: '#3aa53a', yellow: '#e0b400', red: '#d0392b' };
    let html = '';
    for (const s of this.shapes.squares) {
      const c = sqCoords(s.sq, flipped);
      html += `<rect x="${c.left}" y="${c.top}" width="12.5" height="12.5" fill="${colorMap[s.color]}" opacity="0.55"/>`;
    }
    for (const a of this.shapes.arrows) {
      const p1 = sqCoords(a.from, flipped);
      const p2 = sqCoords(a.to, flipped);
      html += arrowSvg(p1.cx, p1.cy, p2.cx, p2.cy, colorMap[a.color]);
    }
    this.shapesEl.innerHTML = html;
  }

  _toggleSquareShape(sq) {
    const idx = this.shapes.squares.findIndex(s => s.sq === sq);
    if (idx >= 0) {
      if (this.shapes.squares[idx].color === this.drawColor) this.shapes.squares.splice(idx, 1);
      else this.shapes.squares[idx].color = this.drawColor;
    } else {
      this.shapes.squares.push({ sq, color: this.drawColor });
    }
    this.onShapesChange(this.shapes);
    this._renderShapes();
  }

  _toggleArrowShape(from, to) {
    const idx = this.shapes.arrows.findIndex(a => a.from === from && a.to === to);
    if (idx >= 0) {
      if (this.shapes.arrows[idx].color === this.drawColor) this.shapes.arrows.splice(idx, 1);
      else this.shapes.arrows[idx].color = this.drawColor;
    } else {
      this.shapes.arrows.push({ from, to, color: this.drawColor });
    }
    this.onShapesChange(this.shapes);
    this._renderShapes();
  }

  render() {
    const chess = new Chess();
    let ok = true;
    try { chess.load(this.fen, { skipValidation: true }); } catch { ok = false; }
    const placement = this.fen.split(' ')[0];
    const grid = parsePlacement(placement);
    const flipped = this.orientation === 'b';

    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const name = FILES[f] + (8 - r);
        const sq = this.squares[name];
        // visual position depends on orientation
        const vr = flipped ? 7 - r : r;
        const vf = flipped ? 7 - f : f;
        sq.style.left = vf * 12.5 + '%';
        sq.style.top = vr * 12.5 + '%';
        const piece = grid[name];
        const want = piece ? `${PIECE_SET}/${piece.color}${piece.type.toUpperCase()}.svg` : null;
        let img = sq.querySelector('img');
        if (want) {
          if (!img) { img = document.createElement('img'); img.draggable = false; sq.appendChild(img); }
          const src = img.getAttribute('src');
          if (src !== want) img.setAttribute('src', want);
          img.style.visibility = this.piecesHidden ? 'hidden' : '';
        } else if (img) img.remove();
        const isLastMove = !!this.lastMove && (this.lastMove.from === name || this.lastMove.to === name);
        sq.classList.toggle('lastmove', isLastMove && this.lastMoveColor !== 'yellow');
        sq.classList.toggle('lastmove-outbook', isLastMove && this.lastMoveColor === 'yellow');
        sq.classList.toggle('selected', this.selected === name);
        sq.classList.remove('dest', 'capture-dest', 'check');
      }
    }
    // check highlight
    if (ok) {
      try {
        if (chess.inCheck()) {
          const king = findKing(grid, chess.turn());
          if (king) this.squares[king].classList.add('check');
        }
      } catch { }
    }
    // legal destination dots for selection — skipped while pieces are hidden,
    // since the dot pattern would give away what piece is selected
    if (this.selected && !this.editorMode && !this.piecesHidden) {
      try {
        const c2 = new Chess(this.fen);
        for (const mv of c2.moves({ square: this.selected, verbose: true })) {
          this.squares[mv.to].classList.add(mv.captured ? 'capture-dest' : 'dest');
        }
      } catch { }
    }
    // coords text
    this.coordsEl.innerHTML = '';
    for (let i = 0; i < 8; i++) {
      const rank = document.createElement('span');
      rank.className = 'coord rank';
      rank.style.top = i * 12.5 + 1 + '%';
      rank.textContent = flipped ? (i + 1) : (8 - i);
      const file = document.createElement('span');
      file.className = 'coord file';
      file.style.left = i * 12.5 + 9.5 + '%';
      file.textContent = flipped ? FILES[7 - i] : FILES[i];
      this.coordsEl.append(rank, file);
    }
    this._renderShapes();
  }

  _bindEvents() {
    this.el.addEventListener('pointerdown', (e) => {
      const sqEl = e.target.closest('.sq');
      if (!sqEl) return;
      const name = sqEl.dataset.sq;
      if (this.editorMode) { this.onEditorTap(name); return; }
      if (this.drawColor) { this._dragStart = name; return; }
      if (!this.interactive) return;
      const chess = new Chess(this.fen);
      const grid = parsePlacement(this.fen.split(' ')[0]);
      const piece = grid[name];
      const isOwnPiece = piece && piece.color === chess.turn();
      this._tap(name);
      if (isOwnPiece && this.selected === name) this._beginDragVisual(name, sqEl, e);
    });
    this.el.addEventListener('pointerup', (e) => {
      if (!this.drawColor || !this._dragStart) return;
      const start = this._dragStart;
      this._dragStart = null;
      const el2 = document.elementFromPoint(e.clientX, e.clientY);
      const sqEl = el2 ? el2.closest('.sq') : null;
      if (!sqEl) return;
      const end = sqEl.dataset.sq;
      if (end === start) this._toggleSquareShape(start);
      else this._toggleArrowShape(start, end);
    });
    this.el.addEventListener('pointercancel', () => { this._dragStart = null; });
  }

  // Visual layer only — all move/select/reselect/deselect decisions are made
  // by re-invoking _tap(), so drag can never diverge from tap-tap behavior.
  _beginDragVisual(name, sqEl, downEvent) {
    const img = sqEl.querySelector('img');
    if (!img) return;
    const boardRect = this.el.getBoundingClientRect();
    const size = boardRect.width * 0.125;
    const ghost = document.createElement('img');
    ghost.src = img.getAttribute('src');
    ghost.className = 'drag-ghost';
    ghost.style.width = size + 'px';
    ghost.style.height = size + 'px';
    if (this.piecesHidden) ghost.style.visibility = 'hidden';
    document.body.appendChild(ghost);
    img.classList.add('dragging-source');

    let moved = false;
    const place = (x, y) => {
      ghost.style.left = (x - size / 2) + 'px';
      ghost.style.top = (y - size / 2) + 'px';
    };
    place(downEvent.clientX, downEvent.clientY);

    const onMove = (ev) => {
      moved = true;
      place(ev.clientX, ev.clientY);
    };
    const onUp = (ev) => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      ghost.remove();
      img.classList.remove('dragging-source');
      if (!moved) return; // plain tap already handled by the _tap(name) call at pointerdown
      const el2 = document.elementFromPoint(ev.clientX, ev.clientY);
      const destSqEl = el2 ? el2.closest('.sq') : null;
      if (!destSqEl) { this.selected = null; this.render(); return; }
      const dest = destSqEl.dataset.sq;
      if (dest === name) return; // dropped back where it started — stays selected
      this._tap(dest);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  }

  async _tap(name) {
    const chess = new Chess(this.fen);
    const grid = parsePlacement(this.fen.split(' ')[0]);
    const piece = grid[name];

    if (this.selected) {
      if (this.selected === name) { this.selected = null; this.render(); return; }
      // try the move
      let legal = null;
      try {
        legal = chess.moves({ square: this.selected, verbose: true }).find(m => m.to === name);
      } catch { }
      if (legal) {
        let promotion;
        if (legal.promotion) promotion = await this._askPromotion(chess.turn());
        this.selected = null;
        this.render();
        this.onMove({ from: legal.from, to: name, promotion });
        return;
      }
      // otherwise reselect if own piece
      if (piece && piece.color === chess.turn()) { this.selected = name; this.render(); return; }
      this.selected = null; this.render(); return;
    }
    if (piece && piece.color === chess.turn()) { this.selected = name; this.render(); }
  }

  _askPromotion(color) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'promo-overlay';
      for (const p of ['q', 'r', 'b', 'n']) {
        const b = document.createElement('button');
        b.className = 'promo-btn';
        b.innerHTML = `<img src="${PIECE_SET}/${color}${p.toUpperCase()}.svg" alt="${p}">`;
        b.onclick = () => { overlay.remove(); resolve(p); };
        overlay.appendChild(b);
      }
      this.el.appendChild(overlay);
    });
  }
}

export function parsePlacement(placement) {
  const grid = {};
  const rows = placement.split('/');
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) f += +ch;
      else {
        grid[FILES[f] + (8 - r)] = { color: ch === ch.toUpperCase() ? 'w' : 'b', type: ch.toLowerCase() };
        f++;
      }
    }
  }
  return grid;
}

function findKing(grid, color) {
  for (const [sq, p] of Object.entries(grid)) if (p.type === 'k' && p.color === color) return sq;
  return null;
}

function sqCoords(name, flipped) {
  const f = FILES.indexOf(name[0]);
  const r = 8 - parseInt(name[1], 10);
  const vf = flipped ? 7 - f : f;
  const vr = flipped ? 7 - r : r;
  return { left: vf * 12.5, top: vr * 12.5, cx: vf * 12.5 + 6.25, cy: vr * 12.5 + 6.25 };
}

function arrowSvg(x1, y1, x2, y2, color) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux;
  const sx = x1 + ux * 3, sy = y1 + uy * 3;
  const ex = x2 - ux * 5.5, ey = y2 - uy * 5.5;
  const headLen = 4.2, headWidth = 3;
  const hx = ex - ux * headLen, hy = ey - uy * headLen;
  const p1x = hx + px * headWidth, p1y = hy + py * headWidth;
  const p2x = hx - px * headWidth, p2y = hy - py * headWidth;
  return `<g opacity="0.85">
    <line x1="${sx}" y1="${sy}" x2="${hx}" y2="${hy}" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>
    <polygon points="${ex},${ey} ${p1x},${p1y} ${p2x},${p2y}" fill="${color}"/>
  </g>`;
}
