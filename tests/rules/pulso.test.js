// Rules tests for /pulso/{pairId} — the live 1-v-1 puzzle tug-of-war.
//
// Why every clause gets a test: Pulso has no server. There is no Cloud
// Function watching a match, so firestore.rules IS the referee — it is the
// only thing that stops a player writing "I solved 60" or "I won". A hole here
// is not a privacy leak, it is a cheat that works.
//
// Spec: docs/superpowers/plans/2026-10-pulso.md, section 5, points 1 to 8.
//
// About time: the emulator's clock cannot be moved. Every time-based rule
// compares request.time (the real "now") with a timestamp STORED in the
// document, so these tests seed a document whose invitedAt / startAt is
// already in the past ("the match started 200 seconds ago") instead of
// waiting. That exercises exactly the same comparison.
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
  setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore';

// Sorted ascending on purpose: ALICE is members[0] = player "a" (aS aM aK aP,
// tally aW), BOB is members[1] = player "b".
const ALICE = 'alice_uid';
const BOB = 'bob_uid';
const CAROL = 'carol_uid';

const AB = `${ALICE}_${BOB}`;
const BA = `${BOB}_${ALICE}`;
const AC = `${ALICE}_${CAROL}`;
const P = `pulso/${AB}`;

// 60 five-character puzzle ids, nothing between them.
const PZ = 'a1B2c'.repeat(60);

const SEC = 1000;
const MIN = 60 * SEC;
const ago = (ms) => Timestamp.fromMillis(Date.now() - ms);

const ZERO = { aS: 0, aM: 0, aK: 0, aP: 0, bS: 0, bM: 0, bK: 0, bP: 0 };

// What a phone sends for a challenge: the first one (with members and an empty
// tally, see firstChallenge) and every later one (these fields only).
const challenge = (host, over = {}) => ({
  status: 'invited', host, invitedAt: serverTimestamp(), startAt: null, pz: PZ,
  ...ZERO, winner: null, reason: null, ...over,
});
const firstChallenge = (host, over = {}) => ({
  members: [ALICE, BOB], ...challenge(host), aW: 0, bW: 0, dr: 0, ...over,
});

// Documents as they sit in the database, seeded with the rules switched off.
const stored = (over = {}) => ({
  members: [ALICE, BOB], status: 'idle', host: ALICE, invitedAt: ago(10 * MIN),
  startAt: null, pz: PZ, ...ZERO, winner: null, reason: null,
  aW: 0, bW: 0, dr: 0, ...over,
});
const invited = (over = {}) => stored({ status: 'invited', invitedAt: ago(10 * SEC), ...over });
// A match one minute in: play began 54 seconds ago and has 2 minutes left.
const live = (over = {}) => stored({
  status: 'live', invitedAt: ago(70 * SEC), startAt: ago(60 * SEC), ...over,
});
// A match whose clock (and the 3 seconds of grace) ran out.
const timeUp = (over = {}) => live({ startAt: ago(200 * SEC), ...over });
const finished = (over = {}) => stored({
  status: 'done', startAt: ago(5 * MIN), winner: ALICE, reason: 'pull',
  aS: 10, aK: 10, aP: 10, aW: 1, ...over,
});

const friendship = (a, b) => ({ members: [a, b], createdAt: 1755000000000 });

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
const seedFriends = () => seed(`friendships/${AB}`, friendship(ALICE, BOB));

const asAlice = () => testEnv.authenticatedContext(ALICE).firestore();
const asBob = () => testEnv.authenticatedContext(BOB).firestore();
const asCarol = () => testEnv.authenticatedContext(CAROL).firestore();
const asNobody = () => testEnv.unauthenticatedContext().firestore();

const write = (db, data) => updateDoc(doc(db, P), data);

// ═══════════════════════════ 1. Read ═══════════════════════════

