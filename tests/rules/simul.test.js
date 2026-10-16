// Rules tests for /simulGames/{teacherUid}_{studentUid} — a teacher plays
// several students at once, one document per board.
//
// Why every clause gets a test: like Pulso, a simul has no server. The rules
// are the referee: the only thing that stops a player moving out of turn,
// rewriting the game, adding time to a clock or writing "I won". They cannot
// check that a move is legal chess; the other phone does that and voids the
// board (spec 3k, "the honest part").
//
// Spec: docs/superpowers/specs/2026-10-11-students-simul-design.md, section
// 3k, the table "Who may do what": one describe() per row.
//
// About time: the emulator's clock cannot be moved, so these tests seed a
// document whose stamps are already in the past, as tests/rules/pulso.test.js
// does. The clock is checked to the millisecond the same way: the stored
// stamps are chosen, and where the server's own time of the write matters it
// is read back from the write that was accepted.
//
// Run with:  npm run test:rules
// Local emulator only. Nothing here touches the real project.

import { before, after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc, collection, query, where, getDoc, getDocs,
  setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore';

const TEACH = 'teach_uid';
const ANA = 'ana_uid';     // the student of the board under test
const LUIS = 'luis_uid';   // invited to the same simul: a classmate
const EVA = 'eva_uid';     // another student of the teacher, NOT invited

const TA = `${TEACH}_${ANA}`;
const G = `simulGames/${TA}`;
const G_LUIS = `simulGames/${TEACH}_${LUIS}`;

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const ago = (ms) => Timestamp.fromMillis(Date.now() - ms);

// What the teacher's phone sends for an invitation, the first one and every
// later one: all 23 fields.
const invite = (over = {}) => ({
  t: TEACH, s: ANA, cls: [ANA, LUIS], status: 'invited',
  invitedAt: serverTimestamp(), startAt: null, at: null, prevAt: null,
  fen: START, op: '', tc: 'w', base: 600, inc: 5, tMs: 600_000, sMs: 600_000,
  mv: '', n: 0, draw: null, tDr: -1, sDr: -1, winner: null, reason: null, by: null,
  ...over,
});

// Documents as they sit in the database, seeded with the rules switched off.
const invited = (over = {}) => invite({ invitedAt: ago(10 * SEC), ...over });
const joined = (over = {}) => invited({ status: 'joined', ...over });
// A game started 30 seconds ago, nobody has moved: the teacher, White, is to
// move with 10 minutes each.
const live = (over = {}) => {
  const t = ago(30 * SEC);
  return invited({ status: 'live', invitedAt: ago(60 * SEC), startAt: t, at: t, prevAt: t, ...over });
};
// The teacher played e2e4 after 30 seconds, 10 seconds ago: the student is to
// move and must settle the teacher's 30 seconds.
const afterOne = (over = {}) => {
  // One reading of the clock for both stamps: they are exactly 30 s apart.
  const t0 = ago(40 * SEC);
  const t1 = Timestamp.fromMillis(t0.toMillis() + 30 * SEC);
  return live({ startAt: t0, prevAt: t0, at: t1, mv: 'e2e4-', n: 1, ...over });
};
const done = (over = {}) => afterOne({ status: 'done', winner: 's', reason: 'resign', ...over });

const link = (status = 'active', s = ANA) => ({ teacherUid: TEACH, studentUid: s, status, createdAt: ago(HOUR) });

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
  return data;
}
async function read(path) {
  let out;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    out = (await getDoc(doc(ctx.firestore(), path))).data();
  });
  return out;
}
const seedLink = (status = 'active') => seed(`coaching/${TA}`, link(status));

const asTeach = () => testEnv.authenticatedContext(TEACH).firestore();
const asAna = () => testEnv.authenticatedContext(ANA).firestore();
const asLuis = () => testEnv.authenticatedContext(LUIS).firestore();
const asEva = () => testEnv.authenticatedContext(EVA).firestore();
const asNobody = () => testEnv.unauthenticatedContext().firestore();

const write = (db, data) => updateDoc(doc(db, G), data);
// A move as js/simul.js moveWrite() shapes it, on top of the stored game.
const move = (old, over = {}, packed = 'e7e5-') => ({
  mv: old.mv + packed, n: old.n + 1, at: serverTimestamp(), prevAt: old.at, ...over,
});

// ═══════════════════════════ 1. Read ═══════════════════════════

describe('/simulGames — reading', () => {
  it('the teacher, the student and a classmate in cls can read the board', async () => {
    await seed(G, live());
    await assertSucceeds(getDoc(doc(asTeach(), G)));
    await assertSucceeds(getDoc(doc(asAna(), G)));
    await assertSucceeds(getDoc(doc(asLuis(), G)));
  });

  it('a student of the same teacher who was NOT invited cannot, nor a visitor', async () => {
    await seed(G, live());
    await assertFails(getDoc(doc(asEva(), G)));
    await assertFails(getDoc(doc(asNobody(), G)));
  });

  it('the three queries the app listens with are each allowed on their own', async () => {
    await seed(G, live());
    await seed(G_LUIS, live({ s: LUIS }));
    const mine = await assertSucceeds(getDocs(query(collection(asTeach(), 'simulGames'), where('t', '==', TEACH))));
    assert.equal(mine.size, 2);
    const hers = await assertSucceeds(getDocs(query(collection(asAna(), 'simulGames'), where('s', '==', ANA))));
    assert.equal(hers.size, 1);
    const cls = await assertSucceeds(getDocs(query(collection(asLuis(), 'simulGames'), where('cls', 'array-contains', LUIS))));
    assert.equal(cls.size, 2);
  });

  it('a query for somebody else\'s boards is REFUSED', async () => {
    await seed(G, live());
    await assertFails(getDocs(query(collection(asEva(), 'simulGames'), where('t', '==', TEACH))));
    await assertFails(getDocs(query(collection(asEva(), 'simulGames'), where('s', '==', ANA))));
    await assertFails(getDocs(query(collection(asEva(), 'simulGames'), where('cls', 'array-contains', LUIS))));
    await assertFails(getDocs(collection(asTeach(), 'simulGames')));
  });
});

// ═════════════════════ 2. Create / re-invite ═════════════════════

