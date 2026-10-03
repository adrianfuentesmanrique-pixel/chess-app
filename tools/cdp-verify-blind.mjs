// Headless-Chrome verification for the Blindfold time control: the 1-20 s
// choice, the extra a short look pays, the peek rule and the fast start.
// The in-app pane does not composite, so this drives a real headless Chrome
// over CDP. Dev tool, not shipped.
//
//   node tools/cdp-verify-blind.mjs <outDir>
//
// Since v136 Blindfold opens on a start panel: nothing counts down until Go,
// and the slider is locked from Go until the puzzle is scored.
//
// REALLY TAPPED (CDP Input.dispatchTouchEvent — a finger down and up): the
// Blindfold mode button, Go, Next (including the two quick taps), Change time,
// Peek, Kael's "Got it", Show solution, every chess move (a tap on the piece's
// square, then on the target square, with the pieces hidden), and the slider
// in three places: a finger on its 1 s end while locked (twice — must do
// nothing) and once after scoring (must move it).
// CLICKED WITH element.click(), not a finger: the Puzzles tab.
// CALLED, not done by hand: every other slider change (its value is set and
// the same input + change events a drag fires are dispatched — a finger DRAG on
// a native range is not reproducible over CDP), and the page reload.
// SEEDED: in step 3 the blindfold attempt count is set to 10, so the peek and
// loss checks run at normal speed rather than fast-start speed; in step 5c
// Puzzles.autoNext is switched on in memory (not by its checkbox). Nothing else:
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
    locked: document.getElementById('blind-time-range').disabled, lockedLook: document.querySelector('.blind-time').classList.contains('locked'),
    timeHint: document.getElementById('blind-time-hint').textContent, changeBtn: document.getElementById('blind-change-time').textContent,
    startShown: !document.getElementById('blind-start').classList.contains('hidden'), gameShown: !document.getElementById('blind-game').classList.contains('hidden'),
    counting: !document.getElementById('blind-countdown').classList.contains('hidden'),
    pays: document.getElementById('blind-pays').textContent, lastPaid: document.getElementById('blind-last-paid').textContent,
    goText: document.getElementById('blind-go').textContent,
    badge: document.getElementById('blind-elo').textContent, status: document.getElementById('blind-status').textContent,
    stored: await (await import('${APP_URL}/js/db.js')).kvGet('blindfoldSeconds', null),
    storedAttempts: await (await import('${APP_URL}/js/db.js')).kvGet('blindfoldAttemptCount', null) };`);

// Times the on-screen countdown: from the moment the number appears to the
// moment it goes. Polled from Node, so good to about a tenth of a second.
// `mid`, if given, runs once while the number is on screen (use it only on a
// long countdown — it must finish before the countdown does).
async function timeCountdown(mid, maxMs = 26000) {
  const vis = () => evalP(`return !document.getElementById('blind-countdown').classList.contains('hidden');`);
  const t0 = Date.now();
  while (!(await vis())) { if (Date.now() - t0 > 4000) return null; await sleep(15); }
  const start = Date.now();
  if (mid) { await sleep(500); await mid(); }
  while (await vis()) { if (Date.now() - start > maxMs) return null; await sleep(30); }
  return (Date.now() - start) / 1000;
}
// Watches for `ms`: true if the countdown never appeared and no pieces were hidden.
async function staysQuiet(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await evalP(`return !document.getElementById('blind-countdown').classList.contains('hidden');`)) return false;
    await sleep(60);
  }
  return true;
}
// A finger on the slider's track, `frac` of the way along (0 = 1 s end).
async function tapSlider(frac) {
  const pt = await evalP(`const el = document.getElementById('blind-time-range'); el.scrollIntoView({ block: 'center' });
    await new Promise(r => setTimeout(r, 60));
    const r = el.getBoundingClientRect(); return { x: r.left + 3 + (r.width - 6) * ${frac}, y: r.top + r.height / 2 };`);
  await tap(pt.x, pt.y);
  await sleep(200);
}
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
// The two rounded parts of the paid-at line, worked out here from blind-elo.js.
const parts = (before, want) => { const extra = Math.round(want.extra); return { a: signed(Math.round(want.elo) - Math.round(before.elo) - extra), b: signed(extra) }; };
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
// Two finger taps on Next about a tenth of a second apart, then counts how many
// times the pieces get hidden over the next 5 s. One puzzle = one hide.
async function doubleNext() {
  await evalP(`${B} if (!Blind.__hp) { Blind.__hp = Blind.hidePieces; Blind.hidePieces = function () { Blind.hides++; return Blind.__hp.call(this); }; } Blind.hides = 0;
    document.getElementById('blind-next').scrollIntoView({ block: 'center' });`);
  await sleep(100);
  const pt = await evalP(`const r = document.getElementById('blind-next').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
  await tap(pt.x, pt.y);
  await sleep(60);
  await tap(pt.x, pt.y);
  await sleep(5000);
  return evalP(`${B} return Blind.hides;`);
}
const layout = () => evalP(`
  const box = document.querySelector('.blind-time').getBoundingClientRect();
  const range = document.getElementById('blind-time-range').getBoundingClientRect();
  return { docW: document.documentElement.scrollWidth, left: box.left, right: box.right, rangeW: range.width, rangeH: range.height,
    goBottom: document.getElementById('blind-go').getBoundingClientRect().bottom, goW: document.getElementById('blind-go').getBoundingClientRect().width,
    mode: document.body.className, hint: document.querySelector('.blind-time .hint').textContent,
    explain: document.querySelector('#screen-blind p.hint').textContent };`);

