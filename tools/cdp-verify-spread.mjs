// Headless-Chrome verification for the Read tab's two-page view (v156): in full
// screen on a screen wider than tall the book is shown as spreads (cover alone,
// then 2-3, 4-5); upright, or out of full screen, it is the one column it was.
// The in-app pane does not composite, so this drives a real headless Chrome
// over CDP. Dev tool, not shipped.
//
//   node tools/cdp-verify-spread.mjs <outDir>        (ONE=1 for EN/light only)
//
// The book is MADE UP here (12 pages: a page number, a line of moves with "!"
// marks, a drawn chessboard) — never a real book.
//
// REALLY TAPPED (CDP Input.dispatchTouchEvent): the long-press on the diagram of
// the left and the right page, every Training cover reveal, the double-tap zoom.
// CLICKED WITH element.click(): the Read tab, the shelf card, Back, the
// full-screen button, the two-page button, the Training button.
// CALLED, not done by hand: scrolling (stage.scrollTop), "rotating" (the emulated
// screen is resized), and jump-to-page (the dialog's field is filled and OK'd).
// SEEDED: the book (db.addBook), tourDone, onboardingDone, lang.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/cdp-verify-spread.mjs <outDir>'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
const PAGES = 12;

// ── the made-up book ────────────────────────────────────────────────────────
function makePdf(n) {
  const objs = [], kids = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  let id = 4;
  for (let i = 1; i <= n; i++) {
    let s = `BT /F1 40 Tf 30 540 Td (Page ${i}) Tj ET\n`;
    s += `BT /F1 15 Tf 30 500 Td (1.e4! e5 2.Nf3!! Nc6 3.Bb5 a6 4.Ba4! Nf6) Tj ET\n`;
    // Filler prose: the reader calls a book with under 150 letters a page a scan.
    ['This made-up page stands in for a page of a chess book so the reader', 'has real text to work with. The king walks to the centre and the rook', 'takes the open file while the pawns stay where they are for now.']
      .forEach((ln, k) => { s += `BT /F1 11 Tf 30 ${110 - k * 16} Td (${ln}) Tj ET\n`; });
    const S = 36, X = 66, Y = 150;                      // an 8x8 board, 288pt square
    s += '0.62 g\n';
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2 === 0) s += `${X + c * S} ${Y + r * S} ${S} ${S} re f\n`;
    s += `0 G 1.5 w ${X} ${Y} ${8 * S} ${8 * S} re S\n0 g\n`;
    for (const [c, r] of [[4, 0], [4, 7], [3, 3], [(i % 6) + 1, 5]]) s += `${X + c * S + 9} ${Y + r * S + 9} 18 18 re f\n`;   // "pieces"
    objs[id] = `<< /Length ${s.length} >>\nstream\n${s}\nendstream`;
    objs[id + 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 595] /Contents ${id} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`;
    kids.push(`${id + 1} 0 R`); id += 2;
  }
  objs[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${n} >>`;
  let out = '%PDF-1.4\n'; const offs = [];
  for (let i = 1; i < objs.length; i++) { offs[i] = out.length; out += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
  const x = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) out += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
const PDF = makePdf(PAGES);
const BOARD = { x: (66 + 144) / 420, y: 1 - (150 + 144) / 595 };   // the board's centre, as a fraction of the page

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const WEB = 9900 + Math.floor(Math.random() * 90);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-sp-'));
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 600000).unref();

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/__book') { res.writeHead(200, { 'Content-Type': 'application/pdf' }).end(PDF); return; }
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
const getJSON = url => new Promise((res, rej) => { http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });

let ws, msgId = 0;
const pending = new Map(), errors = [];
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
for (let i = 0; i < 40; i++) {
  try { const t = (await getJSON(`http://127.0.0.1:${PORT}/json`)).find(t => t.type === 'page'); if (t) { ws = new WebSocket(t.webSocketDebuggerUrl); break; } } catch {}
  await sleep(250);
}
await new Promise(r => ws.on('open', r));
ws.on('message', m => {
  const msg = JSON.parse(m);
  if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result); }
  else if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
});
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

const checks = [];
let tag = '';
const check = (name, ok, detail) => { checks.push({ name: tag + name, ok }); console.error((ok ? '  PASS ' : '  FAIL ') + tag + name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); };

