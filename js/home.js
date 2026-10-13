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

// The openings the "Descubre" card can show: [full name, moves]. Home never
// loads the opening library (323 KB), so these are written out here and the
// position is worked out with the chess rules. Each one is a real line of
// js/opening-library.js under that exact name (tests/unit/home.test.js checks
// it), because "Jugarla" finds the line there by name and moves. English only,
// like the library.
export const HOME_OPENINGS = [
  ['Italian Game', 'e4 e5 Nf3 Nc6 Bc4'],
  ['Italian Game: Giuoco Piano', 'e4 e5 Nf3 Nc6 Bc4 Bc5'],
  ['Italian Game: Two Knights Defense', 'e4 e5 Nf3 Nc6 Bc4 Nf6'],
  ['Italian Game: Evans Gambit', 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4'],
  ['Ruy Lopez', 'e4 e5 Nf3 Nc6 Bb5'],
  ['Ruy Lopez: Berlin Defense', 'e4 e5 Nf3 Nc6 Bb5 Nf6'],
  ['Scotch Game', 'e4 e5 Nf3 Nc6 d4'],
  ['Four Knights Game', 'e4 e5 Nf3 Nc6 Nc3 Nf6'],
  ['Vienna Game', 'e4 e5 Nc3'],
  ["King's Gambit", 'e4 e5 f4'],
  ["Petrov's Defense", 'e4 e5 Nf3 Nf6'],
  ['Philidor Defense', 'e4 e5 Nf3 d6'],
  ['Sicilian Defense', 'e4 c5'],
  ['Sicilian Defense: Najdorf Variation', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6'],
  ['Sicilian Defense: Dragon Variation', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6'],
  ['French Defense', 'e4 e6 d4 d5'],
  ['French Defense: Winawer Variation', 'e4 e6 d4 d5 Nc3 Bb4'],
  ['Caro-Kann Defense', 'e4 c6 d4 d5'],
  ['Scandinavian Defense', 'e4 d5'],
  ['Pirc Defense', 'e4 d6 d4 Nf6 Nc3 g6'],
  ["Queen's Gambit", 'd4 d5 c4'],
  ["Queen's Gambit Declined", 'd4 d5 c4 e6'],
  ["Queen's Gambit Accepted", 'd4 d5 c4 dxc4'],
  ['Slav Defense', 'd4 d5 c4 c6'],
  ["King's Indian Defense", 'd4 Nf6 c4 g6 Nc3'],
  ['Nimzo-Indian Defense', 'd4 Nf6 c4 e6 Nc3 Bb4'],
  ["Queen's Indian Defense", 'd4 Nf6 c4 e6 Nf3 b6'],
  ['Grünfeld Defense', 'd4 Nf6 c4 g6 Nc3 d5'],
  ['Dutch Defense', 'd4 f5'],
  ['London System', 'd4 Nf6 Nf3 g6 Bf4'],
  ['Catalan Opening', 'd4 Nf6 c4 e6 g3 d5'],
  ['Réti Opening', 'Nf3 d5 c4'],
];

// What the "Descubre" card shows, from one random number `r` in [0, 1): the
// lower half is an endgame, the upper half an opening, and within its half
// every one is as likely as the next. Returns { kind, index }: an index into
// ENDGAMES, or into HOME_OPENINGS. With none of one kind, always the other.
export function discoverPick(r, endgames, openings = HOME_OPENINGS.length) {
  const x = Math.min(Math.max(+r || 0, 0), 1 - 1e-9) * 2;
  const endgame = openings <= 0 || (endgames > 0 && x < 1);
  const n = endgame ? endgames : openings;
  return { kind: endgame ? 'endgame' : 'opening', index: Math.min(n - 1, Math.floor((x % 1) * n)) };
}

// When a homework was given, in ms: a number, or a server time kept on the
// phone as { seconds }. 0 when it carries none.
function givenAt(h) {
  const v = h && h.createdAt;
  return typeof v === 'number' ? v : (v && typeof v.seconds === 'number') ? v.seconds * 1000 : 0;
}

// The block between the "Hoy" card and "Descubre", from plain values:
//   homework    the homework given to me (Students.homework; [] signed out)
//   seen        ids of the open ones I have already seen (Students.hwSeen)
//   book        the book last opened, or null
//   game        the last game against the engine, or null
//   bestStreak  the longest streak ever: 0 = never finished a day of practice
// Returns { kind, rows }:
//   'continue'  one to three rows, always in this order: homework, book, game.
//               The homework row is { type, item, isNew, count }: the newest
//               one not seen yet, else the newest open one; `count` is how
//               many are open.
//   'start'     nothing to continue and never practised: lesson, play, tour.
//   'none'      practised, nothing half-way: no block and no heading.
export function homeBlock({ homework = [], seen = [], book = null, game = null, bestStreak = 0 } = {}) {
  const rows = [];
  const open = (Array.isArray(homework) ? homework : []).filter(h => h && h.status === 'open');
  if (open.length) {
    const known = new Set(seen || []);
    const newest = list => list.reduce((a, b) => (givenAt(b) > givenAt(a) ? b : a));
    const fresh = open.filter(h => !known.has(h.id));
    rows.push({ type: 'homework', item: newest(fresh.length ? fresh : open), isNew: fresh.length > 0, count: open.length });
  }
  if (book) rows.push({ type: 'book', item: book });
  if (game) rows.push({ type: 'game', item: game });
  if (rows.length) return { kind: 'continue', rows };
  if (!(bestStreak > 0)) return { kind: 'start', rows: [{ type: 'lesson' }, { type: 'play' }, { type: 'tour' }] };
  return { kind: 'none', rows: [] };
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
