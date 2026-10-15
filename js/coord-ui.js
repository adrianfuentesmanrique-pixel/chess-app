// Coordinates (Learn tab): the screen. The rules are js/coord.js; this file
// only decides what is on the screen.
//
// A view inside #screen-endgame (the Learn tab), opened from its section list.
// It has two faces: the SETUP (exercise, time, side, pieces, the best, Start)
// and the RUN (clock, score, what is asked, the board, the keys).
//
// A TRAINING TOOL: no rating, no leaderboard, nothing published. What is kept:
// the best timed score of each exercise at each length (js/coord.js
// coordBestKey: kv coordBestFind ... coordBestName180; they
// follow the account, they are not public) and, on this device only, the
// choices last made (kv coordPrefs).
//
// THE BOARD'S OWN a-h / 1-8 LABELS ARE HIDDEN here (css: #coord-board .coords):
// with them showing there is nothing to learn.
//
// THE CLOCK is a deadline, not a count of ticks, so a phone that sleeps or a
// slow frame cannot stretch a run. Leaving the view or the Learn tab drops the
// run without a result (stop(), called from js/app.js showScreen and
// Endgame.showView). The Android Back gesture does that too: only whole
// screens are in the Back history, as for every other Learn view.
//
// Imports from js/app.js (cycle): every app.js binding used here is touched
// inside a function only, never at module top level.
import { t } from './i18n.js';
import { Board } from './board.js';
import * as db from './db.js';
import { Sound } from './sound.js';
import { COORD_SECONDS, COORD_SECONDS_MAX, COORD_SECONDS_STEP, COORD_LENGTHS, coordSeconds, coordNewRun, coordBar, coordAnswer, coordKey, coordBestKey, coordIsBest, coordCountsForStreak, coordClock } from './coord.js';
import { $, modal, esc, segInit, Endgame, Streak, KaelQuotes } from './app.js';

const TICK_MS = 100;
const FLASH_MS = 320;
const MODES = ['find', 'name'], TIMES = ['timed', 'free'], SIDES = ['w', 'random', 'b'], PIECES = ['on', 'off'];
const SEGS = ['mode', 'time', 'side', 'pieces'];

