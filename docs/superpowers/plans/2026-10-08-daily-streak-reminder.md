# Daily Streak Reminder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a phone notification, at most once a day at an hour the user picks, sent only when the streak is alive and today is not yet credited, at zero cost.

**Architecture:** the app subscribes the device with standard Web Push and stores the subscription under `users/{uid}/pushSubs`. An hourly GitHub Actions job reads who is due with a read-only service account and sends with the `web-push` library. The job writes nothing to Firestore; it remembers the last hour it handled in the Actions cache.

**Tech Stack:** vanilla ES modules (no build step), a hand-written `push` handler in the existing `sw.js`, Firestore rules, Node 24 on GitHub Actions, `web-push`, `@google-cloud/firestore`.

**Spec:** `docs/superpowers/specs/2026-10-08-daily-streak-reminder-design.md` — read it first. Where this plan and the spec disagree, the spec wins and the disagreement is a bug in this plan.

**One task = one session.** Four tasks, four conversations. Do not start the next task in the same conversation.

## Global Constraints

- **Costs nothing, no card anywhere.** Firebase stays on Spark. If any step asks for billing or a card, stop and tell Adrian before doing anything else.
- **No Firebase messaging.** No `firebase-messaging.js`, no `firebase-messaging-sw.js`, no `getToken()`. Do not follow `docs/superpowers/plans/2026-08-17-notifications.md`.
- **Do not touch** the `fcmTokens` rules block, `lastNudgeDate`, `lastWarnDate`, `warnHourUtc`, or `tests/rules/notifications.test.js`. They are inert and stay.
- **The job writes nothing to Firestore** and its service account has exactly one role, Cloud Datastore Viewer.
- **Job logs print counts only.** Never a uid, endpoint, key, name, email or raw error message.
- **Workflow triggers are `schedule` and `workflow_dispatch` only.** Actions pinned to a full commit hash. `npm ci` from a lockfile.
- **Never read whole:** `js/app.js`, `js/firebase.js`, `js/i18n.js`, `firestore.rules`, `HANDOVER.md`. Grep, then Read with offset/limit. Line numbers in this plan were true at commit `6261ff0`; grep the symbol, do not trust the number.
- **Every UI change is checked at 375px, light AND dark, Spanish AND English, with screenshots actually opened and looked at.** The browser pane does not composite on this machine: drive headless Chrome over CDP, copying the harness in `tools/cdp-verify-streak-grey.mjs`.
- **`sw.js` `CACHE` is bumped by one from whatever line 1 says at the time**, in every commit that changes a shipped file. Do not copy a number from this plan.
- **Another session may be editing this folder.** `git status --short` before writing; never stage `HANDOFFS.md`, `docs/superpowers/plans/2026-08-14-friends-system.md` or `tools/stage2-shots/`; re-check the branch before committing.
- **HANDOVER.md is Edit-only.** Add an entry at the top of "Already done and pushed"; never Write the file.
- **Finish by pushing** (CLAUDE.md). Stop and ask only where a task below says so.
- Commands given to Adrian start with `cd C:\Users\Adrian\chess-app;` and use `npm.cmd` / `npx.cmd`; separator `;`.

## Review Focus

Conditions the spec implies that are most likely to bite a real user. Each has its test in the task named.

1. **A push whose payload cannot be parsed** must still show a notification (Task 2, CDP step: deliver the text `not json`).
2. **A user in a half-hour or far-east time zone** must be judged on their own local date, not UTC (Task 3, `due.test.js`: Asia/Kolkata and Pacific/Kiritimati cases).
3. **A run that starts more than an hour late**, or twice, must not repeat an hour (Task 3, `hours.test.js`).
4. **A stored endpoint that is not a push service** must never be called (Task 1 rules test; Task 3 `due.test.js` allowlist case).
5. **Signing out** must stop reminders reaching that phone for the old account (Task 2, CDP step: after sign-out `pushSubId` is null and the switch reads Off).

## File Structure

| File | Task | Responsibility |
|---|---|---|
| `firestore.rules` | 1 | new `users/{userId}/pushSubs/{subId}` block |
| `tests/rules/pushsubs.test.js` | 1 | rules tests for that block |
| `tools/reminder/make-vapid-keys.mjs` | 2 | makes the signing key pair once |
| `js/vapid-public.js` | 2 | generated; the public key constant |
| `tools/resize-notif.mjs` | 2 | shrinks the art with headless Chrome |
| `icons/notif/daily.png`, `icons/notif/badge.png` | 2 | notification icon and badge |
| `js/remind-time.js` | 2 | pure helpers (no imports): UTC hour, labels, key bytes |
| `tests/unit/remind-time.test.js` | 2 | unit tests for those |
| `js/notifications.js` | 2 | the `Notifications` object: state, enable, disable, refresh, UI |
| `js/firebase.js` | 2 | Firestore helpers for prefs and subscriptions; sign-out and delete-account clean-up |
| `js/app.js` | 2 | wires Settings, Profile row, boot, `Streak.recordActivity` |
| `index.html` | 2 | one empty row under the streak ladder |
| `js/i18n.js` | 2 | strings |
| `js/legal-data.js` | 2 | privacy wording |
| `sw.js` | 2 | `push` + `notificationclick`, precache list, cache bump |
| `tools/cdp-verify-remind.mjs` | 2 | the headless check |
| `tools/reminder/package.json`, `package-lock.json` | 3 | the job's own dependencies |
| `tools/reminder/due.mjs` | 3 | pure: who is due, allowlist, which hours |
| `tests/unit/reminder-due.test.js`, `tests/unit/reminder-hours.test.js` | 3 | unit tests |
| `tools/reminder/plan.mjs` | 3 | reads the remembered hour, decides hours, writes the new one |
| `tools/reminder/send.mjs` | 3 | queries, sends, prints counts |
| `.github/workflows/streak-reminder.yml` | 3 | the schedule |

---

### Task 1: The `pushSubs` rules and their tests (session 1)

**Files:**
- Modify: `firestore.rules` (insert directly after the `fcmTokens` block, which ends just before `match /leaderboard/{uid}`)
- Create: `tests/rules/pushsubs.test.js`

**Interfaces:**
- Consumes: the helpers already in `firestore.rules`: `signedIn()`, `me()`, `after()`.
- Produces: a writable `users/{uid}/pushSubs/{subId}` with fields `endpoint`, `p256dh`, `auth`, `createdAt`, `platform`, `lang`; `subId` is 64 lowercase hex.

- [ ] **Step 1: Check it is still undone**

Run: `cd C:\Users\Adrian\chess-app; git log --oneline -15; git status --short`
Then Grep `pushSubs` in `firestore.rules`, `js/`, `tests/`. Expected: no hits. If there are hits, stop and report.

- [ ] **Step 2: Baseline**

Run: `cd C:\Users\Adrian\chess-app; npm.cmd run test:rules`
Expected: `pass 399`, `fail 0` (the number on 2026-10-08; write down what it says now).

- [ ] **Step 3: Write the failing tests**

Create `tests/rules/pushsubs.test.js`:

```js
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
  });
  it('platform and lang must come from their lists', async () => {
    await assertFails(setDoc(ref(asAlice()), subDoc({ platform: 'toaster' })));
    await assertFails(setDoc(ref(asAlice()), subDoc({ lang: 'fr' })));
  });
  it('over-long keys are refused', async () => {
    await assertFails(setDoc(ref(asAlice()), subDoc({ p256dh: 'B'.repeat(257) })));
    await assertFails(setDoc(ref(asAlice()), subDoc({ auth: 'c'.repeat(65) })));
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
  ]) {
    it(`refuses ${bad}`, async () => {
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
});
```

- [ ] **Step 4: Run to see them fail**

Run: `cd C:\Users\Adrian\chess-app; npm.cmd run test:rules`
Expected: every "accepts" / "can" test in the new file FAILS (no rule matches the path, so writes are denied); the "CANNOT" / "refuses" tests pass for the wrong reason. `fail` is above 0.

- [ ] **Step 5: Add the rules block**

In `firestore.rules`, directly after the closing `}` of `match /users/{userId}/fcmTokens/{tokenId} { … }` and before `match /leaderboard/{uid}`:

