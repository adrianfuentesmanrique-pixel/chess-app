// The Profile activity history: the rules, with no DOM, no storage and no
// i18n, so they run under node --test. js/activity-log.js stores and draws.
//
// Three sources, merged by calendar day:
// - kv 'activityLog' = { 'YYYY-MM-DD': { area: { n, ok, miss, draw, best } } }
//   — what was played, counted from v259 on (this device only).
// - the dated ELO histories (recordEloHistory in js/app.js: one point a day,
//   synced, up to 400 days) — the ELO line, from before v259 too.
// - the saved games against the engine (IndexedDB 'playHistory').
import { dayNum } from './streak-rules.js';

export const KEEP_DAYS = 60;
// The order rows take inside one day.
export const AREAS = ['puzzle', 'survival', 'rush', 'blind', 'calc', 'endgame', 'opening', 'games'];
export const ELO_KEYS = {
  puzzle: 'puzzleEloHistory', blind: 'blindfoldEloHistory', calc: 'calcEloHistory',
  endgame: 'endgameEloHistory', opening: 'openingEloHistory',
};

// One more attempt (or run) in `area` on `day`. `r` is { ok, miss, draw, best }.
// Returns a new log; the one passed in is not changed.
export function addTo(log, day, area, r = {}) {
  const out = { ...(log || {}) };
  const d = out[day] = { ...(out[day] || {}) };
  const e = d[area] = { n: 0, ok: 0, miss: 0, draw: 0, ...(d[area] || {}) };
  e.n++;
  e.ok += r.ok ? 1 : 0;
  e.miss += r.miss ? 1 : 0;
  e.draw += r.draw ? 1 : 0;
  if (r.best != null) e.best = Math.max(e.best ?? 0, r.best);
  return out;
}

// Keeps the last `keep` calendar days, today included.
export function prune(log, today, keep = KEEP_DAYS) {
  const t = dayNum(today), out = {};
  for (const [day, v] of Object.entries(log || {})) if (t - dayNum(day) < keep) out[day] = v;
  return out;
}

// Games, grouped by the day they were played. `dayOf(ms)` gives a game's
// local 'YYYY-MM-DD'.
export function gamesByDay(games, dayOf) {
  const out = {};
  for (const g of games || []) {
    if (!g || !g.playedAt) continue;
    const day = dayOf(g.playedAt);
    const e = out[day] || (out[day] = { n: 0, ok: 0, miss: 0, draw: 0 });
    e.n++;
    if (g.outcome === 'win') e.ok++;
    else if (g.outcome === 'loss') e.miss++;
    else if (g.outcome === 'draw') e.draw++;
  }
  return out;
}

// The feed: [{ day, rows: [{ area, n, ok, miss, draw, best, elo, delta }] }],
// newest day first, only days inside the last `keep` with something on them.
// `hist` is { area: [{ date, value }] } — the ELO histories. A day's ELO is
// where it ended; its movement is against the point before it (none for the
// very first point, which has nothing to move from).
// The day an area's rating stood highest — the first day it reached its peak —
// or null while it has never climbed above where it started.
export function recordDay(list) {
  if (!Array.isArray(list) || list.length < 2) return null;
  let best = list[0];
  for (const p of list) if (p && p.value > best.value) best = p;
  return best === list[0] ? null : best.date;
}

// `joined` ({ day, kind: 'account' | 'start' }) is where the history begins: it
// is the last row of all, whatever its age — kept out of the 60-day window,
// since a history with no beginning reads as if it were cut off.
export function buildFeed({ log = {}, hist = {}, games = {}, today, keep = KEEP_DAYS, joined = null }) {
  const t = dayNum(today);
  const inside = day => { const d = t - dayNum(day); return d >= 0 && d < keep; };
  const days = new Map();
  const row = (day, area) => {
    if (!days.has(day)) days.set(day, {});
    const d = days.get(day);
    return d[area] || (d[area] = { area, n: null, ok: 0, miss: 0, draw: 0, best: null, elo: null, delta: null });
  };
  for (const [day, areas] of Object.entries(log)) {
    if (!inside(day)) continue;
    for (const [area, e] of Object.entries(areas)) {
      if (!AREAS.includes(area)) continue;
      Object.assign(row(day, area), { n: e.n, ok: e.ok || 0, miss: e.miss || 0, draw: e.draw || 0, best: e.best ?? null });
    }
  }
  for (const [day, e] of Object.entries(games)) {
    if (inside(day)) Object.assign(row(day, 'games'), { n: e.n, ok: e.ok, miss: e.miss, draw: e.draw });
  }
  for (const [area, list] of Object.entries(hist)) {
    const peak = recordDay(list);
    (list || []).forEach((p, i) => {
      if (!p || !inside(p.date)) return;
      const r = row(p.date, area);
      r.elo = p.value;
      r.delta = i > 0 ? p.value - list[i - 1].value : null;
      r.record = p.date === peak;
    });
  }
  const join = joined && joined.day && dayNum(joined.day) <= t ? joined : null;
  if (join && !days.has(join.day)) days.set(join.day, {});
  return [...days.keys()].sort((a, b) => dayNum(b) - dayNum(a)).map(day => ({
    day,
    rows: [
      ...AREAS.filter(a => days.get(day)[a]).map(a => days.get(day)[a]),
      // The first thing that ever happened, so the last row of its day.
      ...(join && join.day === day ? [{ area: 'joined', kind: join.kind }] : []),
    ],
  }));
}
