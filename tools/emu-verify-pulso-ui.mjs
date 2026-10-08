// Two phones, two friends, the WHOLE app: Pulso's lobby, challenge, waiting
// screen, incoming banner and the MATCH itself, tapped with real touch events,
// against the Firestore EMULATOR running the real firestore.rules. Dev tool,
// not shipped.
//
//   node tools/emu-verify-pulso-ui.mjs <outDir>     about 12 minutes; screenshots go to <outDir>
//
// How: like tools/emu-verify-pulso.mjs it starts the emulator and serves the
// app folder with stand-ins for three SDK files — but here index.html itself
// is loaded, so the app has to believe somebody is signed in:
//   firebase-auth.js        onAuthStateChanged() really calls back, with a fake
//                           user whose uid is ?uid= ; signOut() calls back null
//   firebase-firestore.js   the real one, pointed at the emulator and signed in
//                           as ?uid= (mockUserToken); onSnapshot is counted, so
//                           "exactly one listener" is a number, not a belief
//   firebase-app-check.js   does nothing
//   sw.js                   404, so nothing is served from a cache
// Ana (alice_uid) is opened on http://localhost and Luis (bob_uid) on
// http://127.0.0.1 — two origins, so each has its own storage, like two phones.
//
// THE MATCHES, one per language and colour scheme, five in all:
//   es-light  a mistake on each side, then Ana pulls the whole bar and wins
//   es-dark   Luis is cut off (CDP offline) and the clock ends it on Ana's
//             phone — the whole 3 minutes 9 seconds are really waited
//   en-light  Leave: the button, the back gesture and the menu all ask first;
//             "No" plays on, "Yes" forfeits
//   en-dark   Luis's phone runs 7 s fast and reloads the app mid-match; then
//             the clock ends it with both phones online; then a second match
//             that Ana leaves under the countdown
// Each one also goes through the countdown, three solves by Ana (the streak
// pull) and 20 really-waited seconds for the "no signal" note.
//
// THE RESULT SCREEN AND THE REMATCH (session 6) ride on those matches. Every
// one of the seven endings is read on both phones: won / lost by pull
// (es-light), on the clock (es-dark, en-dark), on fewer mistakes and a draw
// (es-light, two rematches), friend left / you left (en-light, en-dark). A
// rematch is asked for and accepted from each side, taken back, left to run
// out and refused; the tally is read on the friend's public profile by Ana
// and by Luis and looked for on Carolina's phone (a third tab, 127.0.0.2);
// the share card, the daily streak and Kael's silence are checked in es-light.
// The rematch matches are ended by moving startAt 186 s into the past (seeded)
// rather than waited out.
//
// REALLY TOUCHED (CDP Input.dispatchTouchEvent): ☰ and the Puzzles entry, every
// mode chip, Challenge, Tell them, Cancel, Accept, Not now, Challenge again,
// Back, Rush's Start — and in the matches every chess move (two taps, the
// piece then the square), Leave, Yes, No, Back.
// NOT TAPPED: a puzzle whose answer is a promotion is answered through the
// engine's userMove() rather than the promotion picker (the last line of the
// run says how often); the back gesture is history.back().
// SEEDED WITH THE RULES BYPASSED ("Bearer owner"): the users, their public
// rows, the friendships, an old 3-2 tally, a 6-minute-old invitation, an
// invitation whose puzzles this app does not have, putting a 'live' match
// back to 'done' between scenes, and — in en-dark only — moving startAt 178 s
// into the past so that match's clock does not have to be waited out too.
// Every other write goes through the rules.
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
const OUT = process.argv.find((a, i) => i >= 2 && !a.startsWith('--'));
if (!OUT) { console.error('usage: node tools/emu-verify-pulso-ui.mjs <outDir>'); process.exit(1); }

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
      `"node tools/emu-verify-pulso-ui.mjs ${JSON.stringify(path.resolve(OUT)).slice(1, -1).replace(/\\\\/g, '/')} --inner"`],
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
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-pulso-ui-'));
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 2100000).unref();

const ALICE = 'alice_uid', BOB = 'bob_uid', CAROL = 'carol_uid';   // alice sorts first: she is player "a"
const AB = `${ALICE}_${BOB}`;

const SDK = '/vendor/firebase-10.14.1/';
const UID = `new URLSearchParams(location.search).get('uid')`;
const SHIMS = {
  [SDK + 'firebase-firestore.js']: `
    export * from './firebase-firestore.real.js';
    import { getFirestore as real, connectFirestoreEmulator, onSnapshot as realSnap } from './firebase-firestore.real.js';
    export function getFirestore(app) {
      const f = real(app);
      const uid = ${UID};
      connectFirestoreEmulator(f, '${EMU_HOST}', ${EMU_PORT}, uid ? { mockUserToken: { sub: uid } } : {});
      return f;
    }
    window.__listeners = 0; window.__listenersEver = 0;
    export function onSnapshot(...a) {
      window.__listeners++; window.__listenersEver++;
      const stop = realSnap(...a);
      let open = true;
      return () => { if (open) { open = false; window.__listeners--; } stop(); };
    }`,
  [SDK + 'firebase-auth.js']: `
    const no = () => { throw new Error('auth is a stand-in here'); };
    const uid = ${UID};
    const auth = { currentUser: uid ? { uid, email: uid + '@example.test', displayName: uid, providerData: [{ providerId: 'password' }] } : null };
    const cbs = [];
    export function getAuth() { return auth; }
    export function onAuthStateChanged(a, cb) { cbs.push(cb); setTimeout(() => cb(auth.currentUser), 0); return () => {}; }
    export async function signOut() { auth.currentUser = null; for (const cb of cbs) cb(null); }
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
// A third loopback address, so Carolina's phone has storage of its own too.
const server2 = http.createServer((q, r) => server.emit('request', q, r));
await new Promise(r => server2.listen(WEB, '127.0.0.2', r));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const req = (url, method = 'GET') => new Promise((res, rej) => {
  http.request(url, { method }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej).end();
});

// ── The emulator, with the rules bypassed ────────────────────────────────
const owner = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const wrap = v => v === null ? { nullValue: null }
  : v instanceof Date ? { timestampValue: v.toISOString() }
  : Array.isArray(v) ? { arrayValue: { values: v.map(wrap) } }
  : typeof v === 'number' ? { integerValue: String(v) }
  : { stringValue: String(v) };
const plain = v => v === undefined ? undefined
  : 'integerValue' in v ? Number(v.integerValue)
  : 'stringValue' in v ? v.stringValue
  : 'nullValue' in v ? null
  : 'timestampValue' in v ? Date.parse(v.timestampValue)
  : 'arrayValue' in v ? (v.arrayValue.values || []).map(plain)
  : v;
// Writes `fields`; with patch = true only those fields change.
async function seed(docPath, fields, patch = false) {
  const mask = patch ? '?' + Object.keys(fields).map(k => 'updateMask.fieldPaths=' + k).join('&') : '';
  const body = {};
  for (const [k, v] of Object.entries(fields)) body[k] = wrap(v);
  const r = await fetch(`${DOCS}/${docPath}${mask}`, { method: 'PATCH', headers: owner, body: JSON.stringify({ fields: body }) });
  if (!r.ok) throw new Error(`seeding ${docPath} failed: ` + await r.text());
}
async function storedUntil(pred, ms = 6000) {
  for (const t0 = Date.now(); ;) {
    const d = await stored(`pulso/${AB}`);
    if (pred(d) || Date.now() - t0 > ms) return d;
    await sleep(80);
  }
}
async function stored(docPath) {
  const r = await fetch(`${DOCS}/${docPath}`, { headers: owner });
  if (!r.ok) return null;
  const out = {};
  for (const [k, v] of Object.entries((await r.json()).fields || {})) out[k] = plain(v);
  return out;
}
const PZ_OLD = 'Aa0aA'.repeat(60);          // any 300 characters: only ever sits in a finished match
const PZ_UNKNOWN = 'Zz9zZ'.repeat(60);      // well-formed, but no such puzzle in this app
const matchDoc = over => ({
  members: [ALICE, BOB], status: 'done', host: ALICE, invitedAt: new Date(Date.now() - 3600e3), startAt: new Date(Date.now() - 3590e3),
  pz: PZ_OLD, aS: 0, aM: 0, aK: 0, aP: 0, bS: 0, bM: 0, bK: 0, bP: 0, winner: ALICE, reason: 'pull', aW: 3, bW: 2, dr: 0, ...over });

await fetch(`http://${EMU}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
for (const [uid, first, user, avatar] of [[ALICE, 'Ana', 'ana_m', 'owl'], [BOB, 'Luis', 'luis77', 'lion'], [CAROL, 'Carolina', 'caro', 'raven']]) {
  await seed(`users/${uid}`, { firstName: first, lastName: 'Test', username: user, profileName: first, avatarId: avatar });
  await seed(`leaderboard/${uid}`, { profileName: first, username: user, usernameLower: user, avatarId: avatar, puzzleElo: 1200 });
}
await seed(`friendships/${AB}`, { members: [ALICE, BOB], createdAt: 1755000000000 });
await seed(`friendships/${ALICE}_${CAROL}`, { members: [ALICE, CAROL], createdAt: 1755000000000 });
await seed(`pulso/${AB}`, matchDoc({}));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { await req(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await sleep(250); } }

const errors = [];
const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: !!ok });
  console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''));
};