try {
  if (process.argv[3] === 'double-next') {
    await load('en', 'light');
    await openBlind();
    await sleep(800);
    if (await evalP(`return !!document.getElementById('blind-go');`)) await tapEl('#blind-go');
    await setSeconds(1);
    const hides = await doubleNext();
    check('REPRO two quick taps on Next hide the pieces once', hides === 1, hides);
    throw new Error('repro mode only');
  }
  // ── 1. first open: default 10 s, fast start ───────────────────────────────
  await load('en', 'light');
  await openBlind();
  const quiet = await staysQuiet(3000);
  let st = await state();
  check('START PANEL: opening Blindfold shows the panel, not a board', st.startShown && !st.gameShown && st.goText === '▶ Go', { start: st.startShown, game: st.gameShown, go: st.goText });
  check('START PANEL: no countdown and no puzzle for 3 s before Go', quiet && st.moves === undefined && !st.counting, { quiet, moves: st.moves });
  check('first open: control reads 10 s', st.label === '⏱ Memorising time: 10 s' && st.range === '10' && !st.locked, st.label);
  check('START PANEL: says what 10 s pays', st.pays === '10 s look: normal points. Choose less time to earn extra.', st.pays);
  let lay = await layout();
  check('375px: no sideways scroll and the control fits', lay.docW <= 375 && lay.left >= 0 && lay.right <= 375 && lay.rangeW > 250 && lay.rangeH >= 28, lay);
  check('START PANEL: Go is full width and on screen without scrolling', lay.goW > 300 && lay.goBottom <= 812, { goW: lay.goW, goBottom: lay.goBottom });
  await setSeconds(4);
  st = await state();
  check('START PANEL: the pays line follows the slider', st.pays === '⚡ 4 s look: a clean solve pays 75% extra on top of the normal points — a peek forfeits it', st.pays);
  await setSeconds(10);
  await shot('1-en-light-start-panel');
  await tapEl('#blind-go');
  let midSt, midFinger;
  let secs = await timeCountdown(async () => {
    await setSeconds(5);                 // the events a drag fires
    midSt = await state();
    await tapSlider(0);                  // a real finger on the 1 s end
    midFinger = await state();
  });
  st = await state();
  check('GO: the countdown runs the chosen 10 s', secs !== null && close(secs, 10, 0.5), secs);
  check('GO: the board is shown and the panel is gone', st.gameShown && !st.startShown, { game: st.gameShown });
  check('LOCK during the countdown: disabled, shown locked, slider events ignored', midSt.locked && midSt.lockedLook && midSt.seconds === 10 && midSt.range === '10' && midSt.stored === 10
    && midSt.label === '🔒 ⏱ Memorising time: 10 s' && midSt.timeHint === 'Locked until this puzzle is scored.', { seconds: midSt.seconds, range: midSt.range, label: midSt.label });
  check('LOCK during the countdown: a finger on the slider moves nothing', midFinger.seconds === 10 && midFinger.range === '10', midFinger.range);
  check('first puzzle: 10 s offers no extra', st.bonus === '10 s look: normal points. Choose less time to earn extra.', st.bonus);
  if (!st.moves.every(m => m.length === 4)) ({ st } = await nextPuzzle());
  await waitInteractive();
  await setSeconds(5);
  await tapSlider(0);
  let lk = await state();
  check('LOCK during the solve (pieces hidden): still 10 s after slider events and a finger', lk.locked && lk.hidden && lk.seconds === 10 && lk.range === '10' && lk.stored === 10, { seconds: lk.seconds, range: lk.range });
  await shot('1-en-light-10s-locked');
  let before = st;
  await solve();
  st = await state();
  let want = blindEloResult({ elo: before.elo, rating: before.rating, win: true, seconds: 10, peeked: false, attemptCount: 0 });
  check('clean solve at 10 s, puzzle 1: fast-start points, no extra', st.recorded && close(st.elo, want.elo) && want.extra === 0,
    { before: before.elo, after: st.elo, normal: +want.normal.toFixed(1) });
  check('the attempt count is saved', st.attempts === 1 && st.storedAttempts === 1, st.storedAttempts);
  check('PAID LINE at 10 s: the points and "no extra"', st.bonus === `10 s look: ${parts(before, want).a} normal, no extra`, st.bonus);
  check('UNLOCK: after scoring the slider is free again', !st.locked && !st.lockedLook && st.label === '⏱ Memorising time: 10 s', st.label);

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
  let pp = parts(before, want);
  check('PAID LINE at 2 s: normal and extra, adding up to the badge move', st.bonus === `2 s look: ${pp.a} normal, ${pp.b} extra` && want.extra >= 0.5, st.bonus);
  await shot('2b-en-light-2s-paid');

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
  check('PAID LINE after a peek: normal points, no extra, says why', st.bonus === `2 s look: ${parts(before, want).a} normal, no extra (you peeked)` && !st.bonusLost, st.bonus);

  // ── 5. the time cannot change mid-puzzle; a wrong move scores and unlocks ─
  np = await nextPuzzle();
  before = np.st;
  await waitInteractive();
  await setSeconds(1);
  st = await state();
  check('the time cannot be changed mid-puzzle: still 2 s, nothing saved', st.locked && st.secondsThis === 2 && st.seconds === 2 && st.stored === 2 && /^⚡ 2 s look/.test(st.bonus), { seconds: st.seconds, stored: st.stored, bonus: st.bonus });
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
  check('a wrong move at 2 s: no extra, and the same loss as at 10 s', st.recorded && close(st.elo, want.elo) && close(st.elo, at10.elo),
    { lost: +(st.elo - before.elo).toFixed(2) });
  check('PAID LINE after a wrong move: the loss, at 2 s', st.bonus === `2 s look: ${parts(before, want).a} — a miss costs the same at any time`, st.bonus);
  await shot('4b-en-light-loss-paid');
  // Scored, so the slider is free — moved here by a real finger, to the 1 s end.
  await tapSlider(0);
  const fingered = await state();
  check('UNLOCK after a wrong move: a FINGER on the slider moves it to 1 s, and it is saved', !fingered.locked && fingered.seconds === 1 && fingered.stored === 1, { seconds: fingered.seconds, stored: fingered.stored });
  if (fingered.seconds !== 1) await setSeconds(1);
  st = await state();
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
  check('PAID LINE after Show solution: the loss, at 1 s; slider free', st.bonus === `1 s look: ${parts(before, want).a} — a miss costs the same at any time` && !st.locked, st.bonus);
  await sleep(2500);   // let the solution finish playing out

  // ── 5b. two quick taps on Next start ONE countdown (was a real bug) ───────
  const hides = await doubleNext();
  check('two quick finger taps on Next: the pieces are hidden once, not every second', hides === 1, hides);

  // ── 5c. Change time, with auto-next on (SEEDED: Puzzles.autoNext = true) ──
  await evalP(`const { Puzzles } = await import('${APP_URL}/js/app.js'); Puzzles.autoNext = true;`);
  np = await nextPuzzle();
  before = np.st;
  await waitInteractive();
  await tapEl('#blind-change-time');
  st = await state();
  check('CHANGE TIME mid-puzzle: books the panel, changes nothing now', st.gameShown && !st.startShown && st.locked && st.seconds === 1 && st.secondsThis === 1
    && st.changeBtn === '✓ Time panel opens after this puzzle', { btn: st.changeBtn, seconds: st.seconds });
  await shot('4c-en-light-change-time-booked');
  await solve();
  st = await state();
  want = blindEloResult({ elo: before.elo, rating: before.rating, win: true, seconds: 1, peeked: false, attemptCount: before.attempts });
  pp = parts(before, want);
  check('that puzzle is still paid at its own 1 s', close(st.elo, want.elo) && st.bonus === `1 s look: ${pp.a} normal, ${pp.b} extra`, st.bonus);
  await sleep(1800);   // auto-next fires at 1.4 s
  const quiet2 = await staysQuiet(2500);
  st = await state();
  check('CHANGE TIME: auto-next opens the start panel instead of a puzzle', st.startShown && !st.gameShown && quiet2 && !st.locked, { start: st.startShown, quiet2 });
  check('START PANEL: shows what the last puzzle paid', st.lastPaid === `Last puzzle — 1 s look: ${pp.a} normal, ${pp.b} extra`, st.lastPaid);
  await shot('4d-en-light-panel-after-change-time');
  await tapEl('#blind-go');
  secs = await timeCountdown();
  st = await state();
  check('GO at 1 s: the countdown runs 1 s', secs !== null && close(secs, 1, 0.4) && st.secondsThis === 1, secs);
  if (!st.moves.every(m => m.length === 4)) ({ st } = await nextPuzzle());
  await waitInteractive();
  await solve();
  await tapEl('#blind-change-time');   // between puzzles, inside the 1.4 s
  st = await state();
  const quiet3 = await staysQuiet(3000);
  const st3 = await state();
  check('CHANGE TIME between puzzles: panel at once, and the late auto-next starts nothing', st.startShown && quiet3 && st3.startShown && !st3.gameShown, { start: st.startShown, quiet3 });
  await evalP(`const { Puzzles } = await import('${APP_URL}/js/app.js'); Puzzles.autoNext = false;`);

  // ── 6. 20 s: remembered across a reload, pays half ────────────────────────
  await setSeconds(20);
  await send('Page.reload', {});
  await sleep(3500);
  await killModals();
  await openBlind();
  await sleep(1200);
  st = await state();
  check('after a reload the start panel reads 20 s and says it pays 50%', st.startShown && st.label === '⏱ Memorising time: 20 s' && st.range === '20' && st.stored === 20
    && st.pays === '20 s look: a win pays 50% of the normal points', { label: st.label, pays: st.pays });
  await tapEl('#blind-go');
  secs = await timeCountdown();
  st = await state();
  check('after a reload the control still reads 20 s', st.label === '🔒 ⏱ Memorising time: 20 s' && st.range === '20' && st.stored === 20, st.label);
  check('GO at 20 s: the countdown runs 20 s', secs !== null && close(secs, 20, 0.6), secs);
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
    check(`${lang}/${scheme}: control shown, remembered, in the right language`, st.label === wantLabel && st.pays === wantBonus && st.range === '20', { label: st.label, pays: st.pays });
    check(`${lang}/${scheme}: theme applied, fits 375px`, lay.mode.includes('mode-' + scheme) && lay.docW <= 375 && lay.left >= 0 && lay.right <= 375, { mode: lay.mode, docW: lay.docW });
    check(`${lang}/${scheme}: help text no longer says a fixed 10 seconds`, !/10 se/.test(lay.explain) && /1 (a|to) 20/.test(lay.explain), lay.explain.slice(0, 80));
    check(`${lang}/${scheme}: start panel up, no countdown, Go on screen`, st.startShown && !st.gameShown && !st.counting && st.goText === (lang === 'es' ? '▶ Empezar' : '▶ Go') && lay.goBottom <= 812 && lay.goW > 300,
      { go: st.goText, goBottom: lay.goBottom });
    // a short look in this language/theme too, so the gold lines are photographed
    await setSeconds(3);
    await shot(`5-${lang}-${scheme}-start-panel`);
    await tapEl('#blind-go');
    secs = await timeCountdown();
    st = await state();
    check(`${lang}/${scheme}: Go runs the 3 s countdown, offer line shown`, close(secs, 3, 0.4) && /\+\d+ extra/.test(st.bonus), { secs, bonus: st.bonus });
    check(`${lang}/${scheme}: slider locked and says so`, st.locked && st.lockedLook && st.label.startsWith('🔒') && st.timeHint === (lang === 'es' ? 'Bloqueado hasta que este puzzle se puntúe.' : 'Locked until this puzzle is scored.')
      && st.changeBtn === (lang === 'es' ? '⏱ Cambiar tiempo' : '⏱ Change time'), { hint: st.timeHint, btn: st.changeBtn });
    await evalP(`document.querySelector('.blind-time').scrollIntoView({ block: 'end' });`);
    await sleep(200);
    await shot(`6-${lang}-${scheme}-locked`);
    before = st;
    await waitInteractive();
    await tapEl('#blind-solution');
    await sleep(400);
    st = await state();
    want = blindEloResult({ elo: before.elo, rating: before.rating, win: false, seconds: 3, peeked: false, attemptCount: before.attempts });
    const wantPaid = lang === 'es' ? `3 s: ${parts(before, want).a} — un fallo cuesta lo mismo con cualquier tiempo` : `3 s look: ${parts(before, want).a} — a miss costs the same at any time`;
    check(`${lang}/${scheme}: paid line in the right language, slider free again`, st.bonus === wantPaid && !st.locked, st.bonus);
    await evalP(`window.scrollTo(0, 0); document.querySelector('#screen-blind').scrollIntoView();`);
    await sleep(200);
    await shot(`7-${lang}-${scheme}-paid`);
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
