// Headless-Chrome verification that the diagram reader finds a board WHEREVER on
// it the finger is — written for Dvoretsky's hatched boards, where a long-press
// used to say "Couldn't find a board there" at some heights. Harness copied from
// cdp-verify-training.mjs (the in-app pane does not composite). Dev tool, not shipped.
//
//   node tools/cdp-verify-hatched.mjs <outDir> <hatched.pdf> <page> <wood.pdf> <page>
//   e.g. Dvoretsky's Endgame Manual 395, Hellsten 102
//
// It serves the repo itself (plus the two PDFs, which live outside it) on a
// throwaway port, so no preview server is needed.
//
// REALLY PRESSED (CDP Input.dispatchTouchEvent — a finger held down ~0.8 s on the
// page; the dialog is looked for while the finger is STILL down, because in
// headless Chrome the lift lands on the dialog's backdrop and dismisses it): the
// long-presses on the boards and on plain text, and the Training button.
// CLICKED WITH element.click(), not a finger: the Read tab, the shelf cards, Back.
// CALLED, not pressed: the press GRIDS — detectBoard() is called directly on the
// reader's own page canvas at 16x16 points inside each board and at 280 points
// over the whole page. Scrolling is done by setting stage.scrollTop.
// SEEDED: the two books are put on the shelf with db.addBook() and a starting
// page, not picked through the file chooser. Nothing else.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [OUT, HAT_PDF, HAT_PAGE, WOOD_PDF, WOOD_PAGE] = process.argv.slice(2);
if (!WOOD_PAGE) { console.error('usage: node tools/cdp-verify-hatched.mjs <outDir> <hatched.pdf> <page> <wood.pdf> <page>'); process.exit(1); }
const BOOKS = [
  { name: 'Hatched Book', file: HAT_PDF, page: +HAT_PAGE },
  { name: 'Wood Book', file: WOOD_PDF, page: +WOOD_PAGE },
];
// Where to press, as fractions of the page. Dvoretsky p395: the first board spans
// about 6–34% of the page height and the second 61–89%; 20%, 28% and 70% are the
// heights that were MISSED before the fix. Hellsten p102: two boards side by side
// at 7–29%; 0.278 is the bottom rank, which was missed too.
const HAT_PRESSES = [[0.5, 0.20], [0.5, 0.28], [0.5, 0.70]];
const HAT_TEXT = [0.5, 0.50];
const HAT_BOARDS = [[0.5, 0.20], [0.5, 0.70]];
const WOOD_PRESS = [0.27, 0.278];
const WOOD_BOARDS = [[0.27, 0.18], [0.72, 0.18]];

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const WEB = 9900 + Math.floor(Math.random() * 90);
const APP_URL = `http://localhost:${WEB}`;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-hat-'));
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 560000).unref();

// ── a static server for the repo + the books ────────────────────────────────
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  let file;
  const m = /^\/__book\/(\d)$/.exec(p);
  if (m) file = BOOKS[+m[1]].file;
  else {
    if (p.endsWith('/')) p += 'index.html';
    file = path.join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  }
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

// ── page-side helpers ───────────────────────────────────────────────────────
const click = (sel, ms = 450) => evalP(`const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); await new Promise(r => setTimeout(r, ${ms})); return true;`);
const tr = key => evalP(`return (await import('/js/i18n.js')).t('${key}');`);
const toastText = () => evalP(`const e = document.getElementById('toast'); return e.classList.contains('hidden') ? '' : e.textContent.trim();`);
async function openBook(name) {
  await click('#tabbar button[data-screen="read"]', 500);
  await evalP(`
    if (!document.getElementById('read-reader').classList.contains('hidden')) { document.getElementById('read-back').click(); await new Promise(r => setTimeout(r, 400)); }
    const card = [...document.querySelectorAll('#read-grid .read-card')].find(c => c.textContent.includes(${JSON.stringify(name)}));
    card.click();
    const ind = () => document.getElementById('read-page-ind').textContent;
    for (let i = 0; i < 300 && ind().indexOf('/') < 0; i++) await new Promise(r => setTimeout(r, 100));
    for (let i = 0; i < 300 && !document.getElementById('read-loading').classList.contains('hidden'); i++) await new Promise(r => setTimeout(r, 100));`);
  await sleep(1200);
  return evalP(`return document.getElementById('read-page-ind').textContent;`);
}
// The book reopens where it was last scrolled to (this script scrolls), so the
// test is that the page is there and drawn, not what the page counter says.
const drawn = n => evalP(`
  for (let i = 0; i < 60; i++) { const c = document.querySelector('.read-page[data-page="${n}"] canvas');
    if (c && c.width > 300 && document.querySelector('.read-page[data-page="${n}"] .read-blank').classList.contains('hidden')) return true;
    await new Promise(r => setTimeout(r, 150)); }
  return false;`);
