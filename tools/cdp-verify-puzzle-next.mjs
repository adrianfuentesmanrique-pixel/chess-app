// The Puzzle tab's Next button: it lives at the right end of the status bar,
// navy while the puzzle is in play (it skips) and, once the puzzle is over, the
// whole bar turns gold and is the button. Dev tool, not shipped. Headless
// Chrome over CDP, signed out, no service worker. Method copied from
// tools/cdp-verify-puzzle-modes.mjs.
//
//   node tools/cdp-verify-puzzle-next.mjs <outDir>     about a minute and a half
//
// Checked at 375 x 667 in ES and EN, light and dark, nothing scrolled: the
// button's words, its size (44 px tall at least), that it and the whole board
// are on screen before AND after a real solve, its colour in both moments, and
// that a real tap loads another puzzle exactly once. Then every way into this
// screen: a skip, a wrong move, the solution shown, auto-next on, a theme, the
// daily puzzle, a rating-band homework and a hand-picked list.
//
// Ports are kept clear of tools/emu-verify-simul.mjs and the other cdp tools
// (9300-9899 and 9900-9989), which another session may be running.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/cdp-verify-puzzle-next.mjs <outDir>'); process.exit(1); }
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9100 + Math.floor(Math.random() * 90);
const WEB = 8700 + Math.floor(Math.random() * 90);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-pznext-'));
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 360000).unref();

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
// A real touch at a point of an element: fx is how far across it (0 to 1).
const tap = async (sel, fx = 0.5) => {
  const pt = await ev(`const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + r.width * ${fx}, y: r.top + r.height / 2 };`);
  const touch = (type, p) => send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }] : [] });
  await touch('touchStart', pt); await sleep(40); await touch('touchEnd'); await sleep(200);
};
const P = '__app.Puzzles';
// The player's turn on a fresh puzzle: the opponent's opening move has landed.
const ready = () => until(`${P}.current && ${P}.moveIdx === 1 && !document.getElementById('puzzle-status').classList.contains('done')`, 12000);
// Plays the puzzle's own moves through userMove, as the board would.
const solve = async () => {
  await ev(`const P = ${P}; for (let i = 0; i < 40 && P.moveIdx < P.current.moves.length; i++) { const u = P.current.moves[P.moveIdx]; await P.userMove({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); }`);
  return until(`document.getElementById('puzzle-status').classList.contains('done')`, 6000);
};
const look = () => ev(`
  const box = e => { const b = e.getBoundingClientRect(); return { top: Math.round(b.top * 10) / 10, bottom: Math.round(b.bottom * 10) / 10, left: Math.round(b.left), right: Math.round(b.right), h: Math.round(b.height * 10) / 10, w: Math.round(b.width) }; };
  const on = r => r.top >= 0 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
  const colour = v => { const d = document.createElement('i'); d.style.background = v; document.body.append(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; };
  const bar = document.getElementById('puzzle-status'), btn = document.getElementById('puzzle-next'), board = document.getElementById('puzzle-board'), row = document.getElementById('puzzle-actions');
  const b = box(btn), s = box(bar), bd = box(board);
  return { text: btn.textContent.trim(), status: document.getElementById('puzzle-status-text').textContent, btn: b, bar: s, board: bd,
    btnOn: on(b), barOn: on(s), boardOn: on(bd), scrolled: document.querySelector('main').scrollTop + scrollY,
    done: bar.classList.contains('done'), btnBg: getComputedStyle(btn).backgroundColor, barBg: getComputedStyle(bar).backgroundColor,
    navy: colour('var(--accent)'), gold: colour('var(--gold)'), panel: colour('var(--panel)'),
    cut: btn.scrollWidth > btn.clientWidth, onlyOne: document.querySelectorAll('#puzzle-next').length === 1 && !row.contains(btn),
    rowFits: row.scrollWidth <= row.clientWidth, noSideScroll: document.documentElement.scrollWidth <= innerWidth,
    analyze: !document.getElementById('puzzle-analyze').classList.contains('hidden'), id: ${P}.current && ${P}.current.id, loads: window.__loads };`);
const WORDS = { es: 'Siguiente ➡', en: 'Next ➡' };

