// Puzzles: Next on a puzzle not solved yet asks first (Puzzles.askSkip, v228).
// Dev tool, not shipped. Headless Chrome over CDP, signed out, no service worker.
//
//   node tools/cdp-verify-skip-confirm.mjs <outDir>
//
// At 375 x 667, ES and EN, light and dark: an untouched puzzle asks, Keep
// trying and a tap beside the box keep it, Skip loads one new puzzle; after a
// wrong move it still asks; solved / solution shown / auto-advance / a theme
// change never ask; the daily puzzle and homework ask; the tick turns it off
// and the Settings switch turns it back on (and off). Setup copied from
// tools/cdp-verify-puzzle-next.mjs.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/cdp-verify-skip-confirm.mjs <outDir>'); process.exit(1); }
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9100 + Math.floor(Math.random() * 90);
const WEB = 8700 + Math.floor(Math.random() * 90);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-skip-'));
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 360000).unref();

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
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
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });

let ws, msgId = 0;
const pending = new Map(), errors = [];
const send = (method, params = {}) => { const id = ++msgId; ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => pending.set(id, { res, rej })); };
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: `(async()=>{ ${expr} })()`, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
  return r.result.value;
};
for (let i = 0; i < 40; i++) {
  try { const page = (await getJSON(`http://127.0.0.1:${PORT}/json`)).find(t => t.type === 'page'); if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; } } catch {}
  await sleep(250);
}
await new Promise(r => ws.on('open', r));
ws.on('message', m => {
  const msg = JSON.parse(m);
  if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result); }
  else if (msg.method === 'Runtime.exceptionThrown') errors.push('EXC ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push('CON ' + msg.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') errors.push('LOG ' + (msg.params.entry.text + ' ' + (msg.params.entry.url || '')).slice(0, 300));
});
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok }); console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); };
const shot = async name => fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
const until = async (expr, ms = 8000) => { for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (await ev(`return !!(${expr});`)) return true; await sleep(60); } return false; };
// A real touch at a point of an element: fx is how far across it (0 to 1).
const tap = async (sel, fx = 0.5) => {
  const pt = await ev(`const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + r.width * ${fx}, y: r.top + r.height / 2 };`);
  const touch = (type, p) => send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }] : [] });
  await touch('touchStart', pt); await sleep(40); await touch('touchEnd'); await sleep(200);
};
const P = '__app.Puzzles';
const ready = () => until(`${P}.current && ${P}.moveIdx === 1 && !document.getElementById('puzzle-status').classList.contains('done')`, 12000);
const solve = async () => {
  await ev(`const P = ${P}; for (let i = 0; i < 40 && P.moveIdx < P.current.moves.length; i++) { const u = P.current.moves[P.moveIdx]; await P.userMove({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); }`);
  return until(`document.getElementById('puzzle-status').classList.contains('done')`, 6000);
};
const asking = () => ev(`return !!document.getElementById('skip-keep');`);
const curId = () => ev(`return ${P}.current && ${P}.current.id;`);
const setting = () => ev(`return (await import('/js/db.js')).kvGet('puzzleSkipConfirm', true);`);
// What the open question looks like: on screen, nothing cut, and its words.
const dialog = () => ev(`
  const box = document.querySelector('.modal-box');
  const r = box.getBoundingClientRect(), img = box.querySelector('img');
  const k = document.getElementById('skip-keep').getBoundingClientRect(), g = document.getElementById('skip-go').getBoundingClientRect();
  return { q: box.querySelector('h3').textContent, line: box.querySelector('p').textContent,
    keep: document.getElementById('skip-keep').textContent, skip: document.getElementById('skip-go').textContent,
    tick: box.querySelector('label span').textContent, img: img.getAttribute('src'), imgOk: img.complete && img.naturalWidth > 0,
    onScreen: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
    btnH: Math.min(k.height, g.height), keepFocused: document.activeElement && document.activeElement.id === 'skip-keep',
    noSideScroll: document.documentElement.scrollWidth <= innerWidth };`);
const WORDS = {
  es: { q: '¿Seguro que quieres saltar este puzzle?', keep: 'Seguir intentando', skip: 'Saltar', tick: 'No volver a mostrar' },
  en: { q: 'Are you sure you want to skip this puzzle?', keep: 'Keep trying', skip: 'Skip', tick: "Don't show this again" },
};

