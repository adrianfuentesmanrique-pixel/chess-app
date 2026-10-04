// Headless-Chrome verification for pre-move in Puzzles, Puzzle Rush and
// Blindfold: a move made while the board is waiting on the opponent must be
// taken, with no dead time. Dev tool, not shipped.
//
//   node tools/cdp-verify-premove.mjs <outDir> [repro]
//
// `repro` runs only the Puzzles cases, in one language/theme — the quick way to
// see which of them fail on a given checkout.
//
// REALLY TOUCHED (CDP Input.dispatchTouchEvent — a finger down, moved, up):
// every chess move, tap-tap and drag, and the Next / Peek / Show solution /
// Go / Rush start buttons.
// CLICKED WITH element.click(): the tab bar and the puzzle-mode buttons.
// SEEDED: which puzzle is served (Puzzles.loadPuzzle(p) / Rush.pickNext are
// handed a puzzle whose solution is long enough for the case), Blindfold's
// memorising time (set to 1 s through the slider's own events), and
// Puzzles.autoNext switched off in memory.
// READ FROM THE APP: the solution, moveIdx, ratings, strikes, and a log of
// every board state change with its timestamp (the board's own methods are
// wrapped to write it; they are not otherwise altered).
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { blindEloResult } from '../js/blind-elo.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
const MODE = process.argv[3] || 'full';
if (!OUT) { console.error('usage: node tools/cdp-verify-premove.mjs <outDir> [repro]'); process.exit(1); }
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const WEB = 9900 + Math.floor(Math.random() * 90);
const APP_URL = `http://localhost:${WEB}`;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-premove-'));
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 1500000).unref();

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

// ── page side ───────────────────────────────────────────────────────────────
// Everything the cases need, installed once per page load.
const INIT = `
  const app = await import('${APP_URL}/js/app.js');
  const { Chess } = await import('${APP_URL}/vendor/chess.js');
  const pz = await import('${APP_URL}/js/puzzles.js');
  const T = window.__t = { app, Chess, pz, log: [], used: new Set() };
  // Wraps a board's own state-changing methods so each one leaves a timestamped
  // line saying whether the board would take a touch at that instant.
  T.inst = (b, label) => {
    if (!b || b.__inst) return; b.__inst = true;
    const acc = () => !!(b.interactive || b._premoveActive());
    const push = (ev, x) => T.log.push(Object.assign({ t: performance.now(), b: label, ev, acc: acc() }, x));
    for (const k of ['setPosition', 'armPremove', 'clearPremove', 'firePremove']) {
      const o = b[k];
      b[k] = function (...a) { const r = o.apply(this, a); push(k, k === 'setPosition' ? { lm: a[1] ? a[1].from + a[1].to : null } : k === 'firePremove' ? { fired: r } : {}); return r; };
    }
    const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(b), 'interactive');
    Object.defineProperty(b, 'interactive', { configurable: true, get() { return d.get.call(this); }, set(v) { d.set.call(this, v); push('interactive', { v: !!v }); } });
    b.el.addEventListener('pointerdown', e => {
      const s = e.target.closest('.sq'); const img = s && s.querySelector('img');
      T.log.push({ t: performance.now(), b: label, ev: 'down', sq: s && s.dataset.sq, acc: acc(), ta: s ? getComputedStyle(img || s).touchAction : null });
    }, true);
    b.el.addEventListener('pointercancel', () => T.log.push({ t: performance.now(), b: label, ev: 'cancel' }), true);
  };
  T.pts = id => {
    const el = document.getElementById(id);
    el.scrollIntoView({ block: 'center' });
    const o = {};
    el.querySelectorAll('.sq').forEach(s => { const r = s.getBoundingClientRect(); o[s.dataset.sq] = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    return o;
  };
  // Centre of a button, as long as it is on screen and not covered.
  T.btn = sel => {
    const el = document.querySelector(sel); const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return top && (top === el || el.contains(top)) ? { x, y } : null;
  };
  const u = s => ({ from: s.slice(0, 2), to: s.slice(2, 4) });
  const flip = fen => { const p = fen.split(' '); p[1] = p[1] === 'w' ? 'b' : 'w'; p[3] = '-'; try { return new Chess(p.join(' ')); } catch { return null; } };
  const flipLegal = (fen, mv) => { const c = flip(fen); if (!c) return false; try { return c.moves({ verbose: true }).some(m => m.from + m.to === mv); } catch { return false; } };
  // Seen from the position just after the opponent's reply: a legal move that
  // is not the answer and not mate ('wrong'); a pawn capture onto an empty
  // square, which the piece can reach but no position here makes legal
  // ('illegal'); a square the piece could never reach at all ('far').
  T.other = (chess, expected, kind) => {
    const turn = chess.turn();
    if (kind === 'wrong') {
      for (const m of chess.moves({ verbose: true })) {
        if (m.from + m.to === expected.slice(0, 4) || m.promotion) continue;
        const c = new Chess(chess.fen()); c.move(m);
        if (!c.isCheckmate()) return m.from + m.to;
      }
      return null;
    }
    if (kind === 'far') {
      const from = expected.slice(0, 2), pc = chess.get(from);
      if (!pc) return null;
      const f = from.charCodeAt(0) - 97, r = +from[1];
      const cand = pc.type === 'n' ? [[1, 0], [-1, 0]] : [[1, 2], [-1, 2], [1, -2], [-1, -2]];
      for (const [df, dr] of cand) {
        const nf = f + df, nr = r + dr;
        if (nf < 0 || nf > 7 || nr < 1 || nr > 8) continue;
        return from + String.fromCharCode(97 + nf) + nr;
      }
      return null;
    }
    for (const row of chess.board()) for (const pc of row) {
      if (!pc || pc.color !== turn || pc.type !== 'p') continue;
      const f = pc.square.charCodeAt(0), r = +pc.square[1] + (turn === 'w' ? 1 : -1);
      if (r < 2 || r > 7) continue;
      for (const df of [-1, 1]) {
        const to = String.fromCharCode(f + df) + r;
        if (to[0] < 'a' || to[0] > 'h' || chess.get(to)) continue;
        if (!chess.moves({ square: pc.square, verbose: true }).some(m => m.to === to)) return pc.square + to;
      }
    }
    return null;
  };
  // What a puzzle offers the cases: 'plain' = my move is already possible
  // before the opponent's move lands, 'geo' = it only becomes possible once it
  // has (a recapture, a line that opens). Null if it has under two moves of
  // mine or a promotion.
  T.facts = p => {
    if (!p || p.moves.length < 4 || !p.moves.every(m => m.length === 4)) return null;
    try {
      const c = new Chess(p.fen);
      const open = flipLegal(c.fen(), p.moves[1]) ? 'plain' : 'geo';
      c.move(u(p.moves[0])); c.move(u(p.moves[1]));
      const reply = flipLegal(c.fen(), p.moves[3]) ? 'plain' : 'geo';
      c.move(u(p.moves[2]));
      return { open, reply, wrong: T.other(c, p.moves[3], 'wrong'), illegal: T.other(c, p.moves[3], 'illegal'), far: T.other(c, p.moves[3], 'far') };
    } catch { return null; }
  };
  T.fits = (f, when, cat, need) => !!f && (!when || f[when] === cat) && (!need || !!f[need]);
  T.pick = (when, cat, need) => {
    const list = pz.PUZZLES;
    const start = Math.floor(Math.random() * list.length);
    for (let i = 0; i < list.length; i++) {
      const p = list[(start + i) % list.length];
      if (T.used.has(p.id)) continue;
      const f = T.facts(p);
      if (!T.fits(f, when, cat, need)) continue;
      T.used.add(p.id);
      return p;
    }
    return null;
  };
  T.inst(app.Puzzles.board, 'puzzle');
  T.inst(app.Blind.board, 'blind');
  T.inst(app.Rush.board, 'rush');
  return true;`;

