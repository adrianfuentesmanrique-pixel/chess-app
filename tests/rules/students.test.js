// Rules tests for the Students feature: /coaching (the teacher↔student link)
// and /studentReports (the training summary a student shares with teachers).
//
// Why these matter: this is the first place a person's PRIVATE progress
// becomes readable by somebody else. The promise is "only the teachers I
// accepted, only while I allow it", and it is kept by the rules, not by the
// screen — so every allow and every deny the rules comments claim gets a test.
// Plan: docs/plans/2026-09-29-students.md (section 3.1, stage 1 list).
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
  setDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch,
} from 'firebase/firestore';

// Sorted ascending, so `${A}_${B}` is the friendship id for any two of them.
const TEACH = 'alice_uid';   // the teacher
const STU = 'bob_uid';       // the student
const OTHER = 'carol_uid';   // a stranger / second teacher
const T2 = 'dave_uid';
const T3 = 'erin_uid';
const T4 = 'frank_uid';

const pairId = (a, b) => [a, b].sort().join('_');
const linkId = (t, s) => `${t}_${s}`;
const LINK = linkId(TEACH, STU);

// The link as the teacher's app writes it. serverTimestamp() is what the rules
// mean by request.time — a Date.now() number is refused.
const invite = (t = TEACH, s = STU) => ({
  teacherUid: t, studentUid: s, status: 'pending', createdAt: serverTimestamp(),
});

// A link as stored (seeded with rules off, so a plain number is fine here).
const storedLink = (t, s, status) => ({
  teacherUid: t, studentUid: s, status, createdAt: 1755000000000,
});

// A summary as the student's app writes it.
const report = (teachers, extra = {}) => ({
  teachers,
  profileName: 'Bob',
  username: 'bob',
  avatarId: 'knight',
  puzzleElo: 1500,
  puzzleThemeElo: { fork: 1450 },
  puzzleEloHistory: [{ date: '2026-09-28', value: 1490 }, { date: '2026-09-29', value: 1500 }],
  puzzlesSolvedCount: 42,
  streakCount: 3,
  updatedAt: serverTimestamp(),
  ...extra,
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

// Every test starts from an empty database: these rules depend on whether
// OTHER documents exist (the friendship, the block, the link), and a leftover
// would make a "deny" test pass for the wrong reason.
beforeEach(async () => {
  await testEnv.clearFirestore();
});

async function seed(path, data) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}

const friends = (a, b) => seed(`friendships/${pairId(a, b)}`,
  { members: [a, b].sort(), createdAt: 1755000000000 });

const as = (uid) => testEnv.authenticatedContext(uid).firestore();
const asTeacher = () => as(TEACH);
const asStudent = () => as(STU);
const asOther = () => as(OTHER);
const asNobody = () => testEnv.unauthenticatedContext().firestore();

// ═══════════════════════ /coaching — inviting ═══════════════════════

describe('/coaching — the teacher invites', () => {
  it('CAN invite a friend (pending)', async () => {
    await friends(TEACH, STU);
    await assertSucceeds(setDoc(doc(asTeacher(), `coaching/${LINK}`), invite()));
  });

  it('CANNOT invite somebody who is not a friend', async () => {
    await assertFails(setDoc(doc(asTeacher(), `coaching/${LINK}`), invite()));
  });

  it('CANNOT invite a friend who has blocked them (silent, same as friend requests)', async () => {
    await friends(TEACH, STU);
    await seed(`blocks/${STU}/blocked/${TEACH}`, { createdAt: 1 });
    await assertFails(setDoc(doc(asTeacher(), `coaching/${LINK}`), invite()));
  });

  it('CANNOT invite themselves', async () => {
    await assertFails(setDoc(doc(asTeacher(), `coaching/${linkId(TEACH, TEACH)}`),
      invite(TEACH, TEACH)));
  });

  it('CANNOT use the wrong id shape (student first / sorted pair)', async () => {
    await friends(TEACH, STU);
    await assertFails(setDoc(doc(asTeacher(), `coaching/${linkId(STU, TEACH)}`), invite()));
    await assertFails(setDoc(doc(asTeacher(), 'coaching/whatever'), invite()));
  });

  it('CANNOT create an invite naming someone else as the teacher', async () => {
    await friends(OTHER, STU);
    await assertFails(setDoc(doc(asTeacher(), `coaching/${linkId(OTHER, STU)}`),
      invite(OTHER, STU)));
  });

  it('CANNOT add an extra field', async () => {
    await friends(TEACH, STU);
    await assertFails(setDoc(doc(asTeacher(), `coaching/${LINK}`),
      { ...invite(), note: 'hi' }));
  });

  it('CANNOT leave out a field', async () => {
    await friends(TEACH, STU);
    const { createdAt, ...noTime } = invite();
    await assertFails(setDoc(doc(asTeacher(), `coaching/${LINK}`), noTime));
  });

  it('CANNOT create it already active (skipping the student\'s consent)', async () => {
    await friends(TEACH, STU);
    await assertFails(setDoc(doc(asTeacher(), `coaching/${LINK}`),
      { ...invite(), status: 'active' }));
  });

  it('CANNOT use a client clock for createdAt', async () => {
    await friends(TEACH, STU);
    await assertFails(setDoc(doc(asTeacher(), `coaching/${LINK}`),
      { ...invite(), createdAt: Date.now() }));
  });

  it('CANNOT re-send over a declined invite (setDoc on an existing doc is an update)', async () => {
    await friends(TEACH, STU);
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'declined'));
    await assertFails(setDoc(doc(asTeacher(), `coaching/${LINK}`), invite()));
  });

  it('a signed-out visitor CANNOT invite', async () => {
    await friends(TEACH, STU);
    await assertFails(setDoc(doc(asNobody(), `coaching/${LINK}`), invite()));
  });
});

