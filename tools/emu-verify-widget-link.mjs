// Automatic widget linking — the real js/firebase.js against the Firestore
// EMULATOR running the real firestore.rules. Dev tool, not shipped.
//
//   node tools/emu-verify-widget-link.mjs      (about 30 s)
//
// The Android app opens CTC with ?ctcWidget=<its code>. This opens the page the
// same way in headless Chrome and checks what the page does with the code:
// signed in it joins the account's widgetTokens and the streak is published
// under it; signed out it waits for a sign-in; it never stays in the address.
// Same set-up as tools/emu-verify-pulso.mjs: the SDK's firestore file is the
// real one pointed at the emulator as ?uid=, auth is a stand-in that reports
// that uid (no ?uid= = signed out), app check does nothing. Two origins
// (localhost and 127.0.0.1) are two phones: each has its own IndexedDB.
//
// Local emulator only. Nothing here touches the real project.
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── Outer half: start the emulator and run this same file inside it ───────
if (!process.argv.includes('--inner')) {
  const dirs = ['C:\\Program Files\\Eclipse Adoptium', 'C:\\Program Files\\Java', 'C:\\Program Files\\Microsoft'];
  let jdk = process.env.JAVA_HOME && fs.existsSync(path.join(process.env.JAVA_HOME, 'bin', 'java.exe')) ? process.env.JAVA_HOME : null;
  if (!jdk) {
    const found = [];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir)) {
        const m = /^jdk-(\d+)/.exec(name);
        if (m && Number(m[1]) >= 11 && fs.existsSync(path.join(dir, name, 'bin', 'java.exe'))) found.push([Number(m[1]), path.join(dir, name)]);
      }
    }
    found.sort((a, b) => b[0] - a[0]);
    jdk = found[0]?.[1] ?? null;
  }
  if (!jdk) { console.error('No Java 11+ found; the Firestore emulator needs it (see tests/run-rules-tests.mjs).'); process.exit(1); }
  const res = spawnSync('npx',
    ['firebase', 'emulators:exec', '--only', 'firestore', '--project', 'chess-training-center',
      '"node tools/emu-verify-widget-link.mjs --inner"'],
    { cwd: ROOT, stdio: 'inherit', shell: true, env: { ...process.env, JAVA_HOME: jdk, PATH: `${path.join(jdk, 'bin')};${process.env.PATH}` } });
  process.exit(res.status ?? 1);
}

// ── Inner half ────────────────────────────────────────────────────────────
const EMU = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [EMU_HOST, EMU_PORT] = EMU.split(':');
const PROJECT = 'chess-training-center';
const DOCS = `http://${EMU}/v1/projects/${PROJECT}/databases/(default)/documents`;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const WEB = 9900 + Math.floor(Math.random() * 90);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-wlink-'));
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 300000).unref();

const ALICE = 'alice_uid', BOB = 'bob_uid';
const code = c => c.repeat(32).slice(0, 32);   // a valid 32-hex code made of one digit
const C1 = code('1'), C2 = code('2'), C3 = code('3'), OLD = code('0');
const TODAY = new Date().toLocaleDateString('en-CA');   // YYYY-MM-DD, local

const SDK = '/vendor/firebase-10.14.1/';
const SHIMS = {
  [SDK + 'firebase-firestore.js']: `
    export * from './firebase-firestore.real.js';
    import { getFirestore as real, connectFirestoreEmulator } from './firebase-firestore.real.js';
    export function getFirestore(app) {
      const f = real(app);
      const uid = new URLSearchParams(location.search).get('uid');
      connectFirestoreEmulator(f, '${EMU_HOST}', ${EMU_PORT}, uid ? { mockUserToken: { sub: uid } } : {});
      return f;
    }`,
  [SDK + 'firebase-auth.js']: `
    const no = () => { throw new Error('auth is a stand-in here'); };
    const uid = new URLSearchParams(location.search).get('uid');
    const auth = { currentUser: uid ? { uid } : null };
    export function getAuth() { return auth; }
    export function onAuthStateChanged(a, cb) { setTimeout(() => cb(auth.currentUser), 0); return () => {}; }
    export class GoogleAuthProvider {}
    export const EmailAuthProvider = { credential: no };
    export const signInWithPopup = no, signOut = no, createUserWithEmailAndPassword = no,
      signInWithEmailAndPassword = no, updateProfile = no, deleteUser = no,
      reauthenticateWithPopup = no, reauthenticateWithCredential = no;`,
  [SDK + 'firebase-app-check.js']: `
    export function initializeAppCheck() {}
    export class ReCaptchaV3Provider {}`,
  '/__wlink.html': '<!doctype html><meta charset="utf-8"><title>wlink</title>',
};

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (SHIMS[p]) {
    res.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : 'text/javascript', 'Cache-Control': 'no-store' });
    res.end(SHIMS[p]); return;
  }
  if (p === SDK + 'firebase-firestore.real.js') p = SDK + 'firebase-firestore.js';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
});
await new Promise(r => server.listen(WEB, '127.0.0.1', r));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const req = (url, method = 'GET') => new Promise((res, rej) => {
  http.request(url, { method }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch { res(d); } }); }).on('error', rej).end();
});