describe('/pulso — reading', () => {
  it('a member can read the match', async () => {
    await seed(P, live());
    await assertSucceeds(getDoc(doc(asAlice(), P)));
    await assertSucceeds(getDoc(doc(asBob(), P)));
  });

  it('a stranger CANNOT read it', async () => {
    await seed(P, live());
    await assertFails(getDoc(doc(asCarol(), P)));
  });

  it('a signed-out visitor CANNOT read it', async () => {
    await seed(P, live());
    await assertFails(getDoc(doc(asNobody(), P)));
  });

  it('the app\'s listener query (members array-contains me) is allowed', async () => {
    await seed(P, live());
    await assertSucceeds(getDocs(query(
      collection(asAlice(), 'pulso'), where('members', 'array-contains', ALICE))));
  });

  it('a query for somebody else\'s matches is REFUSED', async () => {
    await seed(P, live());
    await assertFails(getDocs(query(
      collection(asCarol(), 'pulso'), where('members', 'array-contains', ALICE))));
    await assertFails(getDocs(collection(asAlice(), 'pulso')));
  });
});

// ════════════════ 2. Create (the first challenge ever) ════════════════

describe('/pulso — the first challenge between two friends', () => {
  it('a friend CAN create it', async () => {
    await seedFriends();
    await assertSucceeds(setDoc(doc(asAlice(), P), firstChallenge(ALICE)));
  });

  it('so can the friend who sorts second', async () => {
    await seedFriends();
    await assertSucceeds(setDoc(doc(asBob(), P), firstChallenge(BOB)));
  });

  it('a stranger CANNOT create a match between two other people', async () => {
    await seedFriends();
    await assertFails(setDoc(doc(asCarol(), P), firstChallenge(CAROL)));
    await assertFails(setDoc(doc(asCarol(), P), firstChallenge(ALICE)));
  });

  it('a signed-out visitor CANNOT create one', async () => {
    await seedFriends();
    await assertFails(setDoc(doc(asNobody(), P), firstChallenge(ALICE)));
  });

  it('a non-friend CANNOT create one', async () => {
    // Alice and Carol have no friendship document.
    await assertFails(setDoc(doc(asAlice(), `pulso/${AC}`),
      firstChallenge(ALICE, { members: [ALICE, CAROL] })));
    // …and neither do Alice and Bob in this test.
    await assertFails(setDoc(doc(asAlice(), P), firstChallenge(ALICE)));
  });

  it('the id must be the two members, sorted', async () => {
    await seedFriends();
    await assertFails(setDoc(doc(asAlice(), `pulso/${BA}`), firstChallenge(ALICE)));
    await assertFails(setDoc(doc(asAlice(), `pulso/${BA}`),
      firstChallenge(ALICE, { members: [BOB, ALICE] })));
    await assertFails(setDoc(doc(asAlice(), 'pulso/whatever'), firstChallenge(ALICE)));
  });

  it('it must start as "invited"', async () => {
    await seedFriends();
    await assertFails(setDoc(doc(asAlice(), P), firstChallenge(ALICE, { status: 'live' })));
    await assertFails(setDoc(doc(asAlice(), P), firstChallenge(ALICE, { status: 'done' })));
  });

  it('the host must be the person writing', async () => {
    await seedFriends();
    await assertFails(setDoc(doc(asAlice(), P), firstChallenge(BOB)));
  });

  it('invitedAt must be the server\'s time, not the phone\'s', async () => {
    await seedFriends();
    await assertFails(setDoc(doc(asAlice(), P), firstChallenge(ALICE, { invitedAt: Date.now() })));
    await assertFails(setDoc(doc(asAlice(), P), firstChallenge(ALICE, { invitedAt: ago(10 * MIN) })));
  });

  it('pz that is not exactly 300 letters/digits is REFUSED', async () => {
    await seedFriends();
    const db = asAlice();
    await assertFails(setDoc(doc(db, P), firstChallenge(ALICE, { pz: PZ.slice(1) })));       // 299
    await assertFails(setDoc(doc(db, P), firstChallenge(ALICE, { pz: PZ + 'a' })));          // 301
    await assertFails(setDoc(doc(db, P), firstChallenge(ALICE, { pz: '-' + PZ.slice(1) }))); // 300, one bad
    await assertFails(setDoc(doc(db, P), firstChallenge(ALICE, { pz: '' })));
    await assertFails(setDoc(doc(db, P), firstChallenge(ALICE, { pz: 300 })));
  });

  it('every counter must start at 0', async () => {
    await seedFriends();
    await assertFails(setDoc(doc(asAlice(), P), firstChallenge(ALICE, { aP: 9 })));
    await assertFails(setDoc(doc(asAlice(), P), firstChallenge(ALICE, { bM: 30 })));
  });

  it('the tally must start at 0', async () => {
    await seedFriends();
    await assertFails(setDoc(doc(asAlice(), P), firstChallenge(ALICE, { aW: 50 })));
    await assertFails(setDoc(doc(asAlice(), P), firstChallenge(ALICE, { dr: 1 })));
  });

  it('startAt, winner and reason must start empty', async () => {
    await seedFriends();
    await assertFails(setDoc(doc(asAlice(), P), firstChallenge(ALICE, { startAt: serverTimestamp() })));
    await assertFails(setDoc(doc(asAlice(), P), firstChallenge(ALICE, { winner: ALICE })));
    await assertFails(setDoc(doc(asAlice(), P), firstChallenge(ALICE, { reason: 'pull' })));
  });

  it('no extra field and no missing field', async () => {
    await seedFriends();
    await assertFails(setDoc(doc(asAlice(), P), firstChallenge(ALICE, { note: 'hi' })));
    const { dr, ...noDraws } = firstChallenge(ALICE);
    await assertFails(setDoc(doc(asAlice(), P), noDraws));
    const { bK, ...noCounter } = firstChallenge(ALICE);
    await assertFails(setDoc(doc(asAlice(), P), noCounter));
  });
});

