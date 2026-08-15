// Rules tests for the three Friends collections: /friendships,
// /friendRequests and /blocks/{uid}/blocked.
//
// Why these matter more than the ones in existing.test.js: every collection
// tested there is a person writing their OWN document. These three are the
// first place in this app where one person's write lands on another person's
// screen, and where a document is trusted to mean "this person is my friend".
// A forged friendship would later become an access grant when Masterclass
// sharing reads the same list — so every allow and every deny gets a test.
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
  setDoc, updateDoc, deleteDoc,
} from 'firebase/firestore';

// Sorted ascending on purpose — the pair id is the two uids sorted and joined
// with "_", so alice_uid_bob_uid is the only legal id for that pair.
const ALICE = 'alice_uid';
const BOB = 'bob_uid';
const CAROL = 'carol_uid';

const AB = `${ALICE}_${BOB}`;      // friendship / request id, alice → bob
const BA = `${BOB}_${ALICE}`;      // request id, bob → alice
const BC = `${BOB}_${CAROL}`;

const NOW = 1755000000000;

const pending = (from, to) => ({ from, to, status: 'pending', createdAt: NOW });
const friendship = (a, b) => ({ members: [a, b], createdAt: NOW });

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

// Every test starts from an empty database, because most of these rules depend
// on whether some OTHER document exists — a leftover request from a previous
// test would quietly make a "deny" test pass for the wrong reason.
beforeEach(async () => {
  await testEnv.clearFirestore();
});

async function seed(path, data) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}

const asAlice = () => testEnv.authenticatedContext(ALICE).firestore();
const asBob = () => testEnv.authenticatedContext(BOB).firestore();
const asCarol = () => testEnv.authenticatedContext(CAROL).firestore();
const asNobody = () => testEnv.unauthenticatedContext().firestore();

// ═══════════════════════ /friendships/{pairId} ═══════════════════════

describe('/friendships — reading', () => {
  it('a member can read the friendship', async () => {
    await seed(`friendships/${AB}`, friendship(ALICE, BOB));
    await assertSucceeds(getDoc(doc(asAlice(), `friendships/${AB}`)));
  });

  it('an outsider CANNOT read someone else\'s friendship', async () => {
    await seed(`friendships/${AB}`, friendship(ALICE, BOB));
    await assertFails(getDoc(doc(asCarol(), `friendships/${AB}`)));
  });

  it('a signed-out visitor CANNOT read it', async () => {
    await seed(`friendships/${AB}`, friendship(ALICE, BOB));
    await assertFails(getDoc(doc(asNobody(), `friendships/${AB}`)));
  });

  it('the "list my friends" query works (this is the query the app runs)', async () => {
    await seed(`friendships/${AB}`, friendship(ALICE, BOB));
    await assertSucceeds(getDocs(query(
      collection(asAlice(), 'friendships'),
      where('members', 'array-contains', ALICE))));
  });

  it('CANNOT list the whole friendships collection', async () => {
    await seed(`friendships/${AB}`, friendship(ALICE, BOB));
    await assertFails(getDocs(collection(asAlice(), 'friendships')));
  });

  it('CANNOT query someone else\'s friends list', async () => {
    await seed(`friendships/${BC}`, friendship(BOB, CAROL));
    await assertFails(getDocs(query(
      collection(asAlice(), 'friendships'),
      where('members', 'array-contains', BOB))));
  });
});