```
    // One document per device subscribed to the daily streak reminder (standard
    // Web Push, not FCM tokens — the fcmTokens block above is unused and stays).
    // Owner-only in every direction. The hourly job reads these with a
    // read-only service account, which does not consult these rules.
    //
    // The endpoint allowlist is a real control: the job sends an HTTP request
    // to whatever address is stored, so without it a user could make the job
    // call an address of their choosing. The job checks the same list again.
    // matches() tests the WHOLE string, hence the trailing .* ; dots are
    // written [.] so nothing depends on how a backslash survives this file.
    //
    // The id is the SHA-256 of the endpoint, worked out on the device. Only its
    // shape is checked here: the data is private to its owner, so a wrong hash
    // harms nobody but the device that wrote it.
    match /users/{userId}/pushSubs/{subId} {
      allow read, list, delete: if signedIn() && me() == userId;

      allow create, update: if signedIn() && me() == userId
        && subId.matches('^[0-9a-f]{64}$')
        && after().keys().hasOnly(['endpoint','p256dh','auth','createdAt','platform','lang'])
        && after().keys().hasAll(['endpoint','p256dh','auth','createdAt','platform','lang'])
        && after().endpoint is string
        && after().endpoint.size() <= 2048
        && after().endpoint.matches('^https://(fcm[.]googleapis[.]com|[a-z0-9.-]+[.]push[.]apple[.]com|updates[.]push[.]services[.]mozilla[.]com|[a-z0-9.-]+[.]notify[.]windows[.]com)/.*')
        && after().p256dh is string && after().p256dh.size() <= 256
        && after().auth is string && after().auth.size() <= 64
        && after().createdAt == request.time
        && after().platform in ['android','ios','desktop','other']
        && after().lang in ['es','en'];
    }
```

- [ ] **Step 6: Run to see them pass**

Run: `cd C:\Users\Adrian\chess-app; npm.cmd run test:rules`
Expected: `fail 0`, and `pass` is the Step 2 number plus 23. If `https://fcm.googleapis.com` (no path) is accepted, the trailing `/.*` is missing from the pattern.

- [ ] **Step 7: Audit**

Invoke the `firebase-security-rules-auditor` skill on the new block only. Fix anything it finds that is real; re-run Step 6.

- [ ] **Step 8: Commit, then STOP for Adrian**

```
cd C:\Users\Adrian\chess-app; git branch --show-current; git status --short
git add firestore.rules tests/rules/pushsubs.test.js
git commit -m "Rules: users/{uid}/pushSubs - one Web Push subscription per device, owner-only, endpoint allowlist"
```

`firestore.rules` changed, so **do not push yet**. Give Adrian exactly:

```
cd C:\Users\Adrian\chess-app; npm.cmd run rules:deploy
```

Wait for him to say it deployed. Then add the HANDOVER.md entry (Edit, top of "Already done and pushed"), commit it, `git push`, confirm the push. No `sw.js` bump: no shipped file changed.

---

### Task 2: The app side, behind the preview gate (session 2)

**Files:**
- Create: `tools/reminder/make-vapid-keys.mjs`, `js/vapid-public.js` (generated), `tools/resize-notif.mjs`, `icons/notif/daily.png`, `icons/notif/badge.png`, `js/remind-time.js`, `tests/unit/remind-time.test.js`, `js/notifications.js`, `tools/cdp-verify-remind.mjs`
- Modify: `js/firebase.js`, `js/app.js`, `index.html`, `js/i18n.js`, `js/legal-data.js`, `sw.js`

**Interfaces:**
- Consumes: Task 1's deployed rules.
- Produces, for Task 3: documents at `users/{uid}/pushSubs/{sha256(endpoint)}` with `endpoint`, `p256dh`, `auth`, `createdAt`, `platform`, `lang`; and on `users/{uid}`: `remindHourLocal`, `notifyHourUtc`, `timeZone`, `notifPrefs.daily`. Push payload contract the service worker understands: JSON `{"t":"daily","lang":"es"|"en","n":<int>}`. Public key in `js/vapid-public.js`, exporting `VAPID_PUBLIC_KEY`.

- [ ] **Step 1: Check it is still undone**

Run: `cd C:\Users\Adrian\chess-app; git log --oneline -15; git status --short`
Grep `pushSubs` in `firestore.rules` (must be there: Task 1) and in `js/` (must not be). Grep `addEventListener('push'` in `sw.js` (must not be there). Ask Adrian to confirm the rules are deployed if HANDOVER does not say so.

- [ ] **Step 2: The signing key pair**

Create `tools/reminder/make-vapid-keys.mjs`:

```js
// Makes the Web Push signing key pair ONCE. Dev tool, not shipped.
//
//   node tools/reminder/make-vapid-keys.mjs
//
// The PUBLIC key goes into js/vapid-public.js (committed; it is not a secret).
// The PRIVATE key goes into a file OUTSIDE the repository and is never printed:
// Adrian pastes it into the GitHub secret VAPID_PRIVATE_KEY and deletes the file.
// Running this again makes a NEW pair, which silently kills every existing
// subscription until each device re-subscribes — so it refuses to overwrite.
import { generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUB = path.join(ROOT, 'js', 'vapid-public.js');
const PRIV = path.join(os.homedir(), 'ctc-vapid-private.txt');
if (fs.existsSync(PUB)) { console.error('js/vapid-public.js already exists. Not overwriting.'); process.exit(1); }

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pub = publicKey.export({ format: 'jwk' });
const priv = privateKey.export({ format: 'jwk' });
const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]);

fs.writeFileSync(PUB,
  '// Generated by tools/reminder/make-vapid-keys.mjs. The PUBLIC half of the Web\n' +
  '// Push signing key. Not a secret. Changing it drops every existing subscription.\n' +
  `export const VAPID_PUBLIC_KEY = '${raw.toString('base64url')}';\n`);
fs.writeFileSync(PRIV, priv.d + '\n');
console.log('public key  -> js/vapid-public.js');
console.log('private key -> ' + PRIV + '  (not shown; paste into GitHub, then delete)');
```

Run: `cd C:\Users\Adrian\chess-app; node tools/reminder/make-vapid-keys.mjs`
Expected: the two lines above. **Never Read `ctc-vapid-private.txt`.** Read `js/vapid-public.js`: one export, an 87-character string.

Hand Adrian this, and carry on while he does it:
1. Open https://github.com/adrianfuentesmanrique-pixel/chess-app/settings/secrets/actions
2. **New repository secret**, name `VAPID_PRIVATE_KEY`, value: the one line inside `C:\Users\Adrian\ctc-vapid-private.txt`. **Add secret.**
3. Delete that file, and empty the Recycle Bin.

- [ ] **Step 3: The art**

Create `tools/resize-notif.mjs`, copying the Chrome launch and CDP plumbing from `tools/cdp-verify-streak-grey.mjs` (lines 12–60 and its `send()` helper). It serves the repo over http, opens a blank page, and for each job runs this in the page with `Runtime.evaluate` (`awaitPromise: true`), then writes the returned base64 to disk:

```js
// In-page: draw `src` fitted inside a size×size transparent canvas. With
// `silhouette`, every visible pixel becomes opaque white (Android draws the
// badge from the alpha channel alone; a colour image there is a white square).
async function shrink(src, size, silhouette) {
  const img = new Image(); img.src = src; await img.decode();
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const k = Math.min(size / img.width, size / img.height);
  const w = Math.round(img.width * k), h = Math.round(img.height * k);
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, Math.round((size - w) / 2), Math.round((size - h) / 2), w, h);
  if (silhouette) {
    const d = g.getImageData(0, 0, size, size);
    for (let i = 0; i < d.data.length; i += 4) { d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; }
    g.putImageData(d, 0, 0);
  }
  return c.toDataURL('image/png').split(',')[1];
}
```

Jobs: `['/Notification/Daily%20reminder.png', 192, false] -> icons/notif/daily.png` and `['/icons/logo-mark.png', 96, true] -> icons/notif/badge.png`.

Run: `cd C:\Users\Adrian\chess-app; node tools/resize-notif.mjs`
Then Read both PNGs (they are small) and look: `daily.png` is Adrian's whole artwork, not cropped, not stretched; `badge.png` is a recognisable white shape on nothing. Check sizes: `daily.png` under 60 KB. If `logo-mark.png` has no transparency the badge comes out as a solid white square. The other icons are opaque too, so there is no better source: in that case delete `icons/notif/badge.png`, leave the `badge` line out of the `push` handler in Step 6, and say so in HANDOVER.

- [ ] **Step 4: Pure helpers, test first**

Create `tests/unit/remind-time.test.js`:

```js
// Unit tests for js/remind-time.js. Run with: npm.cmd run test:tree
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { utcHourFor, hourLabel, keyBytes, sameBytes } from '../../js/remind-time.js';

test('utcHourFor is the UTC hour the local hour falls in, rounded down', () => {
  const now = new Date();
  for (const h of [0, 7, 19, 23]) {
    const mins = (((h * 60 + now.getTimezoneOffset()) % 1440) + 1440) % 1440;
    assert.equal(utcHourFor(h, now), Math.floor(mins / 60));
  }
});
test('utcHourFor always returns a whole hour 0..23', () => {
  for (let h = 0; h < 24; h++) {
    const u = utcHourFor(h);
    assert.ok(Number.isInteger(u) && u >= 0 && u <= 23);
  }
});
test('hourLabel pads to HH:00', () => {
  assert.equal(hourLabel(7), '07:00');
  assert.equal(hourLabel(19), '19:00');
});
test('keyBytes decodes base64url, with or without padding', () => {
  assert.deepEqual([...keyBytes('AQID')], [1, 2, 3]);
  assert.deepEqual([...keyBytes('-_8')], [251, 255]);
});
test('sameBytes compares content, not identity', () => {
  assert.equal(sameBytes(new Uint8Array([1, 2]).buffer, new Uint8Array([1, 2])), true);
  assert.equal(sameBytes(new Uint8Array([1, 2]).buffer, new Uint8Array([1, 3])), false);
  assert.equal(sameBytes(null, new Uint8Array([1])), false);
});
```

Run: `cd C:\Users\Adrian\chess-app; npm.cmd run test:tree` — expected FAIL, module not found.

Create `js/remind-time.js`:

```js
// Pure helpers for the daily reminder. No imports, so they can be unit-tested
// in Node (tests/unit/remind-time.test.js).

// The UTC hour that `localHour`:00 today falls in on this device. Rounded DOWN
// for half-hour zones (19:00 in India is 13:30 UTC -> 13), which is why those
// users get the reminder up to 30 minutes early. Must be a whole number: the
// rules refuse anything else, and the job matches on equality.
export function utcHourFor(localHour, now = new Date()) {
  const d = new Date(now);
  d.setHours(localHour, 0, 0, 0);
  return d.getUTCHours();
}

export const hourLabel = h => String(h).padStart(2, '0') + ':00';

// base64url -> bytes, for PushManager.subscribe({ applicationServerKey }).
export function keyBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=');
  const bin = atob(b64);
  return Uint8Array.from(bin, ch => ch.charCodeAt(0));
}

export function sameBytes(buf, bytes) {
  if (!buf) return false;
  const a = new Uint8Array(buf);
  return a.length === bytes.length && a.every((v, i) => v === bytes[i]);
}
```

Run: `cd C:\Users\Adrian\chess-app; npm.cmd run test:tree` — expected: the five new tests pass (the precache check may fail until Step 9; that is expected here).

- [ ] **Step 5: Firestore helpers in `js/firebase.js`**

Grep `export async function deleteAccount|async signOut\(\)|^const quiet|function quiet` first. Add this block near the end of the file, before the final exports if any (grep `^export` to see the house position):

```js
// ───────── Daily streak reminder (Web Push) ─────────
// Spec: docs/superpowers/specs/2026-10-08-daily-streak-reminder-design.md
// One document per subscribed device under users/{uid}/pushSubs. The hourly job
// (tools/reminder/) reads these and the four fields below; it writes nothing.
const pushSubsCol = uid => collection(firestore, 'users', uid, 'pushSubs');

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// The four fields go in ONE write so the job never sees a switch that is on
// with no hour. merge:true merges INTO notifPrefs, leaving its other keys alone.
export async function saveReminderPrefs({ remindHourLocal, notifyHourUtc, timeZone, daily }) {
  const user = auth.currentUser;
  if (!user) return;
  await setDoc(doc(firestore, 'users', user.uid),
    { remindHourLocal, notifyHourUtc, timeZone, notifPrefs: { daily } }, { merge: true });
}

// Stores this device's subscription; returns its document id.
// serverTimestamp(), never Date.now(): the rule is `createdAt == request.time`.
export async function savePushSub(sub, platform, lang) {
  const user = auth.currentUser;
  if (!user) return null;
  const j = sub.toJSON();
  const id = await sha256Hex(j.endpoint);
  await setDoc(doc(pushSubsCol(user.uid), id), {
    endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth,
    createdAt: serverTimestamp(), platform, lang,
  });
  return id;
}

export async function deletePushSub(id) {
  const user = auth.currentUser;
  if (!user || !id) return;
  await deleteDoc(doc(pushSubsCol(user.uid), id));
}

// Keeps the `keep` newest subscriptions and deletes the rest. Returns how many
// remain. This is the only clean-up there is: the job cannot delete.
export async function prunePushSubs(keep = 5) {
  const user = auth.currentUser;
  if (!user) return 0;
  const snap = await getDocs(query(pushSubsCol(user.uid), orderBy('createdAt', 'desc')));
  const extra = snap.docs.slice(keep);
  await Promise.all(extra.map(d => deleteDoc(d.ref)));
  return snap.docs.length - extra.length;
}

// Sign-out and account deletion: stop this device receiving the account's
// reminders. Every step is best-effort — it runs right before the login goes
// away and must never block that.
export async function dropThisDevicePush() {
  try { await deletePushSub(await db.kvGet('pushSubId', null)); } catch (e) { console.warn('[remind] delete', e); }
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const sub = await reg?.pushManager?.getSubscription();
    if (sub) await sub.unsubscribe();
  } catch (e) { console.warn('[remind] unsubscribe', e); }
  await db.kvSet('pushSubId', null);
  await db.kvSet('remindOn', false);
}
```

In `Auth.signOut()`, add as the FIRST line (it needs the login to delete the document):

```js
    await dropThisDevicePush();
```

In `Auth.deleteAccount()`, directly before the line `paths.push(['leaderboard', uid], ['users', uid]);`:

```js
    // Reminder subscriptions live UNDER users/{uid}; deleting the parent does
    // not delete them, so they go first.
    try {
      const snap = await getDocs(pushSubsCol(uid));
      snap.forEach(d => paths.push(['users', uid, 'pushSubs', d.id]));
    } catch (e) {
      if (e.code !== 'permission-denied') throw e;
      console.warn('Could not list push subscriptions — proceeding anyway', e);
    }
```

and directly before `await deleteUser(user);`:

```js
    await dropThisDevicePush();
```

- [ ] **Step 6: The service worker**

In `sw.js`:

(a) Next to `const SHARE_CACHE` add:

```js
// Remembers the date of the last daily reminder shown, so a repeat on the same
// day is silent. Kept OUT of the version wipe in `activate`, like SHARE_CACHE.
const NOTIF_CACHE = 'ctc-notif';
```

(b) In the `activate` handler's filter, add `&& k !== NOTIF_CACHE` to the existing chain `k !== CACHE && k !== SHARE_CACHE && k !== KEEP_CACHE && k !== ART_CACHE`.

(c) Add `'js/notifications.js'`, `'js/remind-time.js'`, `'js/vapid-public.js'` to `ASSETS`, next to `'js/firebase.js'`.

(d) Bump `CACHE` on line 1 by one.

(e) Before the `fetch` listener add:

```js
// ───────── Daily streak reminder ─────────
// The hourly job (tools/reminder/) sends {"t":"daily","lang":"es","n":11},
// encrypted for this device. The words live HERE so a wording change ships with
// the app and no personal text travels.
const REMIND_TEXT = {
  es: { title: 'Tu racha te espera',
        body: n => n === 1 ? 'Mantén viva tu racha de 1 día: entrena hoy.'
                           : `Mantén viva tu racha de ${n} días: entrena hoy.` },
  en: { title: 'Your streak is waiting',
        body: n => `Keep your ${n}-day streak alive: train today.` },
};
// Same rule as todayStr() in js/app.js: the device's local date.
function localDay() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

self.addEventListener('push', e => {
  // EVERY path through here must end in showNotification(), inside waitUntil().
  // A push that shows nothing makes the browser put up its own "this site was
  // updated in the background" notice; and without waitUntil() the worker can
  // be stopped before anything is drawn. That includes a payload that cannot
  // be read, which falls through to the Spanish default below.
  e.waitUntil((async () => {
    let d = {};
    try { d = e.data ? e.data.json() : {}; } catch (_) {}
    const text = REMIND_TEXT[d.lang] || REMIND_TEXT.es;
    const n = Number.isInteger(d.n) && d.n > 0 ? d.n : 1;
    // A second reminder on the same day (a moved hour, a repeated run) replaces
    // the first without a sound: same tag, silent.
    let repeat = false;
    try {
      const c = await caches.open(NOTIF_CACHE);
      const last = await c.match('/__ctc-last-daily');
      repeat = !!last && (await last.text()) === localDay();
      await c.put('/__ctc-last-daily', new Response(localDay()));
    } catch (_) {}
    await self.registration.showNotification(text.title, {
      body: text.body(n),
      icon: 'icons/notif/daily.png',
      badge: 'icons/notif/badge.png',
      tag: 'daily',
      renotify: false,
      silent: repeat,
      data: { url: './' },
    });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    // Bring an open copy to the front rather than opening a second one.
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow(url);
  }));
});
```