// ═════════════ 3. New challenge (every later match, rematch) ═════════════

describe('/pulso — a new challenge on the same document', () => {
  it('either friend CAN challenge again from "idle"', async () => {
    await seedFriends();
    await seed(P, stored());
    await assertSucceeds(write(asAlice(), challenge(ALICE)));
  });

  it('a rematch from "done" is allowed and wipes the old counters', async () => {
    await seedFriends();
    await seed(P, finished());
    await assertSucceeds(write(asBob(), challenge(BOB)));
  });

  it('an unanswered challenge can be replaced once it is over 5 minutes old', async () => {
    await seedFriends();
    await seed(P, invited({ invitedAt: ago(6 * MIN) }));
    await assertSucceeds(write(asBob(), challenge(BOB)));
  });

  it('…but NOT while it is still waiting', async () => {
    await seedFriends();
    await seed(P, invited());
    await assertFails(write(asBob(), challenge(BOB)));
    await assertFails(write(asAlice(), challenge(ALICE)));
  });

  it('a match nobody closed can be replaced 10 seconds after its end', async () => {
    await seedFriends();
    await seed(P, live({ startAt: ago(5 * MIN) }));
    await assertSucceeds(write(asAlice(), challenge(ALICE)));
  });

  it('…but NOT a match in play, nor one that only just ended', async () => {
    await seedFriends();
    await seed(P, live());
    await assertFails(write(asAlice(), challenge(ALICE)));
    await seed(P, live({ startAt: ago(190 * SEC) }));   // ended 4 s ago
    await assertFails(write(asAlice(), challenge(ALICE)));
  });

  it('REFUSED once the two are no longer friends', async () => {
    await seed(P, stored());
    await assertFails(write(asAlice(), challenge(ALICE)));
  });

  it('a stranger CANNOT challenge', async () => {
    await seedFriends();
    await seed(P, stored());
    await assertFails(write(asCarol(), challenge(CAROL)));
  });

  it('the host must be the person writing', async () => {
    await seedFriends();
    await seed(P, stored());
    await assertFails(write(asAlice(), challenge(BOB)));
  });

  it('the same field checks as the first challenge', async () => {
    await seedFriends();
    await seed(P, finished());
    const db = asAlice();
    await assertFails(write(db, challenge(ALICE, { pz: PZ.slice(1) })));
    await assertFails(write(db, challenge(ALICE, { invitedAt: ago(1 * SEC) })));
    await assertFails(write(db, challenge(ALICE, { status: 'live', startAt: serverTimestamp() })));
    await assertFails(write(db, challenge(ALICE, { aP: 9 })));
    await assertFails(write(db, challenge(ALICE, { winner: ALICE })));
    await assertFails(write(db, challenge(ALICE, { note: 'hi' })));
    // Leaving the old match's counters in place is refused too.
    const { aS, aK, aP, ...keepsOldPull } = challenge(ALICE);
    await assertFails(write(db, keepsOldPull));
  });

  it('a new challenge CANNOT reset the tally', async () => {
    await seedFriends();
    await seed(P, finished({ aW: 1, bW: 4, dr: 2 }));
    await assertFails(write(asAlice(), challenge(ALICE, { bW: 0 })));
    await assertFails(write(asAlice(), challenge(ALICE, { aW: 0, bW: 0, dr: 0 })));
    await assertFails(write(asAlice(), challenge(ALICE, { aW: 9 })));
  });

  it('a new challenge CANNOT change the members', async () => {
    await seedFriends();
    await seed(P, stored());
    await assertFails(write(asAlice(), challenge(ALICE, { members: [ALICE, CAROL] })));
  });

  it('a full overwrite with setDoc CANNOT reset the tally either', async () => {
    await seedFriends();
    await seed(P, finished({ bW: 4 }));
    await assertFails(setDoc(doc(asAlice(), P), firstChallenge(ALICE)));
  });
});