// One phone.
async function openTab(who, host, uid) {
  const url = `http://${host}:${WEB}/${uid ? '?uid=' + uid : ''}`;
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
    } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      errors.push(`${who} LOG ` + (msg.params.entry.text + ' ' + (msg.params.entry.url || '')).slice(0, 300));
    }
  });
  const send = (method, params = {}) => { const id = ++n; ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => pending.set(id, { res, rej })); };
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: `(async()=>{ ${expr} })()`, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(`${who}: ` + JSON.stringify(r.exceptionDetails).slice(0, 900));
    return r.result.value;
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const touch = (type, p) => send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }] : [] });
  const tab = {
    who, ev, send,
    // (Re)loads the app in a language and a colour scheme, and waits for sign-in.
    async load(lang, scheme) {
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
      await send('Page.navigate', { url });
      await sleep(1500);
      await ev(`localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1');`);
      await send('Page.reload', {});
      for (let i = 0; i < 60 && await ev(`return document.readyState`) !== 'complete'; i++) await sleep(100);
      await sleep(2500);
      await ev(`
        document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove());
        const app = await import('/js/app.js'), ui = await import('/js/pulso-ui.js'), fb = await import('/js/firebase.js');
        const pm = await import('/js/pulso-match.js'), { Chess } = await import('/vendor/chess.js');
        const fr = await import('/js/friends.js'), db = await import('/js/db.js');
        window.__t = { app, P: ui.PulsoUI, M: pm.PulsoMatch, fb, F: fr.Friends, db,
          // The middle of every square of the match board, as a finger finds it.
          pts: () => { const o = {}; document.querySelectorAll('#pulso-board .sq').forEach(q => { const r = q.getBoundingClientRect(); o[q.dataset.sq] = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }); return o; },
          // A legal move that is not the answer, not a promotion and not mate.
          wrong: () => {
            const g = pm.PulsoMatch.game, expected = g.current.moves[g.moveIdx];
            for (const m of g.chess.moves({ verbose: true })) {
              if (m.from + m.to === expected.slice(0, 4) || m.promotion) continue;
              const c = new Chess(g.chess.fen()); c.move(m);
              if (!c.isCheckmate()) return m.from + m.to;
            }
            return null;
          },
          vis: sel => { const e = document.querySelector(sel); return !!e && !e.closest('.hidden') && e.getClientRects().length > 0; },
          txt: sel => document.querySelector(sel)?.textContent.trim() ?? null,
          rows: () => [...document.querySelectorAll('#pulso-list .fr-row')].map(r => ({
            name: r.querySelector('.fr-name').firstChild.textContent, tally: r.querySelector('.pulso-tally').textContent,
            btn: r.querySelector('button').textContent, off: r.querySelector('button').disabled })) };`);
      if (uid) await tab.until('signed in, listener running', `__t.fb.Auth.user && __t.P.uid === '${uid}' && window.__listeners === 1`, 10000);
    },
    async until(what, expr, ms = 8000) {
      for (const t0 = Date.now(); ;) {
        if (await ev(`return !!(${expr});`)) return true;
        if (Date.now() - t0 > ms) throw new Error(`${who} never saw: ${what} — ` + JSON.stringify(await ev(`return [!!__t.fb.Auth.user, __t.P.uid, window.__listeners, __t.app.activeScreen, __t.P.bands, __t.P.matches.map(m => m.status)]`).catch(e => String(e))));
        await sleep(60);
      }
    },
    // A finger on the middle of an element — refused if something covers it.
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
    async shot(name) {
      await send('Page.bringToFront');
      await sleep(250);
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
    },
    // Two taps: the piece, then the square it goes to.
    async tapMove(uci) {
      await send('Page.bringToFront');
      const pts = await ev(`return __t.pts();`);
      for (const sq of [uci.slice(0, 2), uci.slice(2, 4)]) { await touch('touchStart', pts[sq]); await sleep(25); await touch('touchEnd'); await sleep(20); }
    },
    ready: () => tab.until('a puzzle to play', `__t.M.game.running && __t.M.game.current && __t.M.game.moveIdx % 2 === 1 && __t.M.game.board.interactive`, 6000),
    // Plays the puzzle on the board to the end.
    async solve() {
      await tab.ready();
      const p = await ev(`const g = __t.M.game; return { id: g.current.id, moves: g.current.moves, at: __t.M.at() };`);
      for (let i = 1; i < p.moves.length; i += 2) {
        await tab.until('my move', `(__t.M.game.moveIdx === ${i} && __t.M.game.board.interactive) || __t.M.at() > ${p.at}`, 4000);
        if (await ev(`return __t.M.at();`) > p.at) break;      // a mate that was not the listed move
        const u = p.moves[i];
        if (u.length > 4) {
          promoByCall++;
          await ev(`__t.M.game.userMove({ from: '${u.slice(0, 2)}', to: '${u.slice(2, 4)}', promotion: '${u[4]}' });`);
        } else await tab.tapMove(u);
      }
      await tab.until('the solve counted', `__t.M.at() === ${p.at + 1}`, 3000);
      return p;
    },
    // Plays a wrong move.
    async miss() {
      await tab.ready();
      const p = await ev(`return { id: __t.M.game.current.id, at: __t.M.at(), wrong: __t.wrong() };`);
      await tab.tapMove(p.wrong);
      await tab.until('the mistake counted', `__t.M.at() === ${p.at + 1}`, 3000);
      return { ...p, t0: Date.now() };
    },
    // The match pane as it stands. `flame` is where the flame really is across
    // the bar (0 = the friend's end, 1 = mine), measured, not read from --p.
    game: () => ev(`
      const M = __t.M, g = M.game, bar = document.getElementById('pulso-bar'), fl = document.getElementById('pulso-flame').getBoundingClientRect();
      const cs = getComputedStyle(bar), br = bar.getBoundingClientRect(), bl = parseFloat(cs.borderLeftWidth);
      return { pane: __t.vis('#pulso-game'), count: __t.vis('#pulso-countdown'), label: __t.txt('#pulso-countdown span'),
        status: __t.vis('#pulso-status') ? __t.txt('#pulso-status') : null, timer: __t.txt('#pulso-timer'),
        danger: document.getElementById('pulso-timer').classList.contains('danger'),
        p: parseFloat(bar.style.getPropertyValue('--p')), flame: (fl.left + fl.width / 2 - br.left - bl) / (br.width - bl - parseFloat(cs.borderRightWidth)),
        hotMe: bar.classList.contains('hot-me'), hotThem: bar.classList.contains('hot-them'),
        streak: __t.vis('#pulso-streak') ? __t.txt('#pulso-streak') : '', quiet: __t.vis('#pulso-quiet') ? __t.txt('#pulso-quiet') : '',
        their: __t.txt('#pulso-their-score'), my: __t.txt('#pulso-my-score'), name: __t.txt('#pulso-their-name'),
        end: __t.vis('#pulso-end') ? __t.txt('#pulso-end-line') : '', leave: __t.vis('#pulso-leave'),
        id: g.current ? g.current.id : null, at: M.id ? M.at() : null, live: g.running, free: g.board.interactive,
        now: __t.fb.pulsoServerNow(), offset: __t.fb.pulsoClockOffset(), listeners: window.__listeners,
        fits: document.getElementById('pulso-leave').getBoundingClientRect().bottom <= innerHeight && document.documentElement.scrollWidth <= innerWidth };`),
    // The result screen as it stands.
    result: () => ev(`
      const b = document.getElementById('pulso-rematch'), bar = document.getElementById('pulso-bar'), fl = document.getElementById('pulso-flame').getBoundingClientRect();
      const cs = getComputedStyle(bar), br = bar.getBoundingClientRect(), bl = parseFloat(cs.borderLeftWidth);
      const back = document.getElementById('pulso-end-back').getBoundingClientRect();
      const probe = document.createElement('i'); probe.style.background = 'var(--gold)'; document.body.appendChild(probe);
      const gold = getComputedStyle(probe).backgroundColor; probe.remove();
      return { up: __t.vis('#pulso-result') && __t.vis('#pulso-end'), title: __t.txt('#pulso-end-line'),
        sub: __t.vis('#pulso-end-sub') ? __t.txt('#pulso-end-sub') : '', their: __t.txt('#pulso-their-score'), my: __t.txt('#pulso-my-score'),
        tally: __t.txt('#pulso-end-tally'), btn: b.textContent, gold: b.classList.contains('wants'), goldBg: getComputedStyle(b).backgroundColor === gold, off: b.disabled,
        cancel: __t.vis('#pulso-rematch-cancel'), note: __t.vis('#pulso-rematch-note') ? __t.txt('#pulso-rematch-note') : '',
        p: parseFloat(bar.style.getPropertyValue('--p')), flame: (fl.left + fl.width / 2 - br.left - bl) / (br.width - bl - parseFloat(cs.borderRightWidth)),
        bar: __t.vis('#pulso-bar'), art: __t.vis('#pulso-result img'),
        gone: !__t.vis('#pulso-board') && !__t.vis('#pulso-timer') && !__t.vis('#pulso-status') && !__t.vis('#pulso-leave') && !__t.vis('#pulso-countdown'),
        share: __t.vis('#pulso-share'), back: __t.vis('#pulso-end-back'), banner: __t.vis('#pulso-banner'),
        dot: document.getElementById('tabmenu-btn').classList.contains('pulso-dot'),
        fits: back.bottom <= innerHeight && document.documentElement.scrollWidth <= innerWidth,
        kael: document.getElementById('kael-bubble').classList.contains('show'), id: __t.M.id, credited: __t.M.credited, streak: __t.app.Streak.count };`),
    see: () => ev(`return { screen: __t.app.activeScreen, lobby: __t.vis('#pulso-lobby'), waiting: __t.vis('#pulso-waiting'),
      game: __t.vis('#pulso-game'), banner: __t.vis('#pulso-banner'), bannerText: __t.txt('#pulso-banner-who'),
      title: __t.txt('#pulso-wait-title'), clock: __t.txt('#pulso-wait-clock'), note: __t.vis('#pulso-note') ? __t.txt('#pulso-note') : '',
      toast: __t.vis('#toast') ? __t.txt('#toast') : '', listeners: window.__listeners, rows: __t.rows() };`),
    offline: on => send('Network.emulateNetworkConditions', { offline: on, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }),
  };
  await send('Network.enable');
  return tab;
}

