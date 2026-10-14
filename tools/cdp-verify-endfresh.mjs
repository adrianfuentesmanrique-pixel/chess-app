// Endings (Learn tab): each endgame's row shows how long ago it was last
// solved — green up to 60 days, orange 61 to 90, red 91 or more, an empty grey
// ring when never. Real taps at 375 px, both themes, both languages.
//
// Skeleton (server, Chrome, tapX, load, shot) from tools/cdp-verify-students8.mjs.
// What is TAPPED: the tab, the lists, Back, Walk through, Practice, Resign and
// its confirmation. What is NOT a finger: the chess moves go through
// Endgame.userMove (the board's own path), and the dates of 60, 61, 90, 91, 75
// and 240 days ago are SEEDED into the kv store — nobody waited three months.
// There is no Firebase user in headless Chrome, so the sync between two phones
// is not proved here (tests/unit/endgame-fresh.test.js covers the merge rule).
//
// Run: node tools/cdp-verify-endfresh.mjs <outDir>
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/cdp-verify-endfresh.mjs <outDir>'); process.exit(1); }
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9100 + Math.floor(Math.random() * 90);
const WEB = 8700 + Math.floor(Math.random() * 90);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-egf-'));
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 300000).unref();

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
});
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok }); console.log((ok ? '  PASS ' : '  FAIL ') + name + (!ok && detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); };
const shot = async name => fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
const until = async (expr, ms = 8000) => { for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (await ev(`return !!(${expr});`)) return true; await sleep(60); } return false; };
// A real touch in the middle of an element: `find` is a JS expression for it.
// It is scrolled into view first, and it must be what the finger reaches.
const tapX = async find => {
  // A toast sits over the bottom of the screen for up to 3.5 s: wait it out.
  await until(`document.getElementById('toast').classList.contains('hidden')`, 5000);
  const pt = await ev(`const e = ${find}; if (!e) return null; e.scrollIntoView({ block: 'center' });
    await new Promise(r => setTimeout(r, 120));
    const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, reach: !!hit && (hit === e || e.contains(hit)), by: hit ? hit.tagName + '#' + hit.id + '.' + hit.className : 'nothing' };`);
  if (!pt) throw new Error('nothing to tap: ' + find);
  if (!pt.reach) throw new Error('covered by ' + pt.by + ', a finger would not reach: ' + find);
  const touch = (type, p) => send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }] : [] });
  await touch('touchStart', pt); await sleep(40); await touch('touchEnd'); await sleep(350);
};
const tap = sel => tapX(`document.querySelector(${JSON.stringify(sel)})`);
const top = `[...document.querySelectorAll('.modal-box')].pop()`;

const load = async (lang, scheme) => {
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
  await send('Page.navigate', { url: `http://127.0.0.1:${WEB}/` });
  await sleep(2500);
  await ev(`localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1');`);
  await send('Page.reload', {});
  await sleep(3500);
  await ev(`document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove());
    window.__app = await import('/js/app.js'); window.__db = await import('/js/db.js');`);
};

// Menu → Learn → Endings → Pawn, each a tap. Returns nothing; the list is on screen after.
const toCats = async () => {
  await tap('#tabmenu-btn');
  await sleep(400);
  await tap('#tabbar button[data-screen="endgame"]');
  await until(`!document.getElementById('endgame-sections-view').classList.contains('hidden')`);
  await tapX(`[...document.querySelectorAll('#endgame-section-list .list-item')].find(b => /^(Finales|Endings)$/.test(b.querySelector('b').textContent))`);
  await until(`document.querySelector('#endgame-cat-list [data-cat="pawn"]')`);
};
const toPawns = async () => { await toCats(); await tap('#endgame-cat-list [data-cat="pawn"]'); await until(`document.querySelector('#endgame-pos-list [data-eg="p1"]')`); };
const openRow = async id => { await tap(`#endgame-pos-list [data-eg="${id}"]`); await until(`!document.getElementById('endgame-viewer-view').classList.contains('hidden')`); await sleep(300); };
const back = async () => { await tap('#endgame-back-pos'); await until(`!document.getElementById('endgame-positions-view').classList.contains('hidden')`); await sleep(200); };
// What a row shows: its state class, the days text, and the dot's real paint.
const row = id => ev(`const r = document.querySelector('#endgame-pos-list [data-eg="${id}"]'); if (!r) return null;
  const m = r.querySelector('.eg-mark'), cs = getComputedStyle(m);
  return { state: [...r.classList].find(c => /^eg-(green|orange|red|never)$/.test(c)).slice(3), age: r.querySelector('.eg-age').textContent,
    bg: cs.backgroundColor, border: cs.borderTopWidth, name: r.querySelector('b').textContent };`);
