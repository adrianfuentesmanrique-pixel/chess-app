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
  // Masterclass. onSnapshot drives the live board — watchLiveState() below is
  // the only place in the app that opens a Firestore listener at all.
  addDoc, collectionGroup, serverTimestamp, writeBatch, onSnapshot,
  // Students homework: progress is added, not overwritten, so two phones add up.
  increment,
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

  // Permanently deletes the account: the Students summary, coaching links and
  // homework (given or received), the public leaderboard entry, the private
  // user document, and the Firebase Auth account itself.
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
    // Students: my summary, and every coaching link where I am the teacher or
    // the student. The links are found by query first because their ids name
    // the other person. As a teacher, a link the student DECLINED cannot be
    // deleted by me (the rules keep a decline until the student clears it); it
    // is skipped with the usual warning and holds nothing but the two uids.
    const paths = [['studentReports', uid]];
    for (const field of ['teacherUid', 'studentUid']) {
      try {
        const snap = await getDocs(query(collection(firestore, 'coaching'), where(field, '==', uid)));
        snap.forEach(d => paths.push(['coaching', d.id]));
      } catch (e) {
        if (e.code !== 'permission-denied') throw e;
        console.warn(`Could not list coaching links (${field}) — proceeding anyway`, e);
      }
    }
    // Homework after the links: as a student I may delete it only once the
    // link is no longer active, and the loop below deletes in order.
    for (const field of ['teacherUid', 'studentUid']) {
      try {
        const snap = await getDocs(query(collection(firestore, 'homework'), where(field, '==', uid)));
        snap.forEach(d => paths.push(['homework', d.id]));
      } catch (e) {
        if (e.code !== 'permission-denied') throw e;
        console.warn(`Could not list homework (${field}) — proceeding anyway`, e);
      }
    }
    paths.push(['leaderboard', uid], ['users', uid]);
    for (const path of paths) {
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
    // Coaching ends in both directions (plan 3.5; the rules do not do this).
    // As their student I may delete any status; as their teacher a 'declined'
    // link is refused by design and simply stays.
    quiet(deleteDoc(doc(firestore, 'coaching', coachingIdOf(user.uid, otherUid)))),
    quiet(deleteDoc(doc(firestore, 'coaching', coachingIdOf(otherUid, user.uid)))),
  ]);
  // Homework between us goes too, after the links (a student may delete it
  // only once the link is not active). Quiet for the same reason as above.
  await quiet(deleteHomeworkBetween(otherUid, user.uid));
  await quiet(deleteHomeworkBetween(user.uid, otherUid));
  // Rebuilt from the links that are left, so a blocked teacher drops out of
  // my summary now rather than on my next app open.
  await quiet(publishStudentReport());
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
//   * the owner's own membership — this one is now CLOSED, and closing it is
//     the reason the last two lines below are ordered the way they are. The
//     member rule still refuses an owner deleting their own membership while
//     the class exists (that would orphan a class nobody could read), so the
//     delete has to come AFTER the parent: firestore.rules gained a clause
//     reading `memberUid == me() && !exists(mcPath(mcId))`, which is only ever
//     true once the parent is gone. Do not hoist this line above the parent
//     delete — that is the one order in which it cannot succeed. It keeps its
//     .catch() because a failure here leaves one unreadable document behind,
//     which is not worth failing an otherwise complete delete over.
//
// Everyone ELSE's membership and every chapter go first, which is the part
// that matters.
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
  // LAST, and only here: the rule that permits it requires the parent to be
  // gone already. See the note above.
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

