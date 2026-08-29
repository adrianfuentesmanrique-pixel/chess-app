// ═══════════════════════ GUIDED TOUR ═══════════════════════
// Kael walks a first-time user through one feature per step: the background
// dims, the relevant control keeps a gold ring, and nothing else can be tapped
// until the step is done.
//
// Deliberately a separate module. app.js is already 232 KB and every task in
// this repo pays for that; the tour only needs four things from it, which
// arrive through the ctx object in start() instead of an import cycle.
//
// Two rules the step data must respect, both learned from the real screens:
//   1. The tour never creates data and never leaves the user mid-game. Any
//      feature that only exists during a running game (the in-book badge, the
//      analyse-this-game button) is described from the setup screen instead.
//   2. A step may only target something a brand-new account actually has. The
//      Learn walk-through goes into Basic Checkmates because every lesson in
//      that section has both a demo and a Practice button; the first Rules
//      lesson has neither.

import { t } from './i18n.js';

const $ = id => document.getElementById(id);

// A step:
//   screen    the screen this step lives on — forced on entry, which is what
//             makes Back safe: every step restores its own context.
//   target    selector, or a list of them for one ring around several controls
//   wrap      climb to this ancestor before drawing the ring
//   action    'next' = read and continue, 'tap' = the user must really tap it
//   waitFor   for tap steps: advance once this selector becomes visible
//   enter     puts a screen's sub-views back where the step expects them
const STEPS = [
  { key: 'welcome', screen: 'analysis', t: 'tour_welcome_t', b: 'tour_welcome_b', target: null },

  // ── Analysis ──────────────────────────────────────────────────────────
  { key: 'board', screen: 'analysis', t: 'tour_board_t', b: 'tour_board_b', target: '#ana-board' },
  { key: 'engine', screen: 'analysis', t: 'tour_engine_t', b: 'tour_engine_b', target: '#ana-engine-toggle' },
  { key: 'setup', screen: 'analysis', t: 'tour_setup_t', b: 'tour_setup_b', target: '#ana-setup-btn' },
  { key: 'anaMore', screen: 'analysis', t: 'tour_ana_more_t', b: 'tour_ana_more_b', target: '#ana-toolbar', style: 'frame' },

  // ── Learn ─────────────────────────────────────────────────────────────
  {
    key: 'learnTab', screen: 'analysis', t: 'tour_learn_tab_t', b: 'tour_learn_tab_b',
    target: '#tabbar button[data-screen="endgame"]', action: 'tap', waitFor: '#endgame-sections-view',
    enter: resetLearn,
  },
  {
    key: 'learnSec', screen: 'endgame', t: 'tour_learn_sec_t', b: 'tour_learn_sec_b',
    target: '#endgame-section-list .list-item:nth-child(2)', action: 'tap', waitFor: '#learn-lesson-list-view',
    enter: resetLearn,
  },
  {
    key: 'learnLes', screen: 'endgame', t: 'tour_learn_les_t', b: 'tour_learn_les_b',
    target: '#learn-lesson-list', action: 'tap', waitFor: '#learn-lesson-view',
    enter: () => clickIfVisible('learn-back-lessons'),
  },
  { key: 'learnDemo', screen: 'endgame', t: 'tour_learn_demo_t', b: 'tour_learn_demo_b', target: '#learn-demo-nav' },
  { key: 'learnPrac', screen: 'endgame', t: 'tour_learn_prac_t', b: 'tour_learn_prac_b', target: '#learn-practice-btn' },

  // ── Databases ─────────────────────────────────────────────────────────
  {
    key: 'baseTab', screen: 'endgame', t: 'tour_base_tab_t', b: 'tour_base_tab_b',
    target: '#tabbar button[data-screen="base"]', action: 'tap', waitFor: '#base-list-view',
    enter: resetBase,
  },
  { key: 'baseNew', screen: 'base', t: 'tour_base_new_t', b: 'tour_base_new_b', target: '#base-new', enter: resetBase },
  {
    key: 'baseOpen', screen: 'base', t: 'tour_base_open_t', b: 'tour_base_open_b',
    target: '#base-list .list-item', action: 'tap', waitFor: '#base-games-view',
    enter: resetBase,
  },
  { key: 'baseImp', screen: 'base', t: 'tour_base_imp_t', b: 'tour_base_imp_b', target: '#base-import' },
  { key: 'baseGames', screen: 'base', t: 'tour_base_games_t', b: 'tour_base_games_b', target: '#game-list' },

  // ── Openings ──────────────────────────────────────────────────────────
  {
    key: 'trainerTab', screen: 'base', t: 'tour_trainer_tab_t', b: 'tour_trainer_tab_b',
    target: '#tabbar button[data-screen="trainer"]', action: 'tap', waitFor: '#trainer-setup',
  },
  {
    key: 'trainerSet', screen: 'trainer', t: 'tour_trainer_set_t', b: 'tour_trainer_set_b',
    target: ['#trainer-base', '#trainer-color', '#trainer-level'], style: 'frame',
  },
  { key: 'trainerBook', screen: 'trainer', t: 'tour_trainer_book_t', b: 'tour_trainer_book_b', target: '#trainer-start' },

  // ── Puzzles ───────────────────────────────────────────────────────────
  {
    key: 'puzTab', screen: 'trainer', t: 'tour_puz_tab_t', b: 'tour_puz_tab_b',
    target: '#tabbar button[data-screen="puzzles"]', action: 'tap', waitFor: '#screen-puzzles',
  },
  { key: 'puzModes', screen: 'puzzles', t: 'tour_puz_modes_t', b: 'tour_puz_modes_b', target: '#screen-puzzles .puzzle-modes' },
  { key: 'puzTheme', screen: 'puzzles', t: 'tour_puz_theme_t', b: 'tour_puz_theme_b', target: '#puzzle-theme-btn' },
  { key: 'puzMore', screen: 'puzzles', t: 'tour_puz_more_t', b: 'tour_puz_more_b', target: '#puzzle-actions', style: 'frame' },

  // ── Play ──────────────────────────────────────────────────────────────
  {
    key: 'playTab', screen: 'puzzles', t: 'tour_play_tab_t', b: 'tour_play_tab_b',
    target: '#tabbar button[data-screen="play"]', action: 'tap', waitFor: '#play-setup',
  },
  {
    key: 'playSet', screen: 'play', t: 'tour_play_set_t', b: 'tour_play_set_b',
    // Colour and level only: adding the Start button stretched the frame over
    // most of the screen, leaving nowhere to put the card that did not cover it.
    target: ['#play-color', '#play-level'], style: 'frame',
  },
  { key: 'playAna', screen: 'play', t: 'tour_play_ana_t', b: 'tour_play_ana_b', target: null },

  // ── Profile ───────────────────────────────────────────────────────────
  {
    key: 'profTab', screen: 'play', t: 'tour_prof_tab_t', b: 'tour_prof_tab_b',
    target: '#tabbar button[data-screen="profile"]', action: 'tap', waitFor: '#screen-profile',
  },
  { key: 'profMiss', screen: 'profile', t: 'tour_prof_miss_t', b: 'tour_prof_miss_b', target: '#daily-missions-list', wrap: '.profile-card' },
  { key: 'profLb', screen: 'profile', t: 'tour_prof_lb_t', b: 'tour_prof_lb_b', target: '#profile-leaderboard-btn' },
  // The only step below the fold on a phone — the scroll hint earns its keep here.
  { key: 'profRadar', screen: 'profile', t: 'tour_prof_radar_t', b: 'tour_prof_radar_b', target: '#chart-overall', wrap: '.profile-card' },

  { key: 'settings', screen: 'profile', t: 'tour_settings_t', b: 'tour_settings_b', target: '#btn-settings' },
  { key: 'done', screen: 'profile', t: 'tour_done_t', b: 'tour_done_b', target: null },
];

