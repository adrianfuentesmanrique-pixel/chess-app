// Headless-Chrome check that Puzzle Rush behaves the same after a change to
// its engine. Dev tool, not shipped.
//
//   node tools/cdp-verify-rush.mjs <outDir>
//   BASE=1 node tools/cdp-verify-rush.mjs <outDir>    (serves js/app.js as committed at HEAD)
//
// Writes <outDir>/record.json — everything the player would see, with the
// puzzle ids left out — so a run with BASE=1 and a run without can be compared
// line for line — plus measure.json (the pickNext spread) and screenshots.
//
// For each of ES/EN x light/dark at 375 px it plays two runs:
//   A: count-in, N solves, one mistake, then the clock runs out -> new best
//   B: three mistakes -> struck out, best unchanged
// REALLY TOUCHED (CDP Input.dispatchTouchEvent): the Rush chip, Start, every
// chess move, Play again, Back to puzzles.
// SEEDED: in every combination but the first, timeLeft is set to 4 once the
// run has been played, so the clock does not have to be waited out four times.
// The first combination waits the whole 3 minutes.
// A puzzle whose answer needs a promotion is answered through Rush.userMove()
// rather than the promotion picker; the record says how often (`promoByCall`).
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/cdp-verify-rush.mjs <outDir>'); process.exit(1); }
const BASE = process.env.BASE === '1';
const BASE_APP = BASE ? execFileSync('git', ['show', 'HEAD:js/app.js'], { cwd: ROOT, maxBuffer: 1 << 26 }) : null;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const WEB = 9900 + Math.floor(Math.random() * 90);
const APP_URL = `http://localhost:${WEB}`;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-rush-'));
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 900000).unref();

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  if (BASE && p === '/js/app.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript', 'Content-Length': BASE_APP.length, 'Cache-Control': 'no-store' });
    res.end(BASE_APP); return;
  }
  // No service worker: it would serve its own cached copy of js/app.js.
  if (p === '/sw.js') { res.writeHead(404).end(); return; }
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
    errors.push('EXC ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    errors.push('CON ' + msg.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    errors.push('LOG ' + (msg.params.entry.text + ' ' + (msg.params.entry.url || '')).slice(0, 300));
  }
});
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok }); console.error((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); };

const INIT = `
  const app = await import('${APP_URL}/js/app.js');
  const { Chess } = await import('${APP_URL}/vendor/chess.js');
  const pz = await import('${APP_URL}/js/puzzles.js');
  const db = await import('${APP_URL}/js/db.js');
  const i18n = await import('${APP_URL}/js/i18n.js');
  const T = window.__t = { app, Chess, pz, db, t: i18n.t };
  T.pts = () => {
    const el = document.getElementById('rush-board');
    el.scrollIntoView({ block: 'center' });
    const o = {};
    el.querySelectorAll('.sq').forEach(s => { const r = s.getBoundingClientRect(); o[s.dataset.sq] = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    return o;
  };
  // A legal move that is not the answer, not a promotion and not mate.
  T.wrong = () => {
    const R = app.Rush, expected = R.current.moves[R.moveIdx];
    for (const m of R.chess.moves({ verbose: true })) {
      if (m.from + m.to === expected.slice(0, 4) || m.promotion) continue;
      const c = new Chess(R.chess.fen()); c.move(m);
      if (!c.isCheckmate()) return m.from + m.to;
    }
    return null;
  };
  const vis = id => !document.getElementById(id).classList.contains('hidden');
  const txt = id => document.getElementById(id).textContent;
  // What the player can see, with nothing that depends on which puzzle came up.
  T.see = () => {
    const R = app.Rush, st = document.getElementById('rush-strikes');
    return {
      screen: !document.getElementById('screen-rush').classList.contains('hidden'),
      intro: vis('rush-intro'), game: vis('rush-game'), result: vis('rush-result'), countdown: vis('rush-countdown'),
      timer: txt('rush-timer'), score: txt('rush-score'),
      strikes: st.querySelectorAll('.rush-strike').length, used: st.querySelectorAll('.rush-strike.used').length, danger: st.classList.contains('danger'),
      status: txt('rush-status'), statusIsPrompt: txt('rush-status') === (R.prompt ?? ''),
      startDisabled: document.getElementById('rush-start').disabled,
      bestOnIntro: txt('rush-best-score'),
      title: txt('rush-result-title'), resultScore: txt('rush-result-score'), resultBest: txt('rush-result-best'),
      logDots: document.querySelectorAll('#rush-log .plog-dot').length,
      logOk: document.querySelectorAll('#rush-log .plog-dot.ok').length,
      logMiss: document.querySelectorAll('#rush-log .plog-dot.miss').length,
      running: R.running, counting: !!R.countingIn, interactive: !!R.board.interactive,
      vScore: R.score, vStrikes: R.strikes, timeLeft: R.timeLeft, duration: R.duration,
    };
  };
  return true;`;

