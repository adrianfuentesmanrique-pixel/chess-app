// Rules tests for Students homework: /homework/{autoId} (stages 4 and 5).
//
// A teacher assigns a task to a student who currently accepts them; after
// that only the student's app moves it, and only its progress fields. Every
// allow and deny the rules comments claim gets a test here.
// Plan: docs/plans/2026-09-29-students.md (3.1 "homework", 3.2).
//
// Run with:  npm run test:rules
// Local emulator only. Nothing here touches the real project.

import { before, after, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc, collection, query, where, orderBy, limit, getDoc, getDocs,
  setDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch, increment, arrayUnion, deleteField,
} from 'firebase/firestore';

const TEACH = 'alice_uid';   // the teacher
const STU = 'bob_uid';       // the student
const OTHER = 'carol_uid';   // a stranger
const T2 = 'dave_uid';       // a second teacher

const LINK = `${TEACH}_${STU}`;
const HW = 'hw1';

// A task as the teacher's app writes it.
const puzzlesTask = (extra = {}, params = {}) => ({
  teacherUid: TEACH, studentUid: STU, kind: 'puzzles',
  title: 'Forks', note: 'Take your time',
  params: { themes: ['fork'], minRating: 1200, maxRating: 1500, count: 10, ...params },
  dueDate: '2026-10-07',
  status: 'open', done: 0, seconds: 0, createdAt: serverTimestamp(),
  ...extra,
});
const textTask = (extra = {}) => ({
  teacherUid: TEACH, studentUid: STU, kind: 'text',
  title: 'Read chapter 3', params: {},
  status: 'open', done: 0, seconds: 0, createdAt: serverTimestamp(),
  ...extra,
});

// Stage 5. A chapter of a class the teacher owns, and a hand-picked list.
const MC = 'mc1';
const CH = 'ch1';
const chapterTask = (extra = {}, params = {}) => ({
  teacherUid: TEACH, studentUid: STU, kind: 'chapter',
  title: 'The Lucena position',
  params: { mcId: MC, chapterId: CH, ...params },
  status: 'open', done: 0, seconds: 0, createdAt: serverTimestamp(),
  ...extra,
});
// A puzzle as the app packs it: id|fen|moves|rating|themes (see the comment on
// hwPzOk in firestore.rules for why it is one string, not a map).
const FEN = 'r2qk2r/pp4pp/2nbPn2/1Bp5/3pP3/2N5/PPP2PPP/R1BQK2R w KQkq - 2 11';
const pack = ({ id, fen = FEN, moves = ['c3d5', 'd8a5', 'c1d2', 'a5b5'], rating = 1219, themes = ['fork'] }) =>
  [id, fen, moves.join(' '), rating, themes.join(' ')].join('|');
const pz = (i, extra = {}) => pack({ id: `p${i}`, ...extra });
const listTask = (n = 3, extra = {}) => ({
  teacherUid: TEACH, studentUid: STU, kind: 'list',
  title: 'Puzzles from our lesson',
  params: { puzzles: Array.from({ length: n }, (_, i) => pz(i)) },
  status: 'open', done: 0, seconds: 0, createdAt: serverTimestamp(),
  ...extra,
});
const seedClass = async (owner = TEACH) => {
  await seed(`masterclasses/${MC}`, { ownerUid: owner, name: 'Endgames', createdAt: 1, updatedAt: 1, memberCount: 1 });
  await seed(`masterclasses/${MC}/chapters/${CH}`, { title: 'Lucena', pgn: '1. e4 *', startFen: '', order: 0, updatedAt: 1, updatedBy: owner });
};

// As stored (seeded with rules off, so createdAt is a plain number).
const stored = (task) => ({ ...task, createdAt: 1755000000000 });
const storedLink = (t, s, status) => ({
  teacherUid: t, studentUid: s, status, createdAt: 1755000000000,
});

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'chess-training-center',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

async function seed(path, data) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}

const as = (uid) => testEnv.authenticatedContext(uid).firestore();
const asTeacher = () => as(TEACH);
const asStudent = () => as(STU);
const asOther = () => as(OTHER);
const asNobody = () => testEnv.unauthenticatedContext().firestore();
const active = () => seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'active'));

// ═══════════════════════ create ═══════════════════════

