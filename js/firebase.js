// Firebase Auth (Google + email/password) + Firestore sync.
// Loaded from Google's own CDN — there is no offline story for login/sync anyway
// (it requires the network by definition), so vendoring it brings no benefit.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile,
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
  'profileName', 'firstName', 'lastName', 'dateOfBirth',
  'streakCount', 'streakLastDate',
  'puzzleElo', 'puzzleThemeElo', 'puzzlesSolved',
  'openingElo', 'endgameElo', 'boardTheme', 'pieceSet',
];

const app = initializeApp(firebaseConfig);
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

  async signUpWithEmail({ email, password, firstName, lastName, dateOfBirth }) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const displayName = `${firstName} ${lastName}`.trim();
    await updateProfile(cred.user, { displayName });
    suppressSync = true;
    try {
      await db.kvSet('profileName', displayName);
      await db.kvSet('firstName', firstName);
      await db.kvSet('lastName', lastName);
      await db.kvSet('dateOfBirth', dateOfBirth);
    } finally {
      suppressSync = false;
    }
    const local = { profileName: displayName, firstName, lastName, dateOfBirth, email };
    await setDoc(doc(firestore, 'users', cred.user.uid), local, { merge: true });
    this.needsProfileCompletion = false;
  },

  async signInWithEmail(email, password) {
    await signInWithEmailAndPassword(auth, email, password);
  },

  async completeProfile({ firstName, lastName, dateOfBirth }) {
    if (!this.user) return;
    const displayName = `${firstName} ${lastName}`.trim();
    suppressSync = true;
    try {
      await db.kvSet('profileName', displayName);
      await db.kvSet('firstName', firstName);
      await db.kvSet('lastName', lastName);
      await db.kvSet('dateOfBirth', dateOfBirth);
    } finally {
      suppressSync = false;
    }
    await setDoc(doc(firestore, 'users', this.user.uid), { profileName: displayName, firstName, lastName, dateOfBirth }, { merge: true });
    this.needsProfileCompletion = false;
    this._notify();
  },

  async signOut() {
    await signOut(auth);
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
}

onAuthStateChanged(auth, async (user) => {
  Auth.user = user;
  if (user) {
    try { await pullOrBootstrap(user.uid); } catch (e) { console.error('Firestore pull failed', e); }
  }
  Auth._notify();
});