// ═══════════════════════ /coaching — reading ═══════════════════════

describe('/coaching — reading', () => {
  it('both sides can read the link', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'pending'));
    await assertSucceeds(getDoc(doc(asTeacher(), `coaching/${LINK}`)));
    await assertSucceeds(getDoc(doc(asStudent(), `coaching/${LINK}`)));
  });

  it('a stranger CANNOT read it', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'pending'));
    await assertFails(getDoc(doc(asOther(), `coaching/${LINK}`)));
    await assertFails(getDoc(doc(asNobody(), `coaching/${LINK}`)));
  });

  it('"my students" query (teacherUid == me) works', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'active'));
    await assertSucceeds(getDocs(query(collection(asTeacher(), 'coaching'),
      where('teacherUid', '==', TEACH))));
  });

  it('"my teachers" query (studentUid == me) works', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'pending'));
    await assertSucceeds(getDocs(query(collection(asStudent(), 'coaching'),
      where('studentUid', '==', STU))));
  });

  it('CANNOT run a query not constrained to me', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'pending'));
    await assertFails(getDocs(collection(asOther(), 'coaching')));
    await assertFails(getDocs(query(collection(asOther(), 'coaching'),
      where('status', '==', 'pending'))));
  });

  it('CANNOT query somebody else\'s students or teachers', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'active'));
    await assertFails(getDocs(query(collection(asOther(), 'coaching'),
      where('teacherUid', '==', TEACH))));
    await assertFails(getDocs(query(collection(asOther(), 'coaching'),
      where('studentUid', '==', STU))));
  });
});

// ═══════════════════════ /coaching — answering ═══════════════════════

const answer = (status) => ({ status, respondedAt: serverTimestamp() });

