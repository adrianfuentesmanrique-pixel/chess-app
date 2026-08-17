// Rules tests for the Masterclass collections:
//   masterclasses/{mcId}
//   masterclasses/{mcId}/members/{uid}
//   masterclasses/{mcId}/chapters/{chapterId}
//   masterclasses/{mcId}/live/state
//
// Why these matter: unlike /leaderboard, NOTHING here is world-readable, and
// unlike /users nobody is writing only their own document. A membership
// document is an access grant — it is what lets someone read another person's
// chapters — so every allow and every deny gets a test.
//
// Run with:  npm run test:rules
// Local emulator only. Nothing here touches the real project.

import { before, after, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc, collection, collectionGroup, query, where, getDoc, getDocs,
  setDoc, updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';

const OWNER = 'owner_uid';
const VIEWER = 'viewer_uid';       // a member with role 'viewer'
const EDITOR = 'editor_uid';       // role 'editor' — stage 1 grants it NOTHING
const STRANGER = 'stranger_uid';   // in no class at all

const MC = 'mc1';
const MC2 = 'mc2';

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    // A DIFFERENT projectId from the other two suites, on purpose. `node --test`
    // runs the test FILES in parallel, and clearFirestore() below wipes the
    // whole project — which was deleting friends.test.js's seeded documents
    // mid-test and failing it for the wrong reason. The emulator keeps each
    // projectId's data separate, so this isolates the two without touching the
    // existing suites. Same firestore.rules either way.
    projectId: 'chess-training-center-mc',
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

// Every test starts from an empty database, because almost every rule here
// depends on whether some OTHER document exists — a leftover membership from a
// previous test would quietly make a "deny" test pass for the wrong reason.
beforeEach(async () => {
  await testEnv.clearFirestore();
});

async function seed(path, data) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}

const asOwner = () => testEnv.authenticatedContext(OWNER).firestore();
const asViewer = () => testEnv.authenticatedContext(VIEWER).firestore();
const asEditor = () => testEnv.authenticatedContext(EDITOR).firestore();
const asStranger = () => testEnv.authenticatedContext(STRANGER).firestore();
const asNobody = () => testEnv.unauthenticatedContext().firestore();

// The class document as the client writes it. serverTimestamp() is what the
// rules mean by request.time — a Date.now() number is rejected on purpose.
const klass = (ownerUid = OWNER, over = {}) => ({
  ownerUid,
  name: 'Endgames with Kael',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  memberCount: 1,
  ...over,
});

const member = (uid, role = 'viewer', addedBy = OWNER) => ({
  uid, role, addedBy, addedAt: serverTimestamp(),
});

const chapter = (over = {}) => ({
  title: 'Lucena position',
  pgn: '[Event "?"]\n\n1. e4 e5 *',
  startFen: '8/8/8/8/8/8/8/8 w - - 0 1',
  order: 0,
  updatedAt: serverTimestamp(),
  updatedBy: OWNER,
  ...over,
});

const live = (over = {}) => ({
  chapterId: 'ch1',
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  path: 'e4 e5 Nf3',
  drivenBy: OWNER,
  updatedAt: serverTimestamp(),
  ...over,
});

// A class that exists, with the owner's own bootstrap membership already in it.
// Seeded with the rules disabled, so this says nothing about whether the rules
// would have allowed it — tests 1 and 12 cover that.
async function seedClass(mcId = MC, ownerUid = OWNER) {
  await seed(`masterclasses/${mcId}`, { ...klass(ownerUid), createdAt: new Date(), updatedAt: new Date() });
  await seed(`masterclasses/${mcId}/members/${ownerUid}`,
    { uid: ownerUid, role: 'owner', addedBy: ownerUid, addedAt: new Date() });
}

async function seedMember(uid, role = 'viewer', mcId = MC) {
  await seed(`masterclasses/${mcId}/members/${uid}`,
    { uid, role, addedBy: OWNER, addedAt: new Date() });
}

// ═══════════════════ masterclasses/{mcId} — the class ═══════════════════

