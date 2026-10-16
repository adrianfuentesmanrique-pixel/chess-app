// Learn tab stages — the screens: a section's list of stages, the level board,
// and Kael's start and finish sheets. Rules and stars: js/stages.js; levels:
// js/stages-data.js; plan: docs/plans/2026-10-15-learn-stages.md.
//
// Progress is kept on this phone only (db 'learnProgress', NOT a synced key)
// and is never rated: nothing here may touch endgameElo or the radar.
import { t, tn, getLang } from './i18n.js';
import { Board } from './board.js';
import * as db from './db.js';
import { Sound } from './sound.js';
import { Chess } from '../vendor/chess.js';
import { STAGE_SECTIONS } from './stages-data.js';
import { levelVerdict, punishMove, levelStars, recordLevel, stageStars, sectionSummary, nextStageIdx, firstOpenLevel, cleanProgress } from './stages.js';
import { $, modal, esc, Endgame, Streak } from './app.js';

const PROGRESS_KEY = 'learnProgress';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const L = o => o[getLang()] || o.es;
const starRow = (n, of = 3) => `${'★'.repeat(n)}<span class="off">${'★'.repeat(of - n)}</span>`;
const kaelImg = mood => `icons/kael/kael-${mood}.png`;

export const StagesUI = {
  board: null,
  progress: {},
  section: null,
  stage: null,
  levelIdx: 0,
  mistakes: 0,
  hinted: false,
  busy: false,          // a wrong move is on the board, or the level is solved
  timer: null,          // the pending undo / next level / finish sheet

  init() {
    this.board = new Board($('stage-board'), {
      interactive: false,
      onMove: mv => this.move(mv),
      onSound: type => Sound.play(type),
    });
    $('stage-back-list').onclick = () => Endgame.showSections();
    $('stage-back').onclick = () => this.openSection(this.section);
    $('stage-hint').onclick = () => this.hint();
    $('stage-next').onclick = () => this.next();
    $('stage-retry').onclick = () => this.retry();
    $('stage-retry-hint').onclick = () => { this.retry(); this.hint(); };
    $('stage-dots').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (b) this.playLevel(+b.dataset.i);
    });
    this.load();
  },

  async load() {
    this.progress = cleanProgress(await db.kvGet(PROGRESS_KEY, {}));
    // The sections list may already be on screen with empty rings.
    if (!$('endgame-sections-view').classList.contains('hidden')) Endgame.renderSections();
  },

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
    this.busy = false;
    if (this.board) this.board.interactive = false;
  },

  // ── the row on the Learn tab (Endgame.renderSections puts it in) ──
  sectionItems() {
    return STAGE_SECTIONS.map(section => {
      const s = sectionSummary(this.progress, section);
      const pct = s.max ? s.got / s.max : 0;
      const r = 15, c = 2 * Math.PI * r;
      const item = document.createElement('button');
      item.className = 'list-item stage-row';
      item.dataset.section = section.id;
      item.innerHTML = `<svg class="stage-ring" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="${r}" class="stage-ring-bg"/>`
        + `<circle cx="18" cy="18" r="${r}" class="stage-ring-fg" stroke-dasharray="${(c * pct).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 18 18)"/>`
        + `<text x="18" y="22" text-anchor="middle">${Math.round(pct * 100)}%</text></svg>`
        + `<span class="stage-txt"><b>${esc(L(section.title))}${s.got ? '' : `<span class="stage-new">${esc(t('stage_new'))}</span>`}</b>`
        + `<span class="sub">${esc(L(section.blurb))} · ★ ${s.got}/${s.max}</span></span>`;
      item.onclick = () => this.openSection(section);
      return item;
    });
  },

  // ── a section: its stages, done / next / to come ──
  openSection(section) {
    this.stop();
    this.section = section;
    Endgame.showView('stage-list-view');
    $('stage-section-title').textContent = L(section.title);
    const sum = sectionSummary(this.progress, section);
    $('stage-section-sum').textContent = t('stage_section_sum')
      .replace('{got}', sum.got).replace('{max}', sum.max).replace('{d}', sum.stagesDone).replace('{n}', sum.stages);
    const next = nextStageIdx(this.progress, section);
    const el = $('stage-list');
    el.innerHTML = '';
    section.stages.forEach((stage, i) => {
      const s = stageStars(this.progress, stage);
      const kind = s.complete ? 'done' : i === next ? 'next' : 'todo';
      const mark = kind === 'done' ? '✓' : kind === 'next' ? '▶' : String(i + 1);
      let sub = tn('stage_levels', stage.levels.length);
      if (!s.complete && s.done) sub += ` · ${t('stage_levels_done').replace('{n}', s.done)}`;
      // A finished stage shows its stars as the rounded average of its levels.
      const stars = s.complete ? `<span class="stage-st">${starRow(Math.round(s.got / stage.levels.length))}</span>` : '';
      const item = document.createElement('button');
      item.className = 'list-item stage-row' + (kind === 'next' ? ' next' : '');
      item.dataset.stage = stage.id;
      item.innerHTML = `<span class="stage-mark ${kind}" aria-hidden="true">${mark}</span>`
        + `<span class="stage-txt"><b>${esc(L(stage.title))}</b><span class="sub">${esc(sub)}</span></span>${stars}`;
      item.onclick = () => this.openStage(stage);
      el.appendChild(item);
    });
  },

  // ── a stage: Kael introduces it the first time, then its levels ──
  openStage(stage) {
    this.stage = stage;
    const s = stageStars(this.progress, stage);
    this.playLevel(firstOpenLevel(this.progress, stage));
    if (s.done === 0) this.introSheet();
  },

  introSheet() {
    const stage = this.stage;
    this.board.interactive = false;
    modal((box, close) => {
      box.innerHTML = `<div class="kael-modal-head"><img src="${kaelImg('idea')}" class="kael-portrait" alt="Kael"></div>`
        + `<h3 class="stage-sheet-title">${esc(L(stage.title))}</h3><p class="stage-sheet-text">${esc(L(stage.intro))}</p>`
        + `<p class="hint stage-sheet-hint">${esc(t('stage_intro_levels').replace('{n}', stage.levels.length))}</p>`;
      const go = document.createElement('button');
      go.className = 'btn big stage-gold';
      go.textContent = t('stage_go');
      go.onclick = () => close(true);
      box.appendChild(go);
    }).then(() => {
      if (this.stage === stage && !this.busy) this.board.interactive = true;
    });
  },

  playLevel(idx) {
    const stage = this.stage;
    if (!stage || idx < 0 || idx >= stage.levels.length) return;
    this.stop();
    Endgame.showView('stage-view');
    this.levelIdx = idx;
    this.mistakes = 0;
    this.hinted = false;
    const lv = stage.levels[idx];
    $('stage-title').textContent = L(stage.title);
    this.paintGoal('', t('stage_level').replace('{n}', idx + 1).replace('{m}', stage.levels.length), L(stage.goalText));
    $('stage-stars').innerHTML = starRow(0);
    this.paintDots();
    this.say('encouraging', t('stage_kael_level'));
    $('stage-hint').classList.add('hidden');
    $('stage-next').classList.add('hidden');
    this.showRetry(false);
    this.board.setOrientation('w');
    this.board.setShapes({ squares: [], arrows: [] });
    this.board.setPosition(lv.fen);
    this.board.interactive = true;
  },

  paintGoal(state, level, what) {
    const g = $('stage-goal');
    g.classList.remove('good', 'bad');
    if (state) g.classList.add(state);
    $('stage-level').textContent = level;
    $('stage-what').textContent = what;
  },

  paintDots() {
    const row = this.progress[this.stage.id] || [];
    $('stage-dots').innerHTML = this.stage.levels.map((_, i) => {
      const n = row[i] || 0;
      const label = t('stage_level').replace('{n}', i + 1).replace('{m}', this.stage.levels.length);
      return `<button data-i="${i}" class="${i === this.levelIdx ? 'cur' : ''}" aria-label="${esc(label)}">${n ? '★'.repeat(n) : i === this.levelIdx ? '●' : ''}</button>`;
    }).join('');
  },

  say(mood, text) {
    const img = $('stage-kael-img');
    if (img.getAttribute('src') !== kaelImg(mood)) img.src = kaelImg(mood);
    $('stage-say').textContent = text;
  },

  move(mv) {
    if (this.busy || !this.stage) return;
    const lv = this.stage.levels[this.levelIdx];
    const chess = new Chess(this.board.fen);
    let result;
    try { result = chess.move(mv); } catch { return; }
    const verdict = levelVerdict(lv, result, chess);
    this.busy = true;
    this.board.interactive = false;
    this.board.setPosition(chess.fen(), { from: result.from, to: result.to });
    if (verdict.ok) this.solved(result);
    else this.wrong(result, verdict.why, chess);
  },

  async solved(result) {
    const stage = this.stage, idx = this.levelIdx;
    const lv = stage.levels[idx];
    const stars = levelStars(this.mistakes, this.hinted);
    this.board.setShapes({ squares: [{ sq: result.to, color: 'green' }], arrows: [] });
    Sound.play('puzzle-correct');
    const head = this.mistakes || this.hinted ? t('stage_ok_after') : t('stage_ok_first');
    this.paintGoal('good', t('stage_ok_title'), head);
    // The level's stars fill in one after another (no movement under reduce motion: CSS).
    $('stage-stars').innerHTML = Array.from({ length: 3 }, (_, i) =>
      i < stars ? `<span class="pop" style="animation-delay:${i * 150}ms">★</span>` : '<span class="off">★</span>').join('');
    this.say('happy', lv.say ? L(lv.say) : t('stage_good_' + (1 + Math.floor(Math.random() * 3))));
    $('stage-hint').classList.add('hidden');
    const before = stageStars(this.progress, stage).complete;
    this.progress = recordLevel(this.progress, stage.id, idx, stars, stage.levels.length);
    this.paintDots();
    db.kvSet(PROGRESS_KEY, this.progress);
    Streak.recordActivity();
    const nowDone = stageStars(this.progress, stage).complete;
    const last = idx === stage.levels.length - 1;
    if (last || (nowDone && !before)) {
      this.timer = setTimeout(() => this.finishSheet(), 1100);
      return;
    }
    $('stage-next').classList.remove('hidden');
    // A level that says something gives time to read it.
    this.timer = setTimeout(() => this.next(), lv.say ? 3200 : 1600);
  },

  wrong(result, why, after) {
    const lv = this.stage.levels[this.levelIdx];
    this.mistakes++;
    this.board.setShapes({ squares: [{ sq: result.to, color: 'red' }], arrows: [] });
    Sound.play('puzzle-wrong');
    // A piece left hanging: the opponent shows why by taking it (mockup c-wrong).
    const punish = lv.goal === 'save' ? punishMove(lv, result, after) : null;
    if (punish) {
      this.timer = setTimeout(() => this.punish(punish, after), 650);
      return;
    }
    this.paintGoal('bad', t('stage_wrong_title'), t('stage_why_' + why) || t('learn_try_again'));
    this.say('encouraging', t('stage_wrong_kael'));
    $('stage-hint').classList.remove('hidden');
    this.shake();
    // The wrong move stays a moment so it can be seen, then the level resets.
    this.timer = setTimeout(() => this.retry(), 1200);
  },

  shake() {
    if (reduceMotion.matches) return;
    $('stage-board').classList.add('shake');
    setTimeout(() => $('stage-board').classList.remove('shake'), 500);
  },

  // The opponent's capture stays on the board, with a red arrow, until the
  // player taps Reintentar (or Pista).
  punish(uci, after) {
    const m = after.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    this.board.setPosition(after.fen(), { from: m.from, to: m.to });
    this.board.setShapes({ squares: [{ sq: m.to, color: 'red' }], arrows: [{ from: m.from, to: m.to, color: 'red' }] });
    this.paintGoal('bad', t('stage_punish_title').replace('{a}', t('stage_pc_by_' + m.piece)).replace('{b}', t('stage_pc_' + m.captured)), t('stage_punish_what'));
    this.say('encouraging', t('stage_punish_kael'));
    this.showRetry(true);
    this.shake();
  },

  showRetry(on) {
    $('stage-retry-row').classList.toggle('hidden', !on);
    $('stage-dots').classList.toggle('hidden', on);
  },

  // Back to the level's start position, same level, mistakes kept.
  retry() {
    clearTimeout(this.timer);
    const lv = this.stage.levels[this.levelIdx];
    this.busy = false;
    this.showRetry(false);
    this.board.setShapes({ squares: [], arrows: [] });
    this.board.setPosition(lv.fen);
    this.paintGoal('', t('stage_level').replace('{n}', this.levelIdx + 1).replace('{m}', this.stage.levels.length), L(this.stage.goalText));
    $('stage-hint').classList.remove('hidden');
    this.board.interactive = true;
  },

  hint() {
    if (this.busy) return;
    const lv = this.stage.levels[this.levelIdx];
    this.hinted = true;
    this.board.setShapes({ squares: [], arrows: [{ from: lv.solution.slice(0, 2), to: lv.solution.slice(2, 4), color: 'green' }] });
    this.say('idea', t('stage_hint_kael'));
  },

  next() {
    clearTimeout(this.timer);
    const idx = this.levelIdx + 1;
    if (idx < this.stage.levels.length) this.playLevel(idx);
    else this.finishSheet();
  },

  finishSheet() {
    clearTimeout(this.timer);
    const stage = this.stage, section = this.section;
    const s = stageStars(this.progress, stage);
    const i = section.stages.indexOf(stage);
    const nextStage = section.stages[i + 1] || null;
    Sound.play('game-win');
    modal((box, close) => {
      box.innerHTML = `<div class="kael-modal-head"><img src="${kaelImg('proud')}" class="kael-portrait" alt="Kael"></div>`
        + `<h3 class="stage-sheet-title">${esc(t('stage_done_title'))}</h3>`
        + `<div class="stage-big-stars">${starRow(Math.round(s.got / stage.levels.length))}</div>`
        + `<p class="stage-sheet-text">${esc(t('stage_done_sum').replace('{t}', L(stage.title)).replace('{got}', s.got).replace('{max}', s.max))}</p>`;
      const go = document.createElement('button');
      go.className = 'btn big stage-gold';
      go.textContent = nextStage ? t('stage_next_stage').replace('{t}', L(nextStage.title)) : t('back');
      go.onclick = () => close('next');
      const again = document.createElement('button');
      again.className = 'btn big stage-again';
      again.textContent = t('stage_repeat');
      again.onclick = () => close('again');
      box.append(go, again);
    }).then(choice => {
      if (this.stage !== stage) return;
      if (choice === 'again') this.playLevel(0);
      else if (choice === 'next' && nextStage) this.openStage(nextStage);
      else this.openSection(section);
    });
  },
};