describe('/simulGames — the invitation', () => {
  it('a teacher CAN invite a student whose link is active', async () => {
    await seedLink();
    await assertSucceeds(setDoc(doc(asTeach(), G), invite()));
  });

  it('REFUSED with no link, a pending one or a declined one', async () => {
    await assertFails(setDoc(doc(asTeach(), G), invite()));
    await seedLink('pending');
    await assertFails(setDoc(doc(asTeach(), G), invite()));
    await seedLink('declined');
    await assertFails(setDoc(doc(asTeach(), G), invite()));
  });

  it('REFUSED when the link under that id is not this pair\'s', async () => {
    await seed(`coaching/${TA}`, { ...link(), studentUid: EVA });
    await assertFails(setDoc(doc(asTeach(), G), invite()));
  });

  it('only the teacher: the student, a classmate and a visitor cannot', async () => {
    await seedLink();
    await assertFails(setDoc(doc(asAna(), G), invite()));
    await assertFails(setDoc(doc(asAna(), G), invite({ t: ANA })));
    await assertFails(setDoc(doc(asLuis(), G), invite()));
    await assertFails(setDoc(doc(asNobody(), G), invite()));
  });

  it('the id must be teacher_student, and the student is not the teacher', async () => {
    await seedLink();
    await seed(`coaching/${ANA}_${TEACH}`, { teacherUid: ANA, studentUid: TEACH, status: 'active' });
    await seed(`coaching/${TEACH}_${TEACH}`, { teacherUid: TEACH, studentUid: TEACH, status: 'active' });
    await assertFails(setDoc(doc(asTeach(), `simulGames/${ANA}_${TEACH}`), invite()));
    await assertFails(setDoc(doc(asTeach(), 'simulGames/whatever'), invite()));
    await assertFails(setDoc(doc(asTeach(), G), invite({ s: LUIS })));
    await assertFails(setDoc(doc(asTeach(), `simulGames/${TEACH}_${TEACH}`), invite({ s: TEACH, cls: [TEACH] })));
  });

  it('it starts invited, stamped by the server, with no start and no moves', async () => {
    await seedLink();
    const db = asTeach();
    for (const bad of [
      { status: 'joined' }, { status: 'live' }, { status: 'done' },
      { invitedAt: Date.now() }, { invitedAt: ago(5 * MIN) },
      { startAt: serverTimestamp() }, { at: serverTimestamp() }, { prevAt: serverTimestamp() },
      { mv: 'e2e4-' }, { n: 1 }, { draw: 't' }, { tDr: 0 }, { sDr: 0 },
      { winner: 't' }, { reason: 'mate' }, { by: 't' },
    ]) await assertFails(setDoc(doc(db, G), invite(bad)));
  });

  it('exactly the 23 fields: one more or one fewer is refused', async () => {
    await seedLink();
    await assertFails(setDoc(doc(asTeach(), G), invite({ note: 'hi' })));
    const { by, ...noBy } = invite();
    await assertFails(setDoc(doc(asTeach(), G), noBy));
    const { fen, ...noFen } = invite();
    await assertFails(setDoc(doc(asTeach(), G), noFen));
  });

  it('fen is a string of sane length; tc is w or b', async () => {
    await seedLink();
    const db = asTeach();
    await assertFails(setDoc(doc(db, G), invite({ fen: 7 })));
    await assertFails(setDoc(doc(db, G), invite({ fen: '8/8 w - - 0 1' })));
    await assertFails(setDoc(doc(db, G), invite({ fen: START + ' '.repeat(60) })));
    await assertFails(setDoc(doc(db, G), invite({ tc: 'x' })));
    await assertSucceeds(setDoc(doc(db, G), invite({ fen: '4k3/8/8/8/8/8/PPPPPPPP/4K3 w - - 0 1', tc: 'b' })));
  });

  it('op is packed moves, at most 200 characters', async () => {
    await seedLink();
    const db = asTeach();
    await assertFails(setDoc(doc(db, G), invite({ op: 'e2e4' })));
    await assertFails(setDoc(doc(db, G), invite({ op: 'e2e4-e7e9-' })));
    await assertFails(setDoc(doc(db, G), invite({ op: 'e2e4-,e7e5-' })));
    await assertFails(setDoc(doc(db, G), invite({ op: 'e2e4k' })));
    await assertFails(setDoc(doc(db, G), invite({ op: 'g1f3-'.repeat(41) })));
    await assertFails(setDoc(doc(db, G), invite({ op: 40 })));
    await assertSucceeds(setDoc(doc(db, G), invite({ op: 'g1f3-'.repeat(39) + 'e7e8q' })));
  });

  it('cls is a list of at most 10 that names the student', async () => {
    await seedLink();
    const db = asTeach();
    await assertFails(setDoc(doc(db, G), invite({ cls: [LUIS] })));
    await assertFails(setDoc(doc(db, G), invite({ cls: ANA })));
    await assertFails(setDoc(doc(db, G), invite({ cls: [ANA, ...Array.from({ length: 10 }, (_, i) => `s${i}`)] })));
    await assertSucceeds(setDoc(doc(db, G), invite({ cls: [ANA, ...Array.from({ length: 9 }, (_, i) => `s${i}`)] })));
  });

  it('the clock: each of the four controls, or none; nothing else', async () => {
    await seedLink();
    const db = asTeach();
    for (const [base, inc] of [[600, 5], [900, 10], [1800, 20], [3600, 30]]) {
      await testEnv.clearFirestore();
      await seedLink();
      await assertSucceeds(setDoc(doc(db, G), invite({ base, inc, sMs: base * 1000, tMs: base * 1000 })));
    }
    await testEnv.clearFirestore();
    await seedLink();
    for (const [base, inc] of [[600, 10], [300, 5], [0, 5], [600, 0], [600.5, 5], [-600, 5]]) {
      await assertFails(setDoc(doc(db, G), invite({ base, inc, sMs: base * 1000, tMs: base * 1000 })));
    }
    await assertSucceeds(setDoc(doc(db, G), invite({ base: 0, inc: 0, sMs: 0, tMs: 0 })));
  });

  it('the student starts on the control; the teacher on it plus 0 to 60 minutes', async () => {
    await seedLink();
    const db = asTeach();
    await assertFails(setDoc(doc(db, G), invite({ sMs: 600_001 })));
    await assertFails(setDoc(doc(db, G), invite({ sMs: 6_000_000, tMs: 6_000_000 })));
    await assertFails(setDoc(doc(db, G), invite({ tMs: 599_999 })));
    await assertFails(setDoc(doc(db, G), invite({ tMs: 600_000 + HOUR + 1 })));
    await assertFails(setDoc(doc(db, G), invite({ tMs: 600_000.5 })));
    // No clock: no extra time either.
    await assertFails(setDoc(doc(db, G), invite({ base: 0, inc: 0, sMs: 0, tMs: 120_000 })));
    await assertSucceeds(setDoc(doc(db, G), invite({ tMs: 600_000 + HOUR })));
  });
});

