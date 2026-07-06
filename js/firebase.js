// Firebase Auth (Google) + Firestore sync.
// Loaded from Google's own CDN — there is no offline story for login/sync anyway
// (it requires the network by definition), so vendoring it brings no benefit.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
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
  'profileName', 'streakCount', 'streakLastDate',
  'puzzleElo', 'puzzleThemeElo', 'puzzlesSolved',
  'openingElo', 'endgameElo', 'boardTheme', 'pieceSet',
];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const firestore = getFirestore(app);

let suppressSync = false;

export const Auth = {
  user: null,
  listeners: [],

  onChange(fn) { this.listeners.push(fn); },
  _notify() { for (const fn of this.listeners) fn(this.user); },

  async signIn() {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
        console.error('Google sign-in failed', e);
      }
    }
  },

  async signOut() {
    await signOut(auth);
  },
};

db.setSyncHook((key, value) => {
  if (suppressSync || !Auth.user || !SYNCED_KEYS.includes(key)) return;
  setDoc(doc(firestore, 'users', Auth.user.uid), { [key]: value }, { merge: true }).catch(e => {
    console.error('Firestore sync failed for', key, e);
  });
});

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
    } else {
      const local = {};
      for (const key of SYNCED_KEYS) {
        const v = await db.kvGet(key, null);
        if (v !== null) local[key] = v;
      }
      await setDoc(ref, local, { merge: true });
    }
  } finally {
    suppressSync = false;
  }
}

onAuthStateChanged(auth, async (user) => {
  Auth.user = user;
  if (user) {
    try { await pullOrBootstrap(user.uid); } catch (e) { console.error('Firestore pull failed', e); }
  }
  Auth._notify();
});
