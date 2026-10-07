import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPrecache, checkArt, staticImports, keptFiles, precachedAssets } from '../../tools/check-precache.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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

test('every file kept across updates exists, carries its version in its path, and is not precached', () => {
  const kept = keptFiles();
  assert.ok(kept.length >= 4, 'the Stockfish wasm and the three pdf.js files');
  for (const f of kept) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} is in KEEP in sw.js but the file does not exist`);
    assert.match(f, /\d+\.\d+/, `${f} has no version in its path - a kept file is never replaced`);
    assert.ok(!precachedAssets().has(f), `${f} is both kept and precached`);
  }
});

test('every badge, streak flame, avatar and Kael portrait the app ships is in the service worker art list', () => {
  const art = checkArt();
  assert.ok(art.listed >= 135, '76 badges, 26 flames, 31 avatars, 2 Kael portraits');
  assert.deepEqual(art.notListed, []);
  assert.deepEqual(art.notOnDisk, []);
  assert.deepEqual(art.avatarNotListed, []);
});
