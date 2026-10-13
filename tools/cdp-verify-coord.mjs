// Coordinates, the trainer in the Learn tab (js/coord-ui.js, rules in
// js/coord.js). Dev tool, not shipped. Headless Chrome over CDP, signed out,
// no service worker. It serves the app itself.
//
//   node tools/cdp-verify-coord.mjs <outDir>     about three minutes
//
// At 375 x 667 in ES and EN, light and dark. REALLY TAPPED (CDP touch events):
// the Learn list's row, every choice, Start, Finish, the squares and the keys.
// A square is tapped AT THE PLACE ITS NAME SAYS for the side that is below,
// worked out here from the board's rectangle, never looked up by name in the
// page: so "with Black below the squares asked are the right ones" is a real
// check of where a1 is.
// DRAGGED (CDP touch start / move / end on the track): the slider of the
// run's length, to its two ends and to a stop in the middle.
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
// The length (30 s to 3 min) and the empty board: the slider shows the time as
// it moves and saves it when let go; moving it takes "no clock" off; a run of
// 1:30 has a deadline 90 s away (THE DEADLINE THAT WAS SET is read, the tool
// does not wait it out), its bar is at half with 45 s left, and its best is
// kept apart from the 30-second one; ten right answers count the day at any
// length; "without pieces" leaves no piece to see, a right tap still flashes
// green and a wrong one red, and "name" still lights its square; all of it
// is back after a reload. The 30-second run that is waited out for real is
// also the run with every choice untouched: it must behave as before.
// With a result up, the result's line follows the choices: the slider dragged
// to another length says that length's best while it moves (a dash where there
// is none), the other exercise says its own, back on the run's own choices the
// line is the run's again, and Again stays on the screen through all of it.
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
// Not 9300-9899 / 9900-9989: tools/emu-verify-simul.mjs has those.
const PORT = 9100 + Math.floor(Math.random() * 90);
const WEB = 8700 + Math.floor(Math.random() * 90);
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
    // Kael's reminder of the day's missions comes once, 45 s after the page loads,
    // over the lower choices, and a tap on it asks to leave the screen: not here.
    __app.DailyMissions.reminded = true;
    __app.showScreen('endgame'); __app.Endgame.showSections();`);
  await until(`document.getElementById('learn-coord-item')`, 4000);
};
// The slider, dragged by a finger to `frac` of its travel (0 left, 1 right).
const THUMB = 16;
// `pace` is the wait between the eight steps of the drag. A drag of the whole
// track at the usual 25 ms is a flick, and headless Chrome gives no click to the
// tap that follows a flick (seen on the plain set-up at v214 too: pointerup
// arrives, click does not): where a tap comes next, the long drag goes slower.
const slide = async (frac, pace = 25) => {
  const r = await ev(`const e = document.getElementById('coord-seconds'); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect();
    return { l: r.left, w: r.width, y: r.top + r.height / 2, f: (e.value - e.min) / (e.max - e.min) };`);
  const xAt = f => r.l + THUMB / 2 + f * (r.w - THUMB);
  const touch = (type, x) => send('Input.dispatchTouchEvent', { type, touchPoints: x === undefined ? [] : [{ x: Math.round(x), y: Math.round(r.y), id: 1 }] });
  await touch('touchStart', xAt(r.f));
  for (let i = 1; i <= 8; i++) { await touch('touchMove', xAt(r.f + (frac - r.f) * i / 8)); await sleep(pace); }
  const moving = await ev(`return { text: document.getElementById('coord-time-timed').textContent, line: document.getElementById('coord-result-line').textContent, saved: ((await (await import('/js/db.js')).kvGet('coordPrefs', null)) || {}).seconds };`);
  await touch('touchEnd');
  await sleep(200);
  return moving;
};
const len = () => ev(`const e = document.getElementById('coord-seconds'); return { value: +e.value, text: document.getElementById('coord-time-timed').textContent, label: document.getElementById('coord-best-label').textContent,
  best: document.getElementById('coord-best').textContent, time: __coord.prefs.time, dim: document.getElementById('coord-len').classList.contains('locked'), saved: ((await (await import('/js/db.js')).kvGet('coordPrefs', null)) || {}) };`);
const seen = () => ev(`const i = [...document.querySelectorAll('#coord-board img')]; return { all: i.length, seen: i.filter(x => getComputedStyle(x).visibility !== 'hidden').length };`);
// The result's line, and whether Again is still on the screen under it. The
// tool's own slide() and tap() bring what they touch to the middle of the
// screen, so the page is put back at its top first: what is measured is the
// screen as it is with nothing scrolled.
const line = () => ev(`document.querySelector('main').scrollTo({ top: 0, behavior: 'instant' }); await new Promise(r => setTimeout(r, 120));
  const s = document.getElementById('coord-start').getBoundingClientRect(), l = document.getElementById('coord-result-line');
  return { text: l.textContent, rows: Math.round(l.getBoundingClientRect().height / parseFloat(getComputedStyle(l).lineHeight)), up: !document.getElementById('coord-result').classList.contains('hidden'),
    card: document.getElementById('coord-best-row').classList.contains('hidden'), again: document.getElementById('coord-start').textContent, bottom: Math.round(s.bottom), inner: innerHeight, top: document.querySelector('main').scrollTop };`);
const onScreen = x => x.up && x.card && x.rows === 1 && x.bottom <= x.inner && x.top === 0;
const BEST_AT = { es: 'Tu mejor marca en ', en: 'Your best in ' }, BEST_N = { es: 'Tu mejor marca: ', en: 'Your best: ' }, NEW_BEST = { es: '¡Nueva mejor marca!', en: 'New personal best!' }, AGAIN = { es: 'Otra vez', en: 'Again' };
const BEST_KEYS = ['Find', 'Name'].flatMap(m => ['', 60, 90, 120, 150, 180].map(s => 'coordBest' + m + s));
const choose = async (mode, time, side) => {
  await tap(`#coord-mode [data-v="${mode}"]`);
  await tap(`#coord-time [data-v="${time}"]`);
  await tap(`#coord-side-seg [data-v="${side}"]`);
};
const TITLE = { es: 'Coordenadas', en: 'Coordinates' };

