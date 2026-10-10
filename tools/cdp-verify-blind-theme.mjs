// Headless-Chrome verification for Blindfold's theme and settings buttons
// (v180): the row on the start panel, Blindfold's OWN theme, difficulty and
// auto-next, and that the Puzzles screen is left alone. Dev tool, not shipped.
//
//   node tools/cdp-verify-blind-theme.mjs <outDir>
//
// REALLY TAPPED (a finger down and up): the Blindfold mode button, the theme
// button, a theme's row, Apply, the gear, a difficulty level, the auto-next
// row, Close, the See position / List switch, Go, Next, and on the Puzzles
// screen its own theme button, a theme row, Apply and its gear.
// CLICKED WITH element.click(): the Puzzles tab.
// CALLED, not tapped: Blind.showStart() to get back to the start panel between
// pictures, and Blind.nextPuzzle() for the 3000-rating case.
// SEEDED: Blind.elo = 3000 for the "no puzzles of this theme" case (put back
// after); the long-name, three-theme and Fork choices used for the pictures
// are set in memory, not through the picker.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/cdp-verify-blind-theme.mjs <outDir>'); process.exit(1); }
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const WEB = 9900 + Math.floor(Math.random() * 90);
const APP_URL = `http://localhost:${WEB}`;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-blindtheme-'));
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 900000).unref();

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
async function load(lang, scheme) {
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
  await send('Page.navigate', { url: APP_URL });
  await sleep(2500);
  await evalP(`localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1');`);
  await send('Page.reload', {});
  await sleep(3500);
  await killModals();
}

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
const close = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// ── fingers ─────────────────────────────────────────────────────────────────
async function tap(x, y) {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(x), y: Math.round(y), id: 1 }] });
  await sleep(40);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
// Scrolls the element into view, then puts a finger on its centre. Fails loudly
// if something else is on top of it — a tap that lands on an overlay proves nothing.
async function tapEl(sel) {
  const pt = await evalP(`
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    await new Promise(r => setTimeout(r, 60));
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return { x, y, top: top && (top.id + "|" + top.className + "|" + top.textContent.slice(0, 60)), hit: !!top && (top === el || el.contains(top)) };`);
  if (!pt) throw new Error('no element ' + sel);
  if (!pt.hit) throw new Error('covered: ' + sel + ' by ' + pt.top);
  await tap(pt.x, pt.y);
  await sleep(120);
}

const B = `const { Blind, Puzzles } = await import('${APP_URL}/js/app.js'); const db = await import('${APP_URL}/js/db.js');`;
async function openBlind() {
  await evalP(`document.querySelector('[data-screen="puzzles"]').click();`);
  await sleep(900);
  await killModals();
  await tapEl('#screen-puzzles .puzzle-modes [data-v="blind"]');
  await sleep(1500);
  await killModals();
}
const layout = () => evalP(`
  const r = id => document.getElementById(id).getBoundingClientRect();
  const row = r('blind-setup-row'), seg = r('blind-mode-seg'), th = r('blind-theme-btn'), op = r('blind-options'), card = document.querySelector('#blind-start .elo-card').getBoundingClientRect();
  return { rowUnderElo: row.top >= card.bottom, rowAboveSeg: row.bottom <= seg.top, themeLeft: th.left, optRight: op.right, optW: op.width, optH: op.height, thH: th.height,
    pageW: document.documentElement.scrollWidth, text: document.getElementById('blind-theme-btn').textContent,
    startShown: !document.getElementById('blind-start').classList.contains('hidden') };`);
const tapLast = async sel => {
  await evalP(`[...document.querySelectorAll(${JSON.stringify(sel)})].pop().scrollIntoView({ block: 'center' });`);
  await tapEl(sel);
};