const owner = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const plain = v => v === undefined ? undefined
  : 'integerValue' in v ? Number(v.integerValue)
  : 'stringValue' in v ? v.stringValue
  : 'nullValue' in v ? null
  : 'timestampValue' in v ? Date.parse(v.timestampValue)
  : 'arrayValue' in v ? (v.arrayValue.values || []).map(plain)
  : v;
async function stored(docPath) {
  const r = await fetch(`${DOCS}/${docPath}`, { headers: owner });
  if (!r.ok) return null;
  const out = {};
  for (const [k, v] of Object.entries((await r.json()).fields || {})) out[k] = plain(v);
  return out;
}
async function waitFor(what, fn, ms = 8000) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await sleep(100);
  }
}
await fetch(`http://${EMU}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { await req(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await sleep(250); } }

const errors = [];
// One page load of "the app": seeds the kv first (as the app would have it),
// then imports the real js/firebase.js. `phone` picks the origin.
async function load(phone, query, seed = {}) {
  const host = phone === 'A' ? 'localhost' : '127.0.0.1';
  const target = await req(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(`http://${host}:${WEB}/__wlink.html${query}`)}`, 'PUT');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));
  let n = 0;
  const pending = new Map();
  ws.on('message', raw => {
    const msg = JSON.parse(raw);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(`${phone} EXC ` + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(`${phone} CON ` + msg.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300));
    }
  });
  const send = (method, params = {}) => { const id = ++n; ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => pending.set(id, { res, rej })); };
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: `(async()=>{ ${expr} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`${phone}: ` + JSON.stringify(r.exceptionDetails).slice(0, 900));
    return r.result.value;
  };
  await send('Runtime.enable');
  for (let i = 0; i < 40 && await ev(`return document.readyState`) !== 'complete'; i++) await sleep(100);
  await ev(`
    window.db = await import('/js/db.js');
    const seed = ${JSON.stringify(seed)};
    for (const [k, v] of Object.entries(seed)) await window.db.kvSet(k, v);
    window.fb = await import('/js/firebase.js');`);
  const tab = {
    ev,
    kv: key => ev(`return await window.db.kvGet(${JSON.stringify(key)}, null)`),
    search: () => ev(`return location.search`),
    close: async () => { ws.close(); await req(`http://127.0.0.1:${PORT}/json/close/${target.id}`); },
  };
  return tab;
}

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: !!ok });
  console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''));
};