async function load(lang, scheme) {
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
  await send('Page.navigate', { url: APP_URL });
  await sleep(2500);
  await evalP(`localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1');`);
  await send('Page.reload', {});
  await sleep(3500);
  await killModals();
  await toPuzzles();
  await evalP(INIT);
  await evalP(`__t.app.Puzzles.autoNext = false;`);
}
async function toPuzzles() {
  await evalP(`document.querySelector('[data-screen="puzzles"]').click();`);
  await sleep(1500);
  await killModals();
}

// ── fingers ─────────────────────────────────────────────────────────────────
const touch = (type, p) => send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }] : [] });
async function tap(p, hold = 25) { await touch('touchStart', p); await sleep(hold); await touch('touchEnd'); }
// A move by finger. `pause` ms are spent between the two halves — after the
// first tap, or with the piece held in the air — so a case can put the
// opponent's move in the middle of the gesture.
async function move(pts, uci, gesture, pause = 0) {
  const a = pts[uci.slice(0, 2)], b = pts[uci.slice(2, 4)];
  if (gesture === 'tap') {
    await tap(a);
    await sleep(pause || 15);
    await tap(b);
    return;
  }
  await touch('touchStart', a);
  for (let i = 1; i <= 4; i++) { await touch('touchMove', { x: a.x + (b.x - a.x) * i / 5, y: a.y + (b.y - a.y) * i / 5 }); await sleep(6); }
  if (pause) await sleep(pause);
  await touch('touchMove', b);
  await touch('touchEnd');
}
// Scrolls the element into view, then puts a finger on its centre. Kael's
// speech bubble can sit over a button for a few seconds; this waits it out
// rather than tapping the bubble, and fails loudly if the cover never goes.
async function tapEl(sel) {
  let pt;
  for (let i = 0; i < 40; i++) {
    pt = await evalP(`
      const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      await new Promise(r => setTimeout(r, 60));
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const top = document.elementFromPoint(x, y);
      // Kael slides in from the edge: mid-slide he is not yet over the button, but will be by the time the finger lands.
      const kael = document.getElementById('kael-bubble')?.classList.contains('show');
      return { x, y, hit: !kael && !!top && (top === el || el.contains(top)), by: kael ? 'kael-bubble' : top && (top.id || top.className) };`);
    if (!pt) throw new Error('no element ' + sel);
    if (pt.hit) break;
    await sleep(300);
  }
  if (!pt.hit) throw new Error('covered: ' + sel + ' by ' + pt.by);
  await tap(pt, 40);
  await sleep(120);
}

