// Headless-Chrome check of the "badge earned" notice. Dev tool, not shipped.
//
//   node tools/cdp-verify-badge.mjs <outDir> repro     what the player sees today (works on any commit)
//   node tools/cdp-verify-badge.mjs <outDir> card      the congratulation card (js/badge-card.js)
//
// REALLY TOUCHED (CDP Input.dispatchTouchEvent): the chess moves that solve the
// puzzle, the card itself, the Rush Start button.
// SEEDED: the kv store (9 solved puzzles, streak dates, rush bests) and, in the
// Rush case, Rush.timeLeft so the clock does not have to be waited out.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2], MODE = process.argv[3] || 'card';
if (!OUT) { console.error('usage: node tools/cdp-verify-badge.mjs <outDir> [repro|card]'); process.exit(1); }
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const WEB = 9900 + Math.floor(Math.random() * 90);
const APP_URL = `http://localhost:${WEB}`;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-badge-'));
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 600000).unref();

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.wav': 'audio/wav' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  // No service worker: it would serve its own cached copy of the scripts.
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
  }
});
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok }); console.error((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); };

// Everything the page-side code needs. __t.log is a 40 ms sampler of what is
// actually on screen: Kael's bubble and (when it exists) the badge card.
const INIT = `
  const app = await import('${APP_URL}/js/app.js');
  const db = await import('${APP_URL}/js/db.js');
  const i18n = await import('${APP_URL}/js/i18n.js');
  const bd = await import('${APP_URL}/js/badges.js');
  let bc = null; try { bc = await import('${APP_URL}/js/badge-card.js'); } catch {}
  const T = window.__t = { app, db, bd, bc, t: i18n.t, log: [], t0: performance.now() };
  T.pts = id => {
    const el = document.getElementById(id);
    el.scrollIntoView({ block: 'center' });
    const o = {};
    el.querySelectorAll('.sq').forEach(s => { const r = s.getBoundingClientRect(); o[s.dataset.sq] = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    return o;
  };
  let last = '';
  setInterval(() => {
    const b = document.getElementById('kael-bubble'), c = document.getElementById('badge-card');
    const s = JSON.stringify({
      kael: b.classList.contains('show') ? b.innerText.replace(/\\s+/g, ' ').trim() : null,
      card: c && c.classList.contains('show') ? c.innerText.replace(/\\s+/g, ' ').trim() : null,
    });
    if (s !== last) { last = s; T.log.push({ ms: Math.round(performance.now() - T.t0), ...JSON.parse(s) }); }
  }, 40);
  return true;`;

const today = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const nine = Object.fromEntries(Array.from({ length: 9 }, (_, i) => ['seed' + i, ['seedtheme']]));

// seed: kv keys written before the app boots for real. Everything a badge reads
// is reset each time so one scenario cannot leak into the next.
async function load(lang, scheme, seed = {}, { reduced = false, screen = 'puzzles' } = {}) {
  const kv = { onboardingDone: true, tourDone: 'done', earnedBadges: {}, puzzlesSolved: {}, puzzleAutoNext: false,
    streakCount: 1, streakLastDate: today(), bestStreak: 1, rushBest180: 0, rushBest300: 0, rushBestScore: 0,
    firstImportDone: false, firstEngineUsed: false, endgameConverted: {}, openingElo: {}, engineLevelsBeaten: {},
    bestDailyMissionStreak: 0, soundEnabled: false, ...seed };
  await send('Emulation.setEmulatedMedia', { features: [
    { name: 'prefers-color-scheme', value: scheme },
    { name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] });
  await send('Page.navigate', { url: APP_URL });
  await sleep(2500);
  await evalP(`localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1');
    const db = await import('${APP_URL}/js/db.js');
    for (const [k, v] of Object.entries(${JSON.stringify(kv)})) await db.kvSet(k, v);`);
  await send('Page.reload', {});
  await sleep(3500);
  await killModals();
  await evalP(`document.querySelector('[data-screen="${screen}"]').click();`);
  await sleep(1500);
  await killModals();
  await evalP(INIT);
}

const touch = (type, p) => send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }] : [] });
async function tap(p, hold = 25) { await touch('touchStart', p); await sleep(hold); await touch('touchEnd'); }
async function tapMove(boardId, uci) {
  const pts = await evalP(`return __t.pts('${boardId}');`);
  await tap(pts[uci.slice(0, 2)]); await sleep(15); await tap(pts[uci.slice(2, 4)]);
}
const until = async (expr, ms = 6000) => {
  for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (await evalP(`const A = __t.app, R = A.Rush, P = A.Puzzles; return !!(${expr});`)) return true; await sleep(30); }
  return false;
};
const logNow = () => evalP(`return __t.log;`);
const mark = () => evalP(`__t.log.length = 0; __t.t0 = performance.now();`);

