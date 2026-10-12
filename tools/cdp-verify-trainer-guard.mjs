// Headless-Chrome check that a game in the Openings trainer still runs once it
// has left its book, now that the engine's move there gets the same second
// look as in Play (`playMove` in js/play-book.js, 2026-10-12): every reply
// comes, in its time; the second (full-strength) engine is held out of the
// book at every level but the top one and let go when the game is left; and
// leaving a game while the engine thinks does not freeze the next one.
// Dev tool, not shipped.
//
//   node tools/cdp-verify-trainer-guard.mjs
//
// SEEDED: onboardingDone and tourDone through the app's own db.js; a four-ply
// book (1.e4 e5 2.Nf3 Nc6) put straight on Trainer.book with a matching
// bookKey and one made-up entry in #trainer-base, so no database is written.
// CALLED, NOT TOUCHED: Trainer.start() and Trainer.userMove(), on the live
// object that import('/js/app.js') returns; the real "back" button is clicked.
// My moves come from a separate full-strength engine so the game lasts.
// READ FROM THE PAGE: the status bar, the book badge, Trainer.guardEngine.
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

// Shared page helpers: the seeded book and a way to start a game on it.
const SETUP = level => `
  const { Trainer } = await import('/js/app.js');
  const { LEVELS, Engine, uciToMove } = await import('/js/engine.js');
  const { Chess } = await import('/vendor/chess.js');
  const { fenKey } = await import('/js/explore-index.js');
  const me = window.__me ||= new Engine();
  const wait = async (ok, ms = 15000) => { const t0 = performance.now(); while (!ok()) { if (performance.now() - t0 > ms) return false; await new Promise(r => setTimeout(r, 5)); } return true; };
  const begin = async () => {
    const c = new Chess(), book = new Map();
    for (const san of ['e4', 'e5', 'Nf3', 'Nc6']) { book.set(fenKey(c.fen()), { [san]: 1 }); c.move(san); }
    const sel = document.getElementById('trainer-base');
    sel.innerHTML = '<option value="987654" data-count="1">check</option>';
    sel.value = '987654';
    Trainer.oneGame = false;
    Trainer.book = book; Trainer.bookComments = new Map(); Trainer.bookKey = '987654|';
    await Trainer.start();
    Trainer.level = ${level};
    return await wait(() => !Trainer.thinking && Trainer.chess.turn() === Trainer.playerColor);
  };`;

const GAME = (level, moves) => `${SETUP(level)}
  const out = { waits: [], held: [], inBook: [], error: null };
  if (!await begin()) { out.error = 'the game did not start'; return out; }
  for (let i = 0; i < ${moves} && !Trainer.over; i++) {
    const book = Trainer.book.get(fenKey(Trainer.chess.fen()));
    const mv = book ? Trainer.chess.moves({ verbose: true }).find(m => m.san === Object.keys(book)[0])
                    : uciToMove(await me.bestMove(Trainer.chess.fen(), { movetime: 60 }));
    const n = Trainer.chess.history().length;
    const t0 = performance.now();
    Trainer.userMove({ from: mv.from, to: mv.to, promotion: mv.promotion });
    if (!await wait(() => Trainer.over || (!Trainer.thinking && Trainer.chess.history().length >= n + 2))) { out.error = 'no reply to move ' + (i + 1); break; }
    out.waits.push(Math.round(performance.now() - t0));
    out.held.push(!!Trainer.guardEngine);
    out.inBook.push(!!Trainer.inBook);
  }
  out.status = document.getElementById('trainer-status').innerText.trim();
  out.badge = document.getElementById('trainer-book-status').innerText.trim();
  out.pgn = Trainer.chess.pgn().split(String.fromCharCode(10)).pop();
  out.movetime = LEVELS[${level}].movetime;
  document.getElementById('trainer-back').click();
  await new Promise(r => setTimeout(r, 1500));
  out.heldAfterBack = !!Trainer.guardEngine;
  return out;`;

// Leave while the engine thinks, start again at once: the new game must answer.
const LEAVE = level => `${SETUP(level)}
  if (!await begin()) return { error: 'the game did not start' };
  for (let i = 0; i < 4; i++) {
    const book = Trainer.book.get(fenKey(Trainer.chess.fen()));
    const mv = book ? Trainer.chess.moves({ verbose: true }).find(m => m.san === Object.keys(book)[0])
                    : uciToMove(await me.bestMove(Trainer.chess.fen(), { movetime: 60 }));
    const n = Trainer.chess.history().length;
    Trainer.userMove({ from: mv.from, to: mv.to, promotion: mv.promotion });
    if (i < 3 && !await wait(() => !Trainer.thinking && Trainer.chess.history().length >= n + 2)) return { error: 'no reply to move ' + (i + 1) };
  }
  await new Promise(r => setTimeout(r, 120));
  const wasThinking = Trainer.thinking, held = !!Trainer.guardEngine;
  document.getElementById('trainer-back').click();
  if (!await begin()) return { error: 'the second game did not start', wasThinking, held };
  const mv = Trainer.chess.moves({ verbose: true }).find(m => m.san === 'e4' || m.san === 'e5');
  const n = Trainer.chess.history().length;
  Trainer.userMove({ from: mv.from, to: mv.to });
  const answered = await wait(() => !Trainer.thinking && Trainer.chess.history().length >= n + 2);
  return { wasThinking, held, answered, history: Trainer.chess.history().join(' '), status: document.getElementById('trainer-status').innerText.trim() };`;

let bad = 0;
const say = (ok, text) => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`); };
const open = async () => {
  await send('Page.reload', {});
  await sleep(3500);
  await evalP(`document.querySelector('#tabbar button[data-screen="trainer"]').click();`);
  await sleep(700);
};
try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('lang', 'en'); localStorage.setItem('tourDone', '1'); } catch {}` });
  await send('Page.navigate', { url: `http://localhost:${port}` });
  await sleep(4000);
  await evalP(`const db = await import('/js/db.js'); await db.kvSet('onboardingDone', true); await db.kvSet('tourDone', true);`);

  for (const level of [0, 3, 5, 7]) {
    await open();
    const r = await evalP(GAME(level, 12));
    const slack = 250;   // one worker start may fall on a move
    const most = (level < 5 ? 2 : 1) * Math.max(r.movetime, 300) + slack;
    // The first reply out of the book starts the second engine (7 MB to load).
    const out = r.inBook.indexOf(false);
    const late = r.waits.filter((w, i) => i !== out && w > most);
    const ok = !r.error && r.waits.length === 12 && out >= 0 && !late.length && !r.status.includes('⚠');
    say(ok, `level ${level + 1}: 12 replies, out of the book from my move ${out + 1}; waits ${r.waits.join(' ')} ms (level time ${r.movetime}, the most allowed ${most})${r.error ? '; ' + r.error : ''}`);
    const after = r.held.slice(out);
    if (level === 7) say(after.every(h => !h), `     top level: no second engine (held per move: ${r.held.map(h => h ? 'y' : '-').join('')})`);
    else say(after.every(h => h) && r.held.slice(0, out).every(h => !h), `     second engine held only out of the book (held per move: ${r.held.map(h => h ? 'y' : '-').join('')}), badge "${r.badge}"`);
    say(!r.heldAfterBack, `     second engine let go on leaving the game`);
    console.log(`     ${r.pgn}`);
  }
  await open();
  const l = await evalP(LEAVE(2));
  say(!l.error && l.wasThinking && l.answered && !String(l.status).includes('⚠'), `left while the engine was thinking (${l.wasThinking ? 'it was' : 'it was NOT'}), started again: the new game answers (${l.history || l.error})`);
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
