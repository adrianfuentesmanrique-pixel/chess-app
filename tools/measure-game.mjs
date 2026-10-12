// What is each Play level worth over a WHOLE game? Dev tool, not shipped. Runs
// the app's own js/engine.js and js/play-book.js (and so the app's own
// Stockfish worker) in headless Chrome over CDP, like tools/measure-opening.mjs.
//
//   node tools/measure-game.mjs <outDir>
//
// GAMES=20 (per pairing, half with each colour), SLOTS=6 (games running at
// once), JUDGE_MS=300, TAG=before, PAIRS=lv1-lv2,lv1-lv8 to run a few pairings
// (default: every level against the next one up and against level 8, which IS
// the full-strength engine).
//
// ONE GAME: both sides take their moves the way Play.engineMove() does. Each has
// an engine of its own; for its first 12 moves the move comes from
// js/play-book.js (book, then the full-strength guard on a second engine), and
// after that from `playMove` of js/play-book.js (the limiter's move checked by
// a full-strength search, or the guard). OLD=1 plays the rest of the game as
// the app did before 2026-10-12: engine.bestMove(fen, {movetime, elo}) alone.
//
// A separate full-strength engine (the judge) scores the position after every
// move that is not a book move. What a move cost = score before - score after,
// from the mover's side, in centipawns (100 = one pawn), scores held to +-1500.
// Mistakes are counted only AFTER a side's 12th move and only while the game
// was still open (the mover between -600 and +600 before the move): throwing a
// queen away when already a rook up is not what a player meets.
//
// A game stops early once it is decided: 8 plies in a row with one side 900+
// ahead is a win; from move 60, 20 plies within 30 is a draw; move 150 ends it
// (300+ ahead wins, else a draw).
//
// READ THIS BEFORE TRUSTING A NUMBER.
//  - There is no outside rating here. The "rel. Elo" column is fitted from
//    these games only, level 8 = 0. It gives an ORDER and a distance between
//    levels, not a rating a human would have against them.
//  - A desktop PC searches several times faster than a phone, so every figure
//    is an UPPER BOUND on what a phone user meets.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/measure-game.mjs <outDir>'); process.exit(1); }
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const GAMES = +(process.env.GAMES || 20);
const SLOTS = +(process.env.SLOTS || 6);
const JUDGE_MS = +(process.env.JUDGE_MS || 300);
const TAG = process.env.TAG || 'before';
fs.mkdirSync(OUT, { recursive: true });

const { LEVELS } = await import(pathToFileURL(path.join(ROOT, 'js/engine.js')));

// A side is a Play level as the app plays it. VARIANTS (a JSON file) may add
// trial sides for a proposal: { "id": { "level": 0, "trial": {...} } }; the
// trial object is handed to the page, see `trialMove` below.
const SIDES = {};
LEVELS.forEach((lv, i) => { SIDES[`lv${i + 1}`] = { id: `lv${i + 1}`, level: i, elo: lv.elo, movetime: lv.movetime }; });
if (process.env.VARIANTS) {
  for (const [id, v] of Object.entries(JSON.parse(fs.readFileSync(process.env.VARIANTS, 'utf8')))) {
    const lv = LEVELS[v.level];
    SIDES[id] = { id, level: v.level, elo: lv.elo, movetime: v.movetime || lv.movetime, trial: v.trial || null };
  }
}
const DEFAULT_PAIRS = [];
for (let i = 1; i < 8; i++) DEFAULT_PAIRS.push(`lv${i}-lv${i + 1}`);
for (let i = 1; i < 7; i++) DEFAULT_PAIRS.push(`lv${i}-lv8`);
const PAIRS = (process.env.PAIRS ? process.env.PAIRS.split(',') : DEFAULT_PAIRS).map(p => p.split('-'));
for (const p of PAIRS) for (const id of p) if (!SIDES[id]) { console.error('unknown side ' + id); process.exit(1); }

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