describe('/homework — the teacher assigns', () => {
  it('CAN assign N puzzles to a student with an ACTIVE link', async () => {
    await active();
    await assertSucceeds(setDoc(doc(asTeacher(), `homework/${HW}`), puzzlesTask()));
  });

  it('CAN assign a text task, and a puzzle task with no theme (band only), no note, no date', async () => {
    await active();
    await assertSucceeds(setDoc(doc(asTeacher(), 'homework/a'), textTask()));
    const t = puzzlesTask({}, { themes: [] });
    delete t.note; delete t.dueDate;
    await assertSucceeds(setDoc(doc(asTeacher(), 'homework/b'), t));
  });

  it('CANNOT assign when the link is pending, declined, or missing', async () => {
    await assertFails(setDoc(doc(asTeacher(), `homework/${HW}`), puzzlesTask()));
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'pending'));
    await assertFails(setDoc(doc(asTeacher(), `homework/${HW}`), puzzlesTask()));
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'declined'));
    await assertFails(setDoc(doc(asTeacher(), `homework/${HW}`), puzzlesTask()));
  });

  it('CANNOT assign in the reverse direction (the student is not my teacher\'s teacher)', async () => {
    await active();
    await assertFails(setDoc(doc(asStudent(), `homework/${HW}`),
      puzzlesTask({ teacherUid: STU, studentUid: TEACH })));
  });

  it('CANNOT write a task in somebody else\'s name, or while signed out', async () => {
    await active();
    await assertFails(setDoc(doc(asOther(), `homework/${HW}`), puzzlesTask()));
    await assertFails(setDoc(doc(asNobody(), `homework/${HW}`), puzzlesTask()));
  });

  it('CANNOT assign homework to themselves', async () => {
    await seed(`coaching/${TEACH}_${TEACH}`, storedLink(TEACH, TEACH, 'active'));
    await assertFails(setDoc(doc(asTeacher(), `homework/${HW}`), puzzlesTask({ studentUid: TEACH })));
  });

  it('unknown kinds are refused, and chapter/list need their own params (not {})', async () => {
    await active();
    await assertFails(setDoc(doc(asTeacher(), 'homework/a'), textTask({ kind: 'chapter' })));
    await assertFails(setDoc(doc(asTeacher(), 'homework/b'), textTask({ kind: 'list' })));
    await assertFails(setDoc(doc(asTeacher(), 'homework/c'), textTask({ kind: 'essay' })));
  });

  it('puzzle count must be 1–100, a whole number', async () => {
    await active();
    await assertFails(setDoc(doc(asTeacher(), 'homework/a'), puzzlesTask({}, { count: 0 })));
    await assertFails(setDoc(doc(asTeacher(), 'homework/b'), puzzlesTask({}, { count: 101 })));
    await assertFails(setDoc(doc(asTeacher(), 'homework/c'), puzzlesTask({}, { count: 2.5 })));
    await assertSucceeds(setDoc(doc(asTeacher(), 'homework/d'), puzzlesTask({}, { count: 100 })));
  });

  it('rating band must be 0–4000 with min ≤ max', async () => {
    await active();
    await assertFails(setDoc(doc(asTeacher(), 'homework/a'), puzzlesTask({}, { minRating: 1600, maxRating: 1500 })));
    await assertFails(setDoc(doc(asTeacher(), 'homework/b'), puzzlesTask({}, { maxRating: 4001 })));
    await assertFails(setDoc(doc(asTeacher(), 'homework/c'), puzzlesTask({}, { minRating: -1 })));
    await assertSucceeds(setDoc(doc(asTeacher(), 'homework/d'), puzzlesTask({}, { minRating: 1500, maxRating: 1500 })));
  });

  it('at most 5 themes, each a short string', async () => {
    await active();
    const five = ['fork', 'pin', 'skewer', 'mateIn1', 'mateIn2'];
    await assertSucceeds(setDoc(doc(asTeacher(), 'homework/a'), puzzlesTask({}, { themes: five })));
    await assertFails(setDoc(doc(asTeacher(), 'homework/b'), puzzlesTask({}, { themes: [...five, 'deflection'] })));
    await assertFails(setDoc(doc(asTeacher(), 'homework/c'), puzzlesTask({}, { themes: ['fork', 7] })));
    await assertFails(setDoc(doc(asTeacher(), 'homework/d'), puzzlesTask({}, { themes: ['x'.repeat(41)] })));
    await assertFails(setDoc(doc(asTeacher(), 'homework/e'), puzzlesTask({}, { themes: 'fork' })));
  });

  it('params are a closed set per kind', async () => {
    await active();
    await assertFails(setDoc(doc(asTeacher(), 'homework/a'), puzzlesTask({}, { extra: 1 })));
    const missing = puzzlesTask();
    delete missing.params.count;
    await assertFails(setDoc(doc(asTeacher(), 'homework/b'), missing));
    await assertFails(setDoc(doc(asTeacher(), 'homework/c'), textTask({ params: { count: 1 } })));
  });

  it('title 1–80, note ≤ 500, due date YYYY-MM-DD', async () => {
    await active();
    await assertFails(setDoc(doc(asTeacher(), 'homework/a'), puzzlesTask({ title: '' })));
    await assertFails(setDoc(doc(asTeacher(), 'homework/b'), puzzlesTask({ title: 'x'.repeat(81) })));
    await assertSucceeds(setDoc(doc(asTeacher(), 'homework/c'), puzzlesTask({ title: 'x'.repeat(80), note: 'y'.repeat(500) })));
    await assertFails(setDoc(doc(asTeacher(), 'homework/d'), puzzlesTask({ note: 'y'.repeat(501) })));
    await assertFails(setDoc(doc(asTeacher(), 'homework/e'), puzzlesTask({ dueDate: 'next week' })));
    await assertFails(setDoc(doc(asTeacher(), 'homework/f'), puzzlesTask({ dueDate: 20261007 })));
  });

  it('an unknown field is refused (e.g. pre-filled progress fields)', async () => {
    await active();
    await assertFails(setDoc(doc(asTeacher(), 'homework/a'), puzzlesTask({ secret: 'x' })));
    await assertFails(setDoc(doc(asTeacher(), 'homework/b'), puzzlesTask({ completedAt: serverTimestamp() })));
  });

  it('everything starts at zero and open; a client clock is refused', async () => {
    await active();
    await assertFails(setDoc(doc(asTeacher(), 'homework/a'), puzzlesTask({ done: 3 })));
    await assertFails(setDoc(doc(asTeacher(), 'homework/b'), puzzlesTask({ seconds: 60 })));
    await assertFails(setDoc(doc(asTeacher(), 'homework/c'), puzzlesTask({ status: 'done' })));
    await assertFails(setDoc(doc(asTeacher(), 'homework/d'), puzzlesTask({ createdAt: Date.now() })));
  });
});

