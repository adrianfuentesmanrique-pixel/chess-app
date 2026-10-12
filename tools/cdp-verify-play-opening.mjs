// Headless-Chrome check that a game in Play still runs with the opening book
// and guard (js/play-book.js): the engine answers every move through the
// opening and past it, in its time, and a game from a set-up position is left
// to the limited engine as before. Dev tool, not shipped.
//
//   node tools/cdp-verify-play-opening.mjs
//
// SEEDED: onboardingDone and tourDone, through the app's own db.js.
// CALLED, NOT TOUCHED: Play.begin() and Play.userMove(), on the live Play
// object that import('/js/app.js') returns; my moves come from a second, full-strength engine so the game lasts.
// READ FROM THE PAGE: the move list, the status bar, and whether Play holds
// its opening engine. TIMED: from my move to the engine's reply.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 300000).unref();
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = url => new Promise((res, rej) => {
  http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});

const port = 9900 + Math.floor(Math.random() * 90);
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
await new Promise(r => server.listen(port, '127.0.0.1', r));

const dbg = 9300 + Math.floor(Math.random() * 600);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-'));
const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${dbg}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let ws, msgId = 0;
const pending = new Map();
for (let i = 0; i < 40; i++) {
  try {
    const page = (await getJSON(`http://127.0.0.1:${dbg}/json`)).find(t => t.type === 'page');
    if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
  } catch {}
  await sleep(250);
}
await new Promise(r => ws.on('open', r));
ws.on('message', m => {
  const msg = JSON.parse(m);
  if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result); }
});
const send = (method, params = {}) => { const id = ++msgId; ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => pending.set(id, { res, rej })); };
const evalP = async expr => {
  const r = await send('Runtime.evaluate', { expression: `(async()=>{ ${expr} })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
  return r.result.value;
};

// One game: `moves` of mine, each answered by the engine. Returns the wait for
// every reply and whether the opening engine was held at that point.
const GAME = (level, color, moves, fen) => `
  const { Play } = await import('/js/app.js');
  const { LEVELS, Engine, uciToMove } = await import('/js/engine.js');
  const me = window.__me ||= new Engine();
  const wait = async (ok, ms = 15000) => { const t0 = performance.now(); while (!ok()) { if (performance.now() - t0 > ms) return false; await new Promise(r => setTimeout(r, 5)); } return true; };
  Play.level = ${level};
  const t00 = performance.now();
  const { START_FEN } = await import('/js/tree.js');
  Play.begin(${JSON.stringify(color)}, ${fen ? JSON.stringify(fen) : 'START_FEN'});
  const out = { waits: [], held: [], firstMs: null, error: null };
  if (Play.chess.turn() !== Play.playerColor) { await wait(() => !Play.thinking && Play.chess.turn() === Play.playerColor); out.firstMs = Math.round(performance.now() - t00); }
  for (let i = 0; i < ${moves} && !Play.over; i++) {
    const mv = uciToMove(await me.bestMove(Play.chess.fen(), { movetime: 60 }));
    const n = Play.chess.history().length;
    const t0 = performance.now();
    Play.userMove({ from: mv.from, to: mv.to, promotion: mv.promotion });
    if (!await wait(() => Play.over || (!Play.thinking && Play.chess.history().length >= n + 2))) { out.error = 'no reply to move ' + (i + 1); break; }
    out.waits.push(Math.round(performance.now() - t0));
    out.held.push(!!Play.openEngine);
  }
  out.status = document.getElementById('play-status').innerText.trim();
  out.pgn = Play.chess.pgn().split(String.fromCharCode(10)).pop();
  out.movetime = LEVELS[${level}].movetime;
  return out;`;

let bad = 0;
const say = (ok, text) => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`); };
try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('lang', 'en'); localStorage.setItem('tourDone', '1'); } catch {}` });
  await send('Page.navigate', { url: `http://localhost:${port}` });
  await sleep(4000);
  await evalP(`const db = await import('/js/db.js'); await db.kvSet('onboardingDone', true); await db.kvSet('tourDone', true);`);
  await send('Page.reload', {});
  await sleep(4000);
  await evalP(`document.querySelector('#tabbar button[data-screen="play"]').click();`);
  await sleep(500);

  for (const [level, color] of [[0, 'w'], [0, 'b'], [4, 'b'], [7, 'w']]) {
    await send('Page.reload', {});
    await sleep(3500);
    await evalP(`document.querySelector('#tabbar button[data-screen="play"]').click();`);
    await sleep(400);
    const r = await evalP(GAME(level, color, 15));
    const slack = 250;   // one worker start may fall on a move
    const late = r.waits.filter(w => w > Math.max(r.movetime, 300) + slack);
    const ok = !r.error && r.waits.length === 15 && !late.length && !r.status.includes('⚠');
    say(ok, `level ${level + 1}, engine plays ${color === 'w' ? 'Black' : 'White'}: 15 replies${r.firstMs !== null ? `, engine's first move after ${r.firstMs} ms` : ''}; waits ${r.waits.join(' ')} ms (level time ${r.movetime})${r.error ? '; ' + r.error : ''}`);
    say(r.held[14] === false && r.held[12] === false, `     opening engine let go after move 12 (held per move: ${r.held.map(h => h ? 'y' : '-').join('')})`);
    console.log(`     ${r.pgn}`);
  }
  const KQK = '8/8/8/4k3/8/8/3Q4/4K3 b - - 0 1';
  await send('Page.reload', {});
  await sleep(3500);
  const r = await evalP(GAME(2, 'b', 3, KQK));
  say(!r.error && r.waits.length === 3 && r.held.every(h => !h), `set-up position: 3 replies, no opening engine (waits ${r.waits.join(' ')} ms) ${r.pgn}`);
} catch (e) { say(false, e.message); }
finally {
  try { ws.close(); } catch {}
  proc.kill();
  await new Promise(r => { server.close(r); server.closeAllConnections(); });
  await sleep(800);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
console.log(bad ? `\n${bad} FAILED` : '\nALL PASSED');
process.exit(bad ? 1 : 0);