describe('/friendships — creating (the forgery surface)', () => {
  it('CAN accept: a pending request from them to me lets me create it', async () => {
    await seed(`friendRequests/${BA}`, pending(BOB, ALICE));
    await assertSucceeds(setDoc(doc(asAlice(), `friendships/${AB}`), friendship(ALICE, BOB)));
  });

  it('CANNOT create a friendship nobody asked for', async () => {
    await assertFails(setDoc(doc(asAlice(), `friendships/${AB}`), friendship(ALICE, BOB)));
  });

  it('CANNOT accept my OWN outgoing request on the other person\'s behalf', async () => {
    await seed(`friendRequests/${AB}`, pending(ALICE, BOB));
    await assertFails(setDoc(doc(asAlice(), `friendships/${AB}`), friendship(ALICE, BOB)));
  });

  it('CANNOT create a friendship between two other people', async () => {
    await seed(`friendRequests/${BC}`, pending(BOB, CAROL));
    await assertFails(setDoc(doc(asAlice(), `friendships/${BC}`), friendship(BOB, CAROL)));
  });

  it('CANNOT use an id that does not match the members', async () => {
    await seed(`friendRequests/${BA}`, pending(BOB, ALICE));
    await assertFails(setDoc(doc(asAlice(), 'friendships/something_else'),
      friendship(ALICE, BOB)));
  });

  it('CANNOT write the members out of order (one pair, one document)', async () => {
    await seed(`friendRequests/${BA}`, pending(BOB, ALICE));
    await assertFails(setDoc(doc(asAlice(), `friendships/${BA}`), friendship(BOB, ALICE)));
  });

  it('CANNOT create a friendship with three members', async () => {
    await seed(`friendRequests/${BA}`, pending(BOB, ALICE));
    await assertFails(setDoc(doc(asAlice(), `friendships/${AB}`),
      { members: [ALICE, BOB, CAROL], createdAt: NOW }));
  });

  it('CANNOT smuggle an extra field onto the document', async () => {
    await seed(`friendRequests/${BA}`, pending(BOB, ALICE));
    await assertFails(setDoc(doc(asAlice(), `friendships/${AB}`),
      { ...friendship(ALICE, BOB), note: 'x'.repeat(500) }));
  });

  it('CANNOT create it without a numeric createdAt', async () => {
    await seed(`friendRequests/${BA}`, pending(BOB, ALICE));
    await assertFails(setDoc(doc(asAlice(), `friendships/${AB}`),
      { members: [ALICE, BOB], createdAt: 'now' }));
  });

  it('a signed-out visitor CANNOT create one', async () => {
    await seed(`friendRequests/${BA}`, pending(BOB, ALICE));
    await assertFails(setDoc(doc(asNobody(), `friendships/${AB}`), friendship(ALICE, BOB)));
  });
});

describe('/friendships — editing and deleting', () => {
  it('CANNOT be edited, even by a member (created or deleted, never edited)', async () => {
    await seed(`friendships/${AB}`, friendship(ALICE, BOB));
    await assertFails(updateDoc(doc(asAlice(), `friendships/${AB}`), { createdAt: 1 }));
  });

  it('either side can unfriend', async () => {
    await seed(`friendships/${AB}`, friendship(ALICE, BOB));
    await assertSucceeds(deleteDoc(doc(asBob(), `friendships/${AB}`)));
  });

  it('an outsider CANNOT break up someone else\'s friendship', async () => {
    await seed(`friendships/${AB}`, friendship(ALICE, BOB));
    await assertFails(deleteDoc(doc(asCarol(), `friendships/${AB}`)));
  });
});

// ═══════════════════════ /friendRequests/{reqId} ═══════════════════════

describe('/friendRequests — reading', () => {
  it('the sender can read their own request', async () => {
    await seed(`friendRequests/${AB}`, pending(ALICE, BOB));
    await assertSucceeds(getDoc(doc(asAlice(), `friendRequests/${AB}`)));
  });

  it('the recipient can read it', async () => {
    await seed(`friendRequests/${AB}`, pending(ALICE, BOB));
    await assertSucceeds(getDoc(doc(asBob(), `friendRequests/${AB}`)));
  });

  it('nobody else can read it', async () => {
    await seed(`friendRequests/${AB}`, pending(ALICE, BOB));
    await assertFails(getDoc(doc(asCarol(), `friendRequests/${AB}`)));
  });

  it('the incoming query works (to == me, status == pending)', async () => {
    await seed(`friendRequests/${AB}`, pending(ALICE, BOB));
    await assertSucceeds(getDocs(query(
      collection(asBob(), 'friendRequests'),
      where('to', '==', BOB), where('status', '==', 'pending'))));
  });

  it('the outgoing query works (from == me)', async () => {
    await seed(`friendRequests/${AB}`, pending(ALICE, BOB));
    await assertSucceeds(getDocs(query(
      collection(asAlice(), 'friendRequests'), where('from', '==', ALICE))));
  });

  it('CANNOT read another person\'s incoming requests', async () => {
    await seed(`friendRequests/${AB}`, pending(ALICE, BOB));
    await assertFails(getDocs(query(
      collection(asCarol(), 'friendRequests'), where('to', '==', BOB))));
  });

  // The read rule reads from/to with a default so the two real queries work.
  // These two prove that did not open the collection up: an unconstrained
  // list, or one constrained on some other field, still gets nothing.
  it('CANNOT list the whole requests collection', async () => {
    await seed(`friendRequests/${AB}`, pending(ALICE, BOB));
    await assertFails(getDocs(collection(asAlice(), 'friendRequests')));
  });

  it('CANNOT list every pending request in the app', async () => {
    await seed(`friendRequests/${AB}`, pending(ALICE, BOB));
    await assertFails(getDocs(query(
      collection(asAlice(), 'friendRequests'), where('status', '==', 'pending'))));
  });
});

