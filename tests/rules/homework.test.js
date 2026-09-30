// Rules tests for Students homework: /homework/{autoId} (stage 4).
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
  doc, collection, query, where, getDoc, getDocs,
  setDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch, increment,
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

  it('the stage 5 kinds (chapter, list) and unknown kinds are refused for now', async () => {
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

  it('CANNOT list everything, or somebody else\'s homework', async () => {
    await seed(`homework/${HW}`, stored(puzzlesTask()));
    await assertFails(getDocs(collection(asOther(), 'homework')));
    await assertFails(getDocs(query(collection(asOther(), 'homework'),
      where('studentUid', '==', STU))));
    await assertFails(getDocs(query(collection(asOther(), 'homework'),
      where('teacherUid', '==', TEACH))));
  });
});
