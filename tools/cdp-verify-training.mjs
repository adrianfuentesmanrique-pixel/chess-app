// Headless-Chrome verification for Training mode on the Read tab: every move
// marked "!" or "!!" is covered, and a tap on a cover reveals that one move.
// The in-app pane does not composite, so this drives a real headless Chrome
// over CDP. Dev tool, not shipped.
//
//   node tools/cdp-verify-training.mjs <outDir> <figurine-text.pdf> <page> <text.pdf> <page> <scan.pdf>
//
// It serves the repo itself (plus the three PDFs, which live outside it) on a
// throwaway port, so no preview server is needed.
//
// REALLY TAPPED (CDP Input.dispatchTouchEvent — a finger down and up; the page
// receives genuine touch pointer events): the Training button, every cover
// reveal, the taps beside a cover, the double-tap zoom, the two-finger pinch,
// the long-press on a cover and on a diagram.
// CLICKED WITH element.click(), not a finger: the Read tab, the shelf cards,
// the reader's Back, the full-screen button, the Puzzles tab.
// CALLED, not done by hand: scrolling (stage.scrollTop is set), and "rotating"
// (the emulated screen is resized to 812x375 and back).
// SEEDED: the three books are put on the shelf with db.addBook() and a starting
// page, not picked through the file chooser. Nothing else.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [OUT_ARG, FIG_PDF, FIG_PAGE, TXT_PDF, TXT_PAGE, SCAN_PDF] = process.argv.slice(2);
if (!SCAN_PDF) { console.error('usage: node tools/cdp-verify-training.mjs <outDir> <figurine.pdf> <page> <text.pdf> <page> <scan.pdf>'); process.exit(1); }
const OUT = OUT_ARG;
const BOOKS = [
  { key: 'fig', name: 'Figurine Book', file: FIG_PDF, page: +FIG_PAGE },
  { key: 'txt', name: 'Text Book', file: TXT_PDF, page: +TXT_PAGE },
  { key: 'scan', name: 'Scan Book', file: SCAN_PDF, page: 60 },
];
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const WEB = 9900 + Math.floor(Math.random() * 90);
const APP_URL = `http://localhost:${WEB}`;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-tr-'));
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 560000).unref();

// ── what SHOULD be covered, worked out separately from the app ───────────────
// pdf.js under Node, the page's text joined the naive way, and the rule restated.
const VENDOR = pathToFileURL(path.join(ROOT, 'vendor') + path.sep).href;
const pdfjs = await import(VENDOR + 'pdf.min.mjs');
pdfjs.GlobalWorkerOptions.workerSrc = VENDOR + 'pdf.worker.min.mjs';
async function expected(file, pages) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), wasmUrl: VENDOR, verbosity: 0 }).promise;
  const out = {};
  for (const p of pages) {
    const tc = await (await doc.getPage(p)).getTextContent();
    let text = '';
    for (const it of tc.items) if ('str' in it) text += it.str + (it.hasEOL ? '\n' : '');
    let n = 0;
    for (const tok of text.split(/\s+/)) {
      const sq = /[a-h][1-8]|[O0]-[O0]/.exec(tok.replace(/^\W*\d+\.+/, ''));
      if (!sq) continue;
      const body = tok.replace(/^\W*\d+\.+/, '').slice(sq.index);
      const m = /[!?]+/.exec(body);
      if (m && (m[0] === '!' || m[0] === '!!')) n++;
    }
    out[p] = n;
  }
  out.pageCount = doc.numPages;
  try { await doc.loadingTask.destroy(); } catch {}
  return out;
}
const EXP = {};
for (const b of BOOKS) EXP[b.key] = await expected(b.file, [b.page]);
console.error('expected covers:', JSON.stringify(EXP));

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
async function shot(name, clip) {
  const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
  return r.data;
}
const killModals = () => evalP(`document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove());`);
const portrait = () => send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
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
await portrait();
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok }); console.error((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); };

// ── fingers ─────────────────────────────────────────────────────────────────
async function tap(x, y, hold = 40) {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(x), y: Math.round(y), id: 1 }] });
  await sleep(hold);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function pinchOut(cx, cy) {
  const pts = d => [{ x: Math.round(cx - d), y: cy, id: 1 }, { x: Math.round(cx + d), y: cy, id: 2 }];
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(30) });
  for (let d = 34; d <= 78; d += 4) { await sleep(16); await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d) }); }
  await sleep(16);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