- [ ] **Step 7: Strings in `js/i18n.js`**

Add next to `privacy_hint` (grep it):

```js
  remind_section: { es: 'Recordatorio diario', en: 'Daily reminder' },
  remind_on: { es: 'Activado', en: 'On' },
  remind_off: { es: 'Desactivado', en: 'Off' },
  remind_hour: { es: 'Hora', en: 'Hour' },
  remind_hint: { es: 'Un recordatorio al día, solo si aún no has entrenado.', en: 'One reminder a day, only if you have not trained yet.' },
  remind_signed_out: { es: 'Inicia sesión para usar los recordatorios.', en: 'Sign in to use reminders.' },
  remind_unsupported: { es: 'Este navegador no puede mostrar notificaciones.', en: 'This browser cannot show notifications.' },
  remind_ios_install: { es: 'Primero añade la app a tu pantalla de inicio.', en: 'Add the app to your Home Screen first.' },
  remind_denied: { es: 'Las notificaciones están bloqueadas. Permítelas en los ajustes del teléfono para esta app.', en: "Notifications are blocked. Allow them in your phone's settings for this app." },
  remind_failed: { es: 'No se pudo activar. En Brave: Ajustes, Privacidad, "Usar servicios de Google para mensajes push".', en: 'Could not turn it on. In Brave: Settings, Privacy, "Use Google services for push messaging".' },
  remind_row_off: { es: 'Recordatorio diario: desactivado', en: 'Daily reminder: off' },
  remind_row_on: { es: 'Recordatorio diario: {h}', en: 'Daily reminder: {h}' },
```

Grep `sound_on` first: if the app already has generic On/Off keys with the same words, reuse those and drop `remind_on` / `remind_off`.

- [ ] **Step 8: `js/notifications.js`**

```js
// The daily streak reminder: one push notification a day, at an hour the user
// picks, only when the streak is alive and today is not credited yet.
// Spec: docs/superpowers/specs/2026-10-08-daily-streak-reminder-design.md
//
// This file owns the switch, the permission prompt and the browser's push
// subscription. It never sends anything: an hourly job on GitHub does
// (tools/reminder/). Standard Web Push — there is no Firebase messaging here.
import * as db from './db.js';
import { t, getLang } from './i18n.js';
import { Auth, saveReminderPrefs, savePushSub, deletePushSub, prunePushSubs, dropThisDevicePush } from './firebase.js';
import { utcHourFor, hourLabel, keyBytes, sameBytes } from './remind-time.js';
import { VAPID_PUBLIC_KEY } from './vapid-public.js';

const DEFAULT_HOUR = 19;
const KEY = keyBytes(VAPID_PUBLIC_KEY);

// Firestore writes wait forever while offline. Turning a switch on must not.
const within = (p, ms = 10000) => Promise.race([p,
  new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

function iosNeedsInstall() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  return ios && !standalone;
}

function platform() {
  const ua = navigator.userAgent;
  if (/Android/.test(ua)) return 'android';
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Windows|Macintosh|Linux/.test(ua)) return 'desktop';
  return 'other';
}

export const Notifications = {
  on: false,          // this device has the reminder switched on
  hour: DEFAULT_HOUR,
  failed: false,      // the last attempt to switch on did not work
  preview: false,     // the UI is drawn only on a device that opened ?remind=1
  focusOnOpen: false, // the Profile row asks Settings to scroll to this block

  async init() {
    if (new URLSearchParams(location.search).get('remind') === '1') await db.kvSet('remindPreview', true);
    this.preview = !!(await db.kvGet('remindPreview', false));
    this.on = !!(await db.kvGet('remindOn', false));
    this.hour = +(await db.kvGet('remindHourLocal', DEFAULT_HOUR));
    this.refresh().catch(e => console.warn('[remind] refresh', e));
  },

  // Feature detection, never a browser-name check.
  supported() {
    return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  },

  // One of: ios-needs-install, unsupported, signed-out, denied, failed, on, off.
  // The two the user cannot fix by signing in come first.
  state() {
    if (iosNeedsInstall()) return 'ios-needs-install';
    if (!this.supported()) return 'unsupported';
    if (!Auth.user) return 'signed-out';
    if (Notification.permission === 'denied') return 'denied';
    if (this.failed) return 'failed';
    return this.on ? 'on' : 'off';
  },

  canSwitch() { return !['ios-needs-install', 'unsupported', 'signed-out'].includes(this.state()); },

  prefs(daily) {
    return {
      remindHourLocal: this.hour,
      notifyHourUtc: utcHourFor(this.hour),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      daily,
    };
  },

  // The current subscription, or a new one. A subscription made with another
  // signing key is useless to the job, so it is replaced.
  async subscription() {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameBytes(sub.options.applicationServerKey, KEY)) { await sub.unsubscribe(); sub = null; }
    return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: KEY });
  },

  // Writes this device's document if it is new or its language changed, removes
  // the previous one if the browser handed out a new endpoint, keeps 5.
  async store(sub) {
    const was = await db.kvGet('pushSubId', null);
    const wasLang = await db.kvGet('pushSubLang', null);
    const id = await savePushSubIfChanged(sub, was, wasLang);
    if (was && was !== id) await deletePushSub(was).catch(() => {});
    await db.kvSet('pushSubId', id);
    await db.kvSet('pushSubLang', getLang());
    return prunePushSubs(5);
  },

  // MUST be called from a tap: the permission prompt needs a user gesture.
  async enable() {
    this.failed = false;
    if (!this.canSwitch()) return this.state();
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return this.state();
    try {
      if (!navigator.onLine) throw new Error('offline');
      const sub = await within(this.subscription());
      await within(this.store(sub));
      await within(saveReminderPrefs(this.prefs(true)));
      this.on = true;
      await db.kvSet('remindOn', true);
      await db.kvSet('remindSynced', this.syncKey());
    } catch (e) {
      // The Brave case lands here: subscribe() rejects with a push service error.
      console.warn('[remind] enable', e);
      this.failed = true;
      this.on = false;
      await db.kvSet('remindOn', false);
    }
    return this.state();
  },

  async disable() {
    this.failed = false;
    this.on = false;
    await dropThisDevicePush();
    try {
      // Another device may still want it: the switch is per device, the pref
      // per account, so the pref only goes off with the last subscription.
      if ((await within(prunePushSubs(5))) === 0) await within(saveReminderPrefs(this.prefs(false)));
    } catch (e) { console.warn('[remind] disable', e); }
    await db.kvSet('remindSynced', null);
    return this.state();
  },

  async setHour(h) {
    this.hour = h;
    await db.kvSet('remindHourLocal', h);
    if (!this.on) return;
    try {
      await within(saveReminderPrefs(this.prefs(true)));
      await db.kvSet('remindSynced', this.syncKey());
    } catch (e) { console.warn('[remind] hour', e); }
  },

  syncKey() { const p = this.prefs(true); return `${p.remindHourLocal}|${p.notifyHourUtc}|${p.timeZone}`; },

  // Every app open, and every return to the front. Keeps the subscription and
  // the UTC hour true (daylight saving, travel, a browser that rotated the
  // endpoint). Writes only when something changed.
  async refresh() {
    if (!this.on || !Auth.user || !this.supported() || !navigator.onLine) return;
    if (Notification.permission !== 'granted') { await this.disable(); return; }
    const sub = await within(this.subscription());
    const id = await db.kvGet('pushSubId', null);
    if ((await idOf(sub)) !== id || (await db.kvGet('pushSubLang', null)) !== getLang()) await within(this.store(sub));
    if ((await db.kvGet('remindSynced', null)) !== this.syncKey()) {
      await within(saveReminderPrefs(this.prefs(true)));
      await db.kvSet('remindSynced', this.syncKey());
    }
  },

  // Today got credited: a reminder still on screen is now wrong.
  async clearDaily() {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      const list = await reg?.getNotifications({ tag: 'daily' });
      (list || []).forEach(n => n.close());
    } catch (_) {}
  },

  hintKey() {
    return { 'ios-needs-install': 'remind_ios_install', unsupported: 'remind_unsupported',
      'signed-out': 'remind_signed_out', denied: 'remind_denied', failed: 'remind_failed' }[this.state()] || 'remind_hint';
  },

  // The Settings block. Returns the elements for openSettings() to append; the
  // same createElement + .seg pattern as every other block in that sheet.
  section(segInit) {
    if (!this.preview) return [];
    const label = document.createElement('label'); label.className = 'fld-label'; label.textContent = t('remind_section');
    label.id = 'remind-label';
    const seg = document.createElement('div'); seg.className = 'seg'; seg.id = 'remind-seg';
    const hourLab = document.createElement('label'); hourLab.className = 'fld-label'; hourLab.textContent = t('remind_hour');
    hourLab.htmlFor = 'remind-hour';
    const sel = document.createElement('select'); sel.className = 'input'; sel.id = 'remind-hour';
    for (let h = 0; h < 24; h++) {
      const o = document.createElement('option'); o.value = h; o.textContent = hourLabel(h);
      if (h === this.hour) o.selected = true;
      sel.appendChild(o);
    }
    const hint = document.createElement('p'); hint.className = 'hint'; hint.id = 'remind-hint';

    const paint = () => {
      const on = this.state() === 'on';
      seg.innerHTML = '';
      for (const [v, key] of [['on', 'remind_on'], ['off', 'remind_off']]) {
        const b = document.createElement('button');
        b.textContent = t(key); b.dataset.v = v; b.disabled = !this.canSwitch();
        if ((on ? 'on' : 'off') === v) b.classList.add('on');
        seg.appendChild(b);
      }
      sel.disabled = !on;
      hint.textContent = t(this.hintKey());
    };
    paint();
    segInit(seg, async v => {
      if (v === 'on') await this.enable(); else await this.disable();
      paint();              // a failed switch-on falls back to Off here
      this.profileRow();
    });
    sel.onchange = async () => { await this.setHour(+sel.value); this.profileRow(); };
    if (this.focusOnOpen) {
      this.focusOnOpen = false;
      setTimeout(() => label.scrollIntoView({ block: 'start' }), 60);
    }
    return [label, seg, hourLab, sel, hint];
  },

  // The one row on the Profile streak card. `open` is openSettings from app.js,
  // remembered from the first call so later repaints need no argument.
  profileRow(open) {
    if (open) this.openSettings = open;
    const el = document.getElementById('profile-remind-row');
    if (!el) return;
    el.classList.toggle('hidden', !this.preview);
    if (!this.preview) return;
    el.textContent = this.state() === 'on'
      ? t('remind_row_on').replace('{h}', hourLabel(this.hour))
      : t('remind_row_off');
    el.onclick = () => { this.focusOnOpen = true; this.openSettings?.(); };
  },
};

async function idOf(sub) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sub.endpoint));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// One Firestore write per real change, not one per app open.
async function savePushSubIfChanged(sub, wasId, wasLang) {
  const id = await idOf(sub);
  if (id === wasId && wasLang === getLang()) return id;
  return savePushSub(sub, platform(), getLang());
}
```

