// Headless-Chrome verification for the Blindfold time control: the 1-20 s
// choice, the extra a short look pays, the peek rule and the fast start.
// The in-app pane does not composite, so this drives a real headless Chrome
// over CDP. Dev tool, not shipped.
//
//   node tools/cdp-verify-blind.mjs <outDir>
//
// REALLY TAPPED (CDP Input.dispatchTouchEvent — a finger down and up): the
// Blindfold mode button, Next, Peek, Kael's "Got it", Show solution, and every
// chess move (a tap on the piece's square, then on the target square, with the
// pieces hidden).
// CLICKED WITH element.click(), not a finger: the Puzzles tab.
// CALLED, not done by hand: the time slider (its value is set and the same
// input + change events a drag fires are dispatched — a finger drag on a
// native range is not reproducible over CDP), and the page reload.
// SEEDED: in step 5 the blindfold attempt count is set to 10, so the peek and
// loss checks run at normal speed rather than fast-start speed. Nothing else:
// the rating, the chosen seconds and the puzzles are whatever the app made.
// READ FROM THE APP, not from the screen: the puzzle's rating and solution
// (Blind.current) and the unrounded rating (Blind.elo). The expected numbers
// are worked out here in Node from js/blind-elo.js.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { blindEloResult, blindExtraPreview } from '../js/blind-elo.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/cdp-verify-blind.mjs <outDir>'); process.exit(1); }
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const WEB = 9900 + Math.floor(Math.random() * 90);
const APP_URL = `http://localhost:${WEB}`;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-blind-'));
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 420000).unref();

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
});
await new Promise(r => server.listen(WEB, '127.0.0.1', r));

const getJSON = url => new Promise((res, rej) => {
  http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });

let ws, msgId = 0;
const pending = new Map();
const errors = [];
function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
}
async function evalP(expr) {
  const r = await send('Runtime.evaluate', { expression: `(async()=>{ ${expr} })()`, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
  return r.result.value;
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
}
const killModals = () => evalP(`document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove());`);
async function load(lang, scheme) {
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
  await send('Page.navigate', { url: APP_URL });
  await sleep(2500);
  await evalP(`localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1');`);
  await send('Page.reload', {});
  await sleep(3500);
  await killModals();
}

for (let i = 0; i < 40; i++) {
  try {
    const targets = await getJSON(`http://127.0.0.1:${PORT}/json`);
    const page = targets.find(t => t.type === 'page');
    if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
  } catch {}
  await sleep(250);
}
await new Promise(r => ws.on('open', r));
ws.on('message', m => {
  const msg = JSON.parse(m);
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id); pending.delete(msg.id);
    msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  }
});
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok }); console.error((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); };
const close = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// ── fingers ─────────────────────────────────────────────────────────────────
async function tap(x, y) {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(x), y: Math.round(y), id: 1 }] });
  await sleep(40);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
// Scrolls the element into view, then puts a finger on its centre. Fails loudly
// if something else is on top of it — a tap that lands on an overlay proves nothing.
async function tapEl(sel) {
  const pt = await evalP(`
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    await new Promise(r => setTimeout(r, 60));
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return { x, y, hit: !!top && (top === el || el.contains(top)) };`);
  if (!pt) throw new Error('no element ' + sel);
  if (!pt.hit) throw new Error('covered: ' + sel);
  await tap(pt.x, pt.y);
  await sleep(120);
}
const B = `const { Blind } = await import('${APP_URL}/js/app.js');`;
const state = () => evalP(`${B}
  return { elo: Blind.elo, attempts: Blind.attemptCount, seconds: Blind.seconds, secondsThis: Blind.secondsThis,
    rating: Blind.current?.rating, moves: Blind.current?.moves, moveIdx: Blind.moveIdx, peeked: Blind.peekedThis,
    recorded: Blind.eloRecorded, interactive: Blind.board.interactive, hidden: Blind.board.piecesHidden,
    bonus: document.getElementById('blind-bonus').textContent, bonusLost: document.getElementById('blind-bonus').classList.contains('lost'),
    label: document.getElementById('blind-time-label').textContent, range: document.getElementById('blind-time-range').value,
    badge: document.getElementById('blind-elo').textContent, status: document.getElementById('blind-status').textContent,
    stored: await (await import('${APP_URL}/js/db.js')).kvGet('blindfoldSeconds', null),
    storedAttempts: await (await import('${APP_URL}/js/db.js')).kvGet('blindfoldAttemptCount', null) };`);

