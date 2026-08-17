// Firebase Auth (Google + email/password) + Firestore sync.
// Loaded from Google's own CDN — there is no offline story for login/sync anyway
// (it requires the network by definition), so vendoring it brings no benefit.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile,
  deleteUser, reauthenticateWithPopup, reauthenticateWithCredential, EmailAuthProvider,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, collection, query, where, orderBy, limit, getDocs,
  // Masterclass. onSnapshot is not used until the live board lands; it is
  // imported now because the whole firebase-firestore module is already
  // downloaded, so naming one more symbol from it costs zero extra bytes.
  addDoc, collectionGroup, serverTimestamp, writeBatch, onSnapshot,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { initializeAppCheck, ReCaptchaV3Provider } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-check.js';
import * as db from './db.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBaJJ3kBUkAupKiqysQCSJ20qXpSUurAxU',
  authDomain: 'chess-training-center.firebaseapp.com',
  projectId: 'chess-training-center',
  storageBucket: 'chess-training-center.firebasestorage.app',
  messagingSenderId: '250476356665',
  appId: '1:250476356665:web:55901e5504aaedc47799e8',
};

// Keys that follow the signed-in user across devices.
const SYNCED_KEYS = [
  'profileName', 'username', 'firstName', 'lastName', 'dateOfBirth', 'profileVisibility',
  'streakCount', 'streakLastDate',
  'puzzleElo', 'puzzleThemeElo', 'puzzlesSolved',
  'openingElo', 'endgameElo', 'boardTheme', 'pieceSet', 'colorMode',
  'puzzleEloHistory', 'openingEloHistory', 'endgameEloHistory', 'avatarId',
  'earnedBadges', 'bestStreak', 'endgameConverted', 'firstImportDone', 'firstEngineUsed',
  'rushBestScore', 'rushBest180', 'rushBest300',
  'rushMonth180', 'rushMonth300', 'rushMonthKey', 'puzzleAttemptCount', 'radarThemes',
  'blindfoldElo', 'blindfoldEloHistory', 'blindfoldHintWarningSeen', 'soundEnabled',
];

// Profile visibility is stored as a WORD, not a yes/no, so further levels
// ('friends', …) can be added later without changing the stored shape or
// rewriting the security rules. Anything unrecognised reads as public.
export const VISIBILITY = { PUBLIC: 'public', PRIVATE: 'private' };
const VISIBILITY_LEVELS = Object.values(VISIBILITY);

// Subset that gets mirrored into the PUBLIC /leaderboard/{uid} doc — never
// email, real name, or date of birth. Changing any of these re-publishes it.
//
// Split in two because /leaderboard is world-readable: hiding a section in the
// UI would hide nothing, so privacy is enforced by NOT PUBLISHING the data.
// These always go out — the leaderboard rows sort and draw on them, so they
// are identical for every player whatever their privacy setting.
const PUBLIC_ALWAYS_KEYS = ['profileName', 'username', 'avatarId', 'puzzleElo',
  'rushBestScore', 'rushBest180', 'rushBest300',
  'rushMonth180', 'rushMonth300', 'rushMonthKey', 'blindfoldElo'];

// These only go out while the profile is public. On a private profile they are
// actively DELETED from the public doc — merge writes never remove a field, so
// merely skipping them would leave yesterday's copy readable forever.
const PUBLIC_DETAIL_KEYS = ['puzzleThemeElo', 'openingElo', 'endgameElo', 'streakCount'];

// Any of these changing means the public doc needs rewriting.
const PUBLISHED_KEYS = [...PUBLIC_ALWAYS_KEYS, ...PUBLIC_DETAIL_KEYS, 'profileVisibility'];

// Mean of a {name: rating} map, or null when there is nothing to average.
// Published as a plain number so a private profile can still show its Opening
// and Endgame ELO without exposing the per-opening breakdown behind it.
function avgOf(map) {
  const vals = Object.values(map || {}).filter(v => typeof v === 'number');
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
}

const app = initializeApp(firebaseConfig);

// App Check attests that Auth/Firestore requests come from this real app
// (not a scripted client hitting the API directly). The reCAPTCHA site is
// only registered for chesstrainingcenter.app, so local dev over localhost
// needs a debug token instead — enable it once, register the token Firebase
// logs to the console under App Check > Apps > Manage debug tokens, and it's
// remembered for that browser afterward. Enforcement is left in "Monitor"
// mode in Firebase Console for now, so a missing/failed token here doesn't
// block anything yet — this only starts actually rejecting requests once
// enforcement is switched on.
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}
initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider('6LeR3GYtAAAAACqUurrsfN2K6oTEywe0RGhW0yTc'),
  isTokenAutoRefreshEnabled: true,
});