// Screen position of a point given as fractions of page n, scrolled into the
// middle of the stage first so a finger can reach it.
const pointOn = (n, fx, fy) => evalP(`
  const stage = document.getElementById('read-stage');
  const pg = () => document.querySelector('.read-page[data-page="${n}"]').getBoundingClientRect();
  const s = stage.getBoundingClientRect();
  stage.scrollTop += (pg().top + pg().height * ${fy}) - (s.top + s.height / 2);
  await new Promise(r => setTimeout(r, 900));
  const r = pg(); return { x: r.left + r.width * ${fx}, y: r.top + r.height * ${fy} };`);
// A real long-press. Reports the dialog seen WHILE THE FINGER IS DOWN and the toast.
async function longPress(n, fx, fy, shotName) {
  await killModals();
  const pt = await pointOn(n, fx, fy);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(pt.x), y: Math.round(pt.y), id: 1 }] });
  await sleep(1100);
  const seen = await evalP(`const m = [...document.querySelectorAll('.modal-box')].pop();
    const e = document.getElementById('toast');
    return { dialog: m ? { img: !!m.querySelector('canvas, img'), buttons: m.querySelectorAll('button').length } : null,
             toast: e.classList.contains('hidden') ? '' : e.textContent.trim() };`);
  if (shotName) await shot(shotName);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(300);
  await killModals();
  return seen;
}
const tapTraining = async () => {
  const c = await evalP(`const r = document.getElementById('read-training').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(c.x), y: Math.round(c.y), id: 1 }] });
  await sleep(40);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(900);
  return evalP(`return document.getElementById('read-training').classList.contains('on');`);
};
// detectBoard() called on the reader's own canvas of page n: a 16x16 grid inside
// each board (found from one press at `seeds`), then 14x20 over the whole page.
const pressGrid = (n, seeds) => evalP(`
  const { detectBoard } = await import('/js/diagram.js');
  const cv = document.querySelector('.read-page[data-page="${n}"] canvas');
  const img = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height), W = cv.width, H = cv.height;
  const same = (a, b) => a && Math.abs(a.x0 - b.x0) <= 0.5 && Math.abs(a.y0 - b.y0) <= 0.5 && Math.abs(a.cw - b.cw) <= 0.13 && Math.abs(a.ch - b.ch) <= 0.13;
  const boards = [], out = { W, H, boards: [], offBoard: 0, falseBoards: [] };
  for (const [fx, fy] of ${JSON.stringify(seeds)}) {
    const b = detectBoard(img, W * fx, H * fy);
    if (!b) { out.boards.push({ seed: [fx, fy], found: false }); continue; }
    boards.push(b);
    let hit = 0, miss = 0, other = 0;
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      const r = detectBoard(img, b.x0 + (i + 0.5) / 16 * 8 * b.cw, b.y0 + (j + 0.5) / 16 * 8 * b.ch);
      if (!r) miss++; else if (same(r, b)) hit++; else other++;
    }
    out.boards.push({ seed: [fx, fy], found: true, x0: b.x0, y0: b.y0, cw: b.cw, ch: b.ch, hit, miss, other });
  }
  for (let j = 0; j < 20; j++) for (let i = 0; i < 14; i++) {
    const x = (i + 0.5) / 14 * W, y = (j + 0.5) / 20 * H;
    if (boards.some(b => x > b.x0 - b.cw && x < b.x0 + 9 * b.cw && y > b.y0 - b.ch && y < b.y0 + 9 * b.ch)) continue;
    out.offBoard++;
    const r = detectBoard(img, x, y);
    if (r && !boards.some(b => same(r, b))) out.falseBoards.push([Math.round(x), Math.round(y), Math.round(r.x0), Math.round(r.y0), +r.cw.toFixed(1)]);
  }
  return out;`);

// ── seed the shelf (once; IndexedDB survives the reloads below) ──────────────
await load('en', 'light');
await click('#tabbar button[data-screen="read"]', 500);
const seeded = await evalP(`
  const db = await import('/js/db.js');
  const lib = await import('/vendor/pdf.min.mjs');
  lib.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';
  for (const bk of await db.listBookSummaries()) await db.deleteBook(bk.id);
  const books = ${JSON.stringify(BOOKS.map((b, i) => ({ name: b.name, page: b.page, i })))};
  for (const b of books) {
    const blob = await (await fetch('/__book/' + b.i)).blob();
    const doc = await lib.getDocument({ data: await blob.arrayBuffer(), wasmUrl: '/vendor/' }).promise;
    await db.addBook({ name: b.name, blob, size: blob.size, cover: null, pageCount: doc.numPages, page: b.page, addedAt: Date.now(), openedAt: Date.now() - b.i });
    try { await doc.loadingTask.destroy(); } catch {}
  }
  const read = await import('/js/read.js'); await read.refresh();
  return document.querySelectorAll('#read-grid .read-card').length;`);
check('seed: two books on the shelf', seeded === 2, seeded);

const [HAT, WOOD] = BOOKS;
for (const [lang, scheme] of [['en', 'light'], ['es', 'light'], ['en', 'dark'], ['es', 'dark']]) {
  const tag = `${lang}/${scheme}`;
  console.error(`\n== ${tag}`);
  if (tag !== 'en/light') await load(lang, scheme);
  const none = await tr('read_diagram_none');

  await openBook(HAT.name);
  check(`${tag}: hatched book is open with page ${HAT.page} drawn`, await drawn(HAT.page));

  if (tag === 'en/light') {
    const g = await pressGrid(HAT.page, HAT_BOARDS);
    check(`${tag}: page canvas is the phone's 1065 px`, g.W === 1065, g.W + 'x' + g.H);
    g.boards.forEach((b, i) => check(`${tag}: hatched board ${i + 1} — all 256 points inside it give the same grid`, b.found && b.hit === 256, b));
    check(`${tag}: hatched page — no board anywhere off the boards (${g.offBoard} points over text and margins)`, g.falseBoards.length === 0, g.falseBoards.slice(0, 5));
  }

  for (const training of [false, true]) {
    const on = await evalP(`return document.getElementById('read-training').classList.contains('on');`);
    if (on !== training) check(`${tag}: Training switched ${training ? 'on' : 'off'} with a real tap`, (await tapTraining()) === training);
    const mode = training ? 'Training on' : 'Training off';
    for (const [fx, fy] of HAT_PRESSES) {
      const r = await longPress(HAT.page, fx, fy, !training && fy === 0.28 ? `${lang}-${scheme}-hatched-28` : null);
      check(`${tag}: ${mode} — a real long-press at ${Math.round(fy * 100)}% of the page (missed before) opens the diagram dialog`, !!r.dialog && r.dialog.img && r.toast !== none, r);
    }
    const r = await longPress(HAT.page, ...HAT_TEXT, !training ? `${lang}-${scheme}-text` : null);
    check(`${tag}: ${mode} — a real long-press on plain text says "${none.slice(0, 28)}…", no dialog`, !r.dialog && r.toast === none, r);
  }
  await tapTraining();   // leave the book as it was found: Training off

  await openBook(WOOD.name);
  check(`${tag}: wood-board book is open with page ${WOOD.page} drawn`, await drawn(WOOD.page));
  if (tag === 'en/light') {
    const g = await pressGrid(WOOD.page, WOOD_BOARDS);
    g.boards.forEach((b, i) => check(`${tag}: wood board ${i + 1} — all 256 points inside it give the same grid`, b.found && b.hit === 256, b));
    console.error(`  NOTE wood page — boards found off the boards: ${g.falseBoards.length} of ${g.offBoard} points ` + JSON.stringify(g.falseBoards.slice(0, 5)));
  }
  const w = await longPress(WOOD.page, ...WOOD_PRESS, `${lang}-${scheme}-wood-bottom-rank`);
  check(`${tag}: a real long-press on the bottom rank of a wood board (missed before) opens the diagram dialog`, !!w.dialog && w.dialog.img, w);
}

const appErrors = errors.filter(e => !/AppCheck|app-check|403/i.test(e));
check('no page errors (App Check 403s aside)', appErrors.length === 0, appErrors.slice(0, 3));
const failed = checks.filter(c => !c.ok);
console.error(`\n${checks.length - failed.length}/${checks.length} checks passed`);
try { ws.close(); } catch {}
chrome.kill(); server.close();
process.exit(failed.length ? 1 : 0);
