// Touch-friendly chess board. Tap a piece then tap a destination, or drag.
// Uses chess.js (passed per-position) for legal move hints; the owner decides
// what happens with a move via the onMove callback.
import { Chess } from '../vendor/chess.js';

const FILES = 'abcdefgh';

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
    this._buildSquares();
    this._bindEvents();
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
  }

  setOrientation(o) { this.orientation = o; this.render(); }
  flip() { this.setOrientation(this.orientation === 'w' ? 'b' : 'w'); }

  setPosition(fen, lastMove = null) {
    this.fen = fen;
    this.lastMove = lastMove;
    this.selected = null;
    this.render();
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
        const want = piece ? `pieces/${piece.color}${piece.type.toUpperCase()}.svg` : null;
        let img = sq.querySelector('img');
        if (want) {
          if (!img) { img = document.createElement('img'); img.draggable = false; sq.appendChild(img); }
          const src = img.getAttribute('src');
          if (src !== want) img.setAttribute('src', want);
        } else if (img) img.remove();
        sq.classList.toggle('lastmove', !!this.lastMove && (this.lastMove.from === name || this.lastMove.to === name));
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
    // legal destination dots for selection
    if (this.selected && !this.editorMode) {
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
  }

  _bindEvents() {
    this.el.addEventListener('pointerdown', (e) => {
      const sqEl = e.target.closest('.sq');
      if (!sqEl) return;
      const name = sqEl.dataset.sq;
      if (this.editorMode) { this.onEditorTap(name); return; }
      if (!this.interactive) return;
      this._tap(name);
    });
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
        b.innerHTML = `<img src="pieces/${color}${p.toUpperCase()}.svg" alt="${p}">`;
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