const screen = async (w, h) => { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: w > 1000 ? 1 : 2, mobile: w <= 1000 }); await sleep(900); };
const killModals = () => evalP(`document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove());`);
const click = (sel, ms = 500) => evalP(`const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); await new Promise(r => setTimeout(r, ${ms})); return true;`);
async function touch(x, y, hold = 40) {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(x), y: Math.round(y), id: 1 }] });
  await sleep(hold);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
// Everything the checks need about what is on screen.
const state = () => evalP(`
  const st = document.getElementById('read-stage'), s = st.getBoundingClientRect();
  const b = document.getElementById('read-spread');
  const pages = {};
  for (const p of document.querySelectorAll('.read-page')) { const r = p.getBoundingClientRect();
    pages[p.dataset.page] = { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height,
      whole: r.left >= s.left - 0.5 && r.right <= s.left + st.clientWidth + 0.5 && r.top >= s.top - 0.5 && r.bottom <= s.top + st.clientHeight + 0.5,
      inX: r.left >= s.left - 0.5 && r.right <= s.left + st.clientWidth + 0.5,
      covers: p.querySelectorAll('.train-cover').length }; }
  return { ind: document.getElementById('read-page-ind').textContent, pages, inner: [innerWidth, innerHeight],
    stage: { l: s.left, t: s.top, w: st.clientWidth, h: st.clientHeight, sl: st.scrollLeft, sx: st.scrollWidth },
    spread: document.body.classList.contains('read-spread'), full: document.body.classList.contains('read-immersive'),
    btn: { shown: b.getClientRects().length > 0, on: b.classList.contains('on'), pressed: b.getAttribute('aria-pressed'), label: b.getAttribute('aria-label') },
    zoom: +(document.getElementById('read-col').getBoundingClientRect().width / st.clientWidth).toFixed(3),
    docOverflow: document.documentElement.scrollWidth > innerWidth + 1 };`);
const scrollToRowOf = n => evalP(`const p = document.querySelector('.read-page[data-page="${n}"]'); const st = document.getElementById('read-stage'); st.scrollTop = parseFloat(p.style.top); await new Promise(r => setTimeout(r, 900));`);
const waitRendered = async n => { for (let i = 0; i < 40; i++) { if (await evalP(`const c = document.querySelector('.read-page[data-page="${n}"] canvas'); return !!c && c.width > 0;`)) return; await sleep(150); } };
// Long-press the diagram of page n; the dialog is looked for while the finger is
// still down (in headless Chrome the lift lands on the backdrop and closes it).
async function pressDiagram(n) {
  const s = await state(), p = s.pages[n];
  const x = p.l + p.w * BOARD.x, y = p.t + p.h * BOARD.y;
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(x), y: Math.round(y), id: 1 }] });
  await sleep(1300);
  const got = await evalP(`const m = document.querySelector('.modal-back'); const t = document.getElementById('toast');
    return { modal: !!m, img: !!(m && m.querySelector('canvas, img')), toast: t && !t.classList.contains('hidden') ? t.textContent.trim() : '' };`);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(300); await killModals();
  return { ...got, at: [Math.round(x), Math.round(y)], inView: y > s.stage.t && y < s.stage.t + s.stage.h };
}
async function jump(n) {
  await click('#read-page-ind', 500);
  await evalP(`const m = document.querySelector('.modal-back'); const i = m.querySelector('input'); i.value = '${n}'; i.dispatchEvent(new Event('input', { bubbles: true }));
    m.querySelector('button.primary').click(); await new Promise(r => setTimeout(r, 1000));`);
}
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;

async function load(lang, scheme) {
  await screen(375, 812);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
  await send('Page.navigate', { url: `http://localhost:${WEB}` });
  await sleep(2500);
  await evalP(`localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1'); localStorage.setItem('onboardingDone', '1'); localStorage.removeItem('readTwoPages');`);
  await evalP(`const db = await import('/js/db.js'); for (const b of await db.listBookSummaries()) await db.deleteBook(b.id);
    const blob = await (await fetch('/__book')).blob();
    await db.addBook({ name: 'Made-up Book', blob, size: blob.size, pageCount: ${PAGES}, page: 5, addedAt: Date.now(), openedAt: Date.now() });`);
  await send('Page.reload', {});
  await sleep(3500);
  await killModals();
  await click('[data-screen="read"]', 900);
  await click('#read-shelf .read-card', 2500);
}