async function load(lang, scheme) {
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
  await send('Page.navigate', { url: APP_URL });
  await sleep(2500);
  await evalP(`localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1');`);
  await send('Page.reload', {});
  await sleep(3500);
  await killModals();
  await evalP(`document.querySelector('[data-screen="puzzles"]').click();`);
  await sleep(1500);
  await killModals();
  await evalP(INIT);
}

const touch = (type, p) => send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }] : [] });
async function tap(p, hold = 25) { await touch('touchStart', p); await sleep(hold); await touch('touchEnd'); }
async function tapMove(uci) {
  const pts = await evalP(`return __t.pts();`);
  await tap(pts[uci.slice(0, 2)]); await sleep(15); await tap(pts[uci.slice(2, 4)]);
}
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
const until = async (expr, ms = 6000) => {
  for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (await evalP(`const R = __t.app.Rush; return !!(${expr});`)) return true; await sleep(30); }
  return false;
};
const see = () => evalP(`return __t.see();`);
const ready = () => until(`R.running && !R.countingIn && R.moveIdx === 1 && R.board.interactive`, 8000);
const inRange = (v, a, b) => v >= a && v <= b;

// Plays the puzzle on the board to the end. Returns how long the next one took to appear.
async function solveOne(rec) {
  await ready();
  const p = await evalP(`const R = __t.app.Rush; return { id: R.current.id, moves: R.current.moves, score: R.score };`);
  for (let i = 1; i < p.moves.length; i += 2) {
    await until(`R.moveIdx === ${i} && R.board.interactive`, 3000);
    const u = p.moves[i];
    if (u.length > 4) {
      rec.promoByCall++;
      await evalP(`__t.app.Rush.userMove({ from: '${u.slice(0, 2)}', to: '${u.slice(2, 4)}', promotion: '${u[4]}' });`);
    } else await tapMove(u);
    if (await evalP(`return __t.app.Rush.score;`) > p.score) break;      // a mate that was not the listed move
  }
  const scored = await until(`R.score === ${p.score + 1}`, 2000);
  const t0 = Date.now();
  const next = await until(`R.current.id !== '${p.id}'`, 3000);
  return { scored, next, ms: Date.now() - t0 };
}
async function missOne() {
  await ready();
  const p = await evalP(`const R = __t.app.Rush; return { id: R.current.id, strikes: R.strikes, wrong: __t.wrong() };`);
  await tapMove(p.wrong);
  const struck = await until(`R.strikes === ${p.strikes + 1}`, 2000);
  const t0 = Date.now();
  const after = await see();
  return { id: p.id, struck, t0, after };
}

