// Sound effects. Extracted verbatim from js/app.js.
import * as db from './db.js';

// ═════════════════════ sound ═════════════════════

export const Sound = {
  enabled: true,
  cache: {},

  async init() {
    this.enabled = await db.kvGet('soundEnabled', true);
  },

  async setEnabled(v) {
    this.enabled = v;
    await db.kvSet('soundEnabled', v);
  },

  play(name) {
    if (!this.enabled) return;
    let audio = this.cache[name];
    if (!audio) { audio = new Audio(`sounds/${name}.wav`); this.cache[name] = audio; }
    const el = audio.paused ? audio : audio.cloneNode(true);
    el.volume = 0.6;
    el.play().catch(() => {});
  },
};
