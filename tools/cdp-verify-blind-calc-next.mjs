// The Next button on Blindfold and on Sealed Moves ("calc"), after the Puzzle
// tab's design (tools/cdp-verify-puzzle-next.mjs, whose method this copies).
// Dev tool, not shipped. Headless Chrome over CDP, signed out, no service worker.
//
//   node tools/cdp-verify-blind-calc-next.mjs <outDir>     about three minutes
//
// BLINDFOLD: Next sits at the right end of the status bar, navy while the
// puzzle is in play (it skips, as it always did) and, once the puzzle is over,
// the whole bar is gold and is the button. The countdown of the opening look
// sits in the same bar and the explanation is only on the start panel, so the
// whole board is on a 375 x 667 screen while memorising, solving and solved.
// SEALED MOVES: Next stays where it was (it only exists once the exercise is
// over) and is gold, with the same words and arrow.
//
// Checked at 375 x 667 in ES and EN, light and dark, nothing scrolled: the
// words, the size (44 px tall at least), the colour, that the button and the
// whole board are on screen before AND after a solve, that Kael is not over
// it, and that a real tap loads exactly one new exercise. Then the flows: a
// wrong move, a skip, the solution shown, a peek, auto-next on, List mode
// (Blindfold); hand in then next, a failed hand-in, the solution, auto-next
// (Sealed Moves).
// REALLY TAPPED: the mode chip, Go, Next, the bar, Show solution, Peek, the
// List switch, "I'm ready", every Sealed Moves square and button.
// CALLED, not tapped: Blind.userMove() with the puzzle's own moves (the pieces
// are hidden), Blind.showStart() to get back to the start panel, CalcUI.next()
// to pass over a puzzle with a promotion in it. SET in memory: autoNext.
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
if (!OUT) { console.error('usage: node tools/cdp-verify-blind-calc-next.mjs <outDir>'); process.exit(1); }
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9100 + Math.floor(Math.random() * 90);
const WEB = 8700 + Math.floor(Math.random() * 90);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-bcnext-'));
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 480000).unref();

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
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok }); console.log((ok ? '  PASS ' : '  FAIL ') + name + (!ok && detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); };
const shot = async name => fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
const until = async (expr, ms = 8000) => { for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (await ev(`return !!(${expr});`)) return true; await sleep(60); } return false; };
const tapAt = async pt => {
  const touch = (type, p) => send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }] : [] });
  await touch('touchStart', pt); await sleep(40); await touch('touchEnd'); await sleep(200);
};
// A real touch at a point of an element: fx is how far across it (0 to 1).
const tap = async (sel, fx = 0.5) => tapAt(await ev(`const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + r.width * ${fx}, y: r.top + r.height / 2 };`));
// For what is allowed to be under the fold (the start panel's Go, the row
// under the board): bring it up, tap it, and put the screen back.
const tapScrolled = async sel => {
  await ev(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: 'center' });`); await sleep(200);
  await tap(sel);
  await ev(`document.querySelector('main').scrollTop = 0;`); await sleep(100);
};
const B = '__app.Blind', C = '__calc';
const WORDS = { es: 'Siguiente ➡', en: 'Next ➡' };

// One measuring function for both screens.
const look = (nextSel, boardSel, barSel) => ev(`
  const box = e => { const b = e.getBoundingClientRect(); return { top: Math.round(b.top * 10) / 10, bottom: Math.round(b.bottom * 10) / 10, left: Math.round(b.left), right: Math.round(b.right), h: Math.round(b.height * 10) / 10, w: Math.round(b.width) }; };
  const on = r => r.h > 0 && r.top >= 0 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
  const colour = v => { const d = document.createElement('i'); d.style.background = v; document.body.append(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; };
  const btn = document.querySelector(${JSON.stringify(nextSel)}), board = document.querySelector(${JSON.stringify(boardSel)}), bar = document.querySelector(${JSON.stringify(barSel)});
  const r = btn.getBoundingClientRect();
  // Nine points across the button: is it the button that a finger would reach?
  let mine = 0;
  if (r.height) for (const fx of [0.1, 0.5, 0.9]) for (const fy of [0.2, 0.5, 0.8]) { const e = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy); if (e && (e === btn || btn.contains(e))) mine++; }
  const fab = document.getElementById('kael-fab').getBoundingClientRect(), bub = document.querySelector('.kael-quote-bubble.show')?.getBoundingClientRect();
  const over = k => !!k && k.left < r.right && k.right > r.left && k.top < r.bottom && k.bottom > r.top;
  return { text: btn.textContent.trim(), btn: box(btn), board: box(board), bar: box(bar), btnOn: on(box(btn)), boardOn: on(box(board)), barOn: on(box(bar)),
    scrolled: document.querySelector('main').scrollTop + scrollY, noSideScroll: document.documentElement.scrollWidth <= innerWidth,
    btnBg: getComputedStyle(btn).backgroundColor, barBg: getComputedStyle(bar).backgroundColor, done: bar.classList.contains('done'),
    navy: colour('var(--accent)'), gold: colour('var(--gold)'), panel: colour('var(--panel)'),
    cut: btn.scrollWidth > btn.clientWidth, reach: mine, kaelOver: over(fab) || over(bub), inBar: bar.contains(btn), only: document.querySelectorAll(${JSON.stringify(nextSel)}).length === 1 };`);
const lookB = async () => ({ ...await look('#blind-next', '#blind-board', '#blind-status'), ...await ev(`
  const B = ${B}, cd = document.getElementById('blind-countdown'), bar = document.getElementById('blind-status'), acts = document.getElementById('blind-actions');
  return { status: document.getElementById('blind-status-text').textContent, counting: !cd.classList.contains('hidden'), countInBar: bar.contains(cd), count: cd.textContent,
    explain: !!document.getElementById('blind-explain-look').offsetParent || !!document.getElementById('blind-explain-list').offsetParent,
    hidden: B.board.piecesHidden, id: B.current && B.current.id, calls: window.__nexts, rowOneLine: acts.getBoundingClientRect().height <= 48, rowH: acts.getBoundingClientRect().height,
    nextInRow: acts.contains(document.getElementById('blind-next')), share: !document.getElementById('blind-share').classList.contains('hidden'), peek: document.getElementById('blind-peek').textContent };`) });
const lookC = async () => ({ ...await look('#calc-next', '#calc-board', '#calc-actions'), ...await ev(`
  const C = ${C}; return { phase: C.phase, verdict: C.verdict, id: C.current && C.current.id, loads: window.__loads,
    next: !document.getElementById('calc-next').classList.contains('hidden'), submit: !document.getElementById('calc-submit').classList.contains('hidden'),
    submitBg: getComputedStyle(document.getElementById('calc-submit')).backgroundColor, say: document.getElementById('calc-say-text').textContent };`) });

// Blindfold: the pieces have been hidden and it is the player's move.
const solving = () => until(`${B}.current && !${B}.memorising && ${B}.board.piecesHidden && ${B}.board.interactive && ${B}.moveIdx === 1 && !${B}.logged`, 15000);
const counting = () => until(`${B}.current && ${B}.memorising && !document.getElementById('blind-countdown').classList.contains('hidden')`, 6000);
// Plays the puzzle's own moves through userMove, as the board would.
const solveB = async () => {
  await ev(`const P = ${B}; for (let i = 0; i < 40 && P.moveIdx < P.current.moves.length; i++) { const u = P.current.moves[P.moveIdx]; await P.userMove({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); }`);
  return until(`${B}.logged && document.getElementById('blind-status').classList.contains('done')`, 6000);
};
// Sealed Moves: a puzzle is up, with no promotion in its line (the taps below
// do not answer a promotion picker).
const readyC = async () => {
  for (let i = 0; i < 12; i++) {
    await until(`${C}.ready && ${C}.current && ${C}.phase === 'write'`, 10000);
    if (!await ev(`return ${C}.current.moves.some(u => u.length > 4);`)) return true;
    await ev(`await ${C}.next();`);
  }
  return false;
};
const sqTap = async name => tapAt(await ev(`const r = document.querySelector('#calc-board .sq[data-sq="${name}"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`));
const writeC = async moves => { for (const u of moves) { await sqTap(u.slice(0, 2)); await sqTap(u.slice(2, 4)); } await sleep(200); };
const handInC = async () => { for (let i = 0; i < 3 && await ev(`return ${C}.phase !== 'done';`); i++) await tap('#calc-submit'); return until(`${C}.phase === 'done'`, 5000); };

let failed = false;
try {
  for (const [lang, scheme] of [['es', 'light'], ['es', 'dark'], ['en', 'light'], ['en', 'dark']]) {
    const tag = `${lang}-${scheme}`;
    console.log(`\n── ${tag} ──`);
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await send('Page.navigate', { url: `http://localhost:${WEB}/` });
    await sleep(1200);
    await ev(`localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1'); localStorage.setItem('calcIntroDone', '1');
      const db = await import('/js/db.js');
      await db.kvSet('blindfoldSeconds', 2); await db.kvSet('blindfoldMode', 'look'); await db.kvSet('blindfoldHintWarningSeen', true);
      await db.kvSet('blindfoldAutoNext', false); await db.kvSet('calcAutoNext', false);`);
    await send('Page.reload', {});
    await sleep(2500);
    await ev(`document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove());
      window.__app = await import('/js/app.js'); window.__calc = (await import('/js/calc-ui.js')).CalcUI;
      // The streak is watched, not run: its celebration would cover the screen.
      __app.Streak.recordActivity = () => {};
      __app.showScreen('puzzles');`);
    await until(`__app.activeScreen === 'puzzles'`);
    await sleep(400);

    // ═════ BLINDFOLD ═════
    await tap('#screen-puzzles .puzzle-modes [data-v="blind"]');
    await until(`__app.activeScreen === 'blind' && ${B}.loaded`);
    await sleep(500);
    let s0 = await lookB();
    check(`[${tag}] blindfold, start panel: the explanation is there to be read`, s0.explain, s0);
    // Every Next from here on is counted: a call that gets past the start-panel guard.
    await ev(`const P = ${B}, real = P.nextPuzzle; window.__nexts = 0; P.nextPuzzle = function () { if (document.getElementById('blind-start').classList.contains('hidden')) window.__nexts++; return real.call(this); };`);
    await tapScrolled('#blind-go');

    // 1. The opening look.
    const cnt = await counting();
    let m = await lookB();
    check(`[${tag}] blindfold, memorising: the countdown ("${m.count}") is in the status bar and the explanation is gone`, cnt && m.counting && m.countInBar && +m.count > 0 && !m.explain, m);
    check(`[${tag}] blindfold, memorising: the whole board is on screen at 375 x 667, nothing scrolled (ends at ${m.board.bottom}), Next too`,
      m.boardOn && m.btnOn && m.barOn && m.scrolled === 0 && m.noSideScroll && !m.hidden, { board: m.board, btn: m.btn });
    await shot(`${tag}-blind-1-memorising`);

    // 2. Solving.
    const sv = await solving();
    let a = await lookB();
    check(`[${tag}] blindfold, solving: the button says "${WORDS[lang]}", ${a.btn.h} px tall and ${a.btn.w} wide, navy, in the status bar and not in the row under the board, nothing cut`,
      sv && a.text === WORDS[lang] && a.btn.h >= 44 && !a.cut && a.inBar && a.only && !a.nextInRow && a.btnBg === a.navy && a.barBg === a.panel && !a.done, a);
    check(`[${tag}] blindfold, solving: button and the whole board on screen at 375 x 667, nothing scrolled (board ends at ${a.board.bottom}); Kael not over the button, all of it reachable`,
      a.btnOn && a.barOn && a.boardOn && a.scrolled === 0 && a.noSideScroll && a.hidden && !a.counting && !a.kaelOver && a.reach === 9, { board: a.board, btn: a.btn, reach: a.reach });
    await shot(`${tag}-blind-2-solving`);

    // 3. A wrong move: the bar says so, and the button is still the navy skip.
    await ev(`const P = ${B}; const u = P.current.moves[P.moveIdx]; const bad = P.chess.moves({ verbose: true }).find(x => x.from + x.to !== u.slice(0, 4) && !x.san.includes('#')); await P.userMove({ from: bad.from, to: bad.to, promotion: bad.promotion });`);
    let w = await lookB();
    check(`[${tag}] blindfold, a wrong move: "${w.status}" beside the button, still navy, board still on screen`,
      w.status.length > 3 && w.status !== a.status && !w.done && w.btnBg === w.navy && w.boardOn && w.btnOn && w.btn.h >= 44, w);
    // The status words are not a button while the puzzle is in play.
    await tap('#blind-status', 0.15);
    await sleep(300);
    check(`[${tag}] blindfold, solving: a tap on the status words does nothing`, (await lookB()).calls === 1);

    // 4. Skip: a real tap on the navy button loads another puzzle, once.
    await tap('#blind-next');
    await solving();
    let b = await lookB();
    check(`[${tag}] blindfold, skip: a tap on the navy button loads another puzzle, exactly once`, b.id !== a.id && b.calls === 2, { from: a.id, to: b.id, calls: b.calls });

    // 5. A peek: the pieces come back for a moment, the button stays put.
    await tapScrolled('#blind-peek');
    let pk = await lookB();
    check(`[${tag}] blindfold, a peek: the pieces are on show, one peek is spent ("${pk.peek}"), Next still navy and on screen`,
      !pk.hidden && /\(1\)/.test(pk.peek) && pk.btnBg === pk.navy && pk.btnOn && !pk.done && pk.calls === 2, pk);
    await until(`${B}.board.piecesHidden && ${B}.board.interactive`, 8000);

    // 6. Really solved.
    const solved = await solveB();
    await sleep(500);
    let c = await lookB();
    check(`[${tag}] blindfold, solved: the whole bar is gold and reads "${c.status}" + "${c.text}", ${c.bar.h} px tall and ${c.bar.w} wide; the pieces are back; the row under the board is one line`,
      solved && c.done && c.barBg === c.gold && c.text === WORDS[lang] && c.bar.h >= 44 && c.btn.h >= 44 && c.bar.w >= 350 && !c.cut && !c.hidden && c.share && c.rowOneLine, c);
    check(`[${tag}] blindfold, solved: button and the whole board on screen at 375 x 667, nothing scrolled (board ends at ${c.board.bottom}); Kael not over the button`,
      c.btnOn && c.barOn && c.boardOn && c.scrolled === 0 && c.noSideScroll && !c.kaelOver && c.reach === 9, { board: c.board, bar: c.bar, reach: c.reach });
    await shot(`${tag}-blind-3-solved`);

    // 7. A tap on the LEFT of the gold bar, on the words, not on the button.
    await tap('#blind-status', 0.15);
    await solving();
    let d = await lookB();
    check(`[${tag}] blindfold, solved: a tap on the left of the gold bar loads another puzzle, exactly once, and the bar is plain again`,
      d.id !== c.id && d.calls === 3 && !d.done && d.barBg === d.panel && d.btnBg === d.navy && !d.share, { from: c.id, to: d.id, calls: d.calls });

    // 8. The solution shown, then a tap on the button itself.
    await tapScrolled('#blind-solution');
    const shown = await until(`document.getElementById('blind-status').classList.contains('done')`, 3000);
    let e = await lookB();
    check(`[${tag}] blindfold, solution shown: the bar turns gold; board and button on screen`, shown && e.barBg === e.gold && e.boardOn && e.btnOn && !e.hidden, e);
    await tap('#blind-next');
    await solving();
    let f = await lookB();
    check(`[${tag}] blindfold, solution shown: a tap on the button loads another puzzle, exactly once`, f.id !== e.id && f.calls === 4 && !f.done, { calls: f.calls });

    if (scheme === 'light') {   // the flows below do not depend on the colours
      // 9. Auto-next on: the next puzzle arrives by itself after a solve.
      await ev(`${B}.autoNext = true;`);
      const before = f.id;
      await solveB();
      const gold = (await lookB()).done;
      const moved = await until(`${B}.current.id !== ${JSON.stringify(before)}`, 4000);
      await solving();
      let g = await lookB();
      check(`[${tag}] blindfold, auto-next on: gold for a moment, then the next puzzle by itself, once, plain bar again`, gold && moved && g.calls === 5 && !g.done, { calls: g.calls });
      await ev(`${B}.autoNext = false;`);

      // 10. List mode: the list stands where the board is, the countdown in the bar.
      await ev(`${B}.showStart();`);
      await sleep(300);
      check(`[${tag}] blindfold, back on the start panel: the explanation is back`, (await lookB()).explain);
      await tapScrolled('#blind-mode-seg [data-v="list"]');
      await tapScrolled('#blind-go');
      const listUp = await until(`!document.getElementById('blind-list').classList.contains('hidden')`, 6000);
      let l = await lookB();
      const ready = await ev(`const r = document.getElementById('blind-ready').getBoundingClientRect(); return r.height > 0 && r.bottom <= innerHeight;`);
      check(`[${tag}] blindfold, List mode: the list is up, its countdown ("${l.count}") in the bar, Next and "I'm ready" on screen`,
        listUp && l.counting && l.countInBar && l.btnOn && l.btn.h >= 44 && !l.explain && ready && l.calls === 6, l);
      await shot(`${tag}-blind-4-list`);
      await tap('#blind-ready');
      await solving();
      await solveB();
      let l2 = await lookB();
      check(`[${tag}] blindfold, List mode solved: gold bar, the whole board on screen`, l2.done && l2.boardOn && l2.btnOn && l2.barBg === l2.gold, l2);
      await tap('#blind-status', 0.15);
      const again = await until(`!document.getElementById('blind-list').classList.contains('hidden')`, 6000);
      check(`[${tag}] blindfold, List mode: a tap on the gold bar brings the next list, once`, again && (await lookB()).calls === 7);
      await ev(`${B}.showStart(); ${B}.mode = 'look'; ${B}.updateTimeControl();`);
    }

    // ═════ SEALED MOVES ═════
    await ev(`document.querySelector('.kael-quote-bubble.show')?.click(); __app.showScreen('calc');`);
    await until(`__app.activeScreen === 'calc'`);
    await readyC();
    await sleep(600);
    await ev(`document.querySelectorAll('.modal-back').forEach(x => x.remove());
      const P = ${C}, real = P.load; window.__loads = 0; P.load = function (p) { const ok = real.call(this, p); if (ok) window.__loads++; return ok; };`);

    // 1. Written, not handed in: Hand in is the navy button and Next is not there.
    await writeC(await ev(`return ${C}.current.moves.slice(1);`));
    let p = await lookC();
    check(`[${tag}] sealed moves, writing: Hand in is the navy button and Next is not shown (no skip here)`, p.submit && !p.next && p.submitBg === p.navy && p.btn.h === 0, p);

    // 2. Handed in.
    const done = await handInC();
    await sleep(700);
    let q = await lookC();
    check(`[${tag}] sealed moves, handed in (${q.verdict}): the button says "${WORDS[lang]}", ${q.btn.h} px tall and ${q.btn.w} wide, gold, nothing cut, Hand in gone`,
      done && q.next && !q.submit && q.text === WORDS[lang] && q.btn.h >= 44 && q.btnBg === q.gold && !q.cut && q.only, q);
    check(`[${tag}] sealed moves, handed in: button and the whole board on screen at 375 x 667, nothing scrolled (board ends at ${q.board.bottom}); Kael beside the button, not over it`,
      q.btnOn && q.boardOn && q.scrolled === 0 && q.noSideScroll && !q.kaelOver && q.reach === 9, { board: q.board, btn: q.btn, reach: q.reach });
    await shot(`${tag}-calc-1-done`);

    // 3. A real tap: one new exercise, and the screen is back to writing.
    await tap('#calc-next');
    await until(`${C}.phase === 'write' && ${C}.current.id !== ${JSON.stringify(q.id)}`, 8000);
    let r = await lookC();
    check(`[${tag}] sealed moves: a tap on Next loads another exercise, exactly once, and Hand in is back`, r.id !== q.id && r.loads === 1 && r.submit && !r.next && r.phase === 'write', { loads: r.loads });

    if (scheme === 'light') {
      // 4. A failed hand-in: a wrong first move.
      await ev(`await ${C}.next();`); await readyC();
      const base = (await lookC()).loads;
      const bad = await ev(`const { Chess } = await import('/vendor/chess.js'); const P = ${C}.current; const c = new Chess(P.fen); const o = P.moves[0];
        c.move({ from: o.slice(0, 2), to: o.slice(2, 4), promotion: o[4] }); const u = P.moves[1];
        const x = c.moves({ verbose: true }).find(k => k.from + k.to !== u.slice(0, 4) && !k.promotion && !k.san.includes('#')); return x.from + x.to;`);
      await writeC([bad]);
      await handInC();
      await sleep(500);
      let t1 = await lookC();
      check(`[${tag}] sealed moves, a failed hand-in: failed, and Next is there, gold, 44 px, on screen`, t1.verdict === 'failed' && t1.next && t1.btnBg === t1.gold && t1.btn.h >= 44 && t1.btnOn && t1.boardOn, t1);
      await shot(`${tag}-calc-2-failed`);
      await tap('#calc-next');
      await until(`${C}.phase === 'write' && ${C}.current.id !== ${JSON.stringify(t1.id)}`, 8000);
      check(`[${tag}] sealed moves, after a failure: a tap on Next loads another exercise, exactly once`, (await lookC()).loads === base + 1);

      // 5. The solution asked for.
      await readyC();
      const base2 = (await lookC()).loads;
      await tap('#calc-solution');
      await until(`${C}.phase === 'done'`, 4000);
      await sleep(400);
      let t2 = await lookC();
      check(`[${tag}] sealed moves, solution shown: Next is there, gold and on screen`, t2.phase === 'done' && t2.next && t2.btnBg === t2.gold && t2.btnOn, t2);
      await tap('#calc-next');
      await until(`${C}.phase === 'write' && ${C}.current.id !== ${JSON.stringify(t2.id)}`, 8000);
      check(`[${tag}] sealed moves, solution shown: a tap on Next loads another exercise, exactly once`, (await lookC()).loads === base2 + 1);

      // 6. Auto-next on: a clean solve moves on by itself.
      await readyC();
      const base3 = (await lookC()).loads, id3 = (await lookC()).id;
      await ev(`${C}.autoNext = true;`);
      await writeC(await ev(`return ${C}.current.moves.slice(1);`));
      await handInC();
      const gold = await lookC();
      const moved = await until(`${C}.current.id !== ${JSON.stringify(id3)} && ${C}.phase === 'write'`, 30000);
      let t3 = await lookC();
      check(`[${tag}] sealed moves, auto-next on: gold Next for a moment, then the next exercise by itself, once`, gold.next && gold.btnBg === gold.gold && moved && t3.loads === base3 + 1, { loads: t3.loads, base3 });
      await ev(`${C}.autoNext = false;`);
    }
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