// ── reading the log ─────────────────────────────────────────────────────────
// The log from the moment the current puzzle appeared.
const thisPuzzle = (log, appearLm = null) => {
  let i = -1;
  log.forEach((e, k) => { if (e.ev === 'setPosition' && e.lm === appearLm) i = k; });
  return i < 0 ? log : log.slice(i);
};
// Dead time inside a waiting window: from the board showing `from` (a move, or
// null for a fresh puzzle) until it shows the opponent's move `to`, how many
// ms the board would have thrown a touch away.
function deadIn(log, from, to) {
  const i0 = log.findIndex(e => e.ev === 'setPosition' && e.lm === from);
  if (i0 < 0) return null;
  const i1 = log.findIndex((e, i) => i > i0 && e.ev === 'setPosition' && e.lm === to);
  if (i1 < 0) return null;
  let dead = 0;
  for (let i = i0; i < i1; i++) if (!log[i].acc) dead += log[i + 1].t - log[i].t;
  return +dead.toFixed(2);
}
// Was `mine` played once the opponent's `opp` landed? `after` is my own
// previous move (undefined for the opening move): only touches made after it
// belong to this gesture. timing 'inside' = every touch came before `opp`
// landed, 'straddle' = the first did.
function verdict(log, mine, opp, after, timing) {
  const tStart = after === undefined ? -1 : (log.find(e => e.ev === 'setPosition' && e.lm === after)?.t ?? Infinity);
  const tLand = log.find(e => e.ev === 'setPosition' && e.lm === opp && e.t > tStart)?.t ?? null;
  const tPlayed = tLand === null ? null : (log.find(e => e.ev === 'setPosition' && e.lm === mine && e.t >= tLand)?.t ?? null);
  const d = log.filter(e => e.ev === 'down' && e.t > tStart);
  const early = d.length > 0 && tLand !== null && d[0].t < tLand;
  const allEarly = early && d.every(e => e.t < tLand);
  const played = tPlayed !== null;
  const lagMs = played ? +(tPlayed - tLand).toFixed(1) : null;
  const firstTouchMs = d.length && tStart >= 0 ? +(d[0].t - tStart).toFixed(0) : undefined;
  return {
    ok: played && (timing === 'inside' ? allEarly && lagMs < 5 : early),
    played, lagMs, touchBeforeLandingMs: early ? +(tLand - d[0].t).toFixed(0) : null, firstTouchMs,
    firstTouchTaken: d[0]?.acc, touchAction: d[0]?.ta, cancels: log.filter(e => e.ev === 'cancel').length,
  };
}
const getLog = () => evalP(`return __t.log.slice();`);
const what = (when, gesture, timing, cat) => `${when === 'open' ? 'opening move' : 'reply'} / ${gesture} / ${timing}${cat === 'geo' ? ' / recapture-type move' : ''}`;
const scrollTop = () => evalP(`return document.querySelector('main').scrollTop;`);

// Kael's speech bubble and toasts can sit over the buttons under the board for
// a few seconds. A case that taps one at a point worked out in advance waits
// here first, so the finger lands on the button and not on whatever covers it.
async function clearView(sel, boardId) {
  let by;
  for (let i = 0; i < 60; i++) {
    by = await evalP(`__t.pts(${JSON.stringify(boardId)});
      if (document.getElementById('kael-bubble')?.classList.contains('show')) return 'kael-bubble';
      if (__t.btn(${JSON.stringify(sel)})) return null;
      const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return top ? (top.id || top.className || top.tagName) : 'off screen';`);
    if (!by) return;
    await sleep(200);
  }
  throw new Error(sel + ' stayed covered by ' + by);
}

// ── Puzzles ─────────────────────────────────────────────────────────────────
async function puzzleLoad(when, cat, need) {
  return evalP(`const T = __t, P = T.app.Puzzles;
    const p = T.pick(${JSON.stringify(when)}, ${JSON.stringify(cat)}, ${JSON.stringify(need || null)});
    if (!p) return null;
    T.log.length = 0;
    P.loadPuzzle(p);
    const pts = T.pts('puzzle-board');
    return { moves: p.moves, rating: p.rating, facts: T.facts(p), pts, next: T.btn('#puzzle-next'), solution: T.btn('#puzzle-solution'), elo: P.elo, attempts: P.attemptCount };`);
}
const puzzleState = () => evalP(`const P = __t.app.Puzzles, b = P.board;
  return { moveIdx: P.moveIdx, failed: P.failedThis, elo: P.elo, premove: b.premove, armed: b.premoveArmed, selected: b.selected, live: b.interactive,
    tinted: document.querySelectorAll('#puzzle-board .sq.premove').length, id: P.current?.id, moves: P.current?.moves };`);

async function puzzleCase(when, gesture, timing, cat) {
  const info = await puzzleLoad(when, cat);
  if (!info) return null;
  const { moves, pts } = info;
  const s0 = await scrollTop();
  let v;
  if (when === 'open') {
    await move(pts, moves[1], gesture, timing === 'straddle' ? 620 : 0);
    await sleep(1300);
    const log = await getLog();
    v = verdict(log, moves[1], moves[0], undefined, timing);
    v.deadMs = deadIn(log, null, moves[0]);
  } else {
    await sleep(800);
    await move(pts, moves[1], 'tap');
    await move(pts, moves[3], gesture, timing === 'straddle' ? 430 : 0);
    await sleep(1300);
    const log = await getLog();
    v = verdict(log, moves[3], moves[2], moves[1], timing);
    v.deadMs = deadIn(log, moves[1], moves[2]);
  }
  v.failed = (await puzzleState()).failed;
  v.scrolled = (await scrollTop()) - s0;
  v.ok = v.ok && !v.failed && v.scrolled === 0 && v.cancels === 0 && v.deadMs < 1 && (gesture !== 'drag' || v.touchAction === 'none');
  return v;
}

const FULL_ROWS = [
  ['open', 'tap', 'inside', 'plain'], ['open', 'drag', 'inside', 'plain'],
  ['reply', 'tap', 'inside', 'plain'], ['reply', 'drag', 'inside', 'plain'],
  ['open', 'tap', 'straddle', 'plain'], ['open', 'drag', 'straddle', 'plain'],
  ['reply', 'tap', 'straddle', 'plain'], ['reply', 'drag', 'straddle', 'plain'],
  ['open', 'tap', 'inside', 'geo'], ['open', 'drag', 'inside', 'geo'],
  ['reply', 'tap', 'inside', 'geo'], ['reply', 'drag', 'inside', 'geo'],
];
const SHORT_ROWS = [['open', 'tap', 'inside', 'plain'], ['open', 'drag', 'inside', 'geo'], ['reply', 'drag', 'inside', 'plain'], ['reply', 'tap', 'straddle', 'geo']];