let failed = false;
try {
  console.log('\nPhone A, signed in as alice, opened by the widget');
  // The old copy-and-paste widget's document, written before this change.
  await fetch(`${DOCS}/streakWidget/${OLD}`, { method: 'PATCH', headers: owner, body: JSON.stringify({ fields: {
    owner: { stringValue: ALICE }, count: { integerValue: '3' }, lastDate: { stringValue: TODAY },
    updatedAt: { timestampValue: new Date().toISOString() } } }) });
  let a = await load('A', `?uid=${ALICE}&ctcWidget=${C1}&tab=home`,
    { streakCount: 7, streakLastDate: TODAY, widgetToken: OLD });
  check('the code is taken out of the address, the rest is kept', await a.search() === `?uid=${ALICE}&tab=home`, await a.search());
  let d = await waitFor('C1', () => stored(`streakWidget/${C1}`));
  check('streakWidget/<code> written: owner alice, count 7, lastDate today, the 4 fields only',
    d && d.owner === ALICE && d.count === 7 && d.lastDate === TODAY && Object.keys(d).length === 4, d);
  check('the code is on the account (users/alice.widgetTokens, synced)',
    JSON.stringify((await waitFor('user doc', async () => { const u = await stored(`users/${ALICE}`); return u?.widgetTokens && u; }))?.widgetTokens) === JSON.stringify([C1]));
  check('the old pasted code\'s document is deleted', await waitFor('old gone', async () => await stored(`streakWidget/${OLD}`) === null) === true);
  check('…and the old key is cleared on the phone', await a.kv('widgetToken') === null);
  check('nothing left pending', await a.kv('widgetPending') === null);

  console.log('\nA streak change reaches every code of the account');
  await a.close();
  a = await load('A', `?uid=${ALICE}&ctcWidget=${C3}`);
  await waitFor('C3', () => stored(`streakWidget/${C3}`));
  check('a second phone\'s code joins the front of the list', JSON.stringify(await a.kv('widgetTokens')) === JSON.stringify([C3, C1]));
  await a.ev(`await window.db.kvSet('streakCount', 8)`);
  const both = await waitFor('both 8', async () => {
    const [x, y] = [await stored(`streakWidget/${C1}`), await stored(`streakWidget/${C3}`)];
    return x?.count === 8 && y?.count === 8 && [x, y];
  });
  check('count 8 lands under both codes', !!both, both);
  await a.close();
  a = await load('A', `?uid=${ALICE}&ctcWidget=${C1}`);
  await sleep(1500);
  check('the same code again: the list does not grow or reorder', JSON.stringify(await a.kv('widgetTokens')) === JSON.stringify([C3, C1]));

  console.log('\nA bad code');
  await a.close();
  a = await load('A', `?uid=${ALICE}&ctcWidget=not-a-code`);
  await sleep(1500);
  check('taken out of the address all the same', await a.search() === `?uid=${ALICE}`);
  check('never stored or added', await a.kv('widgetPending') === null && JSON.stringify(await a.kv('widgetTokens')) === JSON.stringify([C3, C1]));
  await a.close();

  console.log('\nPhone B, signed out, then bob signs in');
  let b = await load('B', `?ctcWidget=${C2}`, { streakCount: 4, streakLastDate: TODAY });
  check('signed out: the code waits on the phone', await b.kv('widgetPending') === C2);
  check('signed out: no document is written', await (async () => { await sleep(1500); return await stored(`streakWidget/${C2}`) === null; })());
  await b.close();
  b = await load('B', `?uid=${BOB}`);
  d = await waitFor('C2', () => stored(`streakWidget/${C2}`));
  check('after sign-in the waiting code is linked: owner bob, count 4', d && d.owner === BOB && d.count === 4, d);
  check('pending cleared, the code is on bob\'s list', await b.kv('widgetPending') === null && JSON.stringify(await b.kv('widgetTokens')) === JSON.stringify([C2]));

  console.log('\nKNOWN LIMIT: a code another account owns');
  await b.close();
  b = await load('B', `?uid=${BOB}&ctcWidget=${C1}`);
  await sleep(2000);
  d = await stored(`streakWidget/${C1}`);
  check('REFUSED BY THE RULES: bob cannot take over alice\'s widget document', d && d.owner === ALICE && d.count === 8, d);
  await b.ev(`await window.db.kvSet('streakCount', 5)`);
  d = await waitFor('C2 5', async () => { const x = await stored(`streakWidget/${C2}`); return x?.count === 5 && x; });
  check('…and the refusal does not stop bob\'s own code updating', !!d, d);
  await b.close();

  console.log('\nAt most 5 codes per account');
  a = await load('A', `?uid=${ALICE}`);
  const extra = ['4', '5', '6', '7'].map(code);
  for (const c of extra) {
    await a.close();
    a = await load('A', `?uid=${ALICE}&ctcWidget=${c}`);
    await waitFor(c, () => stored(`streakWidget/${c}`));
  }
  const list = await a.kv('widgetTokens');
  check('a sixth code drops the oldest: 5 left, newest first', JSON.stringify(list) === JSON.stringify([...extra].reverse().concat([C3])), list);
  check('the dropped code\'s document is deleted', await waitFor('C1 gone', async () => await stored(`streakWidget/${C1}`) === null) === true);
  await a.close();
} catch (e) {
  failed = true;
  console.error('\nSTOPPED: ' + e.message);
}

const bad = checks.filter(c => !c.ok);
console.log(`\n${checks.length - bad.length} of ${checks.length} checks passed${bad.length ? ' — FAILED: ' + bad.map(c => c.name).join(' | ') : ''}`);
// The refused take-over is reported on the console; that one is the point.
const other = errors.filter(e => !/permission|PERMISSION_DENIED/i.test(e));
console.log(other.length ? `Console errors that are not a refusal (${other.length}):\n  ` + other.join('\n  ') : 'No console errors other than the refusal asked for.');
chrome.kill();
server.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(failed || bad.length || other.length ? 1 : 0);
