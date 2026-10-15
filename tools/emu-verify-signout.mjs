// Sign out lives in Settings (⚙️), not on the Profile tab (v226). Dev tool,
// not shipped.
//
//   node tools/emu-verify-signout.mjs <outDir>     about 1 minute; screenshots go to <outDir>
//
// Same set-up as tools/emu-verify-pulso-ui.mjs: the Firestore emulator, the
// app served with stand-ins for three SDK files (firebase-auth.js signs in as
// ?uid= and its signOut() really calls back null; app-check does nothing;
// sw.js is a 404). For es/en x light/dark at 375 px, checks:
//   signed out  Profile shows "Sign in or sign up"; Settings has no account block
//   signed in   Profile has no sign-out button; Settings shows Sign out ABOVE
//               Delete account, as wide as it, not red, a gap between; tapping it closes the
//               sheet and Profile is back to the signed-out state
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
if (!OUT) { console.error('usage: node tools/emu-verify-signout.mjs <outDir>'); process.exit(1); }

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
      `"node tools/emu-verify-signout.mjs ${JSON.stringify(path.resolve(OUT)).slice(1, -1).replace(/\\\\/g, '/')} --inner"`],
    { cwd: ROOT, stdio: 'inherit', shell: true, env: { ...process.env, JAVA_HOME: jdk, PATH: `${path.join(jdk, 'bin')};${process.env.PATH}` } });
  process.exit(res.status ?? 1);
}

// ── Inner half ────────────────────────────────────────────────────────────
const EMU = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [EMU_HOST, EMU_PORT] = EMU.split(':');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const WEB = 9900 + Math.floor(Math.random() * 90);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-signout-'));
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

async function load(uid, lang, scheme) {
  const url = `http://127.0.0.1:${WEB}/${uid ? '?uid=' + uid : ''}`;
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
  await send('Page.navigate', { url });
  await sleep(1500);
  await ev(`localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1');`);
  await send('Page.reload', {});
  await sleep(300);
  for (let i = 0; i < 60 && await ev(`return document.readyState`) !== 'complete'; i++) await sleep(100);
  await sleep(2500);
  await ev(`document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove());`);
}
const vis = sel => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!e && !e.closest('.hidden') && e.getClientRects().length > 0; })()`;
const openProfile = () => ev(`document.getElementById('btn-profile').click(); await new Promise(r => setTimeout(r, 600));`);
// Opens Settings and reports its account block: label, the buttons after it, their order and look.
const openSettings = () => ev(`
  document.getElementById('menu-settings').click();
  await new Promise(r => setTimeout(r, 600));
  const backs = [...document.querySelectorAll('.modal-back')];
  const box = backs[backs.length - 1];
  if (!box) return { open: false };
  const { t } = await import('/js/i18n.js');
  const btns = [...box.querySelectorAll('button')];
  const out = btns.find(b => b.textContent === t('sign_out'));
  const del = btns.find(b => b.textContent === t('delete_account_btn'));
  const label = [...box.querySelectorAll('label')].find(l => l.textContent === t('account_section'));
  const target = label || btns[btns.length - 1];
  target.scrollIntoView({ block: 'center' });
  const w = e => e && Math.round(e.getBoundingClientRect().width);
  return {
    open: true, hasLabel: !!label, hasOut: !!out, hasDel: !!del,
    outAboveDel: !!(out && del && (out.compareDocumentPosition(del) & Node.DOCUMENT_POSITION_FOLLOWING)),
    outDanger: !!out && out.classList.contains('danger'),
    outFull: !!out && !!del && w(out) === w(del),
    gap: out && del && Math.round(del.getBoundingClientRect().top - out.getBoundingClientRect().bottom),
    outColor: out && getComputedStyle(out).backgroundColor,
    outText: out && out.textContent,
    sideways: document.documentElement.scrollWidth > innerWidth,
  };`);

for (const lang of ['es', 'en']) {
  for (const scheme of ['light', 'dark']) {
    const tag = `${lang}-${scheme}`;
    console.log(`\n${tag}`);

    // Signed out.
    await load(null, lang, scheme);
    await openProfile();
    check(`${tag} signed out: Profile shows Sign in`, await ev(`return ${vis('#profile-auth-btn')}`));
    check(`${tag} the old Profile sign-out button is gone`, await ev(`return !document.getElementById('profile-signout-btn')`));
    await shot(`${tag}-1-profile-signed-out`);
    let s = await openSettings();
    check(`${tag} signed out: Settings has no account block`, s.open && !s.hasLabel && !s.hasOut && !s.hasDel, s);
    await shot(`${tag}-2-settings-signed-out`);

    // Signed in.
    await load('alice_uid', lang, scheme);
    await openProfile();
    check(`${tag} signed in: Profile hides Sign in`, await ev(`return !${vis('#profile-auth-btn')}`));
    await shot(`${tag}-3-profile-signed-in`);
    s = await openSettings();
    check(`${tag} signed in: Settings shows Sign out above Delete account`, s.hasLabel && s.hasOut && s.hasDel && s.outAboveDel, s);
    check(`${tag} Sign out is a normal, full-width button`, !s.outDanger && s.outFull && s.gap >= 6 && !s.sideways, s);
    await shot(`${tag}-4-settings-signed-in`);

    // Tap Sign out.
    await ev(`
      const { t } = await import('/js/i18n.js');
      [...document.querySelectorAll('.modal-back button')].find(b => b.textContent === t('sign_out')).click();
      await new Promise(r => setTimeout(r, 900));`);
    check(`${tag} Sign out closed the sheet and signed out once`,
      await ev(`return document.querySelectorAll('.modal-back').length === 0 && window.__signedOut === 1`));
    check(`${tag} Profile is back to signed out`, await ev(`return ${vis('#profile-auth-btn')}`));
    await shot(`${tag}-5-profile-after-sign-out`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
const real = errors.filter(e => !/App ?Check|appCheck|sw\.js/i.test(e));
console.log(`console errors: ${errors.length} (${real.length} not App Check / sw.js)`);
for (const e of real.slice(0, 15)) console.log('  ' + e);
chrome.kill();
server.close();
process.exit(fail || real.length ? 1 : 0);
