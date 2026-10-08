// The decisions of the hourly streak-reminder job, with no I/O and no
// dependencies, so every rule here is unit-tested (tests/unit/reminder-*.test.js).
// Spec: docs/superpowers/specs/2026-10-08-daily-streak-reminder-design.md

// The job sends an HTTP request to whatever endpoint a user stored. Only real
// push services may be called. The same list is in firestore.rules; this copy
// is the one that counts.
export const ENDPOINT_OK = /^https:\/\/(fcm\.googleapis\.com|[a-z0-9.-]+\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)\//;

// How many subscriptions the job reads per user. The rules cannot cap how many
// an account stores, so this number is the real control. Do not remove it.
export const MAX_SUBS = 5;

// A stored subscription the job may send to: an allowed endpoint and two
// non-empty keys. The rules accept empty key strings, so the job must not.
export function usableSub(d) {
  return !!d && typeof d.endpoint === 'string' && ENDPOINT_OK.test(d.endpoint)
    && typeof d.p256dh === 'string' && d.p256dh.length > 0
    && typeof d.auth === 'string' && d.auth.length > 0;
}

// The calendar date, hour and minute it is for a user right now, in THEIR
// zone. Null when the zone cannot be read.
export function localParts(now, timeZone) {
  if (!timeZone || typeof timeZone !== 'string') return null;
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now);
  } catch (_) { return null; }
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) };
}

function dayBefore(date) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Due = the streak is alive and today is not credited: the last credited day
// is YESTERDAY in the user's zone. streakCount alone is not trusted — the app
// only zeroes a dead streak when it is opened.
//
// The time window: the chosen local time falls in the UTC hour running now, or
// in one of the two before it, on the same local day. For a whole-hour zone
// that is "the chosen hour, or up to two hours after it, never before". For a
// half-hour zone it also lets the reminder go out up to 30 minutes early,
// because the app stores the UTC hour rounded down (js/remind-time.js) and
// that hour's run is the only one that asks about the user. The upper edge
// lets a late run still deliver; "same local day" stops a very late one from
// buzzing after midnight.
export function isDue(user, now) {
  if (!user || !(user.streakCount > 0) || typeof user.streakLastDate !== 'string') return false;
  if (!Number.isInteger(user.remindHourLocal)) return false;
  const local = localParts(now, user.timeZone);
  if (!local) return false;
  const sinceChosen = (local.hour - user.remindHourLocal) * 60 + local.minute;   // minutes; negative = not yet
  const intoUtcHour = now.getUTCMinutes();
  if (sinceChosen <= intoUtcHour - 60 || sinceChosen > intoUtcHour + 120) return false;
  return user.streakLastDate === dayBefore(local.date);
}

export const hourIso = d => d.toISOString().slice(0, 13);

// Which UTC hours this run handles: every hour after the remembered one, up to
// now, at most the last three. A run that finds its own hour already remembered
// handles nothing — that is the whole "never twice" rule.
export function hoursToHandle(lastIso, now) {
  const end = new Date(hourIso(now) + ':00:00Z').getTime();
  const last = /^\d{4}-\d{2}-\d{2}T\d{2}$/.test(lastIso || '') ? new Date(lastIso + ':00:00Z').getTime() : null;
  if (last === null || Number.isNaN(last)) return [hourIso(new Date(end))];
  const out = [];
  for (let t = Math.max(last + 3600000, end - 2 * 3600000); t <= end; t += 3600000) out.push(hourIso(new Date(t)));
  return out;
}