describe('/simulGames — a new invitation over an old board', () => {
  it('over a finished game, and over one the student was left out of', async () => {
    await seedLink();
    await seed(G, done());
    await assertSucceeds(setDoc(doc(asTeach(), G), invite()));
    await seed(G, invited({ status: 'out' }));
    await assertSucceeds(setDoc(doc(asTeach(), G), invite({ base: 0, inc: 0, sMs: 0, tMs: 0 })));
    const d = await read(G);
    assert.equal(d.status, 'invited');
    assert.equal(d.mv, '');
    assert.equal(d.winner, null);
  });

  it('NOT over an invitation still waiting, joined or not', async () => {
    await seedLink();
    await seed(G, invited());
    await assertFails(setDoc(doc(asTeach(), G), invite()));
    await seed(G, joined());
    await assertFails(setDoc(doc(asTeach(), G), invite()));
    await seed(G, invited({ invitedAt: ago(9 * MIN + 50 * SEC) }));
    await assertFails(setDoc(doc(asTeach(), G), invite()));
  });

  it('over an invitation older than 10 minutes', async () => {
    await seedLink();
    await seed(G, invited({ invitedAt: ago(10 * MIN + 2 * SEC) }));
    await assertSucceeds(setDoc(doc(asTeach(), G), invite()));
    await seed(G, joined({ invitedAt: ago(11 * MIN) }));
    await assertSucceeds(setDoc(doc(asTeach(), G), invite()));
  });

  it('NOT over a game in play; over one started more than 3 hours ago', async () => {
    await seedLink();
    await seed(G, live());
    await assertFails(setDoc(doc(asTeach(), G), invite()));
    await seed(G, live({ startAt: ago(3 * HOUR - 10 * SEC) }));
    await assertFails(setDoc(doc(asTeach(), G), invite()));
    await seed(G, live({ startAt: ago(3 * HOUR + 2 * SEC) }));
    await assertSucceeds(setDoc(doc(asTeach(), G), invite()));
  });

  it('the link is checked again: REFUSED once the coaching has ended', async () => {
    await seed(G, done());
    await assertFails(setDoc(doc(asTeach(), G), invite()));
    await seedLink('pending');
    await assertFails(setDoc(doc(asTeach(), G), invite()));
  });

  it('the student cannot re-invite, and the board cannot change hands', async () => {
    await seedLink();
    await seed(G, done());
    await assertFails(setDoc(doc(asAna(), G), invite()));
    await assertFails(setDoc(doc(asAna(), G), invite({ t: ANA, s: TEACH })));
    await assertFails(setDoc(doc(asTeach(), G), invite({ s: LUIS })));
    await assertFails(setDoc(doc(asTeach(), G), invite({ status: 'live' })));
    await assertFails(setDoc(doc(asTeach(), G), invite({ note: 'hi' })));
  });
});

// ═══════════════════════ 3. Join / decline ═══════════════════════

describe('/simulGames — the student answers', () => {
  it('the student joins, or says not now', async () => {
    await seed(G, invited());
    await assertSucceeds(write(asAna(), { status: 'joined' }));
    await seed(G, invited());
    await assertSucceeds(write(asAna(), { status: 'out' }));
  });

  it('nobody answers for the student', async () => {
    await seed(G, invited());
    await assertFails(write(asTeach(), { status: 'joined' }));
    await assertFails(write(asLuis(), { status: 'joined' }));
    await assertFails(write(asEva(), { status: 'out' }));
    await assertFails(write(asNobody(), { status: 'joined' }));
  });

  it('REFUSED after the 10 minutes', async () => {
    await seed(G, invited({ invitedAt: ago(10 * MIN + 2 * SEC) }));
    await assertFails(write(asAna(), { status: 'joined' }));
    await assertFails(write(asAna(), { status: 'out' }));
  });

  it('only invited → joined or out, and nothing else moves', async () => {
    await seed(G, invited());
    await assertFails(write(asAna(), { status: 'live' }));
    await assertFails(write(asAna(), { status: 'done' }));
    await assertFails(write(asAna(), { status: 'joined', sMs: 9_000_000 }));
    await assertFails(write(asAna(), { status: 'joined', tc: 'b' }));
    await assertFails(write(asAna(), { status: 'joined', startAt: serverTimestamp() }));
    await seed(G, joined());
    await assertFails(write(asAna(), { status: 'out' }));
    await assertFails(write(asAna(), { status: 'invited' }));
    await seed(G, invited({ status: 'out' }));
    await assertFails(write(asAna(), { status: 'joined' }));
  });
});

// ═══════════════════════════ 4. Start ═══════════════════════════

describe('/simulGames — Start', () => {
  const start = (over = {}) => ({
    status: 'live', startAt: serverTimestamp(), at: serverTimestamp(), prevAt: serverTimestamp(), ...over,
  });

  it('the teacher starts a joined student: live, three stamps from the server', async () => {
    await seed(G, joined());
    await assertSucceeds(write(asTeach(), start()));
    const d = await read(G);
    assert.equal(d.status, 'live');
    assert.ok(d.startAt.isEqual(d.at) && d.at.isEqual(d.prevAt));
    assert.ok(Math.abs(d.startAt.toMillis() - Date.now()) < 5000);
  });

  it('every stamp must be the server\'s: none missing, none from the phone', async () => {
    await seed(G, joined());
    const now = Timestamp.now();
    await assertFails(write(asTeach(), { status: 'live' }));
    await assertFails(write(asTeach(), start({ startAt: now })));
    await assertFails(write(asTeach(), start({ at: ago(5 * MIN) })));
    await assertFails(write(asTeach(), start({ prevAt: ago(5 * MIN) })));
    await assertFails(write(asTeach(), { status: 'live', startAt: serverTimestamp(), at: serverTimestamp() }));
  });

  it('a student who has not joined cannot be started: they are left out', async () => {
    await seed(G, invited());
    await assertFails(write(asTeach(), start()));
    await assertSucceeds(write(asTeach(), { status: 'out' }));
  });

  it('a joined student cannot be left out by Start, nor anything else changed', async () => {
    await seed(G, joined());
    await assertFails(write(asTeach(), { status: 'out' }));
    await assertFails(write(asTeach(), start({ tMs: 9_000_000 })));
    await assertFails(write(asTeach(), start({ fen: '4k3/8/8/8/8/8/8/4K2R w - - 0 1' })));
    await assertFails(write(asTeach(), start({ status: 'done' })));
    await seed(G, invited());
    await assertFails(write(asTeach(), { status: 'out', mv: 'e2e4-' }));
  });

  it('only the teacher starts', async () => {
    await seed(G, joined());
    await assertFails(write(asAna(), start()));
    await assertFails(write(asLuis(), start()));
    await assertFails(write(asNobody(), start()));
  });

  it('REFUSED once the invitation is older than 10 minutes', async () => {
    await seed(G, joined({ invitedAt: ago(10 * MIN + 2 * SEC) }));
    await assertFails(write(asTeach(), start()));
  });
});