let promoByCall = 0;
const SKEW = 7000;      // how fast Luis's phone runs in the last combination
const T = {
  es: { getReady: '¡Prepárate!', streak: '¡Racha! ×2', quiet: 'Sin señal de Luis', leaveQ: '¿Salir? Perderás este Pulso.', you: 'Tú', timeUp: '¡Se acabó el tiempo!',
    wonPull: '¡Ganaste el Pulso!', lostPull: 'Ana se llevó la llama', wonTime: '¡Ganaste a tiempo!', lostTime: 'Ana ganó a tiempo', youLeft: 'Abandonaste', left: n => `${n} abandonó`,
    challenge: 'Retar', waiting: 'Esperando a Luis…', invite: 'Ana te reta a un Pulso', noAnswer: 'Luis no respondió', declined: 'Luis dijo que ahora no',
    offline: 'Pulso necesita conexión', tally: 'Tú 3 · 2', update: 'Uno de los dos tiene que actualizar la app', signin: 'Inicia sesión para retar a un amigo', preparing: 'Preparando…',
    wonErrors: 'Empate en la barra — ganaste por menos errores', lostErrors: n => `Empate en la barra — ${n} ganó por menos errores`, draw: 'Tablas',
    sub: /^Arrastraste la llama hasta tu lado en (\d):(\d\d)\.$/, rematch: '⚔ Revancha', wants: n => `${n} quiere la revancha — Aceptar`, waitingFor: n => `Esperando a ${n}…`,
    inviteBy: n => `${n} te reta a un Pulso`, declinedBy: n => `${n} dijo que ahora no`, noAnswerBy: n => `${n} no respondió`, line: (a, n, b) => `Pulso: Tú ${a} · ${n} ${b}`, row: (a, b) => `Tú ${a} · ${b}` },
  en: { getReady: 'Get ready!', streak: 'Streak! ×2', quiet: 'No signal from Luis', leaveQ: 'Leave? You will lose this Pulso.', you: 'You', timeUp: "Time's up!",
    wonPull: 'You won the Pulso!', lostPull: 'Ana took the flame', wonTime: 'You won on time!', lostTime: 'Ana won on time', youLeft: 'You left', left: n => `${n} left`,
    challenge: 'Challenge', waiting: 'Waiting for Luis…', invite: 'Ana challenges you to a Pulso', noAnswer: 'Luis did not answer', declined: 'Luis said not now',
    offline: 'Pulso needs a connection', tally: 'You 3 · 2', update: 'One of you needs to update the app', signin: 'Sign in to challenge a friend', preparing: 'Preparing…',
    wonErrors: 'Level on the bar — you won on fewer mistakes', lostErrors: n => `Level on the bar — ${n} won on fewer mistakes`, draw: 'Draw',
    sub: /^You dragged the flame to your side in (\d):(\d\d)\.$/, rematch: '⚔ Rematch', wants: n => `${n} wants a rematch — Accept`, waitingFor: n => `Waiting for ${n}…`,
    inviteBy: n => `${n} challenges you to a Pulso`, declinedBy: n => `${n} said not now`, noAnswerBy: n => `${n} did not answer`, line: (a, n, b) => `Pulso: You ${a} · ${n} ${b}`, row: (a, b) => `You ${a} · ${b}` },
};
const LUIS = '#pulso-list .fr-row:nth-child(2) button';   // Carolina sorts first