const auth = getAuth(app);
const firestore = getFirestore(app);

let suppressSync = false;

export const Auth = {
  user: null,
  needsProfileCompletion: false,
  listeners: [],

  onChange(fn) { this.listeners.push(fn); },
  _notify() { for (const fn of this.listeners) fn(this.user); },

  async signInWithGoogle() {
    await signInWithPopup(auth, new GoogleAuthProvider());
  },

  async signUpWithEmail({ email, password, firstName, lastName, username, dateOfBirth }) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const displayName = `${firstName} ${lastName}`.trim();
    await updateProfile(cred.user, { displayName });
    suppressSync = true;
    try {
      await db.kvSet('profileName', username);
      await db.kvSet('username', username);
      await db.kvSet('firstName', firstName);
      await db.kvSet('lastName', lastName);
      await db.kvSet('dateOfBirth', dateOfBirth);
    } finally {
      suppressSync = false;
    }
    const local = { profileName: username, username, firstName, lastName, dateOfBirth, email };
    await setDoc(doc(firestore, 'users', cred.user.uid), local, { merge: true });
    await updatePublicLeaderboardDoc(cred.user.uid);
    this.needsProfileCompletion = false;
  },

  async signInWithEmail(email, password) {
    await signInWithEmailAndPassword(auth, email, password);
  },

  async completeProfile({ firstName, lastName, username, dateOfBirth }) {
    if (!this.user) return;
    suppressSync = true;
    try {
      await db.kvSet('profileName', username);
      await db.kvSet('username', username);
      await db.kvSet('firstName', firstName);
      await db.kvSet('lastName', lastName);
      await db.kvSet('dateOfBirth', dateOfBirth);
    } finally {
      suppressSync = false;
    }
    await setDoc(doc(firestore, 'users', this.user.uid), { profileName: username, username, firstName, lastName, dateOfBirth }, { merge: true });
    await updatePublicLeaderboardDoc(this.user.uid);
    this.needsProfileCompletion = false;
    this._notify();
  },

  // Clears local profile/settings data first so a different account
  // signing in next on this device (shared computer) can't inherit stray
  // local values — pullOrBootstrap below would otherwise either leave a
  // previous identity's stats in place (remote missing that key) or, for
  // a brand-new account, push them to Firestore as if they belonged to it.
  async signOut() {
    await db.clearSyncedProfileData();
    await signOut(auth);
  },

  // Re-proves identity right before a sensitive op (account deletion) —
  // Firebase requires a "recent" login for this, which a long-lived session
  // usually isn't. Google accounts reauth via a fresh popup; password
  // accounts need the password typed again (passed in for those).
  async reauthenticate(password) {
    const user = auth.currentUser;
    if (!user) return;
    const providerId = user.providerData[0]?.providerId;
    if (providerId === 'google.com') {
      await reauthenticateWithPopup(user, new GoogleAuthProvider());
    } else {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    }
  },

  // Permanently deletes the account: the public leaderboard entry, the
  // private user document, and the Firebase Auth account itself.
  // Firestore doc deletes are best-effort and swallow permission-denied
  // specifically (rather than aborting) — losing the Auth account is far
  // worse for the user than an orphaned leaderboard doc. Any other error
  // (network, etc.) still propagates normally.
  //
  // This used to say the rules were known NOT to allow client-side deletes on
  // /leaderboard/{uid}. That stopped being true when the delete rule was added
  // in fa39468; verified 2026-08-14 by diffing the deployed console rules
  // against firestore.rules (identical) — see firestore.rules:25 and the
  // covering test in tests/rules/existing.test.js. The tolerant handling stays
  // anyway: account deletion must never strand a user with a live login.
  async deleteAccount() {
    const user = auth.currentUser;
    if (!user) return;
    const uid = user.uid;
    for (const path of [['leaderboard', uid], ['users', uid]]) {
      try {
        await deleteDoc(doc(firestore, ...path));
      } catch (e) {
        if (e.code !== 'permission-denied') throw e;
        console.warn(`Could not delete ${path.join('/')} (permission-denied) — proceeding anyway`, e);
      }
    }
    await deleteUser(user);
  },
};