// Runs in the page. One whole game between two sides.
const PAGE = `
  const { Engine, uciToMove } = await import('/js/engine.js');
  const { Chess } = await import('/vendor/chess.js');
  const book = await import('/js/play-book.js');
  window.__judges = [];
  window.__game = async (slot, g) => {
    let s = g.seed >>> 0;
    const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const judge = window.__judges[slot] ||= new Engine();
    const chess = new Chess();
    const st = { w: { side: g.white, main: new Engine(), guard: null, made: 0, ms: 0, maxMs: 0 },
                 b: { side: g.black, main: new Engine(), guard: null, made: 0, ms: 0, maxMs: 0 } };
    const clamp = v => Math.max(-1500, Math.min(1500, v));
    const moves = [];
    let evalNow = null, judgeBest = null, result = null, why = '', decided = 0, level = 0, error = null;
    const top = (p, ms) => {
      const at = async (fen, count) => (await (p.guard ||= new Engine()).topMoves(fen, { movetime: ms, count })).lines;
      const f = count => at(chess.fen(), count);
      f.at = at;
      return f;
    };
    try {
      while (!result) {
        if (chess.isCheckmate()) { result = chess.turn() === 'w' ? 'b' : 'w'; why = 'mate'; break; }
        if (chess.isDraw() || chess.isStalemate()) { result = 'd'; why = 'draw'; break; }
        const c = chess.turn(), p = st[c], side = p.side, sign = c === 'w' ? 1 : -1;
        const fen = chess.fen();
        const t0 = performance.now();
        let m = null, src = 'lim';
        const pick = await book.openingMove({ sans: chess.history(), level: side.level, rnd, topMoves: top(p, side.movetime) }).catch(() => null);
        if (pick) { try { m = chess.move(pick.book ? pick.san : uciToMove(pick.uci)); src = pick.book ? 'book' : 'guard'; } catch { m = null; } }
        const limited = () => p.main.bestMove(fen, { movetime: side.movetime, elo: side.elo });
        if (!m && side.trial && p.made >= book.OPENING_MOVES) {
          const uci = await window.__trial(side, { fen, rnd, topMoves: top(p, side.movetime), limited });
          if (uci) { m = chess.move(uciToMove(uci)); src = 'play'; }
        } else if (!m && !g.old && book.playMove && book.usesGuardAllGame(side.level)) {
          // As Play.engineMove() does it (OLD=1 skips this: the limiter alone).
          const t = top(p, side.movetime);
          const scoreAfter = async u => {
            const c2 = new Chess(fen); c2.move(uciToMove(u));
            if (c2.isCheckmate()) return 10000;
            if (c2.isGameOver()) return 0;
            const ls = await t.at(c2.fen(), book.GUARD_LINES);
            return ls.length ? -Math.max(...ls.map(l => l.score)) : null;
          };
          const uci = await book.playMove({ level: side.level, rnd, limited, topMoves: t, scoreAfter }).catch(() => null);
          if (uci) { m = chess.move(uciToMove(uci)); src = 'play'; }
        }
        if (!m) {
          if (p.guard && !side.trial) { p.guard.terminate(); p.guard = null; }
          const uci = await p.main.bestMove(fen, { movetime: side.movetime, elo: side.elo });
          if (!uci) { error = 'no move'; break; }
          m = chess.move(uciToMove(uci));
        }
        const ms = performance.now() - t0;
        p.made++; p.ms += ms; p.maxMs = Math.max(p.maxMs, ms);
        if (src === 'book') { evalNow = null; judgeBest = null; moves.push({ c, n: p.made, san: m.san, src }); continue; }
        if (evalNow === null) { const r0 = await judge.evaluateBest(fen, g.judgeMs); evalNow = clamp(r0.score); judgeBest = r0.best; }
        const r = await judge.evaluateBest(chess.fen(), g.judgeMs);
        const after = clamp(r.score);
        moves.push({ c, n: p.made, san: m.san, src, before: Math.round(evalNow * sign), loss: Math.round((evalNow - after) * sign), fen, best: judgeBest, uci: m.from + m.to + (m.promotion || '') });
        evalNow = after; judgeBest = r.best;
        const ply = moves.length;
        decided = Math.abs(after) >= 900 ? (Math.sign(after) === Math.sign(decided) ? decided + Math.sign(after) : Math.sign(after)) : 0;
        level = Math.abs(after) <= 30 ? level + 1 : 0;
        if (Math.abs(decided) >= 8) { result = decided > 0 ? 'w' : 'b'; why = 'decided'; }
        else if (ply >= 120 && level >= 20) { result = 'd'; why = 'level'; }
        else if (ply >= 300) { result = after >= 300 ? 'w' : after <= -300 ? 'b' : 'd'; why = 'move 150'; }
      }
    } catch (e) { error = String(e && e.message || e); }
    finally { for (const p of [st.w, st.b]) { p.main.terminate(); if (p.guard) p.guard.terminate(); } }
    return { white: g.white.id, black: g.black.id, seed: g.seed, result, why, error, plies: moves.length, moves,
      msW: Math.round(st.w.ms / Math.max(1, st.w.made)), msB: Math.round(st.b.ms / Math.max(1, st.b.made)), maxW: Math.round(st.w.maxMs), maxB: Math.round(st.b.maxMs),
      pgn: chess.pgn().split(String.fromCharCode(10)).pop() };
  };
  // A trial chooser for a proposal, not app code. trial = { margin, floor,
  // slipEvery, slipMin, slipMax, refuse }.
  //  refuse: the limiter's move stands unless the full-strength search says it
  //          costs more than 'refuse' cp, then a guarded move is played instead.
  //  else:   a guarded move within 'margin'; one move in 'slipEvery' is taken
  //          from a wider band (slipMin..slipMax cp worse than the best).
  window.__trial = async (side, { fen, rnd, topMoves, limited }) => {
    const t = side.trial;
    // Both searches at once on their two engines, as playMove does it.
    const own = t.refuse != null ? limited() : null;
    const lines = await topMoves(t.lines || book.GUARD_LINES).catch(() => null);
    if (!lines || !lines.length) return await (own || limited());
    const best = lines.reduce((a, b) => (b.score > a.score ? b : a));
    if (t.refuse != null) {
      const uci = await own;
      if (!uci) return best.uci;
      const hit = lines.find(l => l.uci === uci);
      let cost;
      if (hit) cost = best.score - hit.score;
      else {
        // Not among the best few: score the position it leads to.
        const c = new Chess(fen); c.move(uciToMove(uci));
        if (c.isCheckmate()) return uci;
        const reply = c.isGameOver() ? [{ score: 0 }] : await (async () => { const f = c.fen(); return (await topMoves.at(f, t.lines || book.GUARD_LINES)); })();
        cost = reply.length ? best.score + reply.reduce((a, b) => (b.score > a.score ? b : a)).score : 0;
      }
      if (cost <= t.refuse) return uci;
      // A weak level is let off now and then: the piece goes, a queen or a mate does not.
      if (t.through && cost < (t.throughMax || 600) && rnd() < t.through) return uci;
      return book.pickGuarded(lines, t.margin, t.floor ?? -Infinity, rnd);
    }
    if (t.slipEvery && best.score >= (t.floor ?? -Infinity) && rnd() < 1 / t.slipEvery) {
      const band = lines.filter(l => best.score - l.score >= t.slipMin && best.score - l.score <= t.slipMax);
      if (band.length) return band[Math.floor(rnd() * band.length)].uci;
    }
    return book.pickGuarded(lines, t.margin, t.floor ?? -Infinity, rnd);
  };
  return true;`;

