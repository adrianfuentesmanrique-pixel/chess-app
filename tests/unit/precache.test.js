import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPrecache, staticImports } from '../../tools/check-precache.mjs';

test('the import walk finds the startup modules, including multi-line imports', () => {
  const files = staticImports();
  for (const f of ['js/app.js', 'js/firebase.js', 'js/puzzles.js', 'js/learning-data.js', 'vendor/chess.js',
    // The Firebase SDK: minified (`import{…}from"./firebase-app.js"`, no spaces).
    'vendor/firebase-10.14.1/firebase-app.js', 'vendor/firebase-10.14.1/firebase-auth.js',
    'vendor/firebase-10.14.1/firebase-firestore.js', 'vendor/firebase-10.14.1/firebase-app-check.js']) {
    assert.ok(files.includes(f), `${f} should be reachable from js/app.js`);
  }
});

test('every file js/app.js statically imports is in the service worker precache', () => {
  assert.deepEqual(checkPrecache().notPrecached, []);
});

test('nothing the app needs at startup is imported from another origin', () => {
  assert.deepEqual(checkPrecache().crossOrigin, []);
});

test('every precached file exists', () => {
  assert.deepEqual(checkPrecache().notOnDisk, []);
});
