// Rules tests for the collections that ALREADY EXIST: /users and /leaderboard.
//
// These were written before the Friends feature added anything, on purpose.
// The write rules in firestore.rules had never been tested against anything —
// this file is the baseline that proves the current behaviour, so that when the
// Friends rules are added we can tell a real regression from a new rule.
//
// Run with:  npm run test:rules
// It starts the Firestore emulator, runs these, and shuts it down again.
// NOTHING here touches the real project — the emulator is local and empty.

import { before, after, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';

const ALICE = 'alice_uid';
const BOB = 'bob_uid';

// A minimal public doc that satisfies every rule — tests below start from this
// and change one thing at a time, so a failure names the clause that caused it.
const validPublic = {
  profileName: 'Alice',
  username: 'alice',
  avatarId: 'knight',
  puzzleElo: 1500,
  profileVisibility: 'public',
  updatedAt: 1755000000000,
};

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

// Fresh data for each group, written with the rules switched off so that
// seeding never depends on the rules being correct.
async function seed(path, data) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}

const asAlice = () => testEnv.authenticatedContext(ALICE).firestore();
const asBob = () => testEnv.authenticatedContext(BOB).firestore();
const asNobody = () => testEnv.unauthenticatedContext().firestore();

// ═══════════════════════════ /users/{uid} ═══════════════════════════
// The private mirror. Nobody but the owner should get near it — it holds
// real name, email and date of birth.

describe('/users/{uid}', () => {
  it('the owner can read their own document', async () => {
    await seed(`users/${ALICE}`, { firstName: 'Alice', email: 'a@example.com' });
    await assertSucceeds(getDoc(doc(asAlice(), `users/${ALICE}`)));
  });

  it('the owner can write their own document', async () => {
    await assertSucceeds(setDoc(doc(asAlice(), `users/${ALICE}`), { puzzleElo: 1600 }, { merge: true }));
  });

  it('another signed-in user CANNOT read it', async () => {
    await seed(`users/${ALICE}`, { firstName: 'Alice', email: 'a@example.com' });
    await assertFails(getDoc(doc(asBob(), `users/${ALICE}`)));
  });

  it('another signed-in user CANNOT write it', async () => {
    await assertFails(setDoc(doc(asBob(), `users/${ALICE}`), { puzzleElo: 9999 }, { merge: true }));
  });

  it('a signed-out visitor CANNOT read it', async () => {
    await seed(`users/${ALICE}`, { firstName: 'Alice' });
    await assertFails(getDoc(doc(asNobody(), `users/${ALICE}`)));
  });
});

// ═══════════════════════ /leaderboard/{uid} ═══════════════════════
// World-readable by design. Everything protective here is about WHAT may be
// written, not just who — the field allowlist is what keeps real name and
// email off a public document even if the app code were compromised.

describe('/leaderboard/{uid} — reading', () => {
  it('a signed-out visitor CAN read it (the leaderboard works logged out)', async () => {
    await seed(`leaderboard/${ALICE}`, validPublic);
    await assertSucceeds(getDoc(doc(asNobody(), `leaderboard/${ALICE}`)));
  });
});

describe('/leaderboard/{uid} — who may write', () => {
  it('the owner can write their own entry', async () => {
    await assertSucceeds(setDoc(doc(asAlice(), `leaderboard/${ALICE}`), validPublic));
  });

  it('another user CANNOT write someone else\'s entry', async () => {
    await assertFails(setDoc(doc(asBob(), `leaderboard/${ALICE}`), validPublic));
  });

  it('a signed-out visitor CANNOT write', async () => {
    await assertFails(setDoc(doc(asNobody(), `leaderboard/${ALICE}`), validPublic));
  });

  it('the owner can delete their own entry (account deletion depends on this)', async () => {
    await seed(`leaderboard/${ALICE}`, validPublic);
    await assertSucceeds(deleteDoc(doc(asAlice(), `leaderboard/${ALICE}`)));
  });

  it('another user CANNOT delete someone else\'s entry', async () => {
    await seed(`leaderboard/${ALICE}`, validPublic);
    await assertFails(deleteDoc(doc(asBob(), `leaderboard/${ALICE}`)));
  });
});