describe('/coaching — the student answers', () => {
  it('the student CAN accept', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'pending'));
    await assertSucceeds(updateDoc(doc(asStudent(), `coaching/${LINK}`), answer('active')));
  });

  it('the student CAN decline', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'pending'));
    await assertSucceeds(updateDoc(doc(asStudent(), `coaching/${LINK}`), answer('declined')));
  });

  it('the teacher CANNOT accept for the student', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'pending'));
    await assertFails(updateDoc(doc(asTeacher(), `coaching/${LINK}`), answer('active')));
  });

  it('a stranger CANNOT accept', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'pending'));
    await assertFails(updateDoc(doc(asOther(), `coaching/${LINK}`), answer('active')));
  });

  it('accepted → pending again is refused', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'active'));
    await assertFails(updateDoc(doc(asStudent(), `coaching/${LINK}`), answer('pending')));
  });

  it('declined → active later is refused (one answer only)', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'declined'));
    await assertFails(updateDoc(doc(asStudent(), `coaching/${LINK}`), answer('active')));
  });

  it('an unknown status is refused', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'pending'));
    await assertFails(updateDoc(doc(asStudent(), `coaching/${LINK}`), answer('maybe')));
  });

  it('the answer CANNOT move any other field', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'pending'));
    await assertFails(updateDoc(doc(asStudent(), `coaching/${LINK}`),
      { ...answer('active'), teacherUid: OTHER }));
  });

  it('the answer needs the server time', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'pending'));
    await assertFails(updateDoc(doc(asStudent(), `coaching/${LINK}`),
      { status: 'active', respondedAt: Date.now() }));
  });
});

// ═══════════════════════ /coaching — deleting ═══════════════════════

describe('/coaching — deleting', () => {
  it('the teacher CAN withdraw a pending invite', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'pending'));
    await assertSucceeds(deleteDoc(doc(asTeacher(), `coaching/${LINK}`)));
  });

  it('the teacher CAN remove an active student', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'active'));
    await assertSucceeds(deleteDoc(doc(asTeacher(), `coaching/${LINK}`)));
  });

  it('the teacher CANNOT delete a declined link (no pestering by re-inviting)', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'declined'));
    await assertFails(deleteDoc(doc(asTeacher(), `coaching/${LINK}`)));
  });

  for (const status of ['pending', 'active', 'declined']) {
    it(`the student CAN delete a ${status} link`, async () => {
      await seed(`coaching/${LINK}`, storedLink(TEACH, STU, status));
      await assertSucceeds(deleteDoc(doc(asStudent(), `coaching/${LINK}`)));
    });
  }

  it('a stranger CANNOT delete it', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'active'));
    await assertFails(deleteDoc(doc(asOther(), `coaching/${LINK}`)));
  });
});

// ═══════════════════════ /studentReports — writing ═══════════════════════

