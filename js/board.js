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

function pieceCount(fen) {
  const placement = fen.split(' ')[0];
  let n = 0;
  for (const ch of placement) if (/[a-zA-Z]/.test(ch)) n++;
  return n;
}

export class Board {
  constructor(container, opts = {}) {
    this.el = container;
    this.el.classList.add('board');
    this.onMove = opts.onMove || (() => {});
    this.interactive = opts.interactive !== false;   // see the accessor below
    this.orientation = opts.orientation || 'w';
    this.fen = opts.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    this.selected = null;
    this.lastMove = null;      // {from,to}
    this.editorMode = false;   // when true, taps are reported raw via onEditorTap
    this.onEditorTap = opts.onEditorTap || (() => {});
    this.freeMove = false;     // allow moving either color (setup/analysis root)
    this.shapes = { squares: [], arrows: [] };
    this.piecesHidden = false; // Blindfold Puzzles: pieces invisible, but moves still work normally
    this.drawColor = null;     // 'green'|'yellow'|'red'|null — when set, taps/drags annotate instead of moving
    this.onShapesChange = opts.onShapesChange || (() => {});
    this.onSound = opts.onSound || null; // (kind: 'move'|'capture') — Board detects captures by piece count, callers stay ignorant of sound
    this._dragStart = null;
    // Pre-move: a move queued for the side that is NOT to move, played the
    // instant the opponent's real move lands. Kept apart from `selected` on
    // purpose — setPosition() clears the selection, and outliving that is the
    // whole point of a pre-move. Opt-in per board: the screens that never wait
    // on an opponent (Analysis, Setup, the Masterclass) must not get one.
    this.premoveAllowed = !!opts.premove;
    this.premoveArmed = false;
    this.premove = null;       // {from,to,promotion}
    this._buildSquares();
    this._bindEvents();
    ALL_BOARDS.push(this);
    this.render();
  }