describe('/leaderboard/{uid} — the field allowlist (the privacy promise)', () => {
  it('CANNOT publish an email address', async () => {
    await assertFails(setDoc(doc(asAlice(), `leaderboard/${ALICE}`),
      { ...validPublic, email: 'a@example.com' }));
  });

  it('CANNOT publish a real name', async () => {
    await assertFails(setDoc(doc(asAlice(), `leaderboard/${ALICE}`),
      { ...validPublic, firstName: 'Alice', lastName: 'Smith' }));
  });

  it('CANNOT publish a date of birth', async () => {
    await assertFails(setDoc(doc(asAlice(), `leaderboard/${ALICE}`),
      { ...validPublic, dateOfBirth: '1990-01-01' }));
  });

  it('CANNOT use the public doc as free storage (any unlisted field)', async () => {
    await assertFails(setDoc(doc(asAlice(), `leaderboard/${ALICE}`),
      { ...validPublic, somethingElse: 'x'.repeat(1000) }));
  });
});

describe('/leaderboard/{uid} — the private-profile guarantee', () => {
  it('a PUBLIC profile may carry the detail maps', async () => {
    await assertSucceeds(setDoc(doc(asAlice(), `leaderboard/${ALICE}`), {
      ...validPublic,
      profileVisibility: 'public',
      puzzleThemeElo: { fork: 1500 },
      openingElo: { 'Ruy Lopez': 1400 },
      endgameElo: { rook: 1300 },
      streakCount: 7,
    }));
  });

  it('a PRIVATE profile CANNOT carry puzzleThemeElo', async () => {
    await assertFails(setDoc(doc(asAlice(), `leaderboard/${ALICE}`),
      { ...validPublic, profileVisibility: 'private', puzzleThemeElo: { fork: 1500 } }));
  });

  it('a PRIVATE profile CANNOT carry openingElo', async () => {
    await assertFails(setDoc(doc(asAlice(), `leaderboard/${ALICE}`),
      { ...validPublic, profileVisibility: 'private', openingElo: { 'Ruy Lopez': 1400 } }));
  });

  it('a PRIVATE profile CANNOT carry endgameElo', async () => {
    await assertFails(setDoc(doc(asAlice(), `leaderboard/${ALICE}`),
      { ...validPublic, profileVisibility: 'private', endgameElo: { rook: 1300 } }));
  });

  it('a PRIVATE profile CANNOT carry streakCount', async () => {
    await assertFails(setDoc(doc(asAlice(), `leaderboard/${ALICE}`),
      { ...validPublic, profileVisibility: 'private', streakCount: 7 }));
  });

  it('a PRIVATE profile CAN still publish its averages and ranked scores', async () => {
    await assertSucceeds(setDoc(doc(asAlice(), `leaderboard/${ALICE}`), {
      ...validPublic,
      profileVisibility: 'private',
      openingEloAvg: 1400,
      endgameEloAvg: 1300,
      blindfoldElo: 1250,
    }));
  });

  it('an unrecognised visibility word is rejected outright', async () => {
    await assertFails(setDoc(doc(asAlice(), `leaderboard/${ALICE}`),
      { ...validPublic, profileVisibility: 'frends' }));
  });
});

describe('/leaderboard/{uid} — forged scores', () => {
  it('CANNOT write an impossible puzzle ELO', async () => {
    await assertFails(setDoc(doc(asAlice(), `leaderboard/${ALICE}`),
      { ...validPublic, puzzleElo: 999999 }));
  });

  it('CANNOT write a negative puzzle ELO', async () => {
    await assertFails(setDoc(doc(asAlice(), `leaderboard/${ALICE}`),
      { ...validPublic, puzzleElo: -50 }));
  });

  it('CANNOT write an impossible Rush score', async () => {
    await assertFails(setDoc(doc(asAlice(), `leaderboard/${ALICE}`),
      { ...validPublic, rushBest180: 100000 }));
  });

  it('CANNOT write a puzzle ELO as a string', async () => {
    await assertFails(setDoc(doc(asAlice(), `leaderboard/${ALICE}`),
      { ...validPublic, puzzleElo: '9999' }));
  });

  it('CAN write a believable top score', async () => {
    await assertSucceeds(setDoc(doc(asAlice(), `leaderboard/${ALICE}`),
      { ...validPublic, puzzleElo: 3200, rushBest180: 75 }));
  });
});

describe('/leaderboard/{uid} — oversized text', () => {
  it('CANNOT write a 61-character display name', async () => {
    await assertFails(setDoc(doc(asAlice(), `leaderboard/${ALICE}`),
      { ...validPublic, profileName: 'a'.repeat(61) }));
  });

  it('CANNOT write a 61-character username', async () => {
    await assertFails(setDoc(doc(asAlice(), `leaderboard/${ALICE}`),
      { ...validPublic, username: 'a'.repeat(61) }));
  });

  it('CAN write a name at exactly the 60-character limit', async () => {
    await assertSucceeds(setDoc(doc(asAlice(), `leaderboard/${ALICE}`),
      { ...validPublic, profileName: 'a'.repeat(60) }));
  });
});
