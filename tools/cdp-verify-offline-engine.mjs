// Headless-Chrome verification that the Stockfish ENGINE still starts with no
// connection after an app update. Sibling of cdp-verify-offline-open.mjs, which
// only checks that the app opens. Dev tool, not shipped.
//
//   node tools/cdp-verify-offline-engine.mjs <outDir>
//
// ONE=1 keeps the bump case to EN/light. Each run is a fresh Chrome with a
// fresh, SHORT profile folder and its own local server.
//
//   fresh — ONE online visit, nothing tapped. The server's own request log must
//           NOT contain the Stockfish .wasm: a new install stays light.
//   bump  — online: a game against the bot (this is the first use, it downloads
//           the .wasm). Then sw.js is served with the CACHE name bumped by one
//           (the working tree is not touched), one more online visit, server
//           stopped, reload. Offline: a game against the bot, then the engine
//           switched on in Analysis. A made-up old engine file is also put in
//           the kept cache before the bump; it must be gone after it.
//   rescue — the same, but the first version served is the LAST ONE WITHOUT
//           the kept cache (sw.js of commit ca40e68, v149, read from git) and
//           the update is the working tree's sw.js: the .wasm v149 stored in
//           its versioned cache must be carried across, not downloaded again.
//
// REALLY TOUCHED (CDP Input.dispatchTouchEvent): the move e2-e4, both times.
// SEEDED: onboardingDone and tourDone (db.kvSet, through the app's own db.js),
// so the welcome sheet and the tour offer do not sit over the board.
// CLICKED WITH element.click(): the tab bar, Start game, the engine toggle.
// READ FROM THE PAGE: the Play status bar and move list, the Analysis engine
// lines, which cache holds the .wasm. READ FROM THE SERVER: how many times the
// .wasm was requested.
import { spawn, execSync } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/cdp-verify-offline-engine.mjs <outDir>'); process.exit(1); }
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const WASM = 'vendor/stockfish-17.1-lite-single-03e3232.wasm';
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 600000).unref();

const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const CACHE_NOW = SW_SRC.match(/const CACHE = '([^']+)'/)[1];
const CACHE_NEXT = CACHE_NOW.replace(/\d+$/, n => String(+n + 1));
const KEEP_CACHE = (SW_SRC.match(/const KEEP_CACHE = '([^']+)'/) || [])[1];
const OLD_SW = execSync('git show ca40e68:sw.js', { cwd: ROOT, encoding: 'utf8' });
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
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
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

// Every cache the origin has: its name, its entry count, and whether the
// Stockfish .wasm is in it.
const CACHE_STATE = `
  const out = [];
  for (const k of await caches.keys()) {
    const keys = (await (await caches.open(k)).keys()).map(r => new URL(r.url).pathname.slice(1));
    out.push({ name: k, count: keys.length, wasm: keys.includes(${JSON.stringify(WASM)}) });
  }
  return out;`;
const versioned = st => st.filter(c => c.name.startsWith('chess-training-center-'));
const wasmIn = st => st.filter(c => c.wasm).map(c => c.name).join(' + ') || 'NO CACHE';

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

// A game against the bot as White: Start game, e2-e4 by finger, wait for the
// bot's reply. Passes when the move list holds a second move.
async function playBot(c) {
  // Right after the splash the app can still put its own first screen up, so
  // the tab is pressed until the Play setup has stayed on screen.
  for (let i = 0, seen = 0; i < 15 && seen < 3; i++) {
    if (await c.evalP(`return document.getElementById('play-start').offsetParent !== null;`)) seen++;
    else { seen = 0; await c.evalP(`document.querySelector('#tabbar button[data-screen="play"]').click();`); }
    await sleep(400);
  }
  await c.evalP(`document.querySelector('#play-color button[data-v="w"]').click(); document.getElementById('play-start').click();`);
  await sleep(600);
  const tap = async p => {
    await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }] });
    await sleep(25);
    await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  for (const sq of ['e2', 'e4']) {
    await tap(await c.evalP(`const r = document.querySelector('#play-board .sq[data-sq="${sq}"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`));
    await sleep(250);
  }
  const READ = `return { status: document.getElementById('play-status').innerText.trim(), moves: document.getElementById('play-moves').innerText.replace(/\\s+/g, ' ').trim() };`;
  let r, t0 = Date.now();
  while (Date.now() - t0 < 25000) {
    r = await c.evalP(READ);
    r.replied = r.moves.replace(/\d+\./g, ' ').trim().split(/\s+/).filter(Boolean).length >= 2;
    if (r.replied || r.status.includes('⚠')) break;
    await sleep(300);
  }
  r.ms = Date.now() - t0;
  return r;
}

