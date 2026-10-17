// Rules tests for homework sent to a WHOLE GROUP (school pilot, session 2).
//
// No rule changed for this: the app sends the group's homework as several
// small batches of ordinary homework creates (js/firebase.js
// assignHomeworkToMany). Each create's rule does get() of its own coaching
// link, and Firestore caps rule document reads at 20 per batch (10 per single
// write). Measured on the emulator (2026-10-16): every kind fits 20 creates
// in one batch except 'chapter', 18 (it also reads the class and the
// chapter); 30 is refused. The app uses 8, a wide margin. These tests pin
// that, so a rules change that adds a read per create shows up here instead
// of as a half-sent group.
// Plan: docs/plans/2026-10-16-school-groups.md, "Session 2".
//
// Run with:  npm run test:rules
// Local emulator only. Nothing here touches the real project.

import { before, after, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, serverTimestamp, writeBatch, collection, query, where, orderBy, limit,
  getDocs, getCountFromServer,
} from 'firebase/firestore';

// Must equal GROUP_HW_BATCH in js/firebase.js.
const GROUP_HW_BATCH = 8;

const TEACH = 'alice_uid';
const MC = 'mc1';
const CH = 'ch1';
const stu = i => `kid${i}_uid`;

const task = (i, kind = 'puzzles') => ({
  teacherUid: TEACH, studentUid: stu(i), kind, title: 'Group task',
  params: kind === 'chapter' ? { mcId: MC, chapterId: CH }
    : { themes: ['fork'], minRating: 1000, maxRating: 1300, count: 10 },
  status: 'open', done: 0, seconds: 0, createdAt: serverTimestamp(),
});

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'chess-training-center',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(async () => { await testEnv?.cleanup(); });
beforeEach(async () => { await testEnv.clearFirestore(); });

async function seedGroup(n, { inactive = [] } = {}) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `masterclasses/${MC}`), { ownerUid: TEACH, name: 'Endgames', createdAt: 1, updatedAt: 1, memberCount: 1 });
    await setDoc(doc(db, `masterclasses/${MC}/chapters/${CH}`), { title: 'Lucena', pgn: '1. e4 *', startFen: '', order: 0, updatedAt: 1, updatedBy: TEACH });
    for (let i = 0; i < n; i++) {
      await setDoc(doc(db, `coaching/${TEACH}_${stu(i)}`), {
        teacherUid: TEACH, studentUid: stu(i), status: inactive.includes(i) ? 'pending' : 'active',
        groupId: 'K7RM3P', createdAt: 1755000000000,
      });
    }
  });
}

function batchOf(n, kind, from = 0) {
  const db = testEnv.authenticatedContext(TEACH).firestore();
  const b = writeBatch(db);
  for (let i = from; i < from + n; i++) b.set(doc(db, `homework/g${i}`), task(i, kind));
  return b.commit();
}

describe('/homework — a whole group, in batches', () => {
  it(`CAN send ${GROUP_HW_BATCH} puzzle tasks in ONE batch (one link read each)`, async () => {
    await seedGroup(GROUP_HW_BATCH);
    await assertSucceeds(batchOf(GROUP_HW_BATCH, 'puzzles'));
  });

  it(`CAN send ${GROUP_HW_BATCH} chapter tasks in ONE batch (+ the class and chapter reads)`, async () => {
    await seedGroup(GROUP_HW_BATCH);
    await assertSucceeds(batchOf(GROUP_HW_BATCH, 'chapter'));
  });

  it('CANNOT send a whole class of 30 in one batch — the 20-read cap is why the app splits', async () => {
    await seedGroup(30);
    await assertFails(batchOf(30, 'puzzles'));
  });

  it('a refused batch can be retried one by one: the active students still get it', async () => {
    await seedGroup(3, { inactive: [1] });
    const db = testEnv.authenticatedContext(TEACH).firestore();
    await assertSucceeds(setDoc(doc(db, 'homework/r0'), task(0)));
    await assertFails(setDoc(doc(db, 'homework/r1'), task(1)));
    await assertSucceeds(setDoc(doc(db, 'homework/r2'), task(2)));
  });

  it('one student whose link is not active refuses THAT batch only, the next batch still goes', async () => {
    await seedGroup(GROUP_HW_BATCH * 2, { inactive: [3] });
    await assertFails(batchOf(GROUP_HW_BATCH, 'puzzles', 0));
    await assertSucceeds(batchOf(GROUP_HW_BATCH, 'puzzles', GROUP_HW_BATCH));
  });
});

// The two reads the app adds: countOpenHomework() before sending and
// countDoneThisWeek() for the grade table. No rule changed; these pin that
// the existing read rule allows them for the teacher and nobody else.
describe('/homework — the counts behind the group screens', () => {
  const seedHw = async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const base = { teacherUid: TEACH, studentUid: stu(0), kind: 'text', title: 'T', params: {}, done: 0, seconds: 0, createdAt: 1 };
      await setDoc(doc(db, 'homework/o1'), { ...base, status: 'open' });
      await setDoc(doc(db, 'homework/o2'), { ...base, status: 'open' });
      await setDoc(doc(db, 'homework/d1'), { ...base, status: 'done', done: 1, completedAt: new Date() });
      await setDoc(doc(db, 'homework/x1'), { ...base, teacherUid: 'dave_uid', status: 'open' });
    });
  };
  const openCount = (who, teacher) => getCountFromServer(query(collection(testEnv.authenticatedContext(who).firestore(), 'homework'),
    where('teacherUid', '==', teacher), where('studentUid', '==', stu(0)), where('status', '==', 'open')));

  it('the teacher CAN count a student\'s open homework from her (and only hers are counted)', async () => {
    await seedHw();
    const snap = await assertSucceeds(openCount(TEACH, TEACH));
    if (snap.data().count !== 2) throw new Error(`expected 2, got ${snap.data().count}`);
  });

  it('a stranger CANNOT count another teacher\'s homework', async () => {
    await seedHw();
    await assertFails(openCount('carol_uid', TEACH));
  });

  it('the teacher CAN list her homework finished in the last 7 days; a stranger CANNOT', async () => {
    await seedHw();
    const q = who => getDocs(query(collection(testEnv.authenticatedContext(who).firestore(), 'homework'),
      where('teacherUid', '==', TEACH), where('completedAt', '>', new Date(Date.now() - 7 * 864e5)),
      orderBy('completedAt'), limit(1000)));
    const snap = await assertSucceeds(q(TEACH));
    if (snap.size !== 1) throw new Error(`expected 1, got ${snap.size}`);
    await assertFails(q('carol_uid'));
  });
});