let failed = false;
try {
  for (const [lang, scheme] of [['es', 'light'], ['es', 'dark'], ['en', 'light'], ['en', 'dark']]) {
    const tag = `${lang}-${scheme}`;
    console.log(`\n── ${tag} ──`);
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await send('Page.navigate', { url: `http://localhost:${WEB}/` });
    await sleep(1200);
    await ev(`localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1'); localStorage.setItem('calcIntroDone', '1');`);
    await send('Page.reload', {});
    await sleep(2500);
    await ev(`document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove()); window.__app = await import('/js/app.js'); __app.showScreen('puzzles');`);
    await until(`__app.activeScreen === 'puzzles'`);
    await ready();
    // Skips here go straight through: the "skip this puzzle?" question (v228)
    // has its own check, tools/cdp-verify-skip-confirm.mjs.
    await ev(`await (await import('/js/db.js')).kvSet('puzzleSkipConfirm', false);`);
    // Every puzzle put on the board from here on is counted.
    await ev(`const P = ${P}, real = P.loadPuzzle; window.__loads = 0; P.loadPuzzle = function (p) { window.__loads++; return real.call(this, p); };`);

    // 1. Still solving.
    let a = await look();
    check(`[${tag}] solving: the button says "${WORDS[lang]}", is ${a.btn.h} px tall and ${a.btn.w} wide, navy, inside the status bar and nowhere else, nothing cut`,
      a.text === WORDS[lang] && a.btn.h >= 44 && !a.cut && a.onlyOne && a.btnBg === a.navy && a.barBg === a.panel && !a.done, a);
    check(`[${tag}] solving: button and the whole board on screen at 375 x 667 with nothing scrolled (board ends at ${a.board.bottom})`,
      a.btnOn && a.barOn && a.boardOn && a.scrolled === 0 && a.rowFits && a.noSideScroll, { board: a.board, btn: a.btn });
    await shot(`${tag}-1-solving`);

    // 2. A wrong move: the bar says so, and the button is still the navy skip.
    await ev(`const P = ${P}; const u = P.current.moves[P.moveIdx]; const bad = P.chess.moves({ verbose: true }).find(m => m.from + m.to !== u.slice(0, 4) && !m.san.includes('#')); await P.userMove({ from: bad.from, to: bad.to, promotion: bad.promotion });`);
    let w = await look();
    check(`[${tag}] a wrong move: "${w.status}" beside the button, still navy, board still on screen (ends at ${w.board.bottom})`,
      w.status.length > 5 && w.status !== a.status && !w.done && w.btnBg === w.navy && w.boardOn && w.btnOn && w.btn.h >= 44, { bar: w.bar });
    await shot(`${tag}-2-wrong`);

    // 3. Skip: a real tap on the navy button loads another puzzle, once.
    await tap('#puzzle-next');
    await ready();
    let b = await look();
    check(`[${tag}] skip: a tap on the navy button loads another puzzle, exactly once`, b.id !== a.id && b.loads === 1, { from: a.id, to: b.id, loads: b.loads });

    // 4. Really solved.
    const solved = await solve();
    await sleep(400);
    let c = await look();
    check(`[${tag}] solved: the whole bar is gold and reads "${c.status}" + "${c.text}", ${c.bar.h} px tall and ${c.bar.w} wide, Analyse shown`,
      solved && c.done && c.barBg === c.gold && c.text === WORDS[lang] && c.bar.h >= 44 && c.btn.h >= 44 && c.bar.w >= 350 && !c.cut && c.analyze, c);
    check(`[${tag}] solved: button and the whole board on screen at 375 x 667 with nothing scrolled (board ends at ${c.board.bottom})`,
      c.btnOn && c.barOn && c.boardOn && c.scrolled === 0 && c.rowFits && c.noSideScroll, { board: c.board, bar: c.bar });
    await shot(`${tag}-3-solved`);

    // 5. A tap on the LEFT of the gold bar, on the words, not on the button.
    await tap('#puzzle-status', 0.15);
    await ready();
    let d = await look();
    check(`[${tag}] solved: a tap on the left of the gold bar loads another puzzle, exactly once, and the bar is plain again`,
      d.id !== c.id && d.loads === 2 && !d.done && d.barBg === d.panel && d.btnBg === d.navy && !d.analyze, { from: c.id, to: d.id, loads: d.loads });
    // While solving, the same spot does nothing.
    await tap('#puzzle-status', 0.15);
    await sleep(300);
    check(`[${tag}] solving: a tap on the status words does nothing`, (await look()).loads === 2);

    // 6. The solution shown, then a tap on the button itself.
    await tap('#puzzle-solution');
    const shown = await until(`document.getElementById('puzzle-status').classList.contains('done')`, 15000);
    let e = await look();
    check(`[${tag}] solution shown: the bar turns gold; board on screen (ends at ${e.board.bottom})`, shown && e.barBg === e.gold && e.boardOn && e.btnOn, { bar: e.bar });
    await tap('#puzzle-next');
    await ready();
    let f = await look();
    check(`[${tag}] solution shown: a tap on the button loads another puzzle, exactly once`, f.id !== e.id && f.loads === 3 && !f.done, { loads: f.loads });

    if (scheme !== 'light') continue;   // the flows below do not depend on the colours

    // 7. Auto-next on: the next puzzle arrives by itself after a solve.
    await ev(`${P}.autoNext = true;`);
    const before = (await look()).id;
    await solve();
    const gold = (await look()).done;
    const moved = await until(`${P}.current.id !== ${JSON.stringify(before)}`, 4000);
    await ready();
    let g = await look();
    check(`[${tag}] auto-next on: gold for a moment, then the next puzzle by itself, once, plain bar again`, gold && moved && g.loads === 4 && !g.done, { loads: g.loads });
    await ev(`${P}.autoNext = false;`);

    // 8. A theme.
    await ev(`const P = ${P}; P.themeFilter = new Set(['fork']); await P.nextPuzzle();`);
    await ready();
    await tap('#puzzle-next');
    await ready();
    let h = await ev(`return { themes: ${P}.current.themes, loads: window.__loads };`);
    check(`[${tag}] a theme: the button brings another puzzle of that theme`, h.themes.includes('fork') && h.loads === 6, h);
    await ev(`${P}.themeFilter = 'random';`);

    // 9. The daily puzzle (Home's own entry point).
    await ev(`await __app.DailyMissions.goPuzzle();`);
    await ready();
    const daily = await ev(`return { id: ${P}.current.id, daily: ${P}.isDailyPuzzle };`);
    await solve();
    let i = await look();
    await tap('#puzzle-next');
    await ready();
    let j = await ev(`return { id: ${P}.current.id, daily: ${P}.isDailyPuzzle, done: document.getElementById('puzzle-status').classList.contains('done') };`);
    check(`[${tag}] the daily puzzle: gold once solved, and the button goes on to an ordinary puzzle`, daily.daily && i.done && i.boardOn && j.id !== daily.id && !j.daily && !j.done, { daily, j });

    // 10. Homework by rating band and theme.
    await ev(`await ${P}.startHomework({ id: 'verify-band', title: 'Verify', themes: [], minRating: 0, maxRating: 4000, count: 5, done: 0 });`);
    await ready();
    const hw1 = (await look()).id;
    await solve();
    let k = await look();
    await tap('#puzzle-status', 0.15);
    await ready();
    let l = await look();
    check(`[${tag}] homework: gold once solved, button ${k.btn.h} px tall and on screen, and a tap brings the next one`, k.done && k.btnOn && k.btn.h >= 44 && l.id !== hw1 && !l.done && await ev(`return !!${P}.homework;`), { bar: k.bar });
    await shot(`${tag}-4-homework`);

    // 11. A hand-picked list, in the teacher's order.
    const ids = await ev(`const P = ${P}; const list = P.pool().slice(0, 3).map(p => ({ ...p })); await P.startHomework({ id: 'verify-list', title: 'Verify list', list, doneIds: [], count: 3, done: 0 }); return list.map(p => p.id);`);
    await ready();
    const first = (await look()).id;
    await tap('#puzzle-next');
    await ready();
    const second = (await look()).id;
    await solve();
    await tap('#puzzle-next');
    await ready();
    const third = (await look()).id;
    check(`[${tag}] a hand-picked list: first, skip to the second, solve it, on to the third, in order`, first === ids[0] && second === ids[1] && third === ids[2], { ids, got: [first, second, third] });
    await ev(`const P = ${P}; P.homework = null; P.paintHomework();`);
  }
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
