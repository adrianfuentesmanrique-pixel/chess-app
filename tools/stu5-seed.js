// Seed body for tools/cdp-verify-students5.mjs — an async-function body.
// EVERYTHING signed-in here is SEEDED: Firestore is unreachable from
// localhost (App Check), so there is no Firebase user and no write happens.
// Order matters: Students.load() first, THEN Object.assign — load() wipes a
// seed made before it. Stage 5 adds: a chapter homework, a hand-picked list
// (three REAL puzzles from the library, packed the way the rules want), a
// chapter whose class is gone, the teacher's list draft, and one Masterclass
// with its chapters already "loaded".
const app = await import('/js/app.js');
const { Students } = await import('/js/students.js');
const { Masterclass } = await import('/js/masterclass.js');
const { packPuzzle } = await import('/js/firebase.js');
app.showScreen('students');
await Students.load();
const now = Date.now();
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const T = 't_uid', S = 's_uid', ME = 'me_uid';
const lib = await (await fetch('/puzzles/puzzles-3.json')).json();
const three = lib.slice(0, 3);
const packed = three.map(packPuzzle);
const hist = [];
for (let i = 20; i >= 0; i--) hist.push({ date: day(-i), value: 1300 + (20 - i) * 2 });
const given = [
  { id: 'g4', teacherUid: ME, studentUid: S, kind: 'chapter', title: 'Lucena: building a bridge',
    params: { mcId: 'mc1', chapterId: 'ch1' }, status: 'open', done: 0, seconds: 300, dueDate: day(2), createdAt: now - 3600e3 },
  { id: 'g5', teacherUid: ME, studentUid: S, kind: 'list', title: 'Puzzles from Tuesday',
    params: { puzzles: packed }, doneIds: [three[0].id], status: 'open', done: 1, seconds: 240, createdAt: now - 7200e3 },
  { id: 'g1', teacherUid: ME, studentUid: S, kind: 'puzzles', title: '10 puzzles: Fork, Pin',
    params: { themes: ['fork', 'pin'], minRating: 1200, maxRating: 1500, count: 10 },
    status: 'done', done: 10, seconds: 1780, completedAt: now - 5 * 3600e3, createdAt: now - 86400e3 },
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
      activeTime: { [day(0)]: { puzzles: 1500 } }, hwOpen: 2, hwDone: 1, updatedAt: now - 3600e3,
    },
  },
  doneSeen: { [S]: 1 }, hwSeen: [],
  hwGiven: { [S]: given },
  // The teacher's list draft for Marco: two puzzles collected from the log.
  hwDraft: { [S]: [packPuzzle(lib[10]), packPuzzle(lib[11])] },
  homework: [
    { id: 'm4', teacherUid: T, studentUid: ME, kind: 'chapter', title: 'Lucena: building a bridge <b>',
      note: 'Step through it slowly. Guess each White move first.',
      params: { mcId: 'mc1', chapterId: 'ch1' }, status: 'open', done: 0, seconds: 0, dueDate: day(2), createdAt: now - 3600e3 },
    { id: 'm5', teacherUid: T, studentUid: ME, kind: 'list', title: 'Puzzles from Tuesday',
      params: { puzzles: packed }, doneIds: [], status: 'open', done: 0, seconds: 0, createdAt: now - 7200e3 },
    { id: 'm6', teacherUid: T, studentUid: ME, kind: 'chapter', title: 'Old chapter (class deleted)',
      params: { mcId: 'gone', chapterId: 'gone' }, status: 'open', done: 0, seconds: 0, createdAt: now - 9e6 },
  ],
});
// Plan 3.6: what Open found for m6 (openForHomework → 'gone'), seeded.
Students.hwGone = new Set(['m6']);
// One class I own, with its chapters, as the Masterclass screen holds them.
const mc = { id: 'mc1', name: 'Rook endgames', ownerUid: ME, role: 'owner', memberCount: 4 };
Object.assign(Masterclass, {
  classes: [mc], classesLoaded: true, loadFailed: false,
  current: mc, chaptersLoaded: true, chaptersFailed: false,
  chapters: [
    { id: 'ch1', title: 'Lucena', order: 0, startFen: '',
      pgn: '1. e4 e5 2. Nf3 (2. f4 exf4 3. Nf3) 2... Nc6 3. Bb5 a6 *' },
    { id: 'ch2', title: 'Philidor <i>defence</i>', order: 1, startFen: '', pgn: '1. d4 d5 *' },
  ],
});
Students.paintDot();
Students.render();
return 'seeded (list puzzles ' + three.map(p => p.id).join(',') + ')';