// Friendly bilingual messages for the most common auth error codes.
export function authErrorMessage(code, lang) {
  const es = {
    'auth/email-already-in-use': 'Ese correo ya tiene una cuenta. Intenta iniciar sesión.',
    'auth/invalid-email': 'El correo no es válido.',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
    'auth/user-not-found': 'No existe una cuenta con ese correo.',
    'auth/wrong-password': 'Contraseña incorrecta.',
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/too-many-requests': 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
    'auth/popup-blocked': 'El navegador bloqueó la ventana de Google. Permite ventanas emergentes e inténtalo de nuevo.',
    'auth/popup-closed-by-user': null,
    'auth/cancelled-popup-request': null,
    'auth/operation-not-allowed': 'El inicio de sesión con correo aún no está activado en el servidor.',
    'auth/network-request-failed': 'Fallo de red. Revisa tu conexión e inténtalo de nuevo.',
  };
  const en = {
    'auth/email-already-in-use': 'That email already has an account. Try signing in instead.',
    'auth/invalid-email': 'That email address is not valid.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/user-not-found': 'No account exists with that email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
    'auth/popup-blocked': 'Your browser blocked the Google popup. Allow popups and try again.',
    'auth/popup-closed-by-user': null,
    'auth/cancelled-popup-request': null,
    'auth/operation-not-allowed': 'Email sign-in is not enabled on the server yet.',
    'auth/network-request-failed': 'Network error. Check your connection and try again.',
  };
  const dict = lang === 'en' ? en : es;
  if (code in dict) return dict[code];
  return lang === 'en' ? 'Something went wrong. Please try again.' : 'Algo salió mal. Inténtalo de nuevo.';
}

async function updatePublicLeaderboardDoc(uid) {
  const visibility = await db.kvGet('profileVisibility', VISIBILITY.PUBLIC);
  const isPublic = visibility !== VISIBILITY.PRIVATE;
  const pub = { profileVisibility: VISIBILITY_LEVELS.includes(visibility) ? visibility : VISIBILITY.PUBLIC };

  for (const key of PUBLIC_ALWAYS_KEYS) {
    const v = await db.kvGet(key, null);
    if (v !== null) pub[key] = v;
  }

  // username.toLowerCase(), published so friend search can match without
  // caring about capitals. Derived here on the way out — it is never a stored
  // local key, so there is nothing to keep in sync. Accounts that predate this
  // become findable the next time their public doc is rewritten, which happens
  // on sign-in via pullOrBootstrap.
  pub.usernameLower = typeof pub.username === 'string' && pub.username
    ? pub.username.toLowerCase()
    : deleteField();

  // Averages of the two breakdown maps. Always published: they are what a
  // private profile shows in place of the maps themselves.
  const openingAvg = avgOf(await db.kvGet('openingElo', null));
  const endgameAvg = avgOf(await db.kvGet('endgameElo', null));
  pub.openingEloAvg = openingAvg === null ? deleteField() : openingAvg;
  pub.endgameEloAvg = endgameAvg === null ? deleteField() : endgameAvg;

  for (const key of PUBLIC_DETAIL_KEYS) {
    const v = await db.kvGet(key, null);
    pub[key] = (isPublic && v !== null) ? v : deleteField();
  }

  pub.updatedAt = Date.now();
  await setDoc(doc(firestore, 'leaderboard', uid), pub, { merge: true });
}

db.setSyncHook((key, value) => {
  if (suppressSync || !Auth.user || !SYNCED_KEYS.includes(key)) return;
  const uid = Auth.user.uid;
  setDoc(doc(firestore, 'users', uid), { [key]: value }, { merge: true }).catch(e => {
    console.error('Firestore sync failed for', key, e);
  });
  if (PUBLISHED_KEYS.includes(key)) {
    updatePublicLeaderboardDoc(uid).catch(e => console.error('Leaderboard sync failed', e));
  }
});

// Top N players by the given field (default puzzle ELO). Public read — no
// sign-in required to view.
export async function fetchLeaderboard(limitN = 200, orderByField = 'puzzleElo') {
  const q = query(collection(firestore, 'leaderboard'), orderBy(orderByField, 'desc'), limit(limitN));
  const snap = await getDocs(q);
  const out = [];
  snap.forEach(d => out.push({ uid: d.id, ...d.data() }));
  return out;
}

// Prefix username match against /leaderboard, which is already world-readable,
// so this adds no new exposure. `\uf8ff` is the last character Firestore will
// sort, so the range [needle, needle + \uf8ff) is exactly "starts with needle".
//
// This was an exact match until 2026-08-15, on the reasoning that a prefix
// search lets the alphabet enumerate the whole app. That reasoning was wrong:
// /leaderboard is world-readable and fetchLeaderboard() already hands anyone
// 200 whole rows in one call, so a prefix search leaks nothing new. It cost
// real usability — you had to type the username perfectly to find anybody.
//
// Both bounds are on the SAME field, so the automatic single-field index serves
// this. No composite index is needed; confirmed against production over the
// REST API on 2026-08-15, not just assumed.
//
// SEARCH_MIN_CHARS is a useful-results floor, not a privacy measure: a single
// letter would return five arbitrary strangers, which is a worse answer than
// none. Usernames are not unique, so this returns a short list, not one row,
// and the five it returns are the alphabetically first five — someone with a
// very common prefix has to be typed out further.
export const SEARCH_MIN_CHARS = 2;