async function combo(lang, scheme, n, realClock) {
  const tag = `${lang.toUpperCase()}/${scheme}`;
  const rec = { tag, promoByCall: 0, steps: {} };
  await load(lang, scheme);
  const best0 = await evalP(`return __t.db.kvGet('rushBest180', 0);`);

  // ── run A ──
  await tapEl('#screen-puzzles .puzzle-modes [data-v="rush"]');
  await until(`!document.getElementById('rush-intro').classList.contains('hidden') && !document.getElementById('screen-rush').classList.contains('hidden')`, 3000);
  await sleep(300);
  rec.steps.intro = await see();
  await shot(`${lang}-${scheme}-1-intro`);
  await tapEl('#rush-start');
  await until(`R.running`, 3000);
  await sleep(1200);
  const c1 = await see();
  await shot(`${lang}-${scheme}-2-countin`);
  await sleep(2000);
  const c2 = await see();
  rec.steps.countIn = { ...c1, status: c1.status };
  check(`${tag} count-in: over the board, board frozen, clock not running`, c1.countdown && c1.counting && !c1.interactive && c1.timeLeft === 180 && c2.timeLeft === 180 && c2.counting, { timer: c1.timer, status: c1.status });
  await until(`!R.countingIn`, 6000);
  const live = await see();
  rec.steps.live = { ...live, timeLeft: null, timer: null };
  check(`${tag} after the count-in: prompt back, countdown gone, clock started at 3:00`, !live.countdown && live.statusIsPrompt && live.status.length > 3 && inRange(live.timeLeft, 179, 180), { status: live.status, timeLeft: live.timeLeft });
  const tA = Date.now(), leftA = live.timeLeft;

  const solveMs = [];
  for (let i = 0; i < n; i++) {
    const s = await solveOne(rec);
    solveMs.push(s.ms);
    check(`${tag} solve ${i + 1}: score up, next puzzle about 0.35 s later`, s.scored && s.next && inRange(s.ms, 150, 900), s);
  }
  await ready();
  const afterSolves = await see();
  rec.steps.afterSolves = { ...afterSolves, timeLeft: null, timer: null, status: null };
  check(`${tag} HUD after ${n} solve(s)`, afterSolves.score === `⚡ ${n}` && afterSolves.used === 0 && afterSolves.strikes === 3 && afterSolves.logDots === n && afterSolves.logOk === n, { score: afterSolves.score, dots: afterSolves.logDots });

  const m = await missOne();
  rec.steps.afterMistake = { ...m.after, timeLeft: null, timer: null };
  const nextAfterMiss = await until(`R.current.id !== '${m.id}'`, 3000);
  const missMs = Date.now() - m.t0;
  await shot(`${lang}-${scheme}-3-mistake`);
  check(`${tag} mistake: one strike, "2 left" message, board frozen, next puzzle about 1.2 s later`,
    m.struck && m.after.used === 1 && !m.after.danger && !m.after.interactive && /2/.test(m.after.status) && m.after.logMiss === 1 && nextAfterMiss && inRange(missMs, 900, 1900), { status: m.after.status, ms: missMs });

  // the clock really ticks at one second a second
  const lost = leftA - (await see()).timeLeft, real = (Date.now() - tA) / 1000;
  check(`${tag} the clock ticks one second a second`, Math.abs(lost - real) <= 1.6, { lost, real: +real.toFixed(1) });

  if (!realClock) await evalP(`__t.app.Rush.timeLeft = 4;`);
  const waitMs = realClock ? 200000 : 9000;
  const ended = await until(`!R.running && !document.getElementById('rush-result').classList.contains('hidden')`, waitMs);
  await sleep(400);
  const resA = await see();
  rec.steps.resultA = { ...resA, status: null };
  await shot(`${lang}-${scheme}-4-timeup`);
  const bestA = await evalP(`return __t.db.kvGet('rushBest180', 0);`);
  const overall = await evalP(`return __t.db.kvGet('rushBestScore', 0);`);
  const month = await evalP(`return __t.db.kvGet('rushMonth180', 0);`);
  rec.steps.savedA = { best0, bestA, overall, month, realClock };
  check(`${tag} clock ran out${realClock ? ' (full 3 minutes waited)' : ''}: result screen, time-up title, score ${n}`,
    ended && resA.result && !resA.game && resA.title === (await evalP(`return __t.t('rush_time_up');`)) && resA.resultScore === String(n) && resA.timer === '⏱ 0:00', { title: resA.title, score: resA.resultScore, timer: resA.timer });
  check(`${tag} best score saved: ${best0} -> ${n}, "new best" line shown`, best0 === n - 1 && bestA === n && overall === n && month === n && resA.resultBest === (await evalP(`return __t.t('rush_new_best');`)), { best0, bestA, overall, month, line: resA.resultBest });
  check(`${tag} result strip shows the run: ${n} solved + 1 missed`, resA.logOk === n && resA.logMiss === 1, { ok: resA.logOk, miss: resA.logMiss });

  // ── run B ──
  await tapEl('#rush-again');
  await until(`!document.getElementById('rush-intro').classList.contains('hidden')`, 3000);
  await sleep(300);
  const introB = await see();
  rec.steps.introB = introB;
  check(`${tag} Play again: back on the intro, best score shows ${n}`, introB.intro && !introB.result && introB.bestOnIntro === String(n), { best: introB.bestOnIntro });
  await tapEl('#rush-start');
  await until(`R.running && !R.countingIn`, 9000);
  const liveB = await see();
  check(`${tag} second run starts clean`, liveB.vScore === 0 && liveB.vStrikes === 0 && liveB.logDots === 0 && inRange(liveB.timeLeft, 179, 180), { score: liveB.vScore, strikes: liveB.vStrikes, dots: liveB.logDots });
  const m1 = await missOne();
  await until(`R.current.id !== '${m1.id}'`, 3000);
  const m2 = await missOne();
  rec.steps.afterMistake2 = { ...m2.after, timeLeft: null, timer: null };
  check(`${tag} second strike: "last chance" message, strikes badge turns red`, m2.struck && m2.after.used === 2 && m2.after.danger && m2.after.status === (await evalP(`return __t.t('rush_strike_last');`)), { status: m2.after.status });
  await until(`R.current.id !== '${m2.id}'`, 3000);
  await ready();
  const p3 = await evalP(`return __t.wrong();`);
  await tapMove(p3);
  const out = await until(`!R.running && !document.getElementById('rush-result').classList.contains('hidden')`, 3000);
  await sleep(400);
  const resB = await see();
  rec.steps.resultB = { ...resB, timeLeft: null, timer: null, status: null };
  await shot(`${lang}-${scheme}-5-strikes`);
  const bestB = await evalP(`return __t.db.kvGet('rushBest180', 0);`);
  check(`${tag} three strikes: run over at once, title says so, score 0, best still ${n}`,
    out && resB.title === (await evalP(`return __t.t('rush_strikes_out');`)) && resB.resultScore === '0' && bestB === n && resB.resultBest.endsWith(': ' + n) && resB.logMiss === 3 && resB.logOk === 0, { title: resB.title, line: resB.resultBest });

  await tapEl('#rush-exit');
  const exited = await until(`!document.getElementById('screen-puzzles').classList.contains('hidden') && document.getElementById('screen-rush').classList.contains('hidden')`, 3000);
  check(`${tag} Back to puzzles leaves Rush`, exited);
  rec.solveMsOk = solveMs.every(x => inRange(x, 150, 900));
  return rec;
}

