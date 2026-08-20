// Rules tests for phone notifications: the users/{uid}/fcmTokens subcollection,
// and the new notification fields on the users/{uid} document.
//
// Why these matter: two of the new user fields — lastNudgeDate and
// lastWarnDate — are the ONLY thing enforcing the two-notifications-a-day
// ceiling. They are written by the Cloud Functions with the Admin SDK, which
// bypasses these rules entirely. A client that could write them could silence
// itself or spam itself, so "the client cannot write them" needs a test, not a
// code comment.
//
// And rules do NOT cascade from users/{userId} into a subcollection, so
// fcmTokens needs its own match block or nobody can register a device at all.
//
// Run with:  npm run test:rules
// Local emulator only. Nothing here touches the real project.

import { before, after, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc, collection, getDoc, getDocs, setDoc, deleteDoc,
} from 'firebase/firestore';

const ALICE = 'alice_uid';
const BOB = 'bob_uid';

// A real FCM registration token is ~163 chars of base64url. These are
// deliberately longer than that so nothing here depends on a short id.
const TOK = `tok_${'a'.repeat(200)}`;
const TOK2 = `tok_${'b'.repeat(200)}`;

const NOW = 1755000000000;

// The full shape a device writes. createdAt is a serverTimestamp() in the real
// client; a plain number is fine here because no rule looks at its type.
const tokenDoc = (id, over = {}) => ({
  token: id, createdAt: NOW, platform: 'android', lang: 'en', ...over,
});

const PREFS = { daily: true, warn: false, friends: true, live: true };

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
const asNobody = () => testEnv.unauthenticatedContext().firestore();

// A merge write onto Alice's own user document, which is what the app does.
const writeAlice = (db, data) =>
  setDoc(doc(db, `users/${ALICE}`), data, { merge: true });

// ══════════════════ users/{uid}/fcmTokens/{tokenId} ══════════════════

describe('/users/{uid}/fcmTokens — registering a device', () => {
  // 1
  it('the owner can register a token whose field matches the document id', async () => {
    await assertSucceeds(setDoc(
      doc(asAlice(), `users/${ALICE}/fcmTokens/${TOK}`), tokenDoc(TOK)));
  });

  // 2
  it('a stranger CANNOT register a token under someone else\'s uid', async () => {
    await assertFails(setDoc(
      doc(asBob(), `users/${ALICE}/fcmTokens/${TOK}`), tokenDoc(TOK)));
  });

  // 3
  it('a signed-out client CANNOT register a token', async () => {
    await assertFails(setDoc(
      doc(asNobody(), `users/${ALICE}/fcmTokens/${TOK}`), tokenDoc(TOK)));
  });

  // 4
  it('a token FIELD that does not match the document id is denied', async () => {
    // The id is what the rule can check; the field is what a query can filter
    // on. If they can disagree, the field is worthless to the function.
    await assertFails(setDoc(
      doc(asAlice(), `users/${ALICE}/fcmTokens/${TOK}`), tokenDoc(TOK2)));
  });

  // 5
  it('a token string over 4096 chars is denied', async () => {
    // Said honestly: this write is denied by BOTH the size cap and the
    // token == tokenId check, because a Firestore document id cannot itself
    // exceed 1500 bytes, so the cap can never be reached while the ids match.
    // The cap is belt-and-braces against the id rule ever being relaxed.
    const huge = 'z'.repeat(5000);
    await assertFails(setDoc(
      doc(asAlice(), `users/${ALICE}/fcmTokens/${TOK}`), tokenDoc(TOK, { token: huge })));
  });

  // 6
  it('an unlisted field on the token document is denied', async () => {
    await assertFails(setDoc(
      doc(asAlice(), `users/${ALICE}/fcmTokens/${TOK}`),
      tokenDoc(TOK, { isAdmin: true })));
  });

  // 7
  it('a platform outside the four known values is denied', async () => {
    await assertFails(setDoc(
      doc(asAlice(), `users/${ALICE}/fcmTokens/${TOK}`),
      tokenDoc(TOK, { platform: 'toaster' })));
  });

  // 8
  it('a lang outside es/en is denied', async () => {
    await assertFails(setDoc(
      doc(asAlice(), `users/${ALICE}/fcmTokens/${TOK}`),
      tokenDoc(TOK, { lang: 'fr' })));
  });
});

