// Rules tests for the school pilot: /groups (a teacher's group, its class code
// is the document id) and the class-code ways into /coaching (a student
// creating their own ACTIVE link by typing a code).
//
// Why these matter: a code join skips both the friendship and the pending
// step, so the rules alone must prove the code is real, belongs to that
// teacher and is open — and that only the student can use it for themselves.
// Plan: docs/plans/2026-10-16-school-groups.md.
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
  setDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch, Timestamp,
} from 'firebase/firestore';

const TEACH = 'alice_uid';   // the teacher
const STU = 'bob_uid';       // the student
const OTHER = 'carol_uid';   // another teacher / a stranger
const T2 = 'dave_uid';
const T3 = 'erin_uid';

const CODE = 'K7RM3P';
const CODE2 = 'QWX9TZ';
const LINK = `${TEACH}_${STU}`;

const group = (over = {}) => ({
  teacherUid: TEACH, name: '5.º A', school: 'Colegio Piloto', open: true,
  createdAt: serverTimestamp(), ...over,
});
// A group as stored (rules off, so a plain number is fine).
const storedGroup = (over = {}) => ({
  teacherUid: TEACH, name: '5.º A', open: true, createdAt: 1755000000000, ...over,
});
// The link exactly as joinGroup() in js/firebase.js writes it.
const join = (over = {}) => ({
  teacherUid: TEACH, studentUid: STU, status: 'active', groupId: CODE,
  createdAt: serverTimestamp(), respondedAt: serverTimestamp(), ...over,
});
const storedLink = (t, s, status, extra = {}) => ({
  teacherUid: t, studentUid: s, status, createdAt: 1755000000000, ...extra,
});
const report = (teachers) => ({
  teachers, profileName: 'Bob', username: 'bob', updatedAt: serverTimestamp(),
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

// ═══════════════════════ /groups ═══════════════════════

describe('/groups — creating', () => {
  it('a teacher CAN create a group with a valid code', async () => {
    await assertSucceeds(setDoc(doc(asTeacher(), `groups/${CODE}`), group()));
  });

  it('the school is optional', async () => {
    const { school, ...noSchool } = group();
    await assertSucceeds(setDoc(doc(asTeacher(), `groups/${CODE}`), noSchool));
  });

  it('CANNOT use a code with look-alikes, lowercase or the wrong length', async () => {
    for (const bad of ['K7RM3O', 'K7RM30', 'K7RM3I', 'K7RM31', 'k7rm3p', 'K7RM3', 'K7RM3PX', 'K7-M3P']) {
      await assertFails(setDoc(doc(asTeacher(), `groups/${bad}`), group()));
    }
  });

  it('CANNOT create a group for somebody else', async () => {
    await assertFails(setDoc(doc(asTeacher(), `groups/${CODE}`), group({ teacherUid: OTHER })));
  });

  it('CANNOT create it closed, with a client clock, or with an extra field', async () => {
    await assertFails(setDoc(doc(asTeacher(), `groups/${CODE}`), group({ open: false })));
    await assertFails(setDoc(doc(asTeacher(), `groups/${CODE}`), group({ createdAt: Date.now() })));
    await assertFails(setDoc(doc(asTeacher(), `groups/${CODE}`), group({ note: 'hi' })));
  });

  it('the name must be 1–40 characters and the school at most 60', async () => {
    await assertFails(setDoc(doc(asTeacher(), `groups/${CODE}`), group({ name: '' })));
    await assertFails(setDoc(doc(asTeacher(), `groups/${CODE}`), group({ name: 'x'.repeat(41) })));
    await assertFails(setDoc(doc(asTeacher(), `groups/${CODE}`), group({ name: 7 })));
    await assertFails(setDoc(doc(asTeacher(), `groups/${CODE}`), group({ school: 'x'.repeat(61) })));
    await assertSucceeds(setDoc(doc(asTeacher(), `groups/${CODE}`), group({ name: 'x'.repeat(40), school: 'y'.repeat(60) })));
  });

  it('a code collision CANNOT take over another teacher\'s group', async () => {
    await seed(`groups/${CODE}`, storedGroup());
    await assertFails(setDoc(doc(asOther(), `groups/${CODE}`), group({ teacherUid: OTHER })));
  });

  it('a signed-out visitor CANNOT create a group', async () => {
    await assertFails(setDoc(doc(asNobody(), `groups/${CODE}`), group()));
  });
});

describe('/groups — reading', () => {
  it('anyone signed in CAN look a code up (that is how joining works)', async () => {
    await seed(`groups/${CODE}`, storedGroup());
    await assertSucceeds(getDoc(doc(asStudent(), `groups/${CODE}`)));
    await assertSucceeds(getDoc(doc(asStudent(), `groups/${CODE2}`))); // a wrong code just does not exist
  });

  it('a signed-out visitor CANNOT look a code up', async () => {
    await seed(`groups/${CODE}`, storedGroup());
    await assertFails(getDoc(doc(asNobody(), `groups/${CODE}`)));
  });

  it('the teacher CAN list their own groups', async () => {
    await seed(`groups/${CODE}`, storedGroup());
    await assertSucceeds(getDocs(query(collection(asTeacher(), 'groups'), where('teacherUid', '==', TEACH))));
  });

  it('nobody CAN page through codes, or list another teacher\'s groups', async () => {
    await seed(`groups/${CODE}`, storedGroup());
    await assertFails(getDocs(collection(asStudent(), 'groups')));
    await assertFails(getDocs(query(collection(asOther(), 'groups'), where('teacherUid', '==', TEACH))));
  });
});

describe('/groups — rename, close, delete', () => {
  it('the owner CAN rename, change the school, close and reopen', async () => {
    await seed(`groups/${CODE}`, storedGroup());
    await assertSucceeds(updateDoc(doc(asTeacher(), `groups/${CODE}`), { name: 'Principiantes', school: 'Colegio' }));
    await assertSucceeds(updateDoc(doc(asTeacher(), `groups/${CODE}`), { open: false }));
    await assertSucceeds(updateDoc(doc(asTeacher(), `groups/${CODE}`), { open: true }));
  });

  it('the owner CANNOT change the owner or createdAt, or set a bad value', async () => {
    await seed(`groups/${CODE}`, storedGroup());
    await assertFails(updateDoc(doc(asTeacher(), `groups/${CODE}`), { teacherUid: OTHER }));
    await assertFails(updateDoc(doc(asTeacher(), `groups/${CODE}`), { createdAt: 5 }));
    await assertFails(updateDoc(doc(asTeacher(), `groups/${CODE}`), { name: '' }));
    await assertFails(updateDoc(doc(asTeacher(), `groups/${CODE}`), { open: 'no' }));
    await assertFails(updateDoc(doc(asTeacher(), `groups/${CODE}`), { note: 'hi' }));
  });

  it('nobody else CAN edit or delete it', async () => {
    await seed(`groups/${CODE}`, storedGroup());
    await assertFails(updateDoc(doc(asStudent(), `groups/${CODE}`), { open: true, name: 'mine' }));
    await assertFails(deleteDoc(doc(asStudent(), `groups/${CODE}`)));
    await assertFails(deleteDoc(doc(asNobody(), `groups/${CODE}`)));
  });

  it('the owner CAN delete it together with its students\' links (one batch)', async () => {
    await seed(`groups/${CODE}`, storedGroup());
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'active', { groupId: CODE }));
    const db = asTeacher();
    const b = writeBatch(db);
    b.delete(doc(db, `coaching/${LINK}`));
    b.delete(doc(db, `groups/${CODE}`));
    await assertSucceeds(b.commit());
  });
});

