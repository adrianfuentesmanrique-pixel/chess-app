// Headless-Chrome check of the grey "not credited yet today" streak flame.
// Dev tool, not shipped.
//
//   node tools/cdp-verify-streak-grey.mjs <outDir>
//
// REALLY TOUCHED (CDP Input.dispatchTouchEvent): the chess moves that solve the
// puzzle, the tab that is tapped after midnight.
// SEEDED: the kv store (streak count and dates), and the clock — Date is
// wrapped before the app loads so a test can push it forward a day or three
// without waiting for midnight. `visibilitychange` is dispatched by hand:
// headless Chrome has no "back to the front".
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/cdp-verify-streak-grey.mjs <outDir>'); process.exit(1); }
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const WEB = 9900 + Math.floor(Math.random() * 90);
const APP_URL = `http://localhost:${WEB}`;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-streak-'));
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
async function shot(name, clip) {
  const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
}
// The top bar alone, enlarged: a 20px flame cannot be judged in a full-page shot.
const shotBar = name => shot(name, { x: 0, y: 0, width: 375, height: 56, scale: 3 });
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
// The movable clock. The offset starts at 0 on every page load.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
  const Real = Date; let off = 0;
  class Fake extends Real {
    constructor(...a) { if (a.length) super(...a); else super(Real.now() + off); }
    static now() { return Real.now() + off; }
  }
  window.Date = Fake;
  window.__addDays = n => { off += n * 86400000; };
})();` });

const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok }); console.error((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); };

const INIT = `
  const app = await import('${APP_URL}/js/app.js');
  const db = await import('${APP_URL}/js/db.js');
  const T = window.__t = { app, db };
  T.pts = id => {
    const el = document.getElementById(id);
    el.scrollIntoView({ block: 'center' });
    const o = {};
    el.querySelectorAll('.sq').forEach(s => { const r = s.getBoundingClientRect(); o[s.dataset.sq] = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    return o;
  };
  return true;`;

const day = back => { const d = new Date(Date.now() - back * 86400000), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

async function load(lang, scheme, seed = {}, { reduced = false, screen = 'puzzles' } = {}) {
  const kv = { onboardingDone: true, tourDone: 'done', earnedBadges: {}, puzzlesSolved: {}, puzzleAutoNext: false,
    streakCount: 5, streakLastDate: day(1), bestStreak: 5, soundEnabled: false, ...seed };
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
  for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (await evalP(`const A = __t.app, P = A.Puzzles; return !!(${expr});`)) return true; await sleep(30); }
  return false;
};
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

// What is actually painted in the header, plus what is stored.
const badge = () => evalP(`const el = document.getElementById('streak-badge'), img = el.querySelector('img'), n = el.querySelector('span');
  const r = el.getBoundingClientRect();
  return { cls: [...el.classList].filter(c => c !== 'streak-badge').sort().join(' '), n: n.textContent, title: el.title,
    filter: getComputedStyle(img).filter, imgOpacity: getComputedStyle(img).opacity, opacity: getComputedStyle(el).opacity,
    color: getComputedStyle(n).color, muted: getComputedStyle(document.documentElement).getPropertyValue('--muted').trim(),
    anim: getComputedStyle(el).animationName, icon: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0,
    inside: r.left >= 0 && r.right <= 375,
    kvCount: await __t.db.kvGet('streakCount', null), kvDate: await __t.db.kvGet('streakLastDate', null) };`);
const profileFlame = () => evalP(`const now = document.querySelector('#profile-streak-ladder .streak-now'), img = now.querySelector('.streak-now-icon');
  return { cls: img.className, haze: now.classList.contains('has-flame'), filter: getComputedStyle(img).filter, opacity: getComputedStyle(img).opacity,
    anim: getComputedStyle(img).animationName, day: now.querySelector('.streak-now-day').textContent };`);
const openProfile = async () => { await evalP(`__t.app.showScreen('profile');`); await sleep(900);
  await evalP(`document.getElementById('profile-streak-ladder').scrollIntoView({ block: 'center' });`); await sleep(250); };
const isGrey = b => b.cls === 'pending' && /grayscale\(1\)/.test(b.filter) && b.imgOpacity === '0.75' && b.opacity === '1';
const isColour = b => !/pending|zero/.test(b.cls) && b.filter === 'none' && b.imgOpacity === '1' && b.opacity === '1';

async function run() {
  // 1 ── yesterday credited, nothing today: grey with yesterday's number; one
  //      solved puzzle turns it to colour and +1. Every language x theme.
  for (const [lang, scheme] of [['es', 'light'], ['en', 'dark'], ['es', 'dark'], ['en', 'light']]) {
    const tag = `${lang.toUpperCase()}/${scheme}`;
    await load(lang, scheme);
    const g = await badge();
    await shotBar(`grey-${lang}-${scheme}-1-bar`); await shot(`grey-${lang}-${scheme}-1-full`);
    check(`${tag} yesterday credited: grey flame, yesterday's number 5, number in the muted colour`, isGrey(g) && g.n === '5' && g.loaded && g.inside && g.kvCount === 5, g);
    check(`${tag} tooltip follows the language`, g.title === (lang === 'es' ? 'Racha diaria' : 'Daily streak'), g.title);
    await openProfile();
    const pg = await profileFlame();
    await shot(`grey-${lang}-${scheme}-2-profile`);
    check(`${tag} Profile: grey, still, no haze, "Day 5" unchanged`, /locked/.test(pg.cls) && /pending/.test(pg.cls) && !pg.haze && /grayscale\(1\)/.test(pg.filter) && pg.opacity === '0.75' && pg.anim === 'none' && /5/.test(pg.day), pg);
    await evalP(`__t.app.showScreen('puzzles');`); await sleep(900);
    const solved = await solvePuzzle();
    await sleep(120);
    const c = await badge();
    await shotBar(`grey-${lang}-${scheme}-3-bar-after-solve`);
    check(`${tag} one puzzle solved: colour, 6, with the small pop, no reload`, solved && isColour(c) && c.n === '6' && c.cls === 'lit' && c.anim === 'streak-pop' && c.kvCount === 6 && c.kvDate === day(0), c);
    await sleep(900);
    await openProfile();
    const pc = await profileFlame();
    await shot(`grey-${lang}-${scheme}-4-profile-after-solve`);
    check(`${tag} Profile after the solve: colour, moving, haze back, Day 6`, !/locked|pending/.test(pc.cls) && pc.haze && pc.anim !== 'none' && /6/.test(pc.day), pc);
  }

  // 2 ── day already credited: colour on load
  await load('es', 'light', { streakLastDate: day(0) });
  let b = await badge();
  await shotBar('credited-today-bar');
  check('day already credited: colour on load, 5, no pop', isColour(b) && b.n === '5' && b.cls === '' && b.anim === 'none', b);

  // 3 ── midnight passes with the app open (still scenario 2's page)
  await evalP(`__addDays(1); document.dispatchEvent(new Event('visibilitychange'));`);
  await sleep(500);
  b = await badge();
  await shotBar('midnight-1-back-to-front-bar');
  check('midnight, app back to the front: grey with 5, no reload', isGrey(b) && b.n === '5' && b.kvCount === 5, b);
  await evalP(`__addDays(-1); document.dispatchEvent(new Event('visibilitychange'));`);
  await sleep(500);
  check('clock back: colour again (the grey is worked out, not stored)', isColour(await badge()));
  await evalP(`__addDays(1);`);
  await sleep(200);
  check('midnight, app never left the front: nothing repaints by itself (no timer)', isColour(await badge()));
  // At 375px the tabs live behind the menu button: open it, then tap the tab.
  const centre = sel => evalP(`const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
  await tap(await centre('#tabmenu-btn'), 40); await sleep(400);
  await tap(await centre('#tabbar [data-screen="analysis"]'), 40); await sleep(600);
  const scr = await evalP(`return __t.app.activeScreen;`);
  b = await badge();
  check('midnight, then a screen change (menu and tab really tapped): grey with 5', scr === 'analysis' && isGrey(b) && b.n === '5', { scr, ...b });
  await openProfile();
  await evalP(`__addDays(-1); document.dispatchEvent(new Event('visibilitychange'));`); await sleep(500);
  const before = await profileFlame();
  await evalP(`__addDays(1); document.dispatchEvent(new Event('visibilitychange'));`); await sleep(500);
  const after = await profileFlame();
  await shot('midnight-2-profile-open');
  check('midnight with Profile open: its flame goes grey without leaving the screen', !/pending/.test(before.cls) && /pending/.test(after.cls) && !after.haze, { before: before.cls, after: after.cls });
  await evalP(`__addDays(1); document.dispatchEvent(new Event('visibilitychange'));`);
  await sleep(600);
  b = await badge();
  const pz = await profileFlame();
  await shotBar('midnight-3-two-days-bar');
  check('two midnights with the app open: the streak is broken — 0, faded as before, saved as 0', b.cls === 'zero' && b.n === '0' && b.opacity === '0.5' && b.filter === 'none' && b.kvCount === 0, b);
  check('two midnights, Profile open: the no-streak state', /locked/.test(pz.cls) && !/pending/.test(pz.cls) && pz.opacity === '0.4', pz);

  // 4 ── a missed day on load, and no streak at all: as before
  await load('en', 'dark', { streakLastDate: day(3) });
  b = await badge();
  await shotBar('missed-day-bar');
  check('missed day on load: 0, faded, not grey — unchanged', b.cls === 'zero' && b.n === '0' && b.opacity === '0.5' && b.filter === 'none' && b.kvCount === 0, b);
  await load('en', 'light', { streakCount: 0, streakLastDate: null, bestStreak: 0 });
  b = await badge();
  await shotBar('no-streak-bar');
  check('no streak: 0, faded, not grey — unchanged', b.cls === 'zero' && b.n === '0' && b.opacity === '0.5' && b.filter === 'none', b);
  const s0 = await solvePuzzle(); await sleep(120);
  b = await badge();
  check('no streak, first solve: 1 with the tier-up look, as before (not the small pop)', s0 && b.n === '1' && b.cls === 'tier-up', b);

  // 5 ── grey -> colour on the very day a tier is crossed: tier-up wins
  await load('es', 'dark', { streakCount: 6, bestStreak: 6 });
  const g6 = await badge();
  const s6 = await solvePuzzle(); await sleep(120);
  b = await badge();
  await shotBar('tier-up-from-grey-bar');
  check('grey 6 -> 7 crosses a tier: tier-up look, new art, not the small pop', isGrey(g6) && g6.n === '6' && s6 && b.n === '7' && b.cls === 'tier-up' && /flame2/.test(b.icon), b);

  // 6 ── reduce motion
  await load('es', 'light', {}, { reduced: true });
  await solvePuzzle(); await sleep(120);
  b = await badge();
  check('reduce motion: colour and 6, no pop', b.n === '6' && b.cls === 'lit' && b.anim === 'none' && b.filter === 'none', b);
}

let fatal = null;
try { await run(); } catch (e) { fatal = e; console.error('FATAL', e); }

fs.writeFileSync(path.join(OUT, 'errors.json'), JSON.stringify(errors, null, 1));
const bad = checks.filter(c => !c.ok);
console.error(`\n${checks.length - bad.length}/${checks.length} checks pass; console errors: ${errors.length}`);
for (const e of [...new Set(errors)]) console.error('  ' + e.slice(0, 200));
chrome.kill(); server.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(fatal || bad.length ? 1 : 0);