// ═══════════════════════ 4. Cancel / decline ═══════════════════════

describe('/pulso — cancelling and declining', () => {
  it('the host CAN cancel their challenge', async () => {
    await seed(P, invited());
    await assertSucceeds(write(asAlice(), { status: 'idle' }));
  });

  it('the friend CAN decline it', async () => {
    await seed(P, invited());
    await assertSucceeds(write(asBob(), { status: 'idle' }));
  });

  it('a stranger CANNOT', async () => {
    await seed(P, invited());
    await assertFails(write(asCarol(), { status: 'idle' }));
  });

  it('nothing else may change with it', async () => {
    await seed(P, invited({ bW: 3 }));
    await assertFails(write(asAlice(), { status: 'idle', bW: 0 }));
    await assertFails(write(asAlice(), { status: 'idle', pz: 'z9Y8x'.repeat(60) }));
    await assertFails(write(asAlice(), { status: 'idle', host: BOB }));
  });

  it('a live match CANNOT be cancelled back to idle', async () => {
    await seed(P, live());
    await assertFails(write(asBob(), { status: 'idle' }));
  });

  it('a finished match CANNOT be set back to idle', async () => {
    await seed(P, finished());
    await assertFails(write(asBob(), { status: 'idle' }));
  });
});

// ═══════════════════════════ 5. Accept ═══════════════════════════