// ═══════════════════════ /coaching — joining with a code ═══════════════════════

describe('/coaching — a student joins with a class code', () => {
  it('CAN join an open group: the link is created already active, no friendship needed', async () => {
    await seed(`groups/${CODE}`, storedGroup());
    await assertSucceeds(setDoc(doc(asStudent(), `coaching/${LINK}`), join()));
  });

  it('join + first summary in ONE batch works (how the app does it)', async () => {
    await seed(`groups/${CODE}`, storedGroup());
    const db = asStudent();
    const b = writeBatch(db);
    b.set(doc(db, `coaching/${LINK}`), join());
    b.set(doc(db, `studentReports/${STU}`), report([TEACH]));
    await assertSucceeds(b.commit());
  });

  it('a 4th teacher through a code is refused by the summary (the 3-teacher cap holds)', async () => {
    await seed(`groups/${CODE}`, storedGroup());
    for (const t of [OTHER, T2, T3]) await seed(`coaching/${t}_${STU}`, storedLink(t, STU, 'active'));
    const db = asStudent();
    const b = writeBatch(db);
    b.set(doc(db, `coaching/${LINK}`), join());
    b.set(doc(db, `studentReports/${STU}`), report([OTHER, T2, T3, TEACH]));
    await assertFails(b.commit());
  });

  it('a wrong code, a malformed code or a missing code is refused', async () => {
    await seed(`groups/${CODE}`, storedGroup());
    await assertFails(setDoc(doc(asStudent(), `coaching/${LINK}`), join({ groupId: CODE2 })));
    await assertFails(setDoc(doc(asStudent(), `coaching/${LINK}`), join({ groupId: 'k7rm3p' })));
    await assertFails(setDoc(doc(asStudent(), `coaching/${LINK}`), join({ groupId: '' })));
    const { groupId, ...noCode } = join();
    await assertFails(setDoc(doc(asStudent(), `coaching/${LINK}`), noCode));
  });

  it('a CLOSED group is refused', async () => {
    await seed(`groups/${CODE}`, storedGroup({ open: false }));
    await assertFails(setDoc(doc(asStudent(), `coaching/${LINK}`), join()));
  });

  it('another teacher\'s code CANNOT be used to link to this teacher', async () => {
    await seed(`groups/${CODE}`, storedGroup({ teacherUid: OTHER }));
    await assertFails(setDoc(doc(asStudent(), `coaching/${LINK}`), join()));
  });

  it('a teacher CANNOT join their own group', async () => {
    await seed(`groups/${CODE}`, storedGroup());
    await assertFails(setDoc(doc(asTeacher(), `coaching/${TEACH}_${TEACH}`),
      join({ studentUid: TEACH })));
  });

  it('only the student can join for themselves (not the teacher, not a stranger)', async () => {
    await seed(`groups/${CODE}`, storedGroup());
    await assertFails(setDoc(doc(asTeacher(), `coaching/${LINK}`), join()));
    await assertFails(setDoc(doc(asOther(), `coaching/${LINK}`), join()));
    await assertFails(setDoc(doc(asNobody(), `coaching/${LINK}`), join()));
  });

  it('the id must be teacher_student, and the shape exact', async () => {
    await seed(`groups/${CODE}`, storedGroup());
    await assertFails(setDoc(doc(asStudent(), `coaching/${STU}_${TEACH}`), join()));
    await assertFails(setDoc(doc(asStudent(), `coaching/${LINK}`), join({ status: 'pending' })));
    await assertFails(setDoc(doc(asStudent(), `coaching/${LINK}`), join({ createdAt: Date.now() })));
    await assertFails(setDoc(doc(asStudent(), `coaching/${LINK}`), join({ respondedAt: Date.now() })));
    await assertFails(setDoc(doc(asStudent(), `coaching/${LINK}`), join({ note: 'hi' })));
    const { respondedAt, ...noAnswer } = join();
    await assertFails(setDoc(doc(asStudent(), `coaching/${LINK}`), noAnswer));
  });

  it('a teacher who blocked the student CANNOT be joined', async () => {
    await seed(`groups/${CODE}`, storedGroup());
    await seed(`blocks/${TEACH}/blocked/${STU}`, { createdAt: 1 });
    await assertFails(setDoc(doc(asStudent(), `coaching/${LINK}`), join()));
  });
});

