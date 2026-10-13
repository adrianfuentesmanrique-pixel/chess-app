// Plays the Simul data layer — the real js/firebase.js and js/simul.js,
// unmodified — against the Firestore EMULATOR running the real firestore.rules,
// and COUNTS what it costs. Then THE SCREENS (conversation 3 of the spec): the
// whole app on three phones, tapped with real touch events, in Spanish and
// English, light and dark, at 375 px. Dev tool, not shipped.
//
//   node tools/emu-verify-simul.mjs [outDir]     a few minutes; screenshots go to
//                                                 outDir (default: the temp folder)
//
// What it plays: a teacher and two students, three simuls.
//   1. A clock (10 min + 5 s, the teacher 2 extra minutes), an opening, a
//      handicap. Ana's board runs 80 single moves and she resigns; on Luis's an
//      impossible move is seeded and his phone voids the board.
//   2. No clock. Luis does not join and is left out at Start; Ana is mated.
//   3. Luis says "not now"; the teacher ends the simul with Ana's board open.
//
// How: the harness is tools/emu-verify-pulso.mjs's, copied (read its header),
// with one change: each phone is opened on its own address (see HOSTS).
// The stand-in for firebase-firestore.js does one thing more here: it counts.
//   a write   every document a setDoc / updateDoc / batch commit that was
//             ACCEPTED touched
//   a read    every document the SERVER delivered to a listener (a snapshot of
//             my own write that has not been sent yet is free), and every
//             getDocFromServer
// That is how Firestore bills them, as far as a phone can see it. A lookup made
// inside a rule (the coaching link, once per board invited) is billed as a read
// too and no phone sees it: the tool adds those by count.
//
// THE SCREENS, once per language and colour scheme, four rounds each:
//   1. The teacher picks both students, alternating colours, invites; the
//      invitation is made 11 minutes old (seeded, rules bypassed) and all three
//      phones say it ran out.
//   2. Invited again; Ana joins, Luis does not answer; Start: Luis is told it
//      started without him. The teacher ends the simul.
//   3. Both join, Start: all three phones say the simul has started.
//   4. Luis says "not now".
// Ana meets the invitation as the banner (she is on Home), Luis as the card in
// Students. Every screenshot is also measured: nothing wider than the phone.
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
      '"node tools/emu-verify-simul.mjs --inner"'],
    { cwd: ROOT, stdio: 'inherit', shell: true, env: { ...process.env, JAVA_HOME: jdk,
      SIMUL_SHOTS: path.resolve(process.argv[2] || path.join(os.tmpdir(), 'simul-shots')), PATH: `${path.join(jdk, 'bin')};${process.env.PATH}` } });
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
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-simul-'));
const OUT = process.env.SIMUL_SHOTS || path.join(os.tmpdir(), 'simul-shots');
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 900000).unref();

const TEACH = 'teach_uid', ANA = 'ana_uid', LUIS = 'luis_uid';
const TA = `${TEACH}_${ANA}`, TL = `${TEACH}_${LUIS}`;

const SDK = '/vendor/firebase-10.14.1/';
const SHIMS = {
  [SDK + 'firebase-firestore.js']: `
    export * from './firebase-firestore.real.js';
    import * as real from './firebase-firestore.real.js';
    const cost = window.__cost = { writes: 0, reads: 0 };
    export function getFirestore(app) {
      const f = real.getFirestore(app);
      real.connectFirestoreEmulator(f, '${EMU_HOST}', ${EMU_PORT}, { mockUserToken: { sub: new URLSearchParams(location.search).get('uid') } });
      return f;
    }
    export async function setDoc(...a) { await real.setDoc(...a); cost.writes++; }
    export async function updateDoc(...a) { await real.updateDoc(...a); cost.writes++; }
    export function writeBatch(f) {
      const b = real.writeBatch(f);
      let n = 0;
      return {
        set(...a) { n++; b.set(...a); return this; },
        update(...a) { n++; b.update(...a); return this; },
        delete(...a) { n++; b.delete(...a); return this; },
        async commit() { await b.commit(); cost.writes += n; },
      };
    }
    export async function getDocFromServer(...a) { const d = await real.getDocFromServer(...a); cost.reads++; return d; }
    export function onSnapshot(q, opts, next, err) {
      let opened = false;
      return real.onSnapshot(q, opts, snap => {
        if (!snap.metadata.fromCache && !opened) {
          // A listener that opens is billed for every document it holds, the
          // ones this phone already had in memory included.
          opened = true;
          cost.reads += snap.size;
        } else if (!snap.metadata.fromCache) {
          for (const ch of snap.docChanges({ includeMetadataChanges: true })) {
            if (ch.type !== 'removed' && !ch.doc.metadata.hasPendingWrites) cost.reads++;
          }
        }
        next(snap);
      }, err);
    }`,
  [SDK + 'firebase-auth.js']: `
    const no = () => { throw new Error('auth is a stand-in here'); };
    const uid = new URLSearchParams(location.search).get('uid');
    const auth = { currentUser: { uid, email: uid + '@example.test', displayName: uid, providerData: [{ providerId: 'password' }] } };
    export function getAuth() { return auth; }
    // The whole app waits to be told who is signed in. The bare page of the
    // first half is not told: the reads that follow would be in its count.
    export function onAuthStateChanged(a, cb) { if (location.pathname !== '/__simul.html') setTimeout(() => cb(auth.currentUser), 0); return () => {}; }
    export class GoogleAuthProvider {}
    export const EmailAuthProvider = { credential: no };
    export const signInWithPopup = no, signOut = no, createUserWithEmailAndPassword = no,
      signInWithEmailAndPassword = no, updateProfile = no, deleteUser = no,
      reauthenticateWithPopup = no, reauthenticateWithCredential = no;`,
  [SDK + 'firebase-app-check.js']: `
    export function initializeAppCheck() {}
    export class ReCaptchaV3Provider {}`,
  '/__simul.html': '<!doctype html><meta charset="utf-8"><title>simul</title>',
};

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const serve = (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  if (p === '/sw.js') { res.writeHead(404).end(); return; }
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
};
// One address a phone. Chrome keeps at most 6 connections to the emulator for
// each SITE, and a phone that listens and writes holds 2 of them open: three
// phones on one address use all 6, and the next write waits (about 45 s, until
// an idle stream closes). On three addresses each phone has its own 6.
const HOSTS = ['localhost', '127.0.0.1', '127.0.0.2'];
const servers = ['127.0.0.1', '127.0.0.2'].map(() => http.createServer(serve));
await Promise.all(servers.map((s, i) => new Promise(r => s.listen(WEB, ['127.0.0.1', '127.0.0.2'][i], r))));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const req = (url, method = 'GET') => new Promise((res, rej) => {
  http.request(url, { method }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej).end();
});