// ═══════════════════════════ 5. Move ═══════════════════════════

describe('/simulGames — a move', () => {
  it('the side to move moves: the teacher as White first, then the student', async () => {
    const g0 = await seed(G, live());
    await assertSucceeds(write(asTeach(), move(g0, {}, 'e2e4-')));
    const g1 = await read(G);
    assert.equal(g1.mv, 'e2e4-');
    assert.equal(g1.n, 1);
    assert.ok(g1.prevAt.isEqual(g0.at));
    // The student settles the teacher's first move from the two stamps.
    const tMs = 600_000 - (g1.at.toMillis() - g1.prevAt.toMillis()) + 5000;
    await assertSucceeds(write(asAna(), move(g1, { tMs })));
    assert.equal((await read(G)).tMs, tMs);
  });

  it('NOT out of turn', async () => {
    const g0 = await seed(G, live());
    await assertFails(write(asAna(), move(g0)));
    const g1 = await seed(G, afterOne());
    await assertFails(write(asTeach(), move(g1, { tMs: 575_000 })));
  });

  it('whose turn follows the teacher\'s colour and the length of the opening', async () => {
    // The teacher is Black: the student moves first.
    let g = await seed(G, live({ tc: 'b' }));
    await assertFails(write(asTeach(), move(g)));
    await assertSucceeds(write(asAna(), move(g)));
    // An opening of three moves: Black is to move, and the teacher is White.
    g = await seed(G, live({ op: 'e2e4-e7e5-g1f3-' }));
    await assertFails(write(asTeach(), move(g)));
    await assertSucceeds(write(asAna(), move(g)));
    // An opening of two: White again.
    g = await seed(G, live({ op: 'e2e4-e7e5-' }));
    await assertFails(write(asAna(), move(g)));
    await assertSucceeds(write(asTeach(), move(g)));
  });

  it('nobody else moves: not a classmate who can read it, not a visitor', async () => {
    const g0 = await seed(G, live());
    await assertFails(write(asLuis(), move(g0)));
    await assertFails(write(asEva(), move(g0)));
    await assertFails(write(asNobody(), move(g0)));
  });

  it('only in a live game', async () => {
    for (const g of [invited(), joined(), done(), invited({ status: 'out' })]) {
      await seed(G, g);
      await assertFails(write(asTeach(), { mv: g.mv + 'e2e4-', n: g.n + 1, at: serverTimestamp(), prevAt: g.at }));
      await assertFails(write(asAna(), { mv: g.mv + 'e2e4-', n: g.n + 1, at: serverTimestamp(), prevAt: g.at }));
    }
  });

  it('exactly one move is added, and the count goes up by one', async () => {
    const g = await seed(G, afterOne());
    const ok = { tMs: 575_000 };
    await assertFails(write(asAna(), move(g, { ...ok, n: 3 })));
    await assertFails(write(asAna(), move(g, { ...ok, n: 1 })));
    await assertFails(write(asAna(), move(g, { ...ok, mv: 'e2e4-e7e5-g1f3-', n: 3 })));
    await assertFails(write(asAna(), move(g, { ...ok, mv: 'e2e4-e7e5-g1f3-' })));
    await assertFails(write(asAna(), move(g, { ...ok, mv: 'e2e4-' })));
    await assertFails(write(asAna(), move(g, { ...ok, mv: '' })));
    await assertFails(write(asAna(), move(g, { ...ok, mv: 5 })));
    await assertSucceeds(write(asAna(), move(g, ok)));
  });

  it('the moves already played cannot be changed', async () => {
    const g = await seed(G, afterOne());
    const ok = { tMs: 575_000 };
    await assertFails(write(asAna(), move(g, { ...ok, mv: 'd2d4-e7e5-' })));
    await assertFails(write(asAna(), move(g, { ...ok, mv: 'e7e5-e2e4-' })));
    await assertFails(write(asAna(), move(g, { ...ok, mv: 'e2e4qe7e5-' })));
  });

  it('the move added must be well-formed', async () => {
    const g = await seed(G, afterOne());
    for (const bad of ['e7e9-', 'i7e5-', 'e7e5k', 'e7e5 ', 'E7E5-', 'e7-e5', '-----', 'e7e5']) {
      await assertFails(write(asAna(), { ...move(g, { tMs: 575_000 }), mv: g.mv + bad }));
    }
    await assertSucceeds(write(asAna(), { ...move(g, { tMs: 575_000 }), mv: g.mv + 'e7e8n' }));
  });

  it('stamped by the server, and prevAt is the old stamp', async () => {
    const g = await seed(G, afterOne());
    const ok = { tMs: 575_000 };
    await assertFails(write(asAna(), move(g, { ...ok, at: Timestamp.now() })));
    await assertFails(write(asAna(), move(g, { ...ok, at: g.at })));
    await assertFails(write(asAna(), move(g, { ...ok, prevAt: g.prevAt })));
    await assertFails(write(asAna(), move(g, { ...ok, prevAt: serverTimestamp() })));
    await assertFails(write(asAna(), move(g, { ...ok, prevAt: Timestamp.fromMillis(g.at.toMillis() - 1) })));
    const { prevAt, ...noPrev } = move(g, ok);
    await assertFails(write(asAna(), noPrev));
    const { at, ...noAt } = move(g, ok);
    await assertFails(write(asAna(), noAt));
  });

  it('a move changes nothing but the game: not the start, the players or the control', async () => {
    const g = await seed(G, afterOne());
    const ok = { tMs: 575_000 };
    for (const bad of [
      { fen: '4k3/8/8/8/8/8/8/4K2R w - - 0 1' }, { op: 'e2e4-' }, { tc: 'b' }, { base: 3600 }, { inc: 30 },
      { cls: [ANA] }, { s: LUIS }, { t: ANA }, { startAt: serverTimestamp() }, { invitedAt: serverTimestamp() },
      { sDr: 0 }, { tDr: 0 }, { by: 's' }, { note: 'hi' },
    ]) await assertFails(write(asAna(), move(g, { ...ok, ...bad })));
  });

  it('a game of 200 moves: the 201st is taken, and the 200 before it are still held', async () => {
    const mv = 'g1f3-g8f6-f3g1-f6g8-'.repeat(50);
    const g = await seed(G, live({ mv, n: 200, base: 0, inc: 0, tMs: 0, sMs: 0 }));
    assert.equal(mv.length, 1000);
    await assertFails(write(asTeach(), { ...move(g), mv: 'g1f3-g8f6-f3g1-f6g8-'.repeat(49) + 'g1f3-g8f6-f3g1-f6g7-' + 'e2e4-' }));
    await assertSucceeds(write(asTeach(), move(g, {}, 'e2e4-')));
    assert.equal((await read(G)).mv.length, 1005);
  });
});

