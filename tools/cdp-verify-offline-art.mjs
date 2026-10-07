// Headless-Chrome verification that the app's ART — badges, streak flames, Kael,
// avatars — is there with no connection, and still there after a service-worker
// version bump. Dev tool, not shipped. Sister of cdp-verify-offline-open.mjs
// (same Chrome / server / short-profile set-up; see the notes there).
//
//   node tools/cdp-verify-offline-art.mjs <outDir>
//
// ONE=1 keeps it to EN/light. Three scenarios, each a fresh Chrome:
//
//   cold  — online visits only, the Profile tab is never opened; server stopped.
//   seen  — as cold, but every art file is fetched once online first.
//   bump  — as seen, then sw.js is served with CACHE bumped by one (the working
//           tree is not touched), one online visit to update; server stopped.
//
// FROM=<git revision> runs one more scenario instead of those three:
//
//   migrate — as seen, but on the sw.js of that revision (FROM=856bfb7 is v157);
//           then the working tree's sw.js is served as the update. Shows whether
//           art a phone already holds is moved across or downloaded again.
//
// The art list is read from DISK (icons/badges/*.png, icons/kael/*.png,
// streaks/*.png and the top-level avatars/*.png), not from sw.js, so it cannot agree with a wrong list.
//
// TAPPED (as a DOM click): the Profile tab, after the offline reload.
// SEEDED, not tapped: language (localStorage), theme (prefers-color-scheme),
// and in the app's own key-value store onboardingDone, tourDone, avatarId
// 'wolf' and a 40-day streak.
// READ FROM THE PAGE: fetch() of every art file offline (ok or not), and for
// the <img> elements really on screen whether they decoded (naturalWidth > 0).
// Trophy-case images are loading="lazy"; the check switches them to eager so
// the ones below the fold are counted too.
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/cdp-verify-offline-art.mjs <outDir>'); process.exit(1); }
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 900000).unref();

const pngs = dir => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
  .filter(d => d.isFile() && d.name.endsWith('.png')).map(d => `${dir}/${d.name}`);
const ART = { badges: pngs('icons/badges'), flames: pngs('streaks'), avatars: pngs('avatars'), kael: pngs('icons/kael') };
const MY_AVATAR = 'wolf';