const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };

// Relative ratings fitted to the results (a draw is half a win), anchor = 0.
function fitElo(ids, games, anchor) {
  const R = Object.fromEntries(ids.map(id => [id, 0]));
  const pts = Object.fromEntries(ids.map(id => [id, 0]));
  const n = Object.fromEntries(ids.map(id => [id, 0]));
  for (const g of games) {
    const w = g.result === 'w' ? 1 : g.result === 'd' ? 0.5 : 0;
    pts[g.white] += w; pts[g.black] += 1 - w; n[g.white]++; n[g.black]++;
  }
  for (let it = 0; it < 4000; it++) {
    const exp = Object.fromEntries(ids.map(id => [id, 0]));
    for (const g of games) {
      const e = 1 / (1 + 10 ** ((R[g.black] - R[g.white]) / 400));
      exp[g.white] += e; exp[g.black] += 1 - e;
    }
    for (const id of ids) {
      if (!n[id]) continue;
      // Held off a clean sweep, which has no finite rating.
      const got = Math.min(n[id] - 0.25, Math.max(0.25, pts[id]));
      R[id] += 8 * (got - exp[id]) / Math.sqrt(n[id]);
    }
  }
  const base = R[anchor] ?? 0;
  for (const id of ids) R[id] = Math.round(R[id] - base);
  return R;
}