async function puzzlesMatrix(tag, rows) {
  for (const [when, gesture, timing, cat] of rows) {
    const v = await puzzleCase(when, gesture, timing, cat);
    check(`${tag}PUZZLES ${what(when, gesture, timing, cat)}`, !!v && v.ok, v || 'no such puzzle loaded');
  }
}

async function puzzlesExtras(tag) {
  // a wrong pre-move is charged exactly like a wrong move by hand
  let info = await puzzleLoad('reply', 'plain', 'wrong');
  await sleep(800);
  await move(info.pts, info.moves[1], 'tap');
  await move(info.pts, info.facts.wrong, 'tap');
  await sleep(900);
  let st = await puzzleState();
  let log = await getLog();
  const K = info.attempts < 10 ? 192 : 24;
  const want = Math.max(600, info.elo - K / (1 + Math.pow(10, (info.rating - info.elo) / 400)));
  let v = verdict(log, info.facts.wrong, info.moves[2], info.moves[1], 'inside');
  check(`${tag}PUZZLES a wrong pre-move is charged the full hand-move loss`, v.touchBeforeLandingMs > 0 && st.failed && Math.abs(st.elo - want) < 1e-6 && st.moveIdx === 3,
    { before: +info.elo.toFixed(1), after: +st.elo.toFixed(1), expected: +want.toFixed(1), queuedMsBeforeLanding: v.touchBeforeLandingMs });

  // one that became illegal is dropped, silently and free
  info = await puzzleLoad('reply', 'plain', 'illegal');
  await sleep(800);
  await move(info.pts, info.moves[1], 'tap');
  await move(info.pts, info.facts.illegal, 'tap');
  const mid = await puzzleState();
  await sleep(900);
  st = await puzzleState();
  log = await getLog();
  const fire = log.filter(e => e.ev === 'firePremove').pop();
  check(`${tag}PUZZLES a pre-move that turned out illegal is dropped, costs nothing`,
    mid.premove && mid.premove.from + mid.premove.to === info.facts.illegal && mid.tinted === 2 && fire && fire.fired === false && !st.failed && st.elo === info.elo && st.moveIdx === 3 && st.live && !st.premove && st.tinted === 0,
    { queued: mid.premove, tintedSquares: mid.tinted, fired: fire?.fired, failed: st.failed, eloMoved: st.elo - info.elo });

  // Next clears a queued pre-move (queued during the opening move, Next by finger)
  await clearView('#puzzle-next', 'puzzle-board');
  info = await puzzleLoad('open', 'plain');
  await move(info.pts, info.moves[1], 'tap');
  const q1 = await puzzleState();
  await tap(info.next, 30);
  // The click follows the finger by a few ms, and Next itself awaits the puzzle
  // band — so the new puzzle is looked for, not assumed to be there already.
  let a1 = await puzzleState();
  for (let i = 0; i < 20 && a1.id === q1.id; i++) { await sleep(20); a1 = await puzzleState(); }
  await sleep(1500);
  st = await puzzleState();
  check(`${tag}PUZZLES Next drops a queued pre-move; the new puzzle is not played for me`, !!q1.premove && !a1.premove && a1.tinted === 0 && a1.id !== q1.id && st.moveIdx === 1 && !st.failed,
    { queued: q1.premove, afterNext: a1.premove, newPuzzle: a1.id !== q1.id, moveIdx: st.moveIdx });

  // Show solution clears it
  await clearView('#puzzle-solution', 'puzzle-board');
  info = await puzzleLoad('reply', 'plain');
  await sleep(800);
  await move(info.pts, info.moves[1], 'tap');
  await move(info.pts, info.moves[3], 'tap');
  const q2 = await puzzleState();
  await tap(info.solution, 30);
  const a2 = await puzzleState();
  check(`${tag}PUZZLES Show solution drops a queued pre-move`, !!q2.premove && !a2.premove && !a2.armed && a2.tinted === 0, { queued: q2.premove, after: a2.premove, armed: a2.armed });
  // Let the solution finish playing: its loop is not tied to the puzzle it
  // started on, and would carry on into the next case's puzzle.
  for (let i = 0; i < 80; i++) { const z = await puzzleState(); if (z.moveIdx >= z.moves.length) break; await sleep(150); }
  await sleep(900);

  // leaving the screen clears it
  info = await puzzleLoad('open', 'plain');
  await move(info.pts, info.moves[1], 'tap');
  const q3 = await puzzleState();
  await evalP(`__t.app.showScreen('analysis');`);
  const a3 = await puzzleState();
  await sleep(1000);
  st = await puzzleState();
  check(`${tag}PUZZLES leaving the screen drops a queued pre-move`, !!q3.premove && !a3.premove && !a3.armed && st.moveIdx === 1, { queued: q3.premove, after: a3.premove, armed: a3.armed, moveIdx: st.moveIdx });
  await toPuzzles();

  // nothing seeded: the real Next button, whatever puzzle the app serves
  for (let tries = 0; tries < 10; tries++) {
    await clearView('#puzzle-next', 'puzzle-board');
    await evalP(`__t.log.length = 0;`);
    const pt = await evalP(`return __t.btn('#puzzle-next');`);
    await tap(pt, 30);
    const cur = await evalP(`const P = __t.app.Puzzles; return { moves: P.current.moves, pts: __t.pts('puzzle-board') };`);
    if (cur.moves.length < 2 || cur.moves[1].length !== 4) { await sleep(900); continue; }
    await move(cur.pts, cur.moves[1], 'tap');
    await sleep(1300);
    log = await getLog();
    v = verdict(log, cur.moves[1], cur.moves[0], undefined, 'inside');
    v.deadMs = deadIn(log, null, cur.moves[0]);
    check(`${tag}PUZZLES unseeded: real Next, the app's own puzzle, answer queued during the opening move`, v.ok && v.deadMs < 1, v);
    break;
  }
}

