// A username the account already has is never asked for again (2026-10-28).
// Dev tool, not shipped.
//
//   node tools/emu-verify-username.mjs <outDir>     about 1 minute
//
// Same set-up as tools/emu-verify-signout.mjs (Firestore emulator, stand-in
// auth signing in as ?uid=). Seeds four accounts and opens the app as each:
//   A  account doc without a username, its leaderboard entry has one -> not
//      asked; the name is written back to the account doc, kv and usernameLower
//   B  no username anywhere -> asked (the dialog shows)
//   C  account doc with a username -> not asked, nothing changes
//   D  no account doc yet, a leaderboard entry with a name -> not asked, the new
//      account doc gets that name
// Local emulator only. Nothing here touches the real project.
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv.find((a, i) => i >= 2 && !a.startsWith('--'));
if (!OUT) { console.error('usage: node tools/emu-verify-username.mjs <outDir>'); process.exit(1); }

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
      `"node tools/emu-verify-username.mjs ${JSON.stringify(path.resolve(OUT)).slice(1, -1).replace(/\\\\/g, '/')} --inner"`],
    { cwd: ROOT, stdio: 'inherit', shell: true, env: { ...process.env, JAVA_HOME: jdk, PATH: `${path.join(jdk, 'bin')};${process.env.PATH}` } });
  process.exit(res.status ?? 1);
}

// ── Inner half ────────────────────────────────────────────────────────────
const EMU = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [EMU_HOST, EMU_PORT] = EMU.split(':');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const WEB = 9900 + Math.floor(Math.random() * 90);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-username-'));
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 300000).unref();

const SDK = '/vendor/firebase-10.14.1/';
const UID = `new URLSearchParams(location.search).get('uid')`;
const SHIMS = {
  [SDK + 'firebase-firestore.js']: `
    export * from './firebase-firestore.real.js';
    import { getFirestore as real, connectFirestoreEmulator } from './firebase-firestore.real.js';
    export function getFirestore(app) {
      const f = real(app);
      const uid = ${UID};
      connectFirestoreEmulator(f, '${EMU_HOST}', ${EMU_PORT}, uid ? { mockUserToken: { sub: uid } } : {});
      return f;
    }`,
  [SDK + 'firebase-auth.js']: `
    const no = () => { throw new Error('auth is a stand-in here'); };
    const uid = ${UID};
    const user = uid => ({ uid, email: uid + '@example.test', displayName: uid, providerData: [{ providerId: 'password' }] });
    const auth = { currentUser: uid ? user(uid) : null };
    const cbs = [];
    export function getAuth() { return auth; }
    export function onAuthStateChanged(a, cb) { cbs.push(cb); setTimeout(() => cb(auth.currentUser), 0); return () => {}; }
    export async function signOut() { auth.currentUser = null; window.__signedOut = (window.__signedOut || 0) + 1; for (const cb of cbs) cb(null); }
    export class GoogleAuthProvider {}
    export function connectAuthEmulator() {}
    export const EmailAuthProvider = { credential: no };
    export const signInWithPopup = no, createUserWithEmailAndPassword = no,
      signInWithEmailAndPassword = no, updateProfile = no, deleteUser = no,
      reauthenticateWithPopup = no, reauthenticateWithCredential = no;`,
  [SDK + 'firebase-app-check.js']: `
    export function initializeAppCheck() {}
    export class ReCaptchaV3Provider {}`,
};

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  if (SHIMS[p]) { res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }); res.end(SHIMS[p]); return; }
  if (p === '/sw.js') { res.writeHead(404).end(); return; }
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
  http.request(url, { method }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej).end();
});

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { await req(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await sleep(250); } }

const errors = [];
let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  ok ? pass++ : fail++;
  console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : ''));
};

const target = await req(`http://127.0.0.1:${PORT}/json/new?about:blank`, 'PUT');
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
    errors.push('EXC ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    errors.push('CON ' + msg.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  }
});
const send = (method, params = {}) => { const id = ++n; ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => pending.set(id, { res, rej })); };
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: `(async()=>{ ${expr} })()`, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
  return r.result.value;
};
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
const shot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
};