let failed = false;
try {
  const ana = await openTab('ana', 'localhost', ALICE), luis = await openTab('luis', '127.0.0.1', BOB);
  const openPulso = async tab => {
    await tab.tap('#tabmenu-btn');
    await tab.tap('#tabbar button[data-screen="puzzles"]');
    await tab.until('the Puzzles screen', `__t.app.activeScreen === 'puzzles'`);
    await tab.tap('#screen-puzzles .puzzle-modes [data-v="pulso"]');
    await tab.until('the lobby, ready', `__t.app.activeScreen === 'pulso' && __t.vis('#pulso-lobby') && __t.P.bands === 'ready' && __t.rows().length > 0`, 15000);
  };
  // Back to a finished match, whatever the last scene left behind.
  const reset = async () => {
    await seed(`pulso/${AB}`, { status: 'done' }, true);
    await Promise.all([ana, luis].map(t => t.until('the match reset', `!__t.P.matches.some(m => m.status === 'invited' || m.status === 'live')`)));
  };

  // ── the match ──────────────────────────────────────────────────────────
  const both = () => Promise.all([ana.game(), luis.game()]);
  const secs = timer => { const m = /(\d+):(\d\d)/.exec(timer); return m ? m[1] * 60 + +m[2] : NaN; };
  const YES = '#modal-root .modal-box .btn.danger', NO = '#modal-root .modal-box .btn:not(.danger)';
  const asked = (tab, w) => tab.until('"Leave?"', `__t.txt('#modal-root .modal-box p') === ${JSON.stringify(w.leaveQ)}`, 4000);
  // The flame `pos` steps to my side (minus = the friend's) on a phone: where
  // the match document puts it, and where it really is once it has slid there.
  const barAt = async (tab, pos) => {
    const p = (pos + 10) / 20;
    await tab.until(`the flame at ${pos}`, `Math.abs(parseFloat(document.getElementById('pulso-bar').style.getPropertyValue('--p')) - ${p}) < 0.001`, 6000);
    // A tab that is not in front does not run the slide at all.
    await tab.send('Page.bringToFront');
    await sleep(450);
    return Math.abs((await tab.game()).flame - p) < 0.02;
  };
  const backToLobby = async () => {
    for (const tab of [ana, luis]) if (await tab.ev(`return __t.vis('#pulso-end-back')`)) await tab.tap('#pulso-end-back');
    await ana.until('the lobby', `__t.vis('#pulso-lobby')`);
  };

  // ── the result screen and the rematch ─────────────────────────────────
  const NAME = { ana: 'Ana', luis: 'Luis' }, UIDS = { ana: ALICE, luis: BOB };
  const score = (who, s, m) => `${who} · ${s} ✓ · ${m} ✗`;
  const RESULT = `__t.vis('#pulso-result') && __t.vis('#pulso-end')`;
  // One phone's result screen, read whole. `want`: title, sub (a pattern, or
  // none), my, their, tally, p.
  const resultOn = async (tag, what, tab, w, want) => {
    await tab.until('the result screen', RESULT, 12000);
    await tab.send('Page.bringToFront');
    await sleep(450);
    const r = await tab.result();
    check(`[${tag}] ${what} — ${NAME[tab.who]}'s result screen: "${want.title}"${want.sub ? ' with its sub-line' : ''}, ${want.my} | ${want.their}, "${want.tally}", the flame frozen at ${want.p}; the board, clock and Leave gone; Revancha, share and Back all on screen at 375 px; no banner, no Kael`,
      r.up && r.title === want.title && (want.sub ? want.sub.test(r.sub) : r.sub === '') && r.my === want.my && r.their === want.their && r.tally === want.tally
      && Math.abs(r.p - want.p) < 0.001 && Math.abs(r.flame - want.p) < 0.03 && r.bar && r.art && r.gone && r.share && r.back && r.fits
      && r.btn === w.rematch && !r.gold && !r.off && !r.cancel && !r.note && !r.banner && !r.kael && r.id === AB, r);
    return r;
  };
  // `from` taps Revancha while `to` is still on the result screen. Returns
  // the list of puzzles of the match that had just ended.
  const askRematch = async (tag, w, from, to, { shots = false } = {}) => {
    const before = [await from.result(), await to.result()], old = await stored(`pulso/${AB}`);
    await from.tap('#pulso-rematch');
    await from.until('"Waiting for…"', `__t.txt('#pulso-rematch') === ${JSON.stringify(w.waitingFor(NAME[to.who]))} && __t.P.matches.some(m => m.status === 'invited' && !m.pending)`);
    await to.until('the gold button', `document.getElementById('pulso-rematch').classList.contains('wants')`);
    await to.send('Page.bringToFront');
    await sleep(300);
    const f = await from.result(), g = await to.result(), d = await stored(`pulso/${AB}`);
    const same = (x, y) => x.up && x.title === y.title && x.my === y.my && x.their === y.their && x.tally === y.tally && x.p === y.p;
    check(`[${tag}] ${NAME[from.who]} taps Revancha (real tap) on the result screen: the button reads "${w.waitingFor(NAME[to.who])}", is spent, and Cancel appears; stored invited, host ${NAME[from.who]}, every counter 0, the tally kept — and the result screen still shows the match as it ended`,
      f.btn === w.waitingFor(NAME[to.who]) && f.off && f.cancel && !f.gold && same(f, before[0]) && d.status === 'invited' && d.host === UIDS[from.who]
      && d.aS + d.aM + d.aP + d.bS + d.bM + d.bP === 0 && d.startAt === null && d.aW === old.aW && d.bW === old.bW && d.dr === old.dr,
      { btn: f.btn, off: f.off, cancel: f.cancel, status: d.status, host: d.host, my: [before[0].my, f.my] });
    check(`[${tag}] …and on ${NAME[to.who]}'s result screen the same button turns gold: "${w.wants(NAME[from.who])}", live, no Cancel, NO banner and no gold dot on top of it, the match still as it ended`,
      g.btn === w.wants(NAME[from.who]) && g.gold && g.goldBg && !g.off && !g.cancel && !g.banner && !g.dot && same(g, before[1]) && g.fits,
      { btn: g.btn, gold: g.gold, goldBg: g.goldBg, banner: g.banner, dot: g.dot, fits: g.fits });
    if (shots) { await from.shot(`${tag}-rematch-waiting`); await to.shot(`${tag}-rematch-wants`); }
    return old.pz;
  };
  // `to` taps the gold button: both phones go to a new countdown.
  const takeRematch = async (tag, w, to, oldPz) => {
    await to.tap('#pulso-rematch');
    await Promise.all([ana, luis].map(t => t.until('the new countdown', `__t.vis('#pulso-countdown') && !__t.vis('#pulso-result') && __t.M.list && __t.M.game.current`, 15000)));
    const d = await stored(`pulso/${AB}`), [a, l] = await both();
    check(`[${tag}] ${NAME[to.who]} taps the gold button (real tap): BOTH phones leave the result screen for a new countdown — a board again, the clock at 3:00, the flame dead centre, a fresh list of puzzles, a new start stamp from the server`,
      d.status === 'live' && d.pz !== oldPz && Math.abs(d.startAt - Date.now()) < 9000 && [a, l].every(x => x.pane && x.count && !x.end && x.timer === '⏱ 3:00' && x.p === 0.5 && x.id === d.pz.slice(0, 5)),
      { status: d.status, fresh: d.pz !== oldPz, timers: [a.timer, l.timer], ends: [a.end, l.end], ids: [a.id, l.id, d.pz.slice(0, 5)] });
    return d;
  };
  // Seeded: the clock is moved to its end instead of being waited out.
  const runOutClock = async () => {
    await seed(`pulso/${AB}`, { startAt: new Date(Date.now() - 186e3) }, true);
    await Promise.all([ana, luis].map(t => t.until('the result screen', RESULT, 30000)));
    return stored(`pulso/${AB}`);
  };
  const boardsOpen = () => Promise.all([ana, luis].map(t => t.until('the boards opening', `!__t.vis('#pulso-countdown') && __t.M.game.board.interactive`, 12000)));
  // A match with nobody moving, ended on the clock: the flame dead centre,
  // the same mistakes — a draw. `tally` is [Ana's wins, Luis's].
  const drawn = async (tag, w, tally, draws) => {
    const de = await runOutClock();
    check(`[${tag}] the clock runs out (seeded) with the flame dead centre and no mistakes on either side: stored done, reason time, winner "draw", the draws counter ${draws}, the wins untouched`,
      de.status === 'done' && de.reason === 'time' && de.winner === 'draw' && de.dr === draws && de.aW === tally[0] && de.bW === tally[1], de);
    await resultOn(tag, 'a draw', ana, w, { title: w.draw, my: score(w.you, 0, 0), their: score('Luis', 0, 0), tally: w.line(tally[0], 'Luis', tally[1]), p: 0.5 });
    await resultOn(tag, 'a draw', luis, w, { title: w.draw, my: score(w.you, 0, 0), their: score('Ana', 0, 0), tally: w.line(tally[1], 'Ana', tally[0]), p: 0.5 });
    await ana.shot(`${tag}-result-draw`);
  };

  // What a match must not touch, and the one thing it may.
  const stats = tab => tab.ev(`const d = __t.db; return { streak: __t.app.Streak.count, badge: __t.txt('#streak-badge span'),
    elo: await d.kvGet('puzzleElo', 1200), rush: await d.kvGet('rushBestScore', 0), r180: await d.kvGet('rushBest180', 0), r300: await d.kvGet('rushBest300', 0),
    badges: Object.keys(await d.kvGet('earnedBadges', {})).sort() };`);
  const plainAgain = tab => tab.until('a plain Revancha again', `!document.getElementById('pulso-rematch').classList.contains('wants')`, 6000);
  // A friend's public profile, reached from the Friends list. SEEDED: the
  // Friends screen is opened by a call; the row is really tapped.
  const profileOf = async (tab, row, name) => {
    await tab.ev(`__t.F.open();`);
    await tab.until('the friends list', `__t.app.activeScreen === 'friends' && document.querySelectorAll('#friends-list .fr-row').length >= ${row}`, 12000);
    await tab.tap(`#friends-list .fr-row:nth-child(${row}) .fr-name`);
    await tab.until('the profile', `__t.app.activeScreen === 'public-profile' && __t.txt('#pubprofile-name') === '${name}'`, 12000);
    await sleep(400);
    return tab.ev(`return { line: __t.vis('#pubprofile-pulso') ? __t.txt('#pubprofile-pulso') : '', raw: __t.txt('#pubprofile-pulso'), matches: __t.P.matches.length,
      listeners: window.__listeners, ever: window.__listenersEver, fits: document.documentElement.scrollWidth <= innerWidth };`);
  };

  // From Accept to a match under way: the countdown, three solves by Ana (the
  // third on the streak pull), and Luis quiet long enough for the note.
  const opening = async (tag, w) => {
    const d = await stored(`pulso/${AB}`);
    const ids = d.pz.match(/.{5}/g);
    let [a, l] = await both();
    check(`[${tag}] Accept: BOTH phones are on the match (Luis pulled there from Analysis), the banner gone, stored live with the server's stamp`,
      a.pane && l.pane && !(await luis.see()).banner && d.status === 'live' && Math.abs(d.startAt - Date.now()) < 8000, { status: d.status });
    await Promise.all([ana, luis].map(t => t.until('puzzle 1 under the countdown', `__t.M.list && __t.M.game.current && __t.vis('#pulso-countdown') && __t.fb.pulsoClockOffset() !== null`, 6000)));
    [a, l] = await both();
    check(`[${tag}] countdown on both phones: a number over a frozen board that already shows puzzle 1 of the stored list, "${w.getReady}", the clock at 3:00, the flame dead centre`,
      [a, l].every(g => g.count && /^[1-5]$/.test(g.label) && g.status === w.getReady && !g.free && g.id === ids[0] && g.timer === '⏱ 3:00' && g.p === 0.5 && Math.abs(g.flame - 0.5) < 0.02),
      { labels: [a.label, l.label], puzzle: [a.id, l.id, ids[0]], timer: [a.timer, l.timer] });
    check(`[${tag}] both phones have measured the server's clock and agree on it to within half a second`,
      Math.abs(a.now - l.now) < 500, { anaOffset: Math.round(a.offset), luisOffset: Math.round(l.offset), apartMs: Math.round(a.now - l.now) });
    await ana.shot(`${tag}-countdown`);
    await Promise.all([ana, luis].map(t => t.until('the boards opening', `!__t.vis('#pulso-countdown') && __t.M.game.board.interactive`, 9000)));
    const playT0 = Date.now();
    [a, l] = await both();
    check(`[${tag}] the boards open on both phones, no earlier than startAt + 6 s by the server's clock, and the status line is the puzzle's own`,
      a.now - d.startAt >= 6000 && l.now - d.startAt >= 6000 && a.now - d.startAt < 9500 && a.free && l.free && a.status !== w.getReady && !!a.status, [a.now - d.startAt, l.now - d.startAt, a.status]);

    const p1 = await ana.solve();
    check(`[${tag}] Ana solves puzzle 1 (real taps): her flame goes one step to HER end, the right — "${w.you} · 1 ✓"`, await barAt(ana, 1) && (await ana.game()).my === `${w.you} · 1 ✓`);
    check(`[${tag}] …and on Luis's phone the same flame goes one step LEFT, to Ana's end — "Ana · 1 ✓"`, await barAt(luis, -1) && (await luis.game()).their === 'Ana · 1 ✓');
    const p2 = await ana.solve();
    await luis.until('the flame grown', `document.getElementById('pulso-bar').classList.contains('hot-them')`, 5000);
    await ana.until('the streak', `__t.vis('#pulso-streak')`, 5000);
    [a, l] = await both();
    check(`[${tag}] two in a row: "${w.streak}" on Ana's phone, the flame grown on her side on both phones`,
      a.streak === w.streak && a.hotMe && !a.hotThem && l.hotThem && !l.hotMe && !l.streak, { ana: [a.streak, a.hotMe], luis: [l.hotThem, l.streak] });
    const p3 = await ana.solve();
    const d3 = await storedUntil(x => x.aS === 3);
    check(`[${tag}] the third solve pulls 2: stored aS 3, aK 3, aP 4, and nothing of Luis's has moved`,
      d3.aS === 3 && d3.aM === 0 && d3.aK === 3 && d3.aP === 4 && d3.bS === 0 && d3.bM === 0 && d3.bK === 0 && d3.bP === 0, d3);
    check(`[${tag}] the flame stands 4 steps off centre on both phones — right on Ana's, left on Luis's`, await barAt(ana, 4) && await barAt(luis, -4));
    await ana.until('puzzle 4', `__t.M.game.current && __t.M.game.current.id === '${ids[3]}'`, 4000).catch(() => {});
    check(`[${tag}] the puzzles came in the order of the stored list`, p1.id === ids[0] && p2.id === ids[1] && p3.id === ids[2] && (await ana.game()).id === ids[3], [p1.id, p2.id, p3.id, ids.slice(0, 4)]);
    [a, l] = await both();
    check(`[${tag}] at 375 px the whole match, Leave included, is on screen without scrolling on both phones`, a.fits && l.fits && a.leave && l.leave);
    await ana.shot(`${tag}-streak`);
    await luis.shot(`${tag}-behind`);
    // Kael: what the app would say on its own is dropped during a match.
    const kael = await ana.ev(`
      const K = __t.app.KaelQuotes, up = () => document.getElementById('kael-bubble').classList.contains('show');
      K.show({ text: 'a mission reminder' }); const during = up();
      return { during };`);
    check(`[${tag}] Kael keeps quiet during the match: a bubble the app tries to show does not appear`, kael.during === false, kael);

    await ana.until('the note', `__t.vis('#pulso-quiet')`, 30000);
    const waited = Date.now() - playT0;
    [a, l] = await both();
    check(`[${tag}] Luis has not moved for 20 seconds (really waited: ${(waited / 1000).toFixed(1)} s from the boards opening): "${w.quiet}" under his name on Ana's phone, and play carries on`,
      a.quiet === w.quiet && waited >= 19000 && waited < 27000 && a.live && a.free && !l.quiet, { quiet: a.quiet, waited });
    await ana.shot(`${tag}-no-signal`);
    return { ids, startAt: d.startAt };
  };

  const byPull = async (tag, w, { ids, startAt, stats0, lang, scheme }) => {
    console.log('A mistake on each side, then Ana pulls the whole bar');
    let a, l;
    const miss = await luis.miss();
    const dm = await storedUntil(x => x.bM === 1);
    check('Luis plays a wrong move (real taps): stored bM 1, bK 0, bP −1, bS 0 — and there are no strikes anywhere on the match',
      dm.bM === 1 && dm.bK === 0 && dm.bP === -1 && dm.bS === 0 && !(await luis.ev(`return !!document.querySelector('#pulso-game .rush-strike')`)), dm);
    await ana.until('the note gone', `!__t.vis('#pulso-quiet')`, 4000);
    check('…the "Sin señal" note leaves Ana\'s phone as soon as his numbers move, and her flame is at 5', await barAt(ana, 5));
    await luis.until('the next puzzle', `__t.M.game.current && __t.M.game.current.id !== '${miss.id}'`, 4000);
    const pause = Date.now() - miss.t0;
    l = await luis.game();
    check('after the same 1.2-second pause as Rush, Luis is on puzzle 2 — the SAME puzzle 2 Ana had', pause >= 1100 && pause < 2300 && l.id === ids[1] && miss.id === ids[0], { pause, id: l.id });
    await luis.solve();
    check('Luis solves it: the flame comes one step back toward him on both phones', await barAt(luis, -4) && await barAt(ana, 4));
    await ana.miss();
    const da = await storedUntil(x => x.aM === 1);
    await ana.until('the streak gone', `!__t.vis('#pulso-streak')`, 4000);
    a = await ana.game();
    check('Ana plays a wrong move: she gives back 1 and her streak ends — "¡Racha! ×2" gone, the flame back to its size',
      da.aM === 1 && da.aK === 0 && da.aP === 3 && !a.streak && !a.hotMe && await barAt(ana, 3), da);
    let n = 0;
    for (; n < 12 && await ana.ev(`const m = __t.M.match(); return m.aP - m.bP < 10;`); n++) await ana.solve();
    await Promise.all([ana, luis].map(t => t.until('the ending', `__t.vis('#pulso-end')`, 10000)));
    const wonAfter = Date.now() - startAt - 6000;
    [a, l] = await both();
    const de = await stored(`pulso/${AB}`);
    check(`Ana pulls the whole bar (${n} more solves, real taps): BOTH phones show the ending — "${w.wonPull}" on hers, "${w.lostPull}" on his`, a.end === w.wonPull && l.end === w.lostPull, [a.end, l.end]);
    check('stored: done, winner Ana, reason pull, the tally 4-2 (it was 3-2), and a difference of at least 10',
      de.status === 'done' && de.winner === ALICE && de.reason === 'pull' && de.aW === 4 && de.bW === 2 && de.dr === 0 && de.aP - de.bP >= 10, de);
    check('both boards are frozen, the flame is at Ana\'s end on both phones, Leave is gone and Back is there',
      !a.free && !l.free && !a.live && !l.live && !a.leave && !l.leave && a.p === 1 && l.p === 0 && !a.streak);
    console.log('The result screen');
    const N = de.aS;
    const ra = await resultOn(tag, 'won by pulling the whole bar', ana, w, { title: w.wonPull, sub: w.sub, my: score(w.you, N, 1), their: score('Luis', 1, 1), tally: w.line(4, 'Luis', 2), p: 1 });
    await resultOn(tag, 'lost by pull', luis, w, { title: w.lostPull, my: score(w.you, 1, 1), their: score('Ana', N, 1), tally: w.line(2, 'Ana', 4), p: 0 });
    const tm = w.sub.exec(ra.sub), said = tm ? tm[1] * 60 + +tm[2] : NaN;
    check(`the time in "${ra.sub}" is the play time Ana's phone measured: ${said} s said, ${(wonAfter / 1000).toFixed(1)} s on this tool's own watch from startAt + 6 s to seeing the ending`,
      said > 0 && Math.abs(said - wonAfter / 1000) < 6, { said, wonAfter });
    await ana.shot(`${tag}-result-won`);
    await luis.shot(`${tag}-result-lost`);

    await sleep(900);      // past the 400 ms after which a new streak flame is announced
    const s1 = await Promise.all([ana, luis].map(stats)), ka = await ana.result(), kl = await luis.result();
    check(`the daily streak: Ana solved ${N} (3 or more) and her streak went ${stats0[0].streak} → ${s1[0].streak}, the flame in her header reads ${s1[0].badge}; Luis solved 1 and his stayed at ${s1[1].streak}`,
      stats0[0].streak === 0 && s1[0].streak === 1 && s1[0].badge === '1' && ka.credited && stats0[1].streak === 0 && s1[1].streak === 0 && !kl.credited, { before: stats0.map(x => x.streak), after: s1.map(x => x.streak) });
    const untouched = (x, y) => x.elo === y.elo && x.rush === y.rush && x.r180 === y.r180 && x.r300 === y.r300;
    check('…and nothing else of either player moved: puzzle ELO and the Rush best scores are what they were before the match',
      untouched(stats0[0], s1[0]) && untouched(stats0[1], s1[1]), { before: stats0, after: s1 });
    const kael = await ana.ev(`__t.app.KaelQuotes.show({ text: 'a mission reminder' }); return document.getElementById('kael-bubble').classList.contains('show');`);
    check('Kael says nothing over the result screen: the new-flame announcement Ana\'s streak has just earned was dropped, and a bubble the app tries to show does not appear',
      !ka.kael && kael === false && ka.id === AB, { showing: ka.kael, tried: kael });

    await ana.ev(`window.__shared = null; navigator.canShare = () => true; navigator.share = async d => { window.__shared = { files: (d.files || []).map(f => [f.name, f.type, f.size]) }; };`);
    await ana.tap('#pulso-share');
    await ana.until('the share sheet', `window.__shared`, 6000);
    const shared = await ana.ev(`return window.__shared`), card = await ana.ev(`return __t.M.card()`);
    check(`📤 (real tap) hands the share sheet one picture, pulso.png, and the card it was drawn from is ⚔ · "${w.wonPull}" · "Pulso · ${N}–1"`,
      shared.files.length === 1 && shared.files[0][0] === 'pulso.png' && shared.files[0][1] === 'image/png' && shared.files[0][2] > 8000
      && card.emoji === '⚔' && card.title === w.wonPull && card.subtitle === `Pulso · ${N}–1`, { shared, card });

    console.log('Rematch: Ana asks, Luis takes it — and that match ends level on the bar');
    let pz = await askRematch(tag, w, ana, luis, { shots: true });
    await takeRematch(tag, w, luis, pz);
    await boardsOpen();
    await ana.solve();
    await ana.miss();
    await storedUntil(x => x.aM === 1);
    const dx = await runOutClock();
    check('Ana solved one and gave it back with a mistake; the clock runs out (seeded) with the flame dead centre: stored done, reason time, winner LUIS on fewer mistakes, the tally 4-3',
      dx.status === 'done' && dx.reason === 'time' && dx.winner === BOB && dx.aP === 0 && dx.bP === 0 && dx.aM === 1 && dx.bM === 0 && dx.aW === 4 && dx.bW === 3 && dx.dr === 0, dx);
    const rx = await resultOn(tag, 'lost on fewer mistakes', ana, w, { title: w.lostErrors('Luis'), my: score(w.you, 1, 1), their: score('Luis', 0, 0), tally: w.line(4, 'Luis', 3), p: 0.5 });
    const rl = await resultOn(tag, 'won on fewer mistakes', luis, w, { title: w.wonErrors, my: score(w.you, 0, 0), their: score('Ana', 1, 1), tally: w.line(3, 'Ana', 4), p: 0.5 });
    check('…and a match with fewer than 3 solves does not count toward the streak: Luis, who has now won one, still has none, and this match was not counted for Ana either',
      rl.streak === 0 && !rl.credited && !rx.credited && rx.streak === 1, { luis: [rl.streak, rl.credited], ana: [rx.streak, rx.credited] });
    await ana.shot(`${tag}-result-lost-on-mistakes`);
    await luis.shot(`${tag}-result-won-on-mistakes`);

    console.log('Rematch: Luis asks, Ana takes it — a draw');
    pz = await askRematch(tag, w, luis, ana);
    await takeRematch(tag, w, ana, pz);
    await drawn(tag, w, [4, 3], 1);

    console.log('A rematch taken back, one that runs out, one refused');
    await askRematch(tag, w, ana, luis);
    await ana.tap('#pulso-rematch-cancel');
    await plainAgain(luis);
    await ana.until('asking again', `__t.txt('#pulso-rematch') === ${JSON.stringify(w.rematch)} && !document.getElementById('pulso-rematch').disabled`);
    const dc = await storedUntil(x => x.status === 'idle');
    let xa = await ana.result(), xl = await luis.result();
    check('Ana taps Cancel under her rematch: stored idle; both result screens are back to a plain, live "⚔ Revancha" and neither is told anything',
      dc.status === 'idle' && [xa, xl].every(r => r.up && r.btn === w.rematch && !r.gold && !r.off && !r.cancel && !r.note && !r.banner), { status: dc.status, ana: xa.btn, luis: xl.btn });

    await askRematch(tag, w, ana, luis);
    await seed(`pulso/${AB}`, { invitedAt: new Date(Date.now() - 6 * 60e3) }, true);
    await ana.until('told', `__t.vis('#pulso-rematch-note')`, 6000);
    await plainAgain(luis);
    xa = await ana.result(); xl = await luis.result();
    check(`a rematch 6 minutes old (seeded): Ana's result screen says "${w.noAnswerBy('Luis')}" and her button asks again; Luis's gold button is a plain Revancha again, with no banner; nothing was written for it`,
      xa.up && xa.note === w.noAnswerBy('Luis') && xa.btn === w.rematch && !xa.off && !xa.cancel && xl.up && xl.btn === w.rematch && !xl.gold && !xl.banner
      && (await stored(`pulso/${AB}`)).status === 'invited', { note: xa.note, ana: xa.btn, luis: xl.btn });
    await ana.shot(`${tag}-rematch-no-answer`);

    await askRematch(tag, w, ana, luis);       // over the run-out one: the rules take it
    await luis.tap('#pulso-end-back');
    await luis.until('the banner', `__t.vis('#pulso-lobby') && __t.vis('#pulso-banner') && __t.txt('#pulso-banner-who') === ${JSON.stringify(w.inviteBy('Ana'))}`, 6000);
    check('Luis taps Volver with Ana\'s rematch still open: he is in the lobby, and now it reaches him as the ordinary banner', (await luis.see()).lobby);
    await luis.shot(`${tag}-rematch-as-banner`);
    await luis.tap('#pulso-decline');
    await ana.until('told', `__t.vis('#pulso-rematch-note') && __t.txt('#pulso-rematch-note') === ${JSON.stringify(w.declinedBy('Luis'))}`, 6000);
    xa = await ana.result();
    check(`…he taps "Ahora no": Ana's result screen says "${w.declinedBy('Luis')}", her button asks again, stored idle`,
      xa.up && xa.btn === w.rematch && !xa.off && !xa.cancel && (await stored(`pulso/${AB}`)).status === 'idle', { note: xa.note, btn: xa.btn });
    await ana.shot(`${tag}-rematch-declined`);
    await ana.tap('#pulso-end-back');
    await ana.until('the lobby', `__t.vis('#pulso-lobby')`);
    await ana.until('the new tally', `__t.rows()[1] && __t.rows()[1].tally === ${JSON.stringify(w.row(4, 3))}`, 4000).catch(() => {});
    a = await ana.see();
    const ll = await luis.see();
    check('"Volver" is the lobby on both phones — not the waiting screen saying "said not now" a second time; Ana\'s row for Luis reads the new tally; still one listener each',
      a.lobby && !a.game && !a.waiting && ll.lobby && a.rows[1].tally === w.row(4, 3) && a.listeners === 1 && ll.listeners === 1, a.rows);

    console.log('The tally on the public profile');
    const pa = await profileOf(ana, 2, 'Luis');
    await ana.shot(`${tag}-profile-tally`);
    const pl = await profileOf(luis, 1, 'Ana');
    check(`Ana opens Luis's public profile (real tap on his row in Friends): "${w.line(4, 'Luis', 3)}"; Luis opens Ana's: "${w.line(3, 'Ana', 4)}" — each from the listener already running (still one, and only one ever opened)`,
      pa.line === w.line(4, 'Luis', 3) && pl.line === w.line(3, 'Ana', 4) && pa.listeners === 1 && pl.listeners === 1 && pa.ever === 1 && pa.fits && pl.fits, { ana: pa, luis: pl });
    const pc0 = await profileOf(ana, 1, 'Carolina');
    check('Ana opens Carolina\'s profile — a friend she has never played: no Pulso line', pc0.line === '' && pc0.raw === '', pc0);
    const carol = await openTab('carol', '127.0.0.2', CAROL);
    await carol.load(lang, scheme);
    const pc = await profileOf(carol, 1, 'Ana');
    check('Carolina — Ana\'s friend, on a third phone — opens Ana\'s public profile: NO Pulso line, and her own listener, under the real rules, was handed no match document at all',
      pc.line === '' && pc.raw === '' && pc.matches === 0 && pc.listeners === 1, pc);
    await carol.shot(`${tag}-profile-seen-by-carolina`);
    await carol.send('Page.close').catch(() => {});
    await luis.ev(`__t.app.showScreen('analysis');`);
    await openPulso(ana);
  };

  const cutOff = async (tag, w, { startAt }) => {
    console.log('Luis is cut off; the clock ends it (the whole 3 minutes are waited)');
    let a, l;
    await luis.offline(true);
    await luis.until('no connection', `!navigator.onLine`);
    await luis.solve();
    await sleep(600);
    l = await luis.game();
    const dq = await stored(`pulso/${AB}`);
    check(`[${tag}] Luis, with no connection, still solves a puzzle: his board carries on and his own flame moves, but nothing has reached the server`,
      l.at === 1 && l.live && Math.abs(l.p - 0.35) < 0.001 && dq.bS === 0 && dq.status === 'live', { at: l.at, p: l.p, bS: dq.bS });
    await ana.until('the last ten seconds', `document.getElementById('pulso-timer').classList.contains('danger')`, 200000);
    a = await ana.game();
    check(`[${tag}] the last 10 seconds: Ana's clock turns to the danger colour`, a.danger && /^⏱ 0:(10|0\d)$/.test(a.timer), a.timer);
    await ana.shot(`${tag}-last-seconds`);
    await ana.until('time up', `__t.txt('#pulso-status') === ${JSON.stringify(w.timeUp)}`, 15000);
    a = await ana.game();
    check(`[${tag}] at 0:00 Ana's board stops — "${w.timeUp}" — and waits out the 3 seconds of grace`, a.timer === '⏱ 0:00' && !a.free && !a.live && !a.end, a.timer);
    await ana.until('the ending', `__t.vis('#pulso-end')`, 15000);
    const after = Date.now() - startAt;
    const de = await stored(`pulso/${AB}`);
    a = await ana.game();
    check(`[${tag}] the clock ended it from Ana's phone alone, ${(after / 1000).toFixed(1)} s after the start, all of it really waited: stored done, reason time, winner Ana, tally 4-2 — and Luis's solve is not in it`,
      de.status === 'done' && de.reason === 'time' && de.winner === ALICE && de.aW === 4 && de.bS === 0 && after >= 189000 && after < 196000 && a.end === w.wonTime, { after, end: a.end, de });
    await ana.shot(`${tag}-ended-on-time`);
    l = await luis.game();
    check(`[${tag}] Luis, still cut off: his board stopped on the clock too, and he is NOT shown a result his phone could only guess`,
      l.pane && l.status === w.timeUp && l.timer === '⏱ 0:00' && !l.free && !l.end, { status: l.status, end: l.end });
    await luis.shot(`${tag}-cut-off`);
    await sleep(8000);     // past startAt + 196 s, where a match nobody closed may be challenged over
    check(`[${tag}] …and he is still on that screen 8 seconds later, not dropped into the lobby`, (await luis.game()).pane);
    await luis.offline(false);
    await luis.until('the ending', `__t.vis('#pulso-end')`, 40000);
    l = await luis.game();
    const dz = await stored(`pulso/${AB}`);
    check(`[${tag}] back online: Luis is told "${w.lostTime}"; the solve he made cut off arrived too late and the rules refused it (stored bS still 0)`,
      l.end === w.lostTime && dz.bS === 0 && dz.status === 'done' && dz.winner === ALICE, { end: l.end, bS: dz.bS });
    await resultOn(tag, 'won on the clock', ana, w, { title: w.wonTime, my: score(w.you, 3, 0), their: score('Luis', 0, 0), tally: w.line(4, 'Luis', 2), p: 0.7 });
    await resultOn(tag, 'lost on the clock', luis, w, { title: w.lostTime, my: score(w.you, 0, 0), their: score('Ana', 3, 0), tally: w.line(2, 'Ana', 4), p: 0.3 });
    await ana.shot(`${tag}-result-won-on-time`);
    await luis.shot(`${tag}-result-lost-on-time`);
    await askRematch(tag, w, luis, ana, { shots: true });
    await luis.tap('#pulso-rematch-cancel');
    await plainAgain(ana);
    await storedUntil(x => x.status === 'idle');
    await backToLobby();
  };

  const leaving = async (tag, w) => {
    console.log('Leaving: the button, the back gesture, the menu');
    let a, l;
    await luis.tap('#pulso-leave');
    await asked(luis, w);
    await luis.shot(`${tag}-leave-question`);
    await luis.tap(NO);
    await sleep(400);
    l = await luis.game();
    check(`[${tag}] Leave asks "${w.leaveQ}"; No: Luis is still playing and the match is still live`, l.pane && l.live && (await stored(`pulso/${AB}`)).status === 'live');
    await luis.ev(`history.back();`);
    await asked(luis, w);
    check(`[${tag}] the back gesture asks the same question and goes nowhere`, (await luis.see()).screen === 'pulso' && (await luis.game()).pane);
    await luis.tap(NO);
    await luis.ev(`history.back();`);
    await asked(luis, w);
    check(`[${tag}] …and a second back gesture asks again: the first did not use up the way back`, (await luis.see()).screen === 'pulso');
    await luis.tap(NO);
    await luis.tap('#tabmenu-btn');
    await luis.tap('#tabbar button[data-screen="analysis"]');
    await asked(luis, w);
    check(`[${tag}] another tab from the menu asks too, with the match still on screen behind the question`, (await luis.see()).screen === 'pulso' && (await luis.game()).pane && (await stored(`pulso/${AB}`)).status === 'live');
    await luis.tap(YES);
    await luis.until('the tab he asked for', `__t.app.activeScreen === 'analysis'`, 4000);
    const de = await storedUntil(x => x.status === 'done');
    await ana.until('the ending', `__t.vis('#pulso-end')`, 8000);
    a = await ana.game();
    check(`[${tag}] Yes: Luis is on Analysis, his board stopped; stored done, reason left, winner Ana (the tally 4-2); Ana is told "${w.left('Luis')}" at once`,
      de.status === 'done' && de.reason === 'left' && de.winner === ALICE && de.aW === 4 && de.bW === 2 && a.end === w.left('Luis') && !a.free
      && await luis.ev(`return __t.M.id === null && !__t.M.game.running`), { end: a.end, de });
    await resultOn(tag, 'the friend left', ana, w, { title: w.left('Luis'), my: score(w.you, 3, 0), their: score('Luis', 0, 0), tally: w.line(4, 'Luis', 2), p: 0.7 });
    await ana.shot(`${tag}-result-friend-left`);

    console.log('A rematch to a friend who has left the result screen: the ordinary banner');
    const old = await stored(`pulso/${AB}`);
    await ana.tap('#pulso-rematch');
    await luis.until('the banner', `__t.vis('#pulso-banner') && __t.txt('#pulso-banner-who') === ${JSON.stringify(w.inviteBy('Ana'))}`, 8000);
    const ra = await ana.result(), ls = await luis.see();
    check(`[${tag}] Ana asks for a rematch; Luis had left for Analysis, so it reaches him there as the ordinary banner — "${w.inviteBy('Ana')}" — while Ana's result screen reads "${w.waitingFor('Luis')}" with Cancel`,
      ls.banner && ls.screen === 'analysis' && ra.up && ra.btn === w.waitingFor('Luis') && ra.off && ra.cancel, { btn: ra.btn, screen: ls.screen });
    await luis.tap('#pulso-accept');
    await Promise.all([ana, luis].map(t => t.until('the new countdown', `__t.app.activeScreen === 'pulso' && __t.vis('#pulso-countdown') && !__t.vis('#pulso-result')`, 15000)));
    const dn = await stored(`pulso/${AB}`);
    check(`[${tag}] Luis taps Accept on the banner: Ana's result screen and Luis's Analysis both give way to the new countdown, with a fresh list`,
      dn.status === 'live' && dn.pz !== old.pz && !(await luis.see()).banner, { status: dn.status });
    await drawn(tag, w, [4, 2], 1);
    await askRematch(tag, w, luis, ana, { shots: true });
    await ana.tap('#pulso-end-back');
    await ana.until('the banner', `__t.vis('#pulso-lobby') && __t.vis('#pulso-banner') && __t.txt('#pulso-banner-who') === ${JSON.stringify(w.inviteBy('Luis'))}`, 6000);
    await ana.tap('#pulso-decline');
    await luis.until('told', `__t.vis('#pulso-rematch-note') && __t.txt('#pulso-rematch-note') === ${JSON.stringify(w.declinedBy('Ana'))}`, 6000);
    const rl = await luis.result();
    check(`[${tag}] Ana taps Back instead of the gold button: the lobby, and Luis's rematch as the banner; she taps "Not now" — Luis's result screen reads "${w.declinedBy('Ana')}" and his button asks again`,
      rl.up && rl.btn === w.rematch && !rl.off && !rl.cancel && (await stored(`pulso/${AB}`)).status === 'idle', { note: rl.note, btn: rl.btn });
    await luis.shot(`${tag}-rematch-declined`);
    await backToLobby();
  };

  const reloaded = async (tag, w, { ids }) => {
    console.log('Luis\'s phone has the wrong time, and reloads the app mid-match');
    let a, l;
    await luis.solve();
    await storedUntil(x => x.bS === 1);
    await luis.load('en', 'dark');
    await luis.until('the clock measured again', `__t.fb.pulsoClockOffset() !== null`, 10000);
    const off = await luis.ev(`return __t.fb.pulsoClockOffset();`);
    check(`[${tag}] Luis reloads the app mid-match: he has sent or accepted nothing in this session, and his phone still measures the server's clock — ${Math.round(off)} ms for a phone ${SKEW / 1000} s fast`,
      Math.abs(off + SKEW) < 700 && (await luis.see()).screen === 'analysis', off);
    await luis.tap('#tabmenu-btn');
    await luis.tap('#tabbar button[data-screen="puzzles"]');
    await luis.until('the Puzzles screen', `__t.app.activeScreen === 'puzzles'`);
    await luis.tap('#screen-puzzles .puzzle-modes [data-v="pulso"]');
    await luis.until('back in the match', `__t.vis('#pulso-game') && __t.M.list && __t.M.game.current && __t.M.game.board.interactive`, 20000);
    [a, l] = await both();
    check(`[${tag}] he opens Pulso and is back in the match: on puzzle 2 of the list (solved + mistakes, from the document), no countdown, his clock within a second of Ana's, the flame where the server has it, one listener`,
      l.at === 1 && l.id === ids[1] && !l.count && Math.abs(a.now - l.now) < 500 && Math.abs(secs(a.timer) - secs(l.timer)) <= 1 && Math.abs(l.p - 0.35) < 0.001 && l.listeners === 1,
      { at: l.at, id: [l.id, ids[1]], timers: [a.timer, l.timer], apartMs: Math.round(a.now - l.now), p: l.p });
    await luis.shot(`${tag}-rejoined`);
    await luis.solve();
    const d2 = await storedUntil(x => x.bS === 2);
    check(`[${tag}] and his next solve is taken by the rules: stored bS 2, bK 2, bP 2`, d2.bS === 2 && d2.bK === 2 && d2.bP === 2, d2);

    console.log('The clock ends it with both phones online (startAt seeded 178 s back)');
    await seed(`pulso/${AB}`, { startAt: new Date(Date.now() - 178e3) }, true);
    await Promise.all([ana, luis].map(t => t.until('the ending', `__t.vis('#pulso-end')`, 30000)));
    [a, l] = await both();
    const de = await stored(`pulso/${AB}`);
    check(`[${tag}] both phones reach the end of the clock together and both try to record it: stored once — done, reason time, winner Ana, tally 4-2 — "${w.wonTime}" / "${w.lostTime}"`,
      de.status === 'done' && de.reason === 'time' && de.winner === ALICE && de.aW === 4 && de.bW === 2 && de.dr === 0 && a.end === w.wonTime && l.end === w.lostTime, { ends: [a.end, l.end], de });
    await resultOn(tag, 'won on the clock', ana, w, { title: w.wonTime, my: score(w.you, 3, 0), their: score('Luis', 2, 0), tally: w.line(4, 'Luis', 2), p: 0.6 });
    await resultOn(tag, 'lost on the clock', luis, w, { title: w.lostTime, my: score(w.you, 2, 0), their: score('Ana', 3, 0), tally: w.line(2, 'Ana', 4), p: 0.4 });
    await ana.shot(`${tag}-result-won-on-time`);
    await luis.shot(`${tag}-result-lost-on-time`);
    await backToLobby();

    console.log('A second match, left under the countdown');
    await ana.until('Luis can be challenged again', `__t.vis('#pulso-lobby') && __t.rows()[1] && !__t.rows()[1].off`, 8000);
    await ana.tap(LUIS);
    await luis.until('the banner', `__t.vis('#pulso-banner')`);
    await luis.tap('#pulso-accept');
    await Promise.all([ana, luis].map(t => t.until('the countdown', `__t.vis('#pulso-game') && __t.vis('#pulso-countdown')`, 15000)));
    const dn = await stored(`pulso/${AB}`);
    check(`[${tag}] a new challenge straight after: a fresh list of puzzles, every counter back to 0, the tally kept`,
      dn.status === 'live' && dn.pz !== ids.join('') && dn.aS + dn.aM + dn.aP + dn.bS + dn.bM + dn.bP === 0 && dn.aW === 4 && dn.bW === 2, dn);
    await ana.tap('#pulso-leave');
    await asked(ana, w);
    await ana.tap(YES);
    await Promise.all([ana, luis].map(t => t.until('the ending', `__t.vis('#pulso-end')`, 8000)));
    [a, l] = await both();
    const dl = await stored(`pulso/${AB}`);
    check(`[${tag}] Ana taps Leave under the countdown and says Yes: "${w.youLeft}" on her phone, "${w.left('Ana')}" on Luis's; stored reason left, winner Luis, tally 4-3`,
      a.end === w.youLeft && l.end === w.left('Ana') && dl.status === 'done' && dl.reason === 'left' && dl.winner === BOB && dl.aW === 4 && dl.bW === 3 && !a.count && !l.count, { ends: [a.end, l.end], dl });
    await resultOn(tag, 'you left', ana, w, { title: w.youLeft, my: score(w.you, 0, 0), their: score('Luis', 0, 0), tally: w.line(4, 'Luis', 3), p: 0.5 });
    await resultOn(tag, 'the friend left', luis, w, { title: w.left('Ana'), my: score(w.you, 0, 0), their: score('Ana', 0, 0), tally: w.line(3, 'Ana', 4), p: 0.5 });
    await ana.shot(`${tag}-result-you-left`);
    await luis.shot(`${tag}-result-friend-left`);
    const pz = await askRematch(tag, w, luis, ana, { shots: true });
    await takeRematch(tag, w, ana, pz);
    await drawn(tag, w, [4, 3], 1);
    await backToLobby();
  };

  for (const [lang, scheme] of [['es', 'light'], ['es', 'dark'], ['en', 'light'], ['en', 'dark']]) {
    const tag = `${lang}-${scheme}`, w = T[lang];
    console.log(`\n── ${lang.toUpperCase()}, ${scheme}, 375 px ──`);
    await seed(`pulso/${AB}`, matchDoc({}));
    // The last combination puts Luis's phone 7 seconds fast, to show that
    // neither the countdown nor the clock is read off the phone.
    if (tag === 'en-dark') await luis.send('Page.addScriptToEvaluateOnNewDocument', { source: `{ const now = Date.now.bind(Date); Date.now = () => now() + ${SKEW}; }` });
    await ana.load(lang, scheme); await luis.load(lang, scheme);
    let a, l;

    console.log('Opening Pulso');
    await openPulso(ana);
    a = await ana.see();
    check(`[${tag}] ☰ → Puzzles → the Pulso chip opens the lobby`, a.screen === 'pulso' && a.lobby && !a.waiting && !a.game);
    check(`[${tag}] lobby: two friends, Luis with the tally from the match document, Carolina with none`,
      a.rows.length === 2 && a.rows[0].name === 'Carolina' && a.rows[0].tally === '—' && a.rows[1].name === 'Luis' && a.rows[1].tally === w.tally, a.rows);
    check(`[${tag}] both Challenge buttons are live once the six puzzle files are in`, a.rows.every(r => r.btn === w.challenge && !r.off));
    check(`[${tag}] the lit chip is Pulso on every strip`, await ana.ev(`return [...document.querySelectorAll('.puzzle-modes')].every(s => s.querySelector('.on').dataset.v === 'pulso')`));
    await ana.shot(`${tag}-lobby`);

    if (tag === 'es-light') {
      await ana.tap('#screen-pulso .puzzle-modes [data-v="rush"]');
      await ana.until('Rush', `__t.app.activeScreen === 'rush'`);
      await ana.tap('#rush-intro .puzzle-modes [data-v="pulso"]');
      await ana.until('Pulso', `__t.app.activeScreen === 'pulso'`);
      check('the Pulso chip on the RUSH strip opens the lobby', (await ana.see()).lobby);
      await ana.tap('#screen-pulso .puzzle-modes [data-v="blind"]');
      await ana.until('Blindfold', `__t.app.activeScreen === 'blind'`);
      await ana.tap('#screen-blind .puzzle-modes [data-v="pulso"]');
      await ana.until('Pulso', `__t.app.activeScreen === 'pulso'`);
      check('the Pulso chip on the BLINDFOLD strip opens the lobby', (await ana.see()).lobby);
      check('after all that walking about: still exactly one listener, and only one was ever opened',
        await ana.ev(`return window.__listeners === 1 && window.__listenersEver === 1`), await ana.ev(`return [window.__listeners, window.__listenersEver]`));
    }

    console.log('Challenge → banner → accept');
    const stats0 = await Promise.all([ana, luis].map(stats));
    l = await luis.see();
    check(`[${tag}] before any challenge Luis has no banner`, !l.banner && l.screen === 'analysis');
    await ana.tap(LUIS);
    await ana.until('the waiting screen', `__t.vis('#pulso-waiting')`);
    await ana.until('the invitation confirmed', `__t.P.matches.some(m => m.status === 'invited' && !m.pending)`);
    a = await ana.see();
    check(`[${tag}] Ana: the waiting screen, counting down from 5 minutes`, a.waiting && !a.lobby && a.title === w.waiting && /^(5:00|4:5\d)$/.test(a.clock), { title: a.title, clock: a.clock });
    const d0 = await stored(`pulso/${AB}`);
    check(`[${tag}] stored: invited, host Ana, a 300-character list, the 3-2 tally untouched`,
      d0.status === 'invited' && d0.host === ALICE && /^[A-Za-z0-9]{300}$/.test(d0.pz) && d0.pz !== PZ_OLD && d0.aW === 3 && d0.bW === 2);
    await sleep(2300);
    const later = (await ana.see()).clock;
    check(`[${tag}] the clock is running`, /^4:5\d$/.test(later), later);
    await ana.shot(`${tag}-waiting`);
    await luis.until('the banner', `__t.vis('#pulso-banner') && __t.txt('#pulso-banner-who') === ${JSON.stringify(w.invite)}`);
    l = await luis.see();
    check(`[${tag}] Luis, on the Analysis screen, gets the banner with Ana's name`, l.banner && l.screen === 'analysis' && l.bannerText === w.invite, l.bannerText);
    await luis.shot(`${tag}-banner`);

    if (tag === 'es-light') {
      await ana.ev(`window.__shared = null; navigator.share = async d => { window.__shared = d; };`);
      await ana.tap('#pulso-tell');
      const shared = await ana.ev(`return window.__shared`);
      check('"Avisarle" hands the share sheet the text from the spec, and nothing else',
        shared && shared.text === 'Te reto a un Pulso en Chess Training Center. Abre la app — tienes 5 minutos.' && Object.keys(shared).length === 1, shared);
    }

    if (tag === 'en-dark') {
      await luis.until('the clock measured', `__t.fb.pulsoClockOffset() !== null`, 10000);
      const off = await luis.ev(`return __t.fb.pulsoClockOffset();`);
      check(`[${tag}] Luis's phone runs ${SKEW / 1000} s fast: it measured the server's clock as soon as the challenge reached it, before accepting anything — ${Math.round(off)} ms`, Math.abs(off + SKEW) < 700, off);
    }

    console.log('Accept → the countdown → the match');
    await luis.tap('#pulso-accept');
    const prep = await luis.ev(`return [__t.txt('#pulso-accept'), document.getElementById('pulso-accept').disabled]`);
    await Promise.all([ana, luis].map(t => t.until('the match', `__t.app.activeScreen === 'pulso' && __t.vis('#pulso-game')`, 15000)));
    check(`[${tag}] Accept reads "${w.preparing}" and is spent while the puzzle files load; Luis had them before accepting`,
      (prep[0] === w.preparing ? prep[1] === true : true) && await luis.ev(`return __t.P.bands === 'ready'`), prep);
    const played = { ...await opening(tag, w), stats0, lang, scheme };
    if (tag === 'es-light') await byPull(tag, w, played);
    if (tag === 'es-dark') await cutOff(tag, w, played);
    if (tag === 'en-light') await leaving(tag, w, played);
    if (tag === 'en-dark') await reloaded(tag, w, played);

    if (tag === 'es-light') {
      await ana.until('Luis can be challenged again', `__t.vis('#pulso-lobby') && __t.rows()[1] && !__t.rows()[1].off`, 8000);
      console.log('Challenge → cancel');
      await ana.tap(LUIS);
      await luis.until('the banner', `__t.vis('#pulso-banner')`);
      await ana.until('confirmed', `__t.P.matches.some(m => m.status === 'invited' && !m.pending)`);
      await ana.tap('#pulso-cancel');
      await luis.until('the banner gone', `!__t.vis('#pulso-banner')`);
      await ana.until('the lobby', `__t.vis('#pulso-lobby')`);
      await sleep(600);
      a = await ana.see();
      check('Ana cancels: she is back in the lobby (not told "said not now"), Luis\'s banner is gone, stored idle',
        a.lobby && !a.waiting && !(await luis.see()).banner && (await stored(`pulso/${AB}`)).status === 'idle', a.title);
      check('…and Luis can be challenged again straight away', !a.rows[1].off);

      console.log('Challenge → decline → challenge again');
      await ana.tap(LUIS);
      await luis.until('the banner', `__t.vis('#pulso-banner')`);
      await luis.tap('#pulso-decline');
      await ana.until('told', `__t.txt('#pulso-wait-title') === ${JSON.stringify(w.declined)}`);
      a = await ana.see();
      check('Luis taps "Ahora no": his banner goes, Ana is told so and offered "Retar otra vez", stored idle',
        a.waiting && a.title === w.declined && !(await luis.see()).banner && await ana.ev(`return __t.vis('#pulso-again') && !__t.vis('#pulso-cancel') && !__t.vis('#pulso-wait-clock')`)
        && (await stored(`pulso/${AB}`)).status === 'idle', a.title);
      await ana.shot(`${tag}-declined`);
      await ana.tap('#pulso-again');
      await luis.until('the banner again', `__t.vis('#pulso-banner')`);
      await ana.until('waiting again', `__t.txt('#pulso-wait-title') === ${JSON.stringify(w.waiting)}`);
      check('"Retar otra vez" sends a new challenge: Ana is waiting again, Luis has the banner again', (await stored(`pulso/${AB}`)).status === 'invited');

      console.log('An invitation that runs out');
      await ana.until('confirmed', `__t.P.matches.some(m => m.status === 'invited' && !m.pending)`);
      await seed(`pulso/${AB}`, { invitedAt: new Date(Date.now() - 6 * 60e3) }, true);
      await luis.until('the banner gone', `!__t.vis('#pulso-banner')`, 5000);
      await ana.until('told', `__t.txt('#pulso-wait-title') === ${JSON.stringify(w.noAnswer)}`, 5000);
      a = await ana.see();
      check('6 minutes old (seeded): Luis\'s banner disappears, Ana reads "Luis no respondió" with "Retar otra vez"',
        a.title === w.noAnswer && !(await luis.see()).banner && await ana.ev(`return __t.vis('#pulso-again') && __t.vis('#pulso-wait-back')`), a.title);
      check('…and nothing was written for it: the stale invitation is simply ignored', (await stored(`pulso/${AB}`)).status === 'invited');
      await ana.shot(`${tag}-expired`);
      await ana.tap('#pulso-again');
      await luis.until('a fresh banner', `__t.vis('#pulso-banner')`);
      const d2 = await stored(`pulso/${AB}`);
      check('"Retar otra vez" over the run-out invitation is accepted by the rules: a fresh stamp', d2.status === 'invited' && Math.abs(d2.invitedAt - Date.now()) < 8000);
      await ana.until('confirmed', `__t.P.matches.some(m => m.status === 'invited' && !m.pending)`);
      await ana.tap('#pulso-cancel');
      await luis.until('the banner gone', `!__t.vis('#pulso-banner')`);
      // A phone that opens the app with a run-out invitation already waiting.
      await seed(`pulso/${AB}`, matchDoc({ status: 'invited', invitedAt: new Date(Date.now() - 6 * 60e3), startAt: null, winner: null, reason: null }));
      await luis.load(lang, scheme);
      await sleep(1500);
      check('Luis opens the app on a run-out invitation: no banner', !(await luis.see()).banner);
      await reset();

      console.log('Never over a Rush run');
      await luis.tap('#tabmenu-btn');
      await luis.tap('#tabbar button[data-screen="puzzles"]');
      await luis.tap('#screen-puzzles .puzzle-modes [data-v="rush"]');
      await luis.tap('#rush-start');
      await luis.until('a Rush run', `__t.app.Rush.running`);
      await ana.until('the lobby', `__t.vis('#pulso-lobby') && !__t.rows()[1].off`);
      await ana.tap(LUIS);
      await luis.until('the invitation', `__t.P.incoming()`);
      await sleep(1300);
      l = await luis.see();
      check('…and Kael keeps quiet during the Rush run too: a bubble the app tries to show does not appear',
        await luis.ev(`__t.app.KaelQuotes.show({ text: 'a mission reminder' }); return !document.getElementById('kael-bubble').classList.contains('show') && __t.app.Rush.running`));
      check('Luis is in a Rush run: no banner over it, a gold dot on ☰ instead',
        !l.banner && l.screen === 'rush' && await luis.ev(`return document.getElementById('tabmenu-btn').classList.contains('pulso-dot') && __t.app.Rush.running`));
      await luis.ev(`__t.app.showScreen('analysis');`);   // seeded: the run is ended by leaving it
      await luis.until('the banner', `__t.vis('#pulso-banner')`, 4000);
      check('…and the banner arrives once the run is over; the dot goes', await luis.ev(`return !document.getElementById('tabmenu-btn').classList.contains('pulso-dot')`));
      await luis.tap('#pulso-decline');
      await ana.until('told', `__t.txt('#pulso-wait-title') === ${JSON.stringify(w.declined)}`);
      await ana.tap('#pulso-wait-back');
      check('"Volver" from the waiting screen is the lobby', (await ana.see()).lobby);

      console.log('Puzzles this phone does not have');
      await seed(`pulso/${AB}`, matchDoc({ status: 'invited', invitedAt: new Date(), startAt: null, winner: null, reason: null, pz: PZ_UNKNOWN }));
      await luis.until('the banner', `__t.vis('#pulso-banner')`);
      await luis.tap('#pulso-accept');
      await luis.until('the message', `__t.vis('#toast') && __t.txt('#toast') === ${JSON.stringify(w.update)}`, 15000);
      await luis.until('the banner gone', `!__t.vis('#pulso-banner')`);
      const d3 = await stored(`pulso/${AB}`);
      check('a list with a puzzle Luis does not have: "Uno de los dos tiene que actualizar la app", declined, never accepted',
        d3.status === 'idle' && d3.startAt === null && (await luis.see()).screen === 'analysis', { status: d3.status });
      await luis.shot(`${tag}-update-needed`);

      console.log('Offline');
      await ana.offline(true);
      await ana.until('the offline lobby', `__t.vis('#pulso-note') && __t.txt('#pulso-note') === ${JSON.stringify(w.offline)}`);
      a = await ana.see();
      check('offline: the lobby says "Pulso necesita conexión", every Challenge button is off, the header shows the offline icon',
        a.note === w.offline && a.rows.length === 2 && a.rows.every(r => r.off) && await ana.ev(`return __t.vis('#offline-ico')`), a.rows);
      await ana.shot(`${tag}-offline`);
      await ana.tap(LUIS).catch(() => {});
      await sleep(400);
      check('…and tapping a dead button sends nothing', (await ana.see()).lobby && (await stored(`pulso/${AB}`)).status === 'idle');
      await ana.offline(false);
      await ana.until('back on', `!__t.vis('#pulso-note') && __t.rows().every(r => !r.off)`, 15000);
      check('back online: the buttons come back', true);

      console.log('Signing out');
      await seed(`pulso/${AB}`, matchDoc({ status: 'invited', invitedAt: new Date(), startAt: null, winner: null, reason: null, host: ALICE, pz: d0.pz }));
      await luis.until('a banner to lose', `__t.vis('#pulso-banner')`);
      await luis.ev(`await __t.fb.Auth.signOut();`);
      await luis.until('signed out', `!__t.fb.Auth.user && __t.P.uid === null`);
      l = await luis.see();
      check('sign-out stops the listener (0 open) and takes the banner with it', l.listeners === 0 && !l.banner, l.listeners);
      await luis.tap('#tabmenu-btn');
      await luis.tap('#tabbar button[data-screen="puzzles"]');
      await luis.tap('#screen-puzzles .puzzle-modes [data-v="pulso"]');
      await luis.until('the lobby', `__t.vis('#pulso-lobby')`);
      l = await luis.see();
      check('signed out: the lobby has no rows, only "Inicia sesión para retar a un amigo"',
        l.rows.length === 0 && await luis.ev(`return __t.vis('#pulso-note-btn') && __t.txt('#pulso-note-btn')`) === w.signin);
      await luis.shot(`${tag}-signed-out`);
      await reset().catch(() => {});
    }
  }
} catch (e) {
  failed = true;
  console.error('\nSTOPPED: ' + e.message);
}

const bad = checks.filter(c => !c.ok);
console.log(`\n${checks.length - bad.length} of ${checks.length} checks passed${bad.length ? ' — FAILED: ' + bad.map(c => c.name).join(' | ') : ''}`);
// While Ana's phone is "offline" every request it makes fails, and Chrome
// reports each one; those are the point of that scene. Anything else is listed.
// The 404 is sw.js, refused on purpose (see the top of this file).
const other = errors.filter(e => !/ERR_INTERNET_DISCONNECTED|Could not reach Cloud Firestore backend|bad HTTP response code \(404\) was received when fetching the script/i.test(e));
console.log(other.length ? `Console errors (${other.length}):\n  ` + [...new Set(other)].join('\n  ') : 'No console errors (other than the failed requests of the offline scene).');
console.log(`Promotions answered through userMove() rather than the picker: ${promoByCall}`);
console.log(`Screenshots: ${OUT}`);
chrome.kill();
server.close();
server2.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(failed || bad.length || other.length ? 1 : 0);
