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
// THE GAME (conversation 4), in the same four passes:
//   2. Ana's board: a move each way; with no signal her move is on her board
//      and not in the database; the teacher ends the simul meanwhile and, back
//      with a signal, the move the server would not take is off her board.
//   3. Luis's impossible move, seeded with the rules bypassed, is never played
//      and the teacher's phone voids the board; a "checkmate" that is not one,
//      seeded on Ana's board, is voided by her phone.
//   5. A third student, Eva, on a fourth phone: three boards played to mate
//      with a finger on the squares, the teacher's phone at 375 x 667. Skip,
//      the jump to the board waiting longest, the switch that turns it off, a
//      reload of both phones in the middle, a move made with no signal that is
//      sent when it comes back.
//
// Local emulator only. Nothing here touches the real project.
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { Chess } from '../vendor/chess.js';

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
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 2400000).unref();

const TEACH = 'teach_uid', ANA = 'ana_uid', LUIS = 'luis_uid', EVA = 'eva_uid';
const TA = `${TEACH}_${ANA}`, TL = `${TEACH}_${LUIS}`, TE = `${TEACH}_${EVA}`;

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
const HOSTS = ['localhost', '127.0.0.1', '127.0.0.2', '127.0.0.3'];
const servers = HOSTS.slice(1).map(() => http.createServer(serve));
await Promise.all(servers.map((s, i) => new Promise(r => s.listen(WEB, HOSTS[i + 1], r))));

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
const drop = docPath => fetch(`${DOCS}/${docPath}`, { method: 'DELETE', headers: owner });
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
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const touch = (type, p) => send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }] : [] });
  const tab = {
    who, ev,
    size: height => send('Emulation.setDeviceMetricsOverride', { width: 375, height, deviceScaleFactor: 2, mobile: true }),
    // The phone loses its signal, or gets it back.
    net: off => send('Network.emulateNetworkConditions', { offline: off, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }),
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
          // What the board on screen shows, and the teacher's strip: name, what
          // the tile says, is it the board on screen, is it marked "your move".
          fen: () => ui.SimulUI.board ? ui.SimulUI.board.fen.split(' ')[0] : null,
          tiles: () => [...document.querySelectorAll('#simul-strip .simul-tile')].map(e =>
            [e.querySelector('.simul-tile-name').textContent, e.lastChild.textContent, e.classList.contains('on'), e.classList.contains('turn')]),
          all: sel => [...document.querySelectorAll(sel)].map(e => e.textContent.trim()) };`);
      await tab.until('signed in', `__t.fb.Auth.user && __t.St.uid === '${uid}'`, 10000);
    },
    async until(what, expr, ms = 8000) {
      for (const t0 = Date.now(); ;) {
        if (await ev(`return !!(${expr});`)) return true;
        if (Date.now() - t0 > ms) throw new Error(`${who} never saw: ${what} — ` + JSON.stringify(await ev(`return [__t.app.activeScreen, __t.S.sFor, __t.S.tFor, __t.S.sBoards.map(g => g.status), __t.S.tBoards.map(g => g.status), __t.txt('#simul-banner'), __t.txt('#simul-body'), __t.txt('#simul-status'), __t.fen(), __t.tiles()]`).catch(e => String(e))));
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
    async shotOnly(name) {
      await send('Page.bringToFront');
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
    },
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
      waiting: '⏳ Esperando', joined: '✓ Se unió', declined: 'Ahora no', noanswer: 'Sin respuesta',
      start: n => `▶ Empezar (${n})`, roomExpired: 'La invitación caducó: pasaron 10 minutos sin empezar.',
      toBoard: 'Ir al tablero', your: 'Te toca', their: 'Esperando su jugada', sending: 'Enviando tu jugada…',
      offline: 'Sin señal. Lo que juegues se envía cuando vuelva.', mateWon: 'Jaque mate. Ganaste.', mateLost: n => `Jaque mate. Gana ${n}.`,
      voidRes: 'Anulada: jugada no válida.', unfinished: 'Sin terminar: la simultánea se cerró.',
      tTurn: 'Te toca', tWon: 'Ganada', tLost: 'Perdida', tVoid: 'Anulada', next: '⏭ Siguiente', auto: 'Saltar al siguiente tablero', again: 'Nueva simultánea',
      inv: 'Tu profesor Marta te invita a una simultánea', black: 'Juegas con negras', white: 'Juegas con blancas', join: 'Unirme', notNow: 'Ahora no', ok: 'Entendido',
      wait: 'Esperando a que Marta empiece', live: 'La simultánea con Marta ha empezado', late: 'La simultánea de Marta empezó sin ti',
      expired: 'La invitación de Marta a la simultánea caducó' },
    en: { entry: '♟ Simuls', alt: 'White on the first board, Black on the second, and so on, in the order of the list.', invite: n => `Invite (${n})`,
      waiting: '⏳ Waiting', joined: '✓ Joined', declined: 'Not now', noanswer: 'No answer',
      start: n => `▶ Start (${n})`, roomExpired: 'The invitation ran out: 10 minutes went by without starting.',
      toBoard: 'Go to the board', your: 'Your move', their: 'Waiting for their move', sending: 'Sending your move…',
      offline: 'No signal. What you play is sent when it comes back.', mateWon: 'Checkmate. You won.', mateLost: n => `Checkmate. ${n} wins.`,
      voidRes: 'Void: invalid move.', unfinished: 'Not finished: the simul was ended.',
      tTurn: 'Your move', tWon: 'Won', tLost: 'Lost', tVoid: 'Void', next: '⏭ Next', auto: 'Jump to the next board', again: 'New simul',
      inv: 'Your teacher Marta invites you to a simul', black: 'You play Black', white: 'You play White', join: 'Join', notNow: 'Not now', ok: 'OK',
      wait: 'Waiting for Marta to start', live: 'The simul with Marta has started', late: "Marta's simul started without you",
      expired: "Marta's invitation to the simul ran out" },
  };
  await fetch(`http://${EMU}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  for (const [uid, first, user, avatar] of [[TEACH, 'Marta', 'marta_p', 'owl'], [ANA, 'Ana', 'ana_m', 'lion'], [LUIS, 'Luis', 'luis77', 'raven'], [EVA, 'Eva', 'eva_r', 'bear']]) {
    await seed(`users/${uid}`, { firstName: first, lastName: 'Test', username: user, profileName: first, avatarId: avatar });
    await seed(`leaderboard/${uid}`, { profileName: first, username: user, usernameLower: user, avatarId: avatar, puzzleElo: 1200 });
  }
  await makeStudent(ANA); await makeStudent(LUIS);
  const teach = await openPhone('Marta', HOSTS[0], TEACH);
  const ana = await openPhone('Ana', HOSTS[1], ANA);
  const luis = await openPhone('Luis', HOSTS[2], LUIS);
  // Nobody's student until round 5.
  const eva = await openPhone('Eva', HOSTS[3], EVA);
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  // The pieces after these moves, worked out here and not by the app.
  const after = (...uci) => { const c = new Chess(); for (const u of uci) c.move({ from: u.slice(0, 2), to: u.slice(2, 4) }); return c.fen().split(' ')[0]; };
  const fenIs = (...uci) => `__t.fen() === ${JSON.stringify(after(...uci))}`;
  const sq = name => `#simul-board .sq[data-sq="${name}"]`;
  // A finger on one square, then on the other.
  const play = async (p, from, to) => { await p.tap(sq(from)); await p.tap(sq(to)); };
  const stat = text => `__t.txt('#simul-status') === ${JSON.stringify(text)}`;
  const onBoard = `__t.app.activeScreen === 'simul' && __t.vis('#simul-board') && !!__t.fen()`;
  const look = p => p.ev(`return { status: __t.txt('#simul-status'), fen: __t.fen(), live: __t.S.board.interactive, side: __t.S.board.orientation, tiles: __t.tiles(),
    strip: __t.vis('#simul-strip'), ctl: __t.vis('#simul-ctl'), end: __t.vis('#simul-end'), again: __t.vis('#simul-new'), skipOff: document.getElementById('simul-skip').disabled,
    banner: __t.vis('#simul-banner'), note: __t.vis('#simul-note') ? __t.txt('#simul-note') : null }`);
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
    await teach.until('the board', `__t.vis('#simul-end') && __t.tiles().length === 1`);
    a = await stored(`simulGames/${TA}`); l = await stored(`simulGames/${TL}`);
    check(`[${tag}] stored: Ana's board live, the latecomer's out`, a.status === 'live' && a.startAt === a.at && l.status === 'out' && l.startAt === null, [a.status, l.status]);
    r = await look(teach);
    check(`[${tag}] the teacher: one tile, Ana's, marked "${w.tTurn}"; her board the right way up for White, theirs to move, nothing to skip to; the latecomer has no tile`,
      same(r.tiles, [['Ana', w.tTurn, true, true]]) && r.status === 'Ana · ' + w.your && r.fen === after() && r.live && r.side === 'w' && r.skipOff && r.ctl && r.end && !r.again, r);
    await teach.shot(`${tag}-10-teacher-one-board`);
    await ana.until('started', says(w.live));
    check(`[${tag}] Ana's banner offers the board: "${w.toBoard}"`, same((await banner(ana))[1], [w.toBoard]));
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
    check(`[${tag}] in Students the card says it, with the same button, and the banner is gone`, await banner(ana) === null && same((await cards(ana))[0][2], [w.toBoard]));
    await ana.shot(`${tag}-13-card-started`);
    // Ana's board, from the card. A move each way.
    await ana.tap('#stu-simul-list .btn.primary');
    await ana.until('her board', onBoard);
    r = await look(ana);
    check(`[${tag}] Ana's board: Black at the bottom, not her move yet, no strip, no buttons, no banner over it`,
      r.status === 'Marta · ' + w.their && r.side === 'b' && !r.live && r.fen === after() && !r.strip && !r.ctl && !r.end && !r.again && !r.banner, r);
    await play(teach, 'e2', 'e4');
    await teach.until('the move on the teacher\'s board', fenIs('e2e4'));
    await ana.until('the move arrives', fenIs('e2e4') + ' && ' + stat('Marta · ' + w.your));
    r = await look(teach);
    a = await stored(`simulGames/${TA}`);
    check(`[${tag}] the teacher taps e2, e4: stored, on Ana's board, and it is her move; the teacher now waits`,
      a.mv === 'e2e4-' && a.n === 1 && r.status === 'Ana · ' + w.their && !r.live && same(r.tiles, [['Ana', '', true, false]]) && (await look(ana)).live, [a.mv, r.status]);
    await ana.shot(`${tag}-13b-student-board`);
    // No signal: the move is on her board at once and nowhere else.
    await ana.net(true);
    await ana.until('told there is no signal', `__t.txt('#simul-note') === ${JSON.stringify(w.offline)}`);
    await play(ana, 'e7', 'e5');
    await ana.until('her move on her board', fenIs('e2e4', 'e7e5'));
    await ana.until('said to be on its way', stat('Marta · ' + w.sending), 6000);
    a = await stored(`simulGames/${TA}`);
    check(`[${tag}] with no signal Ana's move is on her board at once, said to be on its way, and not in the database`,
      a.n === 1 && a.mv === 'e2e4-' && (await teach.ev(`return __t.fen()`)) === after('e2e4'), [a.n, a.mv]);
    await ana.shot(`${tag}-13c-student-no-signal`);
    // Meanwhile the teacher ends the simul.
    await end();
    await teach.shot(`${tag}-14-end-confirm`);
    await teach.tap('.modal-box .btn.danger');
    await teach.until('back to the picker', `!!document.getElementById('simul-invite')`);
    a = await stored(`simulGames/${TA}`);
    check(`[${tag}] the teacher ends the simul: Ana's board not finished, no winner, and the picker is back`,
      same(result(a), ['done', null, 'unfinished', null]) && a.n === 1, result(a));
    await ana.net(false);
    await ana.until('the move the server would not take is off her board', fenIs('e2e4') + ' && ' + stat('Marta · ' + w.unfinished), 40000);
    a = await stored(`simulGames/${TA}`);
    r = await look(ana);
    check(`[${tag}] back with a signal: the move that never happened is off Ana's board, which says how the game ended`,
      a.n === 1 && a.mv === 'e2e4-' && !r.live && r.note === null && r.status === 'Marta · ' + w.unfinished, [a.n, r.status]);
    await ana.shot(`${tag}-14b-student-unfinished`);

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
    await teach.until('the boards', `__t.vis('#simul-end') && __t.tiles().length === 2`);
    a = await stored(`simulGames/${TA}`); l = await stored(`simulGames/${TL}`);
    check(`[${tag}] invite, both join, Start: two boards live at the same server instant, the teacher Black on both`,
      a.status === 'live' && l.status === 'live' && a.startAt === l.startAt && a.tc === 'b' && l.tc === 'b', [a.status, l.status]);
    await ana.until('started', says(w.live));
    await luis.until('started', lead(w.live));
    r = await look(teach);
    check(`[${tag}] the teacher: two tiles, neither waiting for them (Black on both); Ana's board on screen, turned for Black, not theirs to move`,
      same(r.tiles, [['Ana', '', true, false], ['Luis', '', false, false]]) && r.status === 'Ana · ' + w.their && r.side === 'b' && !r.live && r.skipOff, r);
    await teach.shot(`${tag}-16-started-both`);
    // A tile opens its board. Then the teacher leaves the screen and comes back.
    await teach.tap('#simul-strip .simul-tile:nth-child(2)');
    await teach.until('Luis\'s board', stat('Luis · ' + w.their));
    await teach.tap('#simul-back');
    await teach.until('Students, listener off', `__t.app.activeScreen === 'students' && __t.S.tStop === null`);
    await teach.tap('#stu-simul-open');
    await teach.until('the boards, again', `__t.vis('#simul-end') && __t.tiles().length === 2`);
    r = await look(teach);
    check(`[${tag}] a tile opens its board; Back stops the teacher's listener; coming back finds the simul and the board they were on`,
      r.status === 'Luis · ' + w.their && same(r.tiles.map(x => x[2]), [false, true]), r);
    // An impossible move, as a changed app would send it: straight into the
    // database, the rules bypassed. Luis is on his board.
    await luis.tap('#stu-simul-list .btn.primary');
    await luis.until('his board', onBoard + ' && ' + stat('Marta · ' + w.your));
    await seed(`simulGames/${TL}`, { mv: 'e2e5-', n: 1 });
    await teach.until('the tile says void', `__t.tiles()[1][1] === ${JSON.stringify(w.tVoid)}`);
    l = await stored(`simulGames/${TL}`);
    r = await look(teach);
    check(`[${tag}] an impossible move (e2-e5) seeded on Luis's board: the teacher's phone voids the board, nobody wins, the record names who refused it`,
      same(result(l), ['done', null, 'void', 't']), result(l));
    check(`[${tag}] …it is never played on the teacher's board, which says "${w.voidRes}"`,
      r.fen === after() && r.status === 'Luis · ' + w.voidRes && !r.live && same(r.tiles[1], ['Luis', w.tVoid, true, false]), r);
    await teach.shot(`${tag}-16b-teacher-void`);
    await luis.until('void, on his phone', stat('Marta · ' + w.voidRes));
    r = await look(luis);
    check(`[${tag}] …nor on Luis's, which says the same and can no longer be played on`, r.fen === after() && !r.live, r);
    await luis.shot(`${tag}-16c-student-void`);
    // A "checkmate" that is not one. Ana plays e4 for real; the reply and the
    // mate are seeded.
    await ana.tap('#simul-banner-acts .btn.primary');
    await ana.until('her board', onBoard + ' && ' + stat('Marta · ' + w.your));
    await play(ana, 'e2', 'e4');
    await teach.until('Ana has moved', `__t.tiles()[0][3] && __t.tiles()[0][1] === ${JSON.stringify(w.tTurn)}`);
    await seed(`simulGames/${TA}`, { mv: 'e2e4-e7e5-', n: 2, status: 'done', winner: 't', reason: 'mate' });
    await ana.until('void, on her phone', stat('Marta · ' + w.voidRes));
    // Her phone says so at once; the write follows.
    for (const t0 = Date.now(); (a = await stored(`simulGames/${TA}`)).reason !== 'void' && Date.now() - t0 < 10000;) await sleep(100);
    r = await look(ana);
    check(`[${tag}] a mate that is not one, seeded on Ana's board: her phone voids the game and the winner goes with it`,
      same(result(a), ['done', null, 'void', 's']) && r.fen === after('e2e4', 'e7e5') && !r.live, result(a));
    await teach.until('every board over', `__t.vis('#simul-new') && __t.tiles()[0][1] === ${JSON.stringify(w.tVoid)}`);
    r = await look(teach);
    check(`[${tag}] both boards over: the tiles say so, End and skip are gone, "${w.again}" is offered`,
      same(r.tiles.map(x => x[1]), [w.tVoid, w.tVoid]) && !r.end && !r.ctl && r.again && await teach.ev(`return __t.txt('#simul-new')`) === w.again, r);
    await teach.shot(`${tag}-16d-teacher-all-void`);
    await teach.tap('#simul-new');
    await teach.until('back to the picker', `!!document.getElementById('simul-invite')`);
    check(`[${tag}] "${w.again}" closes the finished simul: the picker is back`, await teach.ev(`return !__t.vis('#simul-game')`));
    await luis.ev(`__t.app.showScreen('students')`);
    await ana.ev(`__t.app.showScreen('home')`);

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
    // Leave nothing waiting for the next round.
    await age();
    await teach.until('ran out', `!!document.getElementById('simul-again')`);
    await teach.ev(`__t.app.showScreen('home')`);

    console.log('  5. The game: three boards played to mate, the teacher at 375 x 667');
    const TILE = n => `#simul-strip .simul-tile:nth-child(${n})`;
    const on = name => `(__t.txt('#simul-status') || '').startsWith(${JSON.stringify(name + ' · ')})`;
    const all = [teach, ana, luis, eva];
    await teach.size(667);
    await makeStudent(EVA);
    await Promise.all(all.map(p => p.load(lang, scheme)));
    // Eva has a teacher now: her phone learns it when she opens Students.
    await eva.ev(`__t.app.showScreen('students')`);
    await eva.until('her teacher', `__t.S.sFor === '${EVA}'`, 15000);
    await eva.ev(`__t.app.showScreen('home')`);
    await luis.ev(`__t.app.showScreen('students')`);
    await teach.ev(`__t.app.showScreen('students')`);
    await teach.until('the Simultáneas entry', `__t.vis('#stu-simul-open')`);
    await teach.tap('#stu-simul-open');
    await teach.until('the screen', `__t.app.activeScreen === 'simul' && (document.getElementById('simul-again') || document.getElementById('simul-invite'))`);
    if (await teach.ev(`return !!document.getElementById('simul-again')`)) await teach.tap('#simul-again');
    await teach.until('the picker, three students', `document.querySelectorAll('#simul-pick input').length === 3`, 15000);
    for (const n of [1, 2, 3]) {
      if (!await teach.ev(`return document.querySelector('#simul-pick label:nth-child(${n}) input').checked`)) await teach.tap(`#simul-pick label:nth-child(${n}) input`);
    }
    await teach.tap('#simul-colour button[data-v="alt"]');
    r = await teach.ev(`return { names: [...document.querySelectorAll('#simul-pick .fr-name')].map(e => e.firstChild.textContent), invite: __t.txt('#simul-invite') }`);
    check(`[${tag}] three students ticked, alternating`, same(r.names, ['Ana', 'Eva', 'Luis']) && r.invite === w.invite(3), r);
    await teach.tap('#simul-invite');
    await teach.until('the waiting room', `document.getElementById('simul-start') && __t.S.tBoards.filter(g => g.status === 'invited' && !g.pending).length === 3`);
    await ana.until('the banner', `__t.vis('#simul-banner-acts .btn.primary')`);
    await eva.until('the banner', `__t.vis('#simul-banner-acts .btn.primary')`);
    await luis.until('the card', `document.querySelectorAll('#stu-simul-list button').length === 2`);
    await ana.tap('#simul-banner-acts .btn.primary');
    await eva.tap('#simul-banner-acts .btn.primary');
    await luis.tap('#stu-simul-list .btn.primary');
    await teach.until('all three joined', `__t.txt('#simul-start') === ${JSON.stringify(w.start(3))} && !document.getElementById('simul-start').disabled`);
    await teach.tap('#simul-start');
    await teach.until('the boards', `__t.vis('#simul-end') && __t.tiles().length === 3`);
    a = await stored(`simulGames/${TA}`); l = await stored(`simulGames/${TL}`);
    let e = await stored(`simulGames/${TE}`);
    check(`[${tag}] stored: three boards live at one instant; the teacher White against Ana and Luis, Black against Eva`,
      [a, e, l].every(g => g.status === 'live' && g.startAt === a.startAt) && a.tc === 'w' && e.tc === 'b' && l.tc === 'w', [a.tc, e.tc, l.tc]);
    r = await look(teach);
    check(`[${tag}] the strip: Ana, Eva, Luis; gold on the two boards where it is the teacher's move; Ana's on screen`,
      same(r.tiles, [['Ana', w.tTurn, true, true], ['Eva', '', false, false], ['Luis', w.tTurn, false, true]]) && r.status === 'Ana · ' + w.your && r.live && !r.skipOff, r);
    r = await teach.ev(`
      const m = document.querySelector('main'), b = id => document.getElementById(id).getBoundingClientRect();
      return { h: innerHeight, top: m.scrollTop, strip: b('simul-strip').top, board: b('simul-board').width, ctl: b('simul-ctl').bottom, end: b('simul-end').bottom,
        skip: __t.txt('#simul-skip'), auto: __t.txt('.simul-auto'), checked: document.getElementById('simul-auto').checked }`);
    check(`[${tag}] 375 x 667: the strip, the board, the switch, skip and End are all on screen with nothing scrolled`,
      r.h === 667 && r.top === 0 && r.strip > 0 && r.board >= 300 && r.ctl < r.end && r.end <= 667 && r.skip === w.next && r.auto === w.auto && r.checked, r);
    await teach.shot(`${tag}-20-teacher-three-boards`);
    // Ten tiles do not fit: the strip scrolls sideways and the page does not.
    r = await teach.ev(`
      clearInterval(__t.S.timer); __t.S.timer = null;
      const s = document.getElementById('simul-strip');
      for (let i = 0; i < 7; i++) s.appendChild(s.children[i % 3].cloneNode(true));
      s.scrollLeft = 9999;
      return { n: s.children.length, strip: [s.scrollWidth, s.clientWidth, s.scrollLeft], page: document.documentElement.scrollWidth, end: document.getElementById('simul-end').getBoundingClientRect().bottom }`);
    check(`[${tag}] ten tiles: the strip scrolls sideways, the page stays 375 wide and as tall`, r.n === 10 && r.strip[0] > r.strip[1] && r.strip[2] > 0 && r.page <= 375 && r.end <= 667, r);
    await teach.shotOnly(`${tag}-20b-ten-tiles`);
    await teach.ev(`__t.S.stripKey = ''; __t.S.sync(); document.getElementById('simul-strip').scrollLeft = 0;`);

    // The three students open their boards.
    await ana.until('started', says(w.live));
    await ana.tap('#simul-banner-acts .btn.primary');
    await eva.until('started', says(w.live));
    await eva.tap('#simul-banner-acts .btn.primary');
    await luis.until('started', lead(w.live));
    await luis.tap('#stu-simul-list .btn.primary');
    await Promise.all([ana, eva, luis].map(p => p.until('the board', onBoard)));
    r = await look(eva);
    check(`[${tag}] Eva has White: her board the right way up and hers to move; Ana and Luis have Black and wait`,
      r.side === 'w' && r.live && r.status === 'Marta · ' + w.your && (await look(ana)).side === 'b' && !(await look(luis)).live, r);
    await eva.shot(`${tag}-21-student-board-white`);

    // Skip.
    await teach.tap('#simul-skip');
    await teach.until('Luis\'s board', on('Luis'));
    r = await look(teach);
    await teach.tap('#simul-skip');
    await teach.until('Ana\'s board', on('Ana'));
    check(`[${tag}] skip goes to the next board waiting for the teacher, and round again; it never stops on Eva's, where the teacher is not to move`,
      r.status === 'Luis · ' + w.your && same(r.tiles.map(x => x[2]), [false, false, true]) && (await look(teach)).status === 'Ana · ' + w.your, r);

    // The jump.
    await play(teach, 'e2', 'e4');
    await teach.until('the jump to Luis\'s board', on('Luis'));
    r = await look(teach);
    check(`[${tag}] the teacher moves on Ana's board and the screen jumps to the other board waiting: Luis's`,
      r.status === 'Luis · ' + w.your && same(r.tiles, [['Ana', '', false, false], ['Eva', '', false, false], ['Luis', w.tTurn, true, true]]), r);
    await ana.until('e4 on Ana\'s board', fenIs('e2e4') + ' && ' + stat('Marta · ' + w.your));
    await play(teach, 'f2', 'f3');
    await luis.until('f3 on Luis\'s board', fenIs('f2f3'));
    await sleep(1300);
    r = await look(teach);
    check(`[${tag}] no board is waiting: the screen stays where it is, and there is nothing to skip to`,
      r.status === 'Luis · ' + w.their && r.skipOff && r.fen === after('f2f3'), r);
    // Eva moves first, then Ana: Eva has been waiting longer.
    await play(eva, 'f2', 'f3');
    await teach.until('Eva has moved', `__t.tiles()[1][3]`);
    await sleep(300);
    await play(ana, 'e7', 'e5');
    await teach.until('Ana has moved', `__t.tiles()[0][3]`);
    r = await look(teach);
    check(`[${tag}] students move on other boards: their tiles turn gold and the teacher is not pulled off the board on screen`,
      r.status === 'Luis · ' + w.their && same(r.tiles.map(x => x[3]), [true, true, false]) && !r.skipOff, r);
    await play(luis, 'e7', 'e5');
    await teach.until('Luis has moved', fenIs('f2f3', 'e7e5') + ' && ' + stat('Luis · ' + w.your));
    await play(teach, 'g2', 'g4');
    await teach.until('the jump', `!${on('Luis')}`);
    r = await look(teach);
    check(`[${tag}] after the teacher's move the screen jumps to the board waiting LONGEST: Eva's, not Ana's; turned for Black`,
      r.status === 'Eva · ' + w.your && r.side === 'b' && r.fen === after('f2f3') && r.live, r);
    await teach.shot(`${tag}-22-teacher-black-board`);
    await play(teach, 'e7', 'e5');
    await teach.until('the jump to Ana\'s board', on('Ana'));
    check(`[${tag}] …and from there to the next one waiting: Ana's`, (await look(teach)).fen === after('e2e4', 'e7e5'));

    // A reload in the middle of the games, on both sides.
    await Promise.all([ana.load(lang, scheme), teach.load(lang, scheme)]);
    await ana.until('the banner', says(w.live));
    await ana.tap('#simul-banner-acts .btn.primary');
    await ana.until('her board', onBoard);
    await teach.ev(`__t.app.showScreen('students')`);
    await teach.until('the Simultáneas entry', `__t.vis('#stu-simul-open')`);
    await teach.tap('#stu-simul-open');
    await teach.until('the boards', `__t.vis('#simul-end') && __t.tiles().length === 3`);
    r = await look(teach);
    const r2 = await look(ana);
    check(`[${tag}] a reload in the middle, on both phones: the same position comes back, and the teacher is on the board waiting for them`,
      r.fen === after('e2e4', 'e7e5') && r.status === 'Ana · ' + w.your && r.live && same(r.tiles.map(x => x[3]), [true, false, false])
      && r2.fen === after('e2e4', 'e7e5') && r2.status === 'Marta · ' + w.their && !r2.live && r2.side === 'b', [r, r2]);
    await play(teach, 'f1', 'c4');
    await ana.until('Bc4 on Ana\'s board', fenIs('e2e4', 'e7e5', 'f1c4'));

    // Luis mates.
    await play(luis, 'd8', 'h4');
    await luis.until('mate', stat('Marta · ' + w.mateWon));
    l = await stored(`simulGames/${TL}`);
    await teach.until('Luis\'s tile', `__t.tiles()[2][1] === ${JSON.stringify(w.tLost)}`);
    check(`[${tag}] board 1 to mate: Luis mates the teacher (f3, e5, g4, Qh4). Stored in the same write as the move; his phone and the teacher's tile say it`,
      same(result(l), ['done', 's', 'mate', null]) && l.n === 4 && !(await look(luis)).live, result(l));
    await luis.shot(`${tag}-23-student-mate-won`);

    // A move made with no signal is sent when it comes back.
    await play(eva, 'g2', 'g4');
    await teach.until('Eva has moved', `__t.tiles()[1][3]`);
    await ana.net(true);
    await ana.until('told there is no signal', `__t.txt('#simul-note') === ${JSON.stringify(w.offline)}`);
    await play(ana, 'b8', 'c6');
    await ana.until('her move on her board', fenIs('e2e4', 'e7e5', 'f1c4', 'b8c6'));
    await sleep(800);
    a = await stored(`simulGames/${TA}`);
    const held = a.n === 3 && (await look(teach)).tiles[0][3] === false;
    await ana.net(false);
    for (const t0 = Date.now(); (a = await stored(`simulGames/${TA}`)).n !== 4 && Date.now() - t0 < 40000;) await sleep(200);
    await teach.until('Ana\'s move arrives', `__t.tiles()[0][3]`, 15000);
    await ana.until('confirmed', stat('Marta · ' + w.their) + ` && !__t.vis('#simul-note')`);
    check(`[${tag}] a move made with no signal waits in the phone and is sent when the signal is back`, held && a.n === 4 && a.mv.endsWith('b8c6-'), [held, a.n]);

    // The switch off: no jump. Skip still works.
    await teach.until('on Ana\'s board, to move', stat('Ana · ' + w.your));
    await teach.tap('#simul-auto');
    await play(teach, 'd1', 'h5');
    await ana.until('Qh5 on Ana\'s board', fenIs('e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5'));
    await sleep(1300);
    r = await look(teach);
    const off = await teach.ev(`return !document.getElementById('simul-auto').checked && localStorage.getItem('simulAuto') === '0'`);
    await teach.tap('#simul-skip');
    await teach.until('Eva\'s board', on('Eva'));
    await teach.tap('#simul-auto');
    check(`[${tag}] with the switch off the screen stays after a move (Eva's board is waiting); skip still goes there`,
      off && r.status === 'Ana · ' + w.their && r.tiles[1][3] && !r.skipOff && await teach.ev(`return __t.S.auto`), r);

    // The teacher mates Eva as Black.
    await play(teach, 'd8', 'h4');
    await eva.until('mate', stat('Marta · ' + w.mateLost('Marta')));
    e = await stored(`simulGames/${TE}`);
    r = await look(teach);
    check(`[${tag}] board 2 to mate: the teacher mates Eva as Black. Her phone says who won; the teacher's says "${w.mateWon}" and stays on the mate`,
      same(result(e), ['done', 't', 'mate', null]) && r.status === 'Eva · ' + w.mateWon && r.tiles[1][1] === w.tWon && !r.live && !(await look(eva)).live, result(e));
    await eva.shot(`${tag}-24-student-mate-lost`);

    // And Ana, by the tile.
    await play(ana, 'g8', 'f6');
    await teach.until('Ana has moved', `__t.tiles()[0][3]`);
    await teach.tap(TILE(1));
    await teach.until('Ana\'s board', stat('Ana · ' + w.your));
    await play(teach, 'h5', 'f7');
    await teach.until('every board over', `__t.vis('#simul-new')`);
    a = await stored(`simulGames/${TA}`);
    r = await look(teach);
    check(`[${tag}] board 3 to mate: the teacher mates Ana (Qxf7). Three boards over: won, won, lost on the tiles; "${w.again}" in place of End`,
      same(result(a), ['done', 't', 'mate', null]) && a.n === 7 && same(r.tiles.map(x => x[1]), [w.tWon, w.tWon, w.tLost]) && r.status === 'Ana · ' + w.mateWon
      && r.fen === after('e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7') && !r.end && !r.ctl && r.again, [result(a), r]);
    await teach.shot(`${tag}-25-teacher-all-over`);
    await ana.until('mate', stat('Marta · ' + w.mateLost('Marta')));
    await ana.shot(`${tag}-26-student-mated`);
    await teach.tap('#simul-new');
    await teach.until('back to the picker', `!!document.getElementById('simul-invite')`);
    // Eva is nobody's student again.
    await drop(`coaching/${TEACH}_${EVA}`); await drop(`simulGames/${TE}`);
    await teach.ev(`__t.app.showScreen('home')`);
    await teach.size(812);
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