// ── Rush ────────────────────────────────────────────────────────────────────
const rushInfo = () => evalP(`const T = __t, R = T.app.Rush, b = R.board;
  return { id: R.current?.id, moves: R.current?.moves, moveIdx: R.moveIdx, facts: T.facts(R.current), pts: T.pts('rush-board'), strikes: R.strikes, score: R.score,
    running: R.running, counting: R.countingIn, live: b.interactive, premove: b.premove, armed: b.premoveArmed, selected: b.selected };`);
const rushWant = (when, cat, need) => evalP(`__t.rushWant = ${JSON.stringify([when, cat, need || null])};`);
async function rushStart() {
  await evalP(`document.querySelector('#screen-puzzles .puzzle-modes [data-v="rush"]').click();`);
  await sleep(600);
  await evalP(`const T = __t, R = T.app.Rush;
    if (!R.__pick) { R.__pick = R.pickNext; R.pickNext = function () { return (T.rushWant && T.pick(...T.rushWant)) || R.__pick.call(this); }; }
    T.log.length = 0;`);
  await tapEl('#rush-start');
}
async function rushLive() {
  for (let i = 0; i < 120; i++) { const s = await rushInfo(); if (s.live && !s.counting) return s; await sleep(100); }
  throw new Error('rush board never went live');
}
// Plays out the current puzzle by finger and returns the moment the next one
// is on the board — i.e. inside its opening move.
async function rushAdvance(prevId) {
  for (let guard = 0; guard < 12; guard++) {
    const r = await evalP(`const T = __t, R = T.app.Rush; const t0 = performance.now();
      while (performance.now() - t0 < 5000) {
        if (!R.running) return { ended: true };
        if (R.current.id !== ${JSON.stringify(prevId)}) return { fresh: { id: R.current.id, moves: R.current.moves, facts: T.facts(R.current), pts: T.pts('rush-board'), strikes: R.strikes, score: R.score } };
        if (R.board.interactive && R.moveIdx < R.current.moves.length) return { need: R.current.moves[R.moveIdx], pts: T.pts('rush-board') };
        await new Promise(r => setTimeout(r, 3));
      }
      return { timeout: true };`);
    if (r.fresh) return r.fresh;
    if (r.need) { await move(r.pts, r.need, 'tap'); await sleep(40); continue; }
    throw new Error('rush did not advance: ' + JSON.stringify(r));
  }
  throw new Error('rush puzzle never finished');
}
async function rushOpenCase(tag, p, gesture, timing, cat) {
  await move(p.pts, p.moves[1], gesture, timing === 'straddle' ? 320 : 0);
  await sleep(500);
  const log = thisPuzzle(await getLog());
  const v = verdict(log, p.moves[1], p.moves[0], undefined, timing);
  v.deadMs = deadIn(log, null, p.moves[0]);
  v.strikes = (await rushInfo()).strikes - p.strikes;
  check(`${tag}RUSH ${what('open', gesture, timing, cat)}`, v.ok && v.deadMs < 1 && v.strikes === 0 && v.cancels === 0 && (gesture !== 'drag' || v.touchAction === 'none'), v);
}
async function rushReplyCase(tag, p, gesture, timing, cat) {
  await rushLive();
  await move(p.pts, p.moves[1], 'tap');
  await move(p.pts, p.moves[3], gesture, timing === 'straddle' ? 330 : 0);
  await sleep(250);
  const log = thisPuzzle(await getLog());
  const v = verdict(log, p.moves[3], p.moves[2], p.moves[1], timing);
  v.deadMs = deadIn(log, p.moves[1], p.moves[2]);
  v.strikes = (await evalP(`return __t.app.Rush.strikes;`)) - p.strikes;
  check(`${tag}RUSH ${what('reply', gesture, timing, cat)}`, v.ok && v.deadMs < 1 && v.strikes === 0 && v.cancels === 0 && (gesture !== 'drag' || v.touchAction === 'none'), v);
}