describe('/users/{uid}/fcmTokens — reading and removing', () => {
  // 9
  it('the owner can delete their own token', async () => {
    await seed(`users/${ALICE}/fcmTokens/${TOK}`, tokenDoc(TOK));
    await assertSucceeds(deleteDoc(doc(asAlice(), `users/${ALICE}/fcmTokens/${TOK}`)));
  });

  // 10
  it('a stranger CANNOT delete someone else\'s token', async () => {
    await seed(`users/${ALICE}/fcmTokens/${TOK}`, tokenDoc(TOK));
    await assertFails(deleteDoc(doc(asBob(), `users/${ALICE}/fcmTokens/${TOK}`)));
  });

  // 11
  it('the owner can list their own tokens (this is the query the app runs)', async () => {
    await seed(`users/${ALICE}/fcmTokens/${TOK}`, tokenDoc(TOK));
    await assertSucceeds(getDocs(collection(asAlice(), `users/${ALICE}/fcmTokens`)));
  });

  // 12
  it('a stranger CANNOT list someone else\'s tokens', async () => {
    await seed(`users/${ALICE}/fcmTokens/${TOK}`, tokenDoc(TOK));
    await assertFails(getDocs(collection(asBob(), `users/${ALICE}/fcmTokens`)));
  });

  it('a stranger CANNOT read a single token document', async () => {
    await seed(`users/${ALICE}/fcmTokens/${TOK}`, tokenDoc(TOK));
    await assertFails(getDoc(doc(asBob(), `users/${ALICE}/fcmTokens/${TOK}`)));
  });
});

// ══════════════════ users/{uid} — the new fields ══════════════════

describe('/users/{uid} — notification preferences', () => {
  // 13
  it('the owner can set the four notifPrefs toggles', async () => {
    await assertSucceeds(writeAlice(asAlice(), { notifPrefs: PREFS }));
  });

  // 14
  it('a notifPrefs map with a fifth key is denied', async () => {
    await assertFails(writeAlice(asAlice(), {
      notifPrefs: { ...PREFS, marketing: true },
    }));
  });

  it('a notifPrefs map with only some of the four keys is allowed', async () => {
    // hasOnly, not hasAll — one toggle flipped is a legitimate merge write.
    await assertSucceeds(writeAlice(asAlice(), { notifPrefs: { daily: false } }));
  });
});

describe('/users/{uid} — the hour fields', () => {
  // 15
  it('remindHourLocal 19 is allowed', async () => {
    await assertSucceeds(writeAlice(asAlice(), { remindHourLocal: 19 }));
  });

  it('remindHourLocal 24 is denied', async () => {
    await assertFails(writeAlice(asAlice(), { remindHourLocal: 24 }));
  });

  it('remindHourLocal -1 is denied', async () => {
    await assertFails(writeAlice(asAlice(), { remindHourLocal: -1 }));
  });

  it('remindHourLocal "19" (a string) is denied', async () => {
    await assertFails(writeAlice(asAlice(), { remindHourLocal: '19' }));
  });

  // 16
  it('notifyHourUtc 0 is allowed, 24 / -1 / "0" are denied', async () => {
    await assertSucceeds(writeAlice(asAlice(), { notifyHourUtc: 0 }));
    await assertFails(writeAlice(asAlice(), { notifyHourUtc: 24 }));
    await assertFails(writeAlice(asAlice(), { notifyHourUtc: -1 }));
    await assertFails(writeAlice(asAlice(), { notifyHourUtc: '0' }));
  });

  it('warnHourUtc 23 is allowed, 24 / -1 / "23" are denied', async () => {
    await assertSucceeds(writeAlice(asAlice(), { warnHourUtc: 23 }));
    await assertFails(writeAlice(asAlice(), { warnHourUtc: 24 }));
    await assertFails(writeAlice(asAlice(), { warnHourUtc: -1 }));
    await assertFails(writeAlice(asAlice(), { warnHourUtc: '23' }));
  });

  it('an hour that is not a whole number is denied', async () => {
    // `is int`, not num(): a double would never match the function's hour
    // comparison, so it must not be storable in the first place.
    await assertFails(writeAlice(asAlice(), { remindHourLocal: 19.5 }));
  });
});