Two facts this leans on, both read from the code on 2026-10-08: `segInit(el, onChange)` puts ONE click listener on the `.seg` container and finds the button with `closest('button')`, so rebuilding the buttons inside `paint()` keeps it working; and `.hidden { display: none !important; }` exists in `css/style.css`. Grep both again before relying on them.

- [ ] **Step 9: Wire it into `js/app.js` and `index.html`**

(a) Import, next to the other imports at the top of `js/app.js`:

```js
import { Notifications } from './notifications.js';
```

(b) In `openSettings()`, after the `privHint` line:

```js
    // daily reminder — the block comes from js/notifications.js
    const remindEls = Notifications.section(segInit);
```

and in the final `box.append(...)`, insert `...remindEls,` directly after `privHint,`.

(c) In `index.html`, directly after `<div id="profile-streak-ladder" class="streak-ladder"></div>`:

```html
      <button id="profile-remind-row" class="btn small hidden" style="width:100%; margin-top:10px;"></button>
```

(d) In `Profile.renderStreakLadder()`, as the last line of the function:

```js
    Notifications.profileRow(openSettings);
```

(e) In the boot code, directly after `await Streak.init();`:

```js
  await Notifications.init();
```

and inside the existing `visibilitychange` listener, after `Streak.checkDay();`:

```js
      Notifications.refresh().catch(() => {});
```

and inside `Auth.onChange(async () => { … })`, after its `await Streak.init();`:

```js
    Notifications.on = !!(await db.kvGet('remindOn', false));
    Notifications.refresh().catch(() => {});
```

(f) In `Streak.recordActivity()`, directly after `this.lastDate = today;`:

```js
    Notifications.clearDaily();
```

- [ ] **Step 10: Privacy wording**

In `js/legal-data.js`, in `LEGAL_PRIVACY`, append to the END of the `p` string of section 1 and of section 8, in BOTH languages, the four paragraphs given verbatim in the spec under "Privacy wording" (a space, then the paragraph, inside the same template string). Grep `'1. What data we collect'`, `'1. Qué datos recopilamos'`, `'8. External services'`, `'8. Servicios externos'` to find them. If the file has a "last updated" date (grep `updated|actualiz`), set it to today.

- [ ] **Step 11: Tests**

Run: `cd C:\Users\Adrian\chess-app; npm.cmd run test:tree; npm.cmd run test:precache`
Expected: all pass, including the precache check (it fails if any of the three new modules is missing from `ASSETS`).

- [ ] **Step 12: The headless check**

Create `tools/cdp-verify-remind.mjs` from `tools/cdp-verify-streak-grey.mjs`, with ONE difference in the static server: it must serve `sw.js` (delete the 404 line) because this check needs the service worker. It takes `<outDir>` and does, in order, printing `PASS` / `FAIL` per line and exiting non-zero on any FAIL:

1. `Browser.grantPermissions` `['notifications']` for the app origin; `Emulation.setDeviceMetricsOverride` 375×812, mobile.
2. Load `/` (no `?remind=1`). Assert `#profile-remind-row` has class `hidden`; open Settings; assert `#remind-seg` does not exist. **The gate works.**
3. Load `/?remind=1`. Open Settings. Assert `#remind-seg`, `#remind-hour` (24 options, value `19`), `#remind-hint` exist. Signed out, so assert the hint equals the `remind_signed_out` text and both buttons are disabled.
4. Screenshots of the open Settings sheet scrolled to `#remind-label`, and of the Profile streak card: **4 combinations × 2 screens = 8 PNGs** (`es-light`, `es-dark`, `en-light`, `en-dark`). Switch language and colour mode by seeding kv before load, as the streak-grey tool seeds its keys.
5. Service worker `push`: wait for `navigator.serviceWorker.ready`; get the registration id from `ServiceWorker.enable` + the `ServiceWorker.workerRegistrationUpdated` event; call `ServiceWorker.deliverPushMessage` with `origin`, `registrationId`, `data: '{"t":"daily","lang":"en","n":11}'`. Then in the page: `(await (await navigator.serviceWorker.ready).getNotifications({tag:'daily'}))` — assert exactly 1, title `Your streak is waiting`, body `Keep your 11-day streak alive: train today.`
6. Deliver `{"t":"daily","lang":"es","n":1}`: assert still exactly 1 (same tag replaced), title `Tu racha te espera`, body `Mantén viva tu racha de 1 día: entrena hoy.`
7. **Review Focus 1.** Deliver the text `not json`: assert a notification with tag `daily` still exists and its title is `Tu racha te espera`.
8. **Review Focus 5.** In the page: `await import('/js/db.js')` and set `remindOn` true and `pushSubId` to `'a'.repeat(64)`; `await (await import('/js/firebase.js')).dropThisDevicePush()`; assert `pushSubId` is null and `remindOn` is false.
9. In the page: `(await import('/js/notifications.js')).Notifications.clearDaily()`; assert `getNotifications({tag:'daily'})` is empty.

Run: `cd C:\Users\Adrian\chess-app; node tools/cdp-verify-remind.mjs C:\Users\Adrian\AppData\Local\Temp\claude\remind-shots`
Expected: every line PASS. App Check 403s in the console are expected.

**Then Read all 8 screenshots and look at them.** Check in each: nothing clipped or overflowing at 375px; the On/Off pair, the select and the hint match the sheet's other blocks; dark mode has no white box around the select; the Spanish strings fit on the Profile row. Fix and re-run until all 8 are right. Say in the final message which ones you opened.

- [ ] **Step 13: Commit and push**

```
cd C:\Users\Adrian\chess-app; git branch --show-current; git status --short
git add tools/reminder/make-vapid-keys.mjs js/vapid-public.js tools/resize-notif.mjs icons/notif js/remind-time.js tests/unit/remind-time.test.js js/notifications.js js/firebase.js js/app.js index.html js/i18n.js js/legal-data.js sw.js tools/cdp-verify-remind.mjs
git commit -m "Daily reminder: switch, hour picker and push handler, behind the ?remind=1 preview (vNNN)"
```

(`vNNN` = the new cache number.) Add the HANDOVER.md entry, commit, `git push`, then confirm the live `sw.js` shows the new version.

- [ ] **Step 14: Adrian's phone, first look**