// The emulator, with the rules bypassed. A stamp is CUT to whole milliseconds,
// as js/firebase.js and the rules cut it.
const owner = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const stampMs = s => Date.parse(s.replace(/(\.\d{3})\d*Z$/, '$1Z'));
const plain = v => v === undefined ? undefined
  : 'integerValue' in v ? Number(v.integerValue)
  : 'stringValue' in v ? v.stringValue
  : 'nullValue' in v ? null
  : 'timestampValue' in v ? stampMs(v.timestampValue)
  : 'arrayValue' in v ? (v.arrayValue.values || []).map(plain)
  : v;
async function fields(docPath) {
  const r = await fetch(`${DOCS}/${docPath}`, { headers: owner });
  return r.ok ? (await r.json()).fields || {} : null;
}
async function stored(docPath) {
  const f = await fields(docPath);
  if (!f) return null;
  const out = {};
  for (const [k, v] of Object.entries(f)) out[k] = plain(v);
  return out;
}
async function patch(docPath, set) {
  const mask = Object.keys(set).map(k => 'updateMask.fieldPaths=' + k).join('&');
  const r = await fetch(`${DOCS}/${docPath}?${mask}`, { method: 'PATCH', headers: owner, body: JSON.stringify({ fields: set }) });
  if (!r.ok) throw new Error(`seeding ${docPath} failed: ` + await r.text());
}
const makeStudent = s => patch(`coaching/${TEACH}_${s}`, {
  teacherUid: { stringValue: TEACH }, studentUid: { stringValue: s },
  status: { stringValue: 'active' }, createdAt: { timestampValue: new Date().toISOString() } });
await fetch(`http://${EMU}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  // Three phones, one in front: the other two must keep their once-a-second clocks.
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { await req(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await sleep(250); } }

const errors = [];
async function openTab(uid, watch, host) {
  const target = await req(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(`http://${host}:${WEB}/__simul.html?uid=${uid}`)}`, 'PUT');
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
      errors.push(`${uid} EXC ` + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(`${uid} CON ` + msg.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300));
    }
  });
  const send = (method, params = {}) => { const id = ++n; ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => pending.set(id, { res, rej })); };
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: `(async()=>{ ${expr} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`${uid}: ` + JSON.stringify(r.exceptionDetails).slice(0, 900));
    return r.result.value;
  };
  await send('Runtime.enable');
  for (let i = 0; i < 40 && await ev(`return document.readyState`) !== 'complete'; i++) await sleep(100);
  await ev(`
    window.fb = await import('/js/firebase.js');
    window.sim = await import('/js/simul.js');
    window.snaps = 0; window.list = null; window.cls = null;
    window.fb[${JSON.stringify(watch)}](list => { window.snaps++; window.list = list; });
    // What a screen would do with a function here: what it resolves to.
    window.call = async (name, ...a) => { try { return await window.fb[name](...a); } catch (e) { return { threw: e.code || String(e) }; } };
    window.board = id => (window.list || []).find(g => g.id === id) || null;
    // A legal move that does not end the game, the same one every run.
    window.pick = (id, ply) => {
      const p = window.sim.positionOf(window.board(id));
      const ms = p.chess.moves({ verbose: true }).sort((a, b) => (a.lan < b.lan ? -1 : 1));
      for (let k = 0; k < ms.length; k++) {
        const m = ms[(ply * 7 + k) % ms.length];
        p.chess.move(m);
        const over = window.sim.boardResult(p.chess);
        p.chess.undo();
        if (!over) return { from: m.from, to: m.to, promotion: m.promotion };
      }
      return null;
    };`);
  const tab = {
    uid, ev, close: () => fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`).catch(() => {}),
    call: (name, ...a) => ev(`return await window.call(${JSON.stringify(name)}, ...${JSON.stringify(a)})`),
    board: id => ev(`return window.board(${JSON.stringify(id)})`),
    cost: () => ev(`return window.__cost`),
    // Waits for the listener to deliver a board the test is happy with.
    until: async (id, what, test, ms = 8000) => {
      const t0 = Date.now();
      for (;;) {
        const g = await tab.board(id);
        if (test(g)) return g;
        if (Date.now() - t0 > ms) throw new Error(`${uid} never saw: ${what} — last ${JSON.stringify(g)}`);
        await sleep(40);
      }
    },
  };
  return tab;
}

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: !!ok });
  console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''));
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const settled = g => g && !g.pending;
const result = g => g && [g.status, g.winner, g.reason, g.by];

// ── The screens ───────────────────────────────────────────────────────────
// The method is tools/emu-verify-pulso-ui.mjs's: the real index.html, a finger
// (CDP Input.dispatchTouchEvent) on the middle of an element, refused if
// something covers it.
const wrap = v => v === null ? { nullValue: null }
  : v instanceof Date ? { timestampValue: v.toISOString() }
  : Array.isArray(v) ? { arrayValue: { values: v.map(wrap) } }
  : typeof v === 'number' ? { integerValue: String(v) }
  : { stringValue: String(v) };
const seed = (docPath, o) => patch(docPath, Object.fromEntries(Object.entries(o).map(([k, v]) => [k, wrap(v)])));

async function openPhone(who, host, uid) {
  const url = `http://${host}:${WEB}/?uid=${uid}`;
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
      errors.push(`${who} EXC ` + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(`${who} CON ` + msg.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300));
    }
  });
  const send = (method, params = {}) => { const id = ++n; ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => pending.set(id, { res, rej })); };
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: `(async()=>{ ${expr} })()`, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(`${who}: ` + JSON.stringify(r.exceptionDetails).slice(0, 900));
    return r.result.value;
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const touch = (type, p) => send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }] : [] });
  const tab = {
    who, ev,
    async load(lang, scheme) {
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
      await send('Page.navigate', { url });
      await sleep(1500);
      await ev(`localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1'); localStorage.removeItem('simulSeen');`);
      await send('Page.reload', {});
      await sleep(300);
      for (let i = 0; i < 60 && await ev(`return document.readyState`) !== 'complete'; i++) await sleep(100);
      await sleep(2500);
      await ev(`
        document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove());
        const app = await import('/js/app.js'), ui = await import('/js/simul-ui.js'), fb = await import('/js/firebase.js');
        const st = await import('/js/students.js');
        window.__t = { app, S: ui.SimulUI, St: st.Students, fb,
          vis: sel => { const e = document.querySelector(sel); return !!e && !e.closest('.hidden') && e.getClientRects().length > 0; },
          txt: sel => document.querySelector(sel)?.textContent.trim() ?? null,
          all: sel => [...document.querySelectorAll(sel)].map(e => e.textContent.trim()) };`);
      await tab.until('signed in', `__t.fb.Auth.user && __t.St.uid === '${uid}'`, 10000);
    },
    async until(what, expr, ms = 8000) {
      for (const t0 = Date.now(); ;) {
        if (await ev(`return !!(${expr});`)) return true;
        if (Date.now() - t0 > ms) throw new Error(`${who} never saw: ${what} — ` + JSON.stringify(await ev(`return [__t.app.activeScreen, __t.S.sFor, __t.S.tFor, __t.S.sBoards.map(g => g.status), __t.S.tBoards.map(g => g.status), __t.txt('#simul-banner'), __t.txt('#simul-body')]`).catch(e => String(e))));
        await sleep(60);
      }
    },
    async tap(sel) {
      await send('Page.bringToFront');
      let pt;
      for (let i = 0; i < 30; i++) {
        pt = await ev(`
          const el = document.querySelector(${JSON.stringify(sel)});
          if (!el) return null;
          el.scrollIntoView({ block: 'center', inline: 'center' });
          await new Promise(r => setTimeout(r, 80));
          const r = el.getBoundingClientRect();
          const x = r.left + r.width / 2, y = r.top + r.height / 2;
          const top = document.elementFromPoint(x, y);
          return { x, y, hit: !!top && (top === el || el.contains(top)), by: top && (top.id || top.className) };`);
        if (pt && pt.hit) break;
        await sleep(200);
      }
      if (!pt) throw new Error(`${who}: no element ${sel}`);
      if (!pt.hit) throw new Error(`${who}: ${sel} is covered by ${pt.by}`);
      await touch('touchStart', pt); await sleep(40); await touch('touchEnd');
      await sleep(150);
    },
    // A screenshot, and two of the things a picture is opened to look for,
    // measured: nothing wider than the phone, no text key left untranslated.
    async shot(name) {
      await send('Page.bringToFront');
      await sleep(250);
      const m = await ev(`
        const wide = [...document.querySelectorAll('#simul-banner, #screen-simul, #stu-simul, .stu-buttons')].filter(e => !e.closest('.hidden'))
          .flatMap(e => [e, ...e.querySelectorAll('*')]).filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > 375.5 || r.left < -0.5); }).map(e => e.id || e.className);
        return { page: document.documentElement.scrollWidth, wide, raw: /simul_[a-z_]+/.exec(document.body.innerText)?.[0] ?? null };`);
      check(`[${name}] fits 375 px, every text translated`, m.page <= 375 && !m.wide.length && !m.raw, m);
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
    },
  };
  return tab;
}

