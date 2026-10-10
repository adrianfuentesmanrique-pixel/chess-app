// Headless-Chrome verification of move feel (v181): the slide, the sound each
// move asks for, pre-moves, and that a reply never lands on the wrong puzzle.
// Dev tool, not shipped.
//
//   node tools/cdp-verify-move-feel.mjs <outDir>
//
// REALLY TAPPED / DRAGGED (a finger down, moved, up): e2-e4 by two taps and
// d2-d4 by a drag on the Play board.
// CALLED, not tapped: every other move (board.onMove / board._tap), the
// screen starts (Play.begin, Rush.start, Endgame.openPosition…), Next.
// SOUND: only WHICH sound is asked for is checked, and that all 11 files
// decode. What they sound like cannot be judged here.
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/cdp-verify-move-feel.mjs <outDir>'); process.exit(1); }
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
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-movefeel-'));
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 600000).unref();

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

await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
fs.mkdirSync(OUT, { recursive: true });

const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok }); console.error((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); };
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
}
async function load(lang, scheme, reduce = false) {
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: reduce ? 'reduce' : 'no-preference' }] });
  await send('Page.navigate', { url: APP_URL });
  await sleep(2500);
  await evalP(`localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1');`);
  await send('Page.reload', {});
  await sleep(3500);
  await killModals();
  // Every sound asked for is written down; nothing is actually played.
  await evalP(`const { Sound } = await import('${APP_URL}/js/sound.js'); window.__snd = []; Sound.play = n => window.__snd.push(n);`);
}
const touch = (type, pts) => send('Input.dispatchTouchEvent', { type, touchPoints: pts });
const centre = (board, sq) => evalP(`const r = document.querySelector('#${board} [data-sq="${sq}"]').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };`);
async function tapSq(board, sq) { const p = await centre(board, sq); await touch('touchStart', [{ ...p, id: 1 }]); await sleep(40); await touch('touchEnd', []); await sleep(30); }
async function dragSq(board, from, to) {
  const a = await centre(board, from), b = await centre(board, to);
  await touch('touchStart', [{ ...a, id: 1 }]); await sleep(40);
  for (let i = 1; i <= 5; i++) { await touch('touchMove', [{ x: Math.round(a.x + (b.x - a.x) * i / 5), y: Math.round(a.y + (b.y - a.y) * i / 5), id: 1 }]); await sleep(20); }
  await touch('touchEnd', []);
}
const A = `const app = await import('${APP_URL}/js/app.js'); const { uciToMove } = await import('${APP_URL}/js/engine.js');
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const until = async (fn, ms = 20000) => { const t = performance.now(); while (!fn()) { if (performance.now() - t > ms) throw new Error('until timed out: ' + fn); await wait(20); } };
  const anims = (board, sq) => { const img = board.squares[sq].querySelector('img'); return img ? img.getAnimations().map(a => ({ ms: a.effect.getTiming().duration, ease: a.effect.getTiming().easing })) : null; };
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';`;
const openPlay = async () => { await evalP(`document.querySelector('[data-screen="play"]').click();`); await sleep(1000); await killModals(); };

// ═══ behaviour (English, light) ═════════════════════════════════════════════
await load('en', 'light');
let o = await evalP(`const { Sound } = await import('${APP_URL}/js/sound.js'); const { SOUND_NAMES } = await import('${APP_URL}/js/move-feel.js');
  for (let i = 0; i < 50 && Object.keys(Sound.buffers).length < SOUND_NAMES.length; i++) await new Promise(r => setTimeout(r, 100));
  return { decoded: Object.keys(Sound.buffers).sort(), want: [...SOUND_NAMES].sort(), secs: Object.fromEntries(Object.entries(Sound.buffers).map(([k, b]) => [k, +b.duration.toFixed(2)])) };`);
check('all 8 sound files load and decode', JSON.stringify(o.decoded) === JSON.stringify(o.want), o.secs);

await openPlay();
await evalP(`${A} app.Play.level = 7; app.Play.begin('w', START);`);   // level 7 thinks 1.2 s: time to look
await sleep(300);
await tapSq('play-board', 'e2'); await tapSq('play-board', 'e4');
o = await evalP(`${A} return { a: anims(app.Play.board, 'e4'), fen: app.Play.board.fen.split(' ')[0], snd: window.__snd.slice() };`);
check('a tapped move slides: one 200 ms ease-in-out animation on the piece', !!o.a && o.a.length === 1 && o.a[0].ms === 200 && o.a[0].ease.startsWith('cubic-bezier(0.65'), o);
check('…and asks for the "move" sound', o.snd.at(-1) === 'move', o.snd);
await evalP(`${A} const img = app.Play.board.squares.e4.querySelector('img'); const a = img.getAnimations()[0]; a.pause(); a.currentTime = 100;`);
await shot('mid-slide-e2e4');
o = await evalP(`${A} const img = app.Play.board.squares.e4.querySelector('img'), sq = app.Play.board.squares.e4.getBoundingClientRect(), r = img.getBoundingClientRect();
  const out = { offBy: Math.round(r.top - sq.top), square: Math.round(sq.height) }; img.getAnimations()[0].finish(); return out;`);
