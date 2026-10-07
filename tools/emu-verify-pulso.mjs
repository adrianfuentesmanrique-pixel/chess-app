// Plays Pulso's data layer — the real js/firebase.js, unmodified — against the
// Firestore EMULATOR running the real firestore.rules. Dev tool, not shipped.
//
//   node tools/emu-verify-pulso.mjs            everything (about 4 minutes: one
//                                              match is left to run out its clock)
//   node tools/emu-verify-pulso.mjs --quick    skips that match (about 40 s)
//
// How: it starts the emulator (firebase emulators:exec, with a Java 11+ found
// the same way tests/run-rules-tests.mjs finds it), serves the app folder, and
// opens three headless-Chrome tabs as alice, bob and carol. js/firebase.js
// cannot run under Node — it imports the browser SDK from vendor/ — so it runs
// in Chrome, and this server hands it three stand-ins for the SDK files:
//   firebase-firestore.js   the real one, but getFirestore() is pointed at the
//                           emulator and signed in as ?uid= (mockUserToken)
//   firebase-auth.js        auth.currentUser = { uid: ?uid= }, nothing else
//   firebase-app-check.js   does nothing
// Everything else, js/firebase.js included, is served exactly as it is on disk.
// alice and bob are made friends with the rules bypassed ("Bearer owner");
// every other write goes through the rules like a phone's would.
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
const QUICK = process.argv.includes('--quick');

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
      `"node tools/emu-verify-pulso.mjs --inner${QUICK ? ' --quick' : ''}"`],
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
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-pulso-'));
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 600000).unref();

const ALICE = 'alice_uid', BOB = 'bob_uid', CAROL = 'carol_uid';   // alice sorts first: she is player "a"
const AB = `${ALICE}_${BOB}`;