describe('/simulGames — the clock on a move', () => {
  it('the first move of a game settles nothing: both stored times stay', async () => {
    const g = await seed(G, live());
    await assertFails(write(asTeach(), move(g, { sMs: 600_001 })));
    await assertFails(write(asTeach(), move(g, { sMs: 599_999 })));
    await assertFails(write(asTeach(), move(g, { tMs: 600_001 })));
    await assertFails(write(asTeach(), move(g, { tMs: 570_000 })));
    await assertSucceeds(write(asTeach(), move(g)));
  });

  it('the next move settles the last one exactly: old - (at - prevAt) + increment', async () => {
    // The teacher took 30 s: 600 - 30 + 5 = 575 s.
    const g = await seed(G, afterOne());
    await assertFails(write(asAna(), move(g)));                       // left as it was
    await assertFails(write(asAna(), move(g, { tMs: 575_001 })));     // 1 ms generous
    await assertFails(write(asAna(), move(g, { tMs: 574_999 })));     // 1 ms mean
    await assertFails(write(asAna(), move(g, { tMs: 570_000 })));     // no increment
    await assertFails(write(asAna(), move(g, { tMs: 605_000 })));     // increment, no time
    await assertSucceeds(write(asAna(), move(g, { tMs: 575_000 })));
  });

  it('the mover cannot touch their own time, by 1 ms either way', async () => {
    const g = await seed(G, afterOne());
    await assertFails(write(asAna(), move(g, { tMs: 575_000, sMs: 600_001 })));
    await assertFails(write(asAna(), move(g, { tMs: 575_000, sMs: 599_999 })));
    await assertFails(write(asAna(), move(g, { tMs: 575_000, sMs: 3_600_000 })));
  });

  it('the teacher settles the student the same way', async () => {
    const t0 = ago(100 * SEC);
    // e2e4 at +20 s, e7e5 at +65 s: the student took 45 s. 600 - 45 + 5 = 560.
    const g = await seed(G, live({
      startAt: t0, mv: 'e2e4-e7e5-', n: 2,
      prevAt: Timestamp.fromMillis(t0.toMillis() + 20 * SEC), at: Timestamp.fromMillis(t0.toMillis() + 65 * SEC),
      tMs: 585_000, sMs: 600_000,
    }));
    await assertFails(write(asTeach(), move(g, { sMs: 560_001 })));
    await assertFails(write(asTeach(), move(g, { sMs: 559_999 })));
    await assertFails(write(asTeach(), move(g, { sMs: 560_000, tMs: 585_001 })));
    await assertSucceeds(write(asTeach(), move(g, { sMs: 560_000 })));
  });

  it('stamps finer than a millisecond: the rule cuts them as the phone does', async () => {
    // 9,623.998 ms apart; cut to whole milliseconds first, 123 - (-9500) = 9,623.
    const sec = Math.floor(Date.now() / 1000) - 20;
    const at = new Timestamp(sec, 123_999_000);
    const prevAt = new Timestamp(sec - 10, 500_001_000);
    // The SDK's own toMillis() does NOT cut: it would settle with a fraction,
    // which the rule (whole numbers) can never equal. js/firebase.js cuts.
    assert.equal(at.toMillis() - prevAt.toMillis(), 9623.998046875);
    const g = await seed(G, afterOne({ at, prevAt, startAt: prevAt }));
    await assertFails(write(asAna(), move(g, { tMs: 600_000 - 9624 + 5000 })));
    await assertSucceeds(write(asAna(), move(g, { tMs: 600_000 - 9623 + 5000 })));
  });

  it('no clock: both times stay at 0 whatever the stamps say', async () => {
    const g = await seed(G, afterOne({ base: 0, inc: 0, tMs: 0, sMs: 0 }));
    await assertFails(write(asAna(), move(g, { tMs: -25_000 })));
    await assertFails(write(asAna(), move(g, { tMs: 1 })));
    await assertFails(write(asAna(), move(g, { sMs: 1 })));
    await assertSucceeds(write(asAna(), move(g)));
  });

  it('no clock: a move a day later is still a move', async () => {
    const t = ago(24 * HOUR);
    const g = await seed(G, live({ base: 0, inc: 0, tMs: 0, sMs: 0, startAt: t, at: t, prevAt: t }));
    await assertSucceeds(write(asTeach(), move(g)));
  });

  it('a move at or after the instant the time runs out is REFUSED', async () => {
    // The last stamp is 60 s old and the mover has exactly that, or less.
    const T = Date.now() - 60 * SEC;
    const at = Timestamp.fromMillis(T);
    let g = await seed(G, live({ at, prevAt: at, startAt: at, tMs: Date.now() - T }));
    await assertFails(write(asTeach(), move(g)));
    g = await seed(G, live({ at, prevAt: at, startAt: at, tMs: 59_000 }));
    await assertFails(write(asTeach(), move(g)));
    g = await seed(G, live({ at, prevAt: at, startAt: at, tMs: 1 }));
    await assertFails(write(asTeach(), move(g)));
  });

  it('…and it is the MOVER\'s time that counts, not the other side\'s', async () => {
    const at = ago(60 * SEC);
    const g = await seed(G, live({ at, prevAt: at, startAt: at, tMs: 600_000, sMs: 1 }));
    await assertSucceeds(write(asTeach(), move(g)));
  });

  it('in time to the millisecond: 1 ms inside is taken, and nothing at or past the limit ever is', async () => {
    // The server's time of a write is not ours to choose, so aim: give the
    // mover (elapsed so far + the delay last measured + 1) ms and read the
    // server's stamp back from each write that was taken.
    const T = Date.now() - 60 * SEC;
    const at = Timestamp.fromMillis(T);
    let delay = 4, taken = 0, refused = 0, closest = Infinity;
    for (let i = 0; i < 400 && closest !== 1; i++) {
      const sent = Date.now();
      const tMs = sent - T + delay + 1;
      const g = await seed(G, live({ at, prevAt: at, startAt: at, tMs }));
      const before = Date.now();
      try {
        await write(asTeach(), move(g));
      } catch (e) {
        assert.equal(e.code, 'permission-denied');
        // A refusal is only right if the write could have reached the limit.
        assert.ok(Date.now() - T >= tMs, 'refused a move that was inside its time');
        refused++;
        delay++;
        continue;
      }
      const elapsed = (await read(G)).at.toMillis() - T;
      assert.ok(elapsed < tMs, `took a move ${elapsed - tMs} ms past the limit`);
      taken++;
      closest = Math.min(closest, tMs - elapsed);
      delay = Math.max(0, elapsed - (before - T));
    }
    assert.equal(closest, 1, `no write landed 1 ms inside (${taken} taken, ${refused} refused, closest ${closest} ms)`);
  });
});

