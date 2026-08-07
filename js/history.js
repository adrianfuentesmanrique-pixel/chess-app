// Game history: every game played against the engine, stored locally.
//
// The PGN is the source of truth and every other field is derived from it.
// That is what keeps future work cheap: a cloud backup uploads these records
// as they stand, imported or human games are the same record with a different
// `source`, and favorites/notes/analysis are new optional fields. None of
// those need a migration.
import * as db from './db.js';
import { classifyOpening } from './openings-eco.js';
import { t } from './i18n.js';
// Circular by design — js/app.js imports this module too. Safe because every
// one of these is either a hoisted function declaration or only touched inside
// an event handler. Never call them at module top level. See "The module
// boundary" in docs/superpowers/plans/2026-08-07-stockfish-game-history.md.
import { modal, askConfirm, segInit, segValue } from './app.js';

const $ = id => document.getElementById(id);

const PAGE = 30;

export const HISTORY_VERSION = 1;

// A game shorter than this was a misclick, not a game.
export const HISTORY_MIN_PLIES = 4;

function newUid() {
  return `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// Why the game stopped. Order matters: checkmate outranks everything, and a
// resignation is a player decision that no position check can detect.
export function endReasonOf(chess, { resigned = false, abandoned = false } = {}) {
  if (chess.isCheckmate()) return 'checkmate';
  if (resigned) return 'resign';
  if (chess.isStalemate()) return 'stalemate';
  if (chess.isThreefoldRepetition()) return 'repetition';
  if (chess.isInsufficientMaterial()) return 'insufficient';
  if (chess.isDrawByFiftyMoves()) return 'fiftyMove';
  if (chess.isDraw()) return 'draw';
  if (abandoned) return 'abandoned';
  return 'abandoned';
}

// `result` is the PGN-standard string; `outcome` is the same fact from the
// player's point of view, which is what the filters use.
export function resultOf(chess, playerColor, { resigned = false } = {}) {
  if (chess.isCheckmate()) {
    const winner = chess.turn() === 'w' ? 'b' : 'w';
    return { result: winner === 'w' ? '1-0' : '0-1',
             outcome: winner === playerColor ? 'win' : 'loss' };
  }
  if (resigned) {
    return { result: playerColor === 'w' ? '0-1' : '1-0', outcome: 'loss' };
  }
  if (chess.isDraw() || chess.isStalemate()) {
    return { result: '1/2-1/2', outcome: 'draw' };
  }
  return { result: '*', outcome: 'unfinished' };
}

export function buildRecord({ chess, startFen, playerColor, level, levelElo,
                              playedAt, pgn, resigned = false, abandoned = false }) {
  const history = chess.history();
  const { result, outcome } = resultOf(chess, playerColor, { resigned });
  return {
    uid: newUid(),
    version: HISTORY_VERSION,
    source: 'stockfish',
    playedAt,
    endedAt: Date.now(),
    playerColor,
    level,
    levelElo,
    result,
    outcome,
    endReason: endReasonOf(chess, { resigned, abandoned }),
    moveCount: Math.ceil(history.length / 2),
    opening: classifyOpening(history) || '',
    startFen,
    finalFen: chess.fen(),
    pgn,
  };
}

export function saveGame(rec) {
  return db.addHistoryGame(rec);
}

// --- the Game History screen ---

export const state = {
  items: [],      // loaded summaries, in display order
  count: PAGE,    // how many are requested
  hasMore: false,
  dir: 'prev',    // 'prev' = newest first
  filter: { outcome: '', playerColor: '', level: '', opening: '', from: '', to: '' },
};

// 'YYYY-MM-DD' -> local start or end of that day, in ms. null for a blank box.
function dayBound(str, end) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  if (!y || !m || !d) return null;
  return end ? new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
             : new Date(y, m - 1, d).getTime();
}

const emptyFilter = () => ({ outcome: '', playerColor: '', level: '', opening: '', from: '', to: '' });

// One predicate for every filter, run inside the cursor. Deliberately not
// index-per-filter: a single predicate is correct for every combination of
// filters, and the cursor still stops as soon as a page is full.
export function matcher() {
  const f = state.filter;
  const active = Object.values(f).some(v => v !== '' && v != null);
  if (!active) return null;
  const wantOpening = String(f.opening ?? '').toLowerCase();
  // Parsed field-by-field on purpose: new Date('2026-08-07') is UTC midnight,
  // which is the previous day west of Greenwich, so "From today" would let in
  // yesterday's games.
  const fromMs = dayBound(f.from, false);
  const toMs = dayBound(f.to, true);
  return (rec) => {
    if (f.outcome && rec.outcome !== f.outcome) return false;
    if (f.playerColor && rec.playerColor !== f.playerColor) return false;
    if (f.level !== '' && f.level != null && rec.level !== +f.level) return false;
    if (wantOpening && !String(rec.opening ?? '').toLowerCase().includes(wantOpening)) return false;
    if (fromMs !== null && rec.playedAt < fromMs) return false;
    if (toMs !== null && rec.playedAt > toMs) return false;
    return true;
  };
}

export function formatDuration(ms) {
  if (!ms || ms < 0) return '';
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60), s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Friendly and short: the year is noise for a game played this morning.
export function formatWhen(ms) {
  const d = new Date(ms);
  const time = d.toTimeString().slice(0, 5);
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const dayMs = 86400000;
  if (ms >= startOfToday.getTime()) return `${t('history_today')} ${time}`;
  if (ms >= startOfToday.getTime() - dayMs) return `${t('history_yesterday')} ${time}`;
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${time}`;
}