// Times the on-screen countdown: from the moment the number appears to the
// moment it goes. Polled from Node, so good to about a tenth of a second.
async function timeCountdown(maxMs = 26000) {
  const vis = () => evalP(`return !document.getElementById('blind-countdown').classList.contains('hidden');`);
  const t0 = Date.now();
  while (!(await vis())) { if (Date.now() - t0 > 4000) return null; await sleep(15); }
  const start = Date.now();
  while (await vis()) { if (Date.now() - start > maxMs) return null; await sleep(30); }
  return (Date.now() - start) / 1000;
}
// Next puzzle by finger, countdown timed. A puzzle with a promotion in it is
// skipped (the promotion picker is not what is under test here).
async function nextPuzzle() {
  for (let tries = 0; tries < 8; tries++) {
    await tapEl('#blind-next');
    const secs = await timeCountdown();
    const st = await state();
    if (st.moves.every(m => m.length === 4)) return { secs, st };
    await sleep(700);
  }
  throw new Error('no promotion-free puzzle in 8 tries');
}
async function tapSquare(sq) { await tapEl(`#blind-board .sq[data-sq="${sq}"]`); }
async function waitInteractive() {
  for (let i = 0; i < 80; i++) { if ((await state()).interactive) return; await sleep(100); }
  throw new Error('board never became interactive');
}
// Plays the whole solution with a finger, pieces hidden.
async function solve() {
  for (let guard = 0; guard < 12; guard++) {
    const st = await state();
    if (st.moveIdx >= st.moves.length) return;
    await waitInteractive();
    const mv = st.moves[st.moveIdx];
    await tapSquare(mv.slice(0, 2));
    await tapSquare(mv.slice(2, 4));
    await sleep(700);
  }
}
async function setSeconds(n) {
  await evalP(`const r = document.getElementById('blind-time-range'); r.value = ${n};
    r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true }));`);
  await sleep(150);
}
async function openBlind() {
  await evalP(`document.querySelector('[data-screen="puzzles"]').click();`);
  await sleep(600);
  await killModals();
  await tapEl('#screen-puzzles .puzzle-modes [data-v="blind"]');
}
const layout = () => evalP(`
  const box = document.querySelector('.blind-time').getBoundingClientRect();
  const range = document.getElementById('blind-time-range').getBoundingClientRect();
  return { docW: document.documentElement.scrollWidth, left: box.left, right: box.right, rangeW: range.width, rangeH: range.height,
    mode: document.body.className, hint: document.querySelector('.blind-time .hint').textContent,
    explain: document.querySelector('#screen-blind p.hint').textContent };`);

