// The Library side of the Openings tab: the Library | My databases switch, the
// cards, the search, an opening's variations and the preview board.
//
// The rules (what a card shows, the order, the search, the name at a move) are
// in js/opening-lib.js, which is pure and unit-tested. This file is the screen.
//
// The data, js/opening-library.js, is 323 KB and GENERATED. It is imported only
// when the Library is first shown, never at start-up, and it is listed by hand
// in ASSETS in sw.js because tools/check-precache.mjs does not follow a dynamic
// import (tests/unit/precache.test.js checks the listing).
//
// Nothing here is stored but the last view, under 'trainerView': a device-only
// value, NOT in SYNCED_KEYS. Library names are labels, never storage keys.
//
// This module imports from js/app.js, which imports it back. The cycle is safe
// because every app.js binding used here is only read inside a method.
import { Chess } from '../vendor/chess.js';
import { t, tn, getLang } from './i18n.js';
import { Board, getPieceSet } from './board.js';
import * as db from './db.js';
import { fold, numbered, fullName, buildCards, filterCards, buildSearchIndex, searchLines, openingRows,
  buildNameIndex, nameAt } from './opening-lib.js';
import Tour from './tour.js';
import { $, esc, segInit } from './app.js';

const FILES = 'abcdefgh';
const CARD_PAGE = 16;   // cards drawn at a time: each carries a board
const ROW_PAGE = 60;    // list rows drawn at a time (the Sicilian has 400)

// A list drawn a page at a time, the next page when its end comes near the
// screen. 150 boards are 9,600 squares and the Sicilian is 400 rows: neither is
// built before it is scrolled to.
function paged(el, items, make, size) {
  el._io?.disconnect();
  el._io = null;
  el.innerHTML = '';
  let at = 0;
  const add = () => {
    const frag = document.createDocumentFragment();
    for (const end = Math.min(at + size, items.length); at < end; at++) frag.appendChild(make(items[at]));
    return frag;
  };
  el.appendChild(add());
  if (at >= items.length) return;
  const more = document.createElement('div');
  more.className = 'lib-more';
  el.appendChild(more);
  const io = new IntersectionObserver(entries => {
    if (!entries.some(e => e.isIntersecting)) return;
    more.before(add());
    io.unobserve(more);
    if (at >= items.length) { io.disconnect(); more.remove(); el._io = null; return; }
    io.observe(more);   // observed afresh, so a page that did not fill the screen is followed by the next
  }, { root: document.querySelector('main'), rootMargin: '700px 0px' });
  io.observe(more);
  el._io = io;
}

const placements = new Map();
// The piece placement (first field of a FEN) after these moves.
function placementAfter(moves) {
  let p = placements.get(moves);
  if (!p) {
    const chess = new Chess();
    for (const san of moves.split(' ')) chess.move(san);
    p = chess.fen().split(' ')[0];
    placements.set(moves, p);
  }
  return p;
}

// The small board of a card: a static drawing in the current piece set. The 64
// squares are one background; only the pieces are elements.
function miniBoardHtml(moves) {
  const set = getPieceSet();
  let html = '';
  placementAfter(moves).split('/').forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') { f += +ch; continue; }
      const file = (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toUpperCase();
      html += `<img src="${set}/${file}.svg" alt="" style="left:${f * 12.5}%;top:${r * 12.5}%">`;
      f++;
    }
  });
  return html;
}

function sideHtml(side) {
  return `<img class="lib-side-ico" data-side="${side}" src="${getPieceSet()}/${side}K.svg" alt="">${esc(t(side === 'w' ? 'white' : 'black'))}`;
}