describe('/users/{uid} — timeZone', () => {
  // 17
  it('a normal IANA zone is allowed', async () => {
    await assertSucceeds(writeAlice(asAlice(), { timeZone: 'America/Panama' }));
  });

  it('a timeZone over 64 chars is denied', async () => {
    await assertFails(writeAlice(asAlice(), { timeZone: 'A'.repeat(65) }));
  });
});

describe('/users/{uid} — the send-history fields belong to the function', () => {
  // 18 — the important one.
  it('the client CANNOT write lastNudgeDate', async () => {
    await seed(`users/${ALICE}`, { firstName: 'Alice' });
    await assertFails(writeAlice(asAlice(), { lastNudgeDate: '2026-08-20' }));
  });

  // 19
  it('the client CANNOT write lastWarnDate', async () => {
    await seed(`users/${ALICE}`, { firstName: 'Alice' });
    await assertFails(writeAlice(asAlice(), { lastWarnDate: '2026-08-20' }));
  });

  it('the client CANNOT write lastNudgeDate on a CREATE either', async () => {
    // The null-resource guard must not become a hole: a brand new document
    // is still not allowed to arrive with a send date already in it.
    await assertFails(writeAlice(asAlice(), { lastNudgeDate: '2026-08-20' }));
  });

  it('the client CANNOT overwrite lastNudgeDate with a different value', async () => {
    await seed(`users/${ALICE}`, { firstName: 'Alice', lastNudgeDate: '2026-08-20' });
    await assertFails(writeAlice(asAlice(), { lastNudgeDate: '2026-01-01' }));
  });

  // 20
  it('an update touching neither date field still succeeds', async () => {
    await seed(`users/${ALICE}`, {
      firstName: 'Alice', lastNudgeDate: '2026-08-20', lastWarnDate: '2026-08-20',
    });
    await assertSucceeds(writeAlice(asAlice(), { puzzleElo: 1600 }));
  });
});

describe('/users/{uid} — the create path and the owner check', () => {
  // 21 — the trap. resource.data is NULL on a create, so an unguarded
  // after().diff(resource.data) errors and denies the very first write of
  // every new account.
  it('creating the user document for the first time succeeds', async () => {
    await assertSucceeds(setDoc(
      doc(asAlice(), `users/${ALICE}`),
      { firstName: 'Alice', email: 'a@example.com' }));
  });

  it('creating the user document with the new fields succeeds', async () => {
    await assertSucceeds(setDoc(doc(asAlice(), `users/${ALICE}`), {
      firstName: 'Alice',
      timeZone: 'America/Panama',
      remindHourLocal: 19,
      notifyHourUtc: 0,
      warnHourUtc: 3,
      notifPrefs: PREFS,
      notifAskedCount: 1,
    }));
  });

  // 22
  it('a stranger CANNOT read someone else\'s user document', async () => {
    await seed(`users/${ALICE}`, { firstName: 'Alice' });
    await assertFails(getDoc(doc(asBob(), `users/${ALICE}`)));
  });

  it('a stranger CANNOT write someone else\'s user document', async () => {
    await seed(`users/${ALICE}`, { firstName: 'Alice' });
    await assertFails(writeAlice(asBob(), { notifPrefs: PREFS }));
  });

  it('a signed-out visitor CANNOT read or write a user document', async () => {
    await seed(`users/${ALICE}`, { firstName: 'Alice' });
    await assertFails(getDoc(doc(asNobody(), `users/${ALICE}`)));
    await assertFails(writeAlice(asNobody(), { notifPrefs: PREFS }));
  });
});