describe('/pulso — accepting', () => {
  const accept = { status: 'live', startAt: serverTimestamp() };

  it('the challenged friend CAN accept', async () => {
    await seed(P, invited());
    await assertSucceeds(write(asBob(), accept));
  });

  it('the host CANNOT accept their own challenge', async () => {
    await seed(P, invited());
    await assertFails(write(asAlice(), accept));
  });

  it('a stranger CANNOT accept', async () => {
    await seed(P, invited());
    await assertFails(write(asCarol(), accept));
  });

  it('an accept after 5 minutes is REFUSED', async () => {
    await seed(P, invited({ invitedAt: ago(5 * MIN + 5 * SEC) }));
    await assertFails(write(asBob(), accept));
  });

  it('an accept just inside the 5 minutes is allowed', async () => {
    await seed(P, invited({ invitedAt: ago(4 * MIN + 30 * SEC) }));
    await assertSucceeds(write(asBob(), accept));
  });

  it('only an "invited" document can be accepted', async () => {
    await seed(P, stored());
    await assertFails(write(asBob(), accept));
    await seed(P, finished());
    await assertFails(write(asBob(), accept));
  });

  it('startAt must be the server\'s time (no starting the clock in the past)', async () => {
    await seed(P, invited());
    await assertFails(write(asBob(), { status: 'live', startAt: ago(3 * MIN) }));
    await assertFails(write(asBob(), { status: 'live' }));
  });

  it('nothing else may change with it', async () => {
    await seed(P, invited());
    await assertFails(write(asBob(), { ...accept, bP: 9 }));
    await assertFails(write(asBob(), { ...accept, pz: 'z9Y8x'.repeat(60) }));
    await assertFails(write(asBob(), { ...accept, bW: 1 }));
  });
});

// ═══════════════════════════ 6. A move ═══════════════════════════
// No friendship document is seeded anywhere in this block, on purpose: a move
// must not depend on one, because a lookup is billed as a read on every move.

