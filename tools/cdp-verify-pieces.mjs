// Dev-only check of the Read tab's "Check the position" dialog after v137
// (strict placement): headless Chrome at 375px, EN/ES x light/dark, on the real
// app with a real magazine page.
//
//   node tools/cdp-verify-pieces.mjs <outDir> "<Chess Life 2026-09.pdf>"
//
// REALLY DONE with CDP touch input: the long-press on the first diagram of page
// 20, the taps on "Clear board", on a square and on "Open".
// The board is read WHILE THE FINGER IS STILL DOWN: in headless Chrome, lifting
// it "taps" whatever the dialog put under the finger (the known CDP long-press
// trap, see HANDOVER — Read training mode), which places a pawn on that square.
// SEEDED, not tapped: the book (db.addBook) and its piece templates — built by
// buildTemplatesFromGrid from the page-30 diagram and its true position, which is
// what tapping all 32 pieces in "Teach me the pieces" would store. The refused
// board uses templates seeded WRONG on purpose (every pawn taught as a king).
// The true positions are the by-eye ones of tools/fixtures/piece-truth.json.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [OUT, PDF] = process.argv.slice(2);
if (!PDF) { console.error('usage: node tools/cdp-verify-pieces.mjs <outDir> <Chess Life.pdf>'); process.exit(1); }
const TRUTH = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures/piece-truth.json'), 'utf8')).books.find(b => b.name === 'ChessLife').diagrams;
const TEACH = TRUTH.find(d => d.id === 'p30'), READ = TRUTH.find(d => d.id === 'p20a');
const fenGrid = fen => fen.split('/').map(row => { const o = []; for (const ch of row) { if (/\d/.test(ch)) for (let i = 0; i < +ch; i++) o.push(''); else o.push(ch); } return o; });
const NAME = 'Chess Life (pieces)';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-pcs-'));
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 560000).unref();

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  let file;
  if (p === '/__book') file = PDF;
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
await new Promise(r => server.listen(0, '127.0.0.1', r));
const APP_URL = `http://localhost:${server.address().port}`;

const getJSON = url => new Promise((res, rej) => { http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });

let ws, msgId = 0;
const pending = new Map(), errors = [];
const send = (method, params = {}) => { const id = ++msgId; ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => pending.set(id, { res, rej })); };
async function evalP(expr) {
  const r = await send('Runtime.evaluate', { expression: `(async()=>{ ${expr} })()`, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
  return r.result.value;
}
const shot = async name => fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
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
  try { const page = (await getJSON(`http://127.0.0.1:${PORT}/json`)).find(t => t.type === 'page'); if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; } } catch {}
  await sleep(250);
}
await new Promise(r => ws.on('open', r));
ws.on('message', m => {
  const msg = JSON.parse(m);
  if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result); }
  else if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
});
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok }); console.error((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); };
const click = (sel, ms = 450) => evalP(`const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); await new Promise(r => setTimeout(r, ${ms})); return true;`);
const tr = key => evalP(`return (await import('/js/i18n.js')).t('${key}');`);

async function openBook() {
  await click('#tabbar button[data-screen="read"]', 500);
  await evalP(`
    if (!document.getElementById('read-reader').classList.contains('hidden')) { document.getElementById('read-back').click(); await new Promise(r => setTimeout(r, 400)); }
    [...document.querySelectorAll('#read-grid .read-card')].find(c => c.textContent.includes(${JSON.stringify(NAME)})).click();
    const ind = () => document.getElementById('read-page-ind').textContent;
    for (let i = 0; i < 300 && ind().indexOf('/') < 0; i++) await new Promise(r => setTimeout(r, 100));
    for (let i = 0; i < 300 && !document.getElementById('read-loading').classList.contains('hidden'); i++) await new Promise(r => setTimeout(r, 100));`);
  await sleep(1200);
  return evalP(`
    for (let i = 0; i < 60; i++) { const c = document.querySelector('.read-page[data-page="${READ.page}"] canvas');
      if (c && c.width > 300 && document.querySelector('.read-page[data-page="${READ.page}"] .read-blank').classList.contains('hidden')) return c.width;
      await new Promise(r => setTimeout(r, 150)); }
    return 0;`);
}
// Templates for the book, built from the page-30 diagram rendered at the reader's
// own canvas width, with `grid` as the position the user "confirmed".
const seedTemplates = (width, grid) => evalP(`
  const db = await import('/js/db.js'), D = await import('/js/diagram.js');
  const lib = await import('/vendor/pdfjs-6.3.289/pdf.min.mjs'); lib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs-6.3.289/pdf.worker.min.mjs';
  const doc = await lib.getDocument({ url: '/__book', wasmUrl: '/vendor/' }).promise, page = await doc.getPage(${TEACH.page});
  const vp = page.getViewport({ scale: ${width} / page.getViewport({ scale: 1 }).width });
  const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
  await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
  const img = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
  const board = D.detectBoard(img, ${TEACH.press[0]} / 1065 * cv.width, ${TEACH.press[1]} / 1065 * cv.width);
  if (!board) return 'no board on the teaching page';
  const templates = D.buildTemplatesFromGrid(img, board, ${JSON.stringify(grid)});
  const bk = (await db.listBookSummaries()).find(b => b.name === ${JSON.stringify(NAME)});
  await db.updateBookMeta(bk.id, { templates });
  try { await doc.loadingTask.destroy(); } catch {}
  return Object.keys(templates.samples).sort().join('');`);