// ── page-side helpers ───────────────────────────────────────────────────────
const click = (sel, ms = 450) => evalP(`const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); await new Promise(r => setTimeout(r, ${ms})); return true;`);
const centreOf = sel => evalP(`const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
const tr = key => evalP(`return (await import('/js/i18n.js')).t('${key}');`);
const toastText = () => evalP(`const e = document.getElementById('toast'); return e.classList.contains('hidden') ? '' : e.textContent.trim();`);
const zoom = () => evalP(`return +(document.getElementById('read-col').getBoundingClientRect().width / document.getElementById('read-stage').clientWidth).toFixed(2);`);
const btn = () => evalP(`const b = document.getElementById('read-training'); return { on: b.classList.contains('on'), unavailable: b.classList.contains('unavailable'), pressed: b.getAttribute('aria-pressed'), disabled: b.getAttribute('aria-disabled'), label: b.getAttribute('aria-label'), shown: b.getClientRects().length > 0 };`);
const layers = () => evalP(`return document.querySelectorAll('.train-covers, .train-cover').length;`);
// The covers on page n, with where they are on screen and whether a finger can reach them.
const covers = n => evalP(`
  const p = document.querySelector('.read-page[data-page="${n}"]');
  if (!p || !p.querySelector('.train-covers')) return null;
  const s = document.getElementById('read-stage').getBoundingClientRect();
  return [...p.querySelectorAll('.train-cover')].map(c => { const r = c.getBoundingClientRect();
    return { key: c.style.left + '|' + c.style.top, x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height,
      l: r.left, t: r.top, r: r.right, b: r.bottom,
      vis: r.left > s.left + 4 && r.right < s.right - 4 && r.top > s.top + 4 && r.bottom < s.bottom - 4 }; });`);
async function waitCovers(n, ms = 9000) {
  for (let t = 0; t < ms; t += 200) { const c = await covers(n); if (c) return c; await sleep(200); }
  return null;
}
// Are the covers on the right words? Read the page's own pixels (the canvas the
// reader draws) under and around each cover: there must be ink under it, and its
// left and right edges must both fall in white space — an edge that cuts through
// a letter means the cover has slipped off its word.
const inkCheck = n => evalP(`
  const p = document.querySelector('.read-page[data-page="${n}"]');
  const cv = p.querySelector('canvas'), cr = cv.getBoundingClientRect();
  const k = cv.width / cr.width, ctx = cv.getContext('2d');
  const out = { n: 0, ink: 0, left: 0, right: 0, bad: [] };
  [...p.querySelectorAll('.train-cover')].forEach((c, i) => {
    const r = c.getBoundingClientRect();
    const x0 = Math.round((r.left - cr.left) * k), x1 = Math.round((r.right - cr.left) * k);
    const y0 = Math.round((r.top - cr.top + r.height * 0.2) * k), y1 = Math.round((r.bottom - cr.top - r.height * 0.25) * k);
    if (x0 < 1 || x1 >= cv.width - 1 || y1 <= y0) return;
    const d = ctx.getImageData(x0, y0, x1 - x0 + 1, y1 - y0).data, w = x1 - x0 + 1, h = y1 - y0;
    const dark = (x, y) => { const o = (y * w + x) * 4; return d[o] + d[o + 1] + d[o + 2] < 420; };
    let ink = 0; const col = x => { let s = 0; for (let y = 0; y < h; y++) if (dark(x, y)) s++; return s; };
    for (let x = 0; x < w; x++) ink += col(x);
    // "In white space" allows a tenth of the cover's height either way: the hair
    // of padding may rest on the dot of the move number before it.
    const tol = Math.max(1, Math.round(r.height * k * 0.1));
    const gap = x => { for (let i = Math.max(0, x - tol); i <= Math.min(w - 1, x + tol); i++) if (col(i) === 0) return true; return false; };
    const L = gap(0), R = gap(w - 1);
    out.n++; if (ink > 0) out.ink++; if (L) out.left++; if (R) out.right++;
    if (!ink || !L || !R) out.bad.push({ i, ink, L, R });
  });
  return out;`);
const inkOk = r => r.n > 0 && r.ink === r.n && r.left === r.n && r.right === r.n;
// A spot on page n that is at least 'clear' px from every cover but within 'near' of cover c.
const spotNear = (n, key, clear, near) => evalP(`
  const p = document.querySelector('.read-page[data-page="${n}"]');
  const cs = [...p.querySelectorAll('.train-cover')].map(c => c.getBoundingClientRect());
  const me = [...p.querySelectorAll('.train-cover')].find(c => c.style.left + '|' + c.style.top === ${JSON.stringify(key)}).getBoundingClientRect();
  const dist = (r, x, y) => Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
  const cx = me.left + me.width / 2, cy = me.top + me.height / 2;
  for (let a = 0; a < 6.3; a += 0.3) for (let d = ${clear} + 4; d < ${near}; d += 3) {
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
    if (cs.every(r => dist(r, x, y) > ${clear})) return { x, y };
  }
  return null;`);
const stageClip = () => evalP(`const r = document.getElementById('read-stage').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height };`);

async function openBook(name, page) {
  await click('#tabbar button[data-screen="read"]', 500);
  await evalP(`
    if (!document.getElementById('read-reader').classList.contains('hidden')) { document.getElementById('read-back').click(); await new Promise(r => setTimeout(r, 400)); }
    const card = [...document.querySelectorAll('#read-grid .read-card')].find(c => c.textContent.includes(${JSON.stringify(name)}));
    card.click();
    const ind = () => document.getElementById('read-page-ind').textContent;
    for (let i = 0; i < 300 && ind().indexOf('/') < 0; i++) await new Promise(r => setTimeout(r, 100));
    const stage = document.getElementById('read-stage');
    for (let i = 0; i < 300 && !document.getElementById('read-loading').classList.contains('hidden'); i++) await new Promise(r => setTimeout(r, 100));`);
  await sleep(900);
  return evalP(`return document.getElementById('read-page-ind').textContent;`);
}
const tapTraining = async () => { const c = await centreOf('#read-training'); await tap(c.x, c.y); await sleep(700); };

// ── seed the shelf (once; IndexedDB survives the reloads below) ──────────────
await load('en', 'light');
await click('#tabbar button[data-screen="read"]', 500);
const seeded = await evalP(`
  const db = await import('/js/db.js');
  for (const bk of await db.listBookSummaries()) await db.deleteBook(bk.id);
  const books = ${JSON.stringify(BOOKS.map((b, i) => ({ name: b.name, page: b.page, pageCount: EXP[b.key].pageCount, i })))};
  for (const b of books) {
    const blob = await (await fetch('/__book/' + b.i)).blob();
    await db.addBook({ name: b.name, blob, size: blob.size, cover: null, pageCount: b.pageCount, page: b.page, addedAt: Date.now(), openedAt: Date.now() - b.i });
  }
  const read = await import('/js/read.js'); await read.refresh();
  return document.querySelectorAll('#read-grid .read-card').length;`);
check('seed: three books on the shelf', seeded === 3, seeded);

const FIG = BOOKS[0], TXT = BOOKS[1];
const S = { en: {}, es: {} };

for (const [lang, scheme] of [['en', 'light'], ['es', 'light'], ['en', 'dark'], ['es', 'dark']]) {
  const tag = `${lang}/${scheme}`;
  const full = tag === 'en/light';
  console.error(`\n== ${tag}`);
  if (!full) await load(lang, scheme);
  for (const k of ['read_training', 'read_training_on', 'read_training_off', 'read_training_scan']) S[lang][k] = await tr(k);

  // ── the figurine book ──
  const ind = await openBook(FIG.name, FIG.page);
  check(`${tag}: figurine book opens at its page`, ind.startsWith(FIG.page + ' /'), ind);
  let b = await btn();
  check(`${tag}: Training button is in the reader header, labelled "${S[lang].read_training}"`, b.shown && b.label === S[lang].read_training && !b.unavailable, b);

  if (full) {
    // OFF: nothing is added to the page.
    check(`${tag}: Training off — button not on, no cover layer anywhere`, !b.on && b.pressed === 'false' && await layers() === 0, b);
    const clip = await stageClip();
    const before = await shot('en-light-off-before', clip);

    await tapTraining();
    b = await btn();
    check(`${tag}: a real tap on the button turns it on, with the explanation`, b.on && b.pressed === 'true' && await toastText() === S.en.read_training_on, { b, toast: await toastText() });
    let cs = await waitCovers(FIG.page);
    check(`${tag}: figurine page ${FIG.page} — covers = the "!"/"!!" moves counted separately (${EXP.fig[FIG.page]})`, !!cs && cs.length === EXP.fig[FIG.page] && cs.length > 0, cs && cs.length);
    let ink = await inkCheck(FIG.page);
    check(`${tag}: every cover has print under it and both edges in white space`, inkOk(ink), ink);
    console.error('  embedded font used for measuring:', await evalP(`return [...document.fonts].map(f => f.family + ':' + f.status).slice(0, 12);`));
    await sleep(3400);
    await shot('en-light-fig-on');

    // OFF again: the page is pixel-for-pixel what it was before.
    await tapTraining();
    check(`${tag}: a second tap turns it off, says so, and removes every cover`, !(await btn()).on && await toastText() === S.en.read_training_off && await layers() === 0, await toastText());
    await sleep(2600);
    const after = await shot('en-light-off-after', clip);
    check(`${tag}: with Training off the page is identical to before it was ever turned on (same screenshot bytes)`, before === after, { before: before.length, after: after.length });

    await tapTraining();
    cs = await waitCovers(FIG.page);
    const total = cs.length;

    // A real tap on a cover reveals that one and nothing else.
    const v = cs.filter(c => c.vis);
    const a = v[0];
    await tap(a.x, a.y); await sleep(250);
    let now = await covers(FIG.page);
    check(`${tag}: a real tap on a cover reveals exactly that move`, now.length === total - 1 && !now.some(c => c.key === a.key), { before: total, after: now.length });
    check(`${tag}: … and did not zoom`, await zoom() === 1, await zoom());

    // A tap just beside a cover (within a fingertip) still reveals it — only it.
    const c2 = now.filter(c => c.vis)[1];
    const beside = await spotNear(FIG.page, c2.key, 3, 11);
    if (beside) {
      await tap(beside.x, beside.y); await sleep(250);
      const n2 = await covers(FIG.page);
      check(`${tag}: a tap a few pixels beside a cover reveals the nearest one only`, n2.length === now.length - 1, { before: now.length, after: n2.length, beside });
      now = n2;
    } else check(`${tag}: (no free spot beside a cover to test the fingertip margin)`, true);

    // A tap well away from every cover reveals nothing.
    const c3 = now.filter(c => c.vis)[0];
    const away = await spotNear(FIG.page, c3.key, 14, 38);
    await tap(away.x, away.y); await sleep(450);
    check(`${tag}: a tap away from any cover reveals nothing`, (await covers(FIG.page)).length === now.length, away);

    // Reveal, then at once tap beside it: the reveal must not be half a double-tap.
    await tap(c3.x, c3.y); await sleep(110);
    await tap(away.x, away.y); await sleep(500);
    const n3 = await covers(FIG.page);
    check(`${tag}: reveal + a quick second tap nearby does NOT zoom (the reveal used the tap up)`, await zoom() === 1 && n3.length === now.length - 1, { zoom: await zoom(), covers: n3.length });
    await sleep(400);
    now = n3;

    // Double-tap zoom still works, and the covers stay on their words.
    await tap(away.x, away.y); await sleep(110); await tap(away.x, away.y); await sleep(900);
    check(`${tag}: a real double-tap on plain page still zooms to 2x`, await zoom() === 2, await zoom());
    ink = await inkCheck(FIG.page);
    check(`${tag}: after double-tap zoom (page re-drawn sharp) covers are still on their words, revealed ones still revealed`, inkOk(ink) && ink.n === now.length, ink);
    await shot('en-light-fig-zoom2');
    const mid = await evalP(`const r = document.getElementById('read-stage').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
    const farSpot = async () => evalP(`
      const cs = [...document.querySelectorAll('.train-cover')].map(c => c.getBoundingClientRect());
      const s = document.getElementById('read-stage').getBoundingClientRect();
      for (let y = s.top + 30; y < s.bottom - 30; y += 12) for (let x = s.left + 30; x < s.right - 30; x += 12)
        if (cs.every(r => Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom)) > 20)) return { x, y };
      return null;`);
    let fs2 = await farSpot();
    await tap(fs2.x, fs2.y); await sleep(110); await tap(fs2.x, fs2.y); await sleep(900);
    check(`${tag}: double-tap again returns to 1x`, await zoom() === 1, await zoom());

    // Pinch.
    await pinchOut(mid.x, mid.y); await sleep(900);
    const zp = await zoom();
    ink = await inkCheck(FIG.page);
    check(`${tag}: a real two-finger pinch zooms (${zp}x) and the covers follow`, zp > 1.3 && inkOk(ink) && ink.n === now.length, { zoom: zp, ink });
    await shot('en-light-fig-pinch');
    fs2 = await farSpot();
    await tap(fs2.x, fs2.y); await sleep(110); await tap(fs2.x, fs2.y); await sleep(900);
    check(`${tag}: back to 1x after the pinch`, await zoom() === 1, await zoom());

    // Scroll a little: the page is still there, revealed moves stay revealed.
    await evalP(`document.getElementById('read-stage').scrollTop += 160; await new Promise(r => setTimeout(r, 500));`);
    check(`${tag}: scrolled a little (page still on screen) — revealed moves stay revealed`, (await covers(FIG.page)).length === now.length, (await covers(FIG.page)).length);
    // Scroll well away and back: the page was left, so it is covered again.
    await evalP(`const s = document.getElementById('read-stage'); const h = document.querySelector('.read-page').getBoundingClientRect().height; window.__top = s.scrollTop - 160; s.scrollTop += h * 6; await new Promise(r => setTimeout(r, 900)); const gone = !document.querySelector('.read-page[data-page="${FIG.page}"]'); s.scrollTop = window.__top; await new Promise(r => setTimeout(r, 400)); return gone;`);
    cs = await waitCovers(FIG.page);
    ink = await inkCheck(FIG.page);
    check(`${tag}: scrolled six pages away and back — every move is covered again, on the right words`, cs.length === total && inkOk(ink), { covers: cs.length, ink });

    // Rotate / resize.
    await send('Emulation.setDeviceMetricsOverride', { width: 812, height: 375, deviceScaleFactor: 2, mobile: true });
    await sleep(1500);
    const land = await evalP(`const p = [...document.querySelectorAll('.read-page')].find(p => p.querySelector('.train-cover')); return p ? +p.dataset.page : 0;`);
    ink = land ? await inkCheck(land) : { n: 0 };
    check(`${tag}: turned sideways (812x375) — covers on the right words (page ${land})`, inkOk(ink), ink);
    await shot('en-light-fig-landscape');
    await portrait();
    await sleep(1500);
    await evalP(`const s = document.getElementById('read-stage'); const p = document.querySelector('.read-page[data-page="${FIG.page}"]'); if (p) s.scrollTop = p.offsetTop; await new Promise(r => setTimeout(r, 700));`);
    cs = await waitCovers(FIG.page);
    ink = await inkCheck(FIG.page);
    check(`${tag}: turned upright again — covers on the right words`, !!cs && inkOk(ink), ink);

    // Full screen.
    await click('#read-fullscreen', 700);
    const imm = await evalP(`return { cls: document.body.classList.contains('read-immersive'), topbar: document.getElementById('topbar').getClientRects().length, btnOn: document.getElementById('read-training').classList.contains('on') };`);
    ink = await inkCheck(FIG.page);
    check(`${tag}: full screen still works with Training on, covers in place`, imm.cls && imm.topbar === 0 && imm.btnOn && inkOk(ink), { imm, ink });
    await shot('en-light-fig-fullscreen');
    await click('#read-fullscreen', 700);
    check(`${tag}: … and leaves full screen`, !(await evalP(`return document.body.classList.contains('read-immersive');`)));

    // Long-press ON a cover: it is the diagram reader's gesture, not a reveal.
    cs = await covers(FIG.page);
    const lp = cs.filter(c => c.vis)[2] || cs.filter(c => c.vis)[0];
    await tap(lp.x, lp.y, 760); await sleep(400);
    check(`${tag}: a long-press on a cover does not reveal it`, (await covers(FIG.page)).length === cs.length, { toast: await toastText() });
    await killModals();

    // Remembered per book: back to the shelf and in again.
    await openBook(FIG.name, FIG.page);
    cs = await waitCovers(FIG.page);
    check(`${tag}: closed the book and reopened it — Training is still on for it, all moves covered`, (await btn()).on && !!cs && cs.length === total, cs && cs.length);
    // Leave Read and come back: the book reopens, covered again.
    await tap(cs.filter(c => c.vis)[0].x, cs.filter(c => c.vis)[0].y); await sleep(250);
    await click('#tabbar button[data-screen="puzzles"]', 700);
    await click('#tabbar button[data-screen="read"]', 2500);
    cs = await waitCovers(FIG.page);
    check(`${tag}: left the Read tab and came back — book reopens with every move covered again`, !!cs && cs.length === total && (await btn()).on, cs && cs.length);

    // ── the second text book: Training is per book, so it starts OFF here ──
    await openBook(TXT.name, TXT.page);
    b = await btn();
    check(`${tag}: second book — Training is off (it is remembered per book)`, !b.on && await layers() === 0, b);
    // Long-press on a diagram opens the diagram reader — the same with Training
    // off and on. The dialog is looked for while the finger is STILL down: in
    // headless Chrome the lift that follows lands on the dialog's backdrop and
    // dismisses it (a real phone's long-press sends no such click).
    const longPressDiagram = async name => {
      const pt = await evalP(`const r = document.querySelector('.read-page[data-page="${TXT.page}"]').getBoundingClientRect(); return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.16 };`);
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(pt.x), y: Math.round(pt.y), id: 1 }] });
      await sleep(800);
      const modal = await evalP(`const m = [...document.querySelectorAll('.modal-box')].pop(); return m ? { img: !!m.querySelector('canvas, img'), buttons: m.querySelectorAll('button').length } : null;`);
      if (modal && name) await shot(name);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(300);
      await killModals();
      return modal;
    };
    const lpOff = await longPressDiagram();
    check(`${tag}: Training off — a real long-press on a diagram opens the diagram reader`, !!lpOff && lpOff.img, lpOff || 'no dialog');
    await tapTraining();
    await waitCovers(TXT.page);
    const lpOn = await longPressDiagram('en-light-txt-longpress');
    check(`${tag}: Training on — the same long-press still opens the diagram reader`, !!lpOn && lpOn.img && lpOn.buttons === lpOff?.buttons, lpOn || 'no dialog');
    await sleep(2500);
    cs = await waitCovers(TXT.page);
    check(`${tag}: second book page ${TXT.page} — covers = the "!"/"!!" moves counted separately (${EXP.txt[TXT.page]})`, !!cs && cs.length === EXP.txt[TXT.page] && cs.length > 0, cs && cs.length);
    ink = await inkCheck(TXT.page);
    check(`${tag}: second book — every cover has print under it and both edges in white space`, inkOk(ink), ink);
    await sleep(3400);
    await shot('en-light-txt-on');
    const t1 = cs.filter(c => c.vis)[0];
    await tap(t1.x, t1.y); await sleep(250);
    check(`${tag}: second book — a real tap reveals exactly one move`, (await covers(TXT.page)).length === cs.length - 1);
    await shot('en-light-txt-revealed');
  } else {
    // Training was left on for this book in the first pass.
    const cs = await waitCovers(FIG.page);
    check(`${tag}: Training still on for this book after a reload; covers = ${EXP.fig[FIG.page]}`, (await btn()).on && !!cs && cs.length === EXP.fig[FIG.page], cs && cs.length);
    const ink = await inkCheck(FIG.page);
    check(`${tag}: covers on the right words`, inkOk(ink), ink);
    const a = cs.filter(c => c.vis)[0];
    await tap(a.x, a.y); await sleep(250);
    const now = await covers(FIG.page);
    check(`${tag}: a real tap reveals exactly that move`, now.length === cs.length - 1 && !now.some(c => c.key === a.key));
    await shot(`${lang}-${scheme}-fig-on`);
    await tapTraining();
    check(`${tag}: off — message "${S[lang].read_training_off}", no covers`, await toastText() === S[lang].read_training_off && await layers() === 0, await toastText());
    await sleep(2500);
    await tapTraining();
    check(`${tag}: on — message in this language`, await toastText() === S[lang].read_training_on && (await btn()).on, await toastText());
    await sleep(3400);
  }

  // ── the scanned book ──
  await openBook(BOOKS[2].name, BOOKS[2].page);
  for (let i = 0; i < 60 && !(await btn()).unavailable; i++) await sleep(250);
  b = await btn();
  check(`${tag}: scanned book — the button is dimmed and marked unavailable`, b.unavailable && b.disabled === 'true' && !b.on, b);
  await tapTraining();
  const msg = await toastText();
  check(`${tag}: scanned book — a real tap gives the one-line message, and nothing is covered`, msg === S[lang].read_training_scan && await layers() === 0 && !(await btn()).on, msg);
  await shot(`${lang}-${scheme}-scan-message`);
  await sleep(3300);
}

check('strings: Spanish differs from English for all four', Object.keys(S.en).every(k => S.en[k] && S.es[k] && S.en[k] !== S.es[k]), S.es);
check('no uncaught page errors', errors.length === 0, errors.slice(0, 5));

const failed = checks.filter(c => !c.ok);
console.error(`\n${checks.length - failed.length}/${checks.length} passed`);
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ checks, errors, expected: EXP }, null, 1));
try { ws.close(); } catch {}
chrome.kill(); server.close();
await sleep(400);
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(failed.length ? 1 : 0);
