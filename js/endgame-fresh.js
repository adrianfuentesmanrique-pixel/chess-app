// Endings (Learn tab): how long ago an endgame was last solved, and the colour
// that goes with it. The rule is Adrian's (2026-10-13):
//   green  = solved today or 1 to 60 days ago
//   orange = 61 to 90 days ago
//   red    = 91 days ago or more, until it is solved again
//   never  = never solved (grey)
//
// Days are the player's own calendar days ('YYYY-MM-DD', as todayStr() in
// app.js writes them), never UTC. Imports nothing, so it runs under plain Node.

export const FRESH_GREEN_DAYS = 60;
export const FRESH_ORANGE_DAYS = 90;

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
// Noon-free: both days are read as UTC midnights, so a daylight-saving change
// between them can never make a day 23 or 25 hours long.
const dayNumber = day => {
  const m = typeof day === 'string' && DAY_RE.exec(day);
  if (!m) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(ms) ? null : Math.round(ms / 86400000);
};

// Whole calendar days from `day` to `today`; null when `day` is not a date.
// A day in the future (another phone's clock, or a flight west) counts as
// today: it WAS solved, so it must not read as "never" or go negative.
export function daysSince(day, today) {
  const a = dayNumber(day), b = dayNumber(today);
  if (a === null || b === null) return null;
  return Math.max(0, b - a);
}

// { state: 'never' | 'green' | 'orange' | 'red', days: null | number }
export function freshState(day, today) {
  const days = daysSince(day, today);
  if (days === null) return { state: 'never', days: null };
  const state = days <= FRESH_GREEN_DAYS ? 'green' : days <= FRESH_ORANGE_DAYS ? 'orange' : 'red';
  return { state, days };
}

const isDay = v => dayNumber(v) !== null;
const asMap = m => (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};

// Two phones' maps of { endgameId: 'YYYY-MM-DD' } become one: the newer day
// wins for each endgame, and neither phone's work is lost. Anything that is
// not a day is dropped.
export function mergeSolved(a, b) {
  const out = {};
  for (const src of [asMap(a), asMap(b)]) {
    for (const [id, day] of Object.entries(src)) {
      if (isDay(day) && (!out[id] || day > out[id])) out[id] = day;
    }
  }
  return out;
}

// The entries of `mine` that `theirs` lacks or has older: what is worth
// sending, so a phone with an old copy never writes an old day over a new one.
export function solvedNewer(mine, theirs) {
  const out = {}, base = asMap(theirs);
  for (const [id, day] of Object.entries(asMap(mine))) {
    if (isDay(day) && !(isDay(base[id]) && base[id] >= day)) out[id] = day;
  }
  return out;
}
