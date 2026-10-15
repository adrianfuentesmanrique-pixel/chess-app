// A saved base game and a Masterclass chapter remember which way the board
// faced (v229). Dev tool, not shipped.
//
//   node tools/emu-verify-orientation.mjs <outDir>     about 2 minutes; screenshots go to <outDir>
//
// Same set-up as tools/emu-verify-signout.mjs: the Firestore emulator running
// the real firestore.rules, the app served with stand-ins for three SDK files
// (firebase-auth.js signs in as ?uid=, app-check does nothing, sw.js is a 404).
// For es/en x light/dark at 375 px, with the app's own code:
//   base     a NEW game saved flipped reopens flipped (from the list, and with
//            the next/prev arrows); an UPDATED game saved the other way reopens
//            that way; an OLD record (no orientation) opens White at the bottom
//   chapter  a NEW chapter added flipped stores orientation 'b' in Firestore and
//            reopens flipped; 💾 Save to chapter the other way stores 'w'; a
//            rename keeps it; an OLD chapter (no field) opens White at the bottom
//   student  bob, a viewer, opens it the teacher's way (by hand, as homework,
//            and following a live class)
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
if (!OUT) { console.error('usage: node tools/emu-verify-orientation.mjs <outDir>'); process.exit(1); }

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
      `"node tools/emu-verify-orientation.mjs ${JSON.stringify(path.resolve(OUT)).slice(1, -1).replace(/\\\\/g, '/')} --inner"`],
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
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-orient-'));
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 480000).unref();