// ═══════════════════════ update ═══════════════════════

describe('/homework — the student reports progress', () => {
  it('CAN add solved puzzles and seconds with increment() (the bundled save)', async () => {
    await active();
    await seed(`homework/${HW}`, stored(puzzlesTask()));
    await assertSucceeds(updateDoc(doc(asStudent(), `homework/${HW}`),
      { done: increment(5), seconds: increment(240) }));
    const snap = await getDoc(doc(asStudent(), `homework/${HW}`));
    if (snap.data().done !== 5 || snap.data().seconds !== 240) throw new Error('increment did not land');
  });

  it('CAN finish: done == count, status done, server completedAt', async () => {
    await active();
    await seed(`homework/${HW}`, stored({ ...puzzlesTask(), done: 9, seconds: 500 }));
    await assertSucceeds(updateDoc(doc(asStudent(), `homework/${HW}`),
      { done: increment(1), seconds: increment(30), status: 'done', completedAt: serverTimestamp() }));
  });

  it('CANNOT go past the count', async () => {
    await active();
    await seed(`homework/${HW}`, stored({ ...puzzlesTask(), done: 9 }));
    await assertFails(updateDoc(doc(asStudent(), `homework/${HW}`), { done: 11 }));
  });

  it('CANNOT mark a puzzle task done before the count is reached', async () => {
    await active();
    await seed(`homework/${HW}`, stored({ ...puzzlesTask(), done: 4 }));
    await assertFails(updateDoc(doc(asStudent(), `homework/${HW}`),
      { status: 'done', completedAt: serverTimestamp() }));
  });

  it('CANNOT finish without a server completedAt, or with a client clock', async () => {
    await active();
    await seed(`homework/${HW}`, stored({ ...puzzlesTask(), done: 10 }));
    await assertFails(updateDoc(doc(asStudent(), `homework/${HW}`), { status: 'done' }));
    await assertFails(updateDoc(doc(asStudent(), `homework/${HW}`),
      { status: 'done', completedAt: Date.now() }));
  });

  it('CANNOT set completedAt while staying open', async () => {
    await active();
    await seed(`homework/${HW}`, stored(puzzlesTask()));
    await assertFails(updateDoc(doc(asStudent(), `homework/${HW}`),
      { done: 1, completedAt: serverTimestamp() }));
  });

  it('counters never go down', async () => {
    await active();
    await seed(`homework/${HW}`, stored({ ...puzzlesTask(), done: 5, seconds: 300 }));
    await assertFails(updateDoc(doc(asStudent(), `homework/${HW}`), { done: 4 }));
    await assertFails(updateDoc(doc(asStudent(), `homework/${HW}`), { seconds: 299 }));
  });

  it('time is capped at 100 hours (360000 s)', async () => {
    await active();
    await seed(`homework/${HW}`, stored(puzzlesTask()));
    await assertSucceeds(updateDoc(doc(asStudent(), `homework/${HW}`), { seconds: 360000 }));
    await assertFails(updateDoc(doc(asStudent(), `homework/${HW}`), { seconds: 360001 }));
  });

  it('a done task cannot be reopened, but may still gain seconds', async () => {
    await active();
    await seed(`homework/${HW}`, stored({ ...puzzlesTask(), done: 10, status: 'done', completedAt: 1 }));
    await assertFails(updateDoc(doc(asStudent(), `homework/${HW}`), { status: 'open' }));
    await assertSucceeds(updateDoc(doc(asStudent(), `homework/${HW}`), { seconds: increment(20) }));
  });

  it('a text task: the student ticks it off (done 1)', async () => {
    await active();
    await seed(`homework/${HW}`, stored(textTask()));
    await assertFails(updateDoc(doc(asStudent(), `homework/${HW}`), { done: 2 }));
    // 'done' with done still 0 is refused (the rules auditor's finding).
    await assertFails(updateDoc(doc(asStudent(), `homework/${HW}`),
      { status: 'done', completedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(asStudent(), `homework/${HW}`),
      { done: 1, status: 'done', completedAt: serverTimestamp() }));
  });

  it('CANNOT change the task itself (title, count, band, who, kind)', async () => {
    await active();
    await seed(`homework/${HW}`, stored(puzzlesTask()));
    const ref = doc(asStudent(), `homework/${HW}`);
    await assertFails(updateDoc(ref, { title: 'Easy ones' }));
    await assertFails(updateDoc(ref, { 'params.count': 1 }));
    await assertFails(updateDoc(ref, { params: { themes: [], minRating: 0, maxRating: 4000, count: 1 } }));
    await assertFails(updateDoc(ref, { teacherUid: OTHER }));
    await assertFails(updateDoc(ref, { kind: 'text' }));
    await assertFails(updateDoc(ref, { dueDate: '2030-01-01' }));
  });

  it('the teacher CANNOT edit progress (or anything else)', async () => {
    await active();
    await seed(`homework/${HW}`, stored(puzzlesTask()));
    await assertFails(updateDoc(doc(asTeacher(), `homework/${HW}`), { done: 10 }));
    await assertFails(updateDoc(doc(asTeacher(), `homework/${HW}`), { title: 'New' }));
  });

  it('a stranger CANNOT touch it', async () => {
    await active();
    await seed(`homework/${HW}`, stored(puzzlesTask()));
    await assertFails(updateDoc(doc(asOther(), `homework/${HW}`), { done: 1 }));
  });
});

// ═══════════════════════ delete ═══════════════════════

describe('/homework — deleting', () => {
  it('the teacher CAN delete, link active or gone', async () => {
    await active();
    await seed('homework/a', stored(puzzlesTask()));
    await assertSucceeds(deleteDoc(doc(asTeacher(), 'homework/a')));
    await seed('homework/b', stored(puzzlesTask()));
    await testEnv.withSecurityRulesDisabled(ctx => deleteDoc(doc(ctx.firestore(), `coaching/${LINK}`)));
    await assertSucceeds(deleteDoc(doc(asTeacher(), 'homework/b')));
  });

  it('the student CANNOT delete while the link is active', async () => {
    await active();
    await seed(`homework/${HW}`, stored(puzzlesTask()));
    await assertFails(deleteDoc(doc(asStudent(), `homework/${HW}`)));
  });

  it('the student CAN delete once the link is gone (teacher removed them)', async () => {
    await seed(`homework/${HW}`, stored(puzzlesTask()));
    await assertSucceeds(deleteDoc(doc(asStudent(), `homework/${HW}`)));
  });

  it('the student CAN delete when the link is pending/declined (not active)', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'declined'));
    await seed(`homework/${HW}`, stored(puzzlesTask()));
    await assertSucceeds(deleteDoc(doc(asStudent(), `homework/${HW}`)));
  });

  it('"End" in ONE batch: delete the link AND that teacher\'s homework (existsAfter)', async () => {
    await active();
    await seed('homework/a', stored(puzzlesTask()));
    await seed('homework/b', stored(textTask()));
    const fs = asStudent();
    const batch = writeBatch(fs);
    batch.delete(doc(fs, `coaching/${LINK}`));
    batch.delete(doc(fs, 'homework/a'));
    batch.delete(doc(fs, 'homework/b'));
    await assertSucceeds(batch.commit());
  });

  it('"End" of one teacher cannot delete another active teacher\'s homework', async () => {
    await active();
    await seed(`coaching/${T2}_${STU}`, storedLink(T2, STU, 'active'));
    await seed('homework/t2', stored(puzzlesTask({ teacherUid: T2 })));
    const fs = asStudent();
    const batch = writeBatch(fs);
    batch.delete(doc(fs, `coaching/${LINK}`));
    batch.delete(doc(fs, 'homework/t2'));
    await assertFails(batch.commit());
  });

  it('a stranger CANNOT delete', async () => {
    await seed(`homework/${HW}`, stored(puzzlesTask()));
    await assertFails(deleteDoc(doc(asOther(), `homework/${HW}`)));
  });
});