describe('/pulso — a move', () => {
  it('a solve pulls 1 step and adds 1 to the streak', async () => {
    await seed(P, live());
    await assertSucceeds(write(asAlice(), { aS: 1, aK: 1, aP: 1 }));
  });

  it('player b writes the b counters the same way', async () => {
    await seed(P, live());
    await assertSucceeds(write(asBob(), { bS: 1, bK: 1, bP: 1 }));
  });

  it('after 2 in a row a solve pulls 2 steps', async () => {
    await seed(P, live({ aS: 2, aK: 2, aP: 2 }));
    await assertSucceeds(write(asAlice(), { aS: 3, aK: 3, aP: 4 }));
  });

  it('+2 pull without a streak of 2 is REFUSED', async () => {
    await seed(P, live({ aS: 1, aK: 1, aP: 1 }));
    await assertFails(write(asAlice(), { aS: 2, aK: 2, aP: 3 }));
  });

  it('+1 pull on a streak of 2 is REFUSED too (it is exactly one or the other)', async () => {
    await seed(P, live({ aS: 2, aK: 2, aP: 2 }));
    await assertFails(write(asAlice(), { aS: 3, aK: 3, aP: 3 }));
  });

  it('a mistake gives back 1 step and ends the streak', async () => {
    await seed(P, live({ aS: 3, aK: 3, aP: 4 }));
    await assertSucceeds(write(asAlice(), { aM: 1, aK: 0, aP: 3 }));
  });

  it('a mistake from the start takes the pull below zero', async () => {
    await seed(P, live());
    await assertSucceeds(write(asBob(), { bM: 1, bK: 0, bP: -1 }));
  });

  it('a mistake that keeps the streak, or loses no ground, is REFUSED', async () => {
    await seed(P, live({ aS: 3, aK: 3, aP: 4 }));
    await assertFails(write(asAlice(), { aM: 1, aP: 3 }));          // streak kept
    await assertFails(write(asAlice(), { aM: 1, aK: 0 }));          // no ground lost
  });

  it('solve and mistake in one write is REFUSED', async () => {
    await seed(P, live());
    await assertFails(write(asAlice(), { aS: 1, aM: 1, aK: 1, aP: 1 }));
    await assertFails(write(asAlice(), { aS: 1, aM: 1, aK: 0, aP: -1 }));
    await assertFails(write(asAlice(), { aS: 1, aM: 1 }));
  });

  it('two solves in one write is REFUSED', async () => {
    await seed(P, live());
    await assertFails(write(asAlice(), { aS: 2, aK: 2, aP: 2 }));
  });

  it('pull alone, or a made-up pull, is REFUSED', async () => {
    await seed(P, live());
    await assertFails(write(asAlice(), { aP: 10 }));
    await assertFails(write(asAlice(), { aS: 1, aK: 1, aP: 10 }));
  });

  it('a player CANNOT change the friend\'s counters', async () => {
    await seed(P, live({ aS: 5, aK: 5, aP: 8 }));
    await assertFails(write(asBob(), { aP: 0 }));
    await assertFails(write(asBob(), { aM: 1, aK: 0, aP: 7 }));     // a "mistake" for Alice
    await assertFails(write(asBob(), { aS: 6, aK: 6, aP: 10 }));    // a "solve" for Alice
    // …not even alongside a valid move of their own.
    await assertFails(write(asBob(), { bS: 1, bK: 1, bP: 1, aP: 0 }));
  });

  it('a stranger CANNOT move', async () => {
    await seed(P, live());
    await assertFails(write(asCarol(), { aS: 1, aK: 1, aP: 1 }));
    await assertFails(write(asCarol(), { bS: 1, bK: 1, bP: 1 }));
  });

  it('a move before play starts is REFUSED (the 6-second countdown)', async () => {
    await seed(P, live({ startAt: ago(1 * SEC) }));
    await assertFails(write(asAlice(), { aS: 1, aK: 1, aP: 1 }));
  });

  it('a move after the end time is REFUSED', async () => {
    await seed(P, timeUp());
    await assertFails(write(asAlice(), { aS: 1, aK: 1, aP: 1 }));
    await assertFails(write(asAlice(), { aM: 1, aK: 0, aP: -1 }));
  });

  it('a move in the 3 seconds of grace after the clock is allowed', async () => {
    await seed(P, live({ startAt: ago(187 * SEC) }));
    await assertSucceeds(write(asAlice(), { aS: 1, aK: 1, aP: 1 }));
  });

  it('a move on a match that is not live is REFUSED', async () => {
    const move = { aS: 1, aK: 1, aP: 1 };
    await seed(P, invited());
    await assertFails(write(asAlice(), move));
    await seed(P, stored({ startAt: ago(60 * SEC) }));
    await assertFails(write(asAlice(), move));
    await seed(P, finished({ startAt: ago(60 * SEC), aS: 0, aK: 0, aP: 0 }));
    await assertFails(write(asAlice(), move));
  });

  it('the 60th attempt is allowed', async () => {
    await seed(P, live({ aS: 40, aM: 19, aK: 0, aP: 21 }));
    await assertSucceeds(write(asAlice(), { aS: 41, aK: 1, aP: 22 }));
  });

  it('a 61st attempt is REFUSED', async () => {
    await seed(P, live({ aS: 40, aM: 20, aK: 0, aP: 20 }));
    await assertFails(write(asAlice(), { aS: 41, aK: 1, aP: 21 }));
    await assertFails(write(asAlice(), { aM: 21, aK: 0, aP: 19 }));
  });

  it('a move CANNOT touch anything but the four counters', async () => {
    await seed(P, live());
    const move = { aS: 1, aK: 1, aP: 1 };
    await assertFails(write(asAlice(), { ...move, aW: 1 }));
    await assertFails(write(asAlice(), { ...move, startAt: serverTimestamp() }));
    await assertFails(write(asAlice(), { ...move, pz: 'z9Y8x'.repeat(60) }));
    await assertFails(write(asAlice(), { ...move, cheat: true }));
  });
});

// ══════════════════════ 7. Ending the match ══════════════════════