const ALICE = 'alice_uid', BOB = 'bob_uid';
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
const owner = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
async function stored(docPath) {
  const r = await fetch(`${DOCS}/${docPath}`, { headers: owner });
  if (!r.ok) return null;
  const out = {};
  for (const [k, v] of Object.entries((await r.json()).fields || {})) out[k] = v.stringValue ?? v.integerValue ?? v.doubleValue ?? v;
  return out;
}
await fetch(`http://${EMU}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });

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
  await ev(`
    document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove());
    const app = await import('/js/app.js');
    window.__t = {
      app, A: app.Analysis,
      M: (await import('/js/masterclass.js')).Masterclass,
      fb: await import('/js/firebase.js'), db: await import('/js/db.js'),
      wait: ms => new Promise(r => setTimeout(r, ms)),
      // Types into the askText() box that is about to open, and presses OK.
      answer: async text => {
        for (let i = 0; i < 50; i++) {
          const inp = document.querySelector('.modal-back input.input');
          if (inp) { inp.value = text; inp.closest('.modal-back').querySelector('.btn.primary').click(); return true; }
          await new Promise(r => setTimeout(r, 100));
        }
        return false;
      },
      // Orientation as the DRAWN board shows it, not just the field: which
      // corner square is at the top-left of #ana-board.
      facing: () => window.__t.A.board.orientation,
    };`);
}
const facing = () => ev(`return __t.A.board.orientation`);
const sideways = () => ev(`return document.documentElement.scrollWidth > innerWidth`);
// Flips with the real button until the board faces `o`.
const face = o => ev(`if (__t.A.board.orientation !== '${o}') document.getElementById('ana-flip').click(); return __t.A.board.orientation`);

let round = 0;
for (const lang of ['es', 'en']) {
  for (const scheme of ['light', 'dark']) {
    const tag = `${lang}-${scheme}`;
    round++;
    console.log(`\n${tag}`);
    await load(ALICE, lang, scheme);

    // ── BASE: a new game, saved flipped ──────────────────────────────────
    const baseId = await ev(`
      const id = await __t.db.createBase('Orient ${tag}');
      __t.A.loadTree(new (__t.A.tree.constructor)(), { baseId: id, gameId: null });
      return id;`);
    await face('b');
    await ev(`await __t.A.saveToBase(); await __t.wait(300);`);
    let rec = await ev(`return await __t.db.getGame(__t.A.ctx.gameId)`);
    check(`${tag} base NEW game saved flipped stores orientation 'b'`, rec && rec.orientation === 'b', rec && rec.orientation);
    const g1 = rec.id;
    // An old record, written the way every game was before this change.
    const gOld = await ev(`return await __t.db.addGame({ baseId: ${baseId}, white: 'Old', black: 'Record', event: '', date: '', result: '*',
      pgn: '[White "Old"]\\n[Black "Record"]\\n\\n1. e4 *', updatedAt: Date.now() + 1 })`);

    // Reopen through the real list: back to the base, tap the game.
    await face('w');
    await ev(`__t.A.backToBase(); await __t.wait(800);`);
    await ev(`[...document.querySelectorAll('#base-games-view .list-item')].find(b => !b.textContent.includes('Old')).click(); await __t.wait(800);`);
    check(`${tag} base NEW game reopens from the list flipped`, await facing() === 'b' && await ev(`return __t.A.ctx.gameId`) === g1);
    await shot(`${tag}-1-base-game-reopened-flipped`);
    check(`${tag} no sideways scroll`, !await sideways());

    // ── BASE: updated the other way ─────────────────────────────────────
    await face('w');
    await ev(`await __t.A.saveToBase(); await __t.wait(300);`);
    rec = await ev(`return await __t.db.getGame(${g1})`);
    check(`${tag} base UPDATED game saved unflipped stores 'w' on the same record`, rec.orientation === 'w' && rec.id === g1, rec.orientation);
    await face('b');
    await ev(`__t.A.backToBase(); await __t.wait(800);`);
    await ev(`[...document.querySelectorAll('#base-games-view .list-item')].find(b => !b.textContent.includes('Old')).click(); await __t.wait(800);`);
    check(`${tag} base UPDATED game reopens White at the bottom`, await facing() === 'w');

    // ── BASE: an old record ─────────────────────────────────────────────
    await face('b');
    await ev(`__t.A.backToBase(); await __t.wait(800);`);
    await ev(`[...document.querySelectorAll('#base-games-view .list-item')].find(b => b.textContent.includes('Old')).click(); await __t.wait(800);`);
    check(`${tag} base OLD record (no orientation) opens White at the bottom`, await facing() === 'w' && await ev(`return __t.A.ctx.gameId`) === gOld);

    // ── BASE: the next/prev arrows go through the same door ─────────────
    await ev(`const r = await __t.db.getGame(${g1}); r.orientation = 'b'; await __t.db.updateGame(r);
      __t.A.backToBase(); await __t.wait(800);`);
    await ev(`[...document.querySelectorAll('#base-games-view .list-item')].find(b => b.textContent.includes('Old')).click(); await __t.wait(800);`);
    const before = await facing();
    await ev(`for (const id of ['ana-base-next', 'ana-base-prev']) { const b = document.getElementById(id); if (!b.disabled) { b.click(); break; } } await __t.wait(800);`);
    check(`${tag} base arrows: old record 'w', its neighbour opens 'b'`, before === 'w' && await facing() === 'b' && await ev(`return __t.A.ctx.gameId`) === g1);

    // ── CHAPTER: a new one, added from a flipped board ──────────────────
    const mcId = await ev(`
      const id = await __t.fb.createMasterclass('Orient ${tag}');
      await __t.M.load(); await __t.M.open(id); return id;`);
    await ev(`__t.A.loadTree(new (__t.A.tree.constructor)(), { baseId: null, gameId: null });`);
    await face('b');
    await ev(`const p = __t.M.addFromBoard(); await __t.answer('Black repertoire'); await p; await __t.wait(500);`);
    let rows = await ev(`await __t.M.loadChapters(); return __t.M.chapters.map(c => ({ id: c.id, title: c.title, orientation: c.orientation }))`);
    const ch1 = rows.find(r => r.title === 'Black repertoire');
    let doc = ch1 && await stored(`masterclasses/${mcId}/chapters/${ch1.id}`);
    check(`${tag} chapter NEW from a flipped board: Firestore holds orientation 'b'`, doc && doc.orientation === 'b', doc && doc.orientation);
    await face('w');
    await ev(`__t.M.openChapter(__t.M.chapters.find(c => c.id === '${ch1.id}')); await __t.wait(800);`);
    check(`${tag} chapter NEW reopens flipped`, await facing() === 'b' && await ev(`return __t.A.ctx.mcChapterId`) === ch1.id);
    check(`${tag} the owner's 💾 Save to chapter is offered`, await ev(`return !document.getElementById('ana-mc-save').classList.contains('hidden')`));
    await shot(`${tag}-2-chapter-reopened-flipped`);
    check(`${tag} no sideways scroll (chapter)`, !await sideways());

    // ── CHAPTER: saved the other way with the real button ───────────────
    await face('w');
    await ev(`document.getElementById('ana-mc-save').click(); await __t.wait(1200);`);
    doc = await stored(`masterclasses/${mcId}/chapters/${ch1.id}`);
    check(`${tag} chapter UPDATED via 💾 stores 'w'`, doc && doc.orientation === 'w', doc && doc.orientation);
    await face('b');
    await ev(`__t.M.openChapter(__t.M.chapters.find(c => c.id === '${ch1.id}')); await __t.wait(800);`);
    check(`${tag} chapter UPDATED reopens White at the bottom (in-memory row kept honest)`, await facing() === 'w');
    // Back to 'b' for the student half, and check a rename keeps it.
    await face('b');
    await ev(`document.getElementById('ana-mc-save').click(); await __t.wait(1200);`);
    await ev(`const p = __t.M.renameChapter(__t.M.chapters.find(c => c.id === '${ch1.id}')); await __t.answer('Black repertoire 2'); await p; await __t.wait(800);`);
    doc = await stored(`masterclasses/${mcId}/chapters/${ch1.id}`);
    check(`${tag} a rename keeps orientation 'b'`, doc && doc.title === 'Black repertoire 2' && doc.orientation === 'b', doc && [doc.title, doc.orientation]);

    // ── CHAPTER: an old one, written without the field ──────────────────
    await fetch(`${DOCS}/masterclasses/${mcId}/chapters/old1`, { method: 'PATCH', headers: owner, body: JSON.stringify({ fields: {
      title: { stringValue: 'Old chapter' }, pgn: { stringValue: '[Event "?"]\n\n1. d4 *' }, startFen: { stringValue: '' },
      order: { integerValue: '9' }, updatedBy: { stringValue: ALICE }, updatedAt: { timestampValue: new Date().toISOString() } } }) });
    await face('b');
    await ev(`await __t.M.loadChapters(); __t.M.openChapter(__t.M.chapters.find(c => c.id === 'old1')); await __t.wait(800);`);
    check(`${tag} chapter OLD (no field) opens White at the bottom`, await facing() === 'w');

    // ── STUDENT: bob, a viewer of the class ─────────────────────────────
    await fetch(`${DOCS}/masterclasses/${mcId}/members/${BOB}`, { method: 'PATCH', headers: owner, body: JSON.stringify({ fields: {
      uid: { stringValue: BOB }, role: { stringValue: 'viewer' }, addedBy: { stringValue: ALICE },
      addedAt: { timestampValue: new Date().toISOString() } } }) });
    await load(BOB, lang, scheme);
    await ev(`__t.A.board.setOrientation('w'); await __t.M.load(); await __t.M.open('${mcId}'); await __t.wait(500);
      __t.M.openChapter(__t.M.chapters.find(c => c.id === '${ch1.id}')); await __t.wait(800);`);
    check(`${tag} student opens the chapter the teacher's way`, await facing() === 'b');
    check(`${tag} student gets no 💾 Save to chapter`, await ev(`return document.getElementById('ana-mc-save').classList.contains('hidden')`));
    await shot(`${tag}-3-student-chapter-teachers-way`);
    await ev(`__t.A.board.setOrientation('w');`);
    const hw = await ev(`return await __t.M.openForHomework('${mcId}', '${ch1.id}')`);
    check(`${tag} homework opens it the teacher's way`, hw === 'ok' && await facing() === 'b', hw);
    // Following a live class: the teacher's broadcast names the chapter.
    await ev(`__t.A.board.setOrientation('w'); __t.A.loadTree(new (__t.A.tree.constructor)(), { baseId: null, gameId: null });
      __t.M.liveState = { chapterId: '${ch1.id}', fen: '', line: [], shapes: '' }; __t.M.following = true; __t.M.applyLive(); await __t.wait(800);`);
    check(`${tag} a live follower lands on it the teacher's way`, await facing() === 'b' && await ev(`return __t.A.ctx.mcChapterId`) === ch1.id);
    check(`${tag} no sideways scroll (student)`, !await sideways());
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
const real = errors.filter(e => !/App ?Check|appCheck|sw\.js/i.test(e));
console.log(`console errors: ${errors.length} (${real.length} not App Check / sw.js)`);
for (const e of real.slice(0, 15)) console.log('  ' + e);
chrome.kill();
server.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(fail || real.length ? 1 : 0);