// The four tokens as this theme paints them.
const tokens = () => ev(`const p = document.createElement('i'); document.body.appendChild(p); const out = {};
  for (const [k, v] of [['green', '--success'], ['orange', '--warning'], ['red', '--danger'], ['never', '--muted']]) { p.style.background = 'var(' + v + ')'; out[k] = getComputedStyle(p).backgroundColor; }
  p.remove(); return out;`);
const stored = () => ev(`return await __db.kvGet('endgameSolvedAt', null);`);
const dayAgo = n => ev(`const d = new Date(); d.setDate(d.getDate() - ${n}); const p = x => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());`);
const move = uci => ev(`await __app.Endgame.userMove({ from: '${uci.slice(0, 2)}', to: '${uci.slice(2, 4)}'${uci[4] ? `, promotion: '${uci[4]}'` : ''} });`);
// No row sticks out of the screen, and no name is cut.
const fits = () => ev(`const rows = [...document.querySelectorAll('#endgame-pos-list .list-item')];
  return { page: document.documentElement.scrollWidth, widest: Math.max(...rows.map(r => r.getBoundingClientRect().right)),
    cut: rows.filter(r => { const t = r.querySelector('.eg-text'); return t.scrollWidth > t.clientWidth + 1; }).length,
    ageOut: rows.filter(r => r.querySelector('.eg-age').getBoundingClientRect().right > r.getBoundingClientRect().right).length,
    legend: document.getElementById('endgame-legend').getBoundingClientRect().right, n: rows.length };`);
const scrollTop = () => ev(`for (let e = document.getElementById('endgame-pos-list'); e; e = e.parentElement) e.scrollTop = 0;`);

const W = {
  es: { legend: 'Resuelto hace:hasta 60 días61 a 9091 o mássin hacer', today: 'hoy', green: n => `${n} en verde` },
  en: { legend: 'Last solved:up to 60 days61 to 9091 or morenot done', today: 'today', green: n => `${n} green` },
};
const SEED = { p3: 60, p4: 61, p5: 90, p6: 91, p14: 240, p15: 75 };
const WANT = { p3: 'green', p4: 'orange', p5: 'orange', p6: 'red', p14: 'red', p15: 'orange' };