  // Mirrored onto the element because CSS cannot see a plain JS property, and
  // `.sq.grabbable` must only claim the touch gesture on a board that can
  // actually be played — see the touch-action rules in the stylesheet.
  get interactive() { return this._interactive; }
  set interactive(v) {
    this._interactive = !!v;
    this.el.classList.toggle('live', this._interactive);
    this._syncPremoveClass();
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

  // --- Pre-move -------------------------------------------------------------
  // A pre-move is only ever a guess, so every path below degrades quietly: an
  // unusable position just means no destination dots, and a guess that does not
  // survive the opponent's real move is discarded without a word.

  // Always a real boolean: the constructor sets `interactive` before
  // `premoveAllowed` exists, and classList.toggle(name, undefined) toggles
  // rather than clearing — which left '.premoving' stuck on every board.
  _premoveActive() {
    return !!(this.premoveAllowed && this.premoveArmed && !this._interactive
      && !this.editorMode && !this.freeMove);
  }

  // CSS cannot see a JS property, and `.sq.grabbable` only claims the touch
  // gesture on `.board.live` — a board waiting for the opponent is not live, so
  // without this class the drag is handed to page scrolling and pre-move by
  // drag silently does nothing on a phone while looking fine on a desktop.
  _syncPremoveClass() {
    this.el.classList.toggle('premoving', this._premoveActive());
  }

  // The side the user may pick up right now: normally the side to move, but
  // during a pre-move it is by definition the side that is NOT to move.
  _movableColor(turn) {
    return this._premoveActive() ? (turn === 'w' ? 'b' : 'w') : turn;
  }

  // The same position with the side to move flipped, so chess.js will generate
  // targets for the pre-moving side. That position can be genuinely illegal
  // (the side not to move may be giving check) and chess.js then throws — the
  // caller falls back to accepting the pre-move blind, with no dots.
  _flippedChess() {
    const p = this.fen.split(' ');
    p[1] = p[1] === 'w' ? 'b' : 'w';
    p[3] = '-';   // the en-passant square belonged to the other side
    try { return new Chess(p.join(' ')); } catch { return null; }
  }

  // Called by a screen the moment it hands the turn to the opponent.
  armPremove() { this.premoveArmed = !!this.premoveAllowed; this._syncPremoveClass(); }

  clearPremove() {
    this.premoveArmed = false;
    if (this.premove) { this.premove = null; this.render(); }
    this._syncPremoveClass();
  }

  // Called by a screen the moment the opponent's move has landed and control is
  // back with the user. The queued move goes out through the normal onMove
  // funnel, so it is validated, graded and sounded exactly like a move made by
  // hand — nothing about a pre-move is a special case downstream.
  firePremove() {
    const pm = this.premove;
    this.premoveArmed = false;
    this.premove = null;
    this._syncPremoveClass();
    if (!pm) return false;
    this.render();
    let legal = null;
    try {
      legal = new Chess(this.fen).moves({ square: pm.from, verbose: true }).find(m => m.to === pm.to);
    } catch { }
    if (!legal) return false;   // the guess did not survive — discard, in silence
    this.onMove({ from: pm.from, to: pm.to, promotion: legal.promotion ? (pm.promotion || 'q') : undefined });
    return true;
  }

  setPosition(fen, lastMove = null, lastMoveColor = 'green') {
    if (lastMove && this.onSound) {
      const wasCapture = pieceCount(fen) < pieceCount(this.fen);
      this.onSound(wasCapture ? 'capture' : 'move');
    }
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

  // Drawing an arrow is a drag in any direction, straight up the board very
  // much included, so while a colour is picked the whole board has to claim
  // the gesture — the piece-only rule is not enough. See .board.drawing.
  setDrawColor(color) {
    this.drawColor = color;
    this.el.classList.toggle('drawing', !!color);
  }

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
        // A piece the user could pick up right now needs the whole gesture,
        // not just the vertical half the board otherwise leaves to scrolling.
        sq.classList.toggle('grabbable',
          !!piece && !this.editorMode && (this.freeMove || !ok || piece.color === this._movableColor(chess.turn())));
        const isLastMove = !!this.lastMove && (this.lastMove.from === name || this.lastMove.to === name);
        sq.classList.toggle('lastmove', isLastMove && this.lastMoveColor !== 'yellow');
        sq.classList.toggle('lastmove-outbook', isLastMove && this.lastMoveColor === 'yellow');
        sq.classList.toggle('selected', this.selected === name);
        sq.classList.toggle('premove',
          !!this.premove && (this.premove.from === name || this.premove.to === name));
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
        const c2 = this._premoveActive() ? this._flippedChess() : new Chess(this.fen);
        if (c2) for (const mv of c2.moves({ square: this.selected, verbose: true })) {
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
      if (!this.interactive && !this._premoveActive()) return;
      const chess = new Chess(this.fen);
      const grid = parsePlacement(this.fen.split(' ')[0]);
      const piece = grid[name];
      const isOwnPiece = piece && piece.color === this._movableColor(chess.turn());
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
    // Claim the gesture for the duration of the drag; see .board.dragging.
    this.el.classList.add('dragging');
    if (downEvent.pointerId != null) {
      try { this.el.setPointerCapture(downEvent.pointerId); } catch { /* mouse, or already released */ }
    }
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
      this.el.classList.remove('dragging');
      if (ev.pointerId != null) {
        try { this.el.releasePointerCapture(ev.pointerId); } catch { /* already gone */ }
      }
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
    const pre = this._premoveActive();
    const mine = this._movableColor(chess.turn());

    // Any tap while a pre-move is queued replaces it, so tapping an empty
    // square is how you cancel one.
    if (pre && this.premove) { this.premove = null; this.render(); }

    if (this.selected) {
      if (this.selected === name) { this.selected = null; this.render(); return; }
      const from = this.selected;
      // try the move
      let targets = null, legal = null;
      try {
        const c2 = pre ? this._flippedChess() : chess;
        if (c2) targets = c2.moves({ square: from, verbose: true });
      } catch { }
      if (targets) legal = targets.find(m => m.to === name);
      const ownDest = piece && piece.color === mine;
      // With no target list at all — an illegal flipped position — a pre-move is
      // still accepted blind. It is a guess either way, and firePremove() checks
      // it against the real position before it is ever played.
      if (legal || (pre && !targets && !ownDest)) {
        const moving = grid[from];
        const isPromo = legal ? !!legal.promotion
          : !!moving && moving.type === 'p' && (name[1] === '8' || name[1] === '1');
        let promotion;
        // Asked now, at pre-move time, rather than after the opponent moves —
        // simplest, and what every other site does.
        if (isPromo) promotion = await this._askPromotion(mine);
        // The dialog is awaited, so the opponent's move can land while it is
        // open. Queueing then would leave a pre-move sitting on the board
        // during the user's own turn.
        if (pre && !this._premoveActive()) { this.selected = null; this.render(); return; }
        this.selected = null;
        if (pre) { this.premove = { from, to: name, promotion }; this.render(); return; }
        this.render();
        this.onMove({ from, to: name, promotion });
        return;
      }
      // otherwise reselect if own piece
      if (ownDest) { this.selected = name; this.render(); return; }
      this.selected = null; this.render(); return;
    }
    if (piece && piece.color === mine) { this.selected = name; this.render(); }
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
