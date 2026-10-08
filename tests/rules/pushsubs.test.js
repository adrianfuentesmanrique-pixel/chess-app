// Rules tests for users/{uid}/pushSubs/{subId}: one Web Push subscription per
// device, for the daily streak reminder.
//
// Why these matter: the hourly job sends an HTTP request to whatever `endpoint`
// is stored here. The endpoint allowlist is what stops a user making the job
// call an address of their choosing, so it needs a test, not a comment. The job
// re-checks the allowlist itself; this is the first of two locks.
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
const ID = 'a'.repeat(64);
const ID2 = 'b'.repeat(64);
const FCM = 'https://fcm.googleapis.com/fcm/send/abc123:APA91b';

const subDoc = (over = {}) => ({
  endpoint: FCM, p256dh: 'B'.repeat(87), auth: 'c'.repeat(22),
  createdAt: serverTimestamp(), platform: 'android', lang: 'es', ...over,
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
const ref = (db, id = ID, uid = ALICE) => doc(db, `users/${uid}/pushSubs/${id}`);

async function seed(id = ID) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `users/${ALICE}/pushSubs/${id}`),
      { ...subDoc(), createdAt: 1 });
  });
}

describe('/users/{uid}/pushSubs — subscribing a device', () => {
  it('the owner can store a subscription', async () => {
    await assertSucceeds(setDoc(ref(asAlice()), subDoc()));
  });
  it('a stranger CANNOT store one under someone else\'s uid', async () => {
    await assertFails(setDoc(ref(asBob()), subDoc()));
  });
  it('a signed-out client CANNOT store one', async () => {
    await assertFails(setDoc(ref(asNobody()), subDoc()));
  });
  it('the id must be 64 lowercase hex characters', async () => {
    await assertFails(setDoc(ref(asAlice(), 'short'), subDoc()));
    await assertFails(setDoc(ref(asAlice(), 'A'.repeat(64)), subDoc()));
    // matches() tests the whole id: 64 good characters inside a longer id fail.
    await assertFails(setDoc(ref(asAlice(), 'a'.repeat(65)), subDoc()));
    await assertFails(setDoc(ref(asAlice(), 'g'.repeat(64)), subDoc()));
  });
  it('an extra field is refused', async () => {
    await assertFails(setDoc(ref(asAlice()), subDoc({ uid: ALICE })));
  });
  it('a missing field is refused', async () => {
    const { auth, ...rest } = subDoc();
    await assertFails(setDoc(ref(asAlice()), rest));
  });
  it('createdAt must be the server time, not a number the client chose', async () => {
    await assertFails(setDoc(ref(asAlice()), subDoc({ createdAt: 1755000000000 })));
    await assertFails(setDoc(ref(asAlice()), subDoc({ createdAt: new Date() })));
  });
  it('platform and lang must come from their lists', async () => {
    await assertFails(setDoc(ref(asAlice()), subDoc({ platform: 'toaster' })));
    await assertFails(setDoc(ref(asAlice()), subDoc({ lang: 'fr' })));
  });
  it('over-long keys are refused', async () => {
    await assertFails(setDoc(ref(asAlice()), subDoc({ p256dh: 'B'.repeat(257) })));
    await assertFails(setDoc(ref(asAlice()), subDoc({ auth: 'c'.repeat(65) })));
  });
  it('keys that are not text are refused', async () => {
    await assertFails(setDoc(ref(asAlice()), subDoc({ p256dh: 87 })));
    await assertFails(setDoc(ref(asAlice()), subDoc({ auth: ['c'] })));
    await assertFails(setDoc(ref(asAlice()), subDoc({ endpoint: { url: FCM } })));
  });
});

describe('/users/{uid}/pushSubs — the endpoint allowlist', () => {
  for (const ok of [
    FCM,
    'https://web.push.apple.com/QGk3abc',
    'https://updates.push.services.mozilla.com/wpush/v2/gAAAA',
    'https://db5p.notify.windows.com/w/?token=abc',
  ]) {
    it(`accepts ${new URL(ok).host}`, async () => {
      await assertSucceeds(setDoc(ref(asAlice()), subDoc({ endpoint: ok })));
    });
  }
  for (const bad of [
    'https://evil.example.com/hook',
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com.evil.example.com/x',
    'https://evil.example.com/https://fcm.googleapis.com/',
    'https://fcm.googleapis.com',
    // The tricks that make a URL parser see a different host than a reader does.
    'https://fcm.googleapis.com@evil.example.com/x',
    'https://fcm.googleapis.com:443@evil.example.com/x',
    'https://evil.example.com/.push.apple.com/x',
    'https://evil.example.com#.notify.windows.com/x',
    'https://evil.example.com?.push.apple.com/x',
    'https://evil.example.com\\.push.apple.com/x',
    'https://fcm.googleapis.com/ok\nhttps://evil.example.com/x',
    ' https://fcm.googleapis.com/fcm/send/abc',
    'HTTPS://FCM.GOOGLEAPIS.COM/fcm/send/abc',
    'https://xfcm.googleapis.com/fcm/send/abc',
    'https://fcmXgoogleapis.com/fcm/send/abc',
  ]) {
    it(`refuses ${JSON.stringify(bad)}`, async () => {
      await assertFails(setDoc(ref(asAlice()), subDoc({ endpoint: bad })));
    });
  }
  it('refuses an endpoint over 2048 characters', async () => {
    await assertFails(setDoc(ref(asAlice()), subDoc({ endpoint: FCM + 'x'.repeat(2048) })));
  });
});

describe('/users/{uid}/pushSubs — reading and deleting', () => {
  it('the owner can read, list and delete their own', async () => {
    await seed(); await seed(ID2);
    await assertSucceeds(getDoc(ref(asAlice())));
    await assertSucceeds(getDocs(collection(asAlice(), `users/${ALICE}/pushSubs`)));
    await assertSucceeds(deleteDoc(ref(asAlice())));
  });
  it('a stranger CANNOT read, list or delete them', async () => {
    await seed();
    await assertFails(getDoc(ref(asBob())));
    await assertFails(getDocs(collection(asBob(), `users/${ALICE}/pushSubs`)));
    await assertFails(deleteDoc(ref(asBob())));
  });
  it('a signed-out client CANNOT read them', async () => {
    await seed();
    await assertFails(getDoc(ref(asNobody())));
  });
  it('the owner can overwrite their own subscription (language change)', async () => {
    await seed();
    await assertSucceeds(setDoc(ref(asAlice()), subDoc({ lang: 'en' })));
  });
  it('an overwrite CANNOT swap in an address off the list', async () => {
    await seed();
    await assertFails(setDoc(ref(asAlice()), subDoc({ endpoint: 'https://evil.example.com/hook' })));
    await assertFails(setDoc(ref(asAlice()), { endpoint: 'https://evil.example.com/hook' }, { merge: true }));
  });
});