describe('/simulGames — a move and a draw offer', () => {
  it('the other side\'s offer falls when I move; leaving it standing is refused', async () => {
    const g = await seed(G, afterOne({ draw: 't', tDr: 1 }));
    await assertFails(write(asAna(), move(g, { tMs: 575_000 })));
    await assertFails(write(asAna(), move(g, { tMs: 575_000, draw: 's' })));
    await assertSucceeds(write(asAna(), move(g, { tMs: 575_000, draw: null })));
  });

  it('my own offer stands when I move; I cannot make one with a move', async () => {
    let g = await seed(G, afterOne({ draw: 's', sDr: 1 }));
    await assertFails(write(asAna(), move(g, { tMs: 575_000, draw: null })));
    await assertSucceeds(write(asAna(), move(g, { tMs: 575_000 })));
    g = await seed(G, afterOne());
    await assertFails(write(asAna(), move(g, { tMs: 575_000, draw: 's' })));
    await assertFails(write(asAna(), move(g, { tMs: 575_000, draw: 't' })));
  });
});

describe('/simulGames — a move that ends the game', () => {
  const ok = { tMs: 575_000, status: 'done' };

  it('mate: the mover wins', async () => {
    const g = await seed(G, afterOne());
    await assertSucceeds(write(asAna(), move(g, { ...ok, winner: 's', reason: 'mate' })));
  });

  it('the automatic draws', async () => {
    for (const reason of ['stalemate', 'repetition', 'fifty', 'material']) {
      const g = await seed(G, afterOne());
      await assertSucceeds(write(asAna(), move(g, { ...ok, winner: 'draw', reason })));
    }
  });

  it('a mover cannot touch the result in any other way', async () => {
    const g = await seed(G, afterOne());
    for (const bad of [
      { winner: 't', reason: 'mate' },        // mated by my own move
      { winner: 'draw', reason: 'mate' },
      { winner: 's', reason: 'stalemate' },   // a win called a draw's name
      { winner: 's', reason: 'resign' },      // the other side "resigning" on my move
      { winner: 's', reason: 'flag' },
      { winner: 'draw', reason: 'agreed' },
      { winner: null, reason: 'void' },
      { winner: null, reason: 'unfinished' },
      { winner: 's', reason: null },
      { winner: null, reason: null },
      { winner: 's', reason: 'mate', by: 's' },
    ]) await assertFails(write(asAna(), move(g, { ...ok, ...bad })));
    // …and a result with the game still going.
    await assertFails(write(asAna(), move(g, { tMs: 575_000, winner: 's' })));
    await assertFails(write(asAna(), move(g, { tMs: 575_000, reason: 'mate' })));
    await assertFails(write(asAna(), move(g, { tMs: 575_000, status: 'out' })));
    await assertFails(write(asAna(), move(g, { tMs: 575_000, status: 'invited' })));
  });

  it('the ending move is still a move: its turn, its time, its clock', async () => {
    const g = await seed(G, afterOne());
    await assertFails(write(asTeach(), move(g, { ...ok, winner: 't', reason: 'mate' })));
    await assertFails(write(asAna(), move(g, { status: 'done', winner: 's', reason: 'mate' })));
    await assertFails(write(asAna(), { status: 'done', winner: 's', reason: 'mate' }));
  });
});

// ═══════════════════════ 6. Draw offers ═══════════════════════

describe('/simulGames — draw offer, accept, decline', () => {
  it('either player offers, on their turn or not', async () => {
    await seed(G, afterOne());
    await assertSucceeds(write(asTeach(), { draw: 't', tDr: 1 }));
    await seed(G, afterOne());
    await assertSucceeds(write(asAna(), { draw: 's', sDr: 1 }));
  });

  it('the offer is mine, and it records the move count as it stands', async () => {
    await seed(G, afterOne());
    await assertFails(write(asTeach(), { draw: 's', sDr: 1 }));
    await assertFails(write(asTeach(), { draw: 't', sDr: 1 }));
    await assertFails(write(asTeach(), { draw: 't' }));
    await assertFails(write(asTeach(), { draw: 't', tDr: 0 }));
    await assertFails(write(asTeach(), { draw: 't', tDr: -1 }));
    await assertFails(write(asTeach(), { draw: 't', tDr: 1, sDr: 1 }));
    await assertFails(write(asTeach(), { draw: 't', tDr: 1, tMs: 900_000 }));
    await assertFails(write(asTeach(), { tDr: -1 }));
  });

  it('not while an offer is standing, mine or theirs', async () => {
    await seed(G, afterOne({ draw: 's', sDr: 1 }));
    await assertFails(write(asTeach(), { draw: 't', tDr: 1 }));
    await seed(G, afterOne({ draw: 't', tDr: 0 }));
    await assertFails(write(asTeach(), { draw: 't', tDr: 1 }));
  });

  it('one offer per player per 10 moves by each side', async () => {
    const at = (n, over) => afterOne({ mv: 'g1f3-'.repeat(n), n, ...over });
    await seed(G, at(29, { tDr: 10 }));     // 19 single moves since
    await assertFails(write(asTeach(), { draw: 't', tDr: 29 }));
    await seed(G, at(30, { tDr: 10 }));     // 20
    await assertSucceeds(write(asTeach(), { draw: 't', tDr: 30 }));
    // The limit is each player's own.
    await seed(G, at(12, { tDr: 10 }));
    await assertFails(write(asTeach(), { draw: 't', tDr: 12 }));
    await assertSucceeds(write(asAna(), { draw: 's', sDr: 12 }));
  });

  it('the other side accepts: a draw, agreed', async () => {
    await seed(G, afterOne({ draw: 't', tDr: 1 }));
    await assertSucceeds(write(asAna(), { status: 'done', winner: 'draw', reason: 'agreed' }));
    await seed(G, afterOne({ draw: 's', sDr: 1 }));
    await assertSucceeds(write(asTeach(), { status: 'done', winner: 'draw', reason: 'agreed' }));
  });

  it('NOT my own offer, and not an offer nobody made', async () => {
    await seed(G, afterOne({ draw: 't', tDr: 1 }));
    await assertFails(write(asTeach(), { status: 'done', winner: 'draw', reason: 'agreed' }));
    await seed(G, afterOne());
    await assertFails(write(asAna(), { status: 'done', winner: 'draw', reason: 'agreed' }));
    await assertFails(write(asTeach(), { status: 'done', winner: 'draw', reason: 'agreed' }));
  });

  it('an accept is a draw and nothing else', async () => {
    await seed(G, afterOne({ draw: 't', tDr: 1 }));
    await assertFails(write(asAna(), { status: 'done', winner: 's', reason: 'agreed' }));
    await assertFails(write(asAna(), { status: 'done', winner: 'draw', reason: 'agreed', sMs: 1 }));
  });

  it('the other side declines; the offerer cannot take it back', async () => {
    await seed(G, afterOne({ draw: 't', tDr: 1 }));
    await assertFails(write(asTeach(), { draw: null }));
    await assertFails(write(asAna(), { draw: null, tDr: -1 }));
    await assertSucceeds(write(asAna(), { draw: null }));
    // Declined, and the teacher cannot simply offer again.
    await assertFails(write(asTeach(), { draw: 't', tDr: 1 }));
  });

  it('nobody outside the game, and never outside a live one', async () => {
    await seed(G, afterOne({ draw: 't', tDr: 1 }));
    await assertFails(write(asLuis(), { draw: null }));
    await assertFails(write(asLuis(), { status: 'done', winner: 'draw', reason: 'agreed' }));
    await seed(G, joined());
    await assertFails(write(asAna(), { draw: 's', sDr: 0 }));
    await seed(G, done());
    await assertFails(write(asAna(), { draw: 's', sDr: 1 }));
  });
});