try {
  // ── 1. first open: default 10 s, fast start ───────────────────────────────
  await load('en', 'light');
  await openBlind();
  let secs = await timeCountdown();
  let st = await state();
  check('first open: the countdown runs 10 s', secs !== null && close(secs, 10, 0.5), secs);
  check('first open: control reads 10 s', st.label === '⏱ Memorising time: 10 s' && st.range === '10', st.label);
  check('first open: 10 s offers no extra', st.bonus === '10 s look: normal points. Choose less time to earn extra.', st.bonus);
  let lay = await layout();
  check('375px: no sideways scroll and the control fits', lay.docW <= 375 && lay.left >= 0 && lay.right <= 375 && lay.rangeW > 250 && lay.rangeH >= 28, lay);
  if (!st.moves.every(m => m.length === 4)) ({ st } = await nextPuzzle());
  await waitInteractive();
  await shot('1-en-light-10s');
  let before = st;
  await solve();
  st = await state();
  let want = blindEloResult({ elo: before.elo, rating: before.rating, win: true, seconds: 10, peeked: false, attemptCount: 0 });
  check('clean solve at 10 s, puzzle 1: fast-start points, no extra', st.recorded && close(st.elo, want.elo) && want.extra === 0,
    { before: before.elo, after: st.elo, normal: +want.normal.toFixed(1) });
  check('the attempt count is saved', st.attempts === 1 && st.storedAttempts === 1, st.storedAttempts);

  // ── 2. a short look pays extra ────────────────────────────────────────────
  await setSeconds(2);
  st = await state();
  check('slider to 2: label follows, saved', st.label === '⏱ Memorising time: 2 s' && st.stored === 2, { label: st.label, stored: st.stored });
  let np = await nextPuzzle();
  before = np.st;
  check('the countdown runs 2 s', np.secs !== null && close(np.secs, 2, 0.4), np.secs);
  let preview = Math.max(1, Math.round(blindExtraPreview({ elo: before.elo, rating: before.rating, seconds: 2 })));
  check('before solving: the extra on offer is shown, with the peek warning',
    before.bonus === `⚡ 2 s look: +${preview} extra for a clean solve — a peek forfeits it`, before.bonus);
  await waitInteractive();
  await shot('2-en-light-2s-bonus');
  await solve();
  st = await state();
  want = blindEloResult({ elo: before.elo, rating: before.rating, win: true, seconds: 2, peeked: false, attemptCount: 1 });
  check('clean solve at 2 s pays the normal points PLUS the extra', close(st.elo, want.elo) && want.extra > 0,
    { before: before.elo, after: st.elo, normal: +want.normal.toFixed(1), extra: +want.extra.toFixed(1) });
  check('after scoring the offer line clears', st.bonus === '', st.bonus);

  // ── 3. SEED: past the fast start, so the next numbers are everyday ones ───
  await evalP(`${B} Blind.attemptCount = 10; await (await import('${APP_URL}/js/db.js')).kvSet('blindfoldAttemptCount', 10);`);

  // ── 4. a real Peek cancels only the extra ─────────────────────────────────
  np = await nextPuzzle();
  before = np.st;
  await waitInteractive();
  await tapEl('#blind-peek');
  await sleep(300);
  const warn = await evalP(`return document.querySelector('.modal-back')?.textContent || '';`);
  check("Kael's first-peek warning states the new rule", /gives up the extra points/.test(warn) && /normal points in full/.test(warn), warn.slice(0, 140));
  await shot('3-en-light-kael-warning');
  await tapEl('.modal-back .btn.primary');
  await sleep(300);
  st = await state();
  check('Peek: pieces shown, extra marked forfeited', st.peeked && !st.hidden && st.bonusLost && st.bonus === 'Time extra forfeited by the peek — normal points still on offer', st.bonus);
  await shot('4-en-light-peeked');
  await sleep(5200);
  await solve();
  st = await state();
  want = blindEloResult({ elo: before.elo, rating: before.rating, win: true, seconds: 2, peeked: true, attemptCount: 10 });
  const normalOnly = 32 * (1 - 1 / (1 + Math.pow(10, (before.rating - before.elo) / 400)));
  const oldPeekWin = 12 * (1 - 1 / (1 + Math.pow(10, (before.rating - before.elo) / 400)));
  check('solve after a REAL peek pays the normal points exactly, zero extra',
    close(st.elo, want.elo) && want.extra === 0 && close(st.elo - before.elo, normalOnly),
    { gained: +(st.elo - before.elo).toFixed(2), normal: +normalOnly.toFixed(2), oldRuleWouldPay: +oldPeekWin.toFixed(2) });

  // ── 5. mid-puzzle change applies from the NEXT puzzle; a wrong move ───────
  np = await nextPuzzle();
  before = np.st;
  await waitInteractive();
  await setSeconds(1);
  st = await state();
  check('changing the time mid-puzzle leaves this puzzle at 2 s', st.secondsThis === 2 && st.seconds === 1 && /^⚡ 2 s look/.test(st.bonus), { secondsThis: st.secondsThis, bonus: st.bonus });
  const wrong = await evalP(`${B}
    const want = Blind.current.moves[Blind.moveIdx];
    const { Chess } = await import('${APP_URL}/vendor/chess.js');
    for (const m of Blind.chess.moves({ verbose: true })) {
      if (m.from + m.to === want.slice(0, 4) || m.promotion) continue;
      const c = new Chess(Blind.chess.fen()); c.move(m);
      if (!c.isCheckmate()) return m.from + m.to;
    }
    return null;`);
  await tapSquare(wrong.slice(0, 2));
  await tapSquare(wrong.slice(2, 4));
  await sleep(500);
  st = await state();
  want = blindEloResult({ elo: before.elo, rating: before.rating, win: false, seconds: 2, peeked: false, attemptCount: 10 });
  const at10 = blindEloResult({ elo: before.elo, rating: before.rating, win: false, seconds: 10, peeked: false, attemptCount: 10 });
  check('a wrong move at 2 s: no extra, and the same loss as at 10 s', st.recorded && close(st.elo, want.elo) && close(st.elo, at10.elo) && st.bonus === '',
    { lost: +(st.elo - before.elo).toFixed(2) });
  await solve();
  const afterSolve = await state();
  check('solving it afterwards pays nothing back', close(afterSolve.elo, st.elo), afterSolve.elo);

  np = await nextPuzzle();
  before = np.st;
  check('the next puzzle runs the new 1 s', np.secs !== null && close(np.secs, 1, 0.4) && before.secondsThis === 1, np.secs);
  await waitInteractive();
  await tapEl('#blind-solution');
  await sleep(400);
  st = await state();
  want = blindEloResult({ elo: before.elo, rating: before.rating, win: false, seconds: 1, peeked: false, attemptCount: before.attempts });
  check('Show solution at 1 s: a normal loss, no extra', close(st.elo, want.elo) && want.extra === 0, { lost: +(st.elo - before.elo).toFixed(2) });

  // ── 6. 20 s: remembered across a reload, pays half ────────────────────────
  await setSeconds(20);
  await send('Page.reload', {});
  await sleep(3500);
  await killModals();
  await openBlind();
  secs = await timeCountdown();
  st = await state();
  check('after a reload the control still reads 20 s', st.label === '⏱ Memorising time: 20 s' && st.range === '20' && st.stored === 20, st.label);
  check('the countdown runs 20 s', secs !== null && close(secs, 20, 0.6), secs);
  check('20 s says a win pays 50%', st.bonus === '20 s look: a win pays 50% of the normal points', st.bonus);
  if (!st.moves.every(m => m.length === 4)) ({ st } = await nextPuzzle());
  before = st;
  await waitInteractive();
  await solve();
  st = await state();
  want = blindEloResult({ elo: before.elo, rating: before.rating, win: true, seconds: 20, peeked: false, attemptCount: before.attempts });
  const full = blindEloResult({ elo: before.elo, rating: before.rating, win: true, seconds: 10, peeked: false, attemptCount: before.attempts });
  check('clean solve at 20 s pays half the normal points', close(st.elo, want.elo) && close(want.normal, full.normal / 2), { gained: +(st.elo - before.elo).toFixed(2), at10: +full.normal.toFixed(2) });

  // ── 7. both languages, both themes ────────────────────────────────────────
  for (const [lang, scheme] of [['en', 'light'], ['es', 'light'], ['en', 'dark'], ['es', 'dark']]) {
    await load(lang, scheme);
    
    await openBlind();
    await sleep(1200);
    st = await state();
    lay = await layout();
    const wantLabel = lang === 'es' ? '⏱ Tiempo para memorizar: 20 s' : '⏱ Memorising time: 20 s';
    const wantBonus = lang === 'es' ? '20 s: los aciertos pagan el 50% de los puntos normales' : '20 s look: a win pays 50% of the normal points';
    check(`${lang}/${scheme}: control shown, remembered, in the right language`, st.label === wantLabel && st.bonus === wantBonus && st.range === '20', { label: st.label, bonus: st.bonus });
    check(`${lang}/${scheme}: theme applied, fits 375px`, lay.mode.includes('mode-' + scheme) && lay.docW <= 375 && lay.left >= 0 && lay.right <= 375, { mode: lay.mode, docW: lay.docW });
    check(`${lang}/${scheme}: help text no longer says a fixed 10 seconds`, !/10 se/.test(lay.explain) && /1 (a|to) 20/.test(lay.explain), lay.explain.slice(0, 80));
    await evalP(`document.querySelector('.blind-time').scrollIntoView({ block: 'end' });`);
    await sleep(200);
    await shot(`5-${lang}-${scheme}-control`);
    // a short look in this language/theme too, so the gold offer line is photographed
    await setSeconds(3);
    np = await nextPuzzle();
    check(`${lang}/${scheme}: 3 s countdown and offer line`, close(np.secs, 3, 0.4) && /\+\d+ extra/.test(np.st.bonus), { secs: np.secs, bonus: np.st.bonus });
    await evalP(`window.scrollTo(0, 0); document.querySelector('#screen-blind').scrollIntoView();`);
    await sleep(200);
    await shot(`6-${lang}-${scheme}-offer`);
    await setSeconds(20);
  }
} catch (e) {
  check('harness ran to the end', false, String(e.stack || e).slice(0, 600));
}

const appErrors = errors.filter(e => !/403|app-?check|firebase|Failed to fetch/i.test(e));
check('no page errors', appErrors.length === 0, appErrors.slice(0, 3));
const failed = checks.filter(c => !c.ok);
console.error(`\n${checks.length - failed.length}/${checks.length} checks passed`);
ws.close(); chrome.kill(); server.close();
process.exit(failed.length ? 1 : 0);
