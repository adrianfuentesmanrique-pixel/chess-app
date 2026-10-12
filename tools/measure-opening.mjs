// How well does the Play engine handle the OPENING at each level? Dev tool, not
// shipped. Runs the app's own js/engine.js (and so the app's own Stockfish
// worker) in headless Chrome over CDP.
//
//   node tools/measure-opening.mjs <outDir>
//
// GAMES=24 (per configuration, half with each colour), SLOTS=6 (games running
// at once, each on its own two workers), JUDGE_MS=400, ONLY=lv1,full@300 to run
// a few configurations.
//
// ONE GAME: the level under test ("the subject") plays its first 12 moves the
// way Play.engineMove() asks for them: engine.bestMove(fen, {movetime, elo})
// on a fresh Engine, given only the position. The opponent plays a line from
// js/openings-eco.js while there is one (picked with a seeded dice, so every
// configuration meets the same opponent taste), then the full-strength
// engine's best move.
//
// A SECOND, separate full-strength engine (the judge) scores the position
// before and after every subject move. It is separate so its searching never
// warms the subject's memory. What a move cost = score before - score after,
// from the subject's side, in centipawns (100 = one pawn).
//
// READ THIS BEFORE TRUSTING A NUMBER: a desktop PC searches several times
// faster than a phone, so every figure here is an UPPER BOUND on what a phone
// user gets. The "@60" rows give the engine a fifth of the time to imitate a
// slow phone; that is an imitation, not a phone.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/measure-opening.mjs <outDir>'); process.exit(1); }
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const GAMES = +(process.env.GAMES || 24);
const SLOTS = +(process.env.SLOTS || 6);
const JUDGE_MS = +(process.env.JUDGE_MS || 400);
const FULL_MOVES = 12;
fs.mkdirSync(OUT, { recursive: true });

const { LEVELS } = await import(pathToFileURL(path.join(ROOT, 'js/engine.js')));
const { REPLY_MS } = await import(pathToFileURL(path.join(ROOT, 'js/move-feel.js')));
const { OPENINGS_ECO } = await import(pathToFileURL(path.join(ROOT, 'js/openings-eco.js')));

// "Theory" for this tool: every move that continues a line of openings-eco.js.
const BOOK = {};
for (const e of OPENINGS_ECO) {
  for (let i = 0; i < e.moves.length; i++) {
    const key = e.moves.slice(0, i).join(' ');
    (BOOK[key] ||= []).includes(e.moves[i]) || BOOK[key].push(e.moves[i]);
  }
}

const CONFIGS = [
  ...LEVELS.map((lv, i) => ({ id: `lv${i + 1}`, label: `Level ${i + 1} (${lv.range})`, elo: lv.elo, movetime: lv.movetime, level: i })),
  { id: 'full@300', label: 'Full strength, 300 ms', elo: null, movetime: 300 },
  { id: 'full@500', label: 'Full strength, 500 ms', elo: null, movetime: 500 },
  { id: 'full@800', label: 'Full strength, 800 ms', elo: null, movetime: 800 },
  { id: '1320@1500', label: 'Elo 1320 with 1500 ms', elo: 1320, movetime: 1500 },
  { id: '2000@1500', label: 'Elo 2000 with 1500 ms', elo: 2000, movetime: 1500 },
  { id: '1320@60', label: 'Elo 1320 with 60 ms (slow phone)', elo: 1320, movetime: 60 },
  { id: '2000@60', label: 'Elo 2000 with 60 ms (slow phone)', elo: 2000, movetime: 60 },
  { id: 'full@60', label: 'Full strength, 60 ms (slow phone)', elo: null, movetime: 60 },
].filter(c => !process.env.ONLY || process.env.ONLY.split(',').includes(c.id));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = url => new Promise((res, rej) => {
  http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});

async function startServer() {
  const port = 9900 + Math.floor(Math.random() * 90);
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/__bench.html') { res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>bench</title>'); return; }
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size });
      fs.createReadStream(file).pipe(res);
    });
  });
  await new Promise(r => server.listen(port, '127.0.0.1', r));
  return { url: `http://localhost:${port}`, stop: () => new Promise(r => { server.close(r); server.closeAllConnections(); }) };
}

