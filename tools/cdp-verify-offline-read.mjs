// Headless-Chrome verification that a BOOK already on the phone still opens in
// the Read tab with no connection after an app update. Sibling of
// cdp-verify-offline-engine.mjs (same server, Chrome and settle() plumbing).
// Dev tool, not shipped.
//
//   node tools/cdp-verify-offline-read.mjs <outDir>
//
// ONE=1 keeps the bump case to EN/light. Each run is a fresh Chrome with a
// fresh, SHORT profile folder and its own local server.
//
// The three files pdf.js fetches on first use are found by the END of their
// path (pdf.worker.min.mjs, jbig2.wasm, openjpeg.wasm), wherever they live.
//
//   fresh — ONE online visit, nothing tapped. The server's request log must
//           hold none of the three: a new install stays light.
//   bump  — online: the test book is opened and both pages are looked at (this
//           is the first use; page 2 is a JPEG2000 scan, so openjpeg.wasm is
//           fetched too). Then sw.js is served with the CACHE name bumped by
//           one (the working tree is not touched), one more online visit,
//           server stopped, reload. Offline: the same book is opened again and
//           both pages must show ink.
//   rescue — the same, but the first version served is v150 (sw.js AND
//           js/read.js of commit 23c808e, read from git), where the three files
//           went into the versioned cache, and the update is the working tree.
//           Skipped while the working tree is still v150.
//
// SEEDED: onboardingDone and tourDone (db.kvSet), and the book itself
// (db.addBook with tools/fixtures/offline-read-test.pdf — 2 pages, made for
// this test: page 1 text, page 2 one full-page JPEG2000 image).
// CLICKED WITH element.click(): the tab bar, the book's card on the shelf.
// SCROLLED BY SCRIPT: the reader, to page 2.
// READ FROM THE PAGE: the page indicator, the toast, how many dark pixels each
// page's canvas holds, which cache holds which file. READ FROM THE SERVER: how
// many times each file was requested.
// NOT COVERED: a JBIG2 page (no encoder on this machine) — jbig2.wasm is
// fetched by the same pdf.js code as openjpeg.wasm but is never requested here.
import { spawn, execSync } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/cdp-verify-offline-read.mjs <outDir>'); process.exit(1); }
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 600000).unref();

const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const CACHE_NOW = SW_SRC.match(/const CACHE = '([^']+)'/)[1];
const CACHE_NEXT = CACHE_NOW.replace(/\d+$/, n => String(+n + 1));
const KEEP_CACHE = (SW_SRC.match(/const KEEP_CACHE = '([^']+)'/) || [])[1];
const OLD = '23c808e';
const OLD_SW = execSync(`git show ${OLD}:sw.js`, { cwd: ROOT, encoding: 'utf8' });
const OLD_READ = execSync(`git show ${OLD}:js/read.js`, { cwd: ROOT, encoding: 'utf8' });
const CACHE_OLD = OLD_SW.match(/const CACHE = '([^']+)'/)[1];

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = url => new Promise((res, rej) => {
  http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});

async function startServer(state) {
  const port = 9900 + Math.floor(Math.random() * 90);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    state.hits.push(p.slice(1));
    // While v150 is being served, its pdf.js files (then in vendor/ itself) are
    // answered from the folder they live in now — the bytes are the same.
    if (state.read) p = p.replace(/^\/vendor\/(pdf\.min\.mjs|pdf\.worker\.min\.mjs|jbig2\.wasm|openjpeg\.wasm)$/, '/vendor/pdfjs-6.3.289/$1');
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    if (p === '/js/read.js' && state.read) {
      res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
      res.end(state.read);
      return;
    }
    if (p === '/sw.js' && state.sw) {
      res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
      res.end(state.sw);
      return;
    }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
  });
  await new Promise(r => server.listen(port, '127.0.0.1', r));
  return { url: `http://localhost:${port}`, stop: () => new Promise(r => { server.close(r); server.closeAllConnections(); }) };
}

