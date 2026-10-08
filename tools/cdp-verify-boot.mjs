// Headless-Chrome check that a start-up can never END on the bare splash: every
// launch must finish as the working app or as the "could not start" panel.
// Dev tool, not shipped.
//
//   node tools/cdp-verify-boot.mjs <outDir> [scenario-name ...]
//   SHOTS=1 node tools/cdp-verify-boot.mjs <outDir>     only the panel screenshots
//
// Each scenario is a fresh Chrome with a fresh SHORT profile (see
// tools/cdp-verify-offline-open.mjs) and its own local server, with the REAL
// service worker. Faults are made by the SERVER (a file 404s, its connection is
// cut, it never answers, every request is slow) or, for IndexedDB, by a script
// injected before the page's own. The working tree is never touched.
//
// "The version before" is served straight out of git (`git show OLD:path`), so
// an update launch here is the real v159 -> today step: the v159 worker and its
// cache, then today's files.
//
// HOW A LAUNCH IS JUDGED, read from the page:
//   app     — #splash has `hide` (the last line of main() in js/app.js ran)
//   panel   — #boot-fail is on screen (the boot guard in index.html)
//   overlay — the older "Something went wrong" crash overlay is on screen
//   SPLASH  — none of those after LIMIT ms. This is the bug.
// After a panel/overlay the fault is lifted and the panel's button is pressed:
// the app must then open.
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/cdp-verify-boot.mjs <outDir> [scenario ...]'); process.exit(1); }
const ONLY = process.argv.slice(3);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OLD = '4e90e53';   // v159, the version phones had before the 2026-10-07 release
const LIMIT = 50000;
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 1500000).unref();

