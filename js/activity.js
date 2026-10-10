// Active-time tracking — stage 3 of docs/plans/2026-09-29-students.md (3.3).
//
// A second counts only when the app is on screen (visibilityState 'visible'),
// was touched (pointer or key) in the last 2 minutes, AND the current screen
// belongs to a practice area. Profile, friends, leaderboards, settings and
// Students count nothing.
//
// Stored locally as kv 'activeTime' = { 'YYYY-MM-DD': { area: seconds } }
// (the device's own date), written to IndexedDB at most once a minute and when
// the app is hidden, pruned to 60 days. Deliberately NOT in SYNCED_KEYS: a
// synced key writes the users/ doc on every change. It leaves the device only
// inside the student summary (last 30 days), and only when there is a teacher.
//
// No imports from js/app.js: app.js hands in a getter for the current screen.
import * as db from './db.js';
import { Auth } from './firebase.js';

export const ACTIVITY_KEY = 'activeTime';
export const IDLE_MS = 120 * 1000;
const FLUSH_MS = 60 * 1000;
const KEEP_DAYS = 60;

// Screen → area. Anything not listed counts nothing.
const AREA = {
  puzzles: 'puzzles', rush: 'puzzles', blind: 'puzzles', calc: 'puzzles',
  endgame: 'endgames',
  trainer: 'openings',
  masterclass: 'masterclass',
  analysis: 'analysis', base: 'analysis',
  play: 'play',
  read: 'reading',
};
// Display order (and the i18n keys act_<area>).
export const AREAS = ['puzzles', 'endgames', 'openings', 'masterclass', 'analysis', 'play', 'reading'];

// Local calendar date, same shape as recordEloHistory's todayStr() in app.js.
export function dayStr(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dayStr(d);
}

// Seconds per day (all areas) and per area, from an activeTime map. `days`
// includes today: 7 = today and the six days before.
export function sumActive(map, days) {
  const cut = daysAgo(days - 1);
  let total = 0;
  const byArea = {};
  for (const [date, areas] of Object.entries(map || {})) {
    if (date < cut || !areas || typeof areas !== 'object') continue;
    for (const [a, s] of Object.entries(areas)) {
      if (typeof s !== 'number' || !(s > 0)) continue;
      total += s;
      byArea[a] = (byArea[a] || 0) + s;
    }
  }
  return { total, byArea };
}

export const Activity = {
  data: {},          // the kv map, in memory; seconds are added here
  loaded: false,
  dirty: false,
  lastFlush: 0,
  lastInput: 0,
  screen: () => null,
  uid: undefined,

  async init(getScreen) {
    this.screen = getScreen;
    for (const ev of ['pointerdown', 'keydown']) {
      window.addEventListener(ev, () => { this.lastInput = Date.now(); }, { passive: true, capture: true });
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush(true);
    });
    window.addEventListener('pagehide', () => this.flush(true));
    // Sign-out wipes the whole kv store (clearSyncedProfileData). Drop the copy
    // in memory too, or the next flush would write the old account's minutes
    // back under the new one.
    Auth.onChange(async () => {
      const uid = Auth.user ? Auth.user.uid : null;
      const prev = this.uid;
      this.uid = uid;
      if (prev === undefined || prev === uid || prev === null) return;
      this.data = (await db.kvGet(ACTIVITY_KEY, null)) || {};
      this.dirty = false;
    });
    const saved = await db.kvGet(ACTIVITY_KEY, null);
    // Seconds counted before the read finished are kept on top of what was saved.
    this.data = this.merge(saved || {}, this.data);
    this.loaded = true;
    setInterval(() => this.tick(), 1000);
  },

  merge(base, extra) {
    for (const [d, areas] of Object.entries(extra)) {
      base[d] = base[d] || {};
      for (const [a, s] of Object.entries(areas)) base[d][a] = (base[d][a] || 0) + s;
    }
    return base;
  },

  // The area being practised right now, or null when this second does not count.
  current() {
    if (document.visibilityState !== 'visible') return null;
    if (Date.now() - this.lastInput > IDLE_MS) return null;
    return AREA[this.screen()] || null;
  },

  tick() {
    const area = this.current();
    if (!area) return;
    const day = dayStr();
    const row = this.data[day] || (this.data[day] = {});
    row[area] = (row[area] || 0) + 1;
    this.dirty = true;
    if (Date.now() - this.lastFlush >= FLUSH_MS) this.flush();
  },

  // Writes to IndexedDB. At most once a minute, except when the app is being
  // hidden (force) — the last minute would otherwise be lost to a swipe-away.
  async flush(force = false) {
    if (!this.loaded || !this.dirty) return;
    if (!force && Date.now() - this.lastFlush < FLUSH_MS) return;
    this.lastFlush = Date.now();
    this.dirty = false;
    const cut = daysAgo(KEEP_DAYS - 1);
    for (const d of Object.keys(this.data)) if (d < cut) delete this.data[d];
    try {
      await db.kvSet(ACTIVITY_KEY, JSON.parse(JSON.stringify(this.data)));
    } catch (e) {
      console.error('Saving active time failed', e);
      this.dirty = true;
    }
  },
};