describe('/coaching — joining with a code when a link already exists', () => {
  const answer = (over = {}) => ({ status: 'active', groupId: CODE, respondedAt: serverTimestamp(), ...over });

  it('a pending invite from the same teacher becomes active in the group', async () => {
    await seed(`groups/${CODE}`, storedGroup());
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'pending', { groupId: '' }));
    await assertSucceeds(updateDoc(doc(asStudent(), `coaching/${LINK}`), answer()));
  });

  it('an old decline can be turned into a join by the student', async () => {
    await seed(`groups/${CODE}`, storedGroup());
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'declined'));
    await assertSucceeds(updateDoc(doc(asStudent(), `coaching/${LINK}`), answer()));
  });

  it('a student can move to another open group of the same teacher', async () => {
    await seed(`groups/${CODE}`, storedGroup());
    await seed(`groups/${CODE2}`, storedGroup({ name: '5.º B' }));
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'active', { groupId: CODE }));
    await assertSucceeds(updateDoc(doc(asStudent(), `coaching/${LINK}`), answer({ groupId: CODE2 })));
  });

  it('a closed group, another teacher\'s group or a wrong code is refused', async () => {
    await seed(`groups/${CODE}`, storedGroup({ open: false }));
    await seed(`groups/${CODE2}`, storedGroup({ teacherUid: OTHER }));
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'pending'));
    await assertFails(updateDoc(doc(asStudent(), `coaching/${LINK}`), answer()));
    await assertFails(updateDoc(doc(asStudent(), `coaching/${LINK}`), answer({ groupId: CODE2 })));
    await assertFails(updateDoc(doc(asStudent(), `coaching/${LINK}`), answer({ groupId: 'ZZZZZZ' })));
  });

  it('the teacher CANNOT move a student into a group', async () => {
    await seed(`groups/${CODE}`, storedGroup());
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'pending'));
    await assertFails(updateDoc(doc(asTeacher(), `coaching/${LINK}`), answer()));
  });

  it('a code join CANNOT change who the teacher is, or set another status', async () => {
    await seed(`groups/${CODE}`, storedGroup());
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'pending'));
    await assertFails(updateDoc(doc(asStudent(), `coaching/${LINK}`), answer({ teacherUid: OTHER })));
    await assertFails(updateDoc(doc(asStudent(), `coaching/${LINK}`), answer({ status: 'pending' })));
    await assertFails(updateDoc(doc(asStudent(), `coaching/${LINK}`), answer({ respondedAt: 5 })));
  });

  it('leaving is the ordinary End: the student deletes the link', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'active', { groupId: CODE }));
    await assertSucceeds(deleteDoc(doc(asStudent(), `coaching/${LINK}`)));
  });
});