Ask Adrian to: open the app on his phone once at `https://chesstrainingcenter.app/?remind=1`, go to Settings, turn Daily reminder On, allow the prompt, and report which hint line shows and whether the switch stays On. "Stays On" means a subscription was stored. "Could not turn it on" means the Brave switch (spec section 8, step 7): he turns it on, restarts Brave, tries again. Record his answer in HANDOVER. Nothing is sent yet: the job is Task 3.

---

### Task 3: The hourly job (session 3)

**Files:**
- Create: `tools/reminder/package.json`, `tools/reminder/package-lock.json`, `tools/reminder/due.mjs`, `tools/reminder/plan.mjs`, `tools/reminder/send.mjs`, `tests/unit/reminder-due.test.js`, `tests/unit/reminder-hours.test.js`, `.github/workflows/streak-reminder.yml`

**Interfaces:**
- Consumes: Task 2's data (see its Produces), `js/vapid-public.js`, the secret `VAPID_PRIVATE_KEY`.
- Produces: `due.mjs` exports `ENDPOINT_OK: RegExp`, `localParts(now: Date, timeZone: string): {date: string, hour: number} | null`, `isDue(user, now: Date): boolean`, `hoursToHandle(lastIso: string|null, now: Date): string[]`, `hourIso(d: Date): string` (`'2026-10-08T19'`).

- [ ] **Step 1: Check it is still undone**

Run: `cd C:\Users\Adrian\chess-app; git log --oneline -15; git status --short`
Glob `.github/**` and `tools/reminder/*`. Expected: only `make-vapid-keys.mjs`. Confirm `js/vapid-public.js` exists.

- [ ] **Step 2: Failing tests for "who is due"**

Create `tests/unit/reminder-due.test.js`:

```js
// Unit tests for tools/reminder/due.mjs. Run with: npm.cmd run test:tree
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENDPOINT_OK, localParts, isDue } from '../../tools/reminder/due.mjs';

// 2026-10-09 00:17 UTC  =  2026-10-08 19:17 in Panama (UTC-5, no DST).
const NOW = new Date('2026-10-09T00:17:00Z');
const user = (over = {}) => ({
  streakCount: 11, streakLastDate: '2026-10-07', timeZone: 'America/Panama', remindHourLocal: 19, ...over,
});

test('localParts gives the date and hour in the user\'s own zone', () => {
  assert.deepEqual(localParts(NOW, 'America/Panama'), { date: '2026-10-08', hour: 19 });
  assert.deepEqual(localParts(NOW, 'Asia/Kolkata'), { date: '2026-10-09', hour: 5 });
  assert.deepEqual(localParts(NOW, 'Pacific/Kiritimati'), { date: '2026-10-09', hour: 14 });
  assert.deepEqual(localParts(new Date('2026-10-08T05:00:00Z'), 'America/Panama'), { date: '2026-10-08', hour: 0 });
});
test('localParts refuses a zone it cannot read', () => {
  assert.equal(localParts(NOW, 'Mars/Olympus'), null);
  assert.equal(localParts(NOW, ''), null);
  assert.equal(localParts(NOW, undefined), null);
});
test('due: trained yesterday, not today, at the chosen hour', () => {
  assert.equal(isDue(user(), NOW), true);
});
test('not due: already trained today', () => {
  assert.equal(isDue(user({ streakLastDate: '2026-10-08' }), NOW), false);
});
test('not due: the streak died (last trained two days ago) even though the count is stale', () => {
  assert.equal(isDue(user({ streakLastDate: '2026-10-06' }), NOW), false);
});
test('not due: no streak, or no date', () => {
  assert.equal(isDue(user({ streakCount: 0 }), NOW), false);
  assert.equal(isDue(user({ streakLastDate: undefined }), NOW), false);
  assert.equal(isDue(user({ streakCount: undefined }), NOW), false);
});
test('a late run still sends up to two hours after the chosen hour, not later, never before', () => {
  assert.equal(isDue(user({ remindHourLocal: 18 }), NOW), true);
  assert.equal(isDue(user({ remindHourLocal: 17 }), NOW), true);
  assert.equal(isDue(user({ remindHourLocal: 16 }), NOW), false);
  assert.equal(isDue(user({ remindHourLocal: 20 }), NOW), false);
});
test('a reminder set for 23:00 is NOT sent after local midnight', () => {
  const late = new Date('2026-10-09T05:10:00Z');   // 00:10 on the 9th in Panama
  assert.equal(isDue(user({ remindHourLocal: 23, streakLastDate: '2026-10-07' }), late), false);
  assert.equal(isDue(user({ remindHourLocal: 23, streakLastDate: '2026-10-08' }), late), false);
});
test('Review Focus 2: India is judged on India\'s date', () => {
  const u = user({ timeZone: 'Asia/Kolkata', remindHourLocal: 5, streakLastDate: '2026-10-08' });
  assert.equal(isDue(u, NOW), true);                                   // local date is the 9th
  assert.equal(isDue({ ...u, streakLastDate: '2026-10-07' }, NOW), false);
});
test('not due: unreadable zone or hour', () => {
  assert.equal(isDue(user({ timeZone: 'Mars/Olympus' }), NOW), false);
  assert.equal(isDue(user({ remindHourLocal: undefined }), NOW), false);
});
test('Review Focus 4: only real push services pass the allowlist', () => {
  for (const ok of ['https://fcm.googleapis.com/fcm/send/x', 'https://web.push.apple.com/x',
    'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://db5p.notify.windows.com/w/?t=x']) {
    assert.equal(ENDPOINT_OK.test(ok), true, ok);
  }
  for (const bad of ['https://evil.example.com/x', 'http://fcm.googleapis.com/x',
    'https://fcm.googleapis.com.evil.example.com/x', 'https://evil.example.com/https://fcm.googleapis.com/', '']) {
    assert.equal(ENDPOINT_OK.test(bad), false, bad);
  }
});
```

Create `tests/unit/reminder-hours.test.js`:

```js
// Unit tests for hoursToHandle() in tools/reminder/due.mjs — the rule that
// stops a late or repeated run sending twice. Run with: npm.cmd run test:tree
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hoursToHandle, hourIso } from '../../tools/reminder/due.mjs';

const at = iso => new Date(iso);

test('hourIso names the UTC hour', () => {
  assert.equal(hourIso(at('2026-10-08T19:17:00Z')), '2026-10-08T19');
});
test('first run ever: the current hour only', () => {
  assert.deepEqual(hoursToHandle(null, at('2026-10-08T19:17:00Z')), ['2026-10-08T19']);
});
test('the normal case: one new hour', () => {
  assert.deepEqual(hoursToHandle('2026-10-08T18', at('2026-10-08T19:17:00Z')), ['2026-10-08T19']);
});
test('Review Focus 3: a repeated or manual run in the same hour handles nothing', () => {
  assert.deepEqual(hoursToHandle('2026-10-08T19', at('2026-10-08T19:55:00Z')), []);
});
test('Review Focus 3: a run that slipped past the hour does not repeat the next one', () => {
  // The 19:17 run started at 20:03 and handled 19 and 20; the 20:17 run finds nothing.
  assert.deepEqual(hoursToHandle('2026-10-08T18', at('2026-10-08T20:03:00Z')), ['2026-10-08T19', '2026-10-08T20']);
  assert.deepEqual(hoursToHandle('2026-10-08T20', at('2026-10-08T20:40:00Z')), []);
});
test('after a long gap only the last three hours are caught up', () => {
  assert.deepEqual(hoursToHandle('2026-10-08T10', at('2026-10-08T19:17:00Z')),
    ['2026-10-08T17', '2026-10-08T18', '2026-10-08T19']);
});
test('it crosses midnight', () => {
  assert.deepEqual(hoursToHandle('2026-10-08T23', at('2026-10-09T00:17:00Z')), ['2026-10-09T00']);
});
test('a remembered hour in the future, or rubbish, is treated as no memory', () => {
  assert.deepEqual(hoursToHandle('2026-10-09T05', at('2026-10-08T19:17:00Z')), []);
  assert.deepEqual(hoursToHandle('garbage', at('2026-10-08T19:17:00Z')), ['2026-10-08T19']);
});
```

Run: `cd C:\Users\Adrian\chess-app; npm.cmd run test:tree` — expected FAIL, module not found.

- [ ] **Step 3: `tools/reminder/due.mjs`**