async function startChrome() {
  const port = 9300 + Math.floor(Math.random() * 600);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-'));
  const proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });
  let ws, msgId = 0;
  const pending = new Map();
  for (let i = 0; i < 40; i++) {
    try {
      const page = (await getJSON(`http://127.0.0.1:${port}/json`)).find(t => t.type === 'page');
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
    }
  });
  const send = (method, params = {}) => {
    const id = ++msgId;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => pending.set(id, { res, rej }));
  };
  const evalP = async expr => {
    const r = await send('Runtime.evaluate', { expression: `(async()=>{ ${expr} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
    return r.result.value;
  };
  const close = async () => {
    try { ws.close(); } catch {}
    proc.kill();
    await sleep(800);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  };
  return { send, evalP, close };
}

const FILES = ['pdf.worker.min.mjs', 'jbig2.wasm', 'openjpeg.wasm'];
const BOOK = 'Offline test book';
const PDF_B64 = fs.readFileSync(path.join(ROOT, 'tools/fixtures/offline-read-test.pdf')).toString('base64');
const ASSETS = (SW_SRC.match(/const ASSETS = \[([\s\S]*?)\n\];/)[1].replace(/\/\/.*$/gm, '').match(/'[^']+'/g) || []).map(s => s.slice(1, -1));

// Every cache the origin has: its name, its entry count, and which of the
// three pdf.js files are in it (by full path).
const CACHE_STATE = `
  const out = [];
  for (const k of await caches.keys()) {
    const keys = (await (await caches.open(k)).keys()).map(r => new URL(r.url).pathname.slice(1));
    out.push({ name: k, count: keys.length, pdf: keys.filter(p => ${JSON.stringify(FILES)}.some(f => p.endsWith('/' + f))) });
  }
  return out;`;
const versioned = st => st.filter(c => c.name.startsWith('chess-training-center-'));
const held = st => FILES.map(f => `${f} in ${st.filter(c => c.pdf.some(p => p.endsWith('/' + f))).map(c => c.name).join(' + ') || 'NO CACHE'}`).join('; ');
const requested = hits => FILES.map(f => `${f} ${hits.filter(h => h.endsWith('/' + f)).length}x`).join(', ');

// Wait until the worker has finished installing: one versioned cache, named
// `want`, whose entry count has stopped moving.
async function settle(c, want) {
  let last = -1, same = 0, st;
  for (let i = 0; i < 80; i++) {
    st = await c.evalP(CACHE_STATE).catch(() => null);
    const v = st ? versioned(st) : [];
    if (v.length === 1 && v[0].name === want && v[0].count === last) { if (++same >= 4) return st; }
    else same = 0;
    last = v.length ? v[0].count : -1;
    await sleep(500);
  }
  throw new Error(`worker never settled on ${want}: ${JSON.stringify(st)}`);
}

async function opened(c) {
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    const hid = await c.evalP(`const s = document.getElementById('splash'); return !!s && s.classList.contains('hide');`).catch(() => false);
    if (hid) return true;
    await sleep(250);
  }
  return false;
}

const shoot = async (c, name) => {
  const shot = await c.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(shot.data, 'base64'));
};

// The Read tab pressed until the shelf has stayed on screen (right after the
// splash the app can still put its own first screen up).
async function toShelf(c) {
  for (let i = 0, seen = 0; i < 15 && seen < 3; i++) {
    if (await c.evalP(`return document.getElementById('read-add').offsetParent !== null;`)) seen++;
    else { seen = 0; await c.evalP(`document.querySelector('#tabbar button[data-screen="read"]').click();`); }
    await sleep(400);
  }
}

// How much ink page n shows: dark pixels on its canvas (every 4th pixel).
const INK = n => `
  const p = document.querySelector('.read-page[data-page="${n}"]');
  const cv = p && p.querySelector('canvas');
  if (!cv || !cv.width) return { dark: 0, note: 'no canvas' };
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let dark = 0;
  for (let i = 0; i < d.length; i += 16) if (d[i + 3] > 0 && d[i] < 110) dark++;
  const blank = p.querySelector('.read-blank');
  return { dark, note: blank && !blank.classList.contains('hidden') ? 'the "cannot display this page" notice is up' : '' };`;

// The book opened from the shelf, page 1 read, then the reader scrolled to
// page 2 (the JPEG2000 scan). Passes when both pages show ink.
async function openBook(c) {
  await toShelf(c);
  const r = { opened: false, p1: { dark: 0 }, p2: { dark: 0 }, toast: '' };
  const t0 = Date.now();
  const got = await c.evalP(`
    const card = [...document.querySelectorAll('#read-grid .read-card')].find(x => x.textContent.includes(${JSON.stringify(BOOK)}));
    if (!card) return { card: false };
    card.click();
    let toast = '';
    for (let i = 0; i < 200; i++) {
      const el = document.getElementById('toast');
      if (el && !el.classList.contains('hidden')) toast = el.textContent;
      if (document.getElementById('read-page-ind').textContent.includes('/')) return { card: true, ind: document.getElementById('read-page-ind').textContent, toast };
      if (toast && document.getElementById('read-reader').classList.contains('hidden')) break;
      await new Promise(r => setTimeout(r, 100));
    }
    return { card: true, ind: '', toast };`);
  r.toast = got.toast || ''; r.card = got.card; r.ind = got.ind || '';
  if (!r.ind) { r.ms = Date.now() - t0; return r; }
  r.opened = true;
  for (let i = 0; i < 40 && !r.p1.dark; i++) { r.p1 = await c.evalP(INK(1)); if (!r.p1.dark) await sleep(250); }
  r.ms = Date.now() - t0;
  await c.evalP(`const s = document.getElementById('read-stage'); const p = document.querySelector('.read-page[data-page="2"]'); s.scrollTop = p ? p.offsetTop : s.scrollHeight;`);
  for (let i = 0; i < 40 && !r.p2.dark; i++) { await sleep(250); r.p2 = await c.evalP(INK(2)); if (r.p2.note && r.p2.note !== 'no canvas') break; }
  r.ok = r.p1.dark > 0 && r.p2.dark > 0;
  return r;
}
const say = r => !r.card ? 'the book is NOT ON THE SHELF'
  : !r.opened ? `DID NOT OPEN - toast "${r.toast}"`
  : `opened in ${r.ms} ms ("${r.ind}"); page 1 ${r.p1.dark ? `shows ink (${r.p1.dark})` : 'is EMPTY'}; scanned page 2 ${r.p2.dark ? `shows ink (${r.p2.dark})` : `is EMPTY${r.p2.note ? ' - ' + r.p2.note : ''}`}`;

async function setup(lang, scheme) {
  const state = { sw: null, read: null, hits: [] };
  const web = await startServer(state);
  const c = await startChrome();
  await c.send('Page.enable'); await c.send('Runtime.enable');
  await c.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await c.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1'); } catch {}` });
  return { state, web, c };
}