const cacheOf = src => src.match(/const CACHE = '([^']+)'/)[1];
const CACHE_NOW = cacheOf(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = url => new Promise((res, rej) => {
  http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});

const oldFiles = new Map();
function fromGit(p) {
  if (!oldFiles.has(p)) {
    let body = null;
    try { body = execFileSync('git', ['show', `${OLD}:${p.slice(1)}`], { cwd: ROOT, maxBuffer: 1 << 27, stdio: ['ignore', 'pipe', 'ignore'] }); } catch {}
    oldFiles.set(p, body);
  }
  return oldFiles.get(p);
}
const CACHE_OLD = cacheOf(fromGit('/sw.js').toString());

// state: { old, edited, fault: { '/js/x.js': '404' | 'cut' | 'hang' }, latency }
//   old    — serve every file as it was at OLD
//   edited — "the next update is out": these three files get a line appended
const EDITED = { '/index.html': '\n<!-- next -->\n', '/js/app.js': '\n;globalThis.__ctcA = 2;\n', '/js/firebase.js': '\n;globalThis.__ctcF = 2;\n' };
async function startServer(state) {
  const port = 9900 + Math.floor(Math.random() * 90);
  const server = http.createServer(async (req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const fault = state.fault && state.fault[p];
    if (fault === 'hang') return;
    if (fault === 'cut') { req.socket.destroy(); return; }
    if (fault === '404') { res.writeHead(404).end(); return; }
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    let body;
    if (state.old) body = fromGit(p);
    else try { body = fs.readFileSync(file); } catch { body = null; }
    if (!body) { res.writeHead(404).end(); return; }
    if (state.edited && EDITED[p]) body = Buffer.concat([body, Buffer.from(EDITED[p])]);
    if (state.latency) await sleep(state.latency);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
    res.end(body);
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
  const errors = [];
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
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(msg.params.args.map(a => a.value ?? a.description ?? '').join(' ').split('\n')[0].slice(0, 200));
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push(`UNCAUGHT ${(d.exception && d.exception.description || d.text || '').split('\n')[0].slice(0, 200)}`);
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
  return { send, evalP, close, errors };
}

// Runs before the page's own scripts on every load. Counts the loads of this
// tab (a reload shows as one more) and, while localStorage.__idbFault is set,
// breaks the app's own database — and only that one, Firebase keeps its own.
const INJECT = (lang) => `
  if (top === self && !/\\.svg$/.test(location.pathname)) try { localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1');
        sessionStorage.setItem('__loads', (+sessionStorage.getItem('__loads') || 0) + 1); } catch {}
  // Someone else's script throws while the app starts — the Sentry report of
  // 2026-10-08 was Google's reCAPTCHA (loaded by App Check) doing exactly this.
  if (top === self && localStorage.getItem('__foreignError')) setTimeout(() => window.__foreignError(), 150);
  window.__foreignError = () => window.dispatchEvent(new ErrorEvent('error', {
    message: "TypeError: Cannot read properties of undefined (reading 'mw')",
    filename: 'https://www.gstatic.com/recaptcha/releases/nY0xPItgwtIvjEjk2TqdwOQz/recaptcha__en.js', lineno: 777, colno: 477,
    error: new TypeError("Cannot read properties of undefined (reading 'mw')") }));
  (() => {
    const real = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (name, ver) {
      const fault = localStorage.getItem('__idbFault');
      if (name !== 'mi-ajedrez' || !fault) return real.apply(this, arguments);
      const req = {};
      if (fault === 'error') setTimeout(() => {
        req.error = new DOMException('Internal error opening backing store for indexedDB.open.', 'UnknownError');
        if (req.onerror) req.onerror({ target: req });
      }, 30);
      return req;   // 'hang': nothing ever fires
    };
  })();`;

const STATE = `
  const s = document.getElementById('splash');
  const overlay = [...document.querySelectorAll('div')].find(d => d.id !== 'boot-fail' && /z-index:\\s*999999/.test(d.getAttribute('style') || ''));
  return { hid: !!s && s.classList.contains('hide'), panel: !!document.getElementById('boot-fail'), overlay: !!overlay,
           loads: +sessionStorage.getItem('__loads') || 0, mainError: (window.__mainError || '').split('\\n')[0] };`;

// Wait for this tab to reach an end state on a load numbered at least `minLoads`.
async function watch(c, minLoads, limit = LIMIT) {
  const t0 = Date.now();
  let st = {};
  while (Date.now() - t0 < limit) {
    st = await c.evalP(STATE).catch(() => ({}));
    if (st.loads >= minLoads) {
      if (st.panel) return { end: 'panel', ms: Date.now() - t0, ...st };
      if (st.overlay) return { end: 'overlay', ms: Date.now() - t0, ...st };
      if (st.hid) {
        const ms = Date.now() - t0;
        await sleep(1500);   // an app that opened must STAY open: no panel a moment later
        const again = await c.evalP(STATE).catch(() => ({}));
        if (again.loads === st.loads) return { end: again.panel ? 'panel' : again.overlay ? 'overlay' : 'app', ms, ...again };
      }
    }
    await sleep(100);
  }
  return { end: 'SPLASH', ms: Date.now() - t0, ...st };
}

async function settle(c, cacheName) {
  const count = `
    const names = (await caches.keys()).filter(k => k.startsWith('chess-training-center-'));
    if (names.length !== 1 || names[0] !== '${cacheName}') return -1;
    return (await (await caches.open(names[0])).keys()).length;`;
  let last = -2, same = 0, n;
  for (let i = 0; i < 80; i++) {
    n = await c.evalP(count).catch(() => -1);
    if (n > 0 && n === last) { if (++same >= 4) return n; } else same = 0;
    last = n;
    await sleep(500);
  }
  throw new Error(`worker never settled on ${cacheName}: ${n}`);
}

async function open(state, { lang = 'en', dark = false } = {}) {
  const web = await startServer(state);
  const c = await startChrome();
  await c.send('Page.enable'); await c.send('Runtime.enable');
  await c.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] });
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: INJECT(lang) });
  return { web, c, shut: async () => { await c.close(); await web.stop().catch(() => {}); } };
}
const loads = c => c.evalP(`return +sessionStorage.getItem('__loads') || 0;`).catch(() => 0);
// Two good visits: the worker is installed and its cache is whole.
async function warm(s, cacheName) {
  await s.c.send('Page.navigate', { url: s.web.url });
  await settle(s.c, cacheName);
  await s.c.send('Page.reload', {});
  await settle(s.c, cacheName);
  const r = await watch(s.c, 2);
  if (r.end !== 'app') throw new Error(`warm-up did not open: ${JSON.stringify(r)}`);
}
const setIdb = (c, v) => c.evalP(v ? `localStorage.setItem('__idbFault', '${v}');` : `localStorage.removeItem('__idbFault');`);

// Each scenario: { state, before(s) -> leaves the tab ready, go(s) -> starts the
// launch under test, heal(s, state) -> lifts the fault }.
// A cold start begins on a small file of this origin, so localStorage can be
// seeded before the app's first load.
const cold = { before: async s => { await s.c.send('Page.navigate', { url: s.web.url + '/icons/google-g.svg' }); await sleep(400); } };
const navigate = async s => { await s.c.send('Page.navigate', { url: s.web.url }); };
const reload = async s => { await s.c.send('Page.reload', {}); };

