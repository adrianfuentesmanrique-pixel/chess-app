// Headless-Chrome measurement of how long a WARM (fully cached) app sits on the
// splash when the connection is weak, and of how many launches an edited file
// needs to show up. Dev tool, not shipped.
//
//   node tools/cdp-measure-weak-signal.mjs
//
// HOW THE SIGNAL IS MADE WEAK: the LOCAL SERVER is slowed down — every request
// waits `latency` ms, then all response bodies share one link of `kbps` KB/s.
// CDP's Network.emulateNetworkConditions is NOT used: it throttles the page's
// requests but not the ones the service worker makes, and the worker is the
// thing being measured. Since v149 the Firebase SDK is served from vendor/ on
// this server too (cache-first, so a warm launch does not request it); only
// reCAPTCHA still comes from www.gstatic.com and is NOT throttled here.
//
//   speed  — two fast visits (warm cache), then one launch at each speed; time
//            from reload to #splash getting `hide`, requests + bytes served.
//   update — warm cache, then the server starts serving index.html, js/app.js
//            and js/quotes-data.js each with a marker appended (the working tree
//            is not touched; the CACHE name is NOT bumped). Launches until all
//            three markers show. Some markers without the others is a MIXED
//            old/new set and fails the run.
//
// Helpers copied from tools/cdp-verify-offline-open.mjs (fresh SHORT profile,
// settle(), the splash check).
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
setTimeout(() => { console.error('MEASURE TIMEOUT'); process.exit(2); }, 900000).unref();

const CACHE_NOW = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').match(/const CACHE = '([^']+)'/)[1];
const EDITED = { '/index.html': '\n<script>globalThis.__ctcI = 2;</script>\n', '/js/app.js': '\n;globalThis.__ctcA = 2;\n', '/js/quotes-data.js': '\n;globalThis.__ctcQ = 2;\n' };

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = url => new Promise((res, rej) => {
  http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});

// state: { latency, kbps, edited, hits, bytes }. kbps 0 = full speed.
async function startServer(state) {
  const port = 9900 + Math.floor(Math.random() * 90);
  let linkFree = 0;
  const server = http.createServer(async (req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    let body;
    try { body = fs.readFileSync(file); } catch { res.writeHead(404).end(); return; }
    if (state.edited && EDITED[p]) body = Buffer.concat([body, Buffer.from(EDITED[p])]);
    state.hits++;
    let gone = false;
    res.on('close', () => { gone = true; });
    if (state.latency) await sleep(state.latency);
    if (gone) return;
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
    if (!state.kbps) { state.bytes += body.length; res.end(body); return; }
    for (let i = 0; i < body.length && !gone; i += 1024) {
      const chunk = body.subarray(i, i + 1024);
      linkFree = Math.max(Date.now(), linkFree) + chunk.length / state.kbps;   // ms: bytes / (KB/s) = bytes / (bytes/ms)
      await sleep(linkFree - Date.now());
      if (gone) return;
      state.bytes += chunk.length;
      res.write(chunk);
    }
    res.end();
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

const CACHE_COUNT = `
  const names = (await caches.keys()).filter(k => k.startsWith('chess-training-center-'));
  if (names.length !== 1 || names[0] !== '${CACHE_NOW}') return -1;
  return (await (await caches.open(names[0])).keys()).length;`;

async function settle(c) {
  let last = -2, same = 0, n;
  for (let i = 0; i < 80; i++) {
    n = await c.evalP(CACHE_COUNT).catch(() => -1);
    if (n > 0 && n === last) { if (++same >= 4) return n; } else same = 0;
    last = n;
    await sleep(500);
  }
  throw new Error(`worker never settled on ${CACHE_NOW}: ${n}`);
}

// Reload and wait for the splash to go. `stamp` proves the document is the new
// one and not the page that was on screen before the reload.
async function launch(c, limitMs) {
  await c.evalP(`window.__old = 1;`).catch(() => {});
  const t0 = Date.now();
  await c.send('Page.reload', {});
  while (Date.now() - t0 < limitMs) {
    const hid = await c.evalP(`const s = document.getElementById('splash'); return !window.__old && !!s && s.classList.contains('hide');`).catch(() => false);
    if (hid) return Date.now() - t0;
    await sleep(100);
  }
  return null;
}

async function warm(state) {
  const web = await startServer(state);
  const c = await startChrome();
  await c.send('Page.enable'); await c.send('Runtime.enable');
  await c.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('lang', 'en'); localStorage.setItem('tourDone', '1'); } catch {}` });
  await c.send('Page.navigate', { url: web.url });
  await settle(c);
  await c.send('Page.reload', {});
  const entries = await settle(c);
  return { web, c, entries };
}

const SPEEDS = [['good network', 0, 0], ['400 ms / 50 KB/s', 400, 50], ['3 s / 10 KB/s', 3000, 10]];

async function speed() {
  for (const [label, latency, kbps] of SPEEDS) {
    const state = { latency: 0, kbps: 0, edited: false, hits: 0, bytes: 0 };
    const { web, c, entries } = await warm(state);
    try {
      Object.assign(state, { latency, kbps, hits: 0, bytes: 0 });
      const ms = await launch(c, 180000);
      const at = { hits: state.hits, bytes: state.bytes };
      console.log(`speed  ${label.padEnd(18)} warm cache ${entries} entries -> ${ms === null ? 'STUCK ON SPLASH (180 s)' : `opened in ${(ms / 1000).toFixed(1)} s`}; server answered ${at.hits} requests, ${Math.round(at.bytes / 1024)} KB by then`);
    } finally { await c.close(); await web.stop().catch(() => {}); }
  }
}

const MARKS = `return [globalThis.__ctcI === 2, globalThis.__ctcA === 2, globalThis.__ctcQ === 2];`;

// An edit goes live on the server; how many launches until the page runs it,
// and is any launch a mix of the old file and the new one?
async function update() {
  let bad = 0;
  for (const [label, latency, kbps] of SPEEDS) {
    const state = { latency: 0, kbps: 0, edited: false, hits: 0, bytes: 0 };
    const { web, c } = await warm(state);
    try {
      Object.assign(state, { latency, kbps, edited: true });
      const seen = [];
      let shownAt = null;
      for (let n = 1; n <= 4 && shownAt === null; n++) {
        const ms = await launch(c, 180000);
        if (ms === null) { seen.push('STUCK'); bad++; break; }
        const m = await c.evalP(MARKS);
        const all = m.every(Boolean), none = !m.some(Boolean);
        seen.push(`${all ? 'new' : none ? 'old' : `MIXED(index.html/app.js/quotes-data.js ${m.map(x => x ? 'new' : 'old').join('/')})`} ${(ms / 1000).toFixed(1)} s`);
        if (!all && !none) bad++;
        if (all) shownAt = n;
        await sleep(2500);   // let anything the worker does in the background finish
      }
      console.log(`update ${label.padEnd(18)} launches after the edit: ${seen.join(', ')}${shownAt === null ? '  (not shown within 4 launches)' : ''}`);
    } finally { await c.close(); await web.stop().catch(() => {}); }
  }
  return bad;
}

console.log(`sw.js ${CACHE_NOW}, 375px, EN/light, server-side throttle`);
const only = process.argv[2];
if (only !== 'update') await speed();
const bad = only === 'speed' ? 0 : await update();
console.log(bad ? `\n${bad} PROBLEM(S)` : '\nDONE');
process.exit(bad ? 1 : 0);