```js
// The decisions of the hourly streak-reminder job, with no I/O and no
// dependencies, so every rule here is unit-tested (tests/unit/reminder-*.test.js).
// Spec: docs/superpowers/specs/2026-10-08-daily-streak-reminder-design.md

// The job sends an HTTP request to whatever endpoint a user stored. Only real
// push services may be called. The same list is in firestore.rules; this copy
// is the one that counts.
export const ENDPOINT_OK = /^https:\/\/(fcm\.googleapis\.com|[a-z0-9.-]+\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)\//;

// The calendar date and hour it is for a user right now, in THEIR zone.
// Null when the zone cannot be read.
export function localParts(now, timeZone) {
  if (!timeZone || typeof timeZone !== 'string') return null;
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
    }).formatToParts(now);
  } catch (_) { return null; }
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

function dayBefore(date) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Due = the streak is alive and today is not credited: the last credited day
// is YESTERDAY in the user's zone. streakCount alone is not trusted — the app
// only zeroes a dead streak when it is opened. The hour window (the chosen
// hour, or up to two hours after it, same local day) lets a late run still
// deliver and stops a very late one from buzzing after midnight.
export function isDue(user, now) {
  if (!user || !(user.streakCount > 0) || typeof user.streakLastDate !== 'string') return false;
  if (!Number.isInteger(user.remindHourLocal)) return false;
  const local = localParts(now, user.timeZone);
  if (!local) return false;
  const late = local.hour - user.remindHourLocal;
  if (late < 0 || late > 2) return false;
  return user.streakLastDate === dayBefore(local.date);
}

export const hourIso = d => d.toISOString().slice(0, 13);

// Which UTC hours this run handles: every hour after the remembered one, up to
// now, at most the last three. A run that finds its own hour already remembered
// handles nothing — that is the whole "never twice" rule.
export function hoursToHandle(lastIso, now) {
  const end = new Date(hourIso(now) + ':00:00Z').getTime();
  const last = /^\d{4}-\d{2}-\d{2}T\d{2}$/.test(lastIso || '') ? new Date(lastIso + ':00:00Z').getTime() : null;
  if (last === null) return [hourIso(new Date(end))];
  const out = [];
  for (let t = Math.max(last + 3600000, end - 2 * 3600000); t <= end; t += 3600000) out.push(hourIso(new Date(t)));
  return out;
}
```

Run: `cd C:\Users\Adrian\chess-app; npm.cmd run test:tree` — expected: all pass.

- [ ] **Step 4: The job's own dependencies**

Create `tools/reminder/package.json`:

```json
{
  "name": "ctc-streak-reminder",
  "private": true,
  "type": "module",
  "description": "The hourly daily-streak reminder job. Runs on GitHub Actions only; nothing here ships to the app."
}
```