export async function searchByUsername(typed) {
  const needle = (typed || '').trim().toLowerCase();
  if (needle.length < SEARCH_MIN_CHARS) return [];
  const q = query(collection(firestore, 'leaderboard'),
    where('usernameLower', '>=', needle),
    where('usernameLower', '<', needle + '\uf8ff'),
    limit(5));
  const snap = await getDocs(q);
  const out = [];
  snap.forEach(d => out.push({ uid: d.id, ...d.data() }));
  return out;
}

// friendRequests/{fromUid_toUid} with exactly the four fields the rules allow.
// The id is deterministic, so asking twice writes the same document — and the
// second attempt is denied outright, because the create rule no longer applies
// to a document that exists. That is how repeat-spam is prevented.
//
// Returns true only when a request was actually created. A permission error
// means either that or a block, and the caller must show the same neutral
// toast for every outcome — a blocked person must not be able to detect the
// block. Do not surface this return value as an error message.
export async function sendFriendRequest(toUid) {
  const user = auth.currentUser;
  if (!user || !toUid || toUid === user.uid) return false;
  await setDoc(doc(firestore, 'friendRequests', `${user.uid}_${toUid}`), {
    from: user.uid,
    to: toUid,
    status: 'pending',
    createdAt: Date.now(),
  });
  return true;
}