function report(games) {
  const ids = [...new Set(games.flatMap(g => [g.white, g.black]))].sort((a, b) => (SIDES[a].level - SIDES[b].level) || a.localeCompare(b));
  const elo = fitElo(ids, games, ids.includes('lv8') ? 'lv8' : ids[ids.length - 1]);
  const score = (a, b) => {
    const gs = games.filter(g => (g.white === a && g.black === b) || (g.white === b && g.black === a));
    if (!gs.length) return null;
    let w = 0, d = 0, l = 0;
    for (const g of gs) { if (g.result === 'd') d++; else if ((g.result === 'w') === (g.white === a)) w++; else l++; }
    return { w, d, l, n: gs.length, pct: Math.round(100 * (w + d / 2) / gs.length) };
  };
  const rows = ids.map(id => {
    const mine = games.filter(g => g.white === id || g.black === id);
    const col = g => (g.white === id ? 'w' : 'b');
    const late = mine.flatMap(g => g.moves.filter(m => m.c === col(g) && m.src !== 'book' && m.n > 12 && Math.abs(m.before) <= 600).map(m => ({ ...m, pgn: g.pgn, white: g.white, black: g.black, seed: g.seed })));
    const perGame = mine.map(g => g.moves.filter(m => m.c === col(g) && m.src !== 'book' && m.n > 12 && Math.abs(m.before) <= 600));
    const ms = mine.map(g => (g.white === id ? g.msW : g.msB));
    const i = SIDES[id].level;
    const vs = k => { const o = ids.find(x => x === `lv${k}`); return o && o !== id ? score(id, o) : null; };
    return {
      id, games: mine.length, relElo: elo[id], moves: late.length,
      cpPerMove: +mean(late.map(m => Math.max(0, m.loss))).toFixed(1),
      medianLoss: Math.round(median(late.map(m => Math.max(0, m.loss)))),
      slips100: +(100 * late.filter(m => m.loss >= 100).length / Math.max(1, late.length)).toFixed(1),
      drops100: +(100 * late.filter(m => m.loss >= 300).length / Math.max(1, late.length)).toFixed(1),
      dropsPerGame: +mean(perGame.map(a => a.filter(m => m.loss >= 300).length)).toFixed(2),
      gamesWithDrop: Math.round(100 * perGame.filter(a => a.some(m => m.loss >= 300)).length / Math.max(1, perGame.length)),
      below: id.startsWith('lv') ? vs(i) : null, above: id.startsWith('lv') ? vs(i + 2) : null,
      top: id === 'lv8' ? null : score(id, 'lv8'),
      msPerMove: Math.round(median(ms)), maxMs: Math.max(0, ...mine.map(g => (g.white === id ? g.maxW : g.maxB))),
      worst: late.sort((a, b) => b.loss - a.loss).slice(0, 6),
    };
  });
  return { rows, pairs: PAIRS.map(([a, b]) => ({ a, b, ...score(a, b) })), ends: tally(games.map(g => g.why)), plies: Math.round(median(games.map(g => g.plies))) };
}
function tally(a) { const o = {}; for (const x of a) o[x] = (o[x] || 0) + 1; return o; }