// The engine's name carries the difficulty, and the order of the two names
// carries the player's colour — which is why the card shows neither a level
// label nor a colour dot.
export function namesFor(rec) {
  const me = t('history_you');
  const bot = t('history_bot_name').replace('{lvl}', t('level_names')[rec.level]);
  return rec.playerColor === 'w' ? { white: me, black: bot } : { white: bot, black: me };
}

function displayResult(rec) {
  return rec.result === '1/2-1/2' ? '½-½' : rec.result;
}

export function init() {
  $('hist-back').onclick = () => close();

  segInit($('hist-chips'));
  $('hist-chips').addEventListener('click', () => {
    state.filter.outcome = segValue($('hist-chips')) ?? '';
    state.count = PAGE;
    load();
  });
  $('hist-sort').onclick = () => {
    state.dir = state.dir === 'prev' ? 'next' : 'prev';
    $('hist-sort').textContent = t(state.dir === 'prev' ? 'hist_newest' : 'hist_oldest');
    state.count = PAGE;
    load();
  };
  $('hist-filters').onclick = () => openFilters();
}

export function open() {
  $('play-setup').classList.add('hidden');
  $('play-game').classList.add('hidden');
  $('play-history').classList.remove('hidden');
  state.count = PAGE;
  syncControls();
  load();
}

export function close() {
  // Reset on the way out, so reopening the history never greets you with a
  // mysteriously empty list you filtered days ago.
  state.filter = emptyFilter();
  state.dir = 'prev';
  state.count = PAGE;
  $('play-history').classList.add('hidden');
  $('play-setup').classList.remove('hidden');
}

export async function load() {
  const { items, hasMore } = await db.pageHistory({
    count: state.count, dir: state.dir, match: matcher(),
  });
  state.items = items;
  state.hasMore = hasMore;
  renderFilterChip();
  render();
}

function render() {
  const el = $('hist-list');
  el.innerHTML = '';
  if (!state.items.length) {
    // "Nothing matched" and "you have no games" are different problems and
    // need different answers.
    if (matcher()) {
      el.innerHTML = `<p class="hint">${esc(t('hist_none_match'))}</p>`;
      return;
    }
    el.innerHTML = `<div class="kael-empty">
      <img src="icons/kael/kael-bust.png" class="kael-portrait" alt="Kael">
      <p class="hint">${esc(t('history_empty'))}</p>
    </div>`;
    return;
  }
  for (const rec of state.items) el.appendChild(card(rec));
  if (state.hasMore) {
    const more = document.createElement('button');
    more.className = 'btn';
    more.style.cssText = 'margin-top:8px; width:100%';
    more.textContent = t('history_load_more');
    more.onclick = () => { state.count += PAGE; load(); };
    el.appendChild(more);
  }
}

function card(rec) {
  const { white, black } = namesFor(rec);
  const line2 = rec.opening || t(`history_end_${rec.endReason}`);
  const meta = [
    `${rec.moveCount} ${t('history_moves')}`,
    formatDuration(rec.endedAt - rec.playedAt),
    formatWhen(rec.playedAt),
  ].filter(Boolean).join(' · ');

  const item = document.createElement('button');
  item.className = `list-item hist-item ${rec.outcome}`;
  item.innerHTML =
    `<span class="hist-players"><span class="ellipsis">${esc(white)} – ${esc(black)}</span>` +
    `<span class="hist-result">${esc(displayResult(rec))}</span></span>` +
    `<span class="hist-line2 ellipsis">${esc(line2)}</span>` +
    `<span class="hist-meta">${esc(meta)}</span>`;
  return item;
}

// close() clears the filter state; this puts the controls back in agreement
// with it, so the chip row can never claim a filter that is no longer applied.
function syncControls() {
  const chips = $('hist-chips');
  chips.querySelectorAll('button').forEach(b => {
    b.classList.toggle('on', (b.dataset.v ?? '') === (state.filter.outcome ?? ''));
  });
  $('hist-sort').textContent = t(state.dir === 'prev' ? 'hist_newest' : 'hist_oldest');
}