// The v159 measurement: the app's real Rush.pickNext(), 40 runs x 10 puzzles.
async function measure() {
  return evalP(`const T = __t, R = T.app.Rush;
    for (let s = 0; s < 10; s++) await T.pz.ensureForRating(900 + s * 55);
    const keep = { score: R.score, usedIds: R.usedIds };
    const at = Array.from({ length: 10 }, () => new Set()); let repeats = 0, maxOff = 0;
    for (let run = 0; run < 40; run++) {
      R.usedIds = new Set(); const seen = new Set();
      for (let i = 0; i < 10; i++) {
        R.score = i; const p = R.pickNext();
        if (seen.has(p.id)) repeats++; seen.add(p.id); at[i].add(p.id);
        maxOff = Math.max(maxOff, Math.abs(p.rating - (900 + i * 55)));
      }
    }
    R.score = keep.score; R.usedIds = keep.usedIds;
    return { loaded: T.pz.PUZZLES.length, differentAtEachPosition: at.map(s => s.size), repeatsInsideARun: repeats, furthestFromTarget: maxOff };`);
}

const record = [];
let fatal = null, m = null;
try {
  const combos = [['es', 'light'], ['en', 'dark'], ['es', 'dark'], ['en', 'light']];
  for (let i = 0; i < combos.length; i++) record.push(await combo(combos[i][0], combos[i][1], i + 1, i === 0));
  m = await measure();
  check('pickNext: 38-40 different puzzles out of 40 at every position', m.differentAtEachPosition.every(x => x >= 38), m.differentAtEachPosition);
  check('pickNext: ratings within about 50 of the target, 0 repeats inside a run', m.furthestFromTarget <= 50 && m.repeatsInsideARun === 0, { furthest: m.furthestFromTarget, repeats: m.repeatsInsideARun, loaded: m.loaded });
} catch (e) { fatal = e; console.error('FATAL', e); }

fs.writeFileSync(path.join(OUT, 'record.json'), JSON.stringify(record, null, 1));
fs.writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(m, null, 1));
fs.writeFileSync(path.join(OUT, 'errors.json'), JSON.stringify(errors, null, 1));
const bad = checks.filter(c => !c.ok);
console.error(`\n${BASE ? 'BASE (HEAD)' : 'WORKING TREE'}: ${checks.length - bad.length}/${checks.length} checks pass; console errors: ${errors.length}`);
for (const e of [...new Set(errors)]) console.error('  ' + e.slice(0, 200));
chrome.kill(); server.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(fatal || bad.length ? 1 : 0);
