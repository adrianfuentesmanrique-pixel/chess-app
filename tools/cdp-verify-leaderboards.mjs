// The five leaderboards (v189): Puzzle, Blindfold and Sealed Moves ELO on the
// top row, Puzzle Rush 3 and 5 min under them, on the global leaderboard and on
// the friends one. Dev tool, not shipped. Headless Chrome over CDP, signed out,
// no service worker.
//
//   node tools/cdp-verify-leaderboards.mjs <outDir>     about one minute
//
// At 375 x 667 in ES and EN, light and dark. REALLY TAPPED (CDP touch events):
// every board button and the period switch, on both screens.
// Checked: two rows of three and two, no label cut, every button inside the
// screen; each tap sets the field the query sorts on (Leaderboard.sortField(),
// the value handed to fetchLeaderboard); the period switch shows only on the Rush boards and goes back to
// "All time" when a Rush board is left; rows painted from made-up players sort
// on the board's field; a friend with no Sealed Moves rating shows a dash, last.
// NOT checked here: that calcElo reaches the public document (signed out), the
// query itself reaching Firestore (App Check refuses this tool, so no request
// for rows ever leaves it), and real rows from the server.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/cdp-verify-leaderboards.mjs <outDir>'); process.exit(1); }
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const WEB = 9900 + Math.floor(Math.random() * 90);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-lb-'));
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 240000).unref();

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
});
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok }); console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); };
const shot = async name => fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
const tap = async sel => {
  const pt = await ev(`const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
  const touch = (type, p) => send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }] : [] });
  await touch('touchStart', pt); await sleep(40); await touch('touchEnd'); await sleep(250);
};

const BOARDS = ['puzzleElo', 'blindfoldElo', 'calcElo', 'rushBest180', 'rushBest300'];
const SEASON = { rushBest180: 'rushMonth180', rushBest300: 'rushMonth300' };
// Made-up players. Each board has a different leader; u3 and u5 have no Sealed
// Moves rating; u4's month score is from an older month.
const PEOPLE = `(() => { const m = new Date(); const key = m.getFullYear() + '-' + String(m.getMonth() + 1).padStart(2, '0');
  return [
    { uid: 'u1', profileName: 'Lucía M.',  puzzleElo: 2140, blindfoldElo: 1320, calcElo: 1505, rushBest180: 22, rushBest300: 51, rushMonth180: 12, rushMonth300: 30, rushMonthKey: key },
    { uid: 'u2', profileName: 'Tomás',     puzzleElo: 1810, blindfoldElo: 1790, calcElo: 1240, rushBest180: 35, rushBest300: 40, rushMonth180: 33, rushMonth300: 11, rushMonthKey: key },
    { uid: 'u3', profileName: 'Valentina', puzzleElo: 1650, blindfoldElo: 1410,                rushBest180: 41, rushBest300: 44, rushMonth180: 20, rushMonth300: 44, rushMonthKey: key },
    { uid: 'u4', profileName: 'Diego R.',  puzzleElo: 1500, blindfoldElo: 1280, calcElo: 1890, rushBest180: 18, rushBest300: 62, rushMonth180: 99, rushMonth300: 99, rushMonthKey: '2020-01' },
    { uid: 'u5', profileName: 'Sofía',     puzzleElo: 1390,                                    rushBest180: 9,  rushBest300: 12 },
  ]; })()`;
// Rows as painted: [name, value].
const rows = id => ev(`return [...document.querySelectorAll('#${id} .lb-row')].map(r => [r.querySelector('.lb-name').textContent, r.querySelector('.lb-value').textContent]);`);
const layout = (modeId, periodId) => ev(`
  const mode = document.getElementById('${modeId}'), per = document.getElementById('${periodId}'), r = e => e.getBoundingClientRect();
  const tops = [...mode.children].map(b => Math.round(r(b).top));
  const cut = [...mode.children, ...per.children].filter(b => b.scrollWidth > b.clientWidth).map(b => b.textContent);
  // Room left if the label were bold (the lit state), measured not assumed.
  const spare = Math.min(...[...mode.children].map(b => { const s = getComputedStyle(b), c = document.createElement('canvas').getContext('2d');
    c.font = '700 ' + s.fontSize + ' ' + s.fontFamily; return Math.round(b.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) - c.measureText(b.textContent).width); }));
  return { perRow: [tops.filter(t => t === tops[0]).length, tops.filter(t => t === tops[4]).length], rowsApart: tops[4] > tops[0],
    labels: [...mode.children].map(b => b.textContent), order: [...mode.children].map(b => b.dataset.v), cut, spare,
    minH: Math.min(...[...mode.children].map(b => Math.round(r(b).height))), inside: [...mode.children].every(b => r(b).right <= innerWidth && r(b).left >= 0) };`);

let failed = false;
try {
  for (const [lang, scheme] of [['es', 'light'], ['es', 'dark'], ['en', 'light'], ['en', 'dark']]) {
    const tag = `${lang}-${scheme}`;
    console.log(`\n── ${tag} ──`);
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await send('Page.navigate', { url: `http://localhost:${WEB}/` });
    await sleep(1200);
    await ev(`localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1');`);
    await send('Page.reload', {});
    await sleep(2500);
    await ev(`document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove());
      window.__app = await import('/js/app.js'); window.__lb = (await import('/js/leaderboard.js')).Leaderboard;
      window.__fr = (await import('/js/friends.js')).Friends;`);

    // ── the global leaderboard ──
    await ev(`__lb.open();`); await sleep(700);
    const lay = await layout('leaderboard-mode', 'leaderboard-period');
    check(`[${tag}] global: three ELO boards on top, two Rush boards under`, lay.perRow[0] === 3 && lay.perRow[1] === 2 && lay.rowsApart && lay.order.join() === BOARDS.join(), lay.labels);
    check(`[${tag}] global: no label cut, room to spare when bold, buttons 40px tall, inside the screen`, !lay.cut.length && lay.spare >= 6 && lay.minH >= 40 && lay.inside, { spare: lay.spare, minH: lay.minH, cut: lay.cut });
    for (const b of BOARDS) {
      await tap(`#leaderboard-mode button[data-v="${b}"]`); await sleep(600);
      const st = await ev(`return { field: __lb.field, sort: __lb.sortField(), on: [...document.querySelectorAll('#leaderboard-mode button.on')].map(x => x.dataset.v),
        period: !document.getElementById('leaderboard-period').classList.contains('hidden'), perOn: document.querySelector('#leaderboard-period button.on').dataset.v, screen: __app.activeScreen };`);
      check(`[${tag}] global: ${b} really tapped, lit alone, and it is the field the query sorts on`, st.field === b && st.sort === b && st.on.join() === b && st.screen === 'leaderboard', st);
      check(`[${tag}] global: ${b} period switch ${SEASON[b] ? 'shown' : 'hidden'}, on "all time"`, st.period === !!SEASON[b] && st.perOn === 'all');
      // Painted from made-up players, sorted the way the server would sort them.
      const got = await ev(`const p = ${PEOPLE}.filter(e => e['${b}'] != null).sort((a, c) => c['${b}'] - a['${b}']); __lb.entries = p; __lb.render(p);
        document.getElementById('leaderboard-status').textContent = ''; return p.map(e => [e.profileName, String(Math.round(e['${b}']))]);`);
      check(`[${tag}] global: ${b} rows show that board's own number`, JSON.stringify(await rows('leaderboard-list')) === JSON.stringify(got), got[0]);
      await shot(`global-${b}-${tag}`);
      if (SEASON[b]) {
        await tap('#leaderboard-period button[data-v="month"]'); await sleep(600);
        check(`[${tag}] global: ${b} "this month" really tapped sorts on ${SEASON[b]}`, await ev(`return __lb.sortField();`) === SEASON[b]);
        await shot(`global-${b}-month-${tag}`);
        await tap('#leaderboard-period button[data-v="all"]'); await sleep(400);
      }
    }
    // Leaving a Rush board while on "this month": the switch must go back.
    await tap('#leaderboard-period button[data-v="month"]'); await sleep(400);
    await tap('#leaderboard-mode button[data-v="puzzleElo"]'); await sleep(500);
    await tap('#leaderboard-mode button[data-v="rushBest180"]'); await sleep(500);
    check(`[${tag}] global: back on a Rush board after an ELO one, the switch reads "all time" and so does the query`,
      await ev(`return document.querySelector('#leaderboard-period button.on').dataset.v === 'all' && __lb.sortField() === 'rushBest180';`));

    // ── the friends leaderboard: a fixed roster, painted on the device ──
    await ev(`const p = ${PEOPLE}; __fr.friends = p.slice(1); __fr.me = p[0]; __fr.friendsLoaded = true; __fr.field = 'puzzleElo'; __fr.season = false;
      __app.showScreen('friends-leaderboard'); __fr.renderLeaderboard();`);
    await sleep(300);
    const flay = await layout('flb-mode', 'flb-period');
    check(`[${tag}] friends: three ELO boards on top, two Rush boards under`, flay.perRow[0] === 3 && flay.perRow[1] === 2 && flay.rowsApart && flay.order.join() === BOARDS.join(), flay.labels);
    check(`[${tag}] friends: no label cut, room to spare when bold`, !flay.cut.length && flay.spare >= 6 && flay.minH >= 40 && flay.inside, { spare: flay.spare });
    for (const b of BOARDS) {
      await tap(`#flb-mode button[data-v="${b}"]`);
      const want = await ev(`const p = ${PEOPLE}, fb = ${b === 'calcElo' ? 'null' : b.startsWith('rush') ? '0' : '1200'};
        return p.map(e => [e.profileName, e['${b}'] ?? fb]).sort((a, c) => (c[1] ?? -Infinity) - (a[1] ?? -Infinity)).map(([n, v]) => [n, v == null ? '—' : String(Math.round(v))]);`);
      const got = await rows('flb-list');
      check(`[${tag}] friends: ${b} really tapped, all five people, sorted on it`, JSON.stringify(got) === JSON.stringify(want) && got.length === 5, got.map(r => r.join(' ')));
      check(`[${tag}] friends: ${b} period switch ${SEASON[b] ? 'shown' : 'hidden'}`, await ev(`return !document.getElementById('flb-period').classList.contains('hidden');`) === !!SEASON[b]);
      await shot(`friends-${b}-${tag}`);
    }
    const dash = (await rows('flb-list'), await (async () => { await tap('#flb-mode button[data-v="calcElo"]'); return rows('flb-list'); })());
    check(`[${tag}] friends: no Sealed Moves rating is a dash at the bottom, never a made-up number`, dash[3][1] === '—' && dash[4][1] === '—' && dash[0][0] === 'Diego R.', dash.map(r => r.join(' ')));
    await tap('#flb-mode button[data-v="rushBest300"]');
    await tap('#flb-period button[data-v="month"]');
    const month = await rows('flb-list');
    check(`[${tag}] friends: "this month" really tapped; last month's score reads 0`, month[0].join() === 'Valentina,44' && month.find(r => r[0] === 'Diego R.')[1] === '0', month.map(r => r.join(' ')));
    await shot(`friends-rushBest300-month-${tag}`);
    await tap('#flb-mode button[data-v="blindfoldElo"]');
    await tap('#flb-mode button[data-v="rushBest300"]');
    check(`[${tag}] friends: back on a Rush board, the switch reads "all time"`, await ev(`return document.querySelector('#flb-period button.on').dataset.v === 'all' && !__fr.season;`));
  }
  check('no uncaught exception in the page', !errors.length, errors.slice(0, 5));
} catch (e) { failed = true; console.error('VERIFY FAILED', e.message); }
finally {
  const bad = checks.filter(c => !c.ok);
  console.log(`\n${checks.length - bad.length} of ${checks.length} checks passed` + (bad.length ? '\nFAILED:\n  ' + bad.map(b => b.name).join('\n  ') : ''));
  chrome.kill(); server.close();
  setTimeout(() => process.exit(failed || bad.length ? 1 : 0), 300);
}
