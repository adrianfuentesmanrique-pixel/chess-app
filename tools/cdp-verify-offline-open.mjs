// Headless-Chrome verification that the app OPENS with no connection — after a
// single visit, and after a service-worker version bump. Dev tool, not shipped.
//
//   node tools/cdp-verify-offline-open.mjs <outDir>
//
// ONE=1 keeps it to EN/light. Each run is a fresh Chrome with a fresh, SHORT
// profile folder (a long --user-data-dir path makes every Cache write fail on
// Windows and the cache look empty) and its own local server.
//
//   first  — ONE online visit, server stopped, reload.
//   bump   — two online visits, then sw.js is served with the CACHE name bumped
//            by one (the working tree is not touched), one more online visit,
//            server stopped, reload.
//
// "Opened" means #splash got its `hide` class, which only happens on the last
// line of main() in js/app.js — i.e. the whole module graph loaded and ran.
// With the server stopped www.gstatic.com is still reachable, on purpose: this
// measures the precache list, not the Firebase SDK imports.
//
// NOTHING IS TAPPED. Language is seeded through localStorage before the page's
// own scripts run, the theme through prefers-color-scheme emulation.
// READ FROM THE PAGE: the cache names, the entry count, which of the four
// startup data modules are cached, the splash class, the requests that failed.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/cdp-verify-offline-open.mjs <outDir>'); process.exit(1); }
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FOUR = ['js/learning-data.js', 'js/quotes-data.js', 'js/legal-data.js', 'js/openings-eco.js'];
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 600000).unref();

const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const CACHE_NOW = SW_SRC.match(/const CACHE = '([^']+)'/)[1];
const CACHE_NEXT = CACHE_NOW.replace(/\d+$/, n => String(+n + 1));

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
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    if (p === '/sw.js' && state.bumped) {
      res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
      res.end(SW_SRC.replace(CACHE_NOW, CACHE_NEXT));
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
  const failed = [];
  for (let i = 0; i < 40; i++) {
    try {
      const page = (await getJSON(`http://127.0.0.1:${port}/json`)).find(t => t.type === 'page');
      if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
    } catch {}
    await sleep(250);
  }
  await new Promise(r => ws.on('open', r));
  const urls = new Map();
  ws.on('message', m => {
    const msg = JSON.parse(m);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result);
    } else if (msg.method === 'Network.requestWillBeSent') {
      urls.set(msg.params.requestId, msg.params.request.url);
    } else if (msg.method === 'Network.loadingFailed') {
      failed.push(`${urls.get(msg.params.requestId) || '?'} ${msg.params.errorText}`);
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
  return { send, evalP, failed, close };
}

// What the worker has stored right now: cache names, and for the current one
// the entry count and which of the four startup data modules are in it.
const CACHE_STATE = `
  const names = (await caches.keys()).filter(k => k.startsWith('chess-training-center-'));
  const out = { names, count: 0, four: [] };
  if (names.length === 1) {
    const keys = (await (await caches.open(names[0])).keys()).map(r => new URL(r.url).pathname.slice(1));
    out.count = keys.length;
    out.four = ${JSON.stringify(FOUR)}.filter(f => keys.includes(f));
  }
  return out;`;

// Wait until the worker has finished installing: one versioned cache, named
// `want`, whose entry count has stopped moving.
async function settle(c, want) {
  let last = -1, same = 0, st;
  for (let i = 0; i < 80; i++) {
    st = await c.evalP(CACHE_STATE).catch(() => null);
    if (st && st.names.length === 1 && st.names[0] === want && st.count === last) { if (++same >= 4) return st; }
    else same = 0;
    last = st ? st.count : -1;
    await sleep(500);
  }
  throw new Error(`worker never settled on ${want}: ${JSON.stringify(st)}`);
}

async function opened(c) {
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    const hid = await c.evalP(`const s = document.getElementById('splash'); return !!s && s.classList.contains('hide');`).catch(() => false);
    if (hid) return Date.now() - t0;
    await sleep(250);
  }
  return null;
}

async function run(scenario, lang, scheme) {
  const state = { bumped: false };
  const web = await startServer(state);
  const c = await startChrome();
  const name = `${scenario}-${lang}-${scheme}`;
  try {
    await c.send('Page.enable'); await c.send('Runtime.enable'); await c.send('Network.enable');
    await c.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
    await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1'); } catch {}` });

    await c.send('Page.navigate', { url: web.url });
    let cache = await settle(c, CACHE_NOW);
    if (scenario === 'bump') {
      await c.send('Page.reload', {});
      await settle(c, CACHE_NOW);
      state.bumped = true;
      await c.send('Page.reload', {});
      cache = await settle(c, CACHE_NEXT);
    }

    await web.stop();
    c.failed.length = 0;
    await c.send('Page.reload', {});
    const ms = await opened(c);
    await sleep(1200);
    const shot = await c.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(shot.data, 'base64'));
    const text = await c.evalP(`return (document.querySelector('nav') || document.body).innerText.replace(/\\s+/g, ' ').slice(0, 90);`).catch(() => '');
    const ok = ms !== null;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: cache ${cache.names[0]} had ${cache.count} entries, ${cache.four.length}/4 startup data modules; offline reload ${ok ? `opened in ${ms} ms` : 'STUCK ON SPLASH'}`);
    console.log(`     seen: "${text}"`);
    const local = c.failed.filter(f => f.startsWith(web.url));
    if (local.length) console.log(`     failed offline: ${local.map(f => f.slice(web.url.length + 1)).join(', ')}`);
    return ok;
  } finally {
    await c.close();
    await web.stop().catch(() => {});
  }
}

const combos = process.env.ONE ? [['en', 'light']] : [['en', 'light'], ['en', 'dark'], ['es', 'light'], ['es', 'dark']];
let bad = 0;
for (const scenario of ['first', 'bump']) {
  for (const [lang, scheme] of combos) {
    if (!await run(scenario, lang, scheme).catch(e => { console.log(`FAIL ${scenario}-${lang}-${scheme}: ${e.message}`); return false; })) bad++;
  }
}
console.log(bad ? `\n${bad} FAILED` : '\nALL OPENED');
process.exit(bad ? 1 : 0);