let deep = true;
for (const [lang, scheme] of [['es', 'light'], ['es', 'dark'], ['en', 'light'], ['en', 'dark']]) {
  const tag = `${lang}-${scheme}`;
  console.error(`\n== ${tag} ==`);
  await load(lang, scheme);
  await openBlind();
  let L = await layout();
  check(`${tag}: row sits under the rating and above See position | List`, L.rowUnderElo && L.rowAboveSeg, L);
  check(`${tag}: nothing wider than 375`, L.pageW <= 375 && L.optRight <= 375 && L.themeLeft >= 0, L);
  check(`${tag}: both buttons at least 44 tall`, L.thH >= 44 && L.optH >= 44 && L.optW >= 44, L);
  check(`${tag}: theme button says Random`, L.text === (lang === 'es' ? '🎯 Tema: Aleatorio' : '🎯 Theme: Random'), L.text);
  await shot(`start-look-${tag}`);

  if (deep) {
    // ── the gear: Blindfold's own difficulty and auto-next ──
    await tapEl('#blind-options');
    await sleep(300);
    let o = await evalP(`${B} return { target: [...document.querySelectorAll('.modal-box .hint')].map(e => e.textContent), on: document.querySelector('.modal-box .seg button.on')?.dataset.v, elo: Blind.elo };`);
    check('gear opens the sheet with Normal selected', o.on === '0', o);
    check('the "aiming near" line shows the blindfold rating', o.target.some(x => x.includes(String(Math.round(o.elo)))), o);
    await shot(`options-${tag}`);
    await tapEl('.modal-box .seg button[data-v="250"]');
    await tapEl('.modal-box .theme-pick-row input');
    await sleep(200);
    o = await evalP(`${B} return { bd: Blind.difficulty, pd: Puzzles.difficulty, ba: Blind.autoNext, pa: Puzzles.autoNext,
      kbd: await db.kvGet('blindfoldDifficulty', null), kpd: await db.kvGet('puzzleDifficulty', null), kba: await db.kvGet('blindfoldAutoNext', null), kpa: await db.kvGet('puzzleAutoNext', null),
      target: [...document.querySelectorAll('.modal-box .hint')].map(e => e.textContent).join(' | '), want: Math.round(Blind.targetRating()), elo: Blind.elo };`);
    check('Harder: Blindfold difficulty 250, stored as blindfoldDifficulty', o.bd === 250 && o.kbd === 250, o);
    check('Puzzles difficulty untouched (memory and storage)', o.pd === 0 && (o.kpd === null || o.kpd === 0), o);
    check('auto-next: on for Blindfold only', o.ba === true && o.kba === true && o.pa === false && !o.kpa, o);
    check('target line moved to rating + 250', o.want === Math.round(o.elo) + 250 && o.target.includes(String(o.want)), o);
    await tapLast('.modal-box .btn.primary.big');
    await sleep(200);

    // ── the theme button ──
    await tapEl('#blind-theme-btn');
    await sleep(300);
    o = await evalP(`return { random: document.getElementById('tp-random').checked, rows: document.querySelectorAll('.modal-box .theme-pick-row').length };`);
    check('theme picker opens on Random with every theme listed', o.random && o.rows === 46, o);
    await shot(`theme-picker-${tag}`);
    await tapEl('.modal-box input[data-th="mateIn1"]');
    await tapLast('.modal-box .btn.primary.big');
    await sleep(300);
    o = await evalP(`${B} return { bt: Blind.themeFilter === 'random' ? 'random' : [...Blind.themeFilter], pt: Puzzles.themeFilter === 'random' ? 'random' : [...Puzzles.themeFilter],
      text: document.getElementById('blind-theme-btn').textContent, startShown: !document.getElementById('blind-start').classList.contains('hidden'), cur: !!Blind.current };`);
    check('Apply: Blindfold theme is Mate in 1, Puzzles theme still Random', o.bt[0] === 'mateIn1' && o.bt.length === 1 && o.pt === 'random', o);
    check('button names the theme, start panel stays, no puzzle started', o.text === '🎯 Tema: Mate en 1' && o.startShown && !o.cur, o);
    await shot(`start-themed-${tag}`);

    await tapEl('#blind-go');
    const seen = [];
    for (let i = 0; i < 12; i++) {
      await sleep(700);
      seen.push(await evalP(`${B} return { id: Blind.current?.id, ok: !!Blind.current?.themes.includes('mateIn1'), r: Blind.current?.rating, t: Math.round(Blind.targetRating()) };`));
      await tapEl('#blind-next');
    }
    check('12 puzzles in a row are all Mate in 1', seen.every(s => s.ok), seen.map(s => s.r).join(','));
    check('more than one different puzzle came up', new Set(seen.map(s => s.id)).size > 3, new Set(seen.map(s => s.id)).size);
    check('all inside the 600-point limit of the target', seen.every(s => Math.abs(s.r - s.t) <= 600), seen[0]);

    // ── a theme with nothing at the level: 3000 has no Mate in 1 ──
    o = await evalP(`${B} const keep = Blind.elo; Blind.elo = 3000; await Blind.nextPuzzle();
      return { keep, themed: Blind.current.themes.includes('mateIn1'), r: Blind.current.rating, toastShown: !document.getElementById('toast').classList.contains('hidden') };`);
    check('3000 + Mate in 1 (none within 300): widens, still a Mate in 1 within 600, no message', o.themed && o.r >= 2400 && !o.toastShown, o);
    const keepElo = o.keep;
    // No real theme is empty within 600 points, so the message is reached with a made-up one.
    o = await evalP(`${B} Blind.themeFilter = new Set(['noSuchTheme']); Blind.themeMissSaid = false; await Blind.nextPuzzle();
      const toast = document.getElementById('toast'), first = toast.textContent, shown = !toast.classList.contains('hidden');
      toast.textContent = ''; await Blind.nextPuzzle();
      const out = { r: Blind.current.rating, first, shown, second: toast.textContent, still: [...Blind.themeFilter] };
      toast.textContent = first; return out;`);
    check('a theme with nothing: a puzzle at the level, the message once, not on every puzzle', o.r >= 2700 && o.shown && o.first.startsWith('No hay puzzles de este tema') && o.second === '', o);
    check('the theme stays chosen', o.still[0] === 'noSuchTheme', o);
    await shot(`no-theme-toast-${tag}`);
    await evalP(`${B} Blind.elo = ${keepElo}; Blind.themeFilter = 'random'; Blind.difficulty = 0; Blind.autoNext = false; await db.kvSet('blindfoldDifficulty', 0); await db.kvSet('blindfoldAutoNext', false); Blind.showStart();`);

    // ── the Puzzles screen is as before ──
    await tapEl('#screen-blind .puzzle-modes [data-v="puzzles"]');
    await sleep(1500);
    await killModals();
    await tapEl('#puzzle-options');
    await sleep(300);
    o = await evalP(`${B} return { on: document.querySelector('.modal-box .seg button.on')?.dataset.v, hint: [...document.querySelectorAll('.modal-box .hint')].map(e => e.textContent).join(' | '), want: Math.round(Puzzles.targetRating()), auto: document.querySelector('.modal-box .theme-pick-row input').checked };`);
    check('Puzzles gear: still Normal, auto-next off, its own target', o.on === '0' && !o.auto && o.hint.includes(String(o.want)), o);
    await tapEl('.modal-box .seg button[data-v="-250"]');
    o = await evalP(`${B} return { pd: Puzzles.difficulty, bd: Blind.difficulty, kpd: await db.kvGet('puzzleDifficulty', null), kbd: await db.kvGet('blindfoldDifficulty', null) };`);
    check('Puzzles difficulty changes Puzzles only', o.pd === -250 && o.kpd === -250 && o.bd === 0 && o.kbd === 0, o);
    await tapEl('.modal-box .seg button[data-v="0"]');
    await tapLast('.modal-box .btn.primary.big');
    await sleep(200);
    await tapEl('#puzzle-theme-btn');
    await sleep(300);
    await tapEl('.modal-box input[data-th="fork"]');
    await tapLast('.modal-box .btn.primary.big');
    await sleep(800);
    o = await evalP(`${B} return { pt: [...Puzzles.themeFilter], fork: Puzzles.current.themes.includes('fork'), bt: Blind.themeFilter };`);
    check('Puzzles theme picker: Fork applied, a fork puzzle loaded, Blindfold still Random', o.pt[0] === 'fork' && o.fork && o.bt === 'random', o);
    await shot(`puzzles-after-${tag}`);
    await evalP(`${B} Puzzles.themeFilter = 'random';`);
    await tapEl('#screen-puzzles .puzzle-modes [data-v="blind"]');
    await sleep(1200);
    await killModals();
    deep = false;
  }

  // long theme name: must ellipsise, not push the gear off
  await evalP(`${B} Blind.themeFilter = new Set(['capturingDefender']); Blind.updateTimeControl();`);
  L = await layout();
  check(`${tag}: a long theme name keeps the gear on screen`, L.optRight <= 375 && L.pageW <= 375, L);
  await shot(`start-long-${tag}`);
  await evalP(`${B} Blind.themeFilter = new Set(['fork', 'pin', 'skewer']); Blind.updateTimeControl();`);
  L = await layout();
  check(`${tag}: three themes are counted`, L.text === (lang === 'es' ? '🎯 Temas: 3 elegidos' : '🎯 Themes: 3 chosen'), L.text);
  await evalP(`${B} Blind.themeFilter = new Set(['fork']); Blind.updateTimeControl();`);

  // the game, See position
  await tapEl('#blind-go');
  await sleep(1300);
  await shot(`game-look-${tag}`);
  let g = await evalP(`${B} return { fork: Blind.current.themes.includes('fork'), change: document.getElementById('blind-change-time').textContent, changeShown: !!document.getElementById('blind-change-time').offsetParent, pageW: document.documentElement.scrollWidth, rowInGame: !!document.getElementById('blind-setup-row').offsetParent };`);
  check(`${tag}: look game - fork puzzle, "change settings" button, no theme row in the game`, g.fork && g.changeShown && g.change === (lang === 'es' ? '⚙ Cambiar ajustes' : '⚙ Change settings') && !g.rowInGame && g.pageW <= 375, g);
  await evalP(`document.getElementById('blind-change-time').scrollIntoView({ block: 'center' });`);
  await sleep(150);
  await shot(`game-look-lower-${tag}`);

  // List mode
  await evalP(`${B} Blind.showStart(); window.scrollTo(0, 0);`);
  await tapEl('#blind-mode-seg [data-v="list"]');
  await sleep(200);
  L = await layout();
  check(`${tag}: list start - row still in place, nothing wider than 375`, L.rowUnderElo && L.rowAboveSeg && L.pageW <= 375 && L.startShown, L);
  await evalP(`window.scrollTo(0, 0);`);
  await shot(`start-list-${tag}`);
  await tapEl('#blind-go');
  await sleep(1300);
  await shot(`game-list-${tag}`);
  g = await evalP(`${B} return { fork: Blind.current.themes.includes('fork'), listShown: !document.getElementById('blind-list').classList.contains('hidden'), pageW: document.documentElement.scrollWidth, changeShown: !!document.getElementById('blind-change-time').offsetParent };`);
  check(`${tag}: list game - fork puzzle, list on screen, change button there`, g.fork && g.listShown && g.changeShown && g.pageW <= 375, g);
  await evalP(`${B} Blind.showStart();`);
  await tapEl('#blind-mode-seg [data-v="look"]');
  await evalP(`${B} Blind.themeFilter = 'random';`);
}

const failed = checks.filter(c => !c.ok);
console.error(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (errors.length) console.error('PAGE ERRORS:\n' + errors.join('\n'));
ws.close(); chrome.kill(); server.close();
process.exit(failed.length || errors.length ? 1 : 0);