check('halfway through, the pawn is drawn one square short of e4', Math.abs(o.offBy - o.square) <= 2, o);
o = await evalP(`${A} await until(() => !app.Play.thinking, 9000); const h = app.Play.chess.history({ verbose: true }).at(-1); return { reply: h.san, a: anims(app.Play.board, h.to) };`);
check("the engine's reply slides too", !!o.a && o.a.length === 1, o);
await sleep(300);
await dragSq('play-board', 'd2', 'd4');
o = await evalP(`${A} return { a: anims(app.Play.board, 'd4'), moved: !!app.Play.board.squares.d4.querySelector('img') && app.Play.chess.history().length >= 3 };`);
check('a dragged move is made and does NOT slide', o.moved && !!o.a && o.a.length === 0, o);
await evalP(`${A} await until(() => !app.Play.thinking, 9000);`);

// which sound each kind of move asks for
for (const [name, fen, mv, want, extra] of [
  ['capture', '4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1', { from: 'e4', to: 'd5' }, 'capture'],
  ['castle', 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', { from: 'e1', to: 'g1' }, 'castle', 'f1'],
  ['promotion', '8/P6k/8/8/8/8/8/K7 w - - 0 1', { from: 'a7', to: 'a8', promotion: 'q' }, 'promote'],
  ['check', '4k3/8/8/8/8/8/8/4KQ2 w - - 0 1', { from: 'f1', to: 'f7' }, 'check'],
  ['capture that gives check', '4k3/5p2/8/8/8/8/8/4KQ2 w - - 0 1', { from: 'f1', to: 'f7' }, 'check'],
]) {
  o = await evalP(`${A} const P = app.Play; P.level = 7; P.begin('w', ${JSON.stringify(fen)}); await wait(60); const n = window.__snd.length;
    P.board.onMove(${JSON.stringify(mv)});
    const out = { snd: window.__snd.slice(n), rook: ${extra ? `anims(P.board, '${extra}')` : 'null'} };
    await until(() => !P.thinking, 9000); return out;`);
  const now = ['move', 'capture'].includes(want) ? want : (name.includes('capture') ? 'capture' : 'move');   // v182: only move and capture have a file
  check(`${name}: asks for "${now}", once`, o.snd.length === 1 && o.snd[0] === now, o.snd);
  if (extra) check('castling: the rook slides as well as the king', !!o.rook && o.rook.length === 1, o.rook);
}

// Puzzles: pre-move, and a reply that must not land on the next puzzle
await evalP(`document.querySelector('[data-screen="puzzles"]').click();`);
await sleep(1500); await killModals();
o = await evalP(`${A} const P = app.Puzzles;
  for (let i = 0; i < 80 && !(P.current && P.current.moves.length >= 6); i++) { await P.nextPuzzle(); }
  await wait(700);
  const m = P.current.moves, start = P.moveIdx;
  P.board.onMove(uciToMove(m[1]));                     // my move; the reply is now pending
  const armed = P.board._premoveActive();
  const pm = uciToMove(m[3]); await P.board._tap(pm.from); await P.board._tap(pm.to);   // queue my next one
  const queued = !!P.board.premove;
  await wait(900);
  return { len: m.length, start, armed, queued, moveIdx: P.moveIdx, left: P.board.premove };`);
check('Puzzles: a pre-move queued during the wait is played the moment the reply lands', o.armed && o.queued && o.moveIdx >= 4 && !o.left, o);
o = await evalP(`${A} const P = app.Puzzles;
  for (let i = 0; i < 80 && !(P.current && P.current.moves.length >= 4); i++) { await P.nextPuzzle(); }
  await wait(700);
  const old = P.current;
  P.board.onMove(uciToMove(old.moves[1]));             // reply pending…
  await P.nextPuzzle();                                // …and I am already on the next puzzle
  const now = P.current;
  await wait(1000);
  return { changed: now !== old && P.current === now, moveIdx: P.moveIdx, plies: P.chess.history().length, boardIsGame: P.board.fen === P.chess.fen() };`);
check('Puzzles: Next during the wait - the old reply never lands on the new puzzle', o.changed && o.moveIdx === 1 && o.plies === 1 && o.boardIsGame, o);

// Rush: the same two things on the engine Duel shares
await evalP(`document.querySelector('#screen-puzzles .puzzle-modes [data-v="rush"]').click();`);
await sleep(800); await killModals();
o = await evalP(`${A} const R = app.Rush; await R.start();
  await until(() => R.running && !R.countingIn && R.board.interactive, 15000);
  let pre = null;
  for (let i = 0; i < 40 && R.running && !pre; i++) {
    await until(() => R.board.interactive, 5000);
    const m = R.current.moves, cur = R.current;
    if (m.length - R.moveIdx >= 3) {
      const at = R.moveIdx;
      R.board.onMove(uciToMove(m[at]));
      const pm = uciToMove(m[at + 2]); await R.board._tap(pm.from); await R.board._tap(pm.to);
      const queued = !!R.board.premove;
      await wait(500);
      pre = { queued, advanced: R.current !== cur || R.moveIdx >= at + 3 };
    } else { R.board.onMove(uciToMove(m[R.moveIdx])); await wait(60); }
  }
  // solved -> next: by the time the next puzzle's opening move lands, the board shows THAT puzzle
  await wait(900); await until(() => R.board.interactive, 5000);
  while (R.current.moves.length - R.moveIdx >= 3) { R.board.onMove(uciToMove(R.current.moves[R.moveIdx])); await wait(400); await until(() => R.board.interactive, 5000); }
  const old = R.current; R.board.onMove(uciToMove(R.current.moves[R.moveIdx]));
  await wait(900);
  return { pre, next: { changed: R.current !== old, moveIdx: R.moveIdx, plies: R.chess.history().length, boardIsGame: R.board.fen === R.chess.fen() }, strikes: R.strikes };`);
check('Rush (and so Duel): a pre-move fires after the faster reply', !!o.pre && o.pre.queued && o.pre.advanced, o.pre);
check('Rush (and so Duel): after a solve the next puzzle gets its own opening move, nothing else', o.next.changed && o.next.moveIdx === 1 && o.next.plies === 1 && o.next.boardIsGame && o.strikes === 0, o);
await evalP(`window.scrollTo(0, 0);`);
await shot('rush-en-light');

// reduce motion: no slide at all
await load('en', 'light', true);
await openPlay();
o = await evalP(`${A} app.Play.level = 7; app.Play.begin('w', START); await wait(100); app.Play.board.onMove({ from: 'e2', to: 'e4' }); return { a: anims(app.Play.board, 'e4') };`);
check('phone set to reduce motion: the piece does not slide', !!o.a && o.a.length === 0, o);

// ═══ every changed screen: 375 px, light and dark, Spanish and English ═══════
for (const [lang, scheme] of [['es', 'light'], ['es', 'dark'], ['en', 'light'], ['en', 'dark']]) {
  const tag = `${lang}-${scheme}`;
  console.error(`\n== ${tag} ==`);
  await load(lang, scheme);
  const wide = async name => { const w = await evalP(`return document.documentElement.scrollWidth;`); check(`${tag}: ${name} - nothing wider than 375`, w <= 375, w); await evalP(`window.scrollTo(0, 0);`); await shot(`${name}-${tag}`); };
  await openPlay();
  await evalP(`${A} app.Play.level = 0; app.Play.begin('w', START); await wait(100); app.Play.board.onMove({ from: 'e2', to: 'e4' }); await until(() => !app.Play.thinking, 9000); await wait(350);`);
  await wide('play');
  await evalP(`document.querySelector('[data-screen="puzzles"]').click();`);
  await sleep(1500); await killModals();
  await evalP(`${A} const P = app.Puzzles; for (let i = 0; i < 60 && !(P.current && P.current.moves.length >= 4); i++) await P.nextPuzzle(); await wait(700); P.board.onMove(uciToMove(P.current.moves[1])); await wait(700);`);
  await wide('puzzles');
  await evalP(`document.querySelector('#screen-puzzles .puzzle-modes [data-v="rush"]').click();`);
  await sleep(700); await killModals();
  await evalP(`${A} const R = app.Rush; await R.start(); await until(() => R.running && !R.countingIn && R.board.interactive, 15000); R.board.onMove(uciToMove(R.current.moves[R.moveIdx])); await wait(700);`);
  await wide('rush');
  await evalP(`${A} await app.Rush.finish('x');`).catch(() => {});
  await sleep(500); await killModals();
  await evalP(`document.querySelector('#screen-puzzles .puzzle-modes [data-v="blind"]').click();`);
  await sleep(900); await killModals();
  await evalP(`document.getElementById('blind-go').click();`);
  await sleep(1500);
  await wide('blindfold');
  await evalP(`${A} app.Blind.showStart(); document.querySelector('#screen-puzzles .puzzle-modes [data-v="puzzles"]').click();`);
  await evalP(`document.querySelector('[data-screen="endgame"]').click();`);
  await sleep(1200); await killModals();
  await evalP(`${A} const E = app.Endgame; const { ENDGAMES } = await import('${APP_URL}/js/endgames-data.js');
    for (const pos of ENDGAMES) { if (!pos.moves || pos.moves.length < 4) continue; E.openPosition(pos); await wait(100); E.startPractice(); await wait(700);
      if (E.chess.turn() === E.playerColor && E.board.interactive) { E.board.onMove(uciToMove(E.current.moves[E.moveIdx])); await wait(700); break; } }`);
  await wide('endgames');
  await evalP(`document.querySelector('[data-screen="trainer"]').click();`);
  await sleep(1000); await killModals();
  await wide('openings');
}

const failed = checks.filter(c => !c.ok);
console.error(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (errors.length) console.error('PAGE ERRORS:\n' + errors.join('\n'));
ws.close(); chrome.kill(); server.close();
process.exit(failed.length || errors.length ? 1 : 0);
