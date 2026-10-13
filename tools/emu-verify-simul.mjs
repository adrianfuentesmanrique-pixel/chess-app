// Plays the Simul data layer — the real js/firebase.js and js/simul.js,
// unmodified — against the Firestore EMULATOR running the real firestore.rules,
// and COUNTS what it costs. Dev tool, not shipped. No screen yet: conversations
// 3 to 8 of the spec add the screens to this same tool.
//
//   node tools/emu-verify-simul.mjs      under a minute
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
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-simul-'));
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 600000).unref();

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
    export function getAuth() { return { currentUser: { uid: new URLSearchParams(location.search).get('uid') } }; }
    export function onAuthStateChanged() { return () => {}; }
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

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const serve = (req, res) => {
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
    uid, ev,
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
