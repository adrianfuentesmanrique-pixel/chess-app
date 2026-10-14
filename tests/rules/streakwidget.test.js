// Rules tests for streakWidget/{token}: the home-screen widget's document.
//
// Why these matter: this collection is readable WITHOUT signing in, because
// the Android widget has no Firebase login and reads by REST with only the
// code. So the code (the doc id) is the whole secret, and the rules must make
// sure that (1) nobody can list codes, (2) nobody can write or take over
// another player's document, and (3) the document can hold nothing but the
// streak number and its date.
//
// Run with:  npm run test:rules
// Local emulator only. Nothing here touches the real project.

import { before, after, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc, collection, getDoc, getDocs, setDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';

const ALICE = 'alice_uid';
const BOB = 'bob_uid';
const CODE = '0123456789abcdef0123456789abcdef';
const CODE2 = 'fedcba9876543210fedcba9876543210';

const widgetDoc = (over = {}) => ({
  owner: ALICE, count: 12, lastDate: '2026-10-13', updatedAt: serverTimestamp(), ...over,
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

const asAlice = () => testEnv.authenticatedContext(ALICE).firestore();
const asBob = () => testEnv.authenticatedContext(BOB).firestore();
const asNobody = () => testEnv.unauthenticatedContext().firestore();
const ref = (db, id = CODE) => doc(db, `streakWidget/${id}`);

async function seed(id = CODE, owner = ALICE) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `streakWidget/${id}`),
      { ...widgetDoc({ owner }), updatedAt: 1 });
  });
}

describe('/streakWidget — reading', () => {
  it('anyone holding the code can read it, signed out included (the widget)', async () => {
    await seed();
    await assertSucceeds(getDoc(ref(asNobody())));
    await assertSucceeds(getDoc(ref(asBob())));
  });
  it('nobody can LIST the codes, not even signed in', async () => {
    await seed(); await seed(CODE2);
    await assertFails(getDocs(collection(asNobody(), 'streakWidget')));
    await assertFails(getDocs(collection(asAlice(), 'streakWidget')));
  });
});

describe('/streakWidget — writing', () => {
  it('the owner can create and update their document', async () => {
    await assertSucceeds(setDoc(ref(asAlice()), widgetDoc()));
    await assertSucceeds(setDoc(ref(asAlice()), widgetDoc({ count: 13, lastDate: '2026-10-14' })));
  });
  it('a count of 0 (streak broken) is accepted', async () => {
    await assertSucceeds(setDoc(ref(asAlice()), widgetDoc({ count: 0 })));
  });
  it('a signed-out client CANNOT write', async () => {
    await assertFails(setDoc(ref(asNobody()), widgetDoc()));
  });
  it('owner must be the writer: nobody can create a document in someone else\'s name', async () => {
    await assertFails(setDoc(ref(asBob()), widgetDoc()));
  });
  it('a stranger CANNOT take over an existing document, even naming themselves', async () => {
    await seed();
    await assertFails(setDoc(ref(asBob()), widgetDoc({ owner: BOB })));
    await assertFails(setDoc(ref(asBob()), widgetDoc()));
  });
  it('the code must be 32 lowercase hex characters', async () => {
    await assertFails(setDoc(ref(asAlice(), 'short'), widgetDoc()));
    await assertFails(setDoc(ref(asAlice(), CODE.toUpperCase()), widgetDoc()));
    await assertFails(setDoc(ref(asAlice(), CODE + 'a'), widgetDoc()));
    await assertFails(setDoc(ref(asAlice(), 'g'.repeat(32)), widgetDoc()));
    await assertFails(setDoc(ref(asAlice(), ALICE), widgetDoc()));
  });
  it('an extra field is refused (nothing else may ride along, e.g. a name)', async () => {
    await assertFails(setDoc(ref(asAlice()), widgetDoc({ profileName: 'Alice' })));
  });
  it('a missing field is refused', async () => {
    const { lastDate, ...rest } = widgetDoc();
    await assertFails(setDoc(ref(asAlice()), rest));
  });
  it('count must be a number from 0 to 30000', async () => {
    await assertFails(setDoc(ref(asAlice()), widgetDoc({ count: -1 })));
    await assertFails(setDoc(ref(asAlice()), widgetDoc({ count: 30001 })));
    await assertFails(setDoc(ref(asAlice()), widgetDoc({ count: '12' })));
  });
  it('lastDate must be a YYYY-MM-DD string', async () => {
    await assertFails(setDoc(ref(asAlice()), widgetDoc({ lastDate: '13/10/2026' })));
    await assertFails(setDoc(ref(asAlice()), widgetDoc({ lastDate: '2026-10-13T00:00' })));
    await assertFails(setDoc(ref(asAlice()), widgetDoc({ lastDate: null })));
    await assertFails(setDoc(ref(asAlice()), widgetDoc({ lastDate: 20261013 })));
  });
  it('updatedAt must be the server time', async () => {
    await assertFails(setDoc(ref(asAlice()), widgetDoc({ updatedAt: 1755000000000 })));
    await assertFails(setDoc(ref(asAlice()), widgetDoc({ updatedAt: new Date() })));
  });
});

describe('/streakWidget — deleting', () => {
  it('the owner can delete their document ("Make a new code", account deletion)', async () => {
    await seed();
    await assertSucceeds(deleteDoc(ref(asAlice())));
  });
  it('deleting a code that was never written is allowed (harmless)', async () => {
    await assertSucceeds(deleteDoc(ref(asAlice())));
  });
  it('a stranger or a signed-out client CANNOT delete it', async () => {
    await seed();
    await assertFails(deleteDoc(ref(asBob())));
    await assertFails(deleteDoc(ref(asNobody())));
  });
});