const SCENARIOS = [
  { name: 'normal launch (warm cache)', want: 'app', state: {},
    before: s => warm(s, CACHE_NOW), go: reload },
  { name: 'normal launch (first visit)', want: 'app', state: {}, ...cold, go: navigate },
  // 'app' on the FIRST load: no reload, no panel, no crash overlay — and none
  // when the same error comes again once the app is open.
  { name: 'a third-party script (reCAPTCHA) throws during start-up and again after', want: 'app', loadsWant: 1, state: {}, ...cold,
    go: async s => { await s.c.evalP(`localStorage.setItem('__foreignError', '1');`); await navigate(s); },
    after: async s => { await s.c.evalP(`window.__foreignError();`); await sleep(300); return (await s.c.evalP(STATE)).overlay ? 'overlay' : 'app'; } },
  { name: 'main() throws: the database will not open', state: {}, ...cold,
    go: async s => { await setIdb(s.c, 'error'); await navigate(s); },
    heal: s => setIdb(s.c, null) },
  { name: 'IndexedDB open never answers', state: {}, ...cold,
    go: async s => { await setIdb(s.c, 'hang'); await navigate(s); },
    heal: s => setIdb(s.c, null) },
  { name: 'a module 404s (js/pulso.js), no worker yet', state: { fault: { '/js/pulso.js': '404' } }, ...cold, go: navigate,
    heal: (s, st) => { st.fault = {}; } },
  { name: 'js/app.js connection cut, no worker yet', state: { fault: { '/js/app.js': 'cut' } }, ...cold, go: navigate,
    heal: (s, st) => { st.fault = {}; } },
  { name: `update ${CACHE_OLD} -> ${CACHE_NOW}, js/firebase.js fetch fails`, state: { old: true },
    before: s => warm(s, CACHE_OLD),
    go: async (s, st) => { st.old = false; st.fault = { '/js/firebase.js': 'cut' }; await reload(s); },
    heal: (s, st) => { st.fault = {}; } },
  { name: `update ${CACHE_OLD} -> ${CACHE_NOW}, new file js/pulso.js connection cut`, state: { old: true },
    before: s => warm(s, CACHE_OLD),
    go: async (s, st) => { st.old = false; st.fault = { '/js/pulso.js': 'cut' }; await reload(s); },
    heal: (s, st) => { st.fault = {}; } },
  { name: `update ${CACHE_OLD} -> ${CACHE_NOW}, new file js/pulso.js never answers`, state: { old: true },
    before: s => warm(s, CACHE_OLD),
    go: async (s, st) => { st.old = false; st.fault = { '/js/pulso.js': 'hang' }; await reload(s); },
    heal: (s, st) => { st.fault = {}; } },
  // TODAY's worker meets the next update and one changed file will not download.
  // The worker used to hand out its cached (old) copy: here that would open the
  // app as a silent mix of new js/app.js and old js/firebase.js, so 'app' is the
  // WRONG ending for this one — the request must fail and the guard take over.
  { name: `next update on today's worker (${CACHE_NOW}), changed js/firebase.js fetch fails`, want: 'panel', state: {},
    before: s => warm(s, CACHE_NOW),
    go: async (s, st) => { st.edited = true; st.fault = { '/js/firebase.js': 'cut' }; await reload(s); },
    heal: (s, st) => { st.fault = {}; } },
  // The stored app is itself broken: today's cache with ONE file from the
  // version before. THE TOOL PUTS IT THERE — how a phone would come to hold such
  // a cache is not shown here, only what follows from it. On a good signal
  // nobody notices: every launch takes the files off the network. On a weak one
  // the launch falls back to that cache — every time, so reopening never helps.
  // The signal stays weak (1 s per request) when the button is pressed.
  { name: 'stored app has one old file (put there by the tool) + weak signal', twice: true, state: {},
    before: async (s, st) => {
      await warm(s, CACHE_NOW);
      st.old = true;
      await s.c.evalP(`const r = await fetch('js/firebase.js?old=1', { cache: 'no-store' });
        await (await caches.open('${CACHE_NOW}')).put(new URL('js/firebase.js', location).href, r);`);
      st.old = false;
    },
    go: async (s, st) => { st.latency = 3000; await reload(s); },
    heal: (s, st) => { st.latency = 1000; } },
];