// The two-page checks at one wide screen size. `whole` = both pages must fit the screen whole.
async function wide(w, h, whole, name) {
  await screen(w, h);
  let s = await state();
  check(`${w}x${h} out of full screen: still one page, button hidden`, !s.spread && !s.btn.shown && s.ind === '5 / 12' && near(s.pages[5].w, s.stage.w), { ind: s.ind, w: s.pages[5]?.w, stage: s.stage.w });
  await click('#read-fullscreen', 1200);
  await waitRendered(5);
  s = await state();
  const L = s.pages[4], Rp = s.pages[5];
  check(`${w}x${h} full screen: two pages come on by themselves`, s.spread && s.btn.shown && s.btn.on && s.btn.pressed === 'true', s.btn);
  check(`${w}x${h} indicator names both pages`, s.ind === '4–5 / 12', s.ind);
  check(`${w}x${h} the stage takes the whole screen`, s.stage.w >= w - 40 && s.stage.t + s.stage.h >= h - 14 && !s.docOverflow, s.stage);
  check(`${w}x${h} page 4 left of page 5, same row, same size, no overlap`, L && Rp && near(L.t, Rp.t) && near(L.w, Rp.w) && L.r <= Rp.l + 0.5 && near(L.t, s.stage.t, 2), { L, Rp });
  check(`${w}x${h} nothing cut off sideways (no sideways scroll)`, L.inX && Rp.inX && s.stage.sx <= s.stage.w + 1, { sx: s.stage.sx, w: s.stage.w });
  if (whole) check(`${w}x${h} both pages fully visible`, L.whole && Rp.whole, { L, Rp });
  else check(`${w}x${h} pages are readable size (half the screen each), taller than the screen`, L.w >= 380 && L.h > s.stage.h, { w: L.w, h: L.h });
  await shot(`${name}-${w}x${h}-spread`);

  // diagram: left page, right page
  if (!whole) await evalP(`const st = document.getElementById('read-stage'); st.scrollTop += ${Math.round(L.h * BOARD.y - s.stage.h / 2)}; await new Promise(r => setTimeout(r, 700));`);
  for (const n of [4, 5]) {
    const d = await pressDiagram(n);
    check(`${w}x${h} long-press on the diagram of page ${n} (${n === 4 ? 'LEFT' : 'RIGHT'}) finds the board`, d.inView && d.modal && d.img, d);
  }
  await scrollToRowOf(4);

  // Training: covers on both pages; a tap reveals one, on each page
  await click('#read-training', 1500);
  s = await state();
  check(`${w}x${h} Training covers the "!" moves on both pages`, s.pages[4].covers === 3 && s.pages[5].covers === 3, [s.pages[4].covers, s.pages[5].covers]);
  for (const n of [4, 5]) {
    const c = await evalP(`const r = document.querySelector('.read-page[data-page="${n}"] .train-cover').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
    await touch(c.x, c.y); await sleep(450);
    const left = (await state()).pages;
    check(`${w}x${h} a tap reveals one covered move on page ${n}, and only there`, left[n].covers === 2 && left[n === 4 ? 5 : 4].covers === (n === 4 ? 3 : 2), [left[4].covers, left[5].covers]);
  }
  await shot(`${name}-${w}x${h}-training`);
  await click('#read-training', 700);

  // zoom about a point on the RIGHT page: the tapped point stays under the finger
  s = await state();
  const P = { x: s.pages[5].l + s.pages[5].w * 0.7, y: s.pages[5].t + Math.min(s.pages[5].h, s.stage.h) * 0.4 };
  const frac = st => ({ fx: (P.x - st.pages[5].l) / st.pages[5].w, fy: (P.y - st.pages[5].t) / st.pages[5].h });
  const f0 = frac(s);
  await touch(P.x, P.y); await sleep(120); await touch(P.x, P.y); await sleep(900);
  s = await state();
  const f1 = frac(s);
  check(`${w}x${h} double-tap zooms to 2x and keeps the tapped point under the finger`, near(s.zoom, 2, 0.02) && near(f0.fx, f1.fx, 0.01) && near(f0.fy, f1.fy, 0.01), { zoom: s.zoom, f0, f1 });
  await touch(P.x, P.y); await sleep(120); await touch(P.x, P.y); await sleep(900);
  s = await state();
  check(`${w}x${h} double-tap again returns to the whole spread`, near(s.zoom, 1, 0.01) && s.pages[4]?.inX && s.pages[5]?.inX && s.ind === '4–5 / 12', { zoom: s.zoom, ind: s.ind });

  // jump, cover page, last row
  await jump(9); s = await state();
  check(`${w}x${h} jump to page 9 shows the 8–9 spread`, s.ind === '8–9 / 12' && near(s.pages[8].t, s.stage.t, 2) && s.pages[9].inX, s.ind);
  await jump(1); s = await state();
  check(`${w}x${h} the cover (page 1) sits alone, centred`, s.ind === '1 / 12' && near(s.pages[1].l + s.pages[1].w / 2, s.stage.l + s.stage.w / 2, 2) && near(s.pages[2].t, s.pages[3].t) && s.pages[2].t > s.pages[1].t, { ind: s.ind, p1: s.pages[1] });
  await jump(12); s = await state();
  check(`${w}x${h} the last page (12) is alone on the left of its row`, s.ind === '12 / 12' && near(s.pages[12].l, s.pages[10].l), { ind: s.ind, dbg: await evalP(`const st = document.getElementById('read-stage'), c = document.getElementById('read-col'); return [st.scrollTop, st.scrollHeight, st.clientHeight, c.style.height, st.className, document.querySelector('.read-page[data-page="12"]')?.style.top];`) });
  await jump(9);
  if (whole) {
    // a scroll that stops between two rows settles on a row
    await evalP(`const st = document.getElementById('read-stage'); st.scrollTop += 90; await new Promise(r => setTimeout(r, 900));`);
    s = await state();
    const tops = Object.values(s.pages).map(p => Math.abs(p.t - s.stage.t));
    check(`${w}x${h} a scroll that stops between rows settles on a row (both pages whole)`, Math.min(...tops) <= 2, { ind: s.ind, off: Math.min(...tops) });
    await jump(9);
  }

  // the button: one page ↔ two pages, remembered
  await click('#read-spread', 1200); s = await state();
  check(`${w}x${h} the button switches to one page (still full screen), same place`, !s.spread && s.full && s.btn.shown && !s.btn.on && s.ind === '8 / 12' && near(s.pages[8].w, s.stage.w), { ind: s.ind, btn: s.btn });
  await click('#read-fullscreen', 900); await click('#read-fullscreen', 1200); s = await state();
  check(`${w}x${h} "one page" is remembered when full screen is entered again`, !s.spread && s.ind === '8 / 12', s.ind);
  await click('#read-spread', 1200); s = await state();
  check(`${w}x${h} the button switches back to two pages`, s.spread && s.btn.on && s.ind === '8–9 / 12', s.ind);

  // close and reopen: same place
  await click('#read-back', 900);
  await click('#read-shelf .read-card', 2500); s = await state();
  check(`${w}x${h} closing and reopening the book returns to the same place (one page: 8)`, !s.spread && !s.full && s.ind === '8 / 12', s.ind);
  await click('#read-fullscreen', 1200); s = await state();
  check(`${w}x${h} … and full screen shows the same spread again`, s.spread && s.ind === '8–9 / 12', s.ind);
  await jump(5); s = await state();
  await click('#read-fullscreen', 1200); s = await state();
  check(`${w}x${h} leaving full screen returns to one page at the app's usual width`, !s.spread && !s.btn.shown && s.ind === '4 / 12' && s.stage.w <= 560, { ind: s.ind, w: s.stage.w });
  await jump(5);
}

const combos = process.env.ONE ? [['en', 'light']] : [['en', 'light'], ['es', 'dark'], ['es', 'light'], ['en', 'dark']];
for (const [lang, scheme] of combos) {
  tag = `[${lang}/${scheme}] `;
  const name = `${lang}-${scheme}`;
  await load(lang, scheme);

  // upright: exactly the one column it was
  await waitRendered(5);
  let s = await state();
  check('375x812 opens at the saved page, one page as wide as the stage, at x = 0', s.ind === '5 / 12' && !s.spread && near(s.pages[5].w, s.stage.w) && near(s.pages[5].l, s.stage.l) && near(s.pages[5].t, s.stage.t, 2), { ind: s.ind, p: s.pages[5], stage: s.stage });
  check('375x812 two-page button is hidden', !s.btn.shown, s.btn);
  check('375x812 two-page button label', s.btn.label === (lang === 'es' ? 'Dos páginas' : 'Two pages'), s.btn.label);
  const before = s.stage;
  await click('#read-fullscreen', 900); s = await state();
  check('375x812 full screen upright: still one page, same size as before, no button', !s.spread && !s.btn.shown && s.ind === '5 / 12' && s.stage.w === before.w && s.stage.h === before.h && near(s.pages[5].w, s.stage.w), { stage: s.stage, before });
  const d = await pressDiagram(5);
  check('375x812 long-press on the diagram finds the board (one-page view)', d.modal && d.img, d);
  await shot(`${name}-375x812-full`);
  await click('#read-fullscreen', 700);

  await wide(812, 375, false, name);
  await wide(1280, 800, true, name);

  // rotate while in full screen
  await click('#read-fullscreen', 1200);
  s = await state();
  check('1280x800 in the spread before rotating', s.spread && s.ind === '4–5 / 12', s.ind);
  await screen(375, 812); await sleep(600); s = await state();
  check('turned upright in full screen: one page, button gone, same place', !s.spread && !s.btn.shown && s.ind === '5 / 12' && near(s.pages[5].w, s.stage.w), { ind: s.ind, btn: s.btn });
  await screen(812, 375); await sleep(600); s = await state();
  check('turned sideways in full screen: two pages again, same place', s.spread && s.btn.shown && s.ind === '4–5 / 12', s.ind);
  await click('#read-fullscreen', 900);

  // v157: full screen is the device's full screen too, and asks the screen to
  // follow the phone. Headless Chrome has no screen to turn, so lock/unlock are
  // RECORDED here, not obeyed - what the installed app does is a phone test.
  await screen(375, 812);
  await evalP(`window.__o = []; const so = screen.orientation;
    so.lock = t => { window.__o.push('lock:' + t); return Promise.resolve(); }; so.unlock = () => { window.__o.push('unlock'); };`);
  const dev = () => evalP(`const v = e => e.getClientRects().length > 0; return { real: !!document.fullscreenElement, full: document.body.classList.contains('read-immersive'), calls: window.__o.join(','),
    header: v(document.getElementById('topbar')), reader: v(document.getElementById('read-stage')) };`);
  await click('#read-fullscreen', 1200); let f = await dev();
  check('full screen is the device\'s full screen, and asks the screen to follow the phone', f.real && f.full && f.calls === 'lock:any' && !f.header, f);
  const dd = await pressDiagram(5);
  check('the diagram dialog still shows in the device\'s full screen', dd.modal && dd.img, dd);
  await click('#read-page-ind', 600);
  check('the jump-to-page dialog still shows in the device\'s full screen', await evalP(`const m = document.querySelector('.modal-back'); return !!m && m.getClientRects().length > 0 && !!m.querySelector('input');`));
  await killModals();
  await click('#read-fullscreen', 1200); f = await dev();
  check('the button leaves both, and hands the screen back upright', !f.real && !f.full && f.calls.endsWith('unlock') && f.header, f);
  await click('#read-fullscreen', 1200);
  await evalP(`await document.exitFullscreen(); await new Promise(r => setTimeout(r, 900));`); f = await dev();
  check('full screen ended by the phone itself (Back / swipe): the header is back, the book still open', !f.real && !f.full && f.header && f.reader && f.calls.endsWith('unlock'), f);
  await click('#read-fullscreen', 1200);
  await click('#read-back', 900); f = await dev();
  check('closing the book in full screen leaves the device\'s full screen too', !f.real && !f.full && f.header && f.calls.endsWith('unlock'), f);
}

if (errors.length) console.error('PAGE ERRORS:\n' + [...new Set(errors)].join('\n'));
const failed = checks.filter(c => !c.ok);
console.log(`${checks.length - failed.length}/${checks.length} passed` + (failed.length ? '\nFAILED:\n' + failed.map(f => '  ' + f.name).join('\n') : ' — ALL PASSED'));
chrome.kill(); server.close();
process.exit(failed.length || errors.length ? 1 : 0);