// ═══════════════════════ stage 5: chapter ═══════════════════════

describe('/homework — a Masterclass chapter (stage 5)', () => {
  it('CAN assign a chapter of a class I own', async () => {
    await active();
    await seedClass();
    await assertSucceeds(setDoc(doc(asTeacher(), `homework/${HW}`), chapterTask()));
  });

  it('CANNOT assign a chapter of a class somebody else owns', async () => {
    await active();
    await seedClass(OTHER);
    await assertFails(setDoc(doc(asTeacher(), `homework/${HW}`), chapterTask()));
  });

  it('CANNOT assign a chapter that does not exist, or of a class that does not exist', async () => {
    await active();
    await seedClass();
    await assertFails(setDoc(doc(asTeacher(), 'homework/a'), chapterTask({}, { chapterId: 'nope' })));
    await assertFails(setDoc(doc(asTeacher(), 'homework/b'), chapterTask({}, { mcId: 'nope' })));
  });

  it('chapter params are exactly {mcId, chapterId}, short strings', async () => {
    await active();
    await seedClass();
    await assertFails(setDoc(doc(asTeacher(), 'homework/a'), chapterTask({}, { extra: 1 })));
    await assertFails(setDoc(doc(asTeacher(), 'homework/b'), chapterTask({ params: { mcId: MC } })));
    await assertFails(setDoc(doc(asTeacher(), 'homework/c'), chapterTask({}, { chapterId: 7 })));
    await assertFails(setDoc(doc(asTeacher(), 'homework/d'), chapterTask({}, { mcId: '' })));
    // A '/' would re-aim the ownership lookup at another document (auditor).
    await assertFails(setDoc(doc(asTeacher(), 'homework/e'), chapterTask({}, { chapterId: `x/../${CH}` })));
    await assertFails(setDoc(doc(asTeacher(), 'homework/f'), chapterTask({}, { mcId: `${MC}/chapters/${CH}` })));
  });

  it('CANNOT assign a chapter without an active link, even of my own class', async () => {
    await seedClass();
    await assertFails(setDoc(doc(asTeacher(), `homework/${HW}`), chapterTask()));
  });

  it('the student finishes it: done 1 + done status (target is 1)', async () => {
    await active();
    await seed(`homework/${HW}`, stored(chapterTask()));
    await assertFails(updateDoc(doc(asStudent(), `homework/${HW}`), { done: 2 }));
    await assertFails(updateDoc(doc(asStudent(), `homework/${HW}`),
      { status: 'done', completedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(asStudent(), `homework/${HW}`),
      { done: increment(1), seconds: increment(95), status: 'done', completedAt: serverTimestamp() }));
  });

  it('a chapter whose class was deleted can still be marked done (plan 3.6)', async () => {
    await active();
    // No masterclasses/mc1 at all: the update rule never looks at the class.
    await seed(`homework/${HW}`, stored(chapterTask()));
    await assertSucceeds(updateDoc(doc(asStudent(), `homework/${HW}`),
      { done: 1, status: 'done', completedAt: serverTimestamp() }));
  });

  it('a chapter task may not carry doneIds', async () => {
    await active();
    await seed(`homework/${HW}`, stored(chapterTask()));
    await assertFails(updateDoc(doc(asStudent(), `homework/${HW}`), { doneIds: ['x'] }));
  });
});

// ═══════════════════════ stage 5: list ═══════════════════════

describe('/homework — a hand-picked puzzle list (stage 5)', () => {
  it('CAN assign 1 and 20 puzzles', async () => {
    await active();
    await assertSucceeds(setDoc(doc(asTeacher(), 'homework/a'), listTask(1)));
    await assertSucceeds(setDoc(doc(asTeacher(), 'homework/b'), listTask(20)));
  });

  it('CANNOT assign an empty list or 21 puzzles', async () => {
    await active();
    await assertFails(setDoc(doc(asTeacher(), 'homework/a'), listTask(0)));
    await assertFails(setDoc(doc(asTeacher(), 'homework/b'), listTask(21)));
  });

  it('a puzzle with no themes, a promotion and a 1-move line is fine', async () => {
    await active();
    const t = listTask(2);
    t.params.puzzles[1] = pack({ id: 'x-1_Z', moves: ['e7e8q'], themes: [], rating: 4000 });
    await assertSucceeds(setDoc(doc(asTeacher(), 'homework/a'), t));
  });

  it('each puzzle must be a packed string, and params only {puzzles}', async () => {
    await active();
    const asMap = listTask(2);
    asMap.params.puzzles[1] = { id: 'p1', fen: FEN, moves: ['c3d5'], rating: 1219, themes: ['fork'] };
    await assertFails(setDoc(doc(asTeacher(), 'homework/a'), asMap));
    await assertFails(setDoc(doc(asTeacher(), 'homework/b'), listTask(1, { params: { puzzles: [pz(0)], count: 1 } })));
    await assertFails(setDoc(doc(asTeacher(), 'homework/c'), listTask(1, { params: { puzzles: pz(0) } })));
  });

  it('every part of a packed puzzle is checked — also on the 20th', async () => {
    await active();
    const bad = [
      pack({ id: '' }), pack({ id: 'x'.repeat(41) }), pack({ id: 'a|b' }), pack({ id: '<img>' }),
      pack({ id: 'p', fen: 'not a fen' }), pack({ id: 'p', fen: FEN + ' extra' }),
      pack({ id: 'p', moves: [] }), pack({ id: 'p', moves: ['Nf3'] }), pack({ id: 'p', moves: ['e2e4x'] }),
      pack({ id: 'p', moves: Array(41).fill('e2e4') }),
      pack({ id: 'p', rating: 4001 }), pack({ id: 'p', rating: -1 }), pack({ id: 'p', rating: '12.5' }),
      pack({ id: 'p', themes: ['<script>'] }), pack({ id: 'p', themes: Array(21).fill('fork') }),
      pack({ id: 'p' }) + '|extra', pack({ id: 'p' }).replace(/\|[^|]*$/, ''),
    ];
    for (const [i, b] of bad.entries()) {
      const task = listTask(20);
      task.params.puzzles[19] = b;
      await assertFails(setDoc(doc(asTeacher(), `homework/b${i}`), task));
    }
    // …and the same 20 with a good last one is fine (the limit really is 20).
    await assertSucceeds(setDoc(doc(asTeacher(), 'homework/good'), listTask(20)));
  });

  it('20 of the LONGEST legal puzzles still fit the rules expression budget', async () => {
    await active();
    const t = listTask(20);
    t.params.puzzles = t.params.puzzles.map((_, i) => pack({
      id: `p${i}`.padEnd(40, 'x'), moves: Array(40).fill('e7e8q'),
      themes: Array(20).fill('t'.repeat(40)),
    }));
    await assertSucceeds(setDoc(doc(asTeacher(), 'homework/long'), t));
  });

  it('the student counts solved puzzles into doneIds with arrayUnion + increment', async () => {
    await active();
    await seed(`homework/${HW}`, stored(listTask(3)));
    await assertSucceeds(updateDoc(doc(asStudent(), `homework/${HW}`),
      { done: increment(2), doneIds: arrayUnion('p0', 'p1'), seconds: increment(60) }));
    const snap = await getDoc(doc(asStudent(), `homework/${HW}`));
    if (snap.data().doneIds.length !== 2) throw new Error('arrayUnion did not land');
  });

  it('finishes only when done == the list length', async () => {
    await active();
    await seed(`homework/${HW}`, stored({ ...listTask(3), done: 2, doneIds: ['p0', 'p1'] }));
    await assertFails(updateDoc(doc(asStudent(), `homework/${HW}`),
      { status: 'done', completedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(asStudent(), `homework/${HW}`), { done: 4 }));
    await assertSucceeds(updateDoc(doc(asStudent(), `homework/${HW}`),
      { done: increment(1), doneIds: arrayUnion('p2'), status: 'done', completedAt: serverTimestamp() }));
  });

  it('doneIds only grows, never past the list length, and holds short strings', async () => {
    await active();
    await seed(`homework/${HW}`, stored({ ...listTask(3), done: 2, doneIds: ['p0', 'p1'] }));
    const ref = doc(asStudent(), `homework/${HW}`);
    await assertFails(updateDoc(ref, { doneIds: ['p0'] }));                       // shrinks
    await assertFails(updateDoc(ref, { doneIds: ['p0', 'p2', 'p1', 'p3'] }));     // 4 > 3
    await assertFails(updateDoc(ref, { doneIds: arrayUnion(7) }));                 // not a string
    await assertFails(updateDoc(ref, { doneIds: arrayUnion('x'.repeat(41)) }));
    await assertFails(updateDoc(ref, { doneIds: 'p0,p1,p2' }));
    await assertFails(updateDoc(ref, { doneIds: deleteField() }));                 // auditor: no delete-to-shrink
    await assertSucceeds(updateDoc(ref, { doneIds: arrayUnion('p2') }));
  });

  it('the teacher CANNOT write doneIds, and the list itself cannot be edited', async () => {
    await active();
    await seed(`homework/${HW}`, stored(listTask(3)));
    await assertFails(updateDoc(doc(asTeacher(), `homework/${HW}`), { doneIds: arrayUnion('p0') }));
    await assertFails(updateDoc(doc(asStudent(), `homework/${HW}`), { 'params.puzzles': [pz(0)] }));
  });

  it('a puzzles/text task may not carry doneIds, and a new task cannot start with one', async () => {
    await active();
    await seed('homework/a', stored(puzzlesTask()));
    await assertFails(updateDoc(doc(asStudent(), 'homework/a'), { doneIds: ['p0'] }));
    await assertFails(setDoc(doc(asTeacher(), 'homework/b'), listTask(2, { doneIds: [] })));
  });
});

// ═══════════════════════ per-puzzle results (stage 6) ═══════════════════════

// One attempt as the student's app writes it: the packed puzzle + first-try
// flag + seconds.
const res = (i, ok = 1, secs = 12, extra = {}) => `${pz(i, extra)}|${ok}|${secs}`;

describe('/homework — per-puzzle results (stage 6)', () => {
  it('the student records right and wrong attempts with arrayUnion (puzzles kind)', async () => {
    await active();
    await seed(`homework/${HW}`, stored(puzzlesTask()));
    const ref = doc(asStudent(), `homework/${HW}`);
    await assertSucceeds(updateDoc(ref,
      { done: increment(1), seconds: increment(40), results: arrayUnion(res(0, 1, 25), res(1, 0, 15)) }));
    // A wrong attempt alone: results grow, `done` does not.
    await assertSucceeds(updateDoc(ref, { results: arrayUnion(res(2, 0, 9)) }));
    const snap = await getDoc(ref);
    if (snap.data().results.length !== 3 || snap.data().done !== 1) throw new Error('results did not land');
  });

  it('a list records them too, and the finishing write may carry the last one', async () => {
    await active();
    await seed(`homework/${HW}`, stored({ ...listTask(2), done: 1, doneIds: ['p0'], results: [res(0), res(1, 0, 30)] }));
    await assertSucceeds(updateDoc(doc(asStudent(), `homework/${HW}`), {
      done: increment(1), doneIds: arrayUnion('p1'), results: arrayUnion(res(1, 1, 8)),
      status: 'done', completedAt: serverTimestamp(),
    }));
  });

  it('a finished homework may still gain results (a second phone\'s late bundle)', async () => {
    await active();
    await seed(`homework/${HW}`, stored({ ...puzzlesTask(), done: 10, status: 'done', completedAt: 5 }));
    await assertSucceeds(updateDoc(doc(asStudent(), `homework/${HW}`), { results: arrayUnion(res(0)) }));
  });

  it('300 entries fit (one match, not 300 checks); 301 do not', async () => {
    await active();
    const many = n => Array.from({ length: n }, (_, i) => res(i, i % 2, i));
    await seed('homework/a', stored({ ...puzzlesTask({}, { count: 100 }), results: many(299) }));
    await assertSucceeds(updateDoc(doc(asStudent(), 'homework/a'), { results: arrayUnion(res(299)) }));
    await assertFails(updateDoc(doc(asStudent(), 'homework/a'), { results: arrayUnion(res(300)) }));
  });

  it('the joined size is capped at 120,000 characters', async () => {
    await active();
    await seed(`homework/${HW}`, stored(puzzlesTask()));
    const long = i => res(i, 1, 99999, {
      id: `p${i}`.padEnd(40, 'x'), moves: Array(40).fill('e7e8q'), themes: Array(20).fill('t'.repeat(40)),
    });
    const fits = Array.from({ length: 90 }, (_, i) => long(i));     // ≈ 108 KB
    const over = Array.from({ length: 110 }, (_, i) => long(i));    // ≈ 132 KB
    if (fits.join(';').length > 120000 || over.join(';').length <= 120000) throw new Error('fixture sizes are off');
    const ref = doc(asStudent(), `homework/${HW}`);
    await assertFails(updateDoc(ref, { results: over }));
    await assertSucceeds(updateDoc(ref, { results: fits }));
  });

  it('results only grow: no shrinking, no replacing, no reordering, no deleting', async () => {
    await active();
    await seed(`homework/${HW}`, stored({ ...puzzlesTask(), results: [res(0), res(1, 0)] }));
    const ref = doc(asStudent(), `homework/${HW}`);
    await assertFails(updateDoc(ref, { results: [res(0)] }));
    await assertFails(updateDoc(ref, { results: [res(0), res(2)] }));          // rewrote a wrong one away
    await assertFails(updateDoc(ref, { results: [] }));
    await assertFails(updateDoc(ref, { results: [res(1, 0), res(0), res(2)] }));   // reordered (rules audit)
    await assertFails(updateDoc(ref, { results: deleteField() }));
    await assertSucceeds(updateDoc(ref, { results: [res(0), res(1, 0), res(2)] }));
  });

  it('every entry is checked — also the last of many', async () => {
    await active();
    await seed(`homework/${HW}`, stored({ ...puzzlesTask(), results: Array.from({ length: 50 }, (_, i) => res(i)) }));
    const ref = doc(asStudent(), `homework/${HW}`);
    const bad = [
      7, { id: 'p0' }, '', 'p0|1|12',
      pz(60),                                  // a puzzle with no result on it
      `${pz(60)}|2|12`, `${pz(60)}|1|`, `${pz(60)}|1|123456`, `${pz(60)}|1|-3`, `${pz(60)}|yes|12`,
      res(60, 1, 12, { fen: '<img src=x onerror=alert(1)>' }),
      res(60, 1, 12, { moves: ['e2e9'] }),
      res(60, 1, 12, { rating: 4001 }),
      res(60, 1, 12, { id: 'a b' }),
      `${res(60)};<script>`,                   // the separator cannot smuggle text in
      `${res(60)}\n${res(61)}`,
    ];
    for (const b of bad) await assertFails(updateDoc(ref, { results: arrayUnion(b) }));
    await assertFails(updateDoc(ref, { results: 'nope' }));
    await assertSucceeds(updateDoc(ref, { results: arrayUnion(res(60, 0, 0, { themes: [] })) }));
  });

  it('a text or chapter task may not carry results', async () => {
    await active();
    await seedClass();
    await seed('homework/t', stored(textTask()));
    await seed('homework/c', stored(chapterTask()));
    await assertFails(updateDoc(doc(asStudent(), 'homework/t'), { results: arrayUnion(res(0)) }));
    await assertFails(updateDoc(doc(asStudent(), 'homework/c'), { results: arrayUnion(res(0)) }));
  });

  it('the teacher and a stranger CANNOT write results, and a new task cannot start with them', async () => {
    await active();
    await seed(`homework/${HW}`, stored(puzzlesTask()));
    await assertFails(updateDoc(doc(asTeacher(), `homework/${HW}`), { results: arrayUnion(res(0)) }));
    await assertFails(updateDoc(doc(asOther(), `homework/${HW}`), { results: arrayUnion(res(0)) }));
    await assertFails(setDoc(doc(asTeacher(), 'homework/b'), puzzlesTask({ results: [] })));
    await assertFails(setDoc(doc(asTeacher(), 'homework/c'), puzzlesTask({ results: [res(0)] })));
  });

  it('old homework without results still takes the stage 4/5 saves unchanged', async () => {
    await active();
    await seed(`homework/${HW}`, stored({ ...puzzlesTask(), done: 3, seconds: 100 }));
    await assertSucceeds(updateDoc(doc(asStudent(), `homework/${HW}`),
      { done: increment(2), seconds: increment(60) }));
  });
});

// ═══════════════════════ read ═══════════════════════

describe('/homework — reading', () => {
  it('the teacher and the student can read it; a stranger cannot', async () => {
    await seed(`homework/${HW}`, stored(puzzlesTask()));
    await assertSucceeds(getDoc(doc(asTeacher(), `homework/${HW}`)));
    await assertSucceeds(getDoc(doc(asStudent(), `homework/${HW}`)));
    await assertFails(getDoc(doc(asOther(), `homework/${HW}`)));
    await assertFails(getDoc(doc(asNobody(), `homework/${HW}`)));
  });

  it('the student\'s list query (studentUid == me) works', async () => {
    await seed(`homework/${HW}`, stored(puzzlesTask()));
    await assertSucceeds(getDocs(query(collection(asStudent(), 'homework'),
      where('studentUid', '==', STU))));
  });

  it('the teacher\'s per-student query (teacherUid == me AND studentUid == X) works', async () => {
    await seed(`homework/${HW}`, stored(puzzlesTask()));
    await assertSucceeds(getDocs(query(collection(asTeacher(), 'homework'),
      where('teacherUid', '==', TEACH), where('studentUid', '==', STU))));
  });

  it('the teacher\'s "finished since I last looked" query works (stage 6); not for a stranger', async () => {
    await seed(`homework/${HW}`, stored({ ...textTask(), done: 1, status: 'done', completedAt: new Date(1755000500000) }));
    const q = db => query(collection(db, 'homework'),
      where('teacherUid', '==', TEACH), where('completedAt', '>', new Date(1755000000000)),
      orderBy('completedAt'), limit(20));
    const snap = await assertSucceeds(getDocs(q(asTeacher())));
    if (snap.size !== 1) throw new Error('the finished homework was not returned');
    await assertFails(getDocs(q(asOther())));
    await assertFails(getDocs(q(asStudent())));
  });

  it('CANNOT list everything, or somebody else\'s homework', async () => {
    await seed(`homework/${HW}`, stored(puzzlesTask()));
    await assertFails(getDocs(collection(asOther(), 'homework')));
    await assertFails(getDocs(query(collection(asOther(), 'homework'),
      where('studentUid', '==', STU))));
    await assertFails(getDocs(query(collection(asOther(), 'homework'),
      where('teacherUid', '==', TEACH))));
  });
});
