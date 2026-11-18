// The Wall of Flames' sorting rules, kept free of the DOM so the unit tests can
// run them. js/wall.js draws what these return.
// Local calendar date, the shape streakLastDate is saved in (todayStr in app.js).
// Not imported from activity.js: that pulls in Firebase, and the tests run in Node.
function dayStr(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// A streak is still alive while its last day is today or yesterday. The day is
// the PLAYER's local date, so ours is taken 36 hours back: a player a few time
// zones behind, still on "yesterday", is not dropped by our midnight. Equal-
// length 'YYYY-MM-DD' strings compare in date order.
export function streakAlive(lastDate, now = new Date()) {
  if (typeof lastDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(lastDate)) return false;
  return lastDate >= dayStr(new Date(now.getTime() - 36 * 3600 * 1000));
}

// Whether a streak profile icon ({ streakDays } in AVATAR_OPTIONS) is earned
// with this best streak. Icons without streakDays are not decided here.
// Mission icons ({ missionDays }) go by the best run of full mission days.
export function streakAvatarOpen(opt, bestStreak, bestMissionStreak = 0) {
  if (opt.streakDays && (+bestStreak || 0) < opt.streakDays) return false;
  if (opt.missionDays && (+bestMissionStreak || 0) < opt.missionDays) return false;
  return true;
}

// The icons a best run moving from `before` to `after` has just won.
// field: 'streakDays' (the flame streak) or 'missionDays' (the daily missions).
export function streakRewardsCrossed(options, before, after, field = 'streakDays') {
  const b = +before || 0, a = +after || 0;
  return options.filter(o => o[field] && b < o[field] && a >= o[field]);
}

// The streak and mission icons this player holds but has never had the card
// for. celebrated: the ids already congratulated (kv avatarsCelebrated).
export function rewardsOwed(options, bestStreak, bestMissionStreak, celebrated) {
  const done = new Set(Array.isArray(celebrated) ? celebrated : []);
  return options.filter(o => (o.streakDays || o.missionDays) && !done.has(o.id)
    && streakAvatarOpen(o, bestStreak, bestMissionStreak));
}

// mode 'now': live streaks only, on streakCount. 'record': bestStreak.
// Rows without a number above 0 are left out; ties keep the query's order.
export function wallRows(entries, mode, now = new Date()) {
  const field = mode === 'record' ? 'bestStreak' : 'streakCount';
  return entries
    .filter(e => (+e[field] || 0) > 0 && (mode === 'record' || streakAlive(e.streakLastDate, now)))
    .map(e => ({ ...e, days: Math.floor(+e[field]) }))
    .sort((a, b) => b.days - a.days);
}
