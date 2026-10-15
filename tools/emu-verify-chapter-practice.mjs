// Chapter homework in practice mode (v230). Dev tool, not shipped.
//
//   node tools/emu-verify-chapter-practice.mjs <outDir>     about 6 minutes; screenshots go to <outDir>
//
// Same set-up as tools/emu-verify-orientation.mjs: the Firestore emulator
// running the real firestore.rules, the app served with stand-ins for three
// SDK files (firebase-auth.js signs in as ?uid=, app-check does nothing, sw.js
// is a 404). For es/en x light/dark at 375 px, with the app's own code:
//   teacher  alice fills the REAL assign sheet: the Practice tick shows the
//            colour choice, the chapter's saved orientation is proposed, a
//            chapter with none proposes nothing and Send refuses until a side
//            is picked; the tasks are written through the real rules
//   student  bob opens each card: practice as White (a variation in the
//            chapter is skipped), Restart, a wrong move, 👁 Show me, no arrow
//            ever drawn, done with mistakes 2; practice as Black from a
//            black-to-move startFen, done with mistakes 0; the plain chapter
//            homework still steps through and finishes as before
//   teacher  sees "practice as White/Black" and the mistakes on the done rows
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
if (!OUT) { console.error('usage: node tools/emu-verify-chapter-practice.mjs <outDir>'); process.exit(1); }

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
      `"node tools/emu-verify-chapter-practice.mjs ${JSON.stringify(path.resolve(OUT)).slice(1, -1).replace(/\\\\/g, '/')} --inner"`],
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
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-practice-'));
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 900000).unref();

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
const put = (docPath, fields) => fetch(`${DOCS}/${docPath}`, { method: 'PATCH', headers: owner, body: JSON.stringify({ fields }) });
await fetch(`http://${EMU}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
// alice is bob's teacher: the link the homework rules ask for.
await put(`coaching/${ALICE}_${BOB}`, { teacherUid: { stringValue: ALICE }, studentUid: { stringValue: BOB },
  status: { stringValue: 'active' }, createdAt: { integerValue: '1755000000000' } });

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
      S: (await import('/js/students.js')).Students,
      fb: await import('/js/firebase.js'),
      wait: ms => new Promise(r => setTimeout(r, ms)),
      arrows: 0,
      // A tap on a square of the Analysis board, as a finger does it.
      tap: sq => {
        const el = document.querySelector('#ana-board [data-sq="' + sq + '"]');
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 1, clientY: 1 }));
        document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 1, clientY: 1 }));
      },
    };
    // Every arrow the board is ever asked to draw, counted.
    const B = __t.A.board, real = B.setShapes.bind(B);
    B.setShapes = s => { if (s && s.arrows && s.arrows.length) __t.arrows++; real(s); };
    // Signed in all the way: Students knows who I am and has loaded once.
    // (Removing a sign-in modal above can leave Students' onAuth() unfired:
    // then it is called here, the same call the auth listener makes.)
    for (let i = 0; i < 50 && __t.S.uid !== '${uid}'; i++) await __t.wait(100);
    const fb = __t.fb;
    for (let i = 0; i < 50 && !(fb.Auth && fb.Auth.user); i++) await __t.wait(100);
    if (__t.S.uid !== '${uid}') await __t.S.onAuth();
    await __t.wait(500);
    return [__t.S.uid, !!(fb.Auth && fb.Auth.user)];`);
}
const sideways = () => ev(`return document.documentElement.scrollWidth > innerWidth`);
const move = async uci => { await ev(`__t.tap('${uci.slice(0, 2)}'); __t.tap('${uci.slice(2, 4)}');`); await sleep(1100); };
const status = () => ev(`const s = document.getElementById('ana-pr-status'); return { text: s.textContent, bad: s.classList.contains('bad'), good: s.classList.contains('good') }`);
const counter = () => ev(`return document.getElementById('ana-pr-counter').textContent`);
const hwDoc = id => stored(`homework/${id}`);