export const CoordUI = {
  board: null,
  run: null,          // js/coord.js coordNewRun(), while a run is on
  running: false,
  deadline: 0,        // ms, a timed run's end
  timer: null,
  entry: '',          // 'name': the letter already given
  last: null,         // the run just ended: { reason, score, wrong, isBest, timed, best, key }
  best: {},           // by coordBestKey(mode, seconds)
  prefs: { mode: 'find', time: 'timed', side: 'random', seconds: COORD_SECONDS, pieces: 'on' },
  read: null,
  introOpen: false,

  init() {
    this.board = new Board($('coord-board'), { interactive: false });
    this.board.el.addEventListener('pointerdown', e => {
      const sq = e.target.closest('.sq');
      if (sq) this.tapSquare(sq.dataset.sq);
    });
    for (const k of SEGS) segInit(this.seg(k), v => this.setPref(k, v));
    // The run's length, as Blindfold's slider: it paints as it moves and is
    // saved when it is let go. Moving it also chooses the clock.
    const range = $('coord-seconds');
    range.min = COORD_SECONDS; range.max = COORD_SECONDS_MAX; range.step = COORD_SECONDS_STEP;
    range.oninput = () => {
      this.prefs.seconds = coordSeconds(range.value);
      this.prefs.time = 'timed';
      this.paintSetup();
    };
    range.onchange = () => this.setPref('seconds', coordSeconds(range.value));
    $('coord-keys').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (b) this.tapKey(b.dataset.k);
    });
    $('coord-back').onclick = () => Endgame.showSections();
    $('coord-start').onclick = () => this.start();
    $('coord-end').onclick = () => this.finish('stopped');
  },

  // #coord-side is the line under the board; the side's buttons are -side-seg.
  seg(k) { return $(k === 'side' ? 'coord-side-seg' : 'coord-' + k); },

  // What was chosen last time on this device, and the bests.
  load() {
    return this.read ||= (async () => {
      const p = (await db.kvGet('coordPrefs', null)) || {};
      if (MODES.includes(p.mode)) this.prefs.mode = p.mode;
      if (TIMES.includes(p.time)) this.prefs.time = p.time;
      if (SIDES.includes(p.side)) this.prefs.side = p.side;
      if (PIECES.includes(p.pieces)) this.prefs.pieces = p.pieces;
      this.prefs.seconds = coordSeconds(p.seconds);
      await this.readBest();
    })();
  },

  async readBest() {
    for (const m of MODES) {
      for (const s of COORD_LENGTHS) this.best[coordBestKey(m, s)] = +(await db.kvGet(coordBestKey(m, s), 0)) || 0;
    }
  },

  // After a sign-in the saved bests may have been replaced by the account's.
  async reload() {
    if (!this.read) return;
    await this.readBest();
    this.paintSetup();
  },

  async open() {
    await this.load();
    this.last = null;
    Endgame.showView('coord-view');
    this.paintSetup();
    this.intro();
  },

  // Kael explains the section the first time it is opened on this device.
  intro() {
    let seen = true;
    try { seen = !!localStorage.getItem('coordIntroDone'); } catch { /* no storage: say nothing */ }
    if (seen || this.introOpen) return;
    this.introOpen = true;
    modal((box, close) => {
      box.innerHTML = `<div class="kael-modal-head"><img src="icons/kael/kael-thinking.png" class="kael-portrait" alt="Kael" style="width:90px;"></div>
        <h3>${esc(t('coord_title'))}</h3>` + ['coord_intro_1', 'coord_intro_2', 'coord_intro_3'].map(k => `<p>${esc(t(k))}</p>`).join('');
      const ok = document.createElement('button');
      ok.className = 'btn primary big'; ok.id = 'coord-intro-ok'; ok.textContent = t('calc_intro_ok');
      ok.onclick = () => close(true);
      box.append(ok);
    }).then(() => {
      this.introOpen = false;
      try { localStorage.setItem('coordIntroDone', '1'); } catch { /* it will be said again */ }
    });
  },

  setPref(key, value) {
    this.prefs[key] = value;
    db.kvSet('coordPrefs', { ...this.prefs });
    this.paintSetup();
  },

  // ── the run ──

  start() {
    const { mode, time, side, seconds, pieces } = this.prefs;
    this.clear();
    this.run = coordNewRun({ mode, timed: time === 'timed', side, seconds });
    this.running = true;
    this.entry = '';
    this.last = null;
    KaelQuotes.hide();   // nothing of Kael's is left over the board
    this.board.setOrientation(this.run.orientation);
    this.board.setPiecesHidden(pieces === 'off');
    $('coord-setup').classList.add('hidden');
    $('coord-run').classList.remove('hidden');
    // The run takes the whole height and Kael's corner gives up its place (css).
    $('screen-endgame').classList.add('coord-on');
    document.body.classList.add('coord-running');
    document.querySelector('main').scrollTop = 0;
    if (this.run.timed) {
      this.deadline = Date.now() + this.run.seconds * 1000;
      this.timer = setInterval(() => this.tick(), TICK_MS);
    }
    this.paintRun();
  },

  tick() {
    if (!this.running) return;
    const left = this.deadline - Date.now();
    this.paintClock(left);
    if (left <= 0) this.finish('time');
  },

  // 'find': a tap on the board is the answer.
  tapSquare(sq) {
    if (!this.running || this.run.mode !== 'find') return;
    this.answer(sq, sq);
  },

  // 'name': a letter, then a number.
  tapKey(key) {
    if (!this.running || this.run.mode !== 'name') return;
    const res = coordKey(this.entry, key);
    this.entry = res.entry;
    if (res.square) this.answer(res.square, this.run.asked);
    else this.paintRun();
  },

  // `shown` is the square that flashes: the one tapped, or the one lit.
  answer(square, shown) {
    const right = coordAnswer(this.run, square);
    Sound.play(right ? 'puzzle-correct' : 'puzzle-wrong');
    this.flash(shown, right);
    this.paintRun();
  },

  flash(sq, right) {
    const el = this.board.squares[sq], cls = right ? 'coord-right' : 'coord-wrong';
    el.classList.remove('coord-right', 'coord-wrong');
    void el.offsetWidth;   // restart the animation on a square flashed twice
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), FLASH_MS);
    if (right) return;
    const ask = $('coord-ask');
    ask.classList.remove('shake');
    void ask.offsetWidth;
    ask.classList.add('shake');
  },

  // The clock ran out ('time') or Finish was tapped ('stopped'). Either way the
  // points made are the run's result.
  finish(reason) {
    if (!this.running) return;
    const run = this.run;
    const key = coordBestKey(run.mode, run.seconds);
    const isBest = coordIsBest(run, this.best[key]);
    if (isBest) {
      this.best[key] = run.score;
      db.kvSet(key, run.score);
    }
    this.last = { reason, score: run.score, wrong: run.wrong, isBest, timed: run.timed, best: run.timed ? this.best[key] : 0, key };
    this.clear();
    this.paintSetup();
    if (coordCountsForStreak(run)) Streak.recordActivity();
  },

  // Leaving the view or the tab: the run is dropped and nothing is recorded.
  stop() {
    if (!this.running) return;
    this.last = null;
    this.clear();
    this.paintSetup();
  },

  clear() {
    clearInterval(this.timer);
    this.timer = null;
    this.running = false;
    this.run = null;
    this.entry = '';
    if (!this.board) return;
    for (const el of Object.values(this.board.squares)) el.classList.remove('coord-lit', 'coord-right', 'coord-wrong');
    $('screen-endgame').classList.remove('coord-on');
    document.body.classList.remove('coord-running');
    $('coord-run').classList.add('hidden');
    $('coord-setup').classList.remove('hidden');
  },

  // ── drawing ──

  // Also called on a change of language.
  render() {
    if (!this.board) return;
    if (this.running) this.paintRun(); else this.paintSetup();
  },

  paintSetup() {
    if (!this.board || this.running) return;
    for (const k of SEGS) {
      for (const b of this.seg(k).querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === this.prefs[k]);
    }
    const length = coordClock(this.prefs.seconds * 1000);
    $('coord-time-timed').textContent = t('coord_time_timed').replace('{t}', length);
    $('coord-seconds').value = this.prefs.seconds;
    $('coord-seconds').setAttribute('aria-label', t('coord_time'));
    $('coord-seconds').setAttribute('aria-valuetext', length);
    $('coord-len').classList.toggle('locked', this.prefs.time !== 'timed');
    // The best of this exercise at the length the slider is on.
    const chosen = coordBestKey(this.prefs.mode, this.prefs.seconds), best = this.best[chosen] || '—';
    $('coord-best-label').textContent = t('coord_best').replace('{t}', length);
    $('coord-best').textContent = best;
    const last = this.last;
    $('coord-result').classList.toggle('hidden', !last);
    $('coord-explain').classList.toggle('hidden', !!last);
    // With a result on the screen the best is said in the result's own line:
    // the card and the result together do not fit above Start on a short phone.
    // The line says the run's own best until the exercise or the length chosen
    // is another one; from then on it says the best of what is chosen.
    $('coord-best-row').classList.toggle('hidden', !!last);
    $('coord-start').textContent = t(last ? 'coord_again' : 'coord_start');
    if (!last) return;
    $('coord-result-title').textContent = t(last.reason === 'time' ? 'coord_result_time' : 'coord_result_stopped');
    $('coord-result-score').textContent = last.score;
    $('coord-result-line').textContent = t('coord_result_line').replace('{n}', last.score).replace('{w}', last.wrong)
      + (chosen !== last.key ? ' · ' + t('coord_result_best_at').replace('{t}', length).replace('{n}', best)
        : last.isBest ? ' · ' + t('coord_result_best') : last.best ? ' · ' + t('coord_result_best_n').replace('{n}', last.best) : '');
    $('coord-result').classList.toggle('best', last.isBest);
  },

  paintClock(left) {
    $('coord-clock').textContent = '⏱ ' + coordClock(left);
    // The bar empties as the time goes.
    $('coord-bar-fill').style.width = coordBar(this.run, left) + '%';
  },

  paintRun() {
    const run = this.run;
    if (!run) return;
    const naming = run.mode === 'name';
    $('coord-clock').classList.toggle('hidden', !run.timed);
    $('coord-bar').classList.toggle('hidden', !run.timed);
    if (run.timed) this.paintClock(this.deadline - Date.now());
    $('coord-score').textContent = '✓ ' + run.score;
    $('coord-score').setAttribute('aria-label', t('coord_right_n').replace('{n}', run.score));
    $('coord-wrong').textContent = '✗ ' + run.wrong;
    $('coord-wrong').setAttribute('aria-label', t('coord_wrong_n').replace('{n}', run.wrong));
    $('coord-ask-label').textContent = t(naming ? 'coord_ask_name' : 'coord_ask_find');
    $('coord-ask-sq').textContent = naming ? (this.entry || '?') + (this.entry ? '?' : '') : run.asked;
    $('coord-ask-next').textContent = naming ? '' : t('coord_ask_next').replace('{x}', run.next);
    $('coord-side').textContent = t(run.orientation === 'w' ? 'coord_side_w' : 'coord_side_b');
    $('coord-keys').classList.toggle('hidden', !naming);
    for (const b of $('coord-keys').querySelectorAll('button')) b.classList.toggle('on', b.dataset.k === this.entry);
    for (const [name, el] of Object.entries(this.board.squares)) el.classList.toggle('coord-lit', naming && name === run.asked);
  },
};