describe('/studentReports — the consent check', () => {
  it('accept + first summary in ONE batch works (the getAfter case)', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'pending'));
    const fs = asStudent();
    const batch = writeBatch(fs);
    batch.update(doc(fs, `coaching/${LINK}`), answer('active'));
    batch.set(doc(fs, `studentReports/${STU}`), report([TEACH]));
    await assertSucceeds(batch.commit());
  });

  it('a summary naming a teacher with a PENDING link is refused', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'pending'));
    await assertFails(setDoc(doc(asStudent(), `studentReports/${STU}`), report([TEACH])));
  });

  it('a summary naming a teacher with a DECLINED link is refused', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'declined'));
    await assertFails(setDoc(doc(asStudent(), `studentReports/${STU}`), report([TEACH])));
  });

  it('a summary naming a teacher with NO link is refused', async () => {
    await assertFails(setDoc(doc(asStudent(), `studentReports/${STU}`), report([TEACH])));
  });

  it('a summary naming an ACTIVE teacher (outside a batch) is accepted', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'active'));
    await assertSucceeds(setDoc(doc(asStudent(), `studentReports/${STU}`), report([TEACH])));
  });

  it('one good teacher plus one without a link is refused', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'active'));
    await assertFails(setDoc(doc(asStudent(), `studentReports/${STU}`),
      report([TEACH, OTHER])));
  });

  it('3 active teachers are accepted', async () => {
    for (const t of [TEACH, T2, T3]) await seed(`coaching/${linkId(t, STU)}`, storedLink(t, STU, 'active'));
    await assertSucceeds(setDoc(doc(asStudent(), `studentReports/${STU}`),
      report([TEACH, T2, T3])));
  });

  it('4 teachers are refused, even with 4 active links (the enforced cap)', async () => {
    for (const t of [TEACH, T2, T3, T4]) await seed(`coaching/${linkId(t, STU)}`, storedLink(t, STU, 'active'));
    await assertFails(setDoc(doc(asStudent(), `studentReports/${STU}`),
      report([TEACH, T2, T3, T4])));
  });

  it('the same teacher listed twice is refused', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'active'));
    await assertFails(setDoc(doc(asStudent(), `studentReports/${STU}`),
      report([TEACH, TEACH])));
  });

  it('an active link to a DIFFERENT student does not count', async () => {
    await seed(`coaching/${linkId(TEACH, OTHER)}`, storedLink(TEACH, OTHER, 'active'));
    await assertFails(setDoc(doc(asStudent(), `studentReports/${STU}`), report([TEACH])));
  });

  it('a summary with no teacher list at all is refused', async () => {
    const { teachers, ...rest } = report([]);
    await assertFails(setDoc(doc(asStudent(), `studentReports/${STU}`), rest));
  });

  it('"End" in one batch: delete one link, keep the other teacher', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'active'));
    await seed(`coaching/${linkId(T2, STU)}`, storedLink(T2, STU, 'active'));
    await seed(`studentReports/${STU}`, { ...report([TEACH, T2]), updatedAt: 1 });
    const fs = asStudent();
    const batch = writeBatch(fs);
    batch.delete(doc(fs, `coaching/${LINK}`));
    batch.update(doc(fs, `studentReports/${STU}`), { teachers: [T2], updatedAt: serverTimestamp() });
    await assertSucceeds(batch.commit());
  });

  it('"End" that forgets to prune the ended teacher is refused', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'active'));
    await seed(`studentReports/${STU}`, { ...report([TEACH]), updatedAt: 1 });
    const fs = asStudent();
    const batch = writeBatch(fs);
    batch.delete(doc(fs, `coaching/${LINK}`));
    batch.update(doc(fs, `studentReports/${STU}`), { puzzleElo: 1510, updatedAt: serverTimestamp() });
    await assertFails(batch.commit());
  });

  it('"End" of the last teacher in one batch: delete link + delete summary', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'active'));
    await seed(`studentReports/${STU}`, { ...report([TEACH]), updatedAt: 1 });
    const fs = asStudent();
    const batch = writeBatch(fs);
    batch.delete(doc(fs, `coaching/${LINK}`));
    batch.delete(doc(fs, `studentReports/${STU}`));
    await assertSucceeds(batch.commit());
  });

  it('after a teacher removes the student, re-publishing the old list is refused', async () => {
    await seed(`studentReports/${STU}`, { ...report([TEACH]), updatedAt: 1 });
    await assertFails(setDoc(doc(asStudent(), `studentReports/${STU}`), report([TEACH])));
    // … and the pruned list goes through.
    await assertSucceeds(setDoc(doc(asStudent(), `studentReports/${STU}`), report([])));
  });
});

