// Coordinates, the trainer in the Learn tab (js/coord-ui.js, rules in
// js/coord.js). Dev tool, not shipped. Headless Chrome over CDP, signed out,
// no service worker. It serves the app itself.
//
//   node tools/cdp-verify-coord.mjs <outDir>     about two minutes
//
// At 375 x 667 in ES and EN, light and dark. REALLY TAPPED (CDP touch events):
// the Learn list's row, every choice, Start, Finish, the squares and the keys.
// A square is tapped AT THE PLACE ITS NAME SAYS for the side that is below,
// worked out here from the board's rectangle, never looked up by name in the
// page: so "with Black below the squares asked are the right ones" is a real
// check of where a1 is.
// CALLED, not tapped: showScreen() to get to Learn and to walk away from a
// run; and, after the first round has waited out a real 30 seconds, the run's
// deadline is brought forward so the other rounds do not wait again.
// Checked: Kael explains once; the board's labels are hidden; nothing scrolls
// during a run; a right answer scores and moves on; a wrong one scores nothing,
// keeps the square and flashes red; the clock ends the run (the real 30 s,
// timed here); the best is saved, shown, kept after a reload, and not replaced
// by a lower score; the day counts at 10 right answers and not below; "name"
// lights the asked square, takes a letter then a number, and keeps its own
// best; with no clock there is no clock, and Finish ends it with no best and
// no day counted; leaving the tab drops the run; the best is in SYNCED_KEYS
// and nowhere near anything published.
// NOT checked here: sync to Firestore (the tool is signed out).
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/cdp-verify-coord.mjs <outDir>'); process.exit(1); }
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const WEB = 9900 + Math.floor(Math.random() * 90);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-coord-'));
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 400000).unref();

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  if (p === '/sw.js') { res.writeHead(404).end(); return; }
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
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
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });

