// Board theme, piece set, and light/dark colour mode.
// Extracted verbatim from js/app.js.
//
// This module imports from js/app.js, which imports it back. The cycle is safe
// because every app.js binding used here (Setup, Profile, activeScreen) is only
// read inside a method — never at module top level. See "The module boundary"
// in docs/superpowers/plans/2026-08-07-stockfish-game-history.md.
import * as db from './db.js';
import { setPieceSet } from './board.js';
import { Setup, Profile, activeScreen } from './app.js';

export const Themes = {
  async init() {
    const boardTheme = await db.kvGet('boardTheme', 'wood');
    document.body.classList.add('theme-' + boardTheme);
    const pieceSet = await db.kvGet('pieceSet', 'pieces');
    setPieceSet(pieceSet);
  },
  setBoardTheme(v) {
    document.body.classList.remove('theme-wood', 'theme-green', 'theme-blue');
    document.body.classList.add('theme-' + v);
    db.kvSet('boardTheme', v);
  },
  setPieceSetChoice(v) {
    setPieceSet(v);
    db.kvSet('pieceSet', v);
    Setup.buildPalette();
  },
};

export const ColorMode = {
  mode: 'dark',        // user preference: 'light' | 'dark' | 'system'
  mql: null,

  async init() {
    this.mode = await db.kvGet('colorMode', 'system');
    this.mql = window.matchMedia('(prefers-color-scheme: light)');
    this.mql.addEventListener('change', () => { if (this.mode === 'system') this.apply(); });
    this.apply();
  },

  set(mode) {
    this.mode = mode;
    db.kvSet('colorMode', mode);
    this.apply();
  },

  effective() {
    if (this.mode === 'system') return this.mql.matches ? 'light' : 'dark';
    return this.mode;
  },

  apply() {
    const eff = this.effective();
    document.body.classList.remove('mode-light', 'mode-dark');
    document.body.classList.add('mode-' + eff);
    // Both theme-color metas (the light-media one and the dark-media one) get
    // the effective colour: the mode can be forced independently of the OS, so
    // once JS is running it is the authority, not the media query. These must
    // stay equal to --bg in css/style.css — Android paints the status bar with
    // this, and Bubblewrap bakes the manifest's colours into the TWA splash.
    const eff_bg = eff === 'light' ? '#f6f7fb' : '#0e131a';
    document.querySelectorAll('meta[name="theme-color"]')
      .forEach(m => m.setAttribute('content', eff_bg));
    if (activeScreen === 'profile') Profile.refresh();
  },
};