// The other half of addChapter(), and the reason a chapter opened on the
// Analysis board can be edited at all. Before this existed a chapter was
// add-and-delete only: 💾 Save to database put a COPY in a local base, because
// openChapter() loads with baseId: null, and nothing ever wrote back to the
// class.
//
// No rules change was needed for it. `allow write` on a chapter covers create
// AND update, and the clauses it already carries are exactly the ones an edit
// has to satisfy — so this passes the same six keys addChapter() does, in full.
// It is setDoc(), not updateDoc(), on purpose: hasOnly() is checked against the
// WHOLE resulting document, so writing all six keys every time makes the write
// mean the same thing whatever shape the stored document had.
//
// updatedAt is serverTimestamp() for the same reason as everywhere else here —
// the rule is `updatedAt == request.time` and a client clock a few seconds out
// is refused.
export async function updateChapter(mcId, chapterId, { title, pgn, startFen, order }) {
  // Checked before the session, identically to addChapter(), so an oversized
  // PGN reports itself the same way whichever door it came through.
  if (new Blob([pgn || '']).size > MAX_CHAPTER_BYTES) throw new Error('chapter-too-big');
  const user = auth.currentUser;
  if (!user || !mcId || !chapterId) return;
  await setDoc(doc(firestore, 'masterclasses', mcId, 'chapters', chapterId), {
    title: String(title || '').slice(0, 80),
    pgn,
    startFen: String(startFen || '').slice(0, 100),
    order: Number(order) || 0,
    updatedBy: user.uid,
    updatedAt: serverTimestamp(),
  });
}

