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
};

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
}

export function open() {
  $('play-setup').classList.add('hidden');
  $('play-game').classList.add('hidden');
  $('play-history').classList.remove('hidden');
  state.count = PAGE;
  load();
}

export function close() {
  $('play-history').classList.add('hidden');
  $('play-setup').classList.remove('hidden');
}

export async function load() {
  const { items, hasMore } = await db.pageHistory({ count: state.count, dir: state.dir });
  state.items = items;
  state.hasMore = hasMore;
  render();
}

function render() {
  const el = $('hist-list');
  el.innerHTML = '';
  if (!state.items.length) {
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

// Local copy: js/app.js keeps esc() private, and importing app.js here would
// create a circular import.
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