describe('/pulso — ending the match', () => {
  const end = (winner, reason, tally) => ({ status: 'done', winner, reason, ...tally });

  // ── 'pull': the marker reached one end ──
  it('"pull": a lead of 10 wins for a, and either phone may record it', async () => {
    await seed(P, live({ aP: 12, bP: 2 }));
    await assertSucceeds(write(asBob(), end(ALICE, 'pull', { aW: 1 })));
    await seed(P, live({ aP: 12, bP: 2 }));
    await assertSucceeds(write(asAlice(), end(ALICE, 'pull', { aW: 1 })));
  });

  it('"pull": a lead of 10 the other way wins for b', async () => {
    await seed(P, live({ aP: -3, bP: 7, bW: 2 }));
    await assertSucceeds(write(asBob(), end(BOB, 'pull', { bW: 3 })));
  });

  it('a false "pull" claim is REFUSED', async () => {
    await seed(P, live({ aP: 11, bP: 2 }));                       // only 9 ahead
    await assertFails(write(asAlice(), end(ALICE, 'pull', { aW: 1 })));
    await seed(P, live());                                        // nobody moved
    await assertFails(write(asAlice(), end(ALICE, 'pull', { aW: 1 })));
  });

  it('"pull": the winner must be the one who is actually 10 ahead', async () => {
    await seed(P, live({ aP: 12, bP: 2 }));
    await assertFails(write(asBob(), end(BOB, 'pull', { bW: 1 })));
    await assertFails(write(asBob(), end('draw', 'pull', { dr: 1 })));
  });

  // ── 'time': the clock ran out ──
  it('"time": whoever is ahead wins once the clock and the grace are over', async () => {
    await seed(P, timeUp({ aP: 5, bP: 3 }));
    await assertSucceeds(write(asAlice(), end(ALICE, 'time', { aW: 1 })));
    await seed(P, timeUp({ aP: 2, bP: 3 }));
    await assertSucceeds(write(asAlice(), end(BOB, 'time', { bW: 1 })));
  });

  it('a "time" claim before the end is REFUSED', async () => {
    await seed(P, live({ aP: 5, bP: 3 }));
    await assertFails(write(asAlice(), end(ALICE, 'time', { aW: 1 })));
    // The clock is over but the 3 seconds of grace are not (187 s < 189 s).
    await seed(P, live({ startAt: ago(187 * SEC), aP: 5, bP: 3 }));
    await assertFails(write(asAlice(), end(ALICE, 'time', { aW: 1 })));
  });

  it('"time": naming the player who is behind is REFUSED', async () => {
    await seed(P, timeUp({ aP: 5, bP: 3 }));
    await assertFails(write(asBob(), end(BOB, 'time', { bW: 1 })));
    await assertFails(write(asBob(), end('draw', 'time', { dr: 1 })));
  });

  it('"time", marker level: fewer mistakes wins', async () => {
    await seed(P, timeUp({ aP: 3, bP: 3, aM: 2, bM: 1 }));
    await assertFails(write(asAlice(), end(ALICE, 'time', { aW: 1 })));
    await assertFails(write(asAlice(), end('draw', 'time', { dr: 1 })));
    await assertSucceeds(write(asAlice(), end(BOB, 'time', { bW: 1 })));
  });

  it('"time", marker and mistakes level: it is a draw', async () => {
    await seed(P, timeUp({ aP: 3, bP: 3, aM: 2, bM: 2 }));
    await assertFails(write(asAlice(), end(ALICE, 'time', { aW: 1 })));
    await assertFails(write(asBob(), end(BOB, 'time', { bW: 1 })));
    await assertSucceeds(write(asAlice(), end('draw', 'time', { dr: 1 })));
  });

  // ── 'left': a forfeit ──
  it('"left": a player CAN forfeit, and the friend wins', async () => {
    await seed(P, live({ aP: 6 }));
    await assertSucceeds(write(asAlice(), end(BOB, 'left', { bW: 1 })));
    await seed(P, live());
    await assertSucceeds(write(asBob(), end(ALICE, 'left', { aW: 1 })));
  });

  it('naming yourself winner of a forfeit is REFUSED', async () => {
    await seed(P, live());
    await assertFails(write(asAlice(), end(ALICE, 'left', { aW: 1 })));
    await assertFails(write(asBob(), end(BOB, 'left', { bW: 1 })));
  });

  it('"left": a forfeit cannot be a draw or name an outsider', async () => {
    await seed(P, live());
    await assertFails(write(asAlice(), end('draw', 'left', { dr: 1 })));
    await assertFails(write(asAlice(), end(CAROL, 'left', {})));
  });

  // ── the claim itself ──
  it('an unknown reason, or no reason, is REFUSED', async () => {
    await seed(P, live({ aP: 12, bP: 2 }));
    await assertFails(write(asAlice(), end(ALICE, 'because', { aW: 1 })));
    await assertFails(write(asAlice(), { status: 'done', winner: ALICE, aW: 1 }));
    await assertFails(write(asAlice(), { status: 'done' }));
  });

  it('a stranger CANNOT end a match', async () => {
    await seed(P, live({ aP: 12, bP: 2 }));
    await assertFails(write(asCarol(), end(ALICE, 'pull', { aW: 1 })));
    await assertFails(write(asCarol(), end(ALICE, 'left', { aW: 1 })));
  });

  it('a second "done" is REFUSED', async () => {
    await seed(P, live({ aP: 12, bP: 2 }));
    await assertSucceeds(write(asAlice(), end(ALICE, 'pull', { aW: 1 })));
    await assertFails(write(asBob(), end(ALICE, 'pull', { aW: 2 })));
    await assertFails(write(asBob(), end(ALICE, 'left', { aW: 2 })));
    await assertFails(write(asAlice(), end(ALICE, 'pull', { aW: 1 })));
  });

  it('a match that has not started CANNOT be ended', async () => {
    await seed(P, invited());
    await assertFails(write(asBob(), end(ALICE, 'left', { aW: 1 })));
  });

  it('no counter may change with the result', async () => {
    await seed(P, live({ aP: 9, bP: 0, aS: 9, aK: 1 }));
    // The winning solve and the result in one write: refused, it is two writes.
    await assertFails(write(asAlice(), { ...end(ALICE, 'pull', { aW: 1 }), aS: 10, aK: 2, aP: 10 }));
    await seed(P, live({ aP: 12, bP: 2 }));
    await assertFails(write(asAlice(), { ...end(ALICE, 'pull', { aW: 1 }), bM: 30 }));
  });

  // ── the tally ──
  it('a valid result MUST add exactly 1 to the matching tally field', async () => {
    await seed(P, live({ aP: 12, bP: 2, aW: 3, bW: 1 }));
    const db = asAlice();
    await assertFails(write(db, end(ALICE, 'pull', {})));                  // not counted
    await assertFails(write(db, end(ALICE, 'pull', { aW: 5 })));           // +2
    await assertFails(write(db, end(ALICE, 'pull', { aW: 3, bW: 2 })));    // wrong side
    await assertFails(write(db, end(ALICE, 'pull', { aW: 4, bW: 0 })));    // and wipes b's
    await assertFails(write(db, end(ALICE, 'pull', { aW: 4, dr: 1 })));    // and a draw
    await assertSucceeds(write(db, end(ALICE, 'pull', { aW: 4 })));
  });

  it('the tally CANNOT change except by a valid result', async () => {
    for (const state of [stored(), invited(), live(), finished()]) {
      await seed(P, state);
      await assertFails(write(asAlice(), { aW: 9 }));
      await assertFails(write(asBob(), { bW: 9 }));
      await assertFails(write(asBob(), { aW: 0, bW: 0, dr: 0, status: state.status }));
    }
  });
});

// ═══════════════════════════ 8. Delete ═══════════════════════════

describe('/pulso — deleting', () => {
  it('nobody can delete the document, in any state', async () => {
    for (const state of [stored(), invited(), live(), finished()]) {
      await seed(P, state);
      await assertFails(deleteDoc(doc(asAlice(), P)));
      await assertFails(deleteDoc(doc(asBob(), P)));
      await assertFails(deleteDoc(doc(asCarol(), P)));
    }
  });
});
