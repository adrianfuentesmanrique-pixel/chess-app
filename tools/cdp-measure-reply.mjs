// Headless-Chrome stopwatch: how long from MY move to the opponent's reply on
// each screen. Dev tool, not shipped.
//
//   node tools/cdp-measure-reply.mjs
//
// HOW IT MEASURES: Board.prototype.setPosition is wrapped in the page so every
// position change is time-stamped. My move is CALLED (board.onMove(...)), not
// tapped: the number wanted is the wait the code adds, and a called move goes
// through the same userMove() funnel as a finger. "reply" = time from that
// call to the next setPosition that carries a last move.
// NOT MEASURED HERE: Duel (needs a live two-player match). It runs on Rush's
// own code through the prototype (js/pulso-match.js, Object.create(Rush)), so
// Rush's numbers are Duel's.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const WEB = 9900 + Math.floor(Math.random() * 90);
const APP_URL = `http://localhost:${WEB}`;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-measure-'));
setTimeout(() => { console.error('MEASURE TIMEOUT'); process.exit(2); }, 600000).unref();

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
  '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' };
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
const killModals = () => evalP(`document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove());`);

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

await send('Page.navigate', { url: APP_URL });
await sleep(2500);
await evalP(`localStorage.setItem('lang', 'en'); localStorage.setItem('tourDone', '1');`);
await send('Page.reload', {});
await sleep(3500);
await killModals();

// The stopwatch, and the helpers every screen below shares.
const A = `const app = await import('${APP_URL}/js/app.js'); const { uciToMove } = await import('${APP_URL}/js/engine.js');
  const L = window.__log; const wait = ms => new Promise(r => setTimeout(r, ms));
  const until = async (fn, ms = 20000) => { const t = performance.now(); while (!fn()) { if (performance.now() - t > ms) throw new Error('until timed out: ' + fn); await wait(20); } };
  // My move, then how long until the next move lands on the same board.
  const reply = async (board, mv, ms = 6000) => {
    const n = L.length, t0 = performance.now();
    board.onMove(mv);
    await until(() => L.filter((e, i) => i >= n && e.lm).length >= 2, ms).catch(() => {});
    const got = L.slice(n).filter(e => e.lm);
    return got.length >= 2 ? Math.round(got[1].t - t0) : null;
  };`;
await evalP(`const { Board } = await import('${APP_URL}/js/board.js');
  window.__log = [];
  const orig = Board.prototype.setPosition;
  Board.prototype.setPosition = function (fen, lastMove, c) { window.__log.push({ t: performance.now(), id: this.el.id, lm: !!lastMove }); return orig.call(this, fen, lastMove, c); };
  (await import('${APP_URL}/js/sound.js')).Sound.enabled = false;`);

const out = {};
const step = async (name, fn) => {
  try { out[name] = await fn(); } catch (e) { out[name] = 'FAILED: ' + String(e.message).slice(0, 300); }
  console.error(name.padEnd(46), JSON.stringify(out[name]));
};

// ── Puzzles ──────────────────────────────────────────────────────────────────
await evalP(`document.querySelector('[data-screen="puzzles"]').click();`);
await sleep(1500); await killModals();
await step('Puzzles: puzzle shown -> its opening move', () => evalP(`${A} const P = app.Puzzles;
  const r = [];
  for (let i = 0; i < 3; i++) { const n = L.length; const t0 = performance.now(); await P.nextPuzzle(); const t1 = performance.now();
    await until(() => L.slice(n).some(e => e.lm)); r.push(Math.round(L.slice(n).find(e => e.lm).t - t1)); }
  return r;`));
await step('Puzzles: my move -> reply', () => evalP(`${A} const P = app.Puzzles; const r = [];
  for (let i = 0; i < 40 && r.length < 5; i++) {
    if (P.current.moves.length - P.moveIdx < 3) { await P.nextPuzzle(); await wait(900); continue; }
    r.push(await reply(P.board, uciToMove(P.current.moves[P.moveIdx])));
    await wait(200);
  }
  return r;`));

// ── Rush (and so Duel) ───────────────────────────────────────────────────────
await evalP(`document.querySelector('#screen-puzzles .puzzle-modes [data-v="rush"]').click();`);
await sleep(800); await killModals();
await step('Rush: my move -> reply / solved -> next opening move', () => evalP(`${A} const R = app.Rush;
  await R.start();
  await until(() => R.running && !R.countingIn && R.board.interactive, 15000);
  const replies = [], nexts = [];
  for (let i = 0; i < 40 && (replies.length < 5 || nexts.length < 5) && R.running; i++) {
    await until(() => R.board.interactive, 5000);
    const left = R.current.moves.length - R.moveIdx;
    const ms = await reply(R.board, uciToMove(R.current.moves[R.moveIdx]));
    (left >= 3 ? replies : nexts).push(ms);
  }
  return { reply: replies, solvedToNextOpeningMove: nexts };`));
await evalP(`${A} app.Rush.finish?.('measure');`).catch(() => {});
await sleep(600); await killModals();