// The engine switched on in Analysis. Passes when a line with a score shows.
async function analyse(c) {
  await c.evalP(`document.querySelector('#tabbar button[data-screen="analysis"]').click();`);
  await sleep(400);
  await c.evalP(`document.getElementById('ana-engine-toggle').click();`);
  let r, t0 = Date.now();
  while (Date.now() - t0 < 25000) {
    r = { text: await c.evalP(`return document.getElementById('ana-engine-lines').innerText.replace(/\\s+/g, ' ').trim();`) };
    r.scored = /[+−-]\d+\.\d\d|[+-]M\d/.test(r.text);
    if (r.scored || r.text.includes('⚠')) break;
    await sleep(300);
  }
  r.ms = Date.now() - t0;
  return r;
}

async function setup(lang, scheme) {
  const state = { sw: null, hits: [] };
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
    const n = state.hits.filter(h => h === WASM).length;
    const ok = n === 0 && !st.some(x => x.wasm);
    console.log(`${ok ? 'PASS' : 'FAIL'} fresh: new install, nothing tapped - the .wasm was requested ${n} time(s), held in ${wasmIn(st)}; ${versioned(st)[0].count} entries precached`);
    return ok;
  } finally { await c.close(); await web.stop().catch(() => {}); }
}

async function bump(lang, scheme, rescue = false) {
  const { state, web, c } = await setup(lang, scheme);
  const name = `${rescue ? 'rescue' : 'bump'}-${lang}-${scheme}`;
  const [from, to, next] = rescue ? [CACHE_OLD, CACHE_NOW, SW_SRC] : [CACHE_NOW, CACHE_NEXT, SW_SRC.replace(CACHE_NOW, CACHE_NEXT)];
  if (rescue) state.sw = OLD_SW;
  try {
    await c.send('Page.navigate', { url: web.url });
    await settle(c, from);
    await opened(c);
    await c.evalP(`const db = await import('/js/db.js'); await db.kvSet('onboardingDone', true); await db.kvSet('tourDone', true);`);
    await c.send('Page.reload', {});
    await settle(c, from);
    await opened(c);
    const on = await playBot(c);
    if (!on.replied) await shoot(c, name + '-online-noreply');
    await sleep(1500);
    const before = await c.evalP(CACHE_STATE);
    console.log(`     ${name} online first use: bot ${on.replied ? `replied in ${on.ms} ms ("${on.moves}")` : `DID NOT REPLY ("${on.status}")`}; .wasm held in ${wasmIn(before)}`);

    const STALE = '/vendor/made-up-old-engine.wasm';
    if (KEEP_CACHE && !rescue) await c.evalP(`await (await caches.open('${KEEP_CACHE}')).put('${STALE}', new Response('old'));`);
    state.sw = next;
    await c.send('Page.reload', {});
    const after = await settle(c, to);
    const stale = KEEP_CACHE && !rescue ? await c.evalP(`return !!(await (await caches.open('${KEEP_CACHE}')).match('${STALE}'));`) : false;
    const downloads = state.hits.filter(h => h === WASM).length;
    await web.stop();

    await c.send('Page.reload', {});
    if (!await opened(c)) { console.log(`FAIL ${name}: offline reload stuck on splash`); return false; }
    await sleep(800);
    const bot = await playBot(c);
    await sleep(600);
    await shoot(c, name + '-play');
    const ana = await analyse(c);
    await sleep(600);
    await shoot(c, name + '-analysis');
    const ok = bot.replied && ana.scored && downloads === 1 && !stale;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${from} -> ${versioned(after)[0].name}, the .wasm is held in ${wasmIn(after)} (downloaded ${downloads}x in all)${KEEP_CACHE && !rescue ? `; made-up old engine file ${stale ? 'STILL THERE' : 'removed'}` : ''}`);
    console.log(`     offline Play: ${bot.replied ? `bot replied in ${bot.ms} ms - "${bot.moves}"` : `NO REPLY - status "${bot.status}", moves "${bot.moves}"`}`);
    console.log(`     offline Analysis: ${ana.scored ? `evaluation in ${ana.ms} ms - "${ana.text.slice(0, 70)}"` : `NO EVALUATION - "${ana.text.slice(0, 110)}"`}`);
    return ok;
  } finally { await c.close(); await web.stop().catch(() => {}); }
}

const combos = process.env.ONE ? [['en', 'light']] : [['en', 'light'], ['en', 'dark'], ['es', 'light'], ['es', 'dark']];
let bad = 0;
const guard = (label, p) => p.catch(e => { console.log(`FAIL ${label}: ${e.message}`); return false; });
if (!await guard('fresh', fresh())) bad++;
for (const [lang, scheme] of combos) if (!await guard(`bump-${lang}-${scheme}`, bump(lang, scheme))) bad++;
if (KEEP_CACHE && !await guard('rescue-en-light', bump('en', 'light', true))) bad++;
console.log(bad ? `\n${bad} FAILED` : '\nALL PASSED');
process.exit(bad ? 1 : 0);