async function startChrome() {
  const port = 9300 + Math.floor(Math.random() * 600);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-'));
  const proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });
  let ws, msgId = 0;
  const pending = new Map();
  for (let i = 0; i < 40; i++) {
    try {
      const page = (await getJSON(`http://127.0.0.1:${port}/json`)).find(t => t.type === 'page');
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
    }
  });
  const send = (method, params = {}) => {
    const id = ++msgId;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => pending.set(id, { res, rej }));
  };
  const evalP = async expr => {
    const r = await send('Runtime.evaluate', { expression: `(async()=>{ ${expr} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
    return r.result.value;
  };
  const close = async () => {
    try { ws.close(); } catch {}
    proc.kill();
    await sleep(800);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  };
  return { send, evalP, close };
}

// Runs in the page. One game; returns what every subject move cost.
const PAGE = `
  const { Engine, uciToMove } = await import('/js/engine.js');
  const { Chess } = await import('/vendor/chess.js');
  const pick = await import('/js/play-book.js').catch(() => null);
  window.__judges = [];
  window.__game = async (slot, g) => {
    let s = g.seed >>> 0;
    const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const judge = window.__judges[slot] ||= new Engine();
    const subject = new Engine();
    let guard = null;
    const chess = new Chess();
    const sans = [], moves = [];
    const sign = g.color === 'w' ? 1 : -1;
    const clamp = v => Math.max(-1500, Math.min(1500, v));
    let evalNow = null, oppBest = null, leftAt = null, made = 0, firstMs = null, restMs = 0;
    try {
      while (made < g.fullMoves && !chess.isGameOver()) {
        const key = sans.join(' ');
        const book = g.book[key];
        if (chess.turn() === g.color) {
          if (evalNow === null) evalNow = clamp((await judge.evaluateBest(chess.fen(), g.judgeMs)).score);
          const t0 = performance.now();
          let m = null, fromBook = false;
          // APP_BOOK=1: the move comes from js/play-book.js exactly as
          // Play.engineMove() gets it, guard search on an engine of its own.
          if (g.useAppBook && pick) {
            const p = await pick.openingMove({ sans: chess.history(), level: g.level,
              topMoves: async count => (await (guard ||= new Engine()).topMoves(chess.fen(), { movetime: g.movetime, count })).lines });
            if (p) { try { m = chess.move(p.book ? p.san : uciToMove(p.uci)); fromBook = p.book; } catch { m = null; } }
            if (p && p.book) await new Promise(r => setTimeout(r, g.bookMs));
          }
          if (!m) {
            const uci = await subject.bestMove(chess.fen(), { movetime: g.movetime, elo: g.elo });
            if (!uci) break;
            m = chess.move(uciToMove(uci));
          }
          const ms = performance.now() - t0;
          if (firstMs === null) firstMs = ms; else restMs += ms;
          made++;
          const san = m.san.replace(/[+#]$/, '');
          if (leftAt === null && book && !book.includes(san)) leftAt = made;
          sans.push(san);
          const r = await judge.evaluateBest(chess.fen(), g.judgeMs);
          const after = clamp(r.score);
          moves.push({ n: made, san: m.san, loss: Math.round((evalNow - after) * sign), after: Math.round(after * sign), inBook: !!book, fromBook });
          evalNow = after; oppBest = r.best;
        } else {
          let m = null;
          if (book) { try { m = chess.move(book[Math.floor(rnd() * book.length)]); } catch { m = null; } }
          if (!m) {
            const uci = oppBest || (await judge.evaluateBest(chess.fen(), g.judgeMs)).best;
            if (!uci) break;
            m = chess.move(uciToMove(uci));
          }
          sans.push(m.san.replace(/[+#]$/, ''));
          evalNow = null; oppBest = null;
        }
      }
    } finally { subject.terminate(); if (guard) guard.terminate(); }
    return { color: g.color, seed: g.seed, moves, line: chess.pgn().split(String.fromCharCode(10)).pop(), leftAt, firstMs: Math.round(firstMs), restMs: Math.round(restMs / Math.max(1, made - 1)) };
  };
  return true;`;

const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };

function summarise(cfg, games) {
  const done = games.filter(g => g.moves.length);
  const final = done.map(g => -g.moves[g.moves.length - 1].after);          // + = behind
  const lost = done.map(g => g.moves.reduce((s, m) => s + Math.max(0, m.loss), 0));
  const worst = done.flatMap(g => g.moves.map(m => ({ ...m, color: g.color, line: g.line })));
  return {
    id: cfg.id, label: cfg.label, elo: cfg.elo, movetime: cfg.movetime, games: done.length,
    behindMedian: Math.round(median(final)), behindMean: Math.round(mean(final)),
    lostPerGame: Math.round(mean(lost)),
    leftTheoryBy5: Math.round(100 * done.filter(g => g.leftAt !== null && g.leftAt <= 5).length / done.length),
    slipBy5: Math.round(100 * done.filter(g => g.moves.some(m => m.n <= 5 && m.loss >= 50)).length / done.length),
    blunders: +(mean(done.map(g => g.moves.filter(m => m.loss >= 100).length))).toFixed(1),
    lostGames: Math.round(100 * final.filter(v => v >= 200).length / done.length),
    firstMs: Math.round(median(done.map(g => g.firstMs))), restMs: Math.round(median(done.map(g => g.restMs))),
    firstMoves: tally(done.filter(g => g.color === 'w').map(g => g.moves[0].san)),
    worst: worst.sort((a, b) => b.loss - a.loss).slice(0, 5),
  };
}
function tally(a) { const o = {}; for (const x of a) o[x] = (o[x] || 0) + 1; return o; }

const web = await startServer();
const c = await startChrome();
const results = [];
try {
  await c.send('Page.enable'); await c.send('Runtime.enable');
  await c.send('Page.navigate', { url: web.url + '/__bench.html' });
  await sleep(1200);
  await c.evalP(PAGE);
  const jobs = [];
  for (const cfg of CONFIGS) {
    for (let i = 0; i < GAMES; i++) {
      jobs.push({ cfg, g: { elo: cfg.elo, movetime: cfg.movetime, level: cfg.level ?? null, useAppBook: !!process.env.APP_BOOK && cfg.id.startsWith('lv'),
        color: i % 2 ? 'b' : 'w', seed: 1000 + i, judgeMs: JUDGE_MS, fullMoves: FULL_MOVES, book: BOOK, bookMs: REPLY_MS.playBook || 0 } });
    }
  }
  const byCfg = new Map(CONFIGS.map(cfg => [cfg.id, []]));
  let next = 0, finished = 0;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: SLOTS }, async (_, slot) => {
    while (next < jobs.length) {
      const j = jobs[next++];
      const r = await c.evalP(`return await window.__game(${slot}, ${JSON.stringify(j.g)});`).catch(e => ({ error: e.message, moves: [] }));
      byCfg.get(j.cfg.id).push(r);
      if (++finished % 20 === 0) console.error(`${finished}/${jobs.length} games, ${Math.round((Date.now() - t0) / 1000)} s`);
    }
  }));
  for (const cfg of CONFIGS) results.push({ ...summarise(cfg, byCfg.get(cfg.id)), raw: byCfg.get(cfg.id) });
} finally { await c.close(); await web.stop().catch(() => {}); }

const tag = process.env.TAG || 'before';
fs.writeFileSync(path.join(OUT, `opening-${tag}.json`), JSON.stringify(results, null, 1));
const pad = (s, n) => String(s).padEnd(n);
console.log(`\n${GAMES} games per row, first ${FULL_MOVES} moves, judge ${JUDGE_MS} ms. Desktop PC: an upper bound for a phone.\n`);
console.log(pad('configuration', 36) + pad('behind@12', 11) + pad('lost/game', 11) + pad('blunders', 10) + pad('lost by 12', 12) + pad('slip<=5', 9) + pad('off list<=5', 13) + pad('1st ms', 8) + 'next ms');
for (const r of results) {
  console.log(pad(r.label, 36) + pad(r.behindMedian + ' cp', 11) + pad(r.lostPerGame + ' cp', 11) + pad(r.blunders, 10) + pad(r.lostGames + '%', 12) + pad(r.slipBy5 + '%', 9) + pad(r.leftTheoryBy5 + '%', 13) + pad(r.firstMs, 8) + r.restMs);
}
console.log('\nWorst moves per configuration:');
for (const r of results) {
  console.log(`\n${r.label}  - first moves as White: ${JSON.stringify(r.firstMoves)}`);
  for (const w of r.worst.slice(0, 3)) console.log(`  move ${w.n} ${w.san} (${w.color === 'w' ? 'White' : 'Black'}) cost ${w.loss} cp, left it at ${w.after} cp :: ${w.line}`);
}
