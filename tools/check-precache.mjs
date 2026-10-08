// Guards the service worker's precache list against drift. Dev tool, not shipped.
//
//   node tools/check-precache.mjs        (also runs inside `npm.cmd run test:tree`)
//
// Walks every STATIC import reachable from js/app.js and fails if a local file
// is not in ASSETS in sw.js. A statically imported module that is not precached
// only reaches the cache on a second online visit, and every CACHE bump throws
// it out again — so the next launch without a connection never gets past the
// splash. That is how learning-data, quotes-data, legal-data and openings-eco
// went missing (fixed in v147).
//
// A static import from ANOTHER ORIGIN fails too: the worker never caches those
// (see the fetch handler in sw.js), so the app would only open offline while the
// browser's own HTTP cache still happened to hold the file. That is how the
// Firebase SDK on www.gstatic.com kept the app on the splash (vendored in v149).
// The walk follows minified files as well (`import{a}from"./x.js"`).
//
// Also fails if ART in sw.js (badges, streak flames, avatars) and the art
// folders disagree — see checkArt below.
//
// NOT checked: dynamic import() (those are allowed to load on first use).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = 'js/app.js';
const IMPORT_RE = /(?:^|[\n;])\s*(?:import|export)\b\s*(?:[^'"`;]*?\bfrom\s*)?['"]([^'"]+)['"]/g;

export function precachedAssets(root = ROOT) {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const m = sw.match(/const ASSETS = \[([\s\S]*?)\n\];/);
  if (!m) throw new Error('could not find the ASSETS list in sw.js');
  const body = m[1].replace(/\/\/.*$/gm, '');
  return new Set([...body.matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]));
}

// The files sw.js keeps across updates (KEEP). Nothing ever replaces a kept
// entry, so each one's path must carry its version.
export function keptFiles(root = ROOT) {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const m = sw.match(/const KEEP = \[([\s\S]*?)\];/);
  if (!m) throw new Error('could not find the KEEP list in sw.js');
  return [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]);
}

// The art sw.js fetches at install into its own cache (ART), against what is
// on disk and what the app can ask for. A badge, flame or avatar that is not
// listed only reaches a phone the first time it is shown online.
const ART_DIRS = ['icons/badges', 'icons/kael', 'icons/pulso', 'streaks', 'avatars'];   // top-level .png only
export function checkArt(root = ROOT) {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const m = sw.match(/const ART = \[([\s\S]*?)\n\];/);
  if (!m) throw new Error('could not find the ART list in sw.js');
  const listed = new Set([...m[1].matchAll(/names\('([^']+)',([^)]*)\)/g)].flatMap(([, dir, rest]) =>
    [...rest.matchAll(/'([^']*)'/g)].map(x => x[1]).join('').split(' ').map(n => `${dir}/${n}.png`)));
  const onDisk = ART_DIRS.flatMap(dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true })
    .filter(d => d.isFile() && d.name.endsWith('.png')).map(d => `${dir}/${d.name}`));
  const avatars = fs.readFileSync(path.join(root, 'js/avatars.js'), 'utf8');
  const ids = [...avatars.matchAll(/\{ id: '([^']+)'/g)].map(x => `avatars/${x[1]}.png`);
  return {
    listed: listed.size,
    notListed: onDisk.filter(f => !listed.has(f)),
    notOnDisk: [...listed].filter(f => !fs.existsSync(path.join(root, f))),
    // An avatar a player can choose (js/avatars.js) that sw.js does not fetch.
    avatarNotListed: ids.filter(f => !listed.has(f)),
  };
}

export function staticImports(root = ROOT, entry = ENTRY, crossOrigin = []) {
  const seen = new Set();
  const todo = [entry];
  while (todo.length) {
    const file = todo.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    for (const [, spec] of src.matchAll(IMPORT_RE)) {
      if ((!spec.startsWith('.') && !spec.startsWith('/')) || spec.startsWith('//')) { crossOrigin.push(`${file} -> ${spec}`); continue; }
      todo.push(path.posix.join(spec.startsWith('/') ? '' : path.posix.dirname(file), spec).replace(/^\//, ''));
    }
  }
  return [...seen].sort();
}

export function checkPrecache(root = ROOT) {
  const assets = precachedAssets(root);
  const crossOrigin = [];
  const files = staticImports(root, ENTRY, crossOrigin);
  return {
    // Imported at startup from another origin: the worker never caches it.
    crossOrigin,
    // Imported at startup but not precached: the app cannot open offline after an update.
    notPrecached: files.filter(f => !assets.has(f)),
    // Listed but not on disk: harmless to install (per-file tolerant), but a typo hides a real gap.
    notOnDisk: [...assets].filter(a => a !== './' && !fs.existsSync(path.join(root, a))),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { notPrecached, notOnDisk, crossOrigin } = checkPrecache();
  for (const f of crossOrigin) console.error(`CROSS-ORIGIN: ${f} is a static import from another origin; the worker never caches it`);
  for (const f of notPrecached) console.error(`NOT PRECACHED: ${f} is statically imported from ${ENTRY} but is not in ASSETS in sw.js`);
  for (const f of notOnDisk) console.error(`NOT ON DISK: ${f} is in ASSETS in sw.js but the file does not exist`);
  const art = checkArt();
  for (const f of art.notListed) console.error(`ART NOT LISTED: ${f} is on disk but is not in ART in sw.js`);
  for (const f of art.notOnDisk) console.error(`ART NOT ON DISK: ${f} is in ART in sw.js but the file does not exist`);
  for (const f of art.avatarNotListed) console.error(`AVATAR NOT LISTED: ${f} is in js/avatars.js but is not in ART in sw.js`);
  if (notPrecached.length || notOnDisk.length || crossOrigin.length || art.notListed.length || art.notOnDisk.length || art.avatarNotListed.length) process.exit(1);
  console.log(`precache OK: all ${staticImports().length} statically imported files are in ASSETS, all ${art.listed} art files are in ART`);
}