const SDK = '/vendor/firebase-10.14.1/';
const SHIMS = {
  [SDK + 'firebase-firestore.js']: `
    export * from './firebase-firestore.real.js';
    import { getFirestore as real, connectFirestoreEmulator } from './firebase-firestore.real.js';
    export function getFirestore(app) {
      const f = real(app);
      connectFirestoreEmulator(f, '${EMU_HOST}', ${EMU_PORT}, { mockUserToken: { sub: new URLSearchParams(location.search).get('uid') } });
      return f;
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
  '/__pulso.html': '<!doctype html><meta charset="utf-8"><title>pulso</title>',
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
  http.request(url, { method }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej).end();
});

// The emulator, with the rules bypassed.
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
async function makeFriends() {
  const r = await fetch(`${DOCS}/friendships/${AB}`, { method: 'PATCH', headers: owner, body: JSON.stringify({ fields: {
    members: { arrayValue: { values: [{ stringValue: ALICE }, { stringValue: BOB }] } },
    createdAt: { integerValue: '1755000000000' } } }) });
  if (!r.ok) throw new Error('seeding the friendship failed: ' + await r.text());
}
await fetch(`http://${EMU}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { await req(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await sleep(250); } }

const errors = [];
async function openTab(uid) {
  const target = await req(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(`http://localhost:${WEB}/__pulso.html?uid=${uid}`)}`, 'PUT');
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
    window.snaps = 0; window.list = null; window.cache = null;
    window.fb.watchPulso((list, meta) => { window.snaps++; window.list = list; window.cache = meta.fromCache; });
    // What a screen would do with a function here: the value, or the refusal.
    window.call = async (name, ...a) => { try { return { v: await window.fb[name](...a) }; } catch (e) { return { err: e.code || String(e) }; } };
    window.mine = () => (window.list || []).find(m => m.id === '${AB}') || null;`);
  const tab = {
    uid, ev,
    call: (name, ...a) => ev(`return await window.call(${JSON.stringify(name)}, ...${JSON.stringify(a)})`),
    match: () => ev(`return window.mine()`),
    // Waits for the listener to deliver a match the test is happy with.
    until: async (what, test, ms = 8000) => {
      const t0 = Date.now();
      for (;;) {
        const m = await tab.match();
        if (test(m)) return m;
        if (Date.now() - t0 > ms) throw new Error(`${uid} never saw: ${what} — last ${JSON.stringify(m)}`);
        await sleep(60);
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
const counters = m => m && [m.aS, m.aM, m.aK, m.aP, m.bS, m.bM, m.bK, m.bP];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const settled = m => m && !m.pending;

let failed = false;
try {
  const alice = await openTab(ALICE), bob = await openTab(BOB), carol = await openTab(CAROL);
  await Promise.all([alice, bob, carol].map(t => t.until('first snapshot', () => true)));
  for (let i = 0; i < 50 && !await alice.ev(`return window.snaps`); i++) await sleep(100);

  console.log('\nThe real puzzle library');
  const pz = await alice.ev(`
    const pu = await import('/js/puzzles.js'), p = await import('/js/pulso.js');
    for (const b of p.bandsNeeded()) await pu.ensureBand(b);
    const ids = p.buildList(pu.PUZZLES);
    window.pz2 = p.packIds(p.buildList(pu.PUZZLES));
    return ids && p.packIds(ids);`);
  check('alice builds a 300-character list from the real puzzle files', typeof pz === 'string' && /^[A-Za-z0-9]{300}$/.test(pz), pz && pz.slice(0, 20) + '…');
  const pz2 = await alice.ev(`return window.pz2`);
  check('a second list is a different one', pz2 && pz2 !== pz);
  const found = await bob.ev(`
    const pu = await import('/js/puzzles.js'), p = await import('/js/pulso.js');
    for (const b of p.bandsNeeded()) await pu.ensureBand(b);
    const list = p.resolveList(${JSON.stringify(pz)}, pu.PUZZLES);
    return list && { n: list.length, first: list[0].rating, last: list[59].rating,
      inBand: list.every((x, i) => p.bandOfIndex(i) === pu.bandOf(x.rating)),
      near: list.filter((x, i) => Math.abs(x.rating - p.targetRating(i)) <= 50).length };`);
  check('bob\'s phone finds all 60, each in the band its position says', found && found.n === 60 && found.inBand, found);
  check('all 60 are within 50 points of their target (no window had to widen)', found && found.near === 60, found && `${found.near}/60`);

  console.log('\nChallenge');
  let r = await alice.call('sendPulsoChallenge', BOB, pz);
  check('REFUSED BY THE RULES: a challenge between two people who are not friends', r.err === 'permission-denied', r);
  check('…and nothing was stored', await stored(`pulso/${AB}`) === null);
  await makeFriends();
  r = await alice.call('sendPulsoChallenge', BOB, 'short');
  check('a list that is not 300 characters is not even sent', r.v === false, r);
  r = await alice.call('sendPulsoChallenge', BOB, pz);
  check('alice challenges bob (first ever: the document is created)', r.v === true, r);
  let d = await stored(`pulso/${AB}`);
  check('stored: invited, host alice, all 19 fields, counters and tally at 0',
    d && d.status === 'invited' && d.host === ALICE && Object.keys(d).length === 19 && d.pz === pz
    && same(d.members, [ALICE, BOB]) && same(counters(d), [0, 0, 0, 0, 0, 0, 0, 0])
    && d.aW === 0 && d.bW === 0 && d.dr === 0 && d.startAt === null && d.winner === null && d.reason === null,
    d && { status: d.status, host: d.host, fields: Object.keys(d).length });
  check('invitedAt is the server\'s stamp', d && Math.abs(d.invitedAt - Date.now()) < 5000);
  let m = await bob.until('the challenge', x => x && x.status === 'invited');
  check('bob\'s listener delivers it: me = b, friend = alice, invitedAt in ms', m.me === 'b' && m.friend === ALICE && m.host === ALICE && m.invitedAt === d.invitedAt, { me: m.me, friend: m.friend });
  m = await alice.until('her own challenge confirmed', x => settled(x) && x.status === 'invited');
  check('alice sees it too: me = a, friend = bob', m.me === 'a' && m.friend === BOB);
  let off = await alice.ev(`return window.fb.pulsoClockOffset()`);
  check('alice measured her clock offset from the invite (same machine, so near 0)', typeof off === 'number' && Math.abs(off) < 1500, off);
  check('bob has measured nothing yet', await bob.ev(`return window.fb.pulsoClockOffset()`) === null);
  check('carol, not a member, is delivered nothing', (await carol.ev(`return window.list`)).length === 0);

  console.log('\nWrites the rules must refuse');
  r = await alice.call('acceptPulso', AB);
  check('REFUSED: the host accepting her own challenge', r.err === 'permission-denied', r);
  r = await bob.call('sendPulsoChallenge', ALICE, pz);
  check('REFUSED: a second challenge while one is waiting', r.err === 'permission-denied', r);
  r = await carol.call('cancelPulso', AB);
  check('REFUSED: a stranger cancelling it', r.err === 'permission-denied', r);
  r = await carol.call('acceptPulso', AB);
  check('REFUSED: a stranger accepting it', r.err === 'permission-denied', r);
  d = await stored(`pulso/${AB}`);
  check('after all four, the challenge is untouched', d.status === 'invited' && d.host === ALICE && d.startAt === null);

  console.log('\nCancel and decline');
  r = await alice.call('cancelPulso', AB);
  check('alice cancels', r.v === true, r);
  m = await bob.until('idle', x => x && x.status === 'idle');
  check('bob sees it go idle', m.status === 'idle');
  r = await bob.call('acceptPulso', AB);
  check('REFUSED: accepting a challenge that was cancelled', r.err === 'permission-denied', r);
  await alice.until('idle', x => settled(x) && x.status === 'idle');
  r = await bob.call('sendPulsoChallenge', ALICE, pz2);
  check('bob challenges alice (the document already exists: an update)', r.v === true, r);
  d = await stored(`pulso/${AB}`);
  check('stored: invited, host bob, the new list, still 19 fields', d.status === 'invited' && d.host === BOB && d.pz === pz2 && Object.keys(d).length === 19);
  off = await bob.ev(`return window.fb.pulsoClockOffset()`);
  check('bob measured his offset from HIS invite, not from the old stamp', typeof off === 'number' && Math.abs(off) < 1500, off);
  await alice.until('bob\'s challenge', x => x && x.status === 'invited' && x.host === BOB);
  r = await alice.call('declinePulso', AB);
  check('alice declines', r.v === true, r);
  await bob.until('idle', x => settled(x) && x.status === 'idle');
  check('stored: idle', (await stored(`pulso/${AB}`)).status === 'idle');

  // Challenge, accept, and wait out the 6-second countdown.
  async function startMatch(host, guest, list) {
    await host.until('free to challenge', x => settled(x) && x.status !== 'invited' && x.status !== 'live');
    let x = await host.call('sendPulsoChallenge', guest.uid, list);
    if (x.v !== true) throw new Error('challenge failed: ' + JSON.stringify(x));
    await guest.until('the challenge', y => y && y.status === 'invited' && y.host === host.uid);
    x = await guest.call('acceptPulso', AB);
    if (x.v !== true) throw new Error('accept failed: ' + JSON.stringify(x));
    return guest.until('live, confirmed', y => settled(y) && y.status === 'live' && y.startAt);
  }
  const countdown = async startAt => { const w = startAt + 6000 + 400 - Date.now(); if (w > 0) await sleep(w); };

  console.log('\nMatch 1: accept, moves from both, a full pull');
  m = await startMatch(alice, bob, pz);
  d = await stored(`pulso/${AB}`);
  check('bob accepts: live, startAt stamped by the server, counters still 0', d.status === 'live' && Math.abs(d.startAt - Date.now()) < 5000 && same(counters(d), [0, 0, 0, 0, 0, 0, 0, 0]));
  off = await bob.ev(`return window.fb.pulsoClockOffset()`);
  check('bob measured his offset from the accept', typeof off === 'number' && Math.abs(off) < 1500, off);
  await alice.until('live', x => x && x.status === 'live');
  r = await alice.call('pulsoMove', AB, true);
  check('REFUSED: a move during the countdown', r.err === 'permission-denied', r);
  m = await alice.until('her counters put back', x => settled(x) && x.aS === 0);
  check('…and alice\'s own copy snaps back to 0', same(counters(m), [0, 0, 0, 0, 0, 0, 0, 0]));
  r = await alice.call('finishPulso', AB);
  check('nothing to record yet: finishPulso says no without writing', r.v === false, r);
  await countdown(d.startAt);

  r = await bob.call('pulsoMove', AB, false);
  check('bob: a mistake', r.v === true, r);
  r = await bob.call('pulsoMove', AB, true);
  check('bob: a solve', r.v === true, r);
  // Five solves fired without waiting for any of them, as fast play would.
  r = await alice.ev(`return await Promise.all([1,2,3,4,5].map(() => window.call('pulsoMove', '${AB}', true)))`);
  check('alice: five solves sent back to back, all accepted', r.every(x => x.v === true), r);
  d = await stored(`pulso/${AB}`);
  check('stored: alice 5 solved, streak 5, pull 1+1+2+2+2 = 8; bob 1 solved, 1 mistake, pull 0',
    same(counters(d), [5, 0, 5, 8, 1, 1, 1, 0]), counters(d));
  m = await bob.until('alice\'s five', x => x && x.aP === 8);
  check('bob\'s listener has alice\'s moves', same(counters(m), [5, 0, 5, 8, 1, 1, 1, 0]));
  await alice.until('all confirmed', x => settled(x) && x.aP === 8 && x.bS === 1);
  r = await alice.call('finishPulso', AB);
  check('8 steps ahead is not a win: finishPulso says no', r.v === false && (await stored(`pulso/${AB}`)).status === 'live', r);
  r = await alice.call('pulsoMove', AB, true);
  check('alice: a sixth solve', r.v === true, r);
  await Promise.all([alice, bob].map(t => t.until('pull 10', x => settled(x) && x.aP === 10)));
  // Both phones see the win and both report it, as they will in play.
  const both = await Promise.all([alice.call('finishPulso', AB), bob.call('finishPulso', AB)]);
  check('both phones report the result; exactly one write is taken, the other is quietly refused',
    both.filter(x => x.v === true).length === 1 && both.filter(x => x.v === false).length === 1, both);
  d = await stored(`pulso/${AB}`);
  check('stored: done, winner alice, reason pull, tally 1-0-0, counters untouched',
    d.status === 'done' && d.winner === ALICE && d.reason === 'pull' && d.aW === 1 && d.bW === 0 && d.dr === 0
    && same(counters(d), [6, 0, 6, 10, 1, 1, 1, 0]), { status: d.status, winner: d.winner, reason: d.reason, tally: [d.aW, d.bW, d.dr] });
  r = await bob.call('pulsoMove', AB, true);
  check('no move after the result', r.v === false || r.err === 'permission-denied', r);

  console.log('\nMatch 2: a rematch, and leaving');
  m = await startMatch(bob, alice, pz2);
  d = await stored(`pulso/${AB}`);
  check('rematch: counters back to 0, result cleared, tally KEPT at 1-0-0',
    same(counters(d), [0, 0, 0, 0, 0, 0, 0, 0]) && d.winner === null && d.reason === null && d.aW === 1 && d.bW === 0 && d.dr === 0 && d.host === BOB,
    { tally: [d.aW, d.bW, d.dr] });
  await countdown(d.startAt);
  r = await alice.call('pulsoMove', AB, true);
  check('alice solves one', r.v === true, r);
  r = await alice.call('finishPulso', AB, { left: true });
  check('alice leaves', r.v === true, r);
  d = await stored(`pulso/${AB}`);
  check('stored: done, winner BOB (though alice was ahead), reason left, tally 1-1-0',
    d.status === 'done' && d.winner === BOB && d.reason === 'left' && d.aW === 1 && d.bW === 1 && d.dr === 0 && d.aP === 1,
    { winner: d.winner, reason: d.reason, tally: [d.aW, d.bW, d.dr] });
  await bob.until('done', x => x && x.status === 'done' && x.winner === BOB);

  if (!QUICK) {
    console.log('\nMatch 3: the clock decides (waits the real 3 minutes)');
    m = await startMatch(alice, bob, pz);
    d = await stored(`pulso/${AB}`);
    await countdown(d.startAt);
    // Level on the bar, 1-1; bob has made a mistake on the way there.
    for (const [tab, solved] of [[alice, true], [bob, true], [bob, false], [bob, true]]) await tab.call('pulsoMove', AB, solved);
    await Promise.all([alice, bob].map(t => t.until('level', x => settled(x) && x.aP === 1 && x.bP === 1 && x.bM === 1)));
    r = await bob.call('finishPulso', AB);
    check('level with time on the clock: nothing to record', r.v === false, r);
    const end = d.startAt + 189000;
    await sleep(Math.max(0, end - 1500 - Date.now()));
    r = await bob.call('finishPulso', AB);
    check('1.5 s before the grace ends: still nothing', r.v === false && (await stored(`pulso/${AB}`)).status === 'live', r);
    r = await alice.call('pulsoMove', AB, true);
    check('a move in the last second of grace still counts', r.v === true, r);
    await Promise.all([alice, bob].map(t => t.until('alice 2', x => settled(x) && x.aP === 2)));
    r = await alice.call('pulsoMove', AB, false);
    check('…her next one, a mistake, also lands in time', r.v === true, r);
    await Promise.all([alice, bob].map(t => t.until('level again', x => settled(x) && x.aP === 1 && x.aM === 1)));
    await sleep(Math.max(0, end + 600 - Date.now()));
    r = await alice.call('pulsoMove', AB, true);
    check('REFUSED: a move after the grace', r.err === 'permission-denied', r);
    await alice.until('snapped back', x => settled(x) && x.aP === 1);
    r = await bob.call('finishPulso', AB);
    check('time is up: bob\'s phone records it', r.v === true, r);
    d = await stored(`pulso/${AB}`);
    check('stored: level bar (1-1), level mistakes (1-1) → a draw, reason time, tally 1-1-1',
      d.status === 'done' && d.winner === 'draw' && d.reason === 'time' && d.aW === 1 && d.bW === 1 && d.dr === 1,
      { winner: d.winner, reason: d.reason, counters: counters(d), tally: [d.aW, d.bW, d.dr] });
  }

  console.log('\nThe listener');
  const n = await Promise.all([alice, bob, carol].map(t => t.ev(`return window.snaps`)));
  check('one listener each; carol\'s was only ever called with nothing', n[2] >= 1 && (await carol.ev(`return window.list`)).length === 0, { callbacks: n });
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
server.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(failed || bad.length || other.length ? 1 : 0);