async function rushRun(tag, full) {
  await rushWant('reply', 'plain');
  await rushStart();
  await sleep(1400);
  let p = await rushInfo();
  // the count-in: the opening move has landed, the clock has not started
  await move(p.pts, p.moves[1], 'tap');
  await sleep(80);
  const c = await rushInfo();
  const cd = (await getLog()).filter(e => e.ev === 'down');
  check(`${tag}RUSH count-in: taps are ignored, nothing queued`, c.counting && !c.selected && !c.premove && !c.armed && c.moveIdx === 1 && cd.every(e => !e.acc),
    { counting: c.counting, selected: c.selected, premove: c.premove, armed: c.armed, touchesTaken: cd.map(e => e.acc) });
  if (full) await shot('rush-count-in');
  await rushWant('open', 'plain');
  await rushReplyCase(tag, p, 'tap', 'inside', 'plain');

  const steps = full ? [
    ['open', 'tap', 'inside', 'plain'], ['open', 'drag', 'inside', 'plain'], ['reply', 'drag', 'inside', 'plain'],
    ['open', 'tap', 'straddle', 'plain'], ['reply', 'tap', 'straddle', 'plain'], ['reply', 'drag', 'straddle', 'plain'],
    ['open', 'tap', 'inside', 'geo'], ['reply', 'tap', 'inside', 'geo'], ['reply', 'drag', 'inside', 'geo'],
  ] : [['open', 'drag', 'inside', 'plain'], ['reply', 'drag', 'straddle', 'geo']];
  for (let i = 0; i < steps.length; i++) {
    const [when, gesture, timing, cat] = steps[i];
    // what the puzzle AFTER this one has to offer
    const nx = steps[i + 1];
    const fresh = await rushAdvance(p.id);
    if (nx) await rushWant(nx[0], nx[3]); else await rushWant('reply', 'plain', 'wrong');
    p = fresh;
    if (when === 'open') await rushOpenCase(tag, p, gesture, timing, cat);
    else await rushReplyCase(tag, p, gesture, timing, cat);
  }
  if (!full) { await evalP(`__t.app.showScreen('analysis');`); await sleep(300); await toPuzzles(); return; }

  // a wrong pre-move is a strike
  p = await rushAdvance(p.id);
  await rushWant('reply', 'plain', 'illegal');
  await rushLive();
  await move(p.pts, p.moves[1], 'tap');
  await move(p.pts, p.facts.wrong, 'tap');
  await sleep(250);
  let log = thisPuzzle(await getLog(), p.moves[0]);
  let v = verdict(log, p.facts.wrong, p.moves[2], p.moves[1], 'inside');
  let s = await rushInfo();
  check(`${tag}RUSH a wrong pre-move costs one strike`, v.touchBeforeLandingMs > 0 && s.strikes === p.strikes + 1, { strikesBefore: p.strikes, after: s.strikes, queuedMsBeforeLanding: v.touchBeforeLandingMs });

  // one that became illegal is dropped, no strike
  p = await rushAdvance(p.id);
  await rushWant('open', 'plain');
  await rushLive();
  await move(p.pts, p.moves[1], 'tap');
  await move(p.pts, p.facts.illegal, 'tap');
  const mid = await rushInfo();
  await sleep(300);
  s = await rushInfo();
  const fire = (await getLog()).filter(e => e.ev === 'firePremove').pop();
  check(`${tag}RUSH a pre-move that turned out illegal is dropped, no strike`, mid.premove && mid.premove.from + mid.premove.to === p.facts.illegal && fire?.fired === false && s.strikes === p.strikes && s.moveIdx === 3 && s.live && !s.premove,
    { queued: mid.premove, fired: fire?.fired, strikes: s.strikes - p.strikes, moveIdx: s.moveIdx });

  // leaving the screen ends the run and drops the queue
  p = await rushAdvance(p.id);
  await move(p.pts, p.moves[1], 'tap');
  const q = await rushInfo();
  await evalP(`__t.app.showScreen('analysis');`);
  const a = await rushInfo();
  check(`${tag}RUSH leaving the screen drops a queued pre-move`, !!q.premove && !a.premove && !a.armed && !a.running, { queued: q.premove, after: a.premove, armed: a.armed, running: a.running });
  await sleep(600);
  await toPuzzles();
}

// ── Blindfold ───────────────────────────────────────────────────────────────
const blindInfo = () => evalP(`const T = __t, B = T.app.Blind, b = B.board;
  return { id: B.current?.id, moves: B.current?.moves, rating: B.current?.rating, moveIdx: B.moveIdx, facts: T.facts(B.current), pts: T.pts('blind-board'),
    elo: B.elo, attempts: B.attemptCount, recorded: B.eloRecorded, peeked: B.peekedThis, secondsThis: B.secondsThis,
    hidden: b.piecesHidden, live: b.interactive, premove: b.premove, armed: b.premoveArmed, selected: b.selected,
    counting: !document.getElementById('blind-countdown').classList.contains('hidden'),
    tinted: document.querySelectorAll('#blind-board .sq.premove').length, dots: document.querySelectorAll('#blind-board .dest, #blind-board .capture-dest').length,
    peekBtn: T.btn('#blind-peek'), solutionBtn: T.btn('#blind-solution'), nextBtn: T.btn('#blind-next') };`);
async function blindOpen(seconds) {
  await evalP(`document.querySelector('#screen-puzzles .puzzle-modes [data-v="blind"]').click();`);
  await sleep(900);
  await killModals();
  await evalP(`__t.app.Blind.hintWarningSeen = true;
    const r = document.getElementById('blind-time-range'); r.value = ${seconds};
    r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true }));`);
  await sleep(150);
  await evalP(`__t.log.length = 0;`);
  await tapEl('#blind-go');
}
// Waits for the pieces to be hidden and the board live; taps Next until the
// puzzle on the board offers what the case needs.
async function blindReady(when, cat, need) {
  for (let tries = 0; tries < 40; tries++) {
    let s;
    for (let i = 0; i < 300; i++) { s = await blindInfo(); if (s.hidden && s.live) break; await sleep(100); }
    if (!s.hidden || !s.live) { await shot('blind-stuck'); throw new Error('blind board never went live: ' + JSON.stringify({ ...s, pts: undefined, start: await evalP(`return [document.getElementById('blind-start').className, document.getElementById('blind-status').textContent, !!document.querySelector('.modal-back')];`) })); }
    const fits = await evalP(`const T = __t; return T.fits(T.facts(T.app.Blind.current), ${JSON.stringify(when)}, ${JSON.stringify(cat)}, ${JSON.stringify(need || null)});`);
    if (fits) return s;
    await blindNext();
  }
  throw new Error('no fitting blindfold puzzle in 40 tries');
}
// Next by finger. Checked, because a tap that landed on something else would
// leave the solved puzzle on the board and every later case waiting on it.
async function blindNext() {
  const before = await evalP(`return __t.app.Blind.current?.id;`);
  for (let i = 0; i < 4; i++) {
    await evalP(`__t.log.length = 0;`);
    await tapEl('#blind-next');
    await sleep(700);
    const now = await evalP(`const B = __t.app.Blind; return { id: B.current?.id, locked: B.timeLocked };`);
    if (now.id !== before || now.locked) return;
  }
  throw new Error('Next did not start a new blindfold puzzle');
}
async function blindReplyCase(tag, gesture, timing, cat) {
  const p = await blindReady('reply', cat);
  await move(p.pts, p.moves[1], 'tap');
  await move(p.pts, p.moves[3], gesture, timing === 'straddle' ? 430 : 0);
  await sleep(700);
  const log = thisPuzzle(await getLog(), p.moves[0]);
  const v = verdict(log, p.moves[3], p.moves[2], p.moves[1], timing);
  v.deadMs = deadIn(log, p.moves[1], p.moves[2]);
  const s = await blindInfo();
  v.eloMoved = +(s.elo - p.elo).toFixed(2);
  const charged = s.recorded && s.elo < p.elo;
  check(`${tag}BLINDFOLD ${what('reply', gesture, timing, cat)}`, v.ok && v.deadMs < 1 && !charged && v.cancels === 0 && (gesture !== 'drag' || v.touchAction === 'none'), v);
}