describe('/friendRequests — sending', () => {
  it('CAN send a pending request', async () => {
    await assertSucceeds(setDoc(doc(asAlice(), `friendRequests/${AB}`), pending(ALICE, BOB)));
  });

  it('CANNOT send a request as somebody else', async () => {
    await assertFails(setDoc(doc(asAlice(), `friendRequests/${BC}`), pending(BOB, CAROL)));
  });

  it('CANNOT send a request to yourself', async () => {
    await assertFails(setDoc(doc(asAlice(), `friendRequests/${ALICE}_${ALICE}`),
      pending(ALICE, ALICE)));
  });

  it('CANNOT use an id that does not match from_to', async () => {
    await assertFails(setDoc(doc(asAlice(), 'friendRequests/alice_uid_someone'),
      pending(ALICE, BOB)));
  });

  it('CANNOT create a request that is already accepted or rejected', async () => {
    await assertFails(setDoc(doc(asAlice(), `friendRequests/${AB}`),
      { ...pending(ALICE, BOB), status: 'rejected' }));
  });

  it('CANNOT attach a message or any other extra field', async () => {
    await assertFails(setDoc(doc(asAlice(), `friendRequests/${AB}`),
      { ...pending(ALICE, BOB), message: 'hello' }));
  });

  it('a signed-out visitor CANNOT send one', async () => {
    await assertFails(setDoc(doc(asNobody(), `friendRequests/${AB}`), pending(ALICE, BOB)));
  });

  it('a BLOCKED sender CANNOT create the document (silently, from their side)', async () => {
    await seed(`blocks/${BOB}/blocked/${ALICE}`, { createdAt: NOW });
    await assertFails(setDoc(doc(asAlice(), `friendRequests/${AB}`), pending(ALICE, BOB)));
  });

  it('blocking one person does not stop anyone else asking', async () => {
    await seed(`blocks/${BOB}/blocked/${ALICE}`, { createdAt: NOW });
    await assertSucceeds(setDoc(doc(asCarol(), `friendRequests/${CAROL}_${BOB}`),
      pending(CAROL, BOB)));
  });
});

describe('/friendRequests — rejecting', () => {
  it('the recipient CAN reject', async () => {
    await seed(`friendRequests/${AB}`, pending(ALICE, BOB));
    await assertSucceeds(updateDoc(doc(asBob(), `friendRequests/${AB}`), { status: 'rejected' }));
  });

  it('the sender CANNOT reject their own request', async () => {
    await seed(`friendRequests/${AB}`, pending(ALICE, BOB));
    await assertFails(updateDoc(doc(asAlice(), `friendRequests/${AB}`), { status: 'rejected' }));
  });

  it('the sender CANNOT set a rejection back to pending (asking again)', async () => {
    await seed(`friendRequests/${AB}`, { ...pending(ALICE, BOB), status: 'rejected' });
    await assertFails(updateDoc(doc(asAlice(), `friendRequests/${AB}`), { status: 'pending' }));
  });

  it('re-sending does not revive a rejected request either', async () => {
    await seed(`friendRequests/${AB}`, { ...pending(ALICE, BOB), status: 'rejected' });
    await assertFails(setDoc(doc(asAlice(), `friendRequests/${AB}`), pending(ALICE, BOB)));
  });

  it('the recipient CANNOT invent some other status', async () => {
    await seed(`friendRequests/${AB}`, pending(ALICE, BOB));
    await assertFails(updateDoc(doc(asBob(), `friendRequests/${AB}`), { status: 'accepted' }));
  });

  it('the recipient CANNOT rewrite who the request was from', async () => {
    await seed(`friendRequests/${AB}`, pending(ALICE, BOB));
    await assertFails(updateDoc(doc(asBob(), `friendRequests/${AB}`),
      { status: 'rejected', from: CAROL }));
  });

  it('an outsider CANNOT touch it at all', async () => {
    await seed(`friendRequests/${AB}`, pending(ALICE, BOB));
    await assertFails(updateDoc(doc(asCarol(), `friendRequests/${AB}`), { status: 'rejected' }));
  });
});