// ═══════════════════════════ 7. Resign ═══════════════════════════

describe('/simulGames — resigning', () => {
  const resign = (winner) => ({ status: 'done', winner, reason: 'resign' });

  it('either player, on their turn or not: the other one wins', async () => {
    await seed(G, afterOne());
    await assertSucceeds(write(asTeach(), resign('s')));
    await seed(G, afterOne());
    await assertSucceeds(write(asAna(), resign('t')));
  });

  it('you can only resign yourself', async () => {
    await seed(G, afterOne());
    await assertFails(write(asTeach(), resign('t')));
    await assertFails(write(asAna(), resign('s')));
    await assertFails(write(asAna(), resign('draw')));
    await assertFails(write(asAna(), resign(null)));
    await assertFails(write(asLuis(), resign('t')));
    await assertFails(write(asLuis(), resign('s')));
  });

  it('nothing else moves with it, and only a live game can be resigned', async () => {
    await seed(G, afterOne());
    await assertFails(write(asAna(), { ...resign('t'), mv: '' }));
    await assertFails(write(asAna(), { ...resign('t'), by: 's' }));
    for (const g of [invited(), joined(), done()]) {
      await seed(G, g);
      await assertFails(write(asAna(), resign('t')));
    }
  });
});

// ═══════════════════════════ 8. Flag ═══════════════════════════

describe('/simulGames — the flag', () => {
  const flag = (winner) => ({ status: 'done', winner, reason: 'flag' });
  // The student is to move, has 5 s on the clock, and the last move is 10 s old.
  const out = (over = {}) => afterOne({ sMs: 5000, ...over });

  it('the side to move is out of time: either player may claim it', async () => {
    await seed(G, out());
    await assertSucceeds(write(asTeach(), flag('t')));
    await seed(G, out());
    await assertSucceeds(write(asAna(), flag('t')));   // the loser's own phone
  });

  it('from the exact instant the time is used up', async () => {
    const T = Date.now() - 60 * SEC;
    await seed(G, out({ at: Timestamp.fromMillis(T), sMs: Date.now() - T }));
    await assertSucceeds(write(asTeach(), flag('t')));
  });

  it('NOT while there is time left', async () => {
    await seed(G, out({ sMs: 15_000 }));
    await assertFails(write(asTeach(), flag('t')));
    await assertFails(write(asAna(), flag('t')));
  });

  it('the side to move never wins on its own flag', async () => {
    await seed(G, out());
    await assertFails(write(asTeach(), flag('s')));
    await assertFails(write(asAna(), flag('s')));
    // The teacher's stored time is tiny, but it is not the teacher's turn.
    await seed(G, afterOne({ tMs: 1 }));
    await assertFails(write(asAna(), flag('s')));
    await assertFails(write(asAna(), flag('draw')));
  });

  // Adrian, 2026-10-15: a draw when the side with time cannot mate. The rules
  // cannot run chess, so they trust the phone on that, as they do for a mate.
  it('a draw on the flag: from either player, only once the time is used up', async () => {
    await seed(G, out());
    await assertSucceeds(write(asTeach(), flag('draw')));
    await seed(G, out());
    await assertSucceeds(write(asAna(), flag('draw')));   // the side that ran out
    await seed(G, out({ sMs: 15_000 }));
    await assertFails(write(asTeach(), flag('draw')));
    await assertFails(write(asAna(), flag('draw')));
    await seed(G, out({ base: 0, inc: 0, tMs: 0, sMs: 0 }));
    await assertFails(write(asAna(), flag('draw')));
    await seed(G, out());
    await assertFails(write(asLuis(), flag('draw')));
    await assertFails(write(asAna(), { ...flag('draw'), by: 's' }));
  });

  it('never without a clock, never by a classmate, nothing else with it', async () => {
    await seed(G, out({ base: 0, inc: 0, tMs: 0, sMs: 0 }));
    await assertFails(write(asTeach(), flag('t')));
    await seed(G, out());
    await assertFails(write(asLuis(), flag('t')));
    await assertFails(write(asTeach(), { ...flag('t'), tMs: 1 }));
    await assertFails(write(asTeach(), { ...flag('t'), by: 't' }));
  });
});

// ═══════════════════════════ 9. Void ═══════════════════════════