async function blindRun(tag, full) {
  await blindOpen(2);
  // the memorising countdown: pieces on show, so nothing is taken
  await sleep(1000);
  let p = await blindInfo();
  if (p.counting && p.moves?.length >= 2 && p.moves[1].length === 4) {
    await move(p.pts, p.moves[1], 'tap');
    const c = await blindInfo();
    const cd = (await getLog()).filter(e => e.ev === 'down');
    check(`${tag}BLINDFOLD countdown: taps are ignored, nothing queued`, c.counting && !c.hidden && !c.selected && !c.premove && !c.armed && c.moveIdx === 1 && cd.length === 2 && cd.every(e => !e.acc),
      { counting: c.counting, piecesHidden: c.hidden, selected: c.selected, premove: c.premove, armed: c.armed, touchesTaken: cd.map(e => e.acc) });
  } else check(`${tag}BLINDFOLD countdown: taps are ignored, nothing queued`, false, { counting: p.counting, moves: p.moves });

  await blindReplyCase(tag, 'tap', 'inside', 'plain');
  if (!full) { await evalP(`__t.app.showScreen('analysis');`); await sleep(300); await toPuzzles(); return; }
  for (const [gesture, timing, cat] of [['drag', 'inside', 'plain'], ['tap', 'straddle', 'plain'], ['drag', 'straddle', 'plain'], ['tap', 'inside', 'geo'], ['drag', 'inside', 'geo']]) {
    await blindNext();
    await blindReplyCase(tag, gesture, timing, cat);
  }

  // a wrong pre-move is charged exactly like a wrong move by hand
  await blindNext();
  p = await blindReady('reply', 'plain', 'wrong');
  await move(p.pts, p.moves[1], 'tap');
  await move(p.pts, p.facts.wrong, 'tap');
  await sleep(700);
  let s = await blindInfo();
  let log = thisPuzzle(await getLog(), p.moves[0]);
  let v = verdict(log, p.facts.wrong, p.moves[2], p.moves[1], 'inside');
  const want = blindEloResult({ elo: p.elo, rating: p.rating, win: false, seconds: p.secondsThis, peeked: false, attemptCount: p.attempts });
  check(`${tag}BLINDFOLD a wrong pre-move is charged the full hand-move loss`, v.touchBeforeLandingMs > 0 && s.recorded && Math.abs(s.elo - want.elo) < 1e-6 && s.elo < p.elo,
    { before: +p.elo.toFixed(1), after: +s.elo.toFixed(1), expected: +want.elo.toFixed(1), queuedMsBeforeLanding: v.touchBeforeLandingMs });

  // hidden pieces: ANY square is tinted (so the tint says nothing about the
  // piece), no destination dots, and the impossible move is dropped for free
  await blindNext();
  p = await blindReady('reply', 'plain', 'far');
  await move(p.pts, p.moves[1], 'tap');
  await move(p.pts, p.facts.far, 'tap');
  const mid = await blindInfo();
  await shot('blind-premove-tint-hidden');
  await sleep(700);
  s = await blindInfo();
  const fire = (await getLog()).filter(e => e.ev === 'firePremove').pop();
  check(`${tag}BLINDFOLD hidden pieces: a square the piece cannot reach is tinted all the same, and no dots`, mid.hidden && mid.premove && mid.premove.from + mid.premove.to === p.facts.far && mid.tinted === 2 && mid.dots === 0,
    { queued: mid.premove, tintedSquares: mid.tinted, dots: mid.dots });
  check(`${tag}BLINDFOLD a pre-move that turned out illegal is dropped, costs nothing`, fire?.fired === false && !s.recorded && s.elo === p.elo && s.moveIdx === 3 && s.live && !s.premove && s.tinted === 0,
    { fired: fire?.fired, recorded: s.recorded, eloMoved: s.elo - p.elo, moveIdx: s.moveIdx });

  // Peek / Show solution / Next / leaving: each drops a queued pre-move
  for (const [label, btn] of [['Peek', 'peekBtn'], ['Show solution', 'solutionBtn'], ['Next', 'nextBtn'], ['leaving the screen', null]]) {
    await blindNext();
    await blindReady('reply', 'plain');
    if (btn) await clearView({ peekBtn: '#blind-peek', solutionBtn: '#blind-solution', nextBtn: '#blind-next' }[btn], 'blind-board');
    p = await blindInfo();
    if (btn && !p[btn]) { check(`${tag}BLINDFOLD ${label} drops a queued pre-move`, false, 'button not on screen'); continue; }
    await move(p.pts, p.moves[1], 'tap');
    await move(p.pts, p.moves[3], 'tap');
    const q = await blindInfo();
    if (btn) await tap(p[btn], 30); else await evalP(`__t.app.showScreen('analysis');`);
    const a = await blindInfo();
    await sleep(900);
    log = await getLog();
    const playedAnyway = log.some(e => e.ev === 'setPosition' && e.lm === p.moves[3] && e.t > log.find(x => x.ev === 'setPosition' && x.lm === p.moves[1])?.t) && label !== 'Show solution';
    check(`${tag}BLINDFOLD ${label} drops a queued pre-move`, !!q.premove && !a.premove && a.tinted === 0 && (label === 'Next' || !a.armed) && !playedAnyway,
      { queued: q.premove, after: a.premove, armed: a.armed, playedAnyway });
    if (label === 'Peek') await sleep(5200);
    if (label === 'Show solution') await sleep(2500);
    if (!btn) { await toPuzzles(); }
  }
}