// The emulator's REST API with the owner token: seeds and reads past the rules.
const DOCS = `http://${EMU}/v1/projects/chess-training-center/databases/(default)/documents/`;
const rest = (p, method = 'GET', body) => new Promise((res, rej) => {
  const r = http.request(DOCS + p, { method, headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' } }, x => {
    let d = ''; x.on('data', c => d += c); x.on('end', () => res(d ? JSON.parse(d) : {}));
  });
  r.on('error', rej); if (body) r.write(JSON.stringify(body)); r.end();
});
const put = (p, obj) => rest(p, 'PATCH', { fields: Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, { stringValue: v }])) });
const field = async (p, k) => (await rest(p)).fields?.[k]?.stringValue ?? null;

await put('users/acctA', { firstName: 'Ana' });
await put('leaderboard/acctA', { username: 'Zugzwang', profileName: 'Zugzwang' });
await put('users/acctB', { firstName: 'Beto' });
await put('users/acctC', { username: 'Rey', profileName: 'Rey' });
await put('leaderboard/acctD', { username: 'Peon', profileName: 'Peon' });

// Open as `uid` (after the phone's synced data is cleared, as signing out does) and report whether the "complete your profile" dialog is up.
async function open(uid, lang, scheme) {
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
  await send('Page.navigate', { url: `http://127.0.0.1:${WEB}/` });
  await sleep(1200);
  await ev(`localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1');
    const db = await import('/js/db.js'); await db.clearSyncedProfileData(); await db.kvSet('onboardingDone', true);`);
  await send('Page.navigate', { url: `http://127.0.0.1:${WEB}/?uid=${uid}` });
  for (let i = 0; i < 60 && await ev(`return document.readyState`) !== 'complete'; i++) await sleep(100);
  await sleep(3500);
  return ev(`const { t } = await import('/js/i18n.js');
    const asked = [...document.querySelectorAll('.modal-box h3')].some(h => h.textContent === t('complete_profile_title'));
    const db = await import('/js/db.js');
    return { asked, kv: await db.kvGet('username', null) };`);
}

for (const [lang, scheme] of [['es', 'light'], ['en', 'dark']]) {
  const tag = `${lang}-${scheme}`;
  console.log(`\n── ${tag} ──`);
  const a = await open('acctA', lang, scheme);
  await sleep(600);
  check(`[${tag}] A: name only on the leaderboard -> not asked, name back on the phone`, !a.asked && a.kv === 'Zugzwang', a);
  check(`[${tag}] A: the account doc got its name back`, await field('users/acctA', 'username') === 'Zugzwang' && await field('users/acctA', 'profileName') === 'Zugzwang');
  check(`[${tag}] A: still findable in friend search`, await field('leaderboard/acctA', 'usernameLower') === 'zugzwang');
  const b = await open('acctB', lang, scheme);
  check(`[${tag}] B: no name anywhere -> asked`, b.asked, b);
  if (lang === 'es') await shot(`username-asked-${tag}`);
  const c = await open('acctC', lang, scheme);
  check(`[${tag}] C: name on the account -> not asked, unchanged`, !c.asked && c.kv === 'Rey' && await field('users/acctC', 'username') === 'Rey', c);
  const d = await open('acctD', lang, scheme);
  await sleep(600);
  check(`[${tag}] D: new account doc, name from the leaderboard -> not asked`, !d.asked && d.kv === 'Peon' && await field('users/acctD', 'username') === 'Peon', d);
  // reset A and D for the next round
  await rest('users/acctA', 'DELETE'); await put('users/acctA', { firstName: 'Ana' });
  await rest('users/acctD', 'DELETE');
}
const real = errors.filter(e => !/App Check|appCheck|403|permission|Missing or insufficient/i.test(e));
console.log('\nerrors:', real.length ? real : 'none');
console.log(fail ? `\n${fail} FAILED, ${pass} passed` : `\nALL ${pass} PASS`);
chrome.kill(); server.close(); process.exit(fail ? 1 : 0);
