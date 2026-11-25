// Survival (v259): puzzles one after another, each a little harder, until the
// first miss. No clock, one skip a run, and no ELO — only the record
// (kv 'survivalBest', synced).
//
// THE BOARD IS RUSH'S, as in Pulso (js/pulso-match.js): `game` is Rush's own
// engine over the survival-* elements, with its own pickNext target, solve and
// miss. Moving pieces, replies and pre-moves all stay in Rush.
import { t, tn } from './i18n.js';
import { Board } from './board.js';
import { Sound } from './sound.js';
import { REPLY_MS } from './move-feel.js';
import { ensureForRating } from './puzzles.js';
import * as db from './db.js';
import { logActivity } from './activity-log.js';
// Circular by design — js/app.js imports this module too. Only touched inside
// functions, never at module top level.
import { $, toast, showScreen, Rush, PuzzleLog, KaelQuotes, Streak, STREAK_MIN_RUSH_SOLVED, shareStatCard } from './app.js';

export const BEST_KEY = 'survivalBest';
export const SKIPS = 1;
// Where a run starts and how fast it climbs: 800, then +50 a solve — 1300
// after 10, 1800 after 20, the top of the scale after 32.
export const survivalTarget = score => Math.min(2400, 800 + score * 50);
const MISS_MS = 1300;   // the wrong move stays on screen this long before the result

// The time a puzzle took, as its dot shows it: "45 s", "4 min", "1.5 h".
export function spentText(ms) {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.round(s / 360) / 10} h`;
}
// A dot of the strip: the puzzle's rating and how long it took.
export const dotText = (rating, ms) => `${rating} (${spentText(ms)})`;

export const Survival = {
  game: null,
  skips: SKIPS,
  stoppedBy: null,   // the rating of the puzzle that ended the run
  shownAt: 0,        // when the puzzle on the board appeared, for its dot's time

  init() {
    const self = this;
    const g = this.game = Object.assign(Object.create(Rush), {
      prefix: 'survival',
      // Its own copy of everything the engine keeps, so nothing is read from
      // (or cleared on) Rush through the prototype.
      board: null, chess: null, current: null, moveIdx: 0, prompt: '', score: 0,
      running: false, run: null, countingIn: false, timer: null, usedIds: new Set(),
      target() { return survivalTarget(this.score); },
      updateHud: () => this.paintHud(),
      loadNext() { Rush.loadNext.call(this); self.shownAt = Date.now(); self.paintHud(); },
      onSolve: run => this.solved(run),
      onMistake: run => this.missed(run),
    });
    g.board = new Board(g.el('board'), { onMove: mv => g.userMove(mv), onSound: type => Sound.play(type), premove: true });
    $('survival-start').onclick = () => this.start();
    $('survival-again').onclick = () => this.start();
    $('survival-exit').onclick = () => { this.stop(); showScreen('puzzles'); };
    $('survival-share').onclick = () => this.share();
    $('survival-skip').onclick = () => this.skip();
  },

  async open() {
    showScreen('survival');
    this.pane('intro');
    $('survival-best-score').textContent = await db.kvGet(BEST_KEY, 0);
  },

  pane(name) {
    for (const p of ['intro', 'game', 'result']) $('survival-' + p).classList.toggle('hidden', p !== name);
  },

  async start() {
    const g = this.game;
    $('survival-start').disabled = true;
    try {
      await ensureForRating(survivalTarget(0));
    } catch {
      toast(t('puzzles_unavailable'));
      return;
    } finally {
      $('survival-start').disabled = false;
    }
    KaelQuotes.hide();
    g.usedIds = new Set();
    g.score = 0;
    g.countingIn = false;
    g.running = true;
    g.run = {};
    this.skips = SKIPS;
    this.stoppedBy = null;
    // One strip, under the board while playing and in the result card after.
    $('survival-game').appendChild($('survival-log'));
    PuzzleLog.reset('survival');
    this.pane('game');
    g.loadNext();
  },

  paintHud() {
    const g = this.game;
    $('survival-score').textContent = `🛡️ ${g.score}`;
    $('survival-rating').textContent = g.current ? `≈ ${g.current.rating}` : '';
    const skip = $('survival-skip');
    skip.innerHTML = `⏭ <span>${t('survival_skip')}</span> <small>${this.skips}</small>`;
    skip.disabled = this.skips <= 0;
  },

  logDot(solved) {
    const p = this.game.current;
    if (!p) return;
    PuzzleLog.add('survival', p, solved, null, null, dotText(p.rating, Date.now() - (this.shownAt || Date.now())));
  },

  skip() {
    const g = this.game;
    if (!g.running || this.skips <= 0) return;
    this.skips--;
    // A new run token: the skipped puzzle's pending reply never lands on the next.
    g.run = {};
    g.loadNext();
  },

  solved(run) {
    const g = this.game;
    g.score++;
    this.logDot(true);
    this.paintHud();
    setTimeout(() => { if (g.live(run)) g.loadNext(); }, REPLY_MS.rushNext);
  },

  missed(run) {
    const g = this.game;
    this.logDot(false);
    Sound.play('puzzle-wrong');
    this.stoppedBy = g.current.rating;
    g.el('status').textContent = t('survival_missed');
    setTimeout(() => { if (g.live(run)) this.finish(); }, MISS_MS);
  },

  async finish() {
    const g = this.game;
    if (!g.running) return;
    g.running = false;
    g.board.clearPremove();
    g.board.interactive = false;
    const score = g.score;
    const best = await db.kvGet(BEST_KEY, 0);
    const isNew = score > best;
    if (isNew) await db.kvSet(BEST_KEY, score);
    logActivity('survival', { best: score });
    if (score >= STREAK_MIN_RUSH_SOLVED) Streak.recordActivity();
    $('survival-result-title').textContent = `🛡️ ${t('survival_over')}`;
    $('survival-result-new').classList.toggle('hidden', !isNew || score === 0);
    $('survival-result-score').textContent = score;
    $('survival-result-label').textContent = tn('survival_in_row_label', score);
    $('survival-result-best').textContent = isNew && score ? '' : `${t('survival_best')}: ${Math.max(best, score)}`;
    $('survival-result-killer').textContent = this.stoppedBy ? `❌ ${t('survival_stopped_by').replace('{r}', this.stoppedBy)}` : '';
    $('survival-log-slot').appendChild($('survival-log'));
    this.pane('result');
    document.querySelector('main').scrollTop = 0;
  },

  // showScreen() calls this for every screen that is not Survival. A run left
  // half way is not scored.
  stop() {
    const g = this.game;
    if (!g) return;
    g.running = false;
    g.board?.clearPremove();
  },

  share() {
    shareStatCard({
      emoji: '🛡️',
      title: t('card_survival_title'),
      subtitle: tn('survival_in_row', this.game.score),
    }, 'survival.png');
  },
};