const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const CACHE_NOW = SW_SRC.match(/const CACHE = '([^']+)'/)[1];
const CACHE_NEXT = CACHE_NOW.replace(/\d+$/, n => String(+n + 1));
const OLD_SRC = process.env.FROM ? execFileSync('git', ['show', `${process.env.FROM}:sw.js`], { cwd: ROOT, encoding: 'utf8' }) : null;
const OLD_CACHE = OLD_SRC && OLD_SRC.match(/const CACHE = '([^']+)'/)[1];

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
    if (/^\/(icons\/(badges|kael)|streaks|avatars)\//.test(p)) state.artHits++;
    if (p === '/sw.js' && (state.bumped || state.migrate)) {
      res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
      res.end(state.migrate ? (state.bumped ? SW_SRC : OLD_SRC) : SW_SRC.replace(CACHE_NOW, CACHE_NEXT));
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

// Wait until the worker has finished installing: one versioned cache, named
// `want`, and the total number of stored entries (all caches) has stopped moving.
async function settle(c, want) {
  let last = -1, same = 0, st;
  for (let i = 0; i < 120; i++) {
    st = await c.evalP(`
      const all = await caches.keys();
      const names = all.filter(k => k.startsWith('chess-training-center-'));
      let count = 0;
      for (const k of all) count += (await (await caches.open(k)).keys()).length;
      return { names, all, count };`).catch(() => null);
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
    if (hid) return true;
    await sleep(250);
  }
  throw new Error('stuck on splash');
}

// fetch() every art file from the page; returns the ones that did not come back.
const SWEEP = `
  const art = ${JSON.stringify(ART)};
  const out = {};
  for (const [group, files] of Object.entries(art)) {
    const bad = [];
    await Promise.all(files.map(async f => {
      try { const r = await fetch(f); if (!r.ok) bad.push(f); else await r.arrayBuffer(); } catch { bad.push(f); }
    }));
    out[group] = bad;
  }
  return out;`;

async function run(scenario, lang, scheme) {
  const migrate = scenario === 'migrate';
  const state = { bumped: false, artHits: 0, migrate };
  const before = migrate ? OLD_CACHE : CACHE_NOW, after = migrate ? CACHE_NOW : CACHE_NEXT;
  const web = await startServer(state);
  const c = await startChrome();
  const name = `${scenario}-${lang}-${scheme}`;
  try {
    await c.send('Page.enable'); await c.send('Runtime.enable'); await c.send('Network.enable');
    await c.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
    await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1'); } catch {}` });

    await c.send('Page.navigate', { url: web.url });
    await settle(c, before);
    await c.evalP(`
      const db = await import('./js/db.js');
      await db.kvSet('onboardingDone', true); await db.kvSet('tourDone', true);
      await db.kvSet('avatarId', '${MY_AVATAR}');
      await db.kvSet('streakCount', 40); await db.kvSet('bestStreak', 40); await db.kvSet('streakLastDate', '2099-01-01');`);
    await c.send('Page.reload', {});
    await opened(c);
    await settle(c, before);

    if (scenario !== 'cold') {
      const bad = await c.evalP(SWEEP);
      const n = Object.values(bad).flat().length;
      if (n) throw new Error(`${n} art files did not load ONLINE: ${Object.values(bad).flat().slice(0, 5).join(', ')}`);
    }
    let updateHits = null;
    if (scenario === 'bump' || migrate) {
      state.bumped = true;
      state.artHits = 0;
      await c.send('Page.reload', {});
      await settle(c, after);
      updateHits = state.artHits;
    }

    await web.stop();
    await c.send('Network.clearBrowserCache');
    await c.send('Page.reload', {});
    await opened(c);
    await c.evalP(`document.querySelector('button[data-screen="profile"]').click();`);
    await sleep(1500);
    const ui = await c.evalP(`
      document.querySelectorAll('#trophy-case img').forEach(i => { i.loading = 'eager'; });
      await new Promise(r => setTimeout(r, 2500));
      const shown = sel => { const a = [...document.querySelectorAll(sel)]; return a.filter(i => i.complete && i.naturalWidth > 0).length + '/' + a.length; };
      return {
        header: shown('#streak-badge img'),
        avatar: shown('#profile-avatar-wrap img'),
        avatarSrc: (document.querySelector('#profile-avatar-wrap img') || {}).src || '',
        trophies: shown('#trophy-case img'),
        trophyCells: document.querySelectorAll('#trophy-case .badge-cell').length,
        flames: shown('img[src*="streaks/"]'),
        kael: shown('#kael-fab img'),
        screen: (document.querySelector('nav button.active') || {}).dataset?.screen || '',
      };`);
    const bad = await c.evalP(SWEEP);
    const shot = await c.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(shot.data, 'base64'));

    const lost = Object.values(bad).flat();
    const mine = `avatars/${MY_AVATAR}.png`;
    const full = a => { const [x, y] = a.split('/'); return +y > 0 && x === y; };
    const uiOk = full(ui.kael) && full(ui.header) && full(ui.avatar) && ui.avatarSrc.endsWith(mine) && full(ui.flames)
      && full(ui.trophies) && ui.trophies.endsWith('/' + ui.trophyCells);
    const ok = !lost.length && uiOk;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${migrate ? ` (${before} -> ${after})` : ''}: offline fetch OK — badges ${ART.badges.length - bad.badges.length}/${ART.badges.length}, flames ${ART.flames.length - bad.flames.length}/${ART.flames.length}, avatars ${ART.avatars.length - bad.avatars.length}/${ART.avatars.length}${bad.avatars.includes(mine) ? ' (MY AVATAR LOST)' : ''}, Kael ${ART.kael.length - bad.kael.length}/${ART.kael.length}`);
    console.log(`     on screen (decoded/present): header flame ${ui.header}, my avatar ${ui.avatar}, trophy badges ${ui.trophies} of ${ui.trophyCells} cells, flames on Profile ${ui.flames}, Kael button ${ui.kael}`);
    if (updateHits !== null) console.log(`     art files downloaded again by the update: ${updateHits}`);
    return ok;
  } finally {
    await c.close();
    await web.stop().catch(() => {});
  }
}

const combos = process.env.ONE ? [['en', 'light']] : [['en', 'light'], ['en', 'dark'], ['es', 'light'], ['es', 'dark']];
const scenarios = OLD_SRC ? ['migrate'] : process.env.SCENARIO ? [process.env.SCENARIO] : ['cold', 'seen', 'bump'];
let bad = 0;
for (const scenario of scenarios) {
  for (const [lang, scheme] of combos) {
    if (!await run(scenario, lang, scheme).catch(e => { console.log(`FAIL ${scenario}-${lang}-${scheme}: ${e.message}`); return false; })) bad++;
  }
}
console.log(bad ? `\n${bad} FAILED` : '\nALL ART THERE OFFLINE');
process.exit(bad ? 1 : 0);