// Moving a chapter. This writes `order` and nothing else, so the PGN never
// leaves the phone — which is the whole reason it is not updateChapter().
//
// updateDoc(), not setDoc(), and that is safe for a reason worth writing down:
// the chapter rule tests after().keys().hasOnly([...six...]) against the WHOLE
// RESULTING document, not against the keys this call sends. A stored chapter
// already has all six, so touching three of them leaves six behind and the rule
// is satisfied. updateChapter() uses setDoc() because it changes `pgn` and so
// has to send `pgn` anyway; there, writing all six makes the write mean the same
// thing whatever shape the stored document had.
//
// updatedAt is serverTimestamp() because the rule is `updatedAt == request.time`.
export async function setChapterOrder(mcId, chapterId, order) {
  const user = auth.currentUser;
  if (!user || !mcId || !chapterId) return;
  await updateDoc(doc(firestore, 'masterclasses', mcId, 'chapters', chapterId), {
    order: Number(order) || 0,
    updatedBy: user.uid,
    updatedAt: serverTimestamp(),
  });
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
// updateDoc, not setDoc, and that is the whole reason this is three lines. The
// class update rule checks hasOnly() against the WHOLE resulting document, so a
// two-field patch still satisfies it — while a setDoc would have to re-send
// createdAt and memberCount, and re-sending a memberCount from a client that
// has not reloaded the class would quietly write back a stale number.
//
// The 60-character bound is the rule's (`name.size() <= 60`); the slice here
// keeps a long name from being a permission-denied instead of a trimmed name.
// An empty name is refused by the rule, so the caller checks for one first.
export async function renameMasterclass(mcId, name) {
  const user = auth.currentUser;
  if (!user || !mcId) return;
  await updateDoc(doc(firestore, 'masterclasses', mcId), {
    name: String(name || '').slice(0, 60),
    updatedAt: serverTimestamp(),
  });
}

export async function setMemberCount(mcId, n) {
  const user = auth.currentUser;
  if (!user || !mcId) return;
  await updateDoc(doc(firestore, 'masterclasses', mcId), {
    memberCount: Math.max(0, Math.round(n) || 0),
    updatedAt: serverTimestamp(),
  });
}

// ── The live board ────────────────────────────────────────────────────────
// One document per class, `masterclasses/{mcId}/live/state`, holding where the
// teacher is right now. It is not a history and it is not a message queue: a
// viewer who reconnects gets the CURRENT position, never a replay of the moves
// they missed. For a lesson that is the right behaviour.

// Firestore's sustained write limit on a SINGLE document is about one write per
// second. This document is written on every move the teacher makes, so writes
// are coalesced: at most one per second, and the newest pending state wins.
// That coalescing is LOSSLESS now that the document carries the whole line and
// not a pointer: a burst of ten moves in one second collapses to one write that
// still contains all ten, where a dropped intermediate write used to be a
// skipped position. The payload grows through a lesson but stays at hundreds of
// bytes, so it has no effect on the throttle.
// Removing this throttle does not fail loudly — it degrades into rejected
// writes and rising latency under exactly the conditions (a busy lesson) where
// it matters most. Do not remove it.
export const LIVE_THROTTLE_MS = 1000;

let livePending = null;
let liveTimer = null;

export function pushLiveState(mcId, next) {
  const user = auth.currentUser;
  if (!user || !mcId) return;
  livePending = { mcId, next };
  // Leading edge: the first move of a quiet minute goes out at once, and only a
  // burst gets coalesced. A trailing-only throttle would put a second of lag on
  // every single move.
  if (liveTimer) return;
  const flush = () => {
    liveTimer = null;
    if (!livePending) return;
    const { mcId: id, next: state } = livePending;
    livePending = null;
    liveTimer = setTimeout(flush, LIVE_THROTTLE_MS);
    // The rule refuses a line over 4096 characters, and a line is SAN moves
    // joined by single spaces — so it is cut at a SEPARATOR, never mid-move. A
    // trimmed line still replays to a real, earlier position in the lesson
    // rather than to half a move, and the teacher's next move sends the whole
    // line again anyway. At roughly five characters a move that is about 800
    // plies; like the 512-character path before it, no real lesson reaches it.
    let line = String(state.line || '');
    if (line.length > 4096) {
      const cut = line.lastIndexOf(' ', 4096);
      line = cut > 0 ? line.slice(0, cut) : '';
    }
    setDoc(doc(firestore, 'masterclasses', id, 'live', 'state'), {
      chapterId: state.chapterId ?? null,
      fen: String(state.fen || '').slice(0, 100),
      line,
      // Already packed by packShapes() in js/masterclass.js and capped there;
      // the rule refuses anything over 32 arrows or 32 squares.
      shapes: state.shapes || { a: '', s: '' },
      drivenBy: user.uid,
      // serverTimestamp(), never Date.now(): the rule is
      // `updatedAt == request.time` and a client clock a few seconds out would
      // be refused.
      updatedAt: serverTimestamp(),
    }).catch(e => console.error('live push failed', e));
  };
  flush();
}

// Stopping a broadcast has to cancel the queued write FIRST. Without this, an
// owner who moves and immediately taps Stop deletes the document and then the
// pending flush writes it straight back, and the class looks live with nobody
// driving it. The delete needs the rule this commit added — before it, the
// `allow write` block's after() clauses evaluated against null and denied.
export async function stopLiveState(mcId) {
  livePending = null;
  if (liveTimer) { clearTimeout(liveTimer); liveTimer = null; }
  if (!mcId || !auth.currentUser) return;
  await deleteDoc(doc(firestore, 'masterclasses', mcId, 'live', 'state'));
}

// metadata.fromCache is the ONLY reliable signal that this client has lost the
// server. It flips true the moment the connection drops and false on
// resubscribe. Note the app does NOT enable Firestore disk persistence (plain
// getFirestore above), so that cache is in-memory and dies on reload — a viewer
// who reloads while offline sees the offline state, not stale content. That is
// intended, not a bug. Commit 7 is what draws a Reconnecting… bar from it.
//
// Returns the unsubscribe function. A listener left running is a document read
// per teacher move, forever, so every caller must hold onto it.
//
// { includeMetadataChanges: true } is LOAD-BEARING, and it is what commit 7
// added. By default onSnapshot only raises an event when the document DATA
// changes — losing the server is a metadata-only change, so an idle viewer whose
// connection dropped would never be called back and the Reconnecting bar would
// never appear. The flag costs no document reads: the extra events are raised
// locally, from the same snapshot, and Firestore bills reads, not callbacks.
export function watchLiveState(mcId, cb) {
  if (!mcId) return () => {};
  return onSnapshot(doc(firestore, 'masterclasses', mcId, 'live', 'state'),
    { includeMetadataChanges: true },
    snap => cb(snap.exists() ? snap.data() : null, { fromCache: snap.metadata.fromCache }),
    err => { console.error('live watch failed', err); cb(null, { fromCache: true }); });
}

// ── Students ──────────────────────────────────────────────────────────────
// A teacher follows a student's training. Two collections, both guarded in
// firestore.rules (Students block) and tested in tests/rules/students.test.js:
//   coaching/{teacherUid}_{studentUid}  the link: 'pending' → 'active' | 'declined'
//   studentReports/{studentUid}         the summary, written ONLY by the student
// Plan: docs/plans/2026-09-29-students.md. The screen is js/students.js.
//
// Unlike addMembers() above, nothing here gives anyone access without the
// other person's yes: the teacher can only create a PENDING link, and only the
// student can make it active.

// ADVISORY, UI-side only, like MAX_MEMBERS: no rule can count a teacher's
// links. It is also the bound on fetchMyStudentLinks() / fetchStudentReports().
export const MAX_STUDENTS = 30;
// REAL — the studentReports rule refuses `teachers.size() > 3`. The client
// checks it too (acceptTeacher) so a 4th accept gets a readable refusal
// instead of a half-applied state.
export const MAX_TEACHERS = 3;

// Directional, teacher first — NOT pairIdOf(). The rules require exactly this.
function coachingIdOf(teacherUid, studentUid) {
  return `${teacherUid}_${studentUid}`;
}

// Teacher side. Throws on a permission error, like sendFriendRequest(): that
// error means not-friends OR a block, and the caller must show the same
// neutral "Invite sent" for both — a block is never revealed.
// serverTimestamp(), never Date.now(): the rule is `createdAt == request.time`.
export async function inviteStudent(studentUid) {
  const user = auth.currentUser;
  if (!user || !studentUid || studentUid === user.uid) return false;
  await setDoc(doc(firestore, 'coaching', coachingIdOf(user.uid, studentUid)), {
    teacherUid: user.uid,
    studentUid,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
  return true;
}

// Teacher side: removing an active student. The rule lets the teacher delete
// a 'pending' or 'active' link but NOT a 'declined' one — a decline stays until
// the student clears it, so deleting and re-inviting cannot pester them.
//
// The student's summary still lists this teacher until the student's app next
// runs publishStudentReport(), which prunes it. The teacher cannot edit the
// student's document; this is documented in firestore.rules, not a leak.
//
// The homework I gave this student goes in the same batch (the teacher may
// always delete their own homework). A pending invite has none; the query is
// one read either way.
export async function removeStudent(studentUid) {
  const user = auth.currentUser;
  if (!user || !studentUid) return false;
  const hw = await homeworkRefs(user.uid, studentUid);
  const batch = writeBatch(firestore);
  batch.delete(doc(firestore, 'coaching', coachingIdOf(user.uid, studentUid)));
  hw.forEach(r => batch.delete(r));
  await batch.commit();
  return true;
}

// Withdrawing a pending invite is the same delete. Two names so the stage 2
// screen reads the way the person thinks about it.
export const withdrawInvite = removeStudent;

// Each list query constrains ONE of the two uid fields. The read rule uses
// .get(field, '') precisely so each can pass on the field it constrained — do
// not tidy that rule. No orderBy, so no composite index; the screen sorts.
async function fetchLinksWhere(field, max) {
  const user = auth.currentUser;
  if (!user) return [];
  const snap = await getDocs(query(collection(firestore, 'coaching'),
    where(field, '==', user.uid), limit(max)));
  const out = [];
  snap.forEach(d => out.push({ id: d.id, ...d.data() }));
  return out;
}
export const fetchMyStudentLinks = () => fetchLinksWhere('teacherUid', MAX_STUDENTS + 10);
export const fetchMyTeacherLinks = () => fetchLinksWhere('studentUid', 50);

// Teacher uids with an ACTIVE link to me, oldest acceptance first, capped at
// MAX_TEACHERS. The summary's `teachers` list is always built from this, never
// from an older copy of the summary: the rules refuse any listed teacher whose
// link is not active, so a stale list would fail the whole write.
function activeTeacherUids(links, { add = null, drop = null } = {}) {
  const ms = t => (t && typeof t.toMillis === 'function') ? t.toMillis() : 0;
  const uids = links
    .filter(l => l.status === 'active' && l.teacherUid !== drop)
    .sort((a, b) => ms(a.respondedAt) - ms(b.respondedAt))
    .map(l => l.teacherUid);
  if (add && !uids.includes(add)) uids.push(add);
  return uids.slice(0, MAX_TEACHERS);
}

// The summary a teacher sees, built from local kv keys. ONLY these fields —
// the rules allowlist refuses anything else (real name, birth date, email,
// games, bases, books). Values that would break a rule bound are left out
// rather than sent, so one odd local value cannot block the whole summary.
// activeTime is the last 30 days of the local 'activeTime' kv (js/activity.js),
// whole seconds per area. hwOpen/hwDone come from the kv HW_COUNTS_KEY that
// js/students.js writes whenever it fetches my homework (all my teachers'
// together — the summary is one document for all of them).
const HISTORY_SENT = 120; // the device keeps 400 (recordEloHistory, js/app.js)
async function buildStudentReport(teachers) {
  const out = { teachers, updatedAt: serverTimestamp() };
  const str = async (key, max) => {
    const v = await db.kvGet(key, null);
    if (typeof v === 'string') out[key] = v.slice(0, max);
  };
  const numIn = (key, v, lo, hi) => {
    if (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi) out[key] = v;
  };
  await str('profileName', 60);
  await str('username', 60);
  await str('avatarId', 64);
  numIn('puzzleElo', await db.kvGet('puzzleElo', null), 0, 4000);
  numIn('blindfoldElo', await db.kvGet('blindfoldElo', null), 0, 4000);
  numIn('openingEloAvg', avgOf(await db.kvGet('openingElo', null)), 0, 4000);
  numIn('endgameEloAvg', avgOf(await db.kvGet('endgameElo', null)), 0, 4000);
  const themes = await db.kvGet('puzzleThemeElo', null);
  if (themes && typeof themes === 'object' && !Array.isArray(themes)) out.puzzleThemeElo = themes;
  for (const key of ['puzzleEloHistory', 'openingEloHistory', 'endgameEloHistory', 'blindfoldEloHistory']) {
    const h = await db.kvGet(key, null);
    if (Array.isArray(h)) out[key] = h.slice(-HISTORY_SENT);
  }
  // puzzlesSolved is {puzzleId: themes|true} — only its size leaves the device.
  const solved = await db.kvGet('puzzlesSolved', null);
  if (solved && typeof solved === 'object') numIn('puzzlesSolvedCount', Object.keys(solved).length, 0, 1000000);
  numIn('puzzleAttemptCount', await db.kvGet('puzzleAttemptCount', null), 0, 10000000);
  numIn('streakCount', await db.kvGet('streakCount', null), 0, 30000);
  numIn('bestStreak', await db.kvGet('bestStreak', null), 0, 30000);
  // Rules: a map of at most 31 days. Dates are the device's own, like the
  // rating histories. Unknown shapes are skipped, never sent.
  const act = await db.kvGet('activeTime', null);
  if (act && typeof act === 'object' && !Array.isArray(act)) {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    const p = n => String(n).padStart(2, '0');
    const cut = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const days = {};
    for (const date of Object.keys(act).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k) && k >= cut).sort().slice(-30)) {
      const row = {};
      for (const [area, sec] of Object.entries(act[date] || {})) {
        if (typeof sec === 'number' && sec > 0 && sec <= 86400) row[area.slice(0, 20)] = Math.round(sec);
      }
      if (Object.keys(row).length) days[date] = row;
    }
    out.activeTime = days;
  }
  const hw = await db.kvGet(HW_COUNTS_KEY, null);
  if (hw && typeof hw === 'object') {
    numIn('hwOpen', hw.open, 0, 1000);
    numIn('hwDone', hw.done, 0, 1000);
  }
  return out;
}

// The summary exactly as a teacher would get it, for the student's own
// "what my teachers see" view. Built locally; nothing is written.
export function previewStudentReport() {
  return buildStudentReport([]);
}

// Student side: Accept is ONE batch — the link goes active AND the summary
// naming this teacher is written. The rule checks the summary's teachers with
// getAfter(), which sees the link as it will be after this batch; with get()
// this batch could never succeed. Throws an error with code 'max-teachers'
// when three are already active, before anything is written.
export async function acceptTeacher(teacherUid) {
  const user = auth.currentUser;
  if (!user || !teacherUid) return false;
  const links = await fetchMyTeacherLinks();
  const already = activeTeacherUids(links, { drop: teacherUid });
  if (already.length >= MAX_TEACHERS) {
    const e = new Error('A student can have at most 3 teachers');
    e.code = 'max-teachers';
    throw e;
  }
  const batch = writeBatch(firestore);
  batch.update(doc(firestore, 'coaching', coachingIdOf(teacherUid, user.uid)),
    { status: 'active', respondedAt: serverTimestamp() });
  batch.set(doc(firestore, 'studentReports', user.uid),
    await buildStudentReport([...already, teacherUid]));
  await batch.commit();
  return true;
}

// Student side. One answer only: the rules refuse any change after this, and
// only the student can clear it (endCoaching).
export async function declineTeacher(teacherUid) {
  const user = auth.currentUser;
  if (!user || !teacherUid) return false;
  await updateDoc(doc(firestore, 'coaching', coachingIdOf(teacherUid, user.uid)),
    { status: 'declined', respondedAt: serverTimestamp() });
  return true;
}

// Student side "End" (also clears a pending or declined link). ONE batch:
// the link and that teacher's homework are deleted and the teacher is pruned
// from the summary in the same instant, or the summary is deleted when no teacher is left. The remaining
// list comes from the links, not from the summary, because a teacher who
// removed me has no link left and the rules would refuse keeping them.
export async function endCoaching(teacherUid) {
  const user = auth.currentUser;
  if (!user || !teacherUid) return false;
  const reportRef = doc(firestore, 'studentReports', user.uid);
  const [links, report, hw] = await Promise.all([
    fetchMyTeacherLinks(), getDoc(reportRef), homeworkRefs(teacherUid, user.uid)]);
  const batch = writeBatch(firestore);
  batch.delete(doc(firestore, 'coaching', coachingIdOf(teacherUid, user.uid)));
  // That teacher's homework, in the same instant. The rule lets the student
  // delete it only once the link is not active — checked with existsAfter(),
  // so it passes inside this very batch.
  hw.forEach(r => batch.delete(r));
  if (report.exists()) {
    const remaining = activeTeacherUids(links, { drop: teacherUid });
    if (remaining.length) batch.update(reportRef, { teachers: remaining, updatedAt: serverTimestamp() });
    else batch.delete(reportRef);
  }
  await batch.commit();
  return true;
}

// Student side: rewrite the whole summary (setDoc, no merge, so a field that
// is gone locally is gone remotely too). Teachers without an ACTIVE link are
// pruned first — that is how a teacher who removed me stops being able to read
// it. With no active teacher left the summary is deleted instead; returns
// false in that case. js/students.js decides WHEN this runs (on app open with
// a teacher, then at most every 15 minutes of practice). `links` lets a caller
// that has just fetched fetchMyTeacherLinks() skip a second query.
export async function publishStudentReport(links = null) {
  const user = auth.currentUser;
  if (!user) return false;
  const ref = doc(firestore, 'studentReports', user.uid);
  const teachers = activeTeacherUids(links || await fetchMyTeacherLinks());
  if (!teachers.length) {
    await deleteDoc(ref);
    return false;
  }
  await setDoc(ref, await buildStudentReport(teachers));
  return true;
}

// Teacher side: every summary that lists me, in ONE array-contains query — the
// read rule can prove it from the query, so it costs one read per student and
// no get(). Keyed by student uid. array-contains alone needs no index.
export async function fetchStudentReports() {
  const user = auth.currentUser;
  if (!user) return {};
  const snap = await getDocs(query(collection(firestore, 'studentReports'),
    where('teachers', 'array-contains', user.uid), limit(MAX_STUDENTS + 10)));
  const out = {};
  snap.forEach(d => { out[d.id] = { uid: d.id, ...d.data() }; });
  return out;
}

// ── Homework (Students stage 4) ─────────────────────────────────────
// homework/{autoId}: the teacher writes the task once; after that only the
// student's app moves it, and only done / seconds / status / completedAt.
// Guarded by the homework block in firestore.rules. Kinds this stage:
// 'puzzles' {themes ≤ 5, minRating, maxRating, count 1–100} and 'text' {}.

// ADVISORY, app-side only (no rule can count): open homework per student.
export const MAX_OPEN_HOMEWORK = 10;
// kv key for {open, done}: what the student's summary sends as hwOpen/hwDone.
export const HW_COUNTS_KEY = 'hwCounts';

// Refs of every homework `teacherUid` gave `studentUid`. Both fields are
// constrained, so either side may run it (the read rule uses .get(field, '')).
async function homeworkRefs(teacherUid, studentUid) {
  const snap = await getDocs(query(collection(firestore, 'homework'),
    where('teacherUid', '==', teacherUid), where('studentUid', '==', studentUid), limit(100)));
  return snap.docs.map(d => d.ref);
}

async function deleteHomeworkBetween(teacherUid, studentUid) {
  const refs = await homeworkRefs(teacherUid, studentUid);
  if (!refs.length) return;
  const batch = writeBatch(firestore);
  refs.forEach(r => batch.delete(r));
  await batch.commit();
}

// Teacher side. The rule refuses it unless the link is ACTIVE right now.
// Everything starts at zero; createdAt is the server's clock.
export async function assignHomework(studentUid, { kind, title, note, params, dueDate }) {
  const user = auth.currentUser;
  if (!user || !studentUid) return null;
  const data = {
    teacherUid: user.uid, studentUid, kind,
    title: String(title).slice(0, 80), params,
    status: 'open', done: 0, seconds: 0, createdAt: serverTimestamp(),
  };
  if (note) data.note = String(note).slice(0, 500);
  if (dueDate) data.dueDate = dueDate;
  const ref = await addDoc(collection(firestore, 'homework'), data);
  return ref.id;
}

function hwList(snap) {
  const out = [];
  snap.forEach(d => out.push({ id: d.id, ...d.data() }));
  return out;
}

// Teacher side: what I gave one student. Fetched when the student page opens,
// so the roster itself costs no homework reads.
export async function fetchHomeworkFor(studentUid) {
  const user = auth.currentUser;
  if (!user || !studentUid) return [];
  return hwList(await getDocs(query(collection(firestore, 'homework'),
    where('teacherUid', '==', user.uid), where('studentUid', '==', studentUid), limit(100))));
}

// Student side: everything assigned to me, by every teacher.
export async function fetchMyHomework() {
  const user = auth.currentUser;
  if (!user) return [];
  return hwList(await getDocs(query(collection(firestore, 'homework'),
    where('studentUid', '==', user.uid), limit(100))));
}

// Teacher side. The teacher never edits a task — delete and assign again.
export async function deleteHomework(hwId) {
  if (!auth.currentUser || !hwId) return false;
  await deleteDoc(doc(firestore, 'homework', hwId));
  return true;
}

// Student side: one bundled save. increment(), never an absolute number, so a
// second phone adds its own puzzles instead of overwriting (the rules only let
// the counters go up). `finish` stamps status 'done' + completedAt from the
// server; the rules accept that only once the target is reached.
export async function saveHomeworkProgress(hwId, { addDone = 0, addSeconds = 0, finish = false } = {}) {
  if (!auth.currentUser || !hwId) return false;
  const patch = {};
  if (addDone > 0) patch.done = increment(Math.round(addDone));
  if (addSeconds > 0) patch.seconds = increment(Math.round(addSeconds));
  if (finish) { patch.status = 'done'; patch.completedAt = serverTimestamp(); }
  if (!Object.keys(patch).length) return false;
  await updateDoc(doc(firestore, 'homework', hwId), patch);
  return true;
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
      // Both, not just firstName. username arrived with Friends, so every
      // account created before it has a firstName and no username — and those
      // accounts passed a firstName-only gate forever, were never asked, and
      // updatePublicLeaderboardDoc() below deletes usernameLower for them.
      // The result is an account that is visible everywhere except friend
      // search, which is the one place it needs to be found. A Google sign-in
      // never sets a username either: the provider supplies a display name and
      // nothing else, so it lands in exactly the same hole.
      Auth.needsProfileCompletion = !remote.firstName || !remote.username;
    } else {
      const local = {};
      for (const key of SYNCED_KEYS) {
        const v = await db.kvGet(key, null);
        if (v !== null) local[key] = v;
      }
      await setDoc(ref, local, { merge: true });
      Auth.needsProfileCompletion = !local.firstName || !local.username;
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