// Mirrors Base.openAdvanced() in js/app.js: same modal, same Apply/Clear row,
// same active-chip feedback — so this screen behaves like one the user knows.
function openFilters() {
  modal((box, close) => {
    const f = state.filter;
    box.innerHTML = `<h3>${esc(t('hist_filters'))}</h3>`;

    const label = (text) => {
      const l = document.createElement('label');
      l.className = 'hint';
      l.style.cssText = 'display:block; margin:8px 0 2px;';
      l.textContent = text;
      return l;
    };

    const colorSeg = document.createElement('div');
    colorSeg.className = 'seg';
    for (const [v, key] of [['', 'hist_any'], ['w', 'white'], ['b', 'black']]) {
      const b = document.createElement('button');
      b.dataset.v = v;
      b.textContent = t(key);
      if ((f.playerColor ?? '') === v) b.classList.add('on');
      colorSeg.appendChild(b);
    }
    segInit(colorSeg);
    box.append(label(t('hist_color')), colorSeg);

    const levelSel = document.createElement('select');
    levelSel.className = 'input';
    const anyOpt = document.createElement('option');
    anyOpt.value = ''; anyOpt.textContent = t('hist_any');
    levelSel.appendChild(anyOpt);
    t('level_names').forEach((name, i) => {
      const o = document.createElement('option');
      o.value = String(i); o.textContent = name;
      if (String(f.level) === String(i)) o.selected = true;
      levelSel.appendChild(o);
    });
    box.append(label(t('hist_level')), levelSel);

    const openingInp = document.createElement('input');
    openingInp.className = 'input';
    openingInp.value = f.opening ?? '';
    box.append(label(t('hist_opening')), openingInp);

    const fromInp = document.createElement('input');
    fromInp.className = 'input'; fromInp.type = 'date'; fromInp.value = f.from ?? '';
    const toInp = document.createElement('input');
    toInp.className = 'input'; toInp.type = 'date'; toInp.value = f.to ?? '';
    box.append(label(t('hist_from')), fromInp, label(t('hist_to')), toInp);

    const row = document.createElement('div');
    row.className = 'row';
    row.style.marginTop = '12px';
    const apply = document.createElement('button');
    apply.className = 'btn primary';
    apply.textContent = t('hist_apply');
    apply.onclick = () => {
      state.filter.playerColor = segValue(colorSeg) ?? '';
      state.filter.level = levelSel.value;
      state.filter.opening = openingInp.value.trim();
      state.filter.from = fromInp.value;
      state.filter.to = toInp.value;
      state.count = PAGE;
      close(null);
      load();
    };
    const clear = document.createElement('button');
    clear.className = 'btn';
    clear.textContent = t('hist_clear');
    clear.onclick = () => {
      clearSheetFilters();
      close(null);
    };
    row.append(apply, clear);
    box.appendChild(row);

    const wipe = document.createElement('button');
    wipe.className = 'btn danger';
    wipe.style.cssText = 'margin-top:16px; width:100%';
    wipe.textContent = t('hist_delete_all');
    wipe.onclick = async () => {
      close(null);
      if (await askConfirm(t('hist_delete_all_confirm'))) {
        await db.clearHistory();
        // Drop the filters too: with nothing left to filter, "no games match
        // this filter" would blame the filter for an empty history.
        state.filter = emptyFilter();
        state.count = PAGE;
        syncControls();
        load();
      }
    };
    box.appendChild(wipe);
  });
}

// Clears everything the sheet owns. The chip row is left alone: it is a
// separate control the user can still see, so silently flipping it back to
// "All" would be a change they did not ask for.
function clearSheetFilters() {
  state.filter = { ...emptyFilter(), outcome: state.filter.outcome };
  state.count = PAGE;
  load();
}

function renderFilterChip() {
  const el = $('hist-filter-chip');
  const f = state.filter;
  const bits = [];
  if (f.playerColor) bits.push(t(f.playerColor === 'w' ? 'white' : 'black'));
  if (f.level !== '' && f.level != null) bits.push(t('level_names')[+f.level]);
  if (f.opening) bits.push(f.opening);
  if (f.from || f.to) bits.push(`${f.from || '…'} – ${f.to || '…'}`);
  el.classList.toggle('hidden', !bits.length);
  if (!bits.length) return;
  el.innerHTML = '';
  const lab = document.createElement('span');
  lab.className = 'ellipsis';
  lab.textContent = bits.join(' · ');
  const btn = document.createElement('button');
  btn.textContent = t('hist_clear');
  btn.onclick = () => clearSheetFilters();
  el.append(lab, btn);
}

// Local copy: js/app.js keeps esc() private, and importing app.js here would
// create a circular import.
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
