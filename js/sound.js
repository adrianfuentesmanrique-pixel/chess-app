// Sound effects. Extracted verbatim from js/app.js.
import * as db from './db.js';
import { SOUND_NAMES } from './move-feel.js';

// ═════════════════════ sound ═════════════════════

const VOLUME = 0.6;

export const Sound = {
  enabled: true,
  cache: {},
  // Web Audio: every file decoded once at start, so a knock begins with the
  // move. An <audio> element starts a beat late on a phone, which is exactly
  // what makes a board feel slow. It stays as the fallback below.
  ctx: null,
  buffers: {},

  async init() {
    this.enabled = await db.kvGet('soundEnabled', true);
    this.preload();
  },

  async setEnabled(v) {
    this.enabled = v;
    await db.kvSet('soundEnabled', v);
  },

  // Never awaited and never fatal: a file that does not arrive just leaves
  // that one sound to the fallback.
  preload() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || this.ctx) return;
    try { this.ctx = new AC(); } catch { return; }
    for (const name of SOUND_NAMES) {
      fetch(`sounds/${name}.wav`)
        .then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status)))
        .then(data => new Promise((res, rej) => this.ctx.decodeAudioData(data, res, rej)))
        .then(buf => { this.buffers[name] = buf; })
        .catch(() => {});
    }
  },

  play(name) {
    if (!this.enabled) return;
    const buf = this.buffers[name];
    if (buf && this.ctx) {
      // A context made before the first tap starts out suspended; the tap
      // that caused this sound is what lets it resume.
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      if (this.ctx.state === 'running') {
        const src = this.ctx.createBufferSource();
        const gain = this.ctx.createGain();
        gain.gain.value = VOLUME;
        src.buffer = buf;
        src.connect(gain).connect(this.ctx.destination);
        src.start();
        return;
      }
    }
    let audio = this.cache[name];
    if (!audio) { audio = new Audio(`sounds/${name}.wav`); this.cache[name] = audio; }
    const el = audio.paused ? audio : audio.cloneNode(true);
    el.volume = VOLUME;
    el.play().catch(() => {});
  },
};