async function screens() {
  const T = {
    es: { entry: '♟ Simultáneas', alt: 'Blancas en el primer tablero, negras en el segundo, y así, en el orden de la lista.', invite: n => `Invitar (${n})`,
      waiting: '⏳ Esperando', joined: '✓ Se unió', declined: 'Ahora no', noanswer: 'Sin respuesta', playing: 'En juego', out: 'No juega',
      start: n => `▶ Empezar (${n})`, roomExpired: 'La invitación caducó: pasaron 10 minutos sin empezar.', started: 'La simultánea ha empezado.',
      inv: 'Tu profesor Marta te invita a una simultánea', black: 'Juegas con negras', white: 'Juegas con blancas', join: 'Unirme', notNow: 'Ahora no', ok: 'Entendido',
      wait: 'Esperando a que Marta empiece', live: 'La simultánea con Marta ha empezado', late: 'La simultánea de Marta empezó sin ti',
      expired: 'La invitación de Marta a la simultánea caducó' },
    en: { entry: '♟ Simuls', alt: 'White on the first board, Black on the second, and so on, in the order of the list.', invite: n => `Invite (${n})`,
      waiting: '⏳ Waiting', joined: '✓ Joined', declined: 'Not now', noanswer: 'No answer', playing: 'Playing', out: 'Not playing',
      start: n => `▶ Start (${n})`, roomExpired: 'The invitation ran out: 10 minutes went by without starting.', started: 'The simul has started.',
      inv: 'Your teacher Marta invites you to a simul', black: 'You play Black', white: 'You play White', join: 'Join', notNow: 'Not now', ok: 'OK',
      wait: 'Waiting for Marta to start', live: 'The simul with Marta has started', late: "Marta's simul started without you",
      expired: "Marta's invitation to the simul ran out" },
  };
  await fetch(`http://${EMU}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  for (const [uid, first, user, avatar] of [[TEACH, 'Marta', 'marta_p', 'owl'], [ANA, 'Ana', 'ana_m', 'lion'], [LUIS, 'Luis', 'luis77', 'raven']]) {
    await seed(`users/${uid}`, { firstName: first, lastName: 'Test', username: user, profileName: first, avatarId: avatar });
    await seed(`leaderboard/${uid}`, { profileName: first, username: user, usernameLower: user, avatarId: avatar, puzzleElo: 1200 });
  }
  await makeStudent(ANA); await makeStudent(LUIS);
  const teach = await openPhone('Marta', HOSTS[0], TEACH);
  const ana = await openPhone('Ana', HOSTS[1], ANA);
  const luis = await openPhone('Luis', HOSTS[2], LUIS);
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const flat = `.map(x => x.replace(/\\s+/g, ' '))`;
  const chips = () => teach.ev(`return __t.all('#simul-body .fr-row')${flat}`);
  const banner = p => p.ev(`return __t.vis('#simul-banner') ? [__t.txt('#simul-banner-who span'), __t.all('#simul-banner-acts button')] : null`);
  const cards = p => p.ev(`return __t.vis('#stu-simul') ? [...document.querySelectorAll('#stu-simul-list .stu-invite')].map(c => [c.querySelector('.stu-invite-lead').textContent, c.querySelector('.stu-invite-end')?.textContent ?? '', [...c.querySelectorAll('button')].map(b => b.textContent)]) : null`);
  const lead = text => `document.querySelector('#stu-simul-list .stu-invite-lead')?.textContent === ${JSON.stringify(text)}`;
  const says = text => `__t.txt('#simul-banner-who span') === ${JSON.stringify(text)}`;
  const room = `document.getElementById('simul-start') && __t.S.tBoards.filter(g => g.status === 'invited' && !g.pending).length === 2`;
  // Makes the invitation on screen 11 minutes old, as the server would see it.
  const age = async () => {
    const old = { invitedAt: { timestampValue: new Date(Date.now() - 660000).toISOString() } };
    await patch(`simulGames/${TA}`, old); await patch(`simulGames/${TL}`, old);
  };
  const end = async () => {
    await teach.tap('#simul-end');
    await teach.until('the question', `!!document.querySelector('.modal-box .btn.danger')`);
  };

  for (const [lang, scheme] of [['es', 'light'], ['es', 'dark'], ['en', 'light'], ['en', 'dark']]) {
    const tag = `${lang}-${scheme}`, w = T[lang];
    console.log(`\n── The screens: ${lang.toUpperCase()}, ${scheme}, 375 px ──`);
    await Promise.all([teach.load(lang, scheme), ana.load(lang, scheme), luis.load(lang, scheme)]);

    // Who listens. The teacher has no teacher: no invitation listener at all.
    await ana.until('the invitation listener', `__t.S.sFor === '${ANA}'`);
    await luis.until('the invitation listener', `__t.S.sFor === '${LUIS}'`);
    check(`[${tag}] a user with no teacher has no simul listener; the teacher's is off away from its screen`,
      await teach.ev(`return __t.S.sStop === null && __t.S.tStop === null`));
    await luis.ev(`__t.app.showScreen('students')`);
    check(`[${tag}] a student with no students of their own is not offered Simultáneas`,
      await luis.ev(`await new Promise(r => setTimeout(r, 1500)); return __t.St.loaded && !__t.vis('#stu-simul-open')`));

    console.log('  1. Setup, invite, and the 10 minutes run out');
    await teach.ev(`__t.app.showScreen('students')`);
    await teach.until('the Simultáneas entry', `__t.vis('#stu-simul-open')`);
    check(`[${tag}] Students offers "${w.entry}" to a teacher with a student who accepted`, await teach.ev(`return __t.txt('#stu-simul-open')`) === w.entry);
    await teach.shot(`${tag}-01-students-entry`);
    await teach.tap('#stu-simul-open');
    // The round before left an invitation that ran out a moment ago.
    await teach.until('the screen', `__t.app.activeScreen === 'simul' && (document.getElementById('simul-again') || document.getElementById('simul-invite'))`);
    if (await teach.ev(`return !!document.getElementById('simul-again')`)) {
      await teach.tap('#simul-again');
      await teach.tap('#simul-pick label:nth-child(1) input');
      await teach.tap('#simul-pick label:nth-child(2) input');
    }
    await teach.until('the picker', `document.querySelectorAll('#simul-pick input').length === 2 && !document.querySelector('#simul-pick input:checked')`);
    let r = await teach.ev(`return { names: [...document.querySelectorAll('#simul-pick .fr-name')].map(e => e.firstChild.textContent), count: __t.txt('#simul-count'), invite: __t.txt('#simul-invite'), off: document.getElementById('simul-invite').disabled, listening: !!__t.S.tStop }`);
    check(`[${tag}] the picker: the two active students, 0/10, Invite off, the teacher's listener now on`,
      same(r.names, ['Ana', 'Luis']) && r.count === '0/10' && r.invite === w.invite(0) && r.off && r.listening, r);
    await teach.tap('#simul-pick label:nth-child(1) input');
    await teach.tap('#simul-pick label:nth-child(2) input');
    await teach.tap('#simul-colour button[data-v="alt"]');
    r = await teach.ev(`return { count: __t.txt('#simul-count'), invite: __t.txt('#simul-invite'), off: document.getElementById('simul-invite').disabled, hint: __t.txt('#simul-colour-hint'), on: __t.all('#simul-colour button.on').length }`);
    check(`[${tag}] both ticked, alternating: 2/10, "${w.invite(2)}", the colour explained`,
      r.count === '2/10' && r.invite === w.invite(2) && !r.off && r.hint === w.alt && r.on === 1, r);
    await teach.shot(`${tag}-02-setup`);
    await teach.tap('#simul-invite');
    await teach.until('the waiting room', room);
    let a = await stored(`simulGames/${TA}`), l = await stored(`simulGames/${TL}`);
    check(`[${tag}] stored: two boards invited, White against Ana and Black against Luis, the normal start, no opening, no clock`,
      a.status === 'invited' && l.status === 'invited' && a.tc === 'w' && l.tc === 'b' && a.fen === START && l.fen === START
      && a.op === '' && a.base === 0 && a.tMs === 0 && a.invitedAt === l.invitedAt, [a.status, a.tc, l.tc, a.base]);
    r = await teach.ev(`return { rows: __t.all('#simul-body .fr-row')${flat}, left: __t.txt('.simul-left'), start: __t.txt('#simul-start'), off: document.getElementById('simul-start').disabled }`);
    const secs = x => { const m = /^(\d+):(\d\d)$/.exec(x || ''); return m ? +m[1] * 60 + +m[2] : -1; };
    check(`[${tag}] the waiting room: both waiting, Start (0) off, the time left counting down from 10:00`,
      r.rows.length === 2 && r.rows.every(x => x.endsWith(w.waiting)) && r.start === w.start(0) && r.off && secs(r.left) > 570 && secs(r.left) <= 600, r);

    await ana.until('the banner', `__t.vis('#simul-banner')`);
    r = await banner(ana);
    check(`[${tag}] Ana, on Home: the banner — "${w.inv}", ${w.black}, Not now and Join`,
      r[0] === w.inv + w.black && same(r[1], [w.notNow, w.join]), r);
    await ana.shot(`${tag}-03-banner-invited`);
    await luis.until('the card', `__t.vis('#stu-simul')`);
    r = await cards(luis);
    check(`[${tag}] Luis, in Students: the card — the same words, ${w.white}, the time left; no banner on top of it`,
      r.length === 1 && r[0][0] === w.inv && r[0][1].startsWith(w.white) && /\d:\d\d$/.test(r[0][1]) && same(r[0][2], [w.notNow, w.join])
      && await banner(luis) === null, r);
    await luis.shot(`${tag}-04-card-invited`);

    await age();
    await teach.until('the room says it ran out', `!!document.getElementById('simul-again')`);
    r = await teach.ev(`return { lead: __t.txt('.simul-lead'), rows: __t.all('#simul-body .fr-row')${flat}, start: !!document.getElementById('simul-start') }`);
    check(`[${tag}] 11 minutes old: the teacher's room says it ran out, no Start`, r.lead === w.roomExpired && !r.start && r.rows.every(x => x.endsWith(w.noanswer)), r);
    r = await teach.ev(`return await __t.fb.startSimul()`);
    check(`[${tag}] …and Start itself would not go: nobody to start`, r.ok === false && r.reason === 'nobody', r);
    await teach.shot(`${tag}-05-room-expired`);
    await ana.until('the banner says it ran out', says(w.expired));
    check(`[${tag}] Ana's banner: "${w.expired}", one button`, same((await banner(ana))[1], [w.ok]));
    await ana.shot(`${tag}-06-banner-expired`);
    r = await ana.ev(`return await __t.fb.joinSimul('${TA}')`);
    check(`[${tag}] …and Join itself would not go`, r.ok === false && r.reason === 'expired', r);
    await luis.until('the card says it ran out', lead(w.expired));
    await luis.shot(`${tag}-07-card-expired`);
    await ana.tap('#simul-banner-acts button');
    await luis.tap('#stu-simul-list button');
    await ana.until('the banner gone', `!__t.vis('#simul-banner')`);
    await luis.until('the card gone', `!__t.vis('#stu-simul')`);
    check(`[${tag}] OK takes the notice away on both phones`, true);

    console.log('  2. Invited again; Ana joins, Luis does not answer; Start');
    await teach.tap('#simul-again');
    await teach.until('the picker again, both still ticked', `document.querySelectorAll('#simul-pick input:checked').length === 2`);
    await teach.tap('#simul-invite');
    await teach.until('the waiting room', room);
    await ana.until('the new invitation', `(__t.txt('#simul-banner-who span') || '').startsWith(${JSON.stringify(w.inv)})`);
    await ana.tap('#simul-banner-acts .btn.primary');
    await ana.until('waiting for the teacher', says(w.wait));
    check(`[${tag}] Ana joins from the banner: "${w.wait}", no buttons`, same((await banner(ana))[1], []) && (await stored(`simulGames/${TA}`)).status === 'joined');
    await ana.shot(`${tag}-08-banner-waiting`);
    await teach.until('Ana joined', `__t.txt('#simul-start') === ${JSON.stringify(w.start(1))} && !document.getElementById('simul-start').disabled`);
    r = await chips();
    check(`[${tag}] the room, live: Ana joined, Luis waiting, Start (1) on`, r[0].endsWith(w.joined) && r[1].endsWith(w.waiting), r);
    const t1 = secs(await teach.ev(`return __t.txt('.simul-left')`));
    await sleep(2200);
    const t2 = secs(await teach.ev(`return __t.txt('.simul-left')`));
    const since = await teach.ev(`return __t.fb.simulServerNow() - __t.S.current()[0].invitedAt`);
    check(`[${tag}] the time left moves, and it is 10 minutes less the server's time since the invitation`,
      t1 - t2 >= 2 && t1 - t2 <= 3 && Math.abs(t2 - (600 - since / 1000)) <= 1.5, { t1, t2, since });
    await teach.shot(`${tag}-09-room`);
    await teach.tap('#simul-start');
    await teach.until('started', `!!document.getElementById('simul-end')`);
    a = await stored(`simulGames/${TA}`); l = await stored(`simulGames/${TL}`);
    check(`[${tag}] stored: Ana's board live, the latecomer's out`, a.status === 'live' && a.startAt === a.at && l.status === 'out' && l.startAt === null, [a.status, l.status]);
    r = await teach.ev(`return { lead: __t.txt('.simul-lead'), rows: __t.all('#simul-body .fr-row')${flat} }`);
    check(`[${tag}] the teacher: "${w.started}", Ana playing, Luis not playing`, r.lead === w.started && r.rows[0].endsWith(w.playing) && r.rows[1].endsWith(w.out), r);
    await teach.shot(`${tag}-10-started`);
    await ana.until('started', says(w.live));
    await ana.shot(`${tag}-11-banner-started`);
    await luis.until('left out', lead(w.late));
    check(`[${tag}] Luis is told: "${w.late}"`, same((await cards(luis))[0][2], [w.ok]));
    await luis.shot(`${tag}-12-card-late`);
    r = await luis.ev(`return await __t.fb.joinSimul('${TL}')`);
    check(`[${tag}] …and he cannot join now`, r.ok === false && r.reason === 'gone', r);
    await luis.tap('#stu-simul-list button');
    await luis.until('the card gone', `!__t.vis('#stu-simul')`);
    // Ana opens Students: the card says what the banner said, and the banner goes.
    await ana.ev(`__t.app.showScreen('students')`);
    await ana.until('the card', lead(w.live));
    check(`[${tag}] in Students the card says it and the banner is gone`, await banner(ana) === null);
    await ana.shot(`${tag}-13-card-started`);
    await end();
    await teach.shot(`${tag}-14-end-confirm`);
    await teach.tap('.modal-box .btn.danger');
    await teach.until('back to the picker', `!!document.getElementById('simul-invite')`);
    a = await stored(`simulGames/${TA}`);
    check(`[${tag}] the teacher ends the simul: Ana's board not finished, no winner; her card goes`,
      same(result(a), ['done', null, 'unfinished', null]) && (await ana.until('the card gone', `!__t.vis('#stu-simul')`)), result(a));

    console.log('  3. Both join; Start');
    await ana.ev(`__t.app.showScreen('home')`);
    await teach.tap('#simul-colour button[data-v="black"]');
    await teach.tap('#simul-invite');
    await teach.until('the waiting room', room);
    await luis.until('the card', `document.querySelectorAll('#stu-simul-list button').length === 2`);
    r = await cards(luis);
    check(`[${tag}] Black on every board: Luis is told he plays White, and Ana too`,
      r[0][1].startsWith(w.white) && (await ana.until('the banner', `__t.vis('#simul-banner')`)) && (await banner(ana))[0] === w.inv + w.white, r);
    await luis.tap('#stu-simul-list .btn.primary');
    await ana.tap('#simul-banner-acts .btn.primary');
    await luis.until('waiting, on the card', lead(w.wait));
    await luis.shot(`${tag}-15-card-waiting`);
    await teach.until('both joined', `__t.txt('#simul-start') === ${JSON.stringify(w.start(2))} && !document.getElementById('simul-start').disabled`);
    await teach.tap('#simul-start');
    await teach.until('started', `!!document.getElementById('simul-end')`);
    a = await stored(`simulGames/${TA}`); l = await stored(`simulGames/${TL}`);
    check(`[${tag}] invite, both join, Start: two boards live at the same server instant, the teacher Black on both`,
      a.status === 'live' && l.status === 'live' && a.startAt === l.startAt && a.tc === 'b' && l.tc === 'b', [a.status, l.status]);
    await ana.until('started', says(w.live));
    await luis.until('started', lead(w.live));
    r = await chips();
    check(`[${tag}] all three phones say the simul has started`, r.length === 2 && r.every(x => x.endsWith(w.playing)), r);
    await teach.shot(`${tag}-16-started-both`);
    // The teacher leaves the screen and comes back.
    await teach.tap('#simul-back');
    await teach.until('Students, listener off', `__t.app.activeScreen === 'students' && __t.S.tStop === null`);
    await teach.tap('#stu-simul-open');
    await teach.until('started, again', `!!document.getElementById('simul-end')`);
    check(`[${tag}] Back stops the teacher's listener; coming back finds the simul as it was`, true);
    await end();
    await teach.tap('.modal-box .btn.danger');
    await teach.until('back to the picker', `!!document.getElementById('simul-invite')`);

    console.log('  4. "Not now"');
    await teach.tap('#simul-invite');
    await teach.until('the waiting room', room);
    await luis.until('the card', `document.querySelectorAll('#stu-simul-list button').length === 2`);
    await luis.tap('#stu-simul-list .btn:not(.primary)');
    await luis.until('the card gone', `!__t.vis('#stu-simul')`);
    await teach.until('Luis said no', `__t.S.tBoards.some(g => g.s === '${LUIS}' && g.status === 'out')`);
    await sleep(300);
    r = await chips();
    check(`[${tag}] Luis says not now: his card goes, nothing more is said to him, and the teacher sees it`,
      r[1].endsWith(w.declined) && r[0].endsWith(w.waiting) && (await stored(`simulGames/${TL}`)).status === 'out' && await cards(luis) === null, r);
    await teach.shot(`${tag}-17-room-declined`);
    // Leave nothing waiting for the next language.
    await age();
    await teach.until('ran out', `!!document.getElementById('simul-again')`);
    await teach.ev(`__t.app.showScreen('home')`);
  }
  console.log(`\nScreenshots: ${OUT}`);
}