// Screen position of a point given in 1065-px page coordinates on the page.
const pointOn = (n, x1065, y1065) => evalP(`
  const stage = document.getElementById('read-stage');
  const pg = () => document.querySelector('.read-page[data-page="${n}"]').getBoundingClientRect();
  const s = stage.getBoundingClientRect(), k = pg().width / 1065;
  stage.scrollTop += (pg().top + ${y1065} * k) - (s.top + s.height / 2);
  await new Promise(r => setTimeout(r, 900));
  const r = pg(); return { x: r.left + ${x1065} * k, y: r.top + ${y1065} * k };`);
// What the dialog shows: every square's piece, the marks, the note, the buttons.
const dialog = () => evalP(`
  const m = [...document.querySelectorAll('.modal-box')].pop(); if (!m) return null;
  const code = src => { const f = src.split('/').pop().replace('.svg', ''); return f[0] === 'w' ? f[1] : f[1].toLowerCase(); };
  const cells = [...m.querySelectorAll('.read-teach-grid button')];
  const box = m.getBoundingClientRect(), note = m.querySelector('.read-teach-note');
  const btns = [...m.querySelectorAll('.row button')].map(b => { const r = b.getBoundingClientRect(); return { text: b.textContent.trim(), inside: r.left >= box.left - 0.5 && r.right <= box.right + 0.5, clipped: b.scrollWidth > b.clientWidth + 1 }; });
  return { title: m.querySelector('h3').textContent, grid: cells.map(c => { const i = c.querySelector('img'); return i ? code(i.getAttribute('src')) : ''; }),
    learn: (l => { if (!l) return null; const r = l.getBoundingClientRect(); return { text: l.textContent, inside: r.left >= box.left - 0.5 && r.right <= box.right + 0.5 && r.bottom <= box.bottom + 0.5 }; })(m.querySelector('.read-teach-learn')),
    doubt: cells.filter(c => c.classList.contains('doubt')).length, note: note ? note.textContent : '', noteInside: !note || note.getBoundingClientRect().right <= box.right + 0.5,
    btns, wide: m.scrollWidth > m.clientWidth + 1, onScreen: box.left >= 0 && box.right <= 375.5 && box.bottom <= 812.5 };`);