const FEN_B = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const STRINGS = {
  es: { white: 'blancas', black: 'negras', two: '2 errores', clean: 'sin errores', practice: 'práctica' },
  en: { white: 'White', black: 'Black', two: '2 mistakes', clean: 'no mistakes', practice: 'practice' },
};

for (const lang of ['es', 'en']) {
  for (const scheme of ['light', 'dark']) {
    const tag = `${lang}-${scheme}`;
    const S_ = STRINGS[lang];
    console.log(`\n${tag}`);

    // ── TEACHER: a class with three chapters ───────────────────────────────
    await load(ALICE, lang, scheme);
    const ids = await ev(`
      const mc = await __t.fb.createMasterclass('Practice ${tag}');
      const w = await __t.fb.addChapter(mc, { title: 'Ruy ${tag}', order: 0, startFen: '', orientation: 'w',
        pgn: '1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6 3. Bb5 a6 *' });
      const b = await __t.fb.addChapter(mc, { title: 'Sicilian ${tag}', order: 1, startFen: '${FEN_B}', orientation: 'b',
        pgn: '[SetUp "1"]\\n[FEN "${FEN_B}"]\\n\\n1... c5 2. Nf3 d6 3. d4 *' });
      return { mc, w, b, o: 'old_${tag}' };`);
    // The third is an OLD chapter, written before v229: no orientation field.
    await put(`masterclasses/${ids.mc}/chapters/${ids.o}`, {
      title: { stringValue: `Plain ${tag}` }, pgn: { stringValue: '1. d4 d5 2. c4 *' }, startFen: { stringValue: '' },
      order: { integerValue: '2' }, updatedBy: { stringValue: ALICE }, updatedAt: { timestampValue: new Date().toISOString() } });
    await ev(`await __t.M.load();`);
    check(`${tag} three chapters written`, !!(ids && ids.mc && ids.w && ids.b && ids.o), ids);
    // bob is a viewer, as the app's ensureViewer() makes him on Send.
    await put(`masterclasses/${ids.mc}/members/${BOB}`, { uid: { stringValue: BOB }, role: { stringValue: 'viewer' },
      addedBy: { stringValue: ALICE }, addedAt: { timestampValue: new Date().toISOString() } });

    // Opens the real sheet on Chapter and waits for the chapter list.
    const openSheet = async () => ev(`
      document.querySelectorAll('.modal-back').forEach(e => e.remove());
      for (let i = 0; i < 30 && !__t.M.classes.some(c => c.id === '${ids.mc}'); i++) { await __t.M.load(); await __t.wait(200); }
      window.__sheet = __t.S.assignSheet({ uid: '${BOB}', profileName: 'Bob' }, {}, 'chapter');
      for (let i = 0; i < 80; i++) {
        const chs = document.querySelector('.hw-sheet .hw-chs');
        if (chs && chs.options.length >= 3) break;
        await __t.wait(100);
      }
      const mc = document.querySelector('.hw-sheet .hw-mc');
      if (mc.value !== '${ids.mc}') { mc.value = '${ids.mc}'; mc.dispatchEvent(new Event('change')); }
      // This class's chapters, not the one shown first.
      for (let i = 0; i < 80 && !document.querySelector('.hw-sheet .hw-chs option[value="${ids.w}"]'); i++) await __t.wait(100);
      const opts = s => [...document.querySelectorAll('.hw-sheet ' + s + ' option')].map(o => o.value).join(',');
      return { mc: mc.value, mcs: opts('.hw-mc'), chs: opts('.hw-chs') };`);
    const pickChapter = id => ev(`
      const s = document.querySelector('.hw-sheet .hw-chs'); s.value = '${id}'; s.dispatchEvent(new Event('change'));`);
    const sheetState = () => ev(`
      const q = s => document.querySelector('.hw-sheet ' + s);
      return { opts: !q('.hw-pr-opts').classList.contains('hidden'), ticked: q('.hw-pr').checked,
        side: q('.hw-pr-color button.on') ? q('.hw-pr-color button.on').dataset.v : null };`);
    const sendSheet = async title => ev(`
      document.querySelector('.hw-sheet .hw-title').value = '${title}';
      [...document.querySelectorAll('.hw-sheet .btn.primary')].pop().click();
      await __t.wait(300);
      return !!document.querySelector('.hw-sheet');`);
    const writeTask = () => ev(`
      const spec = await window.__sheet;
      if (!spec) return null;
      const { memberCount, ...task } = spec;
      return { id: await __t.fb.assignHomework('${BOB}', task), params: task.params };`);

    // 1. Practice as White: the saved orientation 'w' is proposed.
    const sh = await openSheet();
    check(`${tag} sheet lists this class and its chapters`, sh.mc === ids.mc && sh.chs.includes(ids.w), sh);
    await pickChapter(ids.w);
    let st = await sheetState();
    check(`${tag} sheet: Practice tick off and its colour choice hidden by default`, !st.ticked && !st.opts, st);
    await ev(`document.querySelector('.hw-sheet .hw-pr').click();`);
    st = await sheetState();
    check(`${tag} sheet: ticking shows the colour choice, the chapter's 'w' proposed`, st.ticked && st.opts && st.side === 'w', st);
    await shot(`${tag}-1-sheet-practice-white`);
    check(`${tag} no sideways scroll (sheet)`, !await sideways());
    await pickChapter(ids.o);
    st = await sheetState();
    check(`${tag} sheet: a chapter with no saved orientation proposes no side`, st.side === null, st);
    const stillOpen = await sendSheet('Never sent');
    const toastText = await ev(`return document.getElementById('toast').textContent`);
    check(`${tag} sheet: Send refuses until a side is picked`, stillOpen && /color|colou?r/i.test(toastText), toastText);
    await pickChapter(ids.w);
    await sendSheet(`PW ${tag}`);
    const hwW = await writeTask();
    check(`${tag} practice-White task written through the rules with practice 'w'`, hwW && hwW.id && hwW.params.practice === 'w', hwW);

    // 2. Practice as Black: proposed 'b' from the chapter; the tick is
    //    switched back on for each new sheet.
    await openSheet();
    await pickChapter(ids.b);
    await ev(`document.querySelector('.hw-sheet .hw-pr').click();`);
    st = await sheetState();
    check(`${tag} sheet: the Black chapter proposes 'b'`, st.side === 'b', st);
    await sendSheet(`PB ${tag}`);
    const hwB = await writeTask();
    check(`${tag} practice-Black task written with practice 'b'`, hwB && hwB.id && hwB.params.practice === 'b', hwB);

    // 3. Plain chapter homework: the tick left off = exactly what it was.
    await openSheet();
    await pickChapter(ids.o);
    await sendSheet(`PO ${tag}`);
    const hwO = await writeTask();
    check(`${tag} plain task has params exactly {mcId, chapterId}`, hwO && hwO.id
      && Object.keys(hwO.params).sort().join() === 'chapterId,mcId', hwO);

    const teacherWhat = await ev(`return [${JSON.stringify(hwW.id)}, ${JSON.stringify(hwB.id)}, ${JSON.stringify(hwO.id)}]
      .map(id => ({ id, kind: 'chapter', params: id === '${hwW.id}' ? { practice: 'w' } : id === '${hwB.id}' ? { practice: 'b' } : {} }))
      .map(h => __t.S.hwWhat(h, true));`);
    check(`${tag} teacher's wording names practice and the colour`, teacherWhat[0].includes(S_.white) && teacherWhat[1].includes(S_.black)
      && teacherWhat[0].toLowerCase().includes(S_.practice) && !teacherWhat[2].toLowerCase().includes(S_.practice), teacherWhat);

    // ── STUDENT ───────────────────────────────────────────────────────────
    await load(BOB, lang, scheme);
    await ev(`__t.app.showScreen('students');
      for (let i = 0; i < 20; i++) {
        await __t.S.loadMyHomework(); __t.S.render(); await __t.wait(300);
        if (document.querySelectorAll('#stu-hw-list .hw-card').length && document.getElementById('stu-hw-list').textContent.includes('PO ${tag}')) break;
      }`);
    console.log('    probe', JSON.stringify(await ev(`return { uid: __t.S.uid, n: (__t.S.homework || []).length, titles: (__t.S.homework || []).map(h => h.title),
      screen: __t.app.activeScreen, hidden: document.getElementById('stu-hw').classList.contains('hidden'),
      html: document.getElementById('stu-hw-list').innerHTML.slice(0, 200) }`)));
    const cardOf = title => `[...document.querySelectorAll('#stu-hw-list .hw-card')].find(c => c.textContent.includes('${title}'))`;
    const cards = await ev(`return [${['PW', 'PB', 'PO'].map(x =>
      `(() => { const c = ${cardOf(`${x} ${tag}`)}; return c ? c.querySelector('.hw-what').textContent : null; })()`).join(', ')}]`);
    check(`${tag} student cards say practice + colour, the plain one does not`, !!cards[0] && cards[0].includes(S_.white)
      && cards[1].includes(S_.black) && !cards[2].toLowerCase().includes(S_.practice), cards);
    await ev(`${cardOf(`PW ${tag}`)}.scrollIntoView();`);
    await shot(`${tag}-2-student-cards`);

    // ── practice as White ──
    await ev(`__t.arrows = 0; ${cardOf(`PW ${tag}`)}.querySelector('.fr-actions .btn').click(); await __t.wait(2000);`);
    let s = await ev(`return { practicing: document.getElementById('screen-analysis').classList.contains('practicing'),
      screen: __t.app.activeScreen, face: __t.A.board.orientation,
      moves: !!document.getElementById('ana-moves').offsetParent, toolbar: !!document.getElementById('ana-toolbar').offsetParent,
      bar: !!document.getElementById('ana-pr-bar').offsetParent, head: document.getElementById('ana-pr-head').textContent,
      line: __t.A.practiceRun && __t.A.practiceRun.line.join(' ') }`);
    check(`${tag} W: Open starts practice on the board, White at the bottom`, s.practicing && s.face === 'w' && s.bar, s);
    check(`${tag} W: the moves list and toolbar are hidden while practising`, !s.moves && !s.toolbar, s);
    check(`${tag} W: main line only (the 1...c5 variation is not in it)`, s.line === 'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6', s.line);
    check(`${tag} W: header names the side`, s.head.includes(S_.white), s.head);
    check(`${tag} W: counter starts at 0 / 6`, await counter() === '0 / 6', await counter());
    await move('e2e4');
    check(`${tag} W: a right move, the reply plays itself`, await counter() === '2 / 6', await counter());
    await ev(`document.getElementById('ana-pr-restart').click(); await __t.wait(300);`);
    check(`${tag} W: Restart goes back to move 0, mistakes reset`, await counter() === '0 / 6' && await ev(`return __t.A.practice.misses`) === 0);
    await move('d2d4');
    let stt = await status();
    check(`${tag} W: a wrong move is taken back and says try again`, stt.bad && await counter() === '0 / 6'
      && await ev(`return __t.A.board.fen.split(' ')[0]`) === 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', stt);
    await shot(`${tag}-3-practice-white-wrong`);
    check(`${tag} no sideways scroll (practice)`, !await sideways());
    await move('d2d4');                                     // a second miss: no arrow either
    await move('e2e4');
    await move('g1f3');
    check(`${tag} W: still open after 4 of 6 (stepping is not done)`, (await hwDoc(hwW.id)).status === 'open');
    await ev(`document.getElementById('ana-pr-show').click(); await __t.wait(1300);`);
    stt = await status();
    const d1 = await hwDoc(hwW.id);
    check(`${tag} W: 👁 Show me plays Bb5, a6 follows, the line is complete`, stt.good && await ev(`return __t.A.practice.active`) === false, stt);
    check(`${tag} W: no arrow was ever drawn`, await ev(`return __t.arrows`) === 0, await ev(`return __t.arrows`));
    await sleep(1500);
    const dW = await hwDoc(hwW.id);
    check(`${tag} W: Firestore — done, mistakes 3 (2 wrong + Show me)`, dW.status === 'done' && String(dW.mistakes) === '3', dW && [dW.status, dW.mistakes, d1.status]);
    await shot(`${tag}-4-practice-white-done`);
    await ev(`document.getElementById('ana-pr-exit').click(); await __t.wait(300);`);
    s = await ev(`return { practicing: document.getElementById('screen-analysis').classList.contains('practicing'), toolbar: !!document.getElementById('ana-toolbar').offsetParent }`);
    check(`${tag} W: Exit practice gives the chapter back`, !s.practicing && s.toolbar, s);

    // ── practice as Black, from a black-to-move startFen ──
    await ev(`__t.app.showScreen('students'); __t.S.render(); await __t.wait(300);
      __t.arrows = 0; ${cardOf(`PB ${tag}`)}.querySelector('.fr-actions .btn').click(); await __t.wait(2000);`);
    s = await ev(`return { face: __t.A.board.orientation, line: __t.A.practiceRun && __t.A.practiceRun.line.join(' '), fen: __t.A.board.fen }`);
    check(`${tag} B: Black at the bottom, Black to move first`, s.face === 'b' && s.line === 'c7c5 g1f3 d7d6 d2d4' && s.fen.split(' ')[1] === 'b', s);
    check(`${tag} B: it is the player's move at once (0 / 4)`, await counter() === '0 / 4' && await ev(`return __t.A.board.interactive`));
    await shot(`${tag}-5-practice-black-start`);
    await move('c7c5');
    await move('d7d6');
    await sleep(1500);
    const dB = await hwDoc(hwB.id);
    check(`${tag} B: done with no mistakes`, dB.status === 'done' && String(dB.mistakes) === '0', dB && [dB.status, dB.mistakes]);
    check(`${tag} B: no arrow was ever drawn`, await ev(`return __t.arrows`) === 0);

    // ── the plain chapter homework, unchanged ──
    await ev(`__t.app.showScreen('students'); __t.S.render(); await __t.wait(300);
      ${cardOf(`PO ${tag}`)}.querySelector('.fr-actions .btn').click(); await __t.wait(2000);`);
    s = await ev(`return { practicing: document.getElementById('screen-analysis').classList.contains('practicing'),
      moves: !!document.getElementById('ana-moves').offsetParent, at: __t.A.tree.current === __t.A.tree.root }`);
    check(`${tag} plain: opens to step through, rewound, no practice`, !s.practicing && s.moves && s.at, s);
    await ev(`document.getElementById('ana-last').click(); await __t.wait(1500);`);
    const dO = await hwDoc(hwO.id);
    check(`${tag} plain: reaching the last move finishes it, no mistakes field`, dO.status === 'done' && dO.mistakes === undefined, dO && [dO.status, dO.mistakes]);

    // ── TEACHER: the done rows ──
    await load(ALICE, lang, scheme);
    const rows = await ev(`const list = await __t.fb.fetchHomeworkFor('${BOB}');
      return ['${hwW.id}', '${hwB.id}', '${hwO.id}'].map(id => __t.S.hwRowHtml(list.find(h => h.id === id), null, true));`);
    check(`${tag} teacher: White practice row shows practice and "${S_.two.replace('2', '3')}"`, rows[0].includes(S_.white) && rows[0].includes(S_.two.replace('2', '3')), rows[0].slice(0, 400));
    check(`${tag} teacher: Black practice row shows "${S_.clean}"`, rows[1].includes(S_.black) && rows[1].includes(S_.clean), rows[1].slice(0, 400));
    check(`${tag} teacher: plain row has no mistakes text`, !rows[2].includes(S_.clean) && !rows[2].toLowerCase().includes(S_.practice));
    await ev(`const box = document.createElement('div'); box.id = '__rows'; box.className = 'card';
      box.style.cssText = 'position:fixed;inset:60px 8px auto 8px;z-index:9999;background:var(--panel);padding:8px';
      box.innerHTML = ${JSON.stringify('')} + ${JSON.stringify(rows.map(r => `<div class="fr-row stack hw-card done">${r}</div>`).join(''))};
      document.body.appendChild(box);`);
    await shot(`${tag}-6-teacher-done-rows`);
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