// Not published: read off the source, since the tool is signed out.
const fb = fs.readFileSync(path.join(ROOT, 'js/firebase.js'), 'utf8');
const synced = fb.slice(fb.indexOf('const SYNCED_KEYS'), fb.indexOf('];', fb.indexOf('const SYNCED_KEYS')));
check('the twelve bests (two exercises, six lengths) are in SYNCED_KEYS', BEST_KEYS.length === 12 && BEST_KEYS.every(k => synced.includes(`'${k}'`)));
check('... and "coordBest" is nowhere else in js/firebase.js (nothing published)', fb.split('coordBest').length - 1 === 12 && synced.split('coordBest').length - 1 === 12);
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
      for (const k of ${JSON.stringify(BEST_KEYS)}) await db.kvSet(k, null);
      await db.kvSet('coordPrefs', null);`);
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
    check(`[${tag}] the setup: find, the clock, random, with pieces; no best yet; no text missing`, setup.best === '—' && setup.result && setup.on.join() === 'find,timed,random,on' && setup.empty === 0, setup);
    const first = await len();
    check(`[${tag}] untouched, the slider is on 30 seconds and every line says so`, first.value === 30 && first.text.includes('0:30') && first.label.includes('0:30') && !first.dim, first);
    const room = await ev(`const s = document.getElementById('coord-start').getBoundingClientRect(), m = document.querySelector('main'); return { bottom: Math.round(s.bottom), inner: innerHeight, top: m.scrollTop };`);
    check(`[${tag}] Start is on the screen with nothing scrolled`, room.bottom <= room.inner && room.top === 0, room);
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
    const pcs = await seen();
    check(`[${tag}] untouched, the board has its 32 pieces`, pcs.all === 32 && pcs.seen === 32, pcs);
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
    const bar = await ev(`return { w: parseFloat(document.getElementById('coord-bar-fill').style.width), left: __coord.deadline - Date.now(), seconds: __coord.run.seconds }`);
    check(`[${tag}] the run is 30 seconds long and the bar is where the time is (${bar.w.toFixed(0)}% with ${(bar.left / 1000).toFixed(1)} s left)`, bar.seconds === 30 && Math.abs(bar.w - bar.left / 300) < 2, bar);
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
    const fold = await ev(`const s = document.getElementById('coord-start').getBoundingClientRect(); return { row: document.getElementById('coord-best-row').classList.contains('hidden'), bar: document.getElementById('coord-bar-fill').style.width, bottom: Math.round(s.bottom), inner: innerHeight, top: document.querySelector('main').scrollTop };`);
    check(`[${tag}] the bar ran empty; with the result up the best is said in its line and Again is on the screen, nothing scrolled`, parseFloat(fold.bar) === 0 && fold.row && fold.bottom <= fold.inner && fold.top === 0, fold);
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
    const low = await ev(`return { score: document.getElementById('coord-result-score').textContent, best: document.getElementById('coord-best').textContent, isBest: document.getElementById('coord-result').classList.contains('best'), streak: window.__streak, line: document.getElementById('coord-result-line').textContent };`);
    check(`[${tag}] a run of 1 does not replace the best, and does not count the day`, low.score === '1' && low.best === '11' && !low.isBest && low.streak === 1 && (await kv('coordBestFind')) === 11, low);
    check(`[${tag}] ... and its line says what the best is`, / 11$/.test(low.line), low.line);

    // ── with the result up, its line follows the choices ──
    let rm = await slide(0.4), rl = await line();
    check(`[${tag}] with the result up, the slider dragged to 1:30 says that length's best while it moves: none, a dash`, rm.line.endsWith(BEST_AT[lang] + '1:30: —') && rl.text === rm.line && rl.text.includes(': 1 '), { rm, rl });
    check(`[${tag}] ... the result stays, the card stays away, the line is one line and "${AGAIN[lang]}" is on the screen, nothing scrolled`, onScreen(rl) && rl.again === AGAIN[lang], rl);
    await shot(`${tag}-5b-result-slider-130`);
    await slide(0);
    rl = await line();
    check(`[${tag}] dragged back to the run's own length the line is the run's again`, rl.text.endsWith(BEST_N[lang] + '11') && !rl.text.includes('0:30') && onScreen(rl), rl);
    await tap('#coord-mode [data-v="name"]');
    rl = await line();
    check(`[${tag}] the other exercise, really tapped, says its own best at this length: none, a dash`, rl.text.endsWith(BEST_AT[lang] + '0:30: —') && onScreen(rl), rl);
    await shot(`${tag}-5c-result-other-exercise`);
    await tap('#coord-mode [data-v="find"]');
    rl = await line();
    check(`[${tag}] ... and back on the exercise that was run, the run's line again`, rl.text.endsWith(BEST_N[lang] + '11') && onScreen(rl), rl);

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

    // ── the length of a run ──
    let m = await slide(1);
    let l = await len();
    check(`[${tag}] the slider, dragged to its right end, shows 3:00 while it moves and saves it only when let go`, m.text.includes('3:00') && m.saved !== 180 && l.value === 180 && l.text.includes('3:00') && l.saved.seconds === 180, { m, l });
    check(`[${tag}] ... moving it takes "no clock" off, and the best asked about is the 3-minute one: none yet`, l.time === 'timed' && l.saved.time === 'timed' && !l.dim && l.label.includes('3:00'), l);
    await slide(0);
    l = await len();
    check(`[${tag}] dragged to its left end it shows 0:30`, l.value === 30 && l.text.includes('0:30') && l.saved.seconds === 30, l);
    await slide(0.4);
    l = await len();
    check(`[${tag}] dragged to the stop in the middle it shows 1:30`, l.value === 90 && l.text.includes('1:30') && l.label.includes('1:30') && l.saved.seconds === 90, l);
    await shot(`${tag}-8-setup-130`);
    await tap('#coord-time [data-v="free"]');
    l = await len();
    check(`[${tag}] "no clock" dims the slider and keeps its place`, l.time === 'free' && l.dim && l.value === 90, l);
    await tap('#coord-time [data-v="timed"]');

    // ── without pieces, for a minute and a half ──
    await tap('#coord-pieces [data-v="off"]');
    check(`[${tag}] "without pieces" is chosen and saved`, (await len()).saved.pieces === 'off' && await ev(`return document.querySelector('#coord-pieces button.on').dataset.v;`) === 'off');
    room.again = await ev(`const s = document.getElementById('coord-start').getBoundingClientRect(); return Math.round(s.bottom);`);
    await tap('#coord-start');
    await until(`__coord.running`, 3000);
    const long = await ev(`return { seconds: __coord.run.seconds, left: __coord.deadline - Date.now(), clock: document.getElementById('coord-clock').textContent, w: parseFloat(document.getElementById('coord-bar-fill').style.width) };`);
    check(`[${tag}] the run is 1:30 long: the deadline is 90 s away, the clock says so, the bar is full`, long.seconds === 90 && long.left > 88000 && long.left <= 90000 && /1:(30|29)/.test(long.clock) && long.w > 97, long);
    const none = await seen();
    check(`[${tag}] without pieces there is no piece to see on the board`, none.seen === 0, none);
    f = await fits();
    check(`[${tag}] ... and nothing scrolls`, f.scroll <= f.client && f.wide, f);
    s = await st();
    await touchAt(await sqPoint(s.asked, 'w'), 30, 40);
    const green = await ev(`return [...document.querySelectorAll('#coord-board .sq.coord-right')].map(e => e.dataset.sq);`);
    a = await st();
    check(`[${tag}] a right tap on the empty board scores and flashes green`, a.score === 1 && green.join() === s.asked && a.asked === s.next, { a, green });
    await sleep(350);
    await touchAt(await sqPoint(other(a.asked), 'w'), 30, 40);
    const red2 = await ev(`return [...document.querySelectorAll('#coord-board .sq.coord-wrong')].map(e => e.dataset.sq);`);
    await shot(`${tag}-9-empty-wrong`);
    w = await st();
    check(`[${tag}] a wrong tap on the empty board scores nothing and flashes red`, w.score === 1 && w.wrong === 1 && red2.join() === other(a.asked), { w, red2 });
    for (let i = 0; i < 9; i++) { const now = await st(); await sqTap(now.asked, 'w'); }
    // Half of this run's time: 45 seconds.
    await ev(`__coord.deadline = Date.now() + 45000; __coord.tick();`);
    const half = await ev(`return { w: parseFloat(document.getElementById('coord-bar-fill').style.width), clock: document.getElementById('coord-clock').textContent, score: __coord.run.score };`);
    check(`[${tag}] with 45 s left of 90 the bar is at half and the clock reads 0:45`, Math.abs(half.w - 50) < 1.5 && /0:4[45]/.test(half.clock) && half.score === 10, half);
    await ev(`__coord.deadline = Date.now() + 300;`);
    await until(`!__coord.running`, 3000);
    await sleep(150);
    const r90 = await ev(`return { score: document.getElementById('coord-result-score').textContent, isBest: document.getElementById('coord-result').classList.contains('best'), streak: window.__streak };`);
    check(`[${tag}] ten right answers in 1:30 are that length's best, and the 30-second best is still 11`, r90.score === '10' && r90.isBest && (await kv('coordBestFind90')) === 10 && (await kv('coordBestFind')) === 11, r90);
    check(`[${tag}] ... and ten count the day at this length as at 30 seconds`, r90.streak === 2, r90.streak);
    await shot(`${tag}-10-result-130`);
    check(`[${tag}] Start stayed on the screen with every choice changed`, room.again <= room.inner, room);
    // The result of the 1:30 run is up, a new best: the line follows from there too.
    rl = await line();
    check(`[${tag}] the 1:30 result's own line says it is a new best`, rl.text.endsWith(NEW_BEST[lang]) && rl.bottom <= rl.inner && rl.top === 0, rl);
    rm = await slide(0);
    rl = await line();
    check(`[${tag}] the slider dragged to 0:30 says the 30-second best, 11, while it moves and after`, rm.line.endsWith(BEST_AT[lang] + '0:30: 11') && rl.text === rm.line && rl.text.includes(': 10 '), { rm, rl });
    check(`[${tag}] ... and "${AGAIN[lang]}" is still on the screen, nothing scrolled`, onScreen(rl), rl);
    await shot(`${tag}-10b-result-slider-030`);
    await slide(1, 120);
    rl = await line();
    check(`[${tag}] dragged to 3:00, where there is no best, a dash`, rl.text.endsWith(BEST_AT[lang] + '3:00: —') && onScreen(rl), rl);
    await tap('#coord-mode [data-v="name"]');
    await slide(0, 120);
    rl = await line();
    check(`[${tag}] the other exercise at 0:30 says ITS best, 1, not the 11`, rl.text.endsWith(BEST_AT[lang] + '0:30: 1') && onScreen(rl), rl);
    await shot(`${tag}-10c-result-other-exercise`);
    await tap('#coord-mode [data-v="find"]');
    await slide(0.4);
    rl = await line();
    check(`[${tag}] back on 1:30 and the exercise that was run, it is the new best again`, rl.text.endsWith(NEW_BEST[lang]) && rl.bottom <= rl.inner && rl.top === 0 && (await len()).saved.seconds === 90, rl);
    // CALLED, not tapped: the longest line there can be (three figures everywhere).
    const wide = await ev(`const c = __coord, keep = { ...c.last }, b = c.best.coordBestFind150; Object.assign(c.last, { score: 188, wrong: 188 }); c.best.coordBestFind150 = 188; c.prefs.seconds = 150; c.paintSetup(); document.querySelector('main').scrollTo({ top: 0, behavior: 'instant' });
      const s = document.getElementById('coord-start').getBoundingClientRect(), out = { text: document.getElementById('coord-result-line').textContent, bottom: Math.round(s.bottom), inner: innerHeight, top: document.querySelector('main').scrollTop };
      c.last = keep; c.best.coordBestFind150 = b; c.prefs.seconds = 90; c.paintSetup(); return out;`);
    check(`[${tag}] with three figures everywhere the line may fold, and "${AGAIN[lang]}" still ends on the screen`, wide.text.includes('2:30: 188') && wide.bottom <= wide.inner && wide.top === 0, wide);
    // "name" on the empty board: the square asked is still lit.
    await tap('#coord-mode [data-v="name"]');
    await tap('#coord-start');
    await until(`__coord.running && __coord.run.mode === 'name'`, 3000);
    s = await st();
    const litE = await ev(`return [...document.querySelectorAll('#coord-board .sq.coord-lit')].map(e => e.dataset.sq);`);
    check(`[${tag}] "name" without pieces: no piece, and the square asked is lit`, (await seen()).seen === 0 && litE.join() === s.asked, litE);
    await shot(`${tag}-11-name-empty`);
    await tap('#coord-end');
    await sleep(150);
    await tap('#coord-mode [data-v="find"]');

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
    l = await len();
    check(`[${tag}] after a reload: no explanation again, the last choices are back (1:30 and no pieces too), that length's best is 10`, !again.intro && again.on.join() === 'find,timed,w,off' && l.value === 90 && l.text.includes('1:30') && l.label.includes('1:30') && again.best === '10', { again, l });
    await tap('#coord-start');
    await until(`__coord.running`, 3000);
    const back = await ev(`return { seconds: __coord.run.seconds, left: __coord.deadline - Date.now() };`);
    check(`[${tag}] ... and a run started now is 1:30 long, without pieces`, back.seconds === 90 && back.left > 88000 && (await seen()).seen === 0, back);
    await ev(`__coord.stop();`);
    await slide(0);
    check(`[${tag}] back at 0:30 the best shown is the 30-second one: 11`, (await len()).best === '11');
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