// The two Requests-tab queries. Each one needs a composite index on
// friendRequests — both are written out in the commit 4 section of
// docs/superpowers/plans/2026-08-14-friends-system.md.
//
// The read rule uses resource.data.get('from','') rather than a direct field
// read precisely so these two can each pass on the field it constrained. Do not
// tidy that rule; it would break both queries.
export async function fetchIncomingRequests() {
  const user = auth.currentUser;
  if (!user) return [];
  const q = query(collection(firestore, 'friendRequests'),
    where('to', '==', user.uid), where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'), limit(100));
  const snap = await getDocs(q);
  const out = [];
  snap.forEach(d => out.push({ id: d.id, ...d.data() }));
  return out;
}

// No status filter here on purpose: a rejected request must look exactly like a
// pending one to the person who sent it. They keep seeing "Request sent".
export async function fetchOutgoingRequests() {
  const user = auth.currentUser;
  if (!user) return [];
  const q = query(collection(firestore, 'friendRequests'),
    where('from', '==', user.uid), orderBy('createdAt', 'desc'), limit(100));
  const snap = await getDocs(q);
  const out = [];
  snap.forEach(d => out.push({ id: d.id, ...d.data() }));
  return out;
}

// Every friendship I am a member of. `members` is the sorted pair, so one
// array-contains query finds both halves — there is no "mine" and "theirs".
// array-contains alone needs no composite index; adding an orderBy here would
// require one, so the list is sorted client-side instead.
//
// Returns the OTHER person's uid for each friendship, capped at the same 100
// the cap check uses.
export async function fetchFriendUids() {
  const user = auth.currentUser;
  if (!user) return [];
  const q = query(collection(firestore, 'friendships'),
    where('members', 'array-contains', user.uid), limit(100));
  const snap = await getDocs(q);
  const out = [];
  snap.forEach(d => {
    const members = d.data().members || [];
    const other = members.find(u => u !== user.uid);
    if (other) out.push(other);
  });
  return out;
}

// Public leaderboard rows for a short list of uids, keyed by uid. Names,
// avatars and ratings are never copied into a request or a friendship — they
// are read live from here, so they cannot go stale and a stranger cannot store
// text on someone else's document. World-readable, and these lists are capped
// at 100, so one plain read per uid is fine.
export async function fetchLeaderboardByUids(uids) {
  const list = [...new Set(uids)].filter(Boolean);
  const snaps = await Promise.all(list.map(u => getDoc(doc(firestore, 'leaderboard', u))));
  const out = {};
  snaps.forEach((s, i) => { if (s.exists()) out[list[i]] = { uid: list[i], ...s.data() }; });
  return out;
}

// Accepting: the friendship is created FIRST and the request deleted after.
// That order is load-bearing — the create rule requires the sender's pending
// request to still exist at that moment. There is no transaction; if the delete
// fails the worst case is a stale request row, which the UI drops on the next
// load because the friendship is already there.
export async function acceptFriendRequest(fromUid) {
  const user = auth.currentUser;
  if (!user || !fromUid) return false;
  const members = [user.uid, fromUid].sort();
  await setDoc(doc(firestore, 'friendships', members.join('_')), {
    members,
    createdAt: Date.now(),
  });
  await deleteDoc(doc(firestore, 'friendRequests', `${fromUid}_${user.uid}`));
  return true;
}

// Rejecting keeps the document and flips it to 'rejected'. The sender is told
// nothing: their outgoing row still reads "Request sent", and the rules stop
// them putting it back to pending by asking again. One rejection is a
// permanent, silent no.
export async function rejectFriendRequest(fromUid) {
  const user = auth.currentUser;
  if (!user || !fromUid) return false;
  await updateDoc(doc(firestore, 'friendRequests', `${fromUid}_${user.uid}`), {
    status: 'rejected',
  });
  return true;
}

// The sender changing their mind — the document goes away entirely, so the
// recipient's incoming row disappears and the pair can start over.
export async function cancelFriendRequest(toUid) {
  const user = auth.currentUser;
  if (!user || !toUid) return false;
  await deleteDoc(doc(firestore, 'friendRequests', `${user.uid}_${toUid}`));
  return true;
}

// The friendship id both sides compute the same way: the two uids sorted and
// joined. The rules require members[0] < members[1] and the id to match, so
// this is the only shape that can exist.
function pairIdOf(a, b) {
  return [a, b].sort().join('_');
}

// Unfriending. Either member may delete the document and the other person is
// told nothing — there is no notification and no "removed you" state. The rules
// have `allow update: if false`, so a friendship is only ever created or
// deleted.
export async function unfriend(otherUid) {
  const user = auth.currentUser;
  if (!user || !otherUid) return false;
  await deleteDoc(doc(firestore, 'friendships', pairIdOf(user.uid, otherUid)));
  return true;
}

// Blocking, which is four things in one action:
//
//   1. write blocks/{me}/blocked/{them} — this is the part that matters, so it
//      goes first and its error is the only one that propagates. From this
//      moment the rules deny any request they try to send me.
//   2. delete the friendship, if there is one.
//   3. reject any request THEY have pending to me, rather than deleting it.
//      Deleting would make their outgoing row vanish, which is a change they
//      could see and correlate with being blocked; 'rejected' is the existing
//      silent no — their row still reads "Request sent" forever.
//   4. delete any request I have pending to them — that is just cancelling my
//      own, and I clearly no longer want it.
//
// Steps 2-4 are attempted blind rather than read first. A get() on a document
// that does not exist is itself a permission error here (the rules read
// resource.data, and resource is null), so checking first would cost the same
// throw plus an extra round trip. Their failures are swallowed on purpose: a
// half-finished teardown must not undo the block.
export async function blockUser(otherUid) {
  const user = auth.currentUser;
  if (!user || !otherUid || otherUid === user.uid) return false;
  await setDoc(doc(firestore, 'blocks', user.uid, 'blocked', otherUid), {
    createdAt: Date.now(),
  });
  const quiet = p => p.catch(() => {});
  await Promise.all([
    quiet(deleteDoc(doc(firestore, 'friendships', pairIdOf(user.uid, otherUid)))),
    quiet(updateDoc(doc(firestore, 'friendRequests', `${otherUid}_${user.uid}`),
      { status: 'rejected' })),
    quiet(deleteDoc(doc(firestore, 'friendRequests', `${user.uid}_${otherUid}`))),
  ]);
  return true;
}

// Unblocking removes the block and nothing else — it does not restore a
// friendship or a request. The two of you go back to being strangers who may
// ask again.
export async function unblockUser(otherUid) {
  const user = auth.currentUser;
  if (!user || !otherUid) return false;
  await deleteDoc(doc(firestore, 'blocks', user.uid, 'blocked', otherUid));
  return true;
}

// My own block list. Only I can read it, which is what stops a blocked person
// discovering the block by looking. The document id is the blocked uid; names
// and avatars come from fetchLeaderboardByUids, exactly as everywhere else.
export async function fetchBlockedUids() {
  const user = auth.currentUser;
  if (!user) return [];
  const snap = await getDocs(query(
    collection(firestore, 'blocks', user.uid, 'blocked'), limit(200)));
  const out = [];
  snap.forEach(d => out.push(d.id));
  return out;
}

// ── Masterclass ──────────────────────────────────────────────────────────
// A Masterclass is an online, shared database: chapters the owner publishes and
// members who read them. Plan:
// docs/superpowers/plans/2026-08-16-masterclass-stage-1.md

// ADVISORY, UI-side only. This cap cannot be enforced in Firestore rules
// without a server-maintained counter, and a counter the client can write is
// not a security control. It counts the classes you OWN, not the ones you have
// been added to. js/masterclass.js imports this — there must never be a second
// copy of the number.
export const MAX_MASTERCLASSES = 5;

// A Masterclass is created as TWO writes, in this order: the class document
// first, then the owner's own membership. The order is load-bearing — the
// member create rule reads the parent's ownerUid to decide who may add members,
// so the parent has to exist first. There is no transaction; if the second
// write fails the owner is left with a class they can still read (the get rule
// also accepts resource.data.ownerUid == me()) but which does not appear in
// their list, and creating it again is harmless.
//
// serverTimestamp(), not Date.now(): the rules require createdAt == request.time
// and a client clock that is a few seconds out would be refused.
export async function createMasterclass(name) {
  const user = auth.currentUser;
  if (!user || !name) return null;
  const ref = await addDoc(collection(firestore, 'masterclasses'), {
    ownerUid: user.uid,
    name: String(name).slice(0, 60),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    memberCount: 1,
  });
  await setDoc(doc(firestore, 'masterclasses', ref.id, 'members', user.uid), {
    uid: user.uid,
    role: 'owner',
    addedBy: user.uid,
    addedAt: serverTimestamp(),
  });
  return ref.id;
}

// One collection-group query over every membership document carrying my uid,
// then one read per class for its name. `masterclasses` itself has
// `allow list: if false`, so this membership-first shape is the ONLY way to
// find my classes — and it is also what stops anyone enumerating the
// collection. Needs the COLLECTION_GROUP index on members.uid in
// firestore.indexes.json (deployed 2026-08-16); without it this throws
// 'failed-precondition'.
//
// The limit is MAX_MASTERCLASSES * 4, not MAX_MASTERCLASSES: the cap is on
// classes you OWN and you can be a viewer in many more.
//
// Rows come back keyed `id`, not `mcId` — the whole app identifies a row by
// `id` (bases, friends, history), and js/masterclass.js opens on `mc.id`. The
// rename happens here, at the boundary, so exactly one shape exists above it.
export async function fetchMyMasterclasses() {
  const user = auth.currentUser;
  if (!user) return [];
  const snap = await getDocs(query(
    collectionGroup(firestore, 'members'),
    where('uid', '==', user.uid),
    limit(MAX_MASTERCLASSES * 4)));
  const rows = [];
  snap.forEach(d => {
    const parent = d.ref.parent.parent;
    if (parent) rows.push({ id: parent.id, role: d.data().role || 'viewer' });
  });
  const classes = await Promise.all(
    rows.map(r => getDoc(doc(firestore, 'masterclasses', r.id))));
  const out = [];
  classes.forEach((c, i) => {
    // A membership whose class has been deleted is skipped, not shown. See
    // deleteMasterclass() for the one document that can be left behind.
    if (c.exists()) out.push({ ...rows[i], ...c.data() });
  });
  return out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

// One class, by id, for a screen that was reached without the list in hand.
// Returns null when it does not exist or is not mine to read. Nothing calls
// this yet — the list carries every field the Masterclass screen needs today.
// Commit 4 uses it to reread a class after a chapter write moves updatedAt.
export async function fetchMasterclass(mcId) {
  if (!mcId) return null;
  const snap = await getDoc(doc(firestore, 'masterclasses', mcId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Firestore does NOT cascade. Deleting the class document alone would leave its
// members and chapters readable by anyone still holding a membership document —
// a privacy problem, not just untidiness. So the subcollections go FIRST and the
// parent LAST: if this is interrupted the class is still there and the owner can
// try again. A batch caps at 500 operations, which the advisory 50-chapter and
// 30-member caps stay well inside.
//
// TWO deletes here are refused by the current rules and are therefore made
// OUTSIDE the batch, quietly. This was measured against the emulator, not
// assumed — the plan had both inside the batch, and because a batch is atomic
// that would have made deleting a Masterclass fail outright, every time:
//
//   * live/state — the live block has one `allow write` whose every clause
//     reads after(), i.e. request.resource.data. On a delete request.resource
//     is null, so the rule errors and denies. There is no id under live/ that
//     the owner can delete. Commit 6, which is the commit that first writes
//     this document, must add `allow delete: if mcIsOwner(mcId);` and a test.
//     Until then the call is a no-op against a document that never exists.
//   * the owner's own membership — the member rule refuses an owner deleting
//     their own membership while the class exists (that would orphan a class
//     nobody could read), and once the parent is gone mcOwnerUid() does a get()
//     on a document that is not there, which errors and denies too. So exactly
//     one document survives a delete: the owner's own
//     `{ uid, role, addedBy, addedAt }`. Nobody else can read it — both read
//     rules need the deleted parent — and fetchMyMasterclasses() skips it
//     because the class is gone. It holds no other member's data. Closing it
//     needs one more clause in firestore.rules, which this commit deliberately
//     does not touch.
//
// Everyone ELSE's membership and every chapter do go, and they go first, which
// is the part that matters.
export async function deleteMasterclass(mcId) {
  const user = auth.currentUser;
  if (!user || !mcId) return;
  const batch = writeBatch(firestore);
  const [chapters, members] = await Promise.all([
    getDocs(collection(firestore, 'masterclasses', mcId, 'chapters')),
    getDocs(collection(firestore, 'masterclasses', mcId, 'members')),
  ]);
  chapters.forEach(d => batch.delete(d.ref));
  members.forEach(d => { if (d.id !== user.uid) batch.delete(d.ref); });
  await batch.commit();
  // Before the parent goes, so this starts working by itself the day commit 6
  // adds the delete rule.
  await deleteDoc(doc(firestore, 'masterclasses', mcId, 'live', 'state'))
    .catch(() => {});
  await deleteDoc(doc(firestore, 'masterclasses', mcId));
  await deleteDoc(doc(firestore, 'masterclasses', mcId, 'members', user.uid))
    .catch(() => {});
}

// ── Chapters ──────────────────────────────────────────────────────────────
// A chapter IS a game: the PGN is produced by tree.toPgn() and consumed by
// parsePgn(), both already in js/tree.js, so nothing new is serialised and a
// chapter opens in the normal Analysis board.

// ADVISORY, UI-side only, exactly like MAX_MASTERCLASSES: no rule can count
// documents without a server-maintained counter. It is also the `limit()` on
// the fetch below, so a class that somehow held more would still cost one
// bounded read.
export const MAX_CHAPTERS = 50;
// This one is REAL — firestore.rules refuses `pgn.size() > 100000`. The client
// checks it too so an oversized game gives a readable message instead of a
// bare permission-denied.
export const MAX_CHAPTER_BYTES = 100000;

// The five stored fields are exactly the five the rules allow — the key set is
// checked with hasOnly(), so adding a sixth here fails the write.
// serverTimestamp(), never Date.now(): the rule is `updatedAt == request.time`
// and a client clock a few seconds out would be refused.
export async function addChapter(mcId, { title, pgn, startFen, order }) {
  // Size first, so an oversized PGN always reports itself the same way — this
  // is validation of the input, not of the session. Blob counts bytes and the
  // rule counts characters, so it is the stricter of the two and can never let
  // through something the rules would refuse.
  if (new Blob([pgn || '']).size > MAX_CHAPTER_BYTES) throw new Error('chapter-too-big');
  const user = auth.currentUser;
  if (!user || !mcId) return null;
  const ref = await addDoc(collection(firestore, 'masterclasses', mcId, 'chapters'), {
    title: String(title || '').slice(0, 80),
    pgn,
    startFen: String(startFen || '').slice(0, 100),
    order: Number(order) || 0,
    updatedBy: user.uid,
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

// Sorted here rather than with orderBy so no composite index is needed — the
// same shape the friends list uses. The whole PGN of every chapter comes down,
// which is why the cap is also the limit.
export async function fetchChapters(mcId) {
  if (!mcId) return [];
  const snap = await getDocs(query(
    collection(firestore, 'masterclasses', mcId, 'chapters'),
    limit(MAX_CHAPTERS)));
  const out = [];
  snap.forEach(d => out.push({ id: d.id, ...d.data() }));
  return out.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

// `allow delete: if mcIsOwner(mcId)` — unlike live/state, a chapter really can
// be deleted, and the rules test for it passes.
export async function deleteChapter(mcId, chapterId) {
  if (!mcId || !chapterId) return;
  await deleteDoc(doc(firestore, 'masterclasses', mcId, 'chapters', chapterId));
}

// ── Members ───────────────────────────────────────────────────────────────
// A member document is four fields and NOT ONE OF THEM IS A NAME. Names,
// usernames and avatars are read live from /leaderboard with
// fetchLeaderboardByUids(), exactly as the friends list and the request lists
// do — so they cannot go stale, and nobody can store text on a document that
// carries somebody else's uid.

// ADVISORY, UI-side only, like MAX_MASTERCLASSES and MAX_CHAPTERS: no rule can
// count documents without a server-maintained counter, and a counter the client
// writes is not a security control. It is also the bound on the fetch below.
export const MAX_MEMBERS = 30;

// Each add is its own write, and each one can legitimately fail on its own —
// the create rule refuses anyone who has blocked the owner. Failures are
// COUNTED, never named and never thrown, so inviting five friends when one has
// blocked you still adds four and reports four. Naming the one that failed
// would make a block detectable, which is the very thing sendFriendRequest()'s
// single neutral toast exists to prevent.
//
// serverTimestamp(), never Date.now(): the rule is `addedAt == request.time`
// and a client clock a few seconds out would be refused.
export async function addMembers(mcId, uids, role = 'viewer') {
  const user = auth.currentUser;
  if (!user || !mcId) return 0;
  let added = 0;
  // My own membership already exists and the rule would refuse a second one,
  // so it is filtered out rather than counted as a failure.
  for (const uid of [...new Set(uids)].filter(u => u && u !== user.uid)) {
    try {
      await setDoc(doc(firestore, 'masterclasses', mcId, 'members', uid), {
        uid, role, addedBy: user.uid, addedAt: serverTimestamp(),
      });
      added++;
    } catch { /* blocked, or offline — silent by design, see above */ }
  }
  return added;
}

// Everyone in the class can see who else is in it. Unsorted here; the screen
// sorts, the same way fetchChapters() and the friends list do, so no composite
// index is needed.
export async function fetchMembers(mcId) {
  if (!mcId) return [];
  const snap = await getDocs(query(
    collection(firestore, 'masterclasses', mcId, 'members'),
    limit(MAX_MEMBERS + 10)));
  const out = [];
  snap.forEach(d => out.push({ uid: d.id, ...d.data() }));
  return out;
}

// The owner removing somebody. The rule refuses `memberUid == me()` here, so
// the owner cannot remove themselves — a class with no owner-member is
// unreachable. js/masterclass.js therefore draws no ⋯ on the owner's own row.
export async function removeMember(mcId, uid) {
  if (!mcId || !uid) return;
  await deleteDoc(doc(firestore, 'masterclasses', mcId, 'members', uid));
}

// Leaving is the same delete, done to my own document, and the rule allows it
// only while I am NOT the owner — for the same reason.
export async function leaveMasterclass(mcId) {
  const user = auth.currentUser;
  if (!user || !mcId) return;
  await deleteDoc(doc(firestore, 'masterclasses', mcId, 'members', user.uid));
}

// The number on the Bases row, so the list can say "3 members" without reading
// the subcollection. Advisory — if it drifts, the member screen is the truth.
//
// BOTH fields are mandatory. The parent update rule requires
// `after().updatedAt == request.time` AND
// `keys().hasOnly(['ownerUid','name','createdAt','updatedAt','memberCount'])`,
// so sending memberCount on its own is DENIED, not merely untidy.
//
// Only the owner may update the parent, so a member who LEAVES cannot fix the
// count. That is deliberate and there is nothing to do about it client-side:
// the number goes stale by one until the owner next opens the class, and the
// member list underneath it is always right.
export async function setMemberCount(mcId, n) {
  const user = auth.currentUser;
  if (!user || !mcId) return;
  await updateDoc(doc(firestore, 'masterclasses', mcId), {
    memberCount: Math.max(0, Math.round(n) || 0),
    updatedAt: serverTimestamp(),
  });
}

async function pullOrBootstrap(uid) {
  const ref = doc(firestore, 'users', uid);
  const snap = await getDoc(ref);
  suppressSync = true;
  try {
    if (snap.exists()) {
      const remote = snap.data();
      for (const key of SYNCED_KEYS) {
        if (remote[key] !== undefined) await db.kvSet(key, remote[key]);
      }
      Auth.needsProfileCompletion = !remote.firstName;
    } else {
      const local = {};
      for (const key of SYNCED_KEYS) {
        const v = await db.kvGet(key, null);
        if (v !== null) local[key] = v;
      }
      await setDoc(ref, local, { merge: true });
      Auth.needsProfileCompletion = !local.firstName;
    }
  } finally {
    suppressSync = false;
  }
  updatePublicLeaderboardDoc(uid).catch(e => console.error('Leaderboard publish failed', e));
}

onAuthStateChanged(auth, async (user) => {
  Auth.user = user;
  if (user) {
    try { await pullOrBootstrap(user.uid); } catch (e) { console.error('Firestore pull failed', e); }
  }
  Auth._notify();
});