let failed = false;
try {
  // ── A. A fresh phone: everything is grey ──
  await load('es', 'dark');
  await toCats();
  let catSub = await ev(`return document.querySelector('#endgame-cat-list [data-cat="pawn"] .sub').textContent;`);
  check('A. the Pawn category says "0 en verde" on a fresh phone', catSub.includes(W.es.green(0)) && catSub.includes('54'), catSub);
  await shot('A-categories-es-dark');
  await tap('#endgame-cat-list [data-cat="pawn"]');
  await until(`document.querySelector('#endgame-pos-list [data-eg="p1"]')`);
  const tk = await tokens();
  let all = await ev(`return [...document.querySelectorAll('#endgame-pos-list .list-item')].map(r => r.className + '|' + r.querySelector('.eg-age').textContent);`);
  check('A. all 54 pawn endgames are grey, with no number of days', all.length === 54 && all.every(c => c.includes('eg-never') && c.endsWith('|')), all.slice(0, 3));
  let r = await row('p2');
  check('A. a never-solved row has an empty ring, not a filled dot', r.bg === 'rgba(0, 0, 0, 0)' && r.border === '2px', r);
  check('A. the explaining line is there, in Spanish', (await ev(`return document.getElementById('endgame-legend').textContent;`)) === W.es.legend);
  check('A. nothing is stored yet', (await stored()) === null, await stored());

  // ── B. Watching is not solving ──
  await openRow('p2');
  await tap('#endgame-walk-btn');
  const walked = await ev(`const E = __app.Endgame, w = E.walker, line = E.current.moves, sl = ms => new Promise(r => setTimeout(r, ms));
    for (const t0 = Date.now(); w.active && w.idx < line.length && Date.now() - t0 < 30000;) {
      if (!w.busy && w.isMine(w.idx) && E.board.interactive) { const u = line[w.idx]; await E.userMove({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); }
      await sl(200);
    }
    await sl(1500);
    return { idx: w.idx, n: line.length };`);
  await back();
  r = await row('p2');
  check('B. the walk-through played to its last move changes nothing', walked.idx === walked.n && r.state === 'never' && (await stored()) === null, { walked, r });

  // ── C. A failed practice changes nothing ──
  await openRow('p2');
  await tap('#endgame-practice-start');
  await sleep(300);
  await tap('#endgame-resign');
  await until(`${top} && ${top}.querySelector('.btn.danger')`);
  await tapX(`${top}.querySelector('.btn.danger')`);
  await sleep(600);
  const lost = await ev(`return { over: __app.Endgame.over, status: document.getElementById('endgame-status').textContent };`);
  await back();
  r = await row('p2');
  check('C. a resigned practice changes nothing', lost.over && r.state === 'never' && r.age === '' && (await stored()) === null, { lost, r });

  // ── D. Solved now: green without leaving the tab ──
  await openRow('p2');
  await tap('#endgame-practice-start');
  await sleep(300);
  await move('g6h5');                             // a wrong move: taken back, costs rating only
  await until(`!__app.Endgame.thinking`, 20000);
  const slip = await ev(`return __app.Endgame.mistakes;`);
  await move('f6f7');
  await until(`__app.Endgame.moveIdx === 2 && __app.Endgame.board.interactive`, 6000);
  await move('g6g7');
  await sleep(700);
  const won = await ev(`return { over: __app.Endgame.over, status: document.getElementById('endgame-status').textContent };`);
  const today = await dayAgo(0);
  check('D. the practice ended in success, with one wrong move on the way', won.over && slip === 1 && won.status.includes('Convertiste'), { won, slip });
  check('D. today is stored for p2, and only p2', JSON.stringify(await stored()) === JSON.stringify({ p2: today }), await stored());
  await back();
  r = await row('p2');
  check('D. Back: the row is green and says "hoy", without leaving the tab', r.state === 'green' && r.age === W.es.today && r.bg === tk.green, { r, tk });
  check('D. its neighbours are still grey', (await row('p1')).state === 'never' && (await row('p3')).state === 'never');
  await scrollTop();
  await shot('D-solved-now-es-dark');
  await tap('#endgame-back-cat');
  await until(`document.querySelector('#endgame-cat-list [data-cat="pawn"]')`);
  catSub = await ev(`return document.querySelector('#endgame-cat-list [data-cat="pawn"] .sub').textContent;`);
  check('D. the Pawn category now says "1 en verde"', catSub.includes(W.es.green(1)), catSub);
  check('D. the other categories still say 0', (await ev(`return document.querySelector('#endgame-cat-list [data-cat="rook"] .sub').textContent;`)).includes(W.es.green(0)));

  // ── E. Seeded dates, then a reload: 60 / 61 / 90 / 91 ──
  const seedMap = { p2: today };
  for (const [id, n] of Object.entries(SEED)) seedMap[id] = await dayAgo(n);
  await ev(`await __db.kvSet('endgameSolvedAt', ${JSON.stringify(seedMap)});`);

  for (const [lang, scheme] of [['es', 'dark'], ['en', 'light'], ['es', 'light'], ['en', 'dark']]) {
    const tag = `${lang}-${scheme}`;
    await load(lang, scheme);                      // a real reload each time
    await toCats();
    catSub = await ev(`return document.querySelector('#endgame-cat-list [data-cat="pawn"] .sub').textContent;`);
    check(`E ${tag}. after a reload the category counts p2 and the 60-day one: "${W[lang].green(2)}"`, catSub.includes(W[lang].green(2)), catSub);
    const catFit = await ev(`const rows = [...document.querySelectorAll('#endgame-cat-list .list-item')];
      return { page: document.documentElement.scrollWidth, widest: Math.max(...rows.map(r => r.getBoundingClientRect().right)) };`);
    check(`E ${tag}. the category rows are no wider than the screen`, catFit.page <= 375 && catFit.widest <= 375, catFit);
    await shot(`E-categories-${tag}`);
    await tap('#endgame-cat-list [data-cat="pawn"]');
    await until(`document.querySelector('#endgame-pos-list [data-eg="p1"]')`);
    const t = await tokens();
    const got = {};
    for (const id of ['p2', ...Object.keys(SEED)]) got[id] = await row(id);
    check(`E ${tag}. p2, really solved, is still green after the reload`, got.p2.state === 'green' && got.p2.age === W[lang].today && got.p2.bg === t.green, got.p2);
    for (const [id, n] of Object.entries(SEED)) {
      check(`E ${tag}. seeded ${n} days ago → ${WANT[id]}, "${n} d", painted with its token`,
        got[id].state === WANT[id] && got[id].age === `${n} d` && got[id].bg === t[WANT[id]], { row: got[id], token: t[WANT[id]] });
    }
    check(`E ${tag}. the four tokens are four different colours`, new Set(Object.values(t)).size === 4, t);
    check(`E ${tag}. the explaining line is in the right language`, (await ev(`return document.getElementById('endgame-legend').textContent;`)) === W[lang].legend);
    const f = await fits();
    check(`E ${tag}. the list is no wider than the screen and no name is cut`, f.n === 54 && f.page <= 375 && f.widest <= 375 && f.legend <= 375 && f.cut === 0 && f.ageOut === 0, f);
    await scrollTop();
    await shot(`E-list-${tag}`);
    await ev(`document.querySelector('#endgame-pos-list [data-eg="p13"]').scrollIntoView({ block: 'start' });`);
    await sleep(300);
    await shot(`E-long-${tag}`);
  }

  // ── F. What a sign-in does: the values change under the list, and it redraws ──
  await ev(`await __db.kvSet('endgameSolvedAt', { p1: '${await dayAgo(100)}' }); await __app.Endgame.loadSolved(); __app.Endgame.refreshLists();`);
  check('F. the list on screen is redrawn when the stored dates change', (await row('p1')).state === 'red' && (await row('p2')).state === 'never', await row('p1'));
} catch (e) { failed = true; console.error('\nSTOPPED: ' + e.message); }

const bad = checks.filter(c => !c.ok);
console.log(`\n${checks.length - bad.length} of ${checks.length} checks passed${bad.length ? ' — FAILED: ' + bad.map(c => c.name).join(' | ') : ''}`);
// App Check cannot answer on localhost (403) and sw.js is refused on purpose (404).
const other = errors.filter(e => !/firebaseappcheck|AppCheck|app-check|bad HTTP response code \(404\) was received when fetching the script|status of 403/i.test(e));
console.log(other.length ? `Console errors (${other.length}):\n  ` + [...new Set(other)].join('\n  ') : 'No console errors (other than App Check and the refused service worker).');
chrome.kill();
server.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(failed || bad.length ? 1 : 0);