let failed = false;
try {
  for (const [lang, scheme] of [['es', 'light'], ['es', 'dark'], ['en', 'light'], ['en', 'dark']]) {
    const tag = `${lang}-${scheme}`;
    console.log(`\n── ${tag} ──`);
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await send('Page.navigate', { url: `http://localhost:${WEB}/` });
    await sleep(1200);
    await ev(`localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1'); localStorage.setItem('calcIntroDone', '1');`);
    await send('Page.reload', {});
    await sleep(2500);
    await ev(`document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove()); window.__app = await import('/js/app.js'); __app.showScreen('puzzles');`);
    await until(`__app.activeScreen === 'puzzles'`);
    await ready();
    await ev(`await (await import('/js/db.js')).kvSet('puzzleSkipConfirm', true);`);
    await ev(`const P = ${P}, real = P.loadPuzzle; window.__loads = 0; P.loadPuzzle = function (p) { window.__loads++; return real.call(this, p); };`);
    const W = WORDS[lang];

    // 1. Next on an untouched puzzle asks.
    let id0 = await curId();
    await tap('#puzzle-next');
    await until(`document.getElementById('skip-keep')`, 3000);
    let d = await dialog();
    check(`[${tag}] untouched: Next asks "${d.q}" with Kael encouraging and "${d.line}"`,
      d.q === W.q && d.keep === W.keep && d.skip === W.skip && d.tick === W.tick && d.img.endsWith('kael-encouraging.png') && d.imgOk && d.line.length > 10, d);
    check(`[${tag}] the question fits 375 x 667, buttons ${d.btnH} px tall, Keep trying has the focus`, d.onScreen && d.btnH >= 40 && d.keepFocused && d.noSideScroll, d);
    await shot(`${tag}-1-ask`);
    // Keep trying: same puzzle, nothing loaded.
    await tap('#skip-keep');
    await sleep(300);
    check(`[${tag}] Keep trying closes it and keeps the same puzzle`, !(await asking()) && (await curId()) === id0 && (await ev(`return __loads;`)) === 0);
    // A tap outside the box is Keep trying too.
    await tap('#puzzle-next');
    await until(`document.getElementById('skip-keep')`, 3000);
    await ev(`document.querySelector('.modal-back').dispatchEvent(new MouseEvent('click', { bubbles: true }));`);
    await sleep(300);
    check(`[${tag}] a tap beside the box also keeps the puzzle`, !(await asking()) && (await curId()) === id0 && (await ev(`return __loads;`)) === 0);
    // Skip: loads exactly one new puzzle.
    await tap('#puzzle-next');
    await until(`document.getElementById('skip-go')`, 3000);
    await tap('#skip-go');
    await ready();
    let id1 = await curId();
    check(`[${tag}] Skip loads another puzzle, exactly once`, id1 !== id0 && (await ev(`return __loads;`)) === 1);

    // 2. After a wrong move, still unsolved: it asks.
    await ev(`const P = ${P}; const u = P.current.moves[P.moveIdx]; const bad = P.chess.moves({ verbose: true }).find(m => m.from + m.to !== u.slice(0, 4) && !m.san.includes('#')); await P.userMove({ from: bad.from, to: bad.to, promotion: bad.promotion });`);
    await sleep(200);
    await tap('#puzzle-next');
    check(`[${tag}] after a wrong move, still unsolved: it asks`, await until(`document.getElementById('skip-keep')`, 3000));
    await tap('#skip-go');
    await ready();

    // 3. Solved: Next and the gold bar go straight on.
    await solve();
    let before = await ev(`return __loads;`);
    await tap('#puzzle-next');
    await sleep(250);
    check(`[${tag}] solved: Next does not ask`, !(await asking()));
    await ready();
    check(`[${tag}] solved: Next loads the next puzzle once`, (await ev(`return __loads;`)) === before + 1);
    await solve();
    await tap('#puzzle-status', 0.15);
    await sleep(250);
    check(`[${tag}] solved: the gold bar does not ask`, !(await asking()));
    await ready();

    // 4. Solution shown: does not ask.
    await tap('#puzzle-solution');
    await until(`document.getElementById('puzzle-status').classList.contains('done')`, 15000);
    await tap('#puzzle-next');
    await sleep(250);
    check(`[${tag}] solution shown: Next does not ask`, !(await asking()));
    await ready();

    if (scheme === 'dark') continue;   // the flows below do not depend on the colours

    // 5. Auto-advance never asks.
    await ev(`${P}.autoNext = true;`);
    const solvedId = await curId();
    await solve();
    const moved = await until(`${P}.current.id !== ${JSON.stringify(solvedId)}`, 4000);
    check(`[${tag}] auto-advance moves on by itself and never asks`, moved && !(await asking()));
    await ev(`${P}.autoNext = false;`);
    await ready();

    // 6. A theme change (nextPuzzle from the picker) never asks.
    let t0 = await curId();
    await ev(`const P = ${P}; P.themeFilter = new Set(['fork']); await P.nextPuzzle();`);
    await ready();
    check(`[${tag}] a theme change loads a puzzle without asking`, (await curId()) !== t0 && !(await asking()));
    await ev(`${P}.themeFilter = 'random';`);

    // 7. The daily puzzle asks.
    await ev(`await __app.DailyMissions.goPuzzle();`);
    await ready();
    check(`[${tag}] daily puzzle loaded`, await ev(`return ${P}.isDailyPuzzle;`));
    await tap('#puzzle-next');
    check(`[${tag}] daily puzzle: Next asks`, await until(`document.getElementById('skip-keep')`, 3000));
    await tap('#skip-keep');
    await sleep(200);

    // 8. Homework asks.
    await ev(`const P = ${P}; const list = P.pool().slice(0, 3).map(p => ({ ...p })); await P.startHomework({ id: 'verify-skip', title: 'Verify skip', list, doneIds: [], count: 3, done: 0 });`);
    await ready();
    await tap('#puzzle-next');
    check(`[${tag}] homework: Next asks`, await until(`document.getElementById('skip-keep')`, 3000));
    await tap('#skip-go');
    await ready();
    await ev(`const P = ${P}; P.homework = null; P.paintHomework();`);

    // 9. "Don't show this again" + Skip: it stops asking.
    let h0 = await curId();
    await tap('#puzzle-next');
    await until(`document.getElementById('skip-dont-show')`, 3000);
    await tap('#skip-dont-show');
    await tap('#skip-go');
    await ready();
    check(`[${tag}] the tick + Skip: skipped, and the setting is now off`, (await curId()) !== h0 && (await setting()) === false);
    let h1 = await curId();
    await tap('#puzzle-next');
    await sleep(300);
    check(`[${tag}] with it off, Next on an untouched puzzle skips without asking`, !(await asking()));
    await ready();
    check(`[${tag}] ...and loads another puzzle`, (await curId()) !== h1);

    // 10. Settings: the switch shows Off; tapping On brings the question back.
    await ev(`document.getElementById('menu-settings').click();`);
    await until(`document.getElementById('set-skip-confirm')`, 3000);
    const seg = await ev(`const s = document.getElementById('set-skip-confirm'); return { label: s.previousElementSibling.textContent, on: s.querySelector('.on').dataset.v, words: [...s.children].map(b => b.textContent) };`);
    check(`[${tag}] Settings shows "${seg.label}" set to Off`, seg.on === 'off' && seg.label === (lang === 'es' ? 'Preguntar antes de saltar un puzzle' : 'Ask before skipping a puzzle'), seg);
    await ev(`document.getElementById('set-skip-confirm').scrollIntoView({ block: 'center' });`);
    await sleep(200);
    await tap('#set-skip-confirm button[data-v="on"]');
    await sleep(300);
    await shot(`${tag}-2-settings`);
    check(`[${tag}] Settings switch On: the setting is back on`, (await setting()) === true);
    await ev(`document.querySelectorAll('.modal-back').forEach(e => e.remove());`);
    await tap('#puzzle-next');
    check(`[${tag}] with it back on, Next asks again`, await until(`document.getElementById('skip-keep')`, 3000));
    await tap('#skip-keep');
    // And Off from Settings stops it.
    await ev(`document.getElementById('menu-settings').click();`);
    await until(`document.getElementById('set-skip-confirm')`, 3000);
    await ev(`document.getElementById('set-skip-confirm').scrollIntoView({ block: 'center' });`);
    await sleep(200);
    await tap('#set-skip-confirm button[data-v="off"]');
    await sleep(300);
    check(`[${tag}] Settings switch Off: the setting is off`, (await setting()) === false);
    await ev(`document.querySelectorAll('.modal-back').forEach(e => e.remove());`);
    await tap('#puzzle-next');
    await sleep(300);
    check(`[${tag}] with it off from Settings, Next does not ask`, !(await asking()));
    await ready();
  }
} catch (e) { failed = true; console.error('\nSTOPPED: ' + e.message); }

const bad = checks.filter(c => !c.ok);
console.log(`\n${checks.length - bad.length} of ${checks.length} checks passed${bad.length ? ' — FAILED: ' + bad.map(c => c.name).join(' | ') : ''}`);
const other = errors.filter(e => !/firebaseappcheck|AppCheck|app-check|bad HTTP response code \(404\) was received when fetching the script|status of 403/i.test(e));
console.log(other.length ? `Console errors (${other.length}):\n  ` + [...new Set(other)].join('\n  ') : 'No console errors (other than App Check and the refused service worker).');
chrome.kill();
server.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(failed || bad.length ? 1 : 0);