export const OpeningLib = {
  lib: null,          // OPENING_LIBRARY, once loaded
  loading: null,      // the import, while it runs and after
  cards: null,
  index: null,
  byMoves: null,
  view: 'library',    // 'library' | 'mine'
  restored: false,    // the remembered view is read back once per launch
  page: 'list',       // 'list' | 'opening' | 'preview'
  side: 'both',
  group: null,
  query: '',
  opening: -1,        // index of the opening whose page is open
  from: 'list',       // where the preview was opened from
  scroll: { list: 0, opening: 0 },
  drawn: '',          // language + piece set the lists were drawn in
  board: null,
  line: null,         // the preview: { moves, fens, lasts, ply }

  init() {
    segInit($('trainer-views'), v => this.setView(v));
    segInit($('lib-side'), v => { this.side = v; this.renderList(); });
    // The first-move chips narrow the list and can be let go again.
    $('lib-first').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      this.group = this.group === b.dataset.v ? null : b.dataset.v;
      for (const x of $('lib-first').querySelectorAll('button')) x.classList.toggle('on', x.dataset.v === this.group);
      this.renderList();
    });
    let timer = 0;
    $('lib-search').addEventListener('input', e => {
      clearTimeout(timer);
      timer = setTimeout(() => { this.query = e.target.value; this.renderList(); }, 140);
    });
    $('lib-cards').addEventListener('click', e => {
      const b = e.target.closest('button[data-o]');
      if (!b) return;
      if (b.dataset.l !== undefined) this.openPreview(+b.dataset.o, +b.dataset.l, 'list');
      else this.openOpening(+b.dataset.o);
    });
    $('lib-opening-back').onclick = () => this.showPage('list');
    $('lib-filter').addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => this.renderRows(), 140);
    });
    $('lib-rows').addEventListener('click', e => {
      const b = e.target.closest('button[data-l]');
      if (b) this.openPreview(this.opening, +b.dataset.l, 'opening');
    });
    this.board = new Board($('lib-board'), { interactive: false });
    $('lib-preview-back').onclick = () => this.showPage(this.from);
    $('lib-nav-first').onclick = () => this.goto(0);
    $('lib-nav-prev').onclick = () => this.goto(this.line.ply - 1);
    $('lib-nav-next').onclick = () => this.goto(this.line.ply + 1);
    $('lib-nav-last').onclick = () => this.goto(this.line.moves.length);
    $('lib-moves').addEventListener('click', e => {
      const span = e.target.closest('.mv');
      if (span && this.line) this.goto(+span.dataset.ply);
    });
  },

  // Called every time the Openings tab is shown.
  async onEnter() {
    // The guided tour explains the setup form (#trainer-base, #trainer-start),
    // so while it runs the tab shows My databases, and that is not remembered.
    if (Tour.running) { this.restored = false; this.setView('mine', { save: false }); return; }
    if (!this.restored) {
      this.restored = true;
      const saved = await db.kvGet('trainerView', 'library');
      this.setView(saved === 'mine' ? 'mine' : 'library', { save: false });
    } else if (this.view === 'library') this.ensure();
  },

  setView(v, { save = true } = {}) {
    this.view = v;
    $('screen-trainer').dataset.view = v;
    for (const b of $('trainer-views').querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === v);
    if (save) db.kvSet('trainerView', v);
    if (v === 'library') this.ensure();
  },

  // The data is loaded, and the list drawn, the first time the Library shows.
  async ensure() {
    if (!this.lib) {
      if (!this.loading) {
        $('lib-cards').innerHTML = `<p class="hint">${esc(t('loading'))}</p>`;
        this.loading = import('./opening-library.js').then(m => {
          this.lib = m.OPENING_LIBRARY;
          this.cards = buildCards(this.lib);
          this.index = buildSearchIndex(this.lib);
          this.byMoves = buildNameIndex(this.lib);
        });
      }
      try { await this.loading; } catch {
        // Not cached yet and no connection. Asked for again the next time.
        this.loading = null;
        $('lib-cards').innerHTML = `<p class="hint">${esc(t('lib_load_failed'))}</p>`;
        return;
      }
    }
    if (this.drawn !== getLang() + getPieceSet()) this.refresh();
  },

  // Everything that carries a translated word or a piece is drawn again: after
  // a change of language or of piece set.
  refresh() {
    if (!this.lib) return;
    this.renderList();
    if (this.opening >= 0) this.renderOpening();
    if (this.line) this.goto(this.line.ply);
  },

  showPage(page) {
    const main = document.querySelector('main');
    if (this.page in this.scroll) this.scroll[this.page] = main.scrollTop;
    this.page = page;
    for (const p of ['list', 'opening', 'preview']) $('lib-' + p).classList.toggle('hidden', p !== page);
    $('trainer-views').classList.toggle('hidden', page !== 'list');
    main.scrollTop = this.scroll[page] ?? 0;
  },

  // The cards, or, with text in the search box, the variations that match it.
  renderList() {
    if (!this.lib) return;
    this.drawn = getLang() + getPieceSet();
    const el = $('lib-cards'), count = $('lib-count');
    const filters = { side: this.side, group: this.group };
    const searching = !!fold(this.query).trim();
    const items = searching ? searchLines(this.index, this.query, filters) : filterCards(this.cards, filters);
    count.classList.toggle('hidden', !searching || !items.length);
    count.textContent = tn('lib_variations', items.length);
    if (!items.length) { el._io?.disconnect(); el.innerHTML = `<p class="hint">${esc(t('lib_none'))}</p>`; return; }
    if (searching) {
      paged(el, items, e => {
        const line = this.lib[e.o].lines[e.l];
        return this.rowEl(e.o, e.l, fullName(this.lib[e.o], line), line[2]);
      }, ROW_PAGE);
    } else paged(el, items, c => this.cardEl(c), CARD_PAGE);
  },

  cardEl(c) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'list-item lib-card';
    b.dataset.o = c.index;
    b.innerHTML = `<span class="lib-mini">${miniBoardHtml(c.moves)}</span>`
      + `<span class="lib-card-text"><span class="lib-card-name">${esc(c.name)}</span>`
      + `<span class="sub">${sideHtml(c.side)}</span>`
      + `<span class="sub moves">${esc(numbered(c.moves))}</span>`
      + `<span class="sub">${esc(tn('lib_variations', c.count))}</span></span>`;
    return b;
  },

  rowEl(o, l, name, moves) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'list-item';
    b.dataset.o = o;
    b.dataset.l = l;
    b.innerHTML = `<span>${esc(name)}</span><span class="sub moves">${esc(numbered(moves))}</span>`;
    return b;
  },

  openOpening(o) {
    this.opening = o;
    this.scroll.opening = 0;
    $('lib-filter').value = '';
    this.renderOpening();
    this.showPage('opening');
  },

  renderOpening() {
    const opening = this.lib[this.opening];
    $('lib-opening-name').textContent = opening.name;
    $('lib-opening-sub').innerHTML = `${sideHtml(opening.side)} · ${esc(tn('lib_variations', opening.lines.length))}`;
    // A one-line opening has nothing to filter.
    $('lib-filter').classList.toggle('hidden', opening.lines.length < 8);
    this.renderRows();
  },

  renderRows() {
    const el = $('lib-rows');
    const rows = openingRows(this.lib[this.opening], $('lib-filter').value);
    if (!rows.length) { el._io?.disconnect(); el.innerHTML = `<p class="hint">${esc(t('lib_none'))}</p>`; return; }
    paged(el, rows, r => this.rowEl(this.opening, r.l, r.name, r.moves), ROW_PAGE);
  },

  // The preview: the line on a board that cannot be moved on, at its last move.
  openPreview(o, l, from) {
    const moves = this.lib[o].lines[l][2].split(' ');
    const chess = new Chess();
    const fens = [chess.fen()], lasts = [];
    for (const san of moves) {
      const m = chess.move(san);
      fens.push(chess.fen());
      lasts.push({ from: m.from, to: m.to });
    }
    this.line = { moves, fens, lasts, ply: moves.length };
    this.from = from;
    this.showPage('preview');
    this.goto(moves.length);
  },

  goto(ply) {
    const L = this.line;
    if (!L) return;
    L.ply = Math.max(0, Math.min(L.moves.length, ply));
    this.board.setPosition(L.fens[L.ply], L.ply ? L.lasts[L.ply - 1] : null);
    // The deepest name these moves have earned: it changes on the move that earns it.
    const hit = nameAt(this.byMoves, L.moves, L.ply);
    $('lib-name-opening').textContent = hit ? this.lib[hit.o].name : t('start_position');
    $('lib-name-variation').textContent = hit ? this.lib[hit.o].lines[hit.l][1] : '';
    // The moves as one running text: a line of theory has no variations and no
    // comments, and a row for each pair (js/movelist.js) would push the list off
    // a small screen. Same .mv classes, so it looks and taps like the others.
    const list = $('lib-moves');
    list.innerHTML = '';
    let unit = null;
    L.moves.forEach((san, i) => {
      if (i % 2 === 0) {
        unit = document.createElement('span');
        unit.className = 'mv-unit';
        const num = document.createElement('span');
        num.className = 'mv-num';
        num.textContent = `${i / 2 + 1}.`;
        unit.appendChild(num);
        list.append(unit, ' ');
      }
      const mv = document.createElement('span');
      mv.className = 'mv' + (i + 1 === L.ply ? ' current' : '');
      mv.dataset.ply = i + 1;
      mv.textContent = san;
      unit.append(' ', mv);
    });
    // Only the list scrolls to its move: scrollIntoView would move the page, and the board with it.
    const cur = list.querySelector('.mv.current');
    if (cur) list.scrollTop += cur.getBoundingClientRect().top - list.getBoundingClientRect().top - list.clientHeight / 2;
    else list.scrollTop = 0;
    $('lib-nav-first').disabled = $('lib-nav-prev').disabled = L.ply === 0;
    $('lib-nav-next').disabled = $('lib-nav-last').disabled = L.ply === L.moves.length;
  },
};
