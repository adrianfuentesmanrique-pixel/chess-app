// Seed body for tools/cdp-verify-students4.mjs — an async-function body.
// EVERYTHING signed-in here is SEEDED: Firestore is unreachable from
// localhost (App Check), so there is no Firebase user and no write happens.
// Order matters: Students.load() first, THEN Object.assign — load() wipes a
// seed made before it.
const app = await import('/js/app.js');
const { Students } = await import('/js/students.js');
app.showScreen('students');
await Students.load();
const now = Date.now();
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const T = 't_uid', S = 's_uid', ME = 'me_uid';
const hist = [];
for (let i = 20; i >= 0; i--) hist.push({ date: day(-i), value: 1300 + (20 - i) * 2 });
const given = [
  { id: 'g1', teacherUid: ME, studentUid: S, kind: 'puzzles', title: '10 puzzles: Fork, Pin',
    params: { themes: ['fork', 'pin'], minRating: 1200, maxRating: 1500, count: 10 },
    status: 'open', done: 4, seconds: 780, dueDate: day(3), createdAt: now - 86400e3 },
  { id: 'g2', teacherUid: ME, studentUid: S, kind: 'text', title: 'Replay the Opera Game',
    note: 'Play it through twice, then try to explain <b>every</b> White move.', params: {},
    status: 'open', done: 0, seconds: 0, createdAt: now - 2 * 86400e3 },
  { id: 'g3', teacherUid: ME, studentUid: S, kind: 'puzzles', title: '5 puzzles, 1000–1300',
    params: { themes: [], minRating: 1000, maxRating: 1300, count: 5 },
    status: 'done', done: 5, seconds: 1260, completedAt: now - 3 * 3600e3, createdAt: now - 4 * 86400e3 },
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
      puzzleThemeElo: { fork: 1180, pin: 1250, skewer: 1400, mateIn2: 1300, backRankMate: 1120 },
      puzzleEloHistory: hist, puzzlesSolvedCount: 412, puzzleAttemptCount: 530, streakCount: 5, bestStreak: 12,
      activeTime: { [day(0)]: { puzzles: 1500 }, [day(-1)]: { puzzles: 900, endgames: 300 } },
      hwOpen: 2, hwDone: 3, updatedAt: now - 3600e3,
    },
  },
  // hwDone 3 > 2 seen → the "new" chip and the gold dot.
  doneSeen: { [S]: 2 },
  hwSeen: [],
  hwGiven: { [S]: given },
  homework: [
    { id: 'm1', teacherUid: T, studentUid: ME, kind: 'puzzles', title: '10 puzzles: Fork',
      params: { themes: ['fork'], minRating: 1200, maxRating: 1500, count: 10 },
      status: 'open', done: 4, seconds: 780, dueDate: day(3), createdAt: now - 86400e3 },
    { id: 'm2', teacherUid: T, studentUid: ME, kind: 'text', title: 'Replay the Opera Game <script>',
      note: 'Play it through twice.\nThen explain every White move.', params: {},
      status: 'open', done: 0, seconds: 0, createdAt: now - 2 * 86400e3 },
    { id: 'm3', teacherUid: T, studentUid: ME, kind: 'puzzles', title: '5 puzzles, 1000–1300',
      params: { themes: [], minRating: 1000, maxRating: 1300, count: 5 },
      status: 'done', done: 5, seconds: 1260, completedAt: now - 3 * 3600e3, createdAt: now - 4 * 86400e3 },
  ],
});
Students.paintDot();
const dot = document.querySelector('#tabbar button[data-screen="students"]').classList.contains('has-dot');
Students.render();
return 'seeded, dot before viewing: ' + dot;