// Solves the puzzle on the Puzzles screen with real taps (promotions by call).
async function solvePuzzle() {
  await until(`P.current && P.moveIdx === 1 && P.board.interactive`, 8000);
  const p = await evalP(`const P = __t.app.Puzzles; return { id: P.current.id, moves: P.current.moves };`);
  for (let i = 1; i < p.moves.length; i += 2) {
    await until(`P.moveIdx === ${i} && P.board.interactive`, 3000);
    const u = p.moves[i];
    if (u.length > 4) await evalP(`__t.app.Puzzles.userMove({ from: '${u.slice(0, 2)}', to: '${u.slice(2, 4)}', promotion: '${u[4]}' });`);
    else await tapMove('puzzle-board', u);
    if (await evalP(`return !!__t.app.Puzzles.solved['${p.id}'];`)) break;
  }
  return until(`P.solved['${p.id}']`, 3000);
}

// ───────────────────────── repro: what happens today ─────────────────────────
async function repro() {
  const out = {};
  for (const [name, seed] of [
    ['A-streak-already-counted-today', { puzzlesSolved: nine }],
    ['B-first-solve-of-the-day', { puzzlesSolved: nine, streakCount: 0, streakLastDate: null, bestStreak: 0 }],
  ]) {
    await load('es', 'light', seed);
    await mark();
    const solved = await solvePuzzle();
    for (const ms of [300, 1500, 4000]) { await sleep(ms === 300 ? 300 : ms === 1500 ? 1200 : 2500); await shot(`repro-${name}-${ms}ms`); }
    await sleep(9000);
    const log = await logNow();
    const earned = await evalP(`return Object.keys(await __t.db.kvGet('earnedBadges', {}));`);
    out[name] = { solved, earned, log };
    console.error(name, JSON.stringify({ solved, earned }), '\n' + log.map(l => `   ${String(l.ms).padStart(6)} ms  kael: ${l.kael ?? '(nothing)'}`).join('\n'));
  }
  fs.writeFileSync(path.join(OUT, 'repro.json'), JSON.stringify(out, null, 1));
}