let failed = false;
try {
  const teach = await openTab(TEACH, 'watchSimulTeacher', HOSTS[0]);
  const ana = await openTab(ANA, 'watchSimulStudent', HOSTS[1]);
  const luis = await openTab(LUIS, 'watchSimulStudent', HOSTS[2]);
  const tabs = [teach, ana, luis];
  for (const t of tabs) for (let i = 0; i < 50 && !await t.ev(`return window.snaps`); i++) await sleep(100);

  // The cost so far, over the three phones; phase() returns what was spent
  // since the last call.
  const cost = async () => {
    const c = await Promise.all(tabs.map(t => t.cost()));
    return { writes: c.reduce((a, x) => a + x.writes, 0), reads: c.reduce((a, x) => a + x.reads, 0) };
  };
  let mark = await cost();
  const phases = {};
  const phase = async name => {
    await sleep(400);                      // let the last echoes arrive
    const now = await cost();
    phases[name] = { writes: now.writes - mark.writes, reads: now.reads - mark.reads };
    mark = now;
    return phases[name];
  };
  const everyone = (id, what, test) => Promise.all([teach, id === TA ? ana : luis].map(t => t.until(id, what, test)));

  // Two boards as the setup screen will build them: colours alternating, an
  // opening on the first, the teacher without the a8 rook on the second.
  const build = (opening, handicap) => teach.ev(`
    const s = window.sim, cols = s.coloursFor('alt', ['${ANA}', '${LUIS}']);
    const a = s.buildStart(cols[0]), l = s.buildStart(cols[1], ${JSON.stringify(handicap)});
    const op = s.replayOpening(a.fen, ${JSON.stringify(opening)});
    return [{ s: '${ANA}', tc: cols[0], fen: a.fen, op: op.op }, { s: '${LUIS}', tc: cols[1], fen: l.fen, op: '' }];`);

  console.log('\nSimul 1: invitation (10 min + 5 s, the teacher 2 extra minutes)');
  const boards1 = await build(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], ['a8']);
  check('the boards: teacher White with the Italian on Ana\'s, Black without the a8 rook on Luis\'s',
    boards1[0].tc === 'w' && boards1[0].op === 'e2e4-e7e5-g1f3-b8c6-f1c4-' && boards1[1].tc === 'b'
    && boards1[1].fen === '1nbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQk - 0 1', boards1.map(b => [b.tc, b.op, b.fen]));
  const invite1 = `return await window.call('sendSimulInvite', ${JSON.stringify(boards1)}, window.sim.SIMUL.CLOCKS[0], 120)`;
  let r = await teach.ev(invite1);
  check('REFUSED BY THE RULES: inviting two people who are not the teacher\'s students', r.ok === false && r.reason === 'refused', r);
  check('…and nothing was stored', await stored(`simulGames/${TA}`) === null && await stored(`simulGames/${TL}`) === null);
  await makeStudent(ANA);
  r = await teach.ev(invite1);
  check('REFUSED: one of the two is not a student — the batch stores neither board', r.reason === 'refused' && await stored(`simulGames/${TA}`) === null, r);
  await makeStudent(LUIS);
  await phase('refusals');
  r = await teach.ev(invite1);
  check('the teacher invites Ana and Luis', r.ok === true && same(r.ids, [TA, TL]), r);
  let a = await stored(`simulGames/${TA}`), l = await stored(`simulGames/${TL}`);
  check('stored: 23 fields each, invited, the same server stamp on both',
    Object.keys(a).length === 23 && Object.keys(l).length === 23 && a.status === 'invited' && l.status === 'invited'
    && a.invitedAt === l.invitedAt && Math.abs(a.invitedAt - Date.now()) < 5000 && a.startAt === null && a.at === null,
    { fields: Object.keys(a).length, status: a.status });
  check('stored: the clock — students 10:00, the teacher 12:00, 5 s a move',
    a.base === 600 && a.inc === 5 && a.sMs === 600000 && a.tMs === 720000 && l.sMs === 600000 && l.tMs === 720000);
  check('stored: everyone invited is in cls on both boards', same(a.cls, [ANA, LUIS]) && same(l.cls, [ANA, LUIS]));
  let g = await ana.until(TA, 'the invitation', x => x && x.status === 'invited');
  check('Ana\'s listener delivers it: me = s, invitedAt in whole ms', g.me === 's' && g.invitedAt === a.invitedAt && g.t === TEACH, { me: g.me });
  check('Ana gets her own board only, not Luis\'s', (await ana.ev(`return window.list.length`)) === 1);
  check('her phone accepts the start position and reads the opening',
    same(await ana.ev(`const g = window.board('${TA}'); return window.sim.checkStart(g.fen, g.op).sans`), ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']));
  await teach.until(TL, 'both boards confirmed', x => settled(x) && x.status === 'invited');
  r = await teach.ev(invite1);
  check('a second invitation while one is waiting is not even sent', r.ok === false && r.reason === 'busy' && r.s === ANA, r);
  r = await teach.call('startSimul');
  check('Start with nobody joined: no', r.ok === false && r.reason === 'nobody', r);

  console.log('\nJoin and Start');
  r = await ana.call('joinSimul', TA);
  check('Ana joins', r.ok === true, r);
  r = await ana.call('joinSimul', TA);
  check('…once', r.ok === false && (r.reason === 'gone' || r.reason === 'refused'), r);
  r = await luis.call('joinSimul', TL);
  check('Luis joins', r.ok === true, r);
  r = await luis.call('simulMove', TL, 'e2e4-');
  check('no move before Start', r.ok === false && r.reason === 'gone', r);
  await Promise.all([teach.until(TA, 'Ana joined', x => settled(x) && x.status === 'joined'), teach.until(TL, 'Luis joined', x => settled(x) && x.status === 'joined')]);
  r = await teach.call('startSimul');
  check('the teacher presses Start: both boards', r.ok === true && r.started === 2 && r.left === 0, r);
  a = await stored(`simulGames/${TA}`); l = await stored(`simulGames/${TL}`);
  check('stored: live, startAt = at = prevAt, and the same instant on both boards',
    a.status === 'live' && l.status === 'live' && a.startAt === a.at && a.at === a.prevAt && a.startAt === l.startAt
    && Math.abs(a.startAt - Date.now()) < 5000);
  await Promise.all([everyone(TA, 'live', x => settled(x) && x.status === 'live'), everyone(TL, 'live', x => settled(x) && x.status === 'live')]);
  const lobby = await phase('lobby');

  console.log('\nThe server\'s clock');
  r = await Promise.all(tabs.map(t => t.ev(`return await window.fb.syncSimulClock()`)));
  const offs = await Promise.all(tabs.map(t => t.ev(`return window.fb.simulServerNow() - Date.now()`)));
  check('each phone measures its offset (same machine, so near 0)', r.every(Boolean) && offs.every(o => Math.abs(o) < 1500), { measured: r, offs });
  await phase('clock');

  console.log('\nAna\'s board: 80 single moves on the clock');
  g = await ana.board(TA);
  check('after the Italian it is Black to move: the student first', await ana.ev(`return window.sim.sideToMove(window.board('${TA}'))`) === 's');
  r = await teach.call('simulMove', TA, 'd2d4-');
  check('the teacher out of turn: not sent', r.ok === false && r.reason === 'turn', r);
  r = await ana.call('simulMove', TA, 'a8a5-');
  check('an illegal move: not sent', r.ok === false && r.reason === 'illegal', r);
  r = await ana.call('simulMove', TA, 'e7e8q');
  check('…nor a promotion letter on a move that is not one', r.ok === false && r.reason === 'illegal', r);
  const stamps = [a.startAt];
  let fine = false;
  for (let ply = 0; ply < 80; ply++) {
    const who = ply % 2 === 0 ? ana : teach;
    await who.until(TA, `move ${ply} confirmed`, x => settled(x) && x.n === ply);
    r = await who.ev(`return await window.call('simulMove', '${TA}', window.pick('${TA}', ${ply}))`);
    if (!r.ok) throw new Error(`move ${ply} by ${who.uid} failed: ${JSON.stringify(r)}`);
    const f = await fields(`simulGames/${TA}`);
    fine = fine || /\.\d{4,}Z$/.test(f.at.timestampValue);
    stamps.push(stampMs(f.at.timestampValue));
    // A think now and then, so the clocks have something to settle.
    if (ply % 20 === 7) await sleep(350);
  }
  a = await stored(`simulGames/${TA}`);
  check('80 moves, each taken by the rules', a.n === 80 && a.mv.length === 400 && a.status === 'live', { n: a.n });
  check('prevAt and at are the stamps of moves 79 and 80', a.prevAt === stamps[79] && a.at === stamps[80]);
  // A plain clock, charging each move as it is made. The stored times are one
  // move behind: move 80 (the teacher's) is not in them yet.
  const plainClock = { s: 600000, t: 720000 };
  for (let i = 1; i <= 79; i++) plainClock[i % 2 === 1 ? 's' : 't'] += 5000 - (stamps[i] - stamps[i - 1]);
  check('the stored clocks equal a plain clock to the millisecond, after 79 settled moves',
    a.sMs === plainClock.s && a.tMs === plainClock.t, { stored: [a.tMs, a.sMs], plain: [plainClock.t, plainClock.s] });
  console.log(`  (the emulator's stamps are ${fine ? 'finer than a millisecond: the cut to whole ms was exercised' : 'whole milliseconds here; the cut is proven in tests/rules/simul.test.js'})`);
  g = await teach.until(TA, 'move 80', x => settled(x) && x.n === 80);
  const left = await teach.ev(`const g = window.board('${TA}'), now = window.fb.simulServerNow(); return [window.sim.timeLeft(g, 't', now), window.sim.timeLeft(g, 's', now)]`);
  check('what the screen will show: the teacher\'s clock with move 80 in it, Ana\'s running',
    left[0] === a.tMs - (stamps[80] - stamps[79]) + 5000 && left[1] <= a.sMs && left[1] > a.sMs - 5000, left);
  const moves = await phase('moves');

  console.log('\nDraw offer, then Ana resigns');
  await ana.until(TA, 'move 80', x => settled(x) && x.n === 80);
  r = await ana.call('offerSimulDraw', TA);
  check('Ana offers a draw', r.ok === true, r);
  r = await ana.call('answerSimulDraw', TA, true);
  check('she cannot accept it herself', r.ok === false && r.reason === 'none', r);
  await teach.until(TA, 'the offer', x => x && x.draw === 's');
  r = await teach.call('answerSimulDraw', TA, false);
  check('the teacher declines', r.ok === true, r);
  await ana.until(TA, 'declined', x => settled(x) && x.draw === null);
  r = await ana.call('offerSimulDraw', TA);
  check('a second offer inside 10 moves: not sent', r.ok === false && r.reason === 'limit', r);
  r = await ana.call('claimSimulFlag', TA);
  check('a flag claimed with time on the clock: not sent', r.ok === false && r.reason === 'early', r);
  r = await ana.call('resignSimul', TA);
  check('Ana resigns', r.ok === true, r);
  a = await stored(`simulGames/${TA}`);
  check('stored: done, winner the teacher, reason resign; the moves and clocks untouched',
    same(result(a), ['done', 't', 'resign', null]) && a.n === 80 && a.sMs === plainClock.s && a.sDr === 80, result(a));
  await teach.until(TA, 'the result', x => x && x.status === 'done');
  r = await teach.call('simulMove', TA, 'a2a3-');
  check('no move after the result', r.ok === false && r.reason === 'gone', r);

  console.log('\nLuis\'s board: an impossible move, and the board is voided');
  r = await luis.call('simulMove', TL, { from: 'e2', to: 'e4' });
  check('Luis, White, opens', r.ok === true && r.san === 'e4', r);
  await luis.until(TL, 'his move confirmed', x => settled(x) && x.n === 1);
  // What a changed copy of the app could send as the teacher: well-formed, in
  // turn, and not chess — a rook from a8, where the handicap left none.
  const before = await fields(`simulGames/${TL}`);
  await patch(`simulGames/${TL}`, {
    mv: { stringValue: 'e2e4-a8a1-' }, n: { integerValue: '2' },
    prevAt: before.at, at: { timestampValue: new Date().toISOString() } });
  g = await luis.until(TL, 'the seeded move', x => x && x.n === 2);
  const pos = await luis.ev(`const p = window.sim.positionOf(window.board('${TL}')); return { ok: p.ok, where: p.where, index: p.index, move: p.move }`);
  check('Luis\'s phone cannot play it', pos.ok === false && pos.where === 'mv' && pos.index === 1 && pos.move === 'a8a1-', pos);
  r = await luis.call('simulMove', TL, 'd2d4-');
  check('…and will not move on top of it', r.ok === false && r.reason === 'position', r);
  r = await luis.call('voidSimul', TL);
  check('it voids the board', r.ok === true, r);
  l = await stored(`simulGames/${TL}`);
  check('stored: done, no winner, reason void, by the student', same(result(l), ['done', null, 'void', 's']), result(l));
  g = await teach.until(TL, 'the void', x => x && x.status === 'done');
  check('the teacher\'s strip has it', same(result(g), ['done', null, 'void', 's']));
  const endings = await phase('endings');

  console.log('\nSimul 2: no clock; Luis does not join');
  const boards2 = await build([], []);
  await Promise.all([teach.until(TA, 'settled', settled), teach.until(TL, 'settled', settled)]);
  r = await teach.ev(`return await window.call('sendSimulInvite', ${JSON.stringify(boards2)})`);
  check('a new invitation over the two finished boards', r.ok === true, r);
  a = await stored(`simulGames/${TA}`);
  check('stored: the old game is gone — no moves, no result, no clock',
    a.status === 'invited' && a.mv === '' && a.n === 0 && a.winner === null && a.reason === null && a.sDr === -1
    && a.base === 0 && a.tMs === 0 && a.sMs === 0 && a.op === '' && Object.keys(a).length === 23);
  await ana.until(TA, 'the new invitation', x => x && x.status === 'invited' && x.n === 0);
  r = await ana.call('joinSimul', TA);
  check('Ana joins', r.ok === true, r);
  await teach.until(TA, 'Ana joined', x => settled(x) && x.status === 'joined');
  r = await teach.call('startSimul');
  check('Start: one board begins, the latecomer is left out', r.ok === true && r.started === 1 && r.left === 1, r);
  g = await luis.until(TL, 'left out', x => x && x.status === 'out');
  check('Luis\'s phone is told', g.status === 'out');
  r = await luis.call('joinSimul', TL);
  check('…and he cannot join now', r.ok === false && r.reason === 'gone', r);
  await everyone(TA, 'live', x => settled(x) && x.status === 'live');
  // Luis looks in on Ana's board: he was invited to this simul.
  await phase('lobby 2');
  await luis.ev(`window.fb.watchSimulClass(list => { window.cls = list; })`);
  for (let i = 0; i < 50 && await luis.ev(`return window.cls ? window.cls.length : 0`) < 2; i++) await sleep(100);
  const seen = await luis.ev(`return window.cls.map(g => [g.id, g.me, g.status])`);
  check('Luis, watching: both boards of the simul, Ana\'s as a spectator (me = null)',
    seen.length === 2 && seen.some(x => x[0] === TA && x[1] === null && x[2] === 'live') && seen.some(x => x[0] === TL && x[1] === 's'), seen);
  await phase('watch opens');
  const mate = ['e2e4-', 'e7e5-', 'd1h5-', 'b8c6-', 'f1c4-', 'g8f6-', 'h5f7-'];
  for (let ply = 0; ply < mate.length; ply++) {
    const who = ply % 2 === 0 ? teach : ana;
    await who.until(TA, `move ${ply} confirmed`, x => settled(x) && x.n === ply);
    r = await who.call('simulMove', TA, mate[ply]);
    if (!r.ok) throw new Error(`mate move ${ply} failed: ${JSON.stringify(r)}`);
  }
  check('the seventh move is mate, and the phone that made it says so', r.san === 'Qxf7#' && r.result && r.result.winner === 't' && r.result.reason === 'mate', r);
  a = await stored(`simulGames/${TA}`);
  check('stored: done, winner the teacher, reason mate, in the same write as the move; clocks still 0',
    same(result(a), ['done', 't', 'mate', null]) && a.n === 7 && a.mv === mate.join('') && a.tMs === 0 && a.sMs === 0, result(a));
  g = await ana.until(TA, 'the mate', x => x && x.status === 'done');
  check('Ana\'s phone checks the claim against the board: it holds',
    await ana.ev(`const g = window.board('${TA}'); return window.sim.resultHolds(g, window.sim.positionOf(g).chess)`) === true);
  const watched = await luis.ev(`return window.cls.find(g => g.id === '${TA}').mv`);
  check('Luis saw the whole game', watched === mate.join(''), watched);
  const watching = await phase('mate, watched');
  await luis.ev(`window.fb.watchSimulClass(() => {})(); `);

  console.log('\nSimul 3: "not now", and the teacher ends the simul');
  await Promise.all([teach.until(TA, 'settled', settled), teach.until(TL, 'settled', settled)]);
  r = await teach.ev(`return await window.call('sendSimulInvite', ${JSON.stringify(boards2)})`);
  check('a third invitation', r.ok === true, r);
  await luis.until(TL, 'the invitation', x => x && x.status === 'invited');
  r = await luis.call('declineSimul', TL);
  check('Luis says not now', r.ok === true && (await stored(`simulGames/${TL}`)).status === 'out', r);
  await ana.until(TA, 'the invitation', x => x && x.status === 'invited');
  await ana.call('joinSimul', TA);
  await Promise.all([teach.until(TA, 'Ana joined', x => settled(x) && x.status === 'joined'), teach.until(TL, 'Luis out', x => settled(x) && x.status === 'out')]);
  r = await teach.call('startSimul');
  check('Start: Ana\'s board only', r.ok === true && r.started === 1 && r.left === 0, r);
  await teach.until(TA, 'live', x => settled(x) && x.status === 'live');
  r = await teach.call('simulMove', TA, 'd2d4-');
  check('a move', r.ok === true, r);
  await teach.until(TA, 'confirmed', x => settled(x) && x.n === 1);
  r = await teach.call('endSimul');
  check('the teacher ends the simul: one board was still open', r.ok === true && r.ended === 1, r);
  a = await stored(`simulGames/${TA}`); l = await stored(`simulGames/${TL}`);
  check('stored: Ana\'s board not finished, no winner; Luis\'s untouched',
    same(result(a), ['done', null, 'unfinished', null]) && a.n === 1 && l.status === 'out', result(a));
  await phase('simul 3');

  // ── The cost ─────────────────────────────────────────────────────────────
  const total = await cost();
  const per = (x, n) => Math.round(x / n * 100) / 100;
  const row = (name, c, note = '') => console.log(`  ${name.padEnd(46)} ${String(c.writes).padStart(6)} ${String(c.reads).padStart(6)}  ${note}`);
  console.log('\nWHAT IT COST (counted on the three phones)');
  console.log(`  ${''.padEnd(46)} writes  reads`);
  row('Invite, join, start — 2 boards', lobby, `per board: ${per(lobby.writes, 2)} writes, ${per(lobby.reads, 2)} reads, + 1 rule lookup`);
  row('Clock sync — 3 phones, once a session', phases.clock);
  row('80 moves on one board', moves, `per move: ${per(moves.writes, 80)} write, ${per(moves.reads, 80)} reads`);
  row('Endings — draw offer + no, resign, 1 move, void', endings);
  row('A classmate opens "other boards" (2 boards)', phases['watch opens']);
  row('7 moves to mate, a classmate watching', watching, `per move: ${per(watching.reads, 7)} reads (2 players + 1 watcher)`);
  row('Everything this run did', total);
  const ten = {
    writes: Math.round(10 * lobby.writes / 2 + 800 * moves.writes / 80 + 10),
    reads: Math.round(10 * lobby.reads / 2 + 10 + 800 * moves.reads / 80 + 20),
  };
  console.log(`\n  Ten boards of 40 moves each, from these numbers: about ${ten.writes} writes and ${ten.reads} reads`);
  console.log('  (lobby x 5, + 10 rule lookups, 800 moves, 10 endings of 1 write and 2 reads). The spec\'s table');
  console.log('  3k counted about 840 writes and 1,700 reads.');
  check('a move is 1 write and 2 reads, as the spec counted', moves.writes === 80 && moves.reads === 160, moves);

  console.log('\nThe listeners');
  const n = await Promise.all(tabs.map(t => t.ev(`return window.snaps`)));
  check('one listener each, still delivering', n.every(x => x >= 1), { callbacks: n });

  await Promise.all(tabs.map(t => t.close()));
  await screens();
} catch (e) {
  failed = true;
  console.error('\nSTOPPED: ' + e.message);
}

const bad = checks.filter(c => !c.ok);
console.log(`\n${checks.length - bad.length} of ${checks.length} checks passed${bad.length ? ' — FAILED: ' + bad.map(c => c.name).join(' | ') : ''}`);
// A refused write is reported by the SDK on the console; those are the point
// of this script. Anything else is listed.
const other = errors.filter(e => !/permission|PERMISSION_DENIED/i.test(e));
console.log(other.length ? `Console errors that are not a refusal (${other.length}):\n  ` + other.join('\n  ') : 'No console errors other than the refusals asked for.');
chrome.kill();
servers.forEach(s => s.close());
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(failed || bad.length || other.length ? 1 : 0);