describe('/simulGames — voiding a board', () => {
  const voided = (by) => ({ status: 'done', reason: 'void', by });

  it('either player; who did it is recorded and nobody wins', async () => {
    await seed(G, afterOne());
    await assertSucceeds(write(asAna(), voided('s')));
    const d = await read(G);
    assert.deepEqual([d.status, d.winner, d.reason, d.by], ['done', null, 'void', 's']);
    await seed(G, afterOne());
    await assertSucceeds(write(asTeach(), voided('t')));
  });

  it('the record cannot name the other player, or nobody', async () => {
    await seed(G, afterOne());
    await assertFails(write(asAna(), voided('t')));
    await assertFails(write(asTeach(), voided('s')));
    await assertFails(write(asAna(), voided(null)));
    await assertFails(write(asAna(), { status: 'done', reason: 'void' }));
  });

  it('nobody gains a win from it', async () => {
    await seed(G, afterOne());
    await assertFails(write(asAna(), { ...voided('s'), winner: 's' }));
    await assertFails(write(asAna(), { ...voided('s'), winner: 'draw' }));
    await assertFails(write(asAna(), { ...voided('s'), mv: '' }));
  });

  it('only the two players, only a live game', async () => {
    await seed(G, afterOne());
    await assertFails(write(asLuis(), voided('s')));
    await assertFails(write(asLuis(), voided('t')));
    await seed(G, done());
    await assertFails(write(asAna(), voided('s')));
    await seed(G, joined());
    await assertFails(write(asAna(), voided('s')));
  });
});

// A game that a move ended, on a board that does not show it (spec 3k: "a false
// checkmate is caught the same way").
describe('/simulGames — voiding a game a move ended', () => {
  const unmate = (by) => ({ reason: 'void', winner: null, by });
  // The teacher, White, "mated" with the first move: the student is the one
  // who did not make it.
  const mated = (over = {}) => afterOne({ status: 'done', winner: 't', reason: 'mate', ...over });

  it('the player who did NOT make the last move; the winner goes, who did it is recorded', async () => {
    await seed(G, mated());
    await assertSucceeds(write(asAna(), unmate('s')));
    const d = await read(G);
    assert.deepEqual([d.status, d.winner, d.reason, d.by, d.mv], ['done', null, 'void', 's', 'e2e4-']);
  });

  it('the automatic draws too', async () => {
    for (const reason of ['stalemate', 'repetition', 'fifty', 'material']) {
      await seed(G, mated({ winner: 'draw', reason }));
      await assertSucceeds(write(asAna(), unmate('s')));
    }
  });

  it('not the player who made the move, and not a classmate', async () => {
    await seed(G, mated());
    await assertFails(write(asTeach(), unmate('t')));
    await assertFails(write(asLuis(), unmate('s')));
  });

  it('nobody gains a win from it, and nothing else changes', async () => {
    await seed(G, mated());
    await assertFails(write(asAna(), { reason: 'void', by: 's' }));
    await assertFails(write(asAna(), { reason: 'void', winner: 's', by: 's' }));
    await assertFails(write(asAna(), { reason: 'void', winner: 'draw', by: 's' }));
    await assertFails(write(asAna(), unmate('t')));
    await assertFails(write(asAna(), unmate(null)));
    await assertFails(write(asAna(), { ...unmate('s'), mv: '' }));
    await assertFails(write(asAna(), { ...unmate('s'), status: 'live' }));
    await assertFails(write(asAna(), { reason: 'resign', winner: null, by: 's' }));
  });

  it('only an ending a move made: not a resignation, a draw agreed, a flag, a void or "not finished"', async () => {
    for (const [reason, winner] of [['resign', 't'], ['agreed', 'draw'], ['flag', 't'], ['void', null], ['unfinished', null]]) {
      await seed(G, mated({ winner, reason }));
      await assertFails(write(asAna(), unmate('s')));
    }
  });
});

// ═══════════════════════ 10. End simul ═══════════════════════

describe('/simulGames — the teacher ends the simul', () => {
  const end = { status: 'done', reason: 'unfinished' };

  it('a board still open is recorded not finished, with no winner', async () => {
    await seed(G, afterOne());
    await assertSucceeds(write(asTeach(), end));
    const d = await read(G);
    assert.deepEqual([d.status, d.winner, d.reason, d.by], ['done', null, 'unfinished', null]);
  });

  it('only the teacher', async () => {
    await seed(G, afterOne());
    await assertFails(write(asAna(), end));
    await assertFails(write(asLuis(), end));
  });

  it('no winner, and a finished board keeps its result', async () => {
    await seed(G, afterOne());
    await assertFails(write(asTeach(), { ...end, winner: 't' }));
    await assertFails(write(asTeach(), { ...end, winner: 'draw' }));
    await assertFails(write(asTeach(), { ...end, by: 't' }));
    await seed(G, done());
    await assertFails(write(asTeach(), end));
  });
});

describe('/simulGames — after the result', () => {
  it('nothing more can be written to a finished game', async () => {
    const g = await seed(G, done());
    await assertFails(write(asTeach(), move(g, { tMs: 575_000 })));
    await assertFails(write(asAna(), move(g, { tMs: 575_000 })));
    await assertFails(write(asAna(), { winner: 's' }));
    await assertFails(write(asTeach(), { winner: 't', reason: 'mate' }));
    await assertFails(write(asTeach(), { status: 'live' }));
    await assertFails(write(asAna(), { status: 'done', reason: 'void', by: 's' }));
  });

  it('a live game cannot be put back to the waiting room', async () => {
    await seed(G, afterOne());
    await assertFails(write(asTeach(), { status: 'joined' }));
    await assertFails(write(asTeach(), { status: 'invited' }));
    await assertFails(write(asTeach(), { status: 'out' }));
    await assertFails(write(asAna(), { status: 'out' }));
  });
});

// ═══════════════════════════ 11. Delete ═══════════════════════════

describe('/simulGames — deleting', () => {
  it('the teacher or the student, whenever no game is in play', async () => {
    for (const g of [invited(), joined(), done(), invited({ status: 'out' })]) {
      await seed(G, g);
      await assertSucceeds(deleteDoc(doc(asTeach(), G)));
      await seed(G, g);
      await assertSucceeds(deleteDoc(doc(asAna(), G)));
    }
  });

  it('NEVER while live', async () => {
    await seed(G, afterOne());
    await assertFails(deleteDoc(doc(asTeach(), G)));
    await assertFails(deleteDoc(doc(asAna(), G)));
  });

  it('nobody else', async () => {
    await seed(G, done());
    await assertFails(deleteDoc(doc(asLuis(), G)));
    await assertFails(deleteDoc(doc(asEva(), G)));
    await assertFails(deleteDoc(doc(asNobody(), G)));
  });
});