describe('/coaching — groupId on friends invites, and the roster queries', () => {
  it('a friends invite may carry groupId \'\' (not in a group), but never a code', async () => {
    await seed(`friendships/${[TEACH, STU].sort().join('_')}`, { members: [TEACH, STU].sort(), createdAt: 1 });
    const inv = { teacherUid: TEACH, studentUid: STU, status: 'pending', createdAt: serverTimestamp() };
    await seed(`groups/${CODE}`, storedGroup());
    await assertFails(setDoc(doc(asTeacher(), `coaching/${LINK}`), { ...inv, groupId: CODE }));
    await assertSucceeds(setDoc(doc(asTeacher(), `coaching/${LINK}`), { ...inv, groupId: '' }));
  });

  it('the per-group roster query (teacherUid == me and groupId == X) works', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'active', { groupId: CODE }));
    await assertSucceeds(getDocs(query(collection(asTeacher(), 'coaching'),
      where('teacherUid', '==', TEACH), where('groupId', '==', CODE))));
  });

  it('the legacy query (teacherUid == me and createdAt before the cutoff) works', async () => {
    await seed(`coaching/${LINK}`, { ...storedLink(TEACH, STU, 'active'), createdAt: Timestamp.fromMillis(1755000000000) });
    await assertSucceeds(getDocs(query(collection(asTeacher(), 'coaching'),
      where('teacherUid', '==', TEACH), where('createdAt', '<', Timestamp.fromMillis(Date.UTC(2026, 10, 1))))));
  });

  it('another teacher CANNOT read a group\'s roster', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'active', { groupId: CODE }));
    await assertFails(getDocs(query(collection(asOther(), 'coaching'),
      where('teacherUid', '==', TEACH), where('groupId', '==', CODE))));
    await assertFails(getDocs(query(collection(asOther(), 'coaching'), where('groupId', '==', CODE))));
  });
});
