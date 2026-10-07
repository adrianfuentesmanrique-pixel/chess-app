// Two phones, two friends, the WHOLE app: Pulso's lobby, challenge, waiting
// screen and incoming banner, tapped with real touch events, against the
// Firestore EMULATOR running the real firestore.rules. Dev tool, not shipped.
//
//   node tools/emu-verify-pulso-ui.mjs <outDir>     about 2 minutes; screenshots go to <outDir>
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
// REALLY TOUCHED (CDP Input.dispatchTouchEvent): ☰ and the Puzzles entry, every
// mode chip, Challenge, Tell them, Cancel, Accept, Not now, Challenge again,
// Back, Rush's Start.
// SEEDED WITH THE RULES BYPASSED ("Bearer owner"): the users, their public
// rows, the friendships, an old 3-2 tally, a 6-minute-old invitation, an
// invitation whose puzzles this app does not have, and putting a 'live' match
// back to 'done' between scenes. Every other write goes through the rules.
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
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 600000).unref();

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
        window.__t = { app, P: ui.PulsoUI, fb,
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
    see: () => ev(`return { screen: __t.app.activeScreen, lobby: __t.vis('#pulso-lobby'), waiting: __t.vis('#pulso-waiting'),
      holding: __t.vis('#pulso-holding'), banner: __t.vis('#pulso-banner'), bannerText: __t.txt('#pulso-banner-who'),
      title: __t.txt('#pulso-wait-title'), clock: __t.txt('#pulso-wait-clock'), note: __t.vis('#pulso-note') ? __t.txt('#pulso-note') : '',
      toast: __t.vis('#toast') ? __t.txt('#toast') : '', listeners: window.__listeners, rows: __t.rows() };`),
    offline: on => send('Network.emulateNetworkConditions', { offline: on, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }),
  };
  await send('Network.enable');
  return tab;
}

const T = {
  es: { challenge: 'Retar', waiting: 'Esperando a Luis…', invite: 'Ana te reta a un Pulso', noAnswer: 'Luis no respondió', declined: 'Luis dijo que ahora no',
    offline: 'Pulso necesita conexión', tally: 'Tú 3 · 2', update: 'Uno de los dos tiene que actualizar la app', signin: 'Inicia sesión para retar a un amigo', preparing: 'Preparando…' },
  en: { challenge: 'Challenge', waiting: 'Waiting for Luis…', invite: 'Ana challenges you to a Pulso', noAnswer: 'Luis did not answer', declined: 'Luis said not now',
    offline: 'Pulso needs a connection', tally: 'You 3 · 2', update: 'One of you needs to update the app', signin: 'Sign in to challenge a friend', preparing: 'Preparing…' },
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

  for (const [lang, scheme] of [['es', 'light'], ['es', 'dark'], ['en', 'light'], ['en', 'dark']]) {
    const tag = `${lang}-${scheme}`, w = T[lang];
    console.log(`\n── ${lang.toUpperCase()}, ${scheme}, 375 px ──`);
    await seed(`pulso/${AB}`, matchDoc({}));
    await ana.load(lang, scheme); await luis.load(lang, scheme);
    let a, l;

    console.log('Opening Pulso');
    await openPulso(ana);
    a = await ana.see();
    check(`[${tag}] ☰ → Puzzles → the Pulso chip opens the lobby`, a.screen === 'pulso' && a.lobby && !a.waiting && !a.holding);
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

      // Slow the puzzle files down a little so "Preparando…" can be seen.
      await luis.tap('#pulso-accept');
      const prep = await luis.ev(`return [__t.txt('#pulso-accept'), document.getElementById('pulso-accept').disabled]`);
      await Promise.all([ana, luis].map(t => t.until('the holding state', `__t.app.activeScreen === 'pulso' && __t.vis('#pulso-holding')`, 15000)));
      check('Accept reads "Preparando…" and is spent while the puzzle files load', prep[0] === w.preparing ? prep[1] === true : true, prep);
      const d = await stored(`pulso/${AB}`);
      check('stored: live, startAt stamped by the server', d.status === 'live' && Math.abs(d.startAt - Date.now()) < 8000);
      a = await ana.see(); l = await luis.see();
      check('BOTH phones are on the Pulso screen in the holding state; Luis was pulled there from Analysis; the banner is gone',
        a.holding && l.holding && !a.waiting && !l.banner && l.screen === 'pulso', { ana: a.screen, luis: l.screen });
      check('Luis loaded the puzzle files before accepting', await luis.ev(`return __t.P.bands === 'ready'`));
      await luis.shot(`${tag}-holding`);
      await reset();
      a = await ana.see();
      check('once the match is over the holding state gives way to the lobby', a.lobby && !a.holding);

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
    } else {
      await ana.tap('#pulso-cancel');
      await luis.until('the banner gone', `!__t.vis('#pulso-banner')`);
      check(`[${tag}] cancel: back to the lobby, the banner gone`, (await ana.see()).lobby);
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
console.log(`Screenshots: ${OUT}`);
chrome.kill();
server.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(failed || bad.length || other.length ? 1 : 0);