describe('/studentReports — who writes, and what', () => {
  it('the teacher CANNOT write the student\'s summary', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'active'));
    await assertFails(setDoc(doc(asTeacher(), `studentReports/${STU}`), report([TEACH])));
  });

  it('the teacher CANNOT edit an existing summary', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'active'));
    await seed(`studentReports/${STU}`, { ...report([TEACH]), updatedAt: 1 });
    await assertFails(updateDoc(doc(asTeacher(), `studentReports/${STU}`),
      { puzzleElo: 3000, updatedAt: serverTimestamp() }));
  });

  for (const field of ['firstName', 'lastName', 'dateOfBirth', 'email', 'games', 'somethingNew']) {
    it(`'${field}' is refused (not in the allowlist)`, async () => {
      await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'active'));
      await assertFails(setDoc(doc(asStudent(), `studentReports/${STU}`),
        report([TEACH], { [field]: 'x' })));
    });
  }

  it('an out-of-range rating is refused', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'active'));
    await assertFails(setDoc(doc(asStudent(), `studentReports/${STU}`),
      report([TEACH], { puzzleElo: 4001 })));
    await assertFails(setDoc(doc(asStudent(), `studentReports/${STU}`),
      report([TEACH], { endgameEloAvg: -1 })));
  });

  it('a history of 120 entries is accepted, 121 refused', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'active'));
    const hist = (n) => Array.from({ length: n }, (_, i) => ({ date: `d${i}`, value: 1500 }));
    await assertSucceeds(setDoc(doc(asStudent(), `studentReports/${STU}`),
      report([TEACH], { openingEloHistory: hist(120) })));
    await assertFails(setDoc(doc(asStudent(), `studentReports/${STU}`),
      report([TEACH], { openingEloHistory: hist(121) })));
  });

  it('an over-long display name is refused', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'active'));
    await assertFails(setDoc(doc(asStudent(), `studentReports/${STU}`),
      report([TEACH], { profileName: 'x'.repeat(61) })));
  });

  it('a client clock for updatedAt is refused', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'active'));
    await assertFails(setDoc(doc(asStudent(), `studentReports/${STU}`),
      report([TEACH], { updatedAt: Date.now() })));
  });

  it('the stage 3/4 fields are already allowed, and bounded', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'active'));
    await assertSucceeds(setDoc(doc(asStudent(), `studentReports/${STU}`),
      report([TEACH], { activeTime: { '2026-09-29': { puzzles: 600 } }, hwOpen: 2, hwDone: 5 })));
    await assertFails(setDoc(doc(asStudent(), `studentReports/${STU}`),
      report([TEACH], { hwDone: 1001 })));
  });

  it('oversized maps are refused (activeTime > 31 days, puzzleThemeElo > 200 themes)', async () => {
    await seed(`coaching/${LINK}`, storedLink(TEACH, STU, 'active'));
    const map = (n, v) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, v]));
    await assertSucceeds(setDoc(doc(asStudent(), `studentReports/${STU}`),
      report([TEACH], { activeTime: map(31, { puzzles: 60 }), puzzleThemeElo: map(200, 1500) })));
    await assertFails(setDoc(doc(asStudent(), `studentReports/${STU}`),
      report([TEACH], { activeTime: map(32, { puzzles: 60 }) })));
    await assertFails(setDoc(doc(asStudent(), `studentReports/${STU}`),
      report([TEACH], { puzzleThemeElo: map(201, 1500) })));
  });

  it('the student CAN delete their own summary', async () => {
    await seed(`studentReports/${STU}`, { ...report([TEACH]), updatedAt: 1 });
    await assertSucceeds(deleteDoc(doc(asStudent(), `studentReports/${STU}`)));
  });

  it('a listed teacher CANNOT delete the summary', async () => {
    await seed(`studentReports/${STU}`, { ...report([TEACH]), updatedAt: 1 });
    await assertFails(deleteDoc(doc(asTeacher(), `studentReports/${STU}`)));
  });
});

// ═══════════════════════ /studentReports — reading ═══════════════════════

describe('/studentReports — reading', () => {
  it('the student can read their own summary', async () => {
    await seed(`studentReports/${STU}`, { ...report([TEACH]), updatedAt: 1 });
    await assertSucceeds(getDoc(doc(asStudent(), `studentReports/${STU}`)));
  });

  it('the student can check for a summary that does not exist yet', async () => {
    await assertSucceeds(getDoc(doc(asStudent(), `studentReports/${STU}`)));
  });

  it('a listed teacher CAN read it', async () => {
    await seed(`studentReports/${STU}`, { ...report([TEACH]), updatedAt: 1 });
    await assertSucceeds(getDoc(doc(asTeacher(), `studentReports/${STU}`)));
  });

  it('an unlisted user CANNOT read it', async () => {
    await seed(`studentReports/${STU}`, { ...report([TEACH]), updatedAt: 1 });
    await assertFails(getDoc(doc(asOther(), `studentReports/${STU}`)));
    await assertFails(getDoc(doc(asNobody(), `studentReports/${STU}`)));
  });

  it('the teacher overview query (teachers array-contains me) works', async () => {
    await seed(`studentReports/${STU}`, { ...report([TEACH]), updatedAt: 1 });
    await assertSucceeds(getDocs(query(collection(asTeacher(), 'studentReports'),
      where('teachers', 'array-contains', TEACH))));
  });

  it('CANNOT list all summaries, or query for another teacher\'s students', async () => {
    await seed(`studentReports/${STU}`, { ...report([TEACH]), updatedAt: 1 });
    await assertFails(getDocs(collection(asOther(), 'studentReports')));
    await assertFails(getDocs(query(collection(asOther(), 'studentReports'),
      where('teachers', 'array-contains', TEACH))));
  });
});