// ───────────────────────── card: the new behaviour ─────────────────────────
async function tapEl(sel) {
  const pt = await evalP(`const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null;
    el.scrollIntoView({ block: 'center' }); await new Promise(r => setTimeout(r, 80));
    const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
  if (!pt) throw new Error('no element ' + sel);
  await tap(pt, 40); await sleep(120);
}
const cardUp = (ms = 8000) => until(`document.getElementById('badge-card').classList.contains('show')`, ms);
const cardDown = (ms = 8000) => until(`!document.getElementById('badge-card').classList.contains('show')`, ms);
const cardInfo = () => evalP(`const c = document.getElementById('badge-card'), r = c.getBoundingClientRect(), cs = getComputedStyle(c);
  const art = c.querySelector('.badge-card-art'), img = c.querySelector('img');
  const b = document.querySelector('.screen:not(.hidden) .board-wrap')?.getBoundingClientRect();
  return { show: c.classList.contains('show'), l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom),
    opacity: cs.opacity, transform: cs.transform, transition: cs.transitionProperty,
    artAnim: art ? getComputedStyle(art).animationName : null, shineAnim: art ? getComputedStyle(art, '::after').animationName : null,
    img: img ? img.complete && img.naturalWidth > 0 : false,
    kicker: c.querySelector('.badge-card-kicker')?.textContent, name: c.querySelector('.badge-card-name')?.textContent,
    overBoard: b ? !(r.bottom <= b.top || r.top >= b.bottom) : false };`);
const cardsIn = log => log.filter(l => l.card).map(l => l.card).filter((c, i, a) => c !== a[i - 1]);
const span = (log, text) => { const i = log.findIndex(l => l.card === text); if (i < 0) return 0; const j = log.findIndex((l, k) => k > i && l.card !== text); return (j < 0 ? NaN : log[j].ms) - log[i].ms; };

async function card() {
  // 1 ── one badge, every language x theme, mid-animation screenshots
  for (const [lang, scheme] of [['es', 'light'], ['en', 'dark'], ['es', 'dark'], ['en', 'light']]) {
    const tag = `${lang.toUpperCase()}/${scheme}`;
    await load(lang, scheme, { puzzlesSolved: nine });
    await mark();
    const solved = await solvePuzzle();
    const up = await cardUp();
    await shot(`one-${lang}-${scheme}-1-entering`);
    await sleep(330); await shot(`one-${lang}-${scheme}-2-bounce`);
    await sleep(380); await shot(`one-${lang}-${scheme}-3-shine`);
    await sleep(900);
    const info = await cardInfo();
    await shot(`one-${lang}-${scheme}-4-settled`);
    const want = lang === 'es' ? ['¡Felicidades! Nuevo logro', 'Novato de la táctica'] : ['Congratulations! New badge', 'Puzzle Novice'];
    check(`${tag} one badge: card appears with the picture, the congratulation line and the name`, solved && up && info.img && info.kicker === want[0] && info.name === want[1], info);
    check(`${tag} card is inside the 375 px screen and not over the board`, info.l >= 0 && info.r <= 375 && info.t >= 0 && !info.overBoard, { l: info.l, r: info.r, t: info.t, b: info.b });
    check(`${tag} it bounces and shines (animations really attached)`, info.artAnim === 'badge-card-bounce' && info.shineAnim === 'badge-card-shine', { art: info.artAnim, shine: info.shineAnim });
    if (lang === 'es' && scheme === 'light') {
      // a Kael quote arriving meanwhile
      await evalP(`__t.app.KaelQuotes.show({ text: 'QUOTE-MEANWHILE' }, 1500);`);
      await sleep(400);
      const both = await evalP(`return { card: document.getElementById('badge-card').classList.contains('show'), kael: document.getElementById('kael-bubble').innerText };`);
      await shot('one-es-light-5-kael-quote-meanwhile');
      check(`${tag} a Kael quote arriving meanwhile does not remove the card`, both.card && /QUOTE-MEANWHILE/.test(both.kael), both);
    }
    if (lang === 'en' && scheme === 'dark') {
      // tap it
      const c = await cardInfo();
      await tap({ x: (c.l + c.r) / 2, y: (c.t + c.b) / 2 }, 40);
      await sleep(1300);
      const after = await evalP(`const tc = document.getElementById('trophy-case').getBoundingClientRect();
        return { profile: !document.getElementById('screen-profile').classList.contains('hidden'), card: document.getElementById('badge-card').classList.contains('show'),
          trophyOnScreen: tc.top < 812 && tc.bottom > 0, earnedCells: document.querySelectorAll('#trophy-case .badge-cell.earned').length };`);
      await shot('one-en-dark-5-after-tap-trophy-case');
      check(`${tag} tapping the card opens Profile at the trophy case and the card leaves`, after.profile && !after.card && after.trophyOnScreen && after.earnedCells === 1, after);
    } else {
      const down = await cardDown();
      await sleep(150);                  // let the 40 ms sampler write the last line
      const log = await logNow();
      const ms = span(log, log.find(l => l.card)?.card);
      check(`${tag} it leaves by itself after about 4.6 s; Kael's bubble never carried the badge`, down && ms > 4200 && ms < 5300 && !log.some(l => /logro|Achievement|Novato|Novice/i.test(l.kael ?? '')), { ms });
    }
    const earned = await evalP(`return Object.keys(await __t.db.kvGet('earnedBadges', {}));`);
    check(`${tag} the badge is saved`, earned.join() === 'puz_10', earned);
  }

  // 2 ── three badges from one solve
  await load('es', 'dark', { puzzlesSolved: nine, firstImportDone: true, firstEngineUsed: true });
  await mark();
  await solvePuzzle();
  for (let i = 1; i <= 3; i++) {
    await until(`document.getElementById('badge-card').classList.contains('show') && __t.log.filter(l => l.card).map(l => l.card).filter((c, i, a) => c !== a[i - 1]).length === ${i}`, 9000);
    await sleep(700); await shot(`three-${i}`);
  }
  await cardDown(9000);
  await sleep(600);
  let log = await logNow();
  let seen = cardsIn(log);
  check('three badges at once: three cards, one after another, none lost, none twice', seen.length === 3 && new Set(seen).size === 3 && ['Novato de la táctica', 'Primera partida importada', 'Primer análisis con motor'].every(n => seen.some(s => s.includes(n))), seen);
  check('three badges: each stays about 4.6 s, with a gap between them', seen.every(s => { const ms = span(log, s); return ms > 4200 && ms < 5300; }) && log.filter(l => l.card === null).length >= 3, seen.map(s => span(log, s)));

  // 3 ── first solve of the day: the streak celebration goes first, then the card
  await load('en', 'light', { puzzlesSolved: nine, streakCount: 0, streakLastDate: null, bestStreak: 0 });
  await mark();
  await solvePuzzle();
  await until(`/Streak|streak/.test(document.getElementById('kael-bubble').innerText) && document.getElementById('kael-bubble').classList.contains('show')`, 4000);
  await sleep(500); await shot('streak-1-celebration-first');
  await cardUp(9000); await sleep(1200); await shot('streak-2-then-the-card');
  await cardDown();
  log = await logNow();
  const streakAt = log.find(l => /streak/i.test(l.kael ?? ''))?.ms, cardAt = log.find(l => l.card)?.ms;
  check('first solve of the day: streak celebration is not talked over, the card follows it', streakAt !== undefined && cardAt !== undefined && cardAt - streakAt > 4500 && !log.some(l => l.card && /streak/i.test(l.kael ?? '')), { streakAt, cardAt });

  // 4 ── a badge earned during a timed Rush run
  await load('es', 'light', { firstEngineUsed: true });
  await tapEl('#screen-puzzles .puzzle-modes [data-v="rush"]');
  await until(`!document.getElementById('rush-intro').classList.contains('hidden')`, 3000);
  await tapEl('#rush-start');
  await until(`R.running && !R.countingIn && R.moveIdx === 1`, 12000);
  await mark();
  await evalP(`await __t.bd.Badges.checkNew();`);          // SEEDED: the earn itself; first_engine was pending
  await sleep(3500);
  const during = await evalP(`return { running: __t.app.Rush.running, card: document.getElementById('badge-card').classList.contains('show'), queued: __t.bc.BadgeCard.queue.length, saved: Object.keys(await __t.db.kvGet('earnedBadges', {})) };`);
  await shot('rush-1-during-run-no-card');
  check('Rush: a badge earned mid-run is saved but NOT shown while the clock runs', during.running && !during.card && during.queued === 1 && during.saved.includes('first_engine'), during);
  await evalP(`__t.app.Rush.score = 20; __t.app.Rush.timeLeft = 2;`);   // SEEDED: 20 solved, 2 s left
  await until(`!R.running`, 6000);
  const up1 = await cardUp(4000);
  await sleep(900); await shot('rush-2-after-run-first-card');
  await until(`__t.log.filter(l => l.card).map(l => l.card).filter((c, i, a) => c !== a[i - 1]).length === 2`, 9000);
  await sleep(900); await shot('rush-3-after-run-second-card');
  await cardDown(9000);
  log = await logNow(); seen = cardsIn(log);
  check('Rush: when the run ends the held card appears, then the Rush badge the run itself earned', up1 && seen.length === 2 && seen[0].includes('Primer análisis con motor') && seen[1].includes('Puzzle Rush 3 min: 20'), seen);

  // 5 ── reduce motion
  await load('es', 'dark', { puzzlesSolved: nine }, { reduced: true });
  await mark();
  await solvePuzzle();
  await cardUp();
  await sleep(120); const early = await cardInfo(); await shot('reduced-1-fading-in');
  await sleep(700); const rm = await cardInfo(); await shot('reduced-2-shown');
  await cardDown(); await sleep(500);
  check('reduce motion: no slide, no bounce, no shine — opacity only', early.transform === 'none' && rm.transform === 'none' && rm.artAnim === 'none' && rm.shineAnim === 'none' && rm.transition === 'opacity' && rm.opacity === '1', { early: early.opacity, transform: rm.transform, art: rm.artAnim, shine: rm.shineAnim, transition: rm.transition });
  check('reduce motion: it still leaves by itself', !(await cardInfo()).show);

  // 6 ── the two positions, for the decision
  for (const scheme of ['light', 'dark']) for (const pos of ['top', 'bottom']) {
    await load('es', scheme, { puzzlesSolved: nine });
    await evalP(`__t.bc.BadgeCard.position = '${pos}';`);
    await solvePuzzle(); await cardUp(); await sleep(1700);
    const info = await cardInfo();
    await shot(`position-${pos}-${scheme}`);
    if (pos === 'bottom' && scheme === 'light') {
      await evalP(`__t.app.KaelQuotes.show({ text: __t.app.KaelQuotes.pick().text, author: 'Kael' }, 3000);`);
      await sleep(500); await shot('position-bottom-light-with-kael-talking');
    }
    check(`position ${pos}/${scheme}: on screen, not over the board`, info.l >= 0 && info.r <= 375 && info.b <= 812 && !info.overBoard, { t: info.t, b: info.b, overBoard: info.overBoard });
  }
}

let fatal = null;
try {
  if (MODE === 'repro') await repro();
  else await card();
} catch (e) { fatal = e; console.error('FATAL', e); }

fs.writeFileSync(path.join(OUT, 'errors.json'), JSON.stringify(errors, null, 1));
const bad = checks.filter(c => !c.ok);
console.error(`\n${MODE}: ${checks.length - bad.length}/${checks.length} checks pass; console errors: ${errors.length}`);
for (const e of [...new Set(errors)]) console.error('  ' + e.slice(0, 200));
chrome.kill(); server.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(fatal || bad.length ? 1 : 0);