// ── sub-view helpers ────────────────────────────────────────────────────
// Screens are one <section>, but Learn and Databases swap several inner views.
// Walking Back has to undo those too, and the cheapest way to do it without
// reaching into app.js internals is to press the app's own back buttons.
function clickIfVisible(id) {
  const el = $(id);
  if (el && isVisible(el)) el.click();
}
function resetLearn() {
  clickIfVisible('learn-back-lessons');
  clickIfVisible('learn-back-cat');
  clickIfVisible('endgame-back-pos');
  clickIfVisible('endgame-back-cat');
  clickIfVisible('endgame-back-sections');
}
function resetBase() {
  clickIfVisible('base-back');
}

function isVisible(el) {
  return !!(el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
}

function q(sel) {
  try { return document.querySelector(sel); } catch { return null; }
}

// A step's targets, as live elements. Missing or hidden ones drop out, so a
// layout change later degrades to "no ring" instead of a broken tour.
function targetsOf(step) {
  if (!step.target) return [];
  const list = Array.isArray(step.target) ? step.target : [step.target];
  return list
    .map(sel => {
      const el = q(sel);
      return el && step.wrap ? (el.closest(step.wrap) || el) : el;
    })
    .filter(isVisible);
}

function unionRect(els) {
  let l = Infinity, t0 = Infinity, r = -Infinity, b = -Infinity;
  for (const el of els) {
    const c = el.getBoundingClientRect();
    l = Math.min(l, c.left); t0 = Math.min(t0, c.top);
    r = Math.max(r, c.right); b = Math.max(b, c.bottom);
  }
  return { left: l, top: t0, width: r - l, height: b - t0, bottom: b };
}

const Tour = {
  ctx: null,
  idx: 0,
  running: false,
  root: null,
  raf: 0,
  lastBox: '',
  scrolledFor: -1,
  scrollAt: 0,
  scrollPhase: 0,
  advancing: false,
  internal: false,

  // The opt-in prompt, straight after the level picker. Answering "no" is a
  // real answer and is remembered — the tour never nags again on its own.
  async offer(ctx) {
    const yes = await ctx.modal((box, close) => {
      box.innerHTML = `
        <div class="kael-modal-head"><img src="icons/kael/kael-welcome.png" class="kael-portrait" alt="Kael"></div>
        <div class="kael-bubble"><b>${t('tour_prompt_title')}</b><p>${t('tour_prompt_body')}</p></div>`;
      const go = document.createElement('button');
      go.className = 'btn primary big'; go.textContent = t('tour_yes');
      go.onclick = () => close(true);
      const no = document.createElement('button');
      no.className = 'btn quiet'; no.style.width = '100%'; no.style.marginTop = '8px';
      no.textContent = t('tour_no');
      no.onclick = () => close(false);
      box.append(go, no);
    });
    if (yes) this.start(ctx);
    else await this.finish(ctx, 'skipped', false);
    return !!yes;
  },

  async finish(ctx, status, congratulate) {
    await ctx.db.kvSet('tourDone', status);
    ctx.showScreen('analysis');
    if (!congratulate) ctx.toast(t('tour_skipped_toast'), 3200);
  },

  start(ctx) {
    if (this.running) return;
    this.ctx = ctx;
    this.running = true;
    this.idx = 0;
    document.body.classList.add('tour-on');
    this.build();
    document.addEventListener('pointerdown', this.onCapture, true);
    document.addEventListener('click', this.onCapture, true);
    window.addEventListener('keydown', this.onKey, true);
    // The rAF loop keeps the ring glued to its target during animations; the
    // scroll and resize listeners cover the case where rAF is paused.
    document.addEventListener('scroll', this.onReflow, true);
    window.addEventListener('resize', this.onReflow);
    this.go(0);
    this.raf = requestAnimationFrame(this.frame);
  },

  stop(status) {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.raf);
    document.removeEventListener('pointerdown', this.onCapture, true);
    document.removeEventListener('click', this.onCapture, true);
    window.removeEventListener('keydown', this.onKey, true);
    document.removeEventListener('scroll', this.onReflow, true);
    window.removeEventListener('resize', this.onReflow);
    document.body.classList.remove('tour-on');
    this.ctx.closeMenu?.();
    this.root?.remove();
    this.root = null;
    this.finish(this.ctx, status, status === 'completed');
  },

  build() {
    const el = document.createElement('div');
    el.id = 'tour-root';
    el.innerHTML = `
      <div class="tour-ring" hidden></div>
      <div class="tour-dim" hidden></div>
      <div class="tour-scroll" hidden><span class="tour-arrow">⌄</span><span class="tour-scroll-text"></span></div>
      <div class="tour-card" role="dialog" aria-live="polite" aria-modal="true">
        <div class="tour-bar"><i></i></div>
        <div class="tour-head">
          <img src="icons/kael/kael-bust.png" class="tour-kael" alt="Kael">
          <div class="tour-head-text">
            <b class="tour-title"></b>
            <span class="tour-count"></span>
          </div>
        </div>
        <p class="tour-body"></p>
        <div class="tour-tap" hidden></div>
        <div class="tour-btns">
          <button class="btn tour-back"></button>
          <button class="btn primary tour-next"></button>
        </div>
        <button class="btn quiet tour-skipbtn"></button>
      </div>`;
    document.body.appendChild(el);
    this.root = el;
    el.querySelector('.tour-back').onclick = () => this.go(this.idx - 1);
    el.querySelector('.tour-next').onclick = () => this.next();
    el.querySelector('.tour-skipbtn').onclick = () => this.stop('skipped');
  },

  step() { return STEPS[this.idx]; },

  go(i) {
    if (i < 0 || i >= STEPS.length) return;
    this.idx = i;
    this.advancing = false;
    this.scrolledFor = -1;
    this.scrollPhase = 0;
    const step = this.step();
    if (step.screen && this.ctx.activeScreen() !== step.screen) this.ctx.showScreen(step.screen);
    // enter() presses the app's own back buttons to rewind a sub-view. Those
    // clicks have to bypass the blocker below, which would otherwise swallow
    // them for not being the highlighted target — that is what silently broke
    // Back out of a Learn lesson.
    this.internal = true;
    try { step.enter?.(); } finally { this.internal = false; }
    // The destination buttons now live in the slide-up menu, so a step that
    // rings one has to open it first; every other step closes it. openMenu here
    // never touches history (ctx passes push:false), so it can't disturb Back.
    this.ctx.closeMenu?.();
    if (typeof step.target === 'string' && step.target.includes('#tabbar')) this.ctx.openMenu?.();
    this.render();
  },

  next() {
    if (this.idx >= STEPS.length - 1) this.stop('completed');
    else this.go(this.idx + 1);
  },

  render() {
    const step = this.step();
    const r = this.root;
    const last = this.idx === STEPS.length - 1;
    const isTap = step.action === 'tap';

    r.querySelector('.tour-title').textContent = t(step.t);
    r.querySelector('.tour-body').textContent = t(step.b);
    r.querySelector('.tour-count').textContent =
      t('tour_step_of').replace('%n', this.idx + 1).replace('%m', STEPS.length);
    r.querySelector('.tour-bar i').style.width = `${((this.idx + 1) / STEPS.length) * 100}%`;

    const tap = r.querySelector('.tour-tap');
    tap.hidden = !isTap;
    tap.textContent = isTap ? `👆 ${t('tour_tap_here')}` : '';

    // On a tap step the target itself is the way forward, so there is no Next.
    const next = r.querySelector('.tour-next');
    next.hidden = isTap;
    next.textContent = last ? t('tour_finish') : t('tour_next');
    const back = r.querySelector('.tour-back');
    back.hidden = this.idx === 0;
    back.textContent = t('tour_back');
    r.querySelector('.tour-skipbtn').textContent = last ? '' : t('tour_skip');
    r.querySelector('.tour-skipbtn').hidden = last;

    r.querySelector('.tour-scroll-text').textContent = t('tour_scroll_hint');
    r.querySelector('.tour-card').classList.toggle('is-final', last);
    this.lastBox = '';
    this.position();
  },

  // Ring, card side and scroll hint, recomputed from live rects. Runs every
  // frame while the tour is open so it survives smooth scrolling, the board
  // resizing, and a screen sliding in.
  position() {
    const step = this.step();
    const ring = this.root.querySelector('.tour-ring');
    const dim = this.root.querySelector('.tour-dim');
    const card = this.root.querySelector('.tour-card');
    const hint = this.root.querySelector('.tour-scroll');
    const els = targetsOf(step);

    if (!els.length) {
      ring.hidden = true; dim.hidden = false; hint.hidden = true;
      card.classList.remove('at-top');
      card.classList.add('centred');
      return;
    }
    card.classList.remove('centred');
    dim.hidden = true;

    const pad = 8;
    const u = unionRect(els);
    const box = `${Math.round(u.left - pad)},${Math.round(u.top - pad)},${Math.round(u.width + pad * 2)},${Math.round(u.height + pad * 2)}`;
    if (box !== this.lastBox) {
      this.lastBox = box;
      const [x, y, w, h] = box.split(',');
      // Coming from no ring at all, place it without animating — otherwise it
      // flies in from the top-left corner on the first highlighted step.
      const fresh = ring.hidden;
      if (fresh) ring.style.transition = 'none';
      ring.style.left = `${x}px`; ring.style.top = `${y}px`;
      ring.style.width = `${w}px`; ring.style.height = `${h}px`;
      if (fresh) setTimeout(() => { ring.style.transition = ''; }, 0);
    }
    ring.hidden = false;
    ring.classList.toggle('frame', step.style === 'frame');

    // The card takes whichever half of the screen the highlight is not in, so
    // it can never cover the thing being explained. On a short landscape
    // screen there is no spare room above or below, so it docks to whichever
    // side is free instead.
    const side = window.innerHeight <= 520 && window.innerWidth > window.innerHeight;
    card.classList.toggle('side', side);
    if (side) {
      card.classList.toggle('at-left', u.left + u.width / 2 > window.innerWidth / 2);
      card.classList.remove('at-top');
    } else {
      card.classList.remove('at-left');
      card.classList.toggle('at-top', u.top + u.height / 2 > window.innerHeight / 2);
    }

    this.handleScroll(els[0], u, hint);
  },

  // Off-screen targets, in three escalating stages: a smooth auto-scroll, then
  // an instant one if the smooth scroll never moved (it is paused whenever the
  // page is not painting, and not every engine honours it), and only then the
  // big arrow. The user is never simply left staring at a dimmed screen.
  handleScroll(el, u, hint) {
    const topSafe = 56, botSafe = 72;
    const above = u.top < topSafe;
    const below = u.bottom > window.innerHeight - botSafe;

    if (!(above || below)) { hint.hidden = true; return; }

    if (this.step().autoScroll === false) { hint.hidden = false; hint.classList.toggle('up', above); return; }

    if (this.scrolledFor !== this.idx) {
      this.scrolledFor = this.idx;
      this.scrollPhase = 1;
      this.scrollAt = performance.now();
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    const waited = performance.now() - this.scrollAt;
    if (this.scrollPhase === 1) {
      if (waited < 900) return;              // let the smooth scroll land
      this.scrollPhase = 2;
      this.scrollAt = performance.now();
      el.scrollIntoView({ block: 'center' });
      return;
    }
    if (waited < 400) return;
    hint.hidden = false;
    hint.classList.toggle('up', above);
  },

  frame: () => {
    if (!Tour.running) return;
    Tour.position();
    Tour.raf = requestAnimationFrame(Tour.frame);
  },

  onReflow: () => { if (Tour.running) Tour.position(); },

  // Everything outside the highlight is inert. stopPropagation alone does the
  // blocking — calling preventDefault on pointerdown would also kill touch
  // scrolling, and the scroll step depends on scrolling still working.
  onCapture: (e) => {
    if (!Tour.running || Tour.internal) return;
    if (e.target.closest?.('#tour-root')) return;

    const step = Tour.step();
    if (step.action === 'tap') {
      const hit = targetsOf(step).some(el => el === e.target || el.contains(e.target));
      if (hit) {
        if (e.type === 'click') Tour.afterTap(step);
        return; // let the app handle it normally
      }
    }
    e.stopPropagation();
    if (e.type === 'click') {
      e.preventDefault();
      Tour.root?.querySelector('.tour-ring')?.classList.remove('nudge');
      void Tour.root?.querySelector('.tour-ring')?.offsetWidth;
      Tour.root?.querySelector('.tour-ring')?.classList.add('nudge');
    }
  },

  // The tap has been allowed through; wait for the app to actually arrive
  // where the step said it would before moving on.
  afterTap(step) {
    if (this.advancing) return;
    this.advancing = true;
    const at = this.idx;
    const started = performance.now();
    // On a timer, not requestAnimationFrame: rAF is paused whenever the page
    // is not being painted (backgrounded tab, app behind the launcher), and a
    // tour that silently stops advancing there would be impossible to explain.
    const check = () => {
      if (!this.running || this.idx !== at) return;
      const ready = !step.waitFor || isVisible(q(step.waitFor));
      if (ready) { this.advancing = false; this.next(); return; }
      if (performance.now() - started > 4000) { this.advancing = false; return; }
      setTimeout(check, 60);
    };
    setTimeout(check, 60);
  },

  onKey: (e) => {
    if (!Tour.running) return;
    if (e.key === 'Escape') { e.preventDefault(); Tour.stop('skipped'); }
  },
};

export default Tour;