let ws, msgId = 0;
const pending = new Map(), errors = [];
const send = (method, params = {}) => { const id = ++msgId; ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => pending.set(id, { res, rej })); };
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: `(async()=>{ ${expr} })()`, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
  return r.result.value;
};
for (let i = 0; i < 40; i++) {
  try { const page = (await getJSON(`http://127.0.0.1:${PORT}/json`)).find(t => t.type === 'page'); if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; } } catch {}
  await sleep(250);
}
await new Promise(r => ws.on('open', r));
ws.on('message', m => {
  const msg = JSON.parse(m);
  if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result); }
  else if (msg.method === 'Runtime.exceptionThrown') errors.push('EXC ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push('CON ' + msg.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') errors.push('LOG ' + (msg.params.entry.text + ' ' + (msg.params.entry.url || '')).slice(0, 300));
});
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok }); console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); };
const shot = async name => fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
const until = async (expr, ms = 8000) => { for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (await ev(`return !!(${expr});`)) return true; await sleep(60); } return false; };
const touchAt = async (pt, hold = 30, after = 110) => {
  const touch = (type, p) => send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }] : [] });
  await touch('touchStart', pt); await sleep(hold); await touch('touchEnd'); await sleep(after);
};
const tap = async sel => {
  const pt = await ev(`const e = document.querySelector(${JSON.stringify(sel)}); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
  await sleep(80);
  const now = await ev(`const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
  await touchAt(now || pt, 40, 220);
};
// Where a square IS for the side below, from the board's rectangle alone.
// White below: a1 bottom-left. Black below: a1 top-right.
const sqPoint = async (name, side) => {
  const b = await ev(`const r = document.getElementById('coord-board').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height };`);
  const f = 'abcdefgh'.indexOf(name[0]), r = +name[1] - 1, s = b.w / 8;
  const col = side === 'w' ? f : 7 - f, row = side === 'w' ? 7 - r : r;
  return { x: b.l + col * s + s / 2, y: b.t + row * s + s / 2, square: Math.abs(b.w - b.h) < 1 };
};
const sqTap = async (name, side) => touchAt(await sqPoint(name, side));
const st = () => ev(`const c = __coord, r = c.run; return { running: c.running, score: r && r.score, wrong: r && r.wrong, asked: r && r.asked, next: r && r.next, ori: r && r.orientation, entry: c.entry,
  shown: document.getElementById('coord-ask-sq').textContent, nextShown: document.getElementById('coord-ask-next').textContent };`);
const fits = () => ev(`const m = document.querySelector('main'); return { scroll: m.scrollHeight, client: m.clientHeight, wide: document.documentElement.scrollWidth <= innerWidth };`);
const other = sq => (sq === 'a1' ? 'h8' : 'a1');
const kv = key => ev(`const db = await import('/js/db.js'); return await db.kvGet(${JSON.stringify(key)}, null);`);
// Loads the page and puts the app's modules where the checks can read them.
const boot = async () => {
  await send('Page.reload', {});
  await sleep(2500);
  await ev(`document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove());
    window.__app = await import('/js/app.js'); window.__coord = (await import('/js/coord-ui.js')).CoordUI;
    // The streak is watched, not run: its celebration would cover the screen.
    window.__streak = 0; __app.Streak.recordActivity = () => { window.__streak++; };
    __app.showScreen('endgame'); __app.Endgame.showSections();`);
  await until(`document.getElementById('learn-coord-item')`, 4000);
};
const choose = async (mode, time, side) => {
  await tap(`#coord-mode [data-v="${mode}"]`);
  await tap(`#coord-time [data-v="${time}"]`);
  await tap(`#coord-side-seg [data-v="${side}"]`);
};
const TITLE = { es: 'Coordenadas', en: 'Coordinates' };

// Not published: read off the source, since the tool is signed out.
const fb = fs.readFileSync(path.join(ROOT, 'js/firebase.js'), 'utf8');
const synced = fb.slice(fb.indexOf('const SYNCED_KEYS'), fb.indexOf('];', fb.indexOf('const SYNCED_KEYS')));
check('the two bests are in SYNCED_KEYS', synced.includes("'coordBestFind'") && synced.includes("'coordBestName'"));
check('... and "coordBest" is nowhere else in js/firebase.js (nothing published)', fb.split('coordBest').length - 1 === 2);
check('firestore.rules does not mention coord', !/coord/i.test(fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8')));

let failed = false, waited = false;
try {
  for (const [lang, scheme] of [['es', 'light'], ['es', 'dark'], ['en', 'light'], ['en', 'dark']]) {
    const tag = `${lang}-${scheme}`;
    console.log(`\n── ${tag} ──`);
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await send('Page.navigate', { url: `http://localhost:${WEB}/` });
    await sleep(1200);
    await ev(`localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1'); localStorage.removeItem('coordIntroDone');
      const db = await import('/js/db.js');
      await db.kvSet('coordBestFind', null); await db.kvSet('coordBestName', null); await db.kvSet('coordPrefs', null);`);
    await boot();

    // ── the Learn list, Kael, the setup ──
    check(`[${tag}] Learn has a Coordinates row, named in this language`, await ev(`return document.querySelector('#learn-coord-item b').textContent;`) === TITLE[lang]);
    await shot(`${tag}-0-learn`);
    await tap('#learn-coord-item');
    check(`[${tag}] the row, really tapped, opens the section`, await until(`!document.getElementById('coord-view').classList.contains('hidden') && document.getElementById('endgame-sections-view').classList.contains('hidden')`, 4000));
    check(`[${tag}] the first time, Kael explains it`, await until(`document.querySelector('.modal-box #coord-intro-ok')`, 3000));
    await shot(`${tag}-1-intro`);
    await tap('#coord-intro-ok');
    check(`[${tag}] ... and it is remembered`, await until(`!document.querySelector('.modal-back') && localStorage.getItem('coordIntroDone') === '1'`, 2000));
    const setup = await ev(`return { best: document.getElementById('coord-best').textContent, result: document.getElementById('coord-result').classList.contains('hidden'),
      on: [...document.querySelectorAll('#coord-setup .seg button.on')].map(b => b.dataset.v), empty: [...document.querySelectorAll('#coord-setup [data-i18n]')].filter(e => !e.textContent.trim()).length };`);
    check(`[${tag}] the setup: find, 30 seconds, random; no best yet; no text missing`, setup.best === '—' && setup.result && setup.on.join() === 'find,timed,random' && setup.empty === 0, setup);
    check(`[${tag}] the setup fits the width`, (await fits()).wide);
    await shot(`${tag}-2-setup`);

    // ── find the square, Black below, against the clock ──
    await choose('find', 'timed', 'b');
    const t0 = Date.now();
    await tap('#coord-start');
    check(`[${tag}] Start begins a run with Black below`, await until(`__coord.running && __coord.run.orientation === 'b'`, 3000));
    let s = await st();
    const look = await ev(`return { coords: getComputedStyle(document.querySelector('#coord-board .coords')).display, keys: document.getElementById('coord-keys').classList.contains('hidden'),
      kael: getComputedStyle(document.getElementById('kael-corner')).opacity, side: document.getElementById('coord-side').textContent, clock: document.getElementById('coord-clock').textContent };`);
    check(`[${tag}] the board's a-h / 1-8 labels are hidden during a run`, look.coords === 'none', look.coords);
    check(`[${tag}] the name asked and the next one are on the screen`, /^[a-h][1-8]$/.test(s.shown) && s.shown === s.asked && s.nextShown.includes(s.next) && s.next !== s.asked, s);
    check(`[${tag}] the clock shows, no keys, the side is said`, /0:(30|29)/.test(look.clock) && look.keys && look.side.length > 5, look);
    // His corner fades out over a third of a second.
    check(`[${tag}] Kael's corner is put away for the run`, await until(`getComputedStyle(document.getElementById('kael-corner')).opacity === '0'`, 1500));
    let f = await fits();
    check(`[${tag}] nothing scrolls during a find run`, f.scroll <= f.client && f.wide, f);
    await shot(`${tag}-3-find-black`);
    // The place worked out here is the square the page has there.
    const pt = await sqPoint(s.asked, 'b');
    const under = await ev(`return document.elementFromPoint(${pt.x}, ${pt.y}).closest('.sq')?.dataset.sq;`);
    check(`[${tag}] with Black below, ${s.asked} is where a board seen from Black's side has it`, under === s.asked && pt.square, { under, asked: s.asked });
    await sqTap(s.asked, 'b');
    let a = await st();
    check(`[${tag}] a right answer scores one and the waiting square is asked`, a.score === 1 && a.wrong === 0 && a.asked === s.next && a.shown === s.next, a);
    // A wrong tap.
    await touchAt(await sqPoint(other(a.asked), 'b'), 30, 40);
    const red = await ev(`return document.querySelectorAll('#coord-board .sq.coord-wrong').length;`);
    await shot(`${tag}-4-find-wrong`);
    await sleep(120);
    let w = await st();
    check(`[${tag}] a wrong answer: no point, the same square stays, the tapped square flashes red`, w.score === 1 && w.wrong === 1 && w.asked === a.asked && w.shown === a.asked && red === 1, { ...w, red });
    // Ten more right ones: eleven in all.
    for (let i = 0; i < 10; i++) { const now = await st(); await sqTap(now.asked, 'b'); }
    w = await st();
    check(`[${tag}] eleven right answers, each tapped where its name says`, w.score === 11 && w.wrong === 1, w);
    if (!waited) {
      // The real thirty seconds, once.
      const ended = await until(`!__coord.running`, 34000);
      const took = (Date.now() - t0) / 1000;
      check(`[${tag}] the clock ends the run by itself, after 30 seconds (took ${took.toFixed(1)})`, ended && took > 29 && took < 32.5, took);
      waited = true;
    } else {
      await ev(`__coord.deadline = Date.now() + 400;`);
      check(`[${tag}] the clock ends the run by itself (deadline brought forward)`, await until(`!__coord.running`, 3000));
    }
    await sleep(200);
    const res = await ev(`return { hidden: document.getElementById('coord-result').classList.contains('hidden'), score: document.getElementById('coord-result-score').textContent,
      best: document.getElementById('coord-best').textContent, isBest: document.getElementById('coord-result').classList.contains('best'), title: document.getElementById('coord-result-title').textContent,
      line: document.getElementById('coord-result-line').textContent, running: document.body.classList.contains('coord-running'), setup: !document.getElementById('coord-setup').classList.contains('hidden'), streak: window.__streak };`);
    check(`[${tag}] the result: 11, a new best, shown on the setup`, !res.hidden && res.score === '11' && res.best === '11' && res.isBest && res.setup && !res.running && res.line.includes('11') && res.line.includes('1'), res);
    check(`[${tag}] the best is saved (coordBestFind = 11) and the day counted once`, (await kv('coordBestFind')) === 11 && res.streak === 1, res.streak);
    await shot(`${tag}-5-result`);

    // ── a lower score ──
    await tap('#coord-start');
    await until(`__coord.running`, 3000);
    s = await st();
    await sqTap(s.asked, 'b');
    await ev(`__coord.deadline = Date.now() + 300;`);
    await until(`!__coord.running`, 3000);
    await sleep(150);
    const low = await ev(`return { score: document.getElementById('coord-result-score').textContent, best: document.getElementById('coord-best').textContent, isBest: document.getElementById('coord-result').classList.contains('best'), streak: window.__streak };`);
    check(`[${tag}] a run of 1 does not replace the best, and does not count the day`, low.score === '1' && low.best === '11' && !low.isBest && low.streak === 1 && (await kv('coordBestFind')) === 11, low);

    // ── name the square, White below ──
    await choose('name', 'timed', 'w');
    check(`[${tag}] "name" has its own best: none yet`, await ev(`return document.getElementById('coord-best').textContent;`) === '—');
    await tap('#coord-start');
    await until(`__coord.running && __coord.run.mode === 'name'`, 3000);
    s = await st();
    const lit = await ev(`const l = [...document.querySelectorAll('#coord-board .sq.coord-lit')]; const r = l[0]?.getBoundingClientRect();
      return { n: l.length, sq: l[0]?.dataset.sq, x: r && r.left + r.width / 2, y: r && r.top + r.height / 2, keys: !document.getElementById('coord-keys').classList.contains('hidden'),
        shown: document.getElementById('coord-ask-sq').textContent, coords: getComputedStyle(document.querySelector('#coord-board .coords')).display };`);
    const want = await sqPoint(s.asked, 'w');
    check(`[${tag}] one square is lit, the one asked, where White's side has it; its name is not shown`, lit.n === 1 && lit.sq === s.asked && Math.abs(lit.x - want.x) < 2 && Math.abs(lit.y - want.y) < 2 && !lit.shown.includes(s.asked) && lit.coords === 'none', { lit, asked: s.asked });
    f = await fits();
    check(`[${tag}] the two rows of keys are there and nothing scrolls`, lit.keys && f.scroll <= f.client && f.wide, f);
    const keysIn = await ev(`const k = [...document.querySelectorAll('#coord-keys button')].map(b => b.getBoundingClientRect()); return k.length === 16 && k.every(r => r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && r.width >= 36 && r.height >= 40);`);
    check(`[${tag}] all sixteen keys are on the screen and big enough to tap`, keysIn);
    await tap(`#coord-keys [data-k="${s.asked[0]}"]`);
    a = await st();
    check(`[${tag}] the letter, really tapped, is taken and shown`, a.entry === s.asked[0] && a.shown.startsWith(s.asked[0]) && a.score === 0, a);
    await shot(`${tag}-6-name-white`);
    await tap(`#coord-keys [data-k="${s.asked[1]}"]`);
    a = await st();
    check(`[${tag}] ... and the number completes a right name: one point, a new square lit`, a.score === 1 && a.asked === s.next && a.entry === '' && await ev(`return document.querySelector('#coord-board .sq.coord-lit').dataset.sq;`) === s.next, a);
    const bad = other(a.asked);
    await tap(`#coord-keys [data-k="${bad[0]}"]`);
    await tap(`#coord-keys [data-k="${bad[1]}"]`);
    w = await st();
    check(`[${tag}] a wrong name: no point, the same square stays lit`, w.score === 1 && w.wrong === 1 && w.asked === a.asked, w);
    await ev(`__coord.deadline = Date.now() + 300;`);
    await until(`!__coord.running`, 3000);
    await sleep(150);
    check(`[${tag}] its best is kept apart: coordBestName = 1, coordBestFind still 11`, (await kv('coordBestName')) === 1 && (await kv('coordBestFind')) === 11);

    // ── no clock ──
    await choose('find', 'free', 'w');
    await tap('#coord-start');
    await until(`__coord.running`, 3000);
    const free = await ev(`return { clock: document.getElementById('coord-clock').classList.contains('hidden'), bar: document.getElementById('coord-bar').classList.contains('hidden'), timer: __coord.timer };`);
    check(`[${tag}] with no clock there is no clock and no bar`, free.clock && free.bar && free.timer === null, free);
    for (let i = 0; i < 12; i++) { const now = await st(); await sqTap(now.asked, 'w'); }
    w = await st();
    check(`[${tag}] twelve right answers with White below`, w.score === 12, w);
    await shot(`${tag}-7-free`);
    await tap('#coord-end');
    await sleep(150);
    const fin = await ev(`return { running: __coord.running, score: document.getElementById('coord-result-score').textContent, best: document.getElementById('coord-best').textContent, isBest: document.getElementById('coord-result').classList.contains('best'), streak: window.__streak };`);
    check(`[${tag}] Finish ends it: 12 shown, the best is still 11, the day is not counted again`, !fin.running && fin.score === '12' && fin.best === '11' && !fin.isBest && fin.streak === 1, fin);

    // ── leaving ──
    await tap('#coord-start');
    await until(`__coord.running`, 3000);
    await ev(`__app.showScreen('puzzles');`);
    await sleep(200);
    const left = await ev(`return { running: __coord.running, timer: __coord.timer, body: document.body.classList.contains('coord-running'), on: document.getElementById('screen-endgame').classList.contains('coord-on') };`);
    check(`[${tag}] leaving the tab drops the run`, !left.running && left.timer === null && !left.body && !left.on, left);
    await ev(`__app.showScreen('endgame');`);
    await sleep(150);
    await tap('#coord-back');
    check(`[${tag}] Back, really tapped, returns to the Learn list`, await until(`!document.getElementById('endgame-sections-view').classList.contains('hidden') && document.getElementById('coord-view').classList.contains('hidden')`, 3000));

    // ── after a reload ──
    await boot();
    await tap('#learn-coord-item');
    await until(`!document.getElementById('coord-view').classList.contains('hidden')`, 4000);
    await sleep(400);
    const again = await ev(`return { intro: !!document.querySelector('#coord-intro-ok'), on: [...document.querySelectorAll('#coord-setup .seg button.on')].map(b => b.dataset.v), best: document.getElementById('coord-best').textContent };`);
    check(`[${tag}] after a reload: no explanation again, the last choices are back, the best is still 11`, !again.intro && again.on.join() === 'find,free,w' && again.best === '11', again);
    await tap('#coord-mode [data-v="name"]');
    check(`[${tag}] ... and the other exercise's best is still 1`, await ev(`return document.getElementById('coord-best').textContent;`) === '1');
  }
} catch (e) { failed = true; console.error('\nSTOPPED: ' + e.message); }

const bad = checks.filter(c => !c.ok);
console.log(`\n${checks.length - bad.length} of ${checks.length} checks passed${bad.length ? ' — FAILED: ' + bad.map(c => c.name).join(' | ') : ''}`);
// App Check cannot answer on localhost (403) and sw.js is refused on purpose (404).
const rest = errors.filter(e => !/firebaseappcheck|AppCheck|app-check|bad HTTP response code \(404\) was received when fetching the script|status of 403/i.test(e));
console.log(rest.length ? `Console errors (${rest.length}):\n  ` + [...new Set(rest)].join('\n  ') : 'No console errors (other than App Check and the refused service worker).');
chrome.kill();
server.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(failed || bad.length ? 1 : 0);
