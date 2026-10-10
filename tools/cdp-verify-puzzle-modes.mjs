// The five puzzle-mode chips (Puzzles, Blindfold, Puzzle Rush, Pulso, Sealed
// Moves) as two rows, three over two, on every one of the five screens that
// carry them. Dev tool, not
// shipped. Headless Chrome over CDP, signed out, no service worker.
//
//   node tools/cdp-verify-puzzle-modes.mjs <outDir>     about half a minute
//
// Checked at 375 x 667 in ES and EN, light and dark, at 360 wide (the commonest
// Android width) in both languages, and at 320 wide in ES light: five chips in two rows, three over two, each row its own size, wholly on screen, no label cut
// short, the page not wider than the phone, the right one lit; and each chip,
// really tapped, opens its screen.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/cdp-verify-puzzle-modes.mjs <outDir>'); process.exit(1); }
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const WEB = 9900 + Math.floor(Math.random() * 90);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-modes-'));
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 240000).unref();

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
const tap = async sel => {
  const pt = await ev(`const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
  const touch = (type, p) => send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }] : [] });
  await touch('touchStart', pt); await sleep(40); await touch('touchEnd'); await sleep(200);
};
// The strip on the screen that is showing.
const strip = screen => ev(`
  const seg = document.querySelector('#screen-${screen} .puzzle-modes'), bs = [...seg.querySelectorAll('button')];
  const box = bs.map(b => b.getBoundingClientRect());
  return { screen: __app.activeScreen, n: bs.length, order: bs.map(b => b.dataset.v).join(' '),
    rows: [...new Set(box.map(r => Math.round(r.top)))].length, perRow: [box.filter(r => Math.round(r.top) === Math.round(box[0].top)).length, box.filter(r => Math.round(r.top) !== Math.round(box[0].top)).length].join(),
    sameSize: [box.slice(0, 3), box.slice(3)].every(row => row.every(r => Math.abs(r.width - row[0].width) < 1 && Math.abs(r.height - box[0].height) < 1)), w: Math.round(box[0].width), w2: Math.round(box[3].width), h: Math.round(box[0].height),
    inside: box.every(r => r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight),
    whole: bs.every(b => b.scrollWidth <= b.clientWidth), lit: bs.filter(b => b.classList.contains('on')).map(b => b.dataset.v).join(' '),
    labels: bs.map(b => b.textContent),
    room: bs.map(b => { const rg = document.createRange(); rg.selectNodeContents(b); const cs = getComputedStyle(b); return Math.round((b.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - rg.getBoundingClientRect().width) * 10) / 10; }), noSideScroll: document.documentElement.scrollWidth <= innerWidth && seg.scrollWidth <= seg.clientWidth,
    height: Math.round(seg.getBoundingClientRect().height) };`);

let failed = false;
try {
  for (const [lang, scheme, width] of [['es', 'light', 375], ['es', 'dark', 375], ['en', 'light', 375], ['en', 'dark', 375], ['es', 'light', 360], ['en', 'light', 360], ['es', 'light', 320]]) {
    const tag = `${lang}-${scheme}-${width}`;
    console.log(`\n── ${tag} ──`);
    await send('Emulation.setDeviceMetricsOverride', { width, height: 667, deviceScaleFactor: 2, mobile: true });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await send('Page.navigate', { url: `http://localhost:${WEB}/` });
    await sleep(1200);
    await ev(`localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1'); localStorage.setItem('calcIntroDone', '1');`);
    await send('Page.reload', {});
    await sleep(2500);
    await ev(`document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove()); window.__app = await import('/js/app.js'); __app.showScreen('puzzles');`);
    await until(`__app.activeScreen === 'puzzles'`);
    let from = 'puzzles';
    for (const to of ['blind', 'rush', 'pulso', 'calc', 'puzzles']) {
      const s = await strip(from);
      check(`[${tag}] ${from}: five chips, three over two (${s.w} and ${s.w2} wide, ${s.h} tall), each row the same size, wholly on screen, no label cut short, nothing scrolls sideways, "${from}" lit`,
        s.screen === from && s.n === 5 && s.rows === 2 && s.perRow === '3,2' && s.sameSize && s.inside && s.whole && s.noSideScroll && s.lit === from && s.order === 'puzzles blind rush pulso calc' && s.h >= 40, s);
      await shot(`${tag}-${from}`);
      await tap(`#screen-${from} .puzzle-modes [data-v="${to}"]`);
      check(`[${tag}] the "${to}" chip on the ${from} screen, really tapped, opens ${to}`, await until(`__app.activeScreen === '${to}'`, 6000), await ev(`return __app.activeScreen`));
      await sleep(300);
      from = to;
    }
  }
} catch (e) { failed = true; console.error('\nSTOPPED: ' + e.message); }

const bad = checks.filter(c => !c.ok);
console.log(`\n${checks.length - bad.length} of ${checks.length} checks passed${bad.length ? ' — FAILED: ' + bad.map(c => c.name).join(' | ') : ''}`);
// App Check cannot answer on localhost (403) and sw.js is refused on purpose (404).
const other = errors.filter(e => !/firebaseappcheck|AppCheck|app-check|bad HTTP response code \(404\) was received when fetching the script|status of 403/i.test(e));
console.log(other.length ? `Console errors (${other.length}):\n  ` + [...new Set(other)].join('\n  ') : 'No console errors (other than App Check and the refused service worker).');
chrome.kill();
server.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(failed || bad.length ? 1 : 0);