// ── Play / Trainer / Endgame: the shared board still pre-moves ──────────────
async function otherBoards() {
  // Play, for real: e4 by finger, then d4 queued while the engine thinks.
  await evalP(`const T = __t; T.app.showScreen('play'); T.inst(T.app.Play.board, 'play'); document.querySelector('#play-color [data-v="w"]').click(); T.log.length = 0;`);
  await sleep(400);
  await tapEl('#play-start');
  await sleep(500);
  const pts = await evalP(`return __t.pts('play-board');`);
  await move(pts, 'e2e4', 'tap');
  await move(pts, 'd2d4', 'tap');
  const q = await evalP(`const b = __t.app.Play.board; return { premove: b.premove, tinted: document.querySelectorAll('#play-board .sq.premove').length };`);
  let played = false;
  for (let i = 0; i < 100 && !played; i++) { await sleep(150); played = (await getLog()).some(e => e.ev === 'setPosition' && e.lm === 'd2d4'); }
  const fired = (await getLog()).filter(e => e.ev === 'firePremove').pop();
  check('PLAY (real game): d4 queued while the engine thinks is played when it replies', q.premove && q.premove.from + q.premove.to === 'd2d4' && q.tinted === 2 && played && fired?.fired === true, { queued: q.premove, played, fired: fired?.fired });

  await tapEl('#play-back');   // ends the real game, so the engine cannot answer into the seeded position
  await sleep(600);
  // All three boards, SEEDED position: the rook retakes on a square my own
  // queen stands on — queued by finger, played by the board's own firePremove.
  for (const [name, id] of [['Play', 'play-board'], ['Trainer', 'trainer-board'], ['Endgame', 'endgame-board']]) {
    const pts2 = await evalP(`const T = __t, S = T.app.${name}, b = S.board;
      T.app.showScreen(${JSON.stringify(name.toLowerCase())});
      for (let el = b.el; el && el.id !== 'screen-${name.toLowerCase()}'; el = el.parentElement) { el.classList.remove('hidden'); if (el.style.display === 'none') el.style.display = ''; }
      T.got = null; T.onMove = b.onMove; b.onMove = mv => { T.got = mv; };
      b.setOrientation('w'); b.clearPremove();
      b.setPosition('4k3/8/8/3q4/8/8/8/R2QK3 b - - 0 1');
      b.interactive = false; b.armPremove();
      await new Promise(r => setTimeout(r, 150));
      return T.pts(${JSON.stringify(id)});`);
    await move(pts2, 'a1d1', 'tap');
    const r = await evalP(`const T = __t, b = T.app.${name}.board;
      const queued = b.premove && b.premove.from + b.premove.to;
      b.setPosition('4k3/8/8/8/8/8/8/R2qK3 w - - 0 1', { from: 'd5', to: 'd1' });
      b.interactive = true;
      const fired = b.firePremove();
      b.onMove = T.onMove;
      return { queued, fired, got: T.got && T.got.from + T.got.to };`);
    check(`${name.toUpperCase()} board (seeded position): a retake onto my own piece's square is queued and fires`, r.queued === 'a1d1' && r.fired === true && r.got === 'a1d1', r);
  }
}

try {
  if (MODE === 'stale') {
    // Not a pre-move check: does Show solution keep playing after Next?
    await load('en', 'light');
    const r = await evalP(`const T = __t, P = T.app.Puzzles;
      const long = T.pz.PUZZLES.find(p => p.moves.length >= 8), other = T.pick('open', 'plain');
      P.loadPuzzle(long); await new Promise(r => setTimeout(r, 900));
      P.showSolution(); await new Promise(r => setTimeout(r, 400));
      P.loadPuzzle(other); await new Promise(r => setTimeout(r, 4000));
      return { solutionMoves: long.moves.length, newPuzzleMoves: other.moves.length, newPuzzleMoveIdx: P.moveIdx, chargedOnNew: P.failedThis };`);
    check('STALE (called, not tapped): after Show solution then a new puzzle, the new puzzle is left alone', r.newPuzzleMoveIdx === 1, r);
  } else if (MODE === 'repro') {
    await load('en', 'light');
    await puzzlesMatrix('', FULL_ROWS);
  } else {
    await load('en', 'light');
    if (!process.env.SKIP_P) await puzzlesMatrix('', FULL_ROWS);
    // the tint, photographed during the opening move
    const info = await puzzleLoad('open', 'plain');
    await move(info.pts, info.moves[1], 'tap');
    await shot('puzzles-premove-tint-en-light');
    await sleep(1500);
    if (!process.env.SKIP_P) await puzzlesExtras('');
    if (!process.env.SKIP_R) await rushRun('', true);
    if (!process.env.SKIP_B) await blindRun('', true);
    await toPuzzles();
    await otherBoards();
    for (const [lang, scheme] of [['es', 'light'], ['en', 'dark'], ['es', 'dark']]) {
      await load(lang, scheme);
      const tag = `${lang}/${scheme}: `;
      const mode = await evalP(`return document.body.className + ' | ' + (await import('${APP_URL}/js/i18n.js')).getLang();`);
      check(`${tag}theme and language applied`, mode.includes('mode-' + scheme) && mode.endsWith('| ' + lang), mode);
      await puzzlesMatrix(tag, SHORT_ROWS);
      const i2 = await puzzleLoad('open', 'plain');
      await move(i2.pts, i2.moves[1], 'tap');
      await shot(`puzzles-premove-tint-${lang}-${scheme}`);
      await sleep(1500);
      await rushRun(tag, false);
      await blindRun(tag, false);
    }
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