describe('/friendRequests — deleting', () => {
  it('the sender can cancel', async () => {
    await seed(`friendRequests/${AB}`, pending(ALICE, BOB));
    await assertSucceeds(deleteDoc(doc(asAlice(), `friendRequests/${AB}`)));
  });

  it('the recipient can clear it (after accepting, or to undo a mis-tap)', async () => {
    await seed(`friendRequests/${AB}`, { ...pending(ALICE, BOB), status: 'rejected' });
    await assertSucceeds(deleteDoc(doc(asBob(), `friendRequests/${AB}`)));
  });

  it('an outsider cannot delete it', async () => {
    await seed(`friendRequests/${AB}`, pending(ALICE, BOB));
    await assertFails(deleteDoc(doc(asCarol(), `friendRequests/${AB}`)));
  });
});

// ═══════════════════ /blocks/{uid}/blocked/{other} ═══════════════════
// A block is silent. The whole point is that the blocked person cannot find
// out, so nobody but the owner may read this list.

describe('/blocks', () => {
  it('I can write my own block list', async () => {
    await assertSucceeds(setDoc(doc(asAlice(), `blocks/${ALICE}/blocked/${BOB}`),
      { createdAt: NOW }));
  });

  it('I can read my own block list', async () => {
    await seed(`blocks/${ALICE}/blocked/${BOB}`, { createdAt: NOW });
    await assertSucceeds(getDoc(doc(asAlice(), `blocks/${ALICE}/blocked/${BOB}`)));
  });

  it('I can unblock (delete my own entry)', async () => {
    await seed(`blocks/${ALICE}/blocked/${BOB}`, { createdAt: NOW });
    await assertSucceeds(deleteDoc(doc(asAlice(), `blocks/${ALICE}/blocked/${BOB}`)));
  });

  it('the blocked person CANNOT see that they were blocked', async () => {
    await seed(`blocks/${ALICE}/blocked/${BOB}`, { createdAt: NOW });
    await assertFails(getDoc(doc(asBob(), `blocks/${ALICE}/blocked/${BOB}`)));
  });

  it('the blocked person CANNOT delete themselves off my list', async () => {
    await seed(`blocks/${ALICE}/blocked/${BOB}`, { createdAt: NOW });
    await assertFails(deleteDoc(doc(asBob(), `blocks/${ALICE}/blocked/${BOB}`)));
  });

  it('nobody can add entries to someone else\'s block list', async () => {
    await assertFails(setDoc(doc(asBob(), `blocks/${ALICE}/blocked/${CAROL}`),
      { createdAt: NOW }));
  });

  it('a signed-out visitor CANNOT read a block list', async () => {
    await seed(`blocks/${ALICE}/blocked/${BOB}`, { createdAt: NOW });
    await assertFails(getDoc(doc(asNobody(), `blocks/${ALICE}/blocked/${BOB}`)));
  });
});

// ═══════════ /leaderboard — the one field the Friends work adds ═══════════

describe('/leaderboard — usernameLower (added for friend search)', () => {
  const validPublic = {
    profileName: 'Alice', username: 'Alice', avatarId: 'knight',
    puzzleElo: 1500, profileVisibility: 'public', updatedAt: NOW,
  };

  it('CAN publish usernameLower', async () => {
    await assertSucceeds(setDoc(doc(asAlice(), `leaderboard/${ALICE}`),
      { ...validPublic, usernameLower: 'alice' }));
  });

  it('CANNOT publish an oversized usernameLower', async () => {
    await assertFails(setDoc(doc(asAlice(), `leaderboard/${ALICE}`),
      { ...validPublic, usernameLower: 'a'.repeat(61) }));
  });

  it('search by usernameLower is readable signed out (search must work)', async () => {
    await seed(`leaderboard/${ALICE}`, { ...validPublic, usernameLower: 'alice' });
    await assertSucceeds(getDocs(query(
      collection(asNobody(), 'leaderboard'), where('usernameLower', '==', 'alice'))));
  });
});
