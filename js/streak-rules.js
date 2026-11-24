// The streak's day rules, kept free of the DOM and of Firebase so the unit
// tests can run them. Used by js/app.js (Streak, DailyMissions) and
// js/firebase.js (the account pull).

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 'YYYY-MM-DD' -> a whole day number. Read as UTC on purpose: a local midnight
// to the next is 23 or 25 hours on a clock-change day, and the old rule
// ("exactly 24 hours apart") broke every streak that crossed one (Spain on
// 26 Oct, the US on 2 Nov, Chile on 7 Sep). Calendar days never do that.
function dayNum(s) {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

export function isYesterday(dateStr, todayStr) {
  if (!DATE_RE.test(dateStr || '') || !DATE_RE.test(todayStr || '')) return false;
  return dayNum(todayStr) - dayNum(dateStr) === 1;
}

// The day before a 'YYYY-MM-DD' date, in the same shape.
export function dayBefore(s) {
  const d = new Date((dayNum(s) - 1) * 86400000);
  const p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

// ── Streak restores (Adrian, 2026-11-21) ──
// Every player gets 2 a calendar month for the flame streak and 2 more for the
// daily missions run. A restore saves a run that missed exactly ONE day: the
// run keeps its number and counts as kept yesterday, so playing today carries
// it on. The missed day itself is not added. The offer lasts until the player
// credits a new day (the run restarts at 1 and the old one is gone).
// kinds: 'flame' and 'missions'. rec: kv streakRestores = { month, flame, missions } (used).
export const RESTORES_PER_MONTH = 2;

export function restoresLeft(rec, kind, today) {
  const used = rec && rec.month === today.slice(0, 7) ? Math.max(0, Math.floor(+rec[kind] || 0)) : 0;
  return Math.max(0, RESTORES_PER_MONTH - used);
}

export function useRestore(rec, kind, today) {
  const month = today.slice(0, 7);
  const base = rec && rec.month === month ? rec : { month, flame: 0, missions: 0 };
  return { ...base, month, [kind]: (Math.floor(+base[kind] || 0)) + 1 };
}

// lost: { count, lastDate } saved when the run broke. current: the run's own
// last day now (streakLastDate / dailyMissionLastCompleteDate). Restorable
// while the missed day was yesterday and nothing has been credited since.
export function canRestore(lost, current, today) {
  if (!lost || !(Math.floor(+lost.count || 0) > 0) || !DATE_RE.test(lost.lastDate || '') || !DATE_RE.test(today || '')) return false;
  return dayNum(today) - dayNum(lost.lastDate) === 2 && current === lost.lastDate;
}

// On sign-in the account's streak used to replace the phone's outright. A
// phone whose last day never reached the account (no signal, or the app
// closed before the write left) then got an older date back, Streak.init read
// it as a missed day, wrote a 0, and the 0 went up to the account: the streak
// was gone although every day was played. Now the newer of the two wins
// (the later day; the same day, the higher count) and the record keeps the
// highest number either side has seen.
// local/remote: { count, lastDate, best }. Returns the same shape plus `push`:
// true when the account's copy is behind and must be written.
export function mergeStreak(local, remote) {
  const ok = s => s && DATE_RE.test(s.lastDate || '');
  const num = v => Math.max(0, Math.floor(+v || 0));
  let pick;
  if (!ok(remote)) pick = local;
  else if (!ok(local)) pick = remote;
  else if (local.lastDate !== remote.lastDate) pick = local.lastDate > remote.lastDate ? local : remote;
  else pick = num(local.count) >= num(remote.count) ? local : remote;
  let count = num(pick?.count);
  const lastDate = ok(pick) ? pick.lastDate : null;
  // The newer side's day comes right after the other's: one streak, carried
  // on. A phone that credited today before the account's copy arrived started
  // from 1; the account's run plus today is the real number.
  const other = pick === local ? remote : local;
  if (lastDate && ok(other) && isYesterday(other.lastDate, lastDate)) count = Math.max(count, num(other.count) + 1);
  const best = Math.max(num(local?.best), num(remote?.best), count);
  const push = lastDate !== (remote?.lastDate ?? null) || count !== num(remote?.count) || best !== num(remote?.best);
  return { count, lastDate, best, push };
}