async function run(sc) {
  const state = { ...sc.state };
  const s = await open(state);
  const out = { name: sc.name };
  try {
    await sc.before(s, state);
    s.c.errors.length = 0;
    let n = await loads(s.c);
    await sc.go(s, state);
    const r = await watch(s.c, n + 1);
    out.first = r;
    out.errors = [...s.c.errors];
    if (sc.loadsWant && r.loads !== n + sc.loadsWant) out.crash = `expected ${sc.loadsWant} load(s), the page loaded ${r.loads - n} times`;
    if (sc.after && r.end === 'app') { r.end = await sc.after(s); if (r.end !== 'app') r.ms = 0; }
    if (sc.twice && r.end !== 'app') {
      // Close and reopen, as a user would: a fresh tab session, same profile.
      await s.c.evalP(`sessionStorage.removeItem('ctcBootRetry'); sessionStorage.setItem('__loads', '0');`).catch(() => {});
      await s.c.send('Page.navigate', { url: s.web.url });
      out.reopen = await watch(s.c, 1);
    }
    const last = out.reopen || r;
    if (sc.heal && (last.end === 'panel' || last.end === 'overlay')) {
      await sc.heal(s, state);
      n = await loads(s.c);
      await s.c.evalP(`document.querySelector(${last.end === 'panel' ? `'#boot-fail button'` : `'div[style*="999999"] button'`}).click();`);
      out.afterButton = await watch(s.c, n + 1);
    }
  } catch (e) { out.crash = String(e && e.message || e).slice(0, 300); }
  finally { await s.shut(); }
  const f = out.first || {};
  out.ok = !out.crash && f.end !== 'SPLASH' && (!sc.want || f.end === sc.want) &&
    (!out.reopen || out.reopen.end !== 'SPLASH') &&
    (!sc.heal || f.end === 'app' || (out.afterButton && out.afterButton.end === 'app'));
  return out;
}

const show = r => r ? `${r.end} after ${(r.ms / 1000).toFixed(1)} s, ${r.loads} load(s)${r.mainError ? ` [main: ${r.mainError}]` : ''}` : '-';

async function shots() {
  let bad = 0;
  // Both wordings of the panel: "could not start" (a module 404s) and "taking
  // too long" (the database never answers).
  for (const kind of ['failed', 'slow']) for (const lang of ['es', 'en']) for (const dark of [false, true]) {
    const s = await open(kind === 'failed' ? { fault: { '/js/pulso.js': '404' } } : {}, { lang, dark });
    try {
      await cold.before(s);
      if (kind === 'slow') await setIdb(s.c, 'hang');
      await navigate(s);
      const r = await watch(s.c, 1);
      const file = path.join(OUT, `boot-panel-${kind}-${lang}-${dark ? 'dark' : 'light'}.png`);
      const text = await s.c.evalP(`const p = document.getElementById('boot-fail'); return p ? p.innerText.replace(/\\n+/g, ' | ') : '';`);
      const wide = await s.c.evalP(`return document.documentElement.scrollWidth;`);
      const png = await s.c.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(png.data, 'base64'));
      console.log(`shot ${kind} ${lang}/${dark ? 'dark' : 'light'}: ${r.end}, page width ${wide}px, "${text}" -> ${file}`);
      if (r.end !== 'panel' || wide > 375) bad++;
    } finally { await s.shut(); }
  }
  return bad;
}

console.log(`boot check: sw.js ${CACHE_NOW}, the version before is ${CACHE_OLD} (${OLD}), 375px`);
let bad = 0;
if (process.env.SHOTS) bad = await shots();
else {
  for (const sc of SCENARIOS) {
    if (ONLY.length && !ONLY.some(o => sc.name.includes(o))) continue;
    const o = await run(sc);
    if (!o.ok) bad++;
    console.log(`\n${o.ok ? 'ok  ' : 'FAIL'} ${o.name}`);
    if (o.crash) console.log(`     tool error: ${o.crash}`);
    console.log(`     launch:       ${show(o.first)}`);
    if (o.reopen) console.log(`     reopened:     ${show(o.reopen)}`);
    if (o.afterButton) console.log(`     after button: ${show(o.afterButton)}`);
    const errs = [...new Set(o.errors || [])];
    console.log(`     console errors (${errs.length}):${errs.length ? '\n       ' + errs.slice(0, 8).join('\n       ') : ' none'}`);
  }
  if (!ONLY.length) bad += await shots().catch(e => { console.log('shots: ' + e.message); return 1; });
}
console.log(bad ? `\n${bad} PROBLEM(S)` : '\nALL GOOD');
process.exit(bad ? 1 : 0);