const web = await startServer();
const c = await startChrome();
const games = [];
const t0 = Date.now();
try {
  await c.send('Page.enable'); await c.send('Runtime.enable');
  await c.send('Page.navigate', { url: web.url + '/__bench.html' });
  await sleep(1200);
  await c.evalP(PAGE);
  // Round by round, so a run cut short still has every pairing in it.
  const jobs = [];
  for (let i = 0; i < GAMES; i++) {
    for (const [a, b] of PAIRS) {
      const [w, bl] = i % 2 ? [b, a] : [a, b];
      jobs.push({ white: SIDES[w], black: SIDES[bl], seed: 5000 + i * 37 + PAIRS.findIndex(p => p[0] === a && p[1] === b) * 1009, judgeMs: JUDGE_MS, old: !!process.env.OLD });
    }
  }
  let next = 0, finished = 0;
  await Promise.all(Array.from({ length: SLOTS }, async (_, slot) => {
    while (next < jobs.length) {
      const j = jobs[next++];
      const r = await c.evalP(`return await window.__game(${slot}, ${JSON.stringify(j)});`).catch(e => ({ error: e.message, moves: [], white: j.white.id, black: j.black.id }));
      if (r.result) games.push(r); else console.error(`game ${j.white.id}-${j.black.id} failed: ${r.error}`);
      if (++finished % 10 === 0) {
        console.error(`${finished}/${jobs.length} games, ${Math.round((Date.now() - t0) / 1000)} s`);
        fs.writeFileSync(path.join(OUT, `game-${TAG}.json`), JSON.stringify({ games }));
      }
    }
  }));
} finally { await c.close(); await web.stop().catch(() => {}); }

const rep = report(games);
fs.writeFileSync(path.join(OUT, `game-${TAG}.json`), JSON.stringify({ report: rep, games }));
const pad = (s, n) => String(s).padEnd(n);
const sc = s => (s ? `${s.pct}% (${s.w}-${s.d}-${s.l})` : '-');
console.log(`\n${games.length} whole games, ${GAMES} per pairing, judge ${JUDGE_MS} ms, ${Math.round((Date.now() - t0) / 60000)} min. Median length ${Math.round(rep.plies / 2)} moves. Ended: ${JSON.stringify(rep.ends)}`);
console.log('Mistakes: after the side\'s 12th move, game still open. rel. Elo is from these games only (level 8 = 0), NOT a real rating. Desktop PC: an upper bound for a phone.\n');
console.log(pad('side', 12) + pad('games', 7) + pad('rel.Elo', 9) + pad('cp/move', 9) + pad('100+/100mv', 12) + pad('300+/100mv', 12) + pad('drops/game', 12) + pad('games w/drop', 14) + pad('vs below', 16) + pad('vs above', 16) + pad('vs level 8', 16) + pad('ms/move', 9) + 'slowest');
for (const r of rep.rows) {
  console.log(pad(r.id, 12) + pad(r.games, 7) + pad(r.relElo, 9) + pad(r.cpPerMove, 9) + pad(r.slips100, 12) + pad(r.drops100, 12) + pad(r.dropsPerGame, 12) + pad(r.gamesWithDrop + '%', 14) + pad(sc(r.below), 16) + pad(sc(r.above), 16) + pad(sc(r.top), 16) + pad(r.msPerMove, 9) + r.maxMs);
}
console.log('\nWorst moves (game still open, after move 12):');
for (const r of rep.rows) {
  console.log(`\n${r.id}`);
  for (const w of r.worst.slice(0, 3)) console.log(`  move ${w.n} ${w.san} (${w.c === 'w' ? 'White' : 'Black'}, ${w.white} v ${w.black}) cost ${w.loss} cp from ${w.before}; judge wanted ${w.best}\n    ${w.fen}`);
}
