// Seed body for tools/cdp-verify-students6.mjs — an async-function body.
// EVERYTHING signed-in here is SEEDED: Firestore is unreachable from
// localhost (App Check), so there is no Firebase user and no write happens.
// Order matters: Students.load() first, THEN Object.assign — load() wipes a
// seed made before it. Stage 6 adds, on the teacher's side: a finished
// homework WITH per-puzzle results (14 attempts built from real library
// puzzles), an in-progress list with two, an OLD finished homework with no
// results at all, a finished text task, and two lines in the "Finished
// homework" strip. On the student's side: a 3-puzzle homework over the whole
// rating band of puzzles-3.json and a 3-puzzle list, both untouched, for the
// verify script to PLAY.
const app = await import('/js/app.js');
const { Students } = await import('/js/students.js');
const { packPuzzle, packResult } = await import('/js/firebase.js');
// Seeded from the Bases screen, so the gold dot can be read BEFORE the
// Students screen is seen.
app.showScreen('base');
await Students.load();
const now = Date.now();
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const T = 't_uid', S = 's_uid', ME = 'me_uid';
const lib = await (await fetch('/puzzles/puzzles-3.json')).json();
const three = lib.slice(0, 3);
const packed = three.map(packPuzzle);
const lo = Math.min(...lib.map(p => p.rating)), hi = Math.max(...lib.map(p => p.rating));
// 14 attempts: 10 first-try, 4 not, with believable times.
const secs = [18, 42, 9, 131, 27, 64, 15, 33, 208, 21, 12, 75, 48, 30];
const wrong = new Set([3, 5, 8, 11]);
const results = secs.map((s, i) => packResult(lib[20 + i], !wrong.has(i), s));
const hist = [];
for (let i = 20; i >= 0; i--) hist.push({ date: day(-i), value: 1300 + (20 - i) * 2 });
const given = [
  { id: 'g1', teacherUid: ME, studentUid: S, kind: 'puzzles', title: '10 puzzles: Fork, Pin',
    params: { themes: ['fork', 'pin'], minRating: 1200, maxRating: 1500, count: 10 },
    status: 'done', done: 10, seconds: 733, results, completedAt: now - 3600e3, doneMs: now - 3600e3, createdAt: now - 86400e3 },
  { id: 'g5', teacherUid: ME, studentUid: S, kind: 'list', title: 'Puzzles from Tuesday',
    params: { puzzles: packed }, doneIds: [three[1].id], status: 'open', done: 1, seconds: 95,
    results: [packResult(three[0], false, 61), packResult(three[1], true, 34)], createdAt: now - 7200e3 },
  { id: 'g0', teacherUid: ME, studentUid: S, kind: 'puzzles', title: '5 puzzles, 1000–1300 (before results)',
    params: { themes: [], minRating: 1000, maxRating: 1300, count: 5 },
    status: 'done', done: 5, seconds: 1260, completedAt: now - 6 * 86400e3, createdAt: now - 8 * 86400e3 },
  { id: 'g3', teacherUid: ME, studentUid: S, kind: 'text', title: 'Replay the Opera Game <script>', params: {},
    status: 'done', done: 1, seconds: 0, completedAt: now - 2 * 3600e3, doneMs: now - 2 * 3600e3, createdAt: now - 2 * 86400e3 },
];
Object.assign(Students, {
  uid: ME, loaded: true, failed: false, cachedAt: now,
  asStudent: [{ id: `${T}_${ME}`, teacherUid: T, studentUid: ME, status: 'active' }],
  asTeacher: [{ id: `${ME}_${S}`, teacherUid: ME, studentUid: S, status: 'active' }],
  people: { [T]: { uid: T, profileName: 'Coach Elena', username: 'elena' } },
  reports: {
    [S]: {
      uid: S, teachers: [ME], profileName: 'Marco <img src=x onerror=alert(1)>', username: 'marco',
      puzzleElo: 1342, openingEloAvg: 1210, endgameEloAvg: 1150, blindfoldElo: 1000,
      puzzleThemeElo: { fork: 1180, pin: 1250, skewer: 1400 },
      puzzleEloHistory: hist, puzzlesSolvedCount: 412, puzzleAttemptCount: 530, streakCount: 5, bestStreak: 12,
      activeTime: { [day(0)]: { puzzles: 1500 } }, hwOpen: 1, hwDone: 3, updatedAt: now - 3600e3,
    },
  },
  doneSeen: { [S]: 3 }, hwSeen: ['m5', 'm7'],
  hwGiven: { [S]: given },
  // What checkFinished() would have brought: two finished homework not opened.
  finNew: [
    { id: 'g1', studentUid: S, title: given[0].title, kind: 'puzzles', doneMs: now - 3600e3, seen: false },
    { id: 'g3', studentUid: S, title: given[3].title, kind: 'text', doneMs: now - 2 * 3600e3, seen: false },
  ],
  finSeenAt: now - 3600e3 + 1,
  hwDraft: {},
  homework: [
    { id: 'm7', teacherUid: T, studentUid: ME, kind: 'puzzles', title: '3 puzzles, any theme',
      params: { themes: [], minRating: lo, maxRating: hi, count: 3 },
      status: 'open', done: 0, seconds: 0, createdAt: now - 3600e3 },
    { id: 'm5', teacherUid: T, studentUid: ME, kind: 'list', title: 'Puzzles from Tuesday',
      params: { puzzles: packed }, doneIds: [], status: 'open', done: 0, seconds: 0, createdAt: now - 7200e3 },
  ],
});
// showScreen('students') calls Students.load(), which — with the seeded uid
// and no Firebase user — would fetch empty lists and wipe this seed. Test
// only: from here on "load" just redraws.
Students.load = async () => { Students.render(); };
Students.paintDot();
const dot = document.querySelector('#tabbar button[data-screen="students"]').classList.contains('has-dot');
app.showScreen('students');
Students.render();
return 'seeded (band ' + lo + '–' + hi + ', list ' + three.map(p => p.id).join(',') + '), dot before Students was seen: ' + dot;
