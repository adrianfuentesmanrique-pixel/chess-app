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