// ── Blindfold ────────────────────────────────────────────────────────────────
await evalP(`document.querySelector('#screen-puzzles .puzzle-modes [data-v="blind"]').click();`);
await sleep(1000); await killModals();
await step('Blindfold: my move -> reply', () => evalP(`${A} const B = app.Blind; const r = [];
  document.getElementById('blind-go').click();
  for (let i = 0; i < 12 && r.length < 3; i++) {
    await until(() => B.current && B.board.piecesHidden && B.board.interactive && B.moveIdx >= 1, 60000);
    if (B.current.moves.length - B.moveIdx < 3) { await B.nextPuzzle(); await wait(700); continue; }
    r.push(await reply(B.board, uciToMove(B.current.moves[B.moveIdx])));
    await B.nextPuzzle(); await wait(700);
  }
  return r;`));
await evalP(`${A} app.Blind.showStart?.();`).catch(() => {});

// ── Play vs engine ───────────────────────────────────────────────────────────
await evalP(`document.querySelector('[data-screen="play"]').click();`);
await sleep(1200); await killModals();
await step('Play vs engine: my move -> reply, by level', () => evalP(`${A} const P = app.Play; const { LEVELS } = await import('${APP_URL}/js/engine.js');
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'; const r = {};
  for (const lv of [0, 2, 4, LEVELS.length - 1]) {
    P.level = lv; P.begin('w', START); await wait(300);
    const a = await reply(P.board, { from: 'e2', to: 'e4' }, 9000);
    await until(() => !P.thinking, 9000); await wait(100);
    const b = await reply(P.board, { from: 'd2', to: 'd4' }, 9000);
    await until(() => !P.thinking, 9000);
    r['level ' + lv + ' (think ' + LEVELS[lv].movetime + ' ms)'] = [a, b];
  }
  return r;`));

// ── Openings (trainer) ───────────────────────────────────────────────────────
await evalP(`document.querySelector('[data-screen="trainer"]').click();`);
await sleep(1200); await killModals();
// SEEDED: a fresh profile has no opening base, so the base is faked - one
// option in the picker, buildBook() stubbed, and the "book" answers 1...e5 then
// 2...Nc6. Everything from userMove() to the reply landing is the real code.
await step('Openings: my move -> book reply (seeded book)', () => evalP(`${A} const T = app.Trainer;
  const sel = document.getElementById('trainer-base'); sel.innerHTML = '<option value="1">seeded</option>'; sel.value = '1';
  T.buildBook = async () => {}; T.oneGame = false;
  const answers = ['e5', 'Nc6']; T.pickBookMove = () => answers.shift() ?? null;
  await T.start(); await wait(300);
  const r = [];
  for (const mv of [{ from: 'e2', to: 'e4' }, { from: 'g1', to: 'f3' }]) {
    r.push(await reply(T.board, mv, 9000));
    await until(() => !T.thinking, 9000); await wait(100);
  }
  return { ms: r, moves: T.chess.history().join(' ') };`));

// ── Endgames ─────────────────────────────────────────────────────────────────
await evalP(`document.querySelector('[data-screen="endgame"]').click();`);
await sleep(1200); await killModals();
await step('Endgames: my move -> book reply', () => evalP(`${A} const E = app.Endgame; const { ENDGAMES } = await import('${APP_URL}/js/endgames-data.js');
  const r = [];
  for (const pos of ENDGAMES) {
    if (r.length >= 4) break;
    if (!pos.moves || pos.moves.length < 4) continue;
    E.openPosition(pos); await wait(100); E.startPractice(); await wait(1000);
    if (E.chess.turn() !== E.playerColor || !E.board.interactive) continue;
    r.push(await reply(E.board, uciToMove(E.current.moves[E.moveIdx])));
    await wait(300);
  }
  return r;`));
await step('Endgames: my move -> engine reply (off the book)', () => evalP(`${A} const E = app.Endgame; const { ENDGAMES } = await import('${APP_URL}/js/endgames-data.js');
  const r = [];
  for (const pos of ENDGAMES) {
    if (r.length >= 3) break;
    if (!pos.moves || pos.moves.length < 4) continue;
    E.openPosition(pos); await wait(100); E.startPractice(); await wait(1000);
    if (E.chess.turn() !== E.playerColor || !E.board.interactive) continue;
    E.bookMode = false;
    const m = E.chess.moves({ verbose: true })[0];
    r.push(await reply(E.board, { from: m.from, to: m.to, promotion: m.promotion }, 9000));
    await until(() => !E.thinking, 9000); await wait(200);
  }
  return r;`));

// ── What the board itself does when a move lands ─────────────────────────────
await step('Board: animation on a landing piece', () => evalP(`
  const img = document.querySelector('#play-board .sq img');
  const cs = getComputedStyle(img), sq = getComputedStyle(img.parentElement);
  return { pieceTransition: cs.transitionDuration + ' ' + cs.transitionProperty, pieceAnimation: cs.animationName, squareTransition: sq.transitionDuration };`));

console.log(JSON.stringify(out, null, 2));
if (errors.length) console.error('PAGE ERRORS:\n' + errors.join('\n'));
ws.close(); chrome.kill(); server.close();
process.exit(0);