Before installing, check both packages (Adrian's standing rule: verify before installing): on npmjs.com confirm `web-push` is the `web-push-libs/web-push` package and `@google-cloud/firestore` is published by Google (`googleapis/nodejs-firestore`), and `npm.cmd view <name> license` for each. State what you found, then:

Run: `cd C:\Users\Adrian\chess-app\tools\reminder; npm.cmd install --save-exact web-push @google-cloud/firestore; npm.cmd audit`
Expected: `package-lock.json` created, exact versions in `package.json`, no high or critical advisories. `tools/reminder/node_modules/` is already ignored by the root `.gitignore` line `node_modules/`.

- [ ] **Step 5: `tools/reminder/plan.mjs`**

```js
// Step 1 of the job: decide which hours to handle and REMEMBER the new hour
// before anything is sent. The workflow saves the state file to the Actions
// cache between this step and the sender, so a run that dies while sending
// loses reminders and never repeats them.
//
//   node plan.mjs <stateFile>      env DRY_RUN=true -> current hour, state untouched
import fs from 'node:fs';
import path from 'node:path';
import { hoursToHandle, hourIso } from './due.mjs';

const file = process.argv[2];
const dry = process.env.DRY_RUN === 'true';
const now = new Date();
let last = null;
try { last = fs.readFileSync(file, 'utf8').trim(); } catch (_) {}

const hours = dry ? [hourIso(now)] : hoursToHandle(last, now);
if (!dry) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, hourIso(now) + '\n');
}
console.log(`hours to handle: ${hours.length}${dry ? ' (dry run)' : ''}`);
fs.appendFileSync(process.env.GITHUB_OUTPUT, `hours=${hours.join(',')}\n`);
```

- [ ] **Step 6: `tools/reminder/send.mjs`**

```js
// Step 2 of the job: find who is due in the given hours and send.
//
// SAFETY, all deliberate — see the spec, section 7:
//  * Reads only. This file contains no set(), update(), delete() or add().
//  * The query selects four fields; names and dates of birth are not downloaded.
//  * Logs are PUBLIC. Print counts only. Never a uid, an endpoint, a key or an
//    error message (a push error message can contain the endpoint) — status
//    numbers and error codes only.
import { Firestore } from '@google-cloud/firestore';
import webpush from 'web-push';
import { ENDPOINT_OK, isDue } from './due.mjs';
import { VAPID_PUBLIC_KEY } from '../../js/vapid-public.js';

const hours = (process.env.HOURS || '').split(',').filter(Boolean);
const dry = process.env.DRY_RUN === 'true';
const count = { hours: hours.length, matched: 0, due: 0, subs: 0, sent: 0, gone: 0, failed: 0, skipped: 0 };
const codes = {};

function done(exit) {
  console.log(JSON.stringify({ dryRun: dry, ...count, errorCodes: codes }));
  process.exit(exit);
}
if (!hours.length) done(0);

let db;
try {
  const key = JSON.parse(process.env.GCP_SA_KEY);
  db = new Firestore({ projectId: key.project_id, credentials: { client_email: key.client_email, private_key: key.private_key } });
  webpush.setVapidDetails('https://chesstrainingcenter.app', VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY.trim());
} catch (_) {
  console.log('could not read the secrets');   // never the reason: it may quote them
  process.exit(1);
}

const now = new Date();
try {
  for (const iso of hours) {
    const utcHour = Number(iso.slice(11, 13));
    const users = await db.collection('users')
      .where('notifyHourUtc', '==', utcHour)
      .where('notifPrefs.daily', '==', true)
      .select('streakLastDate', 'streakCount', 'timeZone', 'remindHourLocal')
      .get();
    count.matched += users.size;
    for (const u of users.docs) {
      const data = u.data();
      if (!isDue(data, now)) continue;
      count.due++;
      const subs = await u.ref.collection('pushSubs').orderBy('createdAt', 'desc').limit(5).get();
      for (const s of subs.docs) {
        const d = s.data();
        if (typeof d.endpoint !== 'string' || !ENDPOINT_OK.test(d.endpoint) || !d.p256dh || !d.auth) { count.skipped++; continue; }
        count.subs++;
        if (dry) continue;
        try {
          await webpush.sendNotification(
            { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
            JSON.stringify({ t: 'daily', lang: d.lang === 'en' ? 'en' : 'es', n: data.streakCount }),
            { TTL: 3 * 3600, urgency: 'normal', topic: 'daily' });
          count.sent++;
        } catch (e) {
          const status = Number.isInteger(e?.statusCode) ? e.statusCode : 0;
          if (status === 404 || status === 410) count.gone++; else count.failed++;
          codes[status] = (codes[status] || 0) + 1;
        }
      }
    }
  }
} catch (e) {
  // A Firestore failure. The code only (e.g. 7 = permission denied, 9 = an
  // index is required) — the message can carry a document path.
  codes['firestore:' + (Number.isInteger(e?.code) ? e.code : 'unknown')] = 1;
  done(1);
}
done(0);
```

Local check without secrets: `cd C:\Users\Adrian\chess-app\tools\reminder; $env:HOURS=''; node send.mjs` — expected one JSON line with zeros and exit 0. Do **not** put the key on this PC to test further; the dry run on GitHub is the test.

Grep the file yourself for `console.` and confirm no line can print a uid, endpoint, key, `e.message`, `e.body` or `e.stack`.

- [ ] **Step 7: The workflow**

Verify the three hashes are still what the tags point at:

Run: `git ls-remote --tags https://github.com/actions/checkout refs/tags/v4.4.0; git ls-remote --tags https://github.com/actions/setup-node refs/tags/v4.4.0; git ls-remote --tags https://github.com/actions/cache refs/tags/v4.3.0`
Expected (read on 2026-10-08): `11d5960a326750d5838078e36cf38b85af677262`, `49933ea5288caeca8642d1e84afbd3f7d6820020`, `0057852bfaa89a56745cba8c7296529d2fc39830`. If a tag has moved or is gone, stop and say so; do not pin something unverified.

Create `.github/workflows/streak-reminder.yml`:

```yaml
# The daily streak reminder. Runs hourly, reads who is due, sends a Web Push.
# Spec: docs/superpowers/specs/2026-10-08-daily-streak-reminder-design.md
#
# SAFETY — do not loosen any of these without reading section 7 of the spec:
#  * Triggers are schedule and workflow_dispatch ONLY. Never pull_request or
#    pull_request_target: this workflow holds a key that reads every user's data.
#  * This repository is PUBLIC and so are these logs. The scripts print counts.
#  * Every action is pinned to a full commit hash, not a tag.
#  * The job writes nothing to Firestore. Its service account can only read.
name: Streak reminder

on:
  schedule:
    - cron: '17 * * * *'   # minute 17: the top of the hour is when GitHub is slowest to start
  workflow_dispatch:
    inputs:
      dry_run:
        description: 'Count only: send nothing and leave the remembered hour alone'
        type: boolean
        default: true

permissions:
  contents: read

concurrency:
  group: streak-reminder
  cancel-in-progress: false

jobs:
  remind:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    env:
      DRY_RUN: ${{ github.event_name == 'workflow_dispatch' && inputs.dry_run && 'true' || 'false' }}
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262   # v4.4.0
        with:
          persist-credentials: false
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020   # v4.4.0
        with:
          node-version: '24'
      - name: Install from the lockfile
        working-directory: tools/reminder
        run: npm ci --ignore-scripts
      - name: Restore the remembered hour
        uses: actions/cache/restore@0057852bfaa89a56745cba8c7296529d2fc39830   # v4.3.0
        with:
          path: .reminder-state
          key: reminder-state-${{ github.run_id }}-${{ github.run_attempt }}
          restore-keys: reminder-state-
      - name: Decide which hours to handle
        id: plan
        working-directory: tools/reminder
        run: node plan.mjs ../../.reminder-state/last-hour.txt
      # Saved BEFORE sending: if this step fails the job stops and nothing is
      # sent. A failed run loses reminders; it never repeats them.
      - name: Remember the new hour
        if: env.DRY_RUN != 'true' && steps.plan.outputs.hours != ''
        uses: actions/cache/save@0057852bfaa89a56745cba8c7296529d2fc39830   # v4.3.0
        with:
          path: .reminder-state
          key: reminder-state-${{ github.run_id }}-${{ github.run_attempt }}
      - name: Send
        if: steps.plan.outputs.hours != ''
        working-directory: tools/reminder
        env:
          HOURS: ${{ steps.plan.outputs.hours }}
          GCP_SA_KEY: ${{ secrets.GCP_SA_KEY }}
          VAPID_PRIVATE_KEY: ${{ secrets.VAPID_PRIVATE_KEY }}
        run: node send.mjs
```

Check by reading the finished file: no `pull_request`; `permissions` is `contents: read` only; the two secrets appear only in the `Send` step; three `uses:` lines, each with a 40-character hash.

- [ ] **Step 8: Adrian's console steps**

Give Adrian these, one block, and wait for "done":

1. Open https://console.cloud.google.com/iam-admin/serviceaccounts?project=chess-training-center
2. If `streak-reminder` is not in the list: **Create service account**, name `streak-reminder`, **Create and continue**, role **Cloud Datastore Viewer**, **Done**. If it is there, open **IAM** in the left menu and check its only role is Cloud Datastore Viewer.
3. Click `streak-reminder`, **Keys** tab, **Add key**, **Create new key**, **JSON**, **Create**. A file downloads.
4. Open https://github.com/adrianfuentesmanrique-pixel/chess-app/settings/secrets/actions , **New repository secret**, name `GCP_SA_KEY`, value: open the downloaded file in Notepad, select all, copy, paste. **Add secret.**
5. Delete the downloaded file and empty the Recycle Bin.
6. Confirm `VAPID_PRIVATE_KEY` is also in that secrets list (from Task 2).

**If any step mentions billing, a card, or "disabled by policy": stop.** For "disabled by policy" the fallback is spec section 9; for billing, the feature waits.

- [ ] **Step 9: Commit, push, dry run**

```
cd C:\Users\Adrian\chess-app; npm.cmd run test:tree; git branch --show-current; git status --short
git add tools/reminder/package.json tools/reminder/package-lock.json tools/reminder/due.mjs tools/reminder/plan.mjs tools/reminder/send.mjs tests/unit/reminder-due.test.js tests/unit/reminder-hours.test.js .github/workflows/streak-reminder.yml
git commit -m "Daily reminder: the hourly job - who is due, the sender, the schedule (read-only, counts-only logs)"
git push
```

No `sw.js` bump: nothing shipped changed. Then ask Adrian: repo, **Actions** tab, **Streak reminder**, **Run workflow**, leave `dry_run` ticked, **Run**. When it finishes, he opens the run, the **Send** step, and reads out the one JSON line.

Expected with his own switch on: `"dryRun":true`, `matched` ≥ 0, `sent` 0, `errorCodes` `{}`. If `errorCodes` shows `firestore:9`, an index is required: add the composite index (`users`: `notifyHourUtc` ASC, `notifPrefs.daily` ASC) to `firestore.indexes.json`, Adrian runs `cd C:\Users\Adrian\chess-app; npm.cmd run indexes:deploy`, re-run. If `firestore:7`, the role is missing on the service account. To see `matched: 1` deliberately, Adrian sets his hour so that it is the current hour, then re-runs.

Add the HANDOVER.md entry with the JSON line he read out, commit, push.

---

### Task 4: The phone (session 4)

**Files:**
- Modify: `js/notifications.js`, `sw.js` (cache bump), `HANDOVER.md`

**Interfaces:**
- Consumes: everything above, live.
- Produces: the feature visible to everyone.

- [ ] **Step 1: Check state**

Run: `cd C:\Users\Adrian\chess-app; git log --oneline -15; git status --short`
Grep `remindPreview` in `js/notifications.js` (must still be there). Ask Adrian whether the scheduled runs in the Actions tab are green.

- [ ] **Step 2: The Brave and Android checks**

Adrian, on his phone:
1. Brave, menu, **Settings**, **Privacy and security** (in some versions **Brave Shields & privacy**): **Use Google services for push messaging** must be **On**. If he changes it, close Brave completely and reopen.
2. Android **Settings**, **Apps**, **Chess Training Center**, **Notifications**: allowed.
3. In the app: Settings, Daily reminder. If it reads Off, turn it On. It must stay On.

- [ ] **Step 3: A real reminder**

Conditions for being due: he trained yesterday and has NOT trained today. If he has already trained today, this step waits until tomorrow; say so rather than faking it.

He sets the hour to the current hour if it is before minute 10, otherwise to the next hour, then closes the app. The run at minute 17 (possibly late) should deliver. He reports: did it arrive, at what time, is the art right, is the text right in his language, does tapping it open the app, and does training make it disappear.

If nothing arrives within 45 minutes: open the run in the Actions tab and read the JSON line. `matched 0` means the hour or the switch did not reach Firestore; `due 0` means the streak rule (check he had not trained); `sent 0, gone 1` means the subscription is dead (switch Off and On again); `failed` with a code means the push service refused (401/403: the two halves of the signing key do not match — the secret was pasted wrong).

- [ ] **Step 4: A repeat does not buzz**

He moves the hour forward by one and waits for the next run. Expected: the notification is replaced with no sound or vibration.

- [ ] **Step 5: Play Store data safety**

Adrian opens Play Console, **App content**, **Data safety**. If **Device or other IDs** is not declared: add it as collected, not shared, optional, purpose **App functionality**. He says what was there. Record it in HANDOVER.

- [ ] **Step 6: Remove the gate**

Only when Step 3 passed. In `js/notifications.js`: delete the `preview` field, the two `remindPreview` lines in `init()`, the `if (!this.preview) return [];` line in `section()`, and in `profileRow()` replace the three gate lines with `el.classList.remove('hidden');`. Grep `preview` in the file: no hits. In `tools/cdp-verify-remind.mjs` delete check 2 and load `/` in check 3. Bump `CACHE` in `sw.js` by one.

Run: `cd C:\Users\Adrian\chess-app; npm.cmd run test:tree; node tools/cdp-verify-remind.mjs C:\Users\Adrian\AppData\Local\Temp\claude\remind-shots`
Expected: all PASS. Read the 8 screenshots again (375px, light and dark, ES and EN) and look at them.

- [ ] **Step 7: Commit, push, close out**

```
cd C:\Users\Adrian\chess-app; git branch --show-current; git status --short
git add js/notifications.js tools/cdp-verify-remind.mjs sw.js
git commit -m "Daily reminder: live for everyone - received on Adrian's phone (vNNN)"
```

HANDOVER.md entry (Edit only): what was proved on the phone and when, the data-safety answer, the known limits from the spec section 11, and that GitHub pauses the schedule after 60 days without a commit. Mark `docs/superpowers/plans/2026-08-17-notifications.md` as superseded for the daily reminder by adding one line under its banner (Edit). Commit, `git push`, confirm the live `sw.js` version.

The work is then finished: write no next prompt unless the phone test left a real defect.
