// Home ("Inicio"), the screen the app opens on: the parts that are pure, so
// they can be unit-tested (tests/unit/home.test.js). No DOM, no storage, no
// translations: the screen itself is drawn by `Home` in js/app.js, which turns
// what these return into text.

export const MISSION_KEYS = ['puzzle', 'play', 'opening'];

// How many of today's three missions are done.
export function missionsDone(done) {
  return MISSION_KEYS.filter(k => !!(done && done[k])).length;
}

// Which sentence Kael says: the first rule that fits.
//   welcome  never used the app: no streak now or ever, no mission ever
//   alldone  all three missions done today
//   pending  a live streak that today has not been added to yet
//   counted  a streak that already counts today
//   start    anything else: start a streak today
// The streak and the missions are counted separately, so no rule speaks of
// both: 'alldone' is about the missions only, the two streak rules about the
// streak only.
export function kaelRule({ streak = 0, pending = false, bestStreak = 0, done = 0, everMission = false } = {}) {
  if (streak <= 0 && bestStreak <= 0 && done <= 0 && !everMission) return 'welcome';
  if (done >= MISSION_KEYS.length) return 'alldone';
  if (streak > 0 && pending) return 'pending';
  if (streak > 0) return 'counted';
  return 'start';
}

// The greeting's time of day, from the phone's own hour (0..23).
export function dayPart(hour) {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 19) return 'afternoon';
  return 'evening';
}

// The name Kael greets by: the app's own profile name, else the first word of
// the account's display name. Never an e-mail address. '' = no greeting.
export function greetName(profileName, displayName) {
  const own = String(profileName || '').trim();
  if (own) return own;
  const first = String(displayName || '').trim().split(/\s+/)[0] || '';
  return first.includes('@') ? '' : first;
}

// Everything the line needs: the rule, the streak's number, and the greeting
// (null when there is no name to greet: signed out).
export function kaelLine({ streak = 0, pending = false, bestStreak = 0, done = 0, everMission = false, name = '', hour = 12 } = {}) {
  return {
    rule: kaelRule({ streak, pending, bestStreak, done, everMission }),
    n: streak,
    greet: name ? { part: dayPart(hour), name } : null,
  };
}