const tapEl = async (expr, ms = 500) => {
  const c = await evalP(`const m = [...document.querySelectorAll('.modal-box')].pop(); const e = ${expr}; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
  if (!c) return false;
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(c.x), y: Math.round(c.y), id: 1 }] });
  await sleep(40);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(ms);
  return true;
};
// A real long-press on the diagram; the finger is lifted before the dialog is used.
async function longPress(shotName) {
  await killModals();
  const pt = await pointOn(READ.page, READ.press[0], READ.press[1]);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(pt.x), y: Math.round(pt.y), id: 1 }] });
  await sleep(1300);
  const down = await dialog();
  if (shotName) await shot(shotName);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(400);
  return { down, up: await dialog() };
}

// ── seed the shelf ───────────────────────────────────────────────────────────
await load('en', 'light');
await click('#tabbar button[data-screen="read"]', 500);
const seeded = await evalP(`
  const db = await import('/js/db.js');
  const lib = await import('/vendor/pdfjs-6.3.289/pdf.min.mjs'); lib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs-6.3.289/pdf.worker.min.mjs';
  for (const bk of await db.listBookSummaries()) await db.deleteBook(bk.id);
  const blob = await (await fetch('/__book')).blob();
  const doc = await lib.getDocument({ data: await blob.arrayBuffer(), wasmUrl: '/vendor/' }).promise;
  await db.addBook({ name: ${JSON.stringify(NAME)}, blob, size: blob.size, cover: null, pageCount: doc.numPages, page: ${READ.page}, addedAt: Date.now(), openedAt: Date.now() });
  try { await doc.loadingTask.destroy(); } catch {}
  const read = await import('/js/read.js'); await read.refresh();
  return document.querySelectorAll('#read-grid .read-card').length;`);
check('seed: the magazine is on the shelf', seeded === 1, seeded);
const width = await openBook();
check(`the book opens with page ${READ.page} drawn`, width > 300, width);

const truth = fenGrid(READ.fen).flat(), good = fenGrid(TEACH.fen);
const poisoned = good.map(row => row.map(c => c === 'P' ? 'K' : c === 'p' ? 'k' : c));   // every pawn taught as a king
const real = truth.filter(Boolean).length;

for (const [lang, scheme] of [['en', 'light'], ['es', 'light'], ['en', 'dark'], ['es', 'dark']]) {
  const tag = `${lang}/${scheme}`;
  console.error(`\n== ${tag}`);
  // ── a good read ──
  check(`${tag}: templates SEEDED from the page-${TEACH.page} diagram (all 12 pieces)`, await seedTemplates(width, good) === 'BKNPQRbknpqr');
  await load(lang, scheme);
  await openBook();
  const { down, up } = await longPress(`${lang}-${scheme}-1-read`);
  check(`${tag}: a long-press on the page-${READ.page} diagram opens "${await tr('read_review_title')}"`, !!down && down.title === await tr('read_review_title'), down && down.title);
  if (!down || !up) { check(`${tag}: dialog stayed open after the finger lifted`, false); continue; }
  const wrong = down.grid.filter((c, i) => c && c !== truth[i]).length, shown = down.grid.filter(Boolean).length, left = real - (shown - wrong);
  check(`${tag}: NO wrong piece on the board (${shown} shown of ${real} real, ${left} left empty)`, wrong === 0 && shown > 0, down.grid.map((c, i) => c && c !== truth[i] ? `${'abcdefgh'[i % 8]}${8 - (i >> 3)}:${c}` : '').filter(Boolean).join(' '));
  check(`${tag}: no empty square is marked as doubtful; the note counts the marks (${down.doubt})`, down.doubt <= left && (down.doubt === 0 ? down.note === '' : down.note === (await evalP(`return (await import('/js/i18n.js')).tn('read_review_doubt', ${down.doubt});`))), { doubt: down.doubt, note: down.note });
  // v141: the dialog says a correction counts after a second diagram (v139's rule).
  check(`${tag}: the dialog says "${await tr('read_review_learn')}", inside the dialog`, !!up.learn && up.learn.text === await tr('read_review_learn') && up.learn.inside, up.learn);
  const clearText = await tr('clear_board');
  check(`${tag}: three buttons, "${clearText}" in the middle, none clipped or outside the dialog`, up.btns.length === 3 && up.btns[1].text === clearText && up.btns.every(b => b.inside && !b.clipped) && !up.wide && up.onScreen, up.btns);
  // tap a marked or empty square: the selected white pawn lands, its mark goes
  const emptyIdx = truth.findIndex((c, i) => !c && !up.grid[i] && i > 8);
  await tapEl(`m.querySelectorAll('.read-teach-grid button')[${emptyIdx}]`);
  const placed = await dialog();
  check(`${tag}: a tap on a square still places the selected piece`, placed.grid[emptyIdx] === 'P');
  // Clear board
  await tapEl(`[...m.querySelectorAll('.row button')][1]`);
  const cleared = await dialog();
  await shot(`${lang}-${scheme}-2-cleared`);
  check(`${tag}: "${clearText}" empties all 64 squares, the marks and the note in one tap`, cleared.grid.every(c => !c) && cleared.doubt === 0 && cleared.note === '');
  check(`${tag}: ...and the line about the second diagram stays`, !!cleared.learn && cleared.learn.inside);
  await tapEl(`[...m.querySelectorAll('.row button')][0]`);
  const stillOpen = await dialog();
  const toast = await evalP(`const e = document.getElementById('toast'); return e.classList.contains('hidden') ? '' : e.textContent.trim();`);
  check(`${tag}: "Open" on the empty board asks for the kings and keeps the dialog`, !!stillOpen && toast === await tr('read_teach_need_kings'), toast);
  await killModals();

  // ── a refused read: the same diagram, with templates taught WRONG on purpose ──
  await seedTemplates(width, poisoned);
  await load(lang, scheme);
  await openBook();
  const bad = (await longPress(`${lang}-${scheme}-3-refused`)).down;
  check(`${tag}: an impossible read (pawns taught as kings) shows an EMPTY board, with no marks`, !!bad && bad.grid.every(c => !c) && bad.doubt === 0, bad && { pieces: bad.grid.filter(Boolean).length, marks: bad.doubt });
  check(`${tag}: ...with the message "${(await tr('read_review_refused')).slice(0, 34)}…", inside the dialog`, !!bad && bad.note === await tr('read_review_refused') && bad.noteInside && !bad.wide && bad.onScreen, bad && bad.note);
  await killModals();
}

// ── Open hands the shown position to Setup, and the book LEARNS from it (once, EN/light) ──
const sampleCount = () => evalP(`const db = await import('/js/db.js');
  const bk = (await db.listBookSummaries()).find(b => b.name === ${JSON.stringify(NAME)});
  const t = (await db.getBook(bk.id)).templates, n = o => Object.values(o || {}).reduce((s, l) => s + l.length, 0);
  return { samples: n(t.samples), held: n(t.pending) };`);
await seedTemplates(width, good);
const samplesBefore = await sampleCount();
await load('en', 'light');
await openBook();
const fin = await longPress();
// correct the board by REAL taps until it is the true position: wipe the pawn the
// lifted finger dropped (the CDP trap), place every piece the reader left out
let fixes = 0;
for (let i = 0; i < 64; i++) {
  if (fin.up.grid[i] === truth[i]) continue;
  await tapEl(truth[i] ? `m.querySelector('.read-teach-pal [data-piece="${truth[i]}"]')` : `[...m.querySelectorAll('.read-teach-pal button')].pop()`, 200);
  await tapEl(`m.querySelectorAll('.read-teach-grid button')[${i}]`, 200);
  fixes++;
}
const before = await dialog();
check(`the board is corrected by ${fixes} taps to the true position (${fin.down.grid.filter(Boolean).length} of ${real} were read)`, JSON.stringify(before.grid) === JSON.stringify(truth) && fin.down.grid.filter(Boolean).length < real);
await tapEl(`[...m.querySelectorAll('.row button')][0]`, 1200);
const setup = await evalP(`const D = await import('/js/diagram.js');
  const s = [...document.querySelectorAll('.screen')].find(e => !e.classList.contains('hidden'));
  return { screen: s ? s.id : '', modal: !!document.querySelector('.modal-box .read-teach-grid') };`);
check('Open closes the dialog and leaves the Read screen for Setup', !setup.modal && !/read/.test(setup.screen), setup);
await shot('en-light-4-setup');
const samplesAfter = await sampleCount();
// v139: ONE confirmed diagram only HOLDS its new shapes; they count once a second diagram agrees.
check(`Open stored the lesson without trusting it yet: piece samples ${samplesBefore.samples} -> ${samplesAfter.samples}, shapes held ${samplesBefore.held} -> ${samplesAfter.held}`, samplesAfter.samples === samplesBefore.samples && samplesBefore.held === 0 && samplesAfter.held > 0);
await load('en', 'light');
await openBook();
const again = (await longPress('en-light-5-after-learning')).down;
check(`the same diagram pressed again reads exactly as before (${again.grid.filter(Boolean).length} of ${real}, the same square still marked), nothing wrong: one diagram is not two`, JSON.stringify(again.grid) === JSON.stringify(fin.down.grid) && again.grid.every((c, i) => !c || c === truth[i]) && again.doubt === fin.down.doubt && again.note === fin.down.note, { was: fin.down.grid.join(''), now: again.grid.join(''), marked: [fin.down.doubt, again.doubt] });
await killModals();
check('no page errors', errors.length === 0, errors.slice(0, 3));

const failed = checks.filter(c => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
chrome.kill(); server.close();
process.exit(failed ? 1 : 0);
