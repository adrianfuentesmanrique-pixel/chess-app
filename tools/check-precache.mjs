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
// NOT checked: dynamic import() (those are allowed to load on first use) and
// cross-origin imports (the worker never caches them).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = 'js/app.js';
const IMPORT_RE = /(?:^|[\n;])\s*(?:import|export)\s+(?:[^'"`;]*?\sfrom\s*)?['"]([^'"]+)['"]/g;

export function precachedAssets(root = ROOT) {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const m = sw.match(/const ASSETS = \[([\s\S]*?)\n\];/);
  if (!m) throw new Error('could not find the ASSETS list in sw.js');
  const body = m[1].replace(/\/\/.*$/gm, '');
  return new Set([...body.matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]));
}

export function staticImports(root = ROOT, entry = ENTRY) {
  const seen = new Set();
  const todo = [entry];
  while (todo.length) {
    const file = todo.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    for (const [, spec] of src.matchAll(IMPORT_RE)) {
      if (!spec.startsWith('.') && !spec.startsWith('/')) continue; // gstatic etc.
      todo.push(path.posix.join(spec.startsWith('/') ? '' : path.posix.dirname(file), spec).replace(/^\//, ''));
    }
  }
  return [...seen].sort();
}

export function checkPrecache(root = ROOT) {
  const assets = precachedAssets(root);
  return {
    // Imported at startup but not precached: the app cannot open offline after an update.
    notPrecached: staticImports(root).filter(f => !assets.has(f)),
    // Listed but not on disk: harmless to install (per-file tolerant), but a typo hides a real gap.
    notOnDisk: [...assets].filter(a => a !== './' && !fs.existsSync(path.join(root, a))),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { notPrecached, notOnDisk } = checkPrecache();
  for (const f of notPrecached) console.error(`NOT PRECACHED: ${f} is statically imported from ${ENTRY} but is not in ASSETS in sw.js`);
  for (const f of notOnDisk) console.error(`NOT ON DISK: ${f} is in ASSETS in sw.js but the file does not exist`);
  if (notPrecached.length || notOnDisk.length) process.exit(1);
  console.log(`precache OK: all ${staticImports().length} statically imported files are in ASSETS`);
}