async function fresh() {
  const { state, web, c } = await setup('en', 'light');
  try {
    await c.send('Page.navigate', { url: web.url });
    const st = await settle(c, CACHE_NOW);
    await opened(c);
    await sleep(1500);
    const n = state.hits.filter(h => FILES.some(f => h.endsWith('/' + f))).length;
    const ok = n === 0 && !st.some(x => x.pdf.length);
    console.log(`${ok ? 'PASS' : 'FAIL'} fresh: new install, nothing tapped - requested ${requested(state.hits)}; ${versioned(st)[0].count} entries precached`);
    return ok;
  } finally { await c.close(); await web.stop().catch(() => {}); }
}

async function bump(lang, scheme, rescue = false) {
  const { state, web, c } = await setup(lang, scheme);
  const name = `${rescue ? 'rescue' : 'bump'}-${lang}-${scheme}`;
  const [from, to, next] = rescue ? [CACHE_OLD, CACHE_NOW, SW_SRC] : [CACHE_NOW, CACHE_NEXT, SW_SRC.replace(CACHE_NOW, CACHE_NEXT)];
  if (rescue) { state.sw = OLD_SW; state.read = OLD_READ; }
  try {
    await c.send('Page.navigate', { url: web.url });
    await settle(c, from);
    await opened(c);
    await c.evalP(`const db = await import('/js/db.js'); await db.kvSet('onboardingDone', true); await db.kvSet('tourDone', true);
      const blob = new Blob([Uint8Array.from(atob('${PDF_B64}'), ch => ch.charCodeAt(0))], { type: 'application/pdf' });
      await db.addBook({ name: ${JSON.stringify(BOOK)}, blob, size: blob.size, cover: null, pageCount: 2, page: 1, addedAt: Date.now(), openedAt: Date.now() });`);
    await c.send('Page.reload', {});
    await settle(c, from);
    await opened(c);
    const on = await openBook(c);
    if (!on.ok) await shoot(c, name + '-online-failed');
    await sleep(1500);
    const before = await c.evalP(CACHE_STATE);
    const firstUse = [...new Set(state.hits.filter(h => h.startsWith('vendor/') && !ASSETS.includes(h)))];
    console.log(`     ${name} online first use: ${say(on)}`);
    console.log(`     fetched on first use: ${firstUse.join(', ') || 'nothing'}`);
    console.log(`     held: ${held(before)}`);

    const STALE = '/vendor/made-up-old-pdf-worker.mjs';
    if (KEEP_CACHE && !rescue) await c.evalP(`await (await caches.open('${KEEP_CACHE}')).put('${STALE}', new Response('old'));`);
    state.sw = next; state.read = null;
    await c.send('Page.reload', {});
    const after = await settle(c, to);
    const stale = KEEP_CACHE && !rescue ? await c.evalP(`return !!(await (await caches.open('${KEEP_CACHE}')).match('${STALE}'));`) : false;
    const hits = [...state.hits];
    await web.stop();

    await c.send('Page.reload', {});
    if (!await opened(c)) { console.log(`FAIL ${name}: offline reload stuck on splash`); return false; }
    await sleep(800);
    const off = await openBook(c);
    await sleep(600);
    await shoot(c, name + '-read');
    const once = ['pdf.worker.min.mjs', 'openjpeg.wasm'].every(f => hits.filter(h => h.endsWith('/' + f)).length === 1);
    const ok = !!off.ok && once && !stale;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${from} -> ${versioned(after)[0].name}; requested in all: ${requested(hits)}${KEEP_CACHE && !rescue ? `; made-up old file ${stale ? 'STILL THERE' : 'removed'}` : ''}`);
    console.log(`     held after the update: ${held(after)}`);
    console.log(`     offline Read: ${say(off)}`);
    return ok;
  } finally { await c.close(); await web.stop().catch(() => {}); }
}

const combos = process.env.ONE ? [['en', 'light']] : [['en', 'light'], ['en', 'dark'], ['es', 'light'], ['es', 'dark']];
let bad = 0;
const guard = (label, p) => p.catch(e => { console.log(`FAIL ${label}: ${e.message}`); return false; });
if (!await guard('fresh', fresh())) bad++;
for (const [lang, scheme] of combos) if (!await guard(`bump-${lang}-${scheme}`, bump(lang, scheme))) bad++;
if (CACHE_OLD !== CACHE_NOW && !await guard('rescue-en-light', bump('en', 'light', true))) bad++;
console.log(bad ? `\n${bad} FAILED` : '\nALL PASSED');
process.exit(bad ? 1 : 0);