describe('/masterclasses — the class document', () => {
  it('1. the owner CAN create a class with ownerUid == self', async () => {
    await assertSucceeds(setDoc(doc(asOwner(), `masterclasses/${MC}`), klass(OWNER)));
  });

  it('2. CANNOT create a class owned by somebody else', async () => {
    await assertFails(setDoc(doc(asOwner(), `masterclasses/${MC}`), klass(VIEWER)));
  });

  it('3. CANNOT create with an unlisted field', async () => {
    await assertFails(setDoc(doc(asOwner(), `masterclasses/${MC}`),
      klass(OWNER, { secret: 'payload' })));
  });

  it('4. CANNOT create with a name longer than 60 characters', async () => {
    await assertFails(setDoc(doc(asOwner(), `masterclasses/${MC}`),
      klass(OWNER, { name: 'x'.repeat(61) })));
  });

  it('5. a member CAN get the class', async () => {
    await seedClass();
    await seedMember(VIEWER);
    await assertSucceeds(getDoc(doc(asViewer(), `masterclasses/${MC}`)));
  });

  it('6. a non-member CANNOT get the class', async () => {
    await seedClass();
    await assertFails(getDoc(doc(asStranger(), `masterclasses/${MC}`)));
  });

  // Anti-enumeration: `allow list` is false, so not even the owner can walk the
  // collection. Class ids are only ever reached through a membership document.
  it('7. NOBODY can list the masterclasses collection', async () => {
    await seedClass();
    await assertFails(getDocs(collection(asOwner(), 'masterclasses')));
    await assertFails(getDocs(collection(asStranger(), 'masterclasses')));
  });

  it('8. the owner CAN rename the class but CANNOT change ownerUid', async () => {
    await seedClass();
    await assertSucceeds(updateDoc(doc(asOwner(), `masterclasses/${MC}`),
      { name: 'Rook endings', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(asOwner(), `masterclasses/${MC}`),
      { ownerUid: VIEWER, updatedAt: serverTimestamp() }));
  });

  it('9. a member who is not the owner CANNOT update the class', async () => {
    await seedClass();
    await seedMember(VIEWER);
    await assertFails(updateDoc(doc(asViewer(), `masterclasses/${MC}`),
      { name: 'Mine now', updatedAt: serverTimestamp() }));
  });

  it('10. the owner CAN delete the class; a member CANNOT', async () => {
    await seedClass();
    await seedMember(VIEWER);
    await assertFails(deleteDoc(doc(asViewer(), `masterclasses/${MC}`)));
    await assertSucceeds(deleteDoc(doc(asOwner(), `masterclasses/${MC}`)));
  });
});

// ═══════════════════ masterclasses/{mcId}/members ═══════════════════

describe('/masterclasses/{id}/members — who is in the class', () => {
  it('11. the owner CAN add a viewer', async () => {
    await seedClass();
    await assertSucceeds(setDoc(doc(asOwner(), `masterclasses/${MC}/members/${VIEWER}`),
      member(VIEWER, 'viewer')));
  });

  // The bootstrap case. Admin decisions key off the parent's ownerUid, not off
  // a member document, precisely so this first write can go through.
  it('12. the owner CAN create their own owner membership', async () => {
    await seed(`masterclasses/${MC}`, { ...klass(OWNER), createdAt: new Date(), updatedAt: new Date() });
    await assertSucceeds(setDoc(doc(asOwner(), `masterclasses/${MC}/members/${OWNER}`),
      member(OWNER, 'owner', OWNER)));
  });

  it('13. a viewer CANNOT add anybody', async () => {
    await seedClass();
    await seedMember(VIEWER);
    await assertFails(setDoc(doc(asViewer(), `masterclasses/${MC}/members/${STRANGER}`),
      member(STRANGER, 'viewer', VIEWER)));
  });

  // No self-join in stage 1. Link invites in stage 2 add a second create
  // branch; until then, walking up to a class id and writing yourself in fails.
  it('14. a stranger CANNOT add themselves', async () => {
    await seedClass();
    await assertFails(setDoc(doc(asStranger(), `masterclasses/${MC}/members/${STRANGER}`),
      member(STRANGER, 'viewer', STRANGER)));
  });

  // The id is what the recursive read rule checks and the field is what the
  // collection-group query filters on. They must agree or the field could point
  // the query at a document the id rule never meant to expose.
  it('15. a uid field that does not match the document id is denied', async () => {
    await seedClass();
    await assertFails(setDoc(doc(asOwner(), `masterclasses/${MC}/members/${VIEWER}`),
      member(STRANGER, 'viewer')));
  });

  it('16. a role outside owner/editor/viewer is denied', async () => {
    await seedClass();
    await assertFails(setDoc(doc(asOwner(), `masterclasses/${MC}/members/${VIEWER}`),
      member(VIEWER, 'admin')));
  });

  it('17. the owner CANNOT add somebody who has blocked them', async () => {
    await seedClass();
    await seed(`blocks/${VIEWER}/blocked/${OWNER}`, { createdAt: Date.now() });
    await assertFails(setDoc(doc(asOwner(), `masterclasses/${MC}/members/${VIEWER}`),
      member(VIEWER, 'viewer')));
  });

  it('18. a member CAN read the other members of their class', async () => {
    await seedClass();
    await seedMember(VIEWER);
    await assertSucceeds(getDocs(collection(asViewer(), `masterclasses/${MC}/members`)));
    await assertSucceeds(getDoc(doc(asViewer(), `masterclasses/${MC}/members/${OWNER}`)));
  });

  it('19. a non-member CANNOT read the members', async () => {
    await seedClass();
    await seedMember(VIEWER);
    await assertFails(getDocs(collection(asStranger(), `masterclasses/${MC}/members`)));
    await assertFails(getDoc(doc(asStranger(), `masterclasses/${MC}/members/${VIEWER}`)));
  });

  it('20. a member CAN delete their own membership (leave the class)', async () => {
    await seedClass();
    await seedMember(VIEWER);
    await assertSucceeds(deleteDoc(doc(asViewer(), `masterclasses/${MC}/members/${VIEWER}`)));
  });

  it('21. a member CANNOT delete somebody else\'s membership', async () => {
    await seedClass();
    await seedMember(VIEWER);
    await seedMember(EDITOR, 'editor');
    await assertFails(deleteDoc(doc(asViewer(), `masterclasses/${MC}/members/${EDITOR}`)));
  });

  // Leaving your own class would orphan it: nobody could read it afterwards,
  // because every read needs a membership document or the ownerUid match.
  it('22. the owner CANNOT delete their own membership', async () => {
    await seedClass();
    await assertFails(deleteDoc(doc(asOwner(), `masterclasses/${MC}/members/${OWNER}`)));
  });

  it('23. the owner CAN remove any other member', async () => {
    await seedClass();
    await seedMember(VIEWER);
    await assertSucceeds(deleteDoc(doc(asOwner(), `masterclasses/${MC}/members/${VIEWER}`)));
  });

  // This is the query fetchMyMasterclasses() runs in Task 3. The recursive
  // wildcard rule pins the document id to my own uid, so it can never hand back
  // anybody else's membership — asking for one is denied outright.
  it('24. the collection-group query returns only my own memberships', async () => {
    await seedClass(MC, OWNER);
    await seedClass(MC2, OWNER);
    await seedMember(VIEWER, 'viewer', MC);
    await seedMember(STRANGER, 'viewer', MC2);

    await assertSucceeds(getDocs(query(
      collectionGroup(asViewer(), 'members'), where('uid', '==', VIEWER))));
    await assertFails(getDocs(query(
      collectionGroup(asViewer(), 'members'), where('uid', '==', STRANGER))));
    await assertFails(getDocs(collectionGroup(asViewer(), 'members')));
  });
});

// ═══════════════════ masterclasses/{mcId}/chapters ═══════════════════

describe('/masterclasses/{id}/chapters — the content', () => {
  it('25. the owner CAN create a chapter', async () => {
    await seedClass();
    await assertSucceeds(setDoc(doc(asOwner(), `masterclasses/${MC}/chapters/ch1`), chapter()));
  });

  it('26. a viewer CANNOT create, update or delete a chapter', async () => {
    await seedClass();
    await seedMember(VIEWER);
    await seed(`masterclasses/${MC}/chapters/ch1`,
      { ...chapter(), updatedAt: new Date() });
    await assertFails(setDoc(doc(asViewer(), `masterclasses/${MC}/chapters/ch2`),
      chapter({ updatedBy: VIEWER })));
    await assertFails(updateDoc(doc(asViewer(), `masterclasses/${MC}/chapters/ch1`),
      { title: 'Hijacked', updatedAt: serverTimestamp(), updatedBy: VIEWER }));
    await assertFails(deleteDoc(doc(asViewer(), `masterclasses/${MC}/chapters/ch1`)));
  });

  // The real anti-abuse bound — the 50-chapter, 30-member and 5-class caps are
  // UI-side and advisory. This one is enforced here.
  it('27. a pgn over 100,000 bytes is denied', async () => {
    await seedClass();
    await assertFails(setDoc(doc(asOwner(), `masterclasses/${MC}/chapters/ch1`),
      chapter({ pgn: 'x'.repeat(100001) })));
  });

  it('28. a title over 80 characters is denied', async () => {
    await seedClass();
    await assertFails(setDoc(doc(asOwner(), `masterclasses/${MC}/chapters/ch1`),
      chapter({ title: 'x'.repeat(81) })));
  });

  it('29. a member CAN read chapters; a non-member CANNOT', async () => {
    await seedClass();
    await seedMember(VIEWER);
    await seed(`masterclasses/${MC}/chapters/ch1`, { ...chapter(), updatedAt: new Date() });
    await assertSucceeds(getDoc(doc(asViewer(), `masterclasses/${MC}/chapters/ch1`)));
    await assertFails(getDoc(doc(asStranger(), `masterclasses/${MC}/chapters/ch1`)));
  });

  // STAGE 2 FLIPS THIS. 'editor' is a legal stored role from day one, but
  // stage 1 grants it nothing; when the editor role ships, this test becomes
  // assertSucceeds and the rule gains `|| mcRole(mcId) == 'editor'`.
  it('30. an editor CANNOT yet write a chapter', async () => {
    await seedClass();
    await seedMember(EDITOR, 'editor');
    await assertFails(setDoc(doc(asEditor(), `masterclasses/${MC}/chapters/ch2`),
      chapter({ updatedBy: EDITOR })));
  });
});

// ═══════════════════ masterclasses/{mcId}/live/state ═══════════════════

describe('/masterclasses/{id}/live — the followed board', () => {
  it('31. the owner CAN write live/state', async () => {
    await seedClass();
    await assertSucceeds(setDoc(doc(asOwner(), `masterclasses/${MC}/live/state`), live()));
  });

  it('32. a viewer CANNOT write live/state', async () => {
    await seedClass();
    await seedMember(VIEWER);
    await assertFails(setDoc(doc(asViewer(), `masterclasses/${MC}/live/state`),
      live({ drivenBy: VIEWER })));
  });

  it('33. a member CAN read live/state; a non-member CANNOT', async () => {
    await seedClass();
    await seedMember(VIEWER);
    await seed(`masterclasses/${MC}/live/state`, { ...live(), updatedAt: new Date() });
    await assertSucceeds(getDoc(doc(asViewer(), `masterclasses/${MC}/live/state`)));
    await assertFails(getDoc(doc(asStranger(), `masterclasses/${MC}/live/state`)));
  });

  it('34. a path longer than 512 characters is denied', async () => {
    await seedClass();
    await assertFails(setDoc(doc(asOwner(), `masterclasses/${MC}/live/state`),
      live({ path: 'e4 '.repeat(200) })));
  });

  // One document, fixed id. Any other id is refused so live/ cannot quietly
  // become a second content store with no size rules on it.
  it('35. a live document with an id other than "state" is denied', async () => {
    await seedClass();
    await assertFails(setDoc(doc(asOwner(), `masterclasses/${MC}/live/other`), live()));
  });
});
