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
// Two things are stored, both device-only and NOT in SYNCED_KEYS: the last view
// ('trainerView') and a study game left half-way ('libStudy': the line, the
// colour, the level and the moves played). Library names are labels, never
// storage keys.
//
// A study game is the existing trainer (Trainer in js/app.js) entered with a
// book made here: the line on screen and every library line that continues it.
// While it runs the section's data-view is 'study'.
//
// This module imports from js/app.js, which imports it back. The cycle is safe
// because every app.js binding used here is only read inside a method.
import { Chess } from '../vendor/chess.js';
import { t, tn, getLang } from './i18n.js';
import { Board, getPieceSet } from './board.js';
import * as db from './db.js';
import { fold, numbered, fullName, buildCards, filterCards, buildSearchIndex, searchLines, openingRows,
  buildNameIndex, nameAt, numberedFrom, continuations, buildBook } from './opening-lib.js';
import { GameTree } from './tree.js';
import { fenKey } from './explore-index.js';
import Tour from './tour.js';
import { $, esc, segInit, segValue, buildLevelSeg, modal, Trainer, Analysis } from './app.js';

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
  line: null,         // the preview: { o, l, moves, fens, lasts, ply }
  game: null,         // the study game on the trainer's board: { line } (its moves as text)
  saved: null,        // the study game left half-way: { line, color, level, sans, inBook }
  host: null,         // what Trainer is told of a study game, made in init()

  init() {
    this.host = { back: () => this.studyBack(), changed: () => this.saveStudy() };
    $('lib-study').onclick = () => this.study();
    $('lib-analyze').onclick = () => this.toAnalysis();
    $('lib-next-rows').addEventListener('click', e => {
      const b = e.target.closest('button[data-l]');
      if (b) this.openPreview(+b.dataset.o, +b.dataset.l, this.from);
    });
    $('lib-resume-go').onclick = () => this.resume();
    $('lib-resume-drop').onclick = () => { this.saved = null; db.kvSet('libStudy', null); this.renderResume(); };
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
    // A study game on the board is left first, as its own back button leaves it.
    if ($('screen-trainer').dataset.view === 'study') Trainer.leave();
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
        }).then(async () => {
          // A study game left half-way, if its line is still in the library.
          const s = await db.kvGet('libStudy', null).catch(() => null);
          if (s && this.byMoves.has(s.line) && Array.isArray(s.sans) && s.sans.length) this.saved = s;
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
    this.renderResume();
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
    this.line = { o, l, moves, fens, lasts, ply: moves.length };
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
    this.renderNext(hit);
  },

  // "Continues with": the next named lines after the moves on the board. A tap
  // opens that line, so the walk goes one name further each time.
  renderNext(hit) {
    const L = this.line, el = $('lib-next-rows');
    const next = continuations(this.lib, L.moves.slice(0, L.ply));
    $('lib-next').classList.toggle('hidden', !next.length);
    if (!next.length) { el._io?.disconnect(); el.innerHTML = ''; return; }
    paged(el, next, c => {
      const opening = this.lib[c.o], line = opening.lines[c.l];
      // Inside the opening on screen the variation says it all.
      const name = hit && hit.o === c.o && line[1] ? line[1] : fullName(opening, line);
      const b = this.rowEl(c.o, c.l, name, '');
      b.querySelector('.sub.moves').textContent = numberedFrom(line[2].split(' ').slice(L.ply), L.ply);
      if (c.more) b.insertAdjacentHTML('beforeend', `<span class="sub">${esc(tn('lib_variations', c.more))}</span>`);
      return b;
    }, ROW_PAGE);
  },

  toAnalysis() {
    const L = this.line;
    if (!L) return;
    const tree = new GameTree();
    for (const san of L.moves) tree.play(san);
    tree.setHeader('Event', fullName(this.lib[L.o], this.lib[L.o].lines[L.l]));
    Analysis.loadTree(tree, { baseId: null, gameId: null, fromGameReview: true });
  },

  // Study: colour (pre-set to the opening's side) and level on a sheet, then
  // the trainer.
  async study() {
    const L = this.line;
    if (!L) return;
    const opening = this.lib[L.o], line = L.moves.join(' ');
    const made = this.bookFor(line);
    const choice = await modal((box, close) => {
      box.classList.add('lib-study-sheet');
      box.innerHTML = `<h3>${esc(t('lib_study'))}</h3><p class="hint">${esc(fullName(opening, opening.lines[L.l]))}</p>`
        + `<div class="option-group"><label>${esc(t('color'))}</label><div class="seg" id="lib-study-color">`
        + ['w', 'b'].map(c => `<button data-v="${c}"${c === opening.side ? ' class="on"' : ''}>${esc(t(c === 'w' ? 'white' : 'black'))}</button>`).join('')
        + `</div></div><div class="option-group"><label>${esc(t('level'))}</label><div class="seg wrap" id="lib-study-level"></div></div>`
        + `<p class="hint">${esc(t('lib_study_book').replace('{n}', tn('lib_variations', made.lines)))}</p>`
        + `<div class="btn-duo"><button class="btn primary" id="lib-study-start">${esc(t('start_game'))}</button>`
        + `<button class="btn" id="lib-study-cancel">${esc(t('cancel'))}</button></div>`;
      const color = box.querySelector('#lib-study-color'), level = box.querySelector('#lib-study-level');
      // The level last chosen on the My databases form is where this one starts.
      buildLevelSeg(level, +(segValue($('trainer-level')) ?? 2));
      segInit(color);
      segInit(level);
      box.querySelector('#lib-study-start').onclick = () => close({ color: segValue(color), level: +segValue(level) });
      box.querySelector('#lib-study-cancel').onclick = () => close(null);
    });
    if (choice) this.startStudy({ line, ...choice });
  },

  // The book of a line: made once, kept while that line is the one studied.
  bookFor(line) {
    if (this.made?.line !== line) this.made = { line, ...buildBook(this.lib, line, { Chess, fenKey }) };
    return this.made;
  },

  // Enters the trainer with the library's book. `played` is a game being put back.
  startStudy({ line, color, level, played = null }) {
    Trainer.book = this.bookFor(line).book;
    Trainer.bookComments = new Map();
    Trainer.bookKey = 'lib|' + line;
    this.game = { line };
    $('screen-trainer').dataset.view = 'study';
    document.querySelector('main').scrollTop = 0;
    Trainer.begin({ color, level, host: this.host, played });
    this.saveStudy();
  },

  // The study game's back button: the preview it was started from.
  studyBack() {
    this.game = null;
    $('screen-trainer').dataset.view = this.view;
    document.querySelector('main').scrollTop = 0;
    this.renderResume();
  },

  // After every move of a study game and at its end. A game with no move yet
  // and a finished game leave nothing to come back to.
  saveStudy() {
    if (!this.game) return;
    const sans = Trainer.chess.history();
    this.saved = Trainer.over || !sans.length ? null
      : { line: this.game.line, color: Trainer.playerColor, level: Trainer.level, sans, inBook: Trainer.posHistory.slice(1).map(p => p.inBook) };
    db.kvSet('libStudy', this.saved);
  },

  renderResume() {
    const s = this.saved, hit = s && this.byMoves?.get(s.line);
    $('lib-resume').classList.toggle('hidden', !hit);
    if (!hit) return;
    $('lib-resume-go').textContent = t('lib_resume')
      .replace('{name}', fullName(this.lib[hit.o], this.lib[hit.o].lines[hit.l]))
      .replace('{n}', Math.floor(s.sans.length / 2) + 1);
  },

  // The saved game back on the board, over the preview of its line, so that
  // its back button has a preview to return to.
  resume() {
    const s = this.saved, hit = s && this.byMoves.get(s.line);
    if (!hit) return;
    this.openPreview(hit.o, hit.l, 'list');
    this.startStudy({ line: s.line, color: s.color, level: s.level, played: { sans: s.sans, inBook: s.inBook } });
  },
};
