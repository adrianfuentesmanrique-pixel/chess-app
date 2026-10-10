// Sealed Moves ("calc"), the fifth puzzle mode: the frozen board, the answer
// tree and the hand-in. Dev tool, not shipped. Headless Chrome over CDP,
// signed out, no service worker.
//
//   node tools/cdp-verify-calc.mjs <outDir>     about four minutes
//
// At 375 x 667 in ES and EN, light and dark. REALLY TAPPED (CDP touch events):
// every square, chip, slot and button. CALLED, not tapped: CalcUI.load(), to
// put up a puzzle of a known length from the app's own files.
// Checked: the layout (the tree keeps three rows, nothing scrolls but the
// tree, no chip label cut short); the board does not move while moves are
// written; an illegal move is refused; delete; a one-move and a three-move
// puzzle solved perfectly; one failed on a wrong move; one handed in unfinished
// and finished through Kael's slot.
// The engine at hand-in (the app's own Stockfish, really run): the result is on
// the screen before the engine answers; a sound variation move turns green and
// the solve stays perfect; a move that walks into mate turns red with the
// engine's move beside it and perfect becomes solved; with the engine file
// refused by this tool's server the move stays grey and the result stands.
// The mode's own settings, through the real sheet and picker: a theme, a
// difficulty and auto-next chosen here are saved under calc* and leave the
// Puzzles ones alone, and a theme chosen in Puzzles leaves this one alone.
// The hint: refused off an empty main-line step, flashes the piece that moves,
// and the solve is then not perfect.
// Its own rating (js/calc.js calcPay, each amount compared with the function's):
// the first rating is the puzzle rating minus 200; a plain solve, a perfect one
// (more), one with a hint (half) and a failed one (a loss); a perfect solve with
// a variation is paid as a plain one at the hand-in and gets the bonus when the
// engine accepts it, keeps the plain amount when the engine corrects it, and
// gets the bonus when the engine cannot start; each puzzle counted once; the
// PUZZLE rating never moves; kv calcElo, calcAttemptCount, calcSolved and
// calcEloHistory are written. A solved puzzle is not offered again while an
// unsolved one is in the pool. The log (the rating's sheet, its dots, a dot
// reopening its puzzle), the Analysis button, time counted as puzzles time,
// and Kael's first-time explanation: shown once, not again after a reload.
// Puzzles itself, after the arithmetic moved to js/elo.js: one result paid
// live and compared with the old inline formula.
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
if (!OUT) { console.error('usage: node tools/cdp-verify-calc.mjs <outDir>'); process.exit(1); }
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const WEB = 9900 + Math.floor(Math.random() * 90);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-modes-'));
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 540000).unref();
let blockEngine = false;   // the server refuses the Stockfish file while this is set

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  if (p === '/sw.js' || (blockEngine && p.includes('stockfish'))) { res.writeHead(404).end(); return; }
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
const tap = async sel => {
  const pt = await ev(`const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
  const touch = (type, p) => send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }] : [] });
  await touch('touchStart', pt); await sleep(40); await touch('touchEnd'); await sleep(200);
};
const sqTap = async name => {
  const pt = await ev(`const r = document.querySelector('#calc-board .sq[data-sq="${name}"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
  const touch = (type, p) => send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }] : [] });
  await touch('touchStart', pt); await sleep(30); await touch('touchEnd'); await sleep(90);
};
const play = async uci => { await sqTap(uci.slice(0, 2)); await sqTap(uci.slice(2, 4)); };
// A tap on something inside a sheet that may have to be scrolled to.
const tapIn = async sel => { await ev(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: 'center' });`); await sleep(120); await tap(sel); };
const kv = key => ev(`return await (await import('/js/db.js')).kvGet(${JSON.stringify(key)}, null);`);
const judged = () => until(`__calc.phase === 'done' && !__calc.judging`, 40000);
// The mode's rating put at a known value with the fast start behind it (K 24),
// through the saved keys, the way the app itself reads them.
const rate = (elo = 1260, n = 30) => ev(`
  const db = await import('/js/db.js');
  await db.kvSet('calcElo', ${elo}); await db.kvSet('calcAttemptCount', ${n}); await db.kvSet('calcSolved', {});
  await __calc.readStats(); __calc.paintElo();`);
// What calcPay says a verdict moves the rating by, in the whole points shown.
const owed = (verdict, hinted = false, elo = 1260, n = 30, rating = 1200) => ev(`
  const { calcPay } = await import('/js/calc.js');
  return Math.round(calcPay({ elo: ${elo}, rating: ${rating}, attemptCount: ${n}, verdict: '${verdict}', hinted: ${hinted} })) - Math.round(${elo});`);
const rating = () => ev(`
  const db = await import('/js/db.js'), c = __calc, d = document.getElementById('calc-elo-delta');
  const hist = await db.kvGet('calcEloHistory', []);
  return { elo: c.elo, n: c.attemptCount, delta: c.delta, badge: document.getElementById('calc-elo').textContent,
    shown: d.classList.contains('hidden') ? '' : d.textContent, cls: d.className,
    kvElo: await db.kvGet('calcElo', null), kvN: await db.kvGet('calcAttemptCount', null), kvSolved: await db.kvGet('calcSolved', null),
    hist: hist.length ? hist[hist.length - 1].value : null, log: __app.PuzzleLog.logs.calc.length,
    last: __app.PuzzleLog.logs.calc.length ? __app.PuzzleLog.logs.calc[__app.PuzzleLog.logs.calc.length - 1].delta : null,
    pzElo: await db.kvGet('puzzleElo', null), pzN: await db.kvGet('puzzleAttemptCount', null), pzLive: __app.Puzzles.elo, streak: window.__streak || 0 };`);
const signed = d => (d > 0 ? '+' : '') + d;
// The heights the screen must keep, whatever Kael's line says.
const fits = () => ev(`
  const r = id => document.getElementById(id).getBoundingClientRect(), main = document.querySelector('main');
  const kael = document.getElementById('kael-fab').getBoundingClientRect(), act = [...document.querySelectorAll('#calc-actions button:not(.hidden)')].map(b => b.getBoundingClientRect());
  const pill = r('calc-rating'), say = r('calc-say'), text = r('calc-say-text');
  return { board: Math.round(r('calc-board').width), tree: Math.round(r('calc-tree').height), say: Math.round(say.height), actionsBottom: Math.round(r('calc-actions').bottom), h: innerHeight,
    pageScroll: main.scrollHeight - main.clientHeight, sideScroll: document.documentElement.scrollWidth - innerWidth,
    pill: Math.round(pill.width) + 'x' + Math.round(pill.height), pillIn: pill.right <= say.right + 0.5 && pill.top >= say.top - 0.5 && pill.bottom <= say.bottom + 0.5 && text.right <= pill.left,
    oneRow: new Set(act.map(a => Math.round(a.top))).size === 1, underKael: act.some(a => a.right > kael.left && a.bottom > kael.top),
    acts: [...document.querySelectorAll('#calc-actions button:not(.hidden)')].map(b => b.id + ' ' + Math.round(b.getBoundingClientRect().width)) };`);
const fitsOk = f => f.tree >= 132 && f.board >= 240 && f.actionsBottom <= f.h && f.pageScroll <= 1 && f.sideScroll <= 0 && f.pillIn && f.oneRow && !f.underKael;
// 1.e4 is the opponent's move; Black's line is ...e5, Nf3, ...Nc6. Hand-made so
// that what the engine must say about a variation is not in doubt.
const OPEN = { id: 'verify-open', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6'], rating: 1200, themes: [] };
const putOpen = async () => { await ev(`__calc.load(${JSON.stringify(OPEN)});`); await until(`__calc.ready`, 4000); await sleep(150); };
const state = () => ev(`
  const c = __calc, tree = document.getElementById('calc-tree');
  return { phase: c.phase, verdict: c.verdict, handIns: c.handIns, helped: c.helped, boardFen: c.board.fen, startFen: c.main.fen,
    chips: [...tree.querySelectorAll('.calc-chip')].map(b => b.textContent + '|' + b.className.replace('calc-chip', '').trim()),
    judging: c.judging, hinted: c.hinted, fixes: [...tree.querySelectorAll('.calc-fix')].map(e => e.textContent),
    say: document.getElementById('calc-say-text').textContent, toast: document.getElementById('toast').classList.contains('hidden') ? '' : document.getElementById('toast').textContent,
    next: !document.getElementById('calc-next').classList.contains('hidden'), submit: !document.getElementById('calc-submit').classList.contains('hidden') };`);
// Puts up a loaded puzzle with `plies` moves (the opponent's first included)
// and no promotion, and returns it.
const put = async (plies, skip = 0) => {
  const p = await ev(`
    // The opponent must have a second reply to the first move, for the variation.
    const roomy = p => { try { const c = new __Chess(p.fen); for (const u of p.moves.slice(0, 2)) c.move({ from: u.slice(0, 2), to: u.slice(2, 4) });
      return c.moves().filter(s => !/[#=]/.test(s)).length >= 3; } catch { return false; } };
    const list = __pz.PUZZLES.filter(p => p.moves.length === ${plies} && p.moves.every(u => u.length === 4) && (${plies} < 4 || roomy(p)));
    const p = list[${skip}]; if (!p || !__calc.load(p)) return null; return p;`);
  if (!p) throw new Error('no puzzle with ' + plies + ' moves loaded');
  await until(`__calc.ready`, 4000);
  await sleep(150);
  return p;
};
// A legal move in `fen` other than `not` that neither mates nor promotes.
const otherMove = (fen, not) => ev(`
  const c = new __Chess(${JSON.stringify(fen)});
  const m = c.moves({ verbose: true }).find(m => !m.san.includes('#') && !m.promotion && m.from + m.to !== ${JSON.stringify(not)});
  return m ? m.from + m.to : null;`);
const fenAfter = (fen, ucis) => ev(`
  const c = new __Chess(${JSON.stringify(fen)});
  for (const u of ${JSON.stringify(ucis)}) c.move({ from: u.slice(0, 2), to: u.slice(2, 4) });
  return c.fen();`);

let failed = false;
try {
  for (const [lang, scheme] of [['es', 'light'], ['es', 'dark'], ['en', 'light'], ['en', 'dark']]) {
    const tag = `${lang}-${scheme}`;
    console.log(`\n── ${tag} ──`);
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await send('Page.navigate', { url: `http://localhost:${WEB}/` });
    await sleep(1200);
    await ev(`localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1'); localStorage.removeItem('calcIntroDone');
      const db = await import('/js/db.js');
      await db.kvSet('puzzleElo', 1460); await db.kvSet('calcElo', null); await db.kvSet('calcAttemptCount', 0); await db.kvSet('calcSolved', {});`);
    await send('Page.reload', {});
    await sleep(2500);
    await ev(`document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove());
      window.__app = await import('/js/app.js'); window.__calc = (await import('/js/calc-ui.js')).CalcUI;
      window.__pz = await import('/js/puzzles.js'); window.__Chess = (await import('/vendor/chess.js')).Chess;
      // The streak is watched, not run: its celebration would cover the screen.
      __app.Streak.recordActivity = () => { window.__streak = (window.__streak || 0) + 1; };
      __app.showScreen('puzzles');`);
    await tap('#screen-puzzles .puzzle-modes [data-v="calc"]');
    check(`[${tag}] the fifth chip on Puzzles, really tapped, opens the mode`, await until(`__app.activeScreen === 'calc'`, 6000));
    check(`[${tag}] a puzzle comes up by itself, with the opponent's move highlighted`,
      await until(`__calc.ready && document.querySelectorAll('#calc-board .sq.lastmove').length === 2`, 8000));

    // ── Kael's first-time explanation ──
    check(`[${tag}] the first time, Kael explains the mode`, await until(`document.querySelector('.modal-box #calc-intro-ok')`, 3000));
    const intro = await ev(`const b = document.querySelector('.modal-box'), img = b.querySelector('img'), r = b.getBoundingClientRect();
      return { art: img.getAttribute('src'), drawn: img.naturalWidth > 0, text: b.textContent.length, inside: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, owl: /🦉/.test(b.textContent) };`);
    check(`[${tag}] ... with his horse artwork, no owl, and the whole card on the screen`, /icons\/kael\//.test(intro.art) && intro.drawn && !intro.owl && intro.inside && intro.text > 200, intro);
    await shot(`${tag}-0-intro`);
    await tap('#calc-intro-ok');
    check(`[${tag}] ... and "Got it" closes it and it is remembered`, await until(`!document.querySelector('.modal-back') && localStorage.getItem('calcIntroDone') === '1'`, 2000));

    // ── the first rating ──
    let r = await rating();
    check(`[${tag}] the first rating is the puzzle rating minus 200 (1460 -> ${r.badge}), shown with no change beside it and not saved yet`,
      r.elo === 1260 && r.badge === '1260' && r.shown === '' && r.kvElo === null && r.pzElo === 1460, r);
    const pz0 = { pzElo: r.pzElo, pzN: r.pzN, pzLive: r.pzLive };

    // ── layout ──
    const lay = await ev(`
      const r = id => document.getElementById(id).getBoundingClientRect(), main = document.querySelector('main');
      const seg = document.querySelector('#screen-calc .puzzle-modes'), bs = [...seg.querySelectorAll('button')], box = bs.map(b => b.getBoundingClientRect());
      const kael = document.getElementById('kael-fab').getBoundingClientRect(), act = [...document.querySelectorAll('#calc-actions button:not(.hidden)')].map(b => b.getBoundingClientRect());
      return { board: Math.round(r('calc-board').width), boardSquare: Math.abs(r('calc-board').width - r('calc-board').height) < 1,
        tree: Math.round(r('calc-tree').height), treeBottom: Math.round(r('calc-tree').bottom), actionsBottom: Math.round(r('calc-actions').bottom), h: innerHeight,
        pageScroll: main.scrollHeight - main.clientHeight, sideScroll: document.documentElement.scrollWidth - innerWidth,
        tops: [...new Set(box.map(b => Math.round(b.top)))].length, perRow: [box.filter(b => Math.round(b.top) === Math.round(box[0].top)).length, box.filter(b => Math.round(b.top) !== Math.round(box[0].top)).length],
        whole: bs.every(b => b.scrollWidth <= b.clientWidth), labels: bs.map(b => b.textContent + ' ' + b.scrollWidth + '/' + b.clientWidth), lit: bs.filter(b => b.classList.contains('on')).map(b => b.dataset.v).join(),
        segH: Math.round(seg.getBoundingClientRect().height), chipH: Math.round(document.querySelector('.calc-chip').getBoundingClientRect().height),
        underKael: act.some(a => a.right > kael.left && a.bottom > kael.top),
        icons: [...document.querySelectorAll('#calc-actions .btn.ico:not(.hidden)')].map(b => b.id + ' ' + Math.round(b.getBoundingClientRect().width) + 'x' + Math.round(b.getBoundingClientRect().height)),
        oneRow: new Set(act.map(a => Math.round(a.top))).size === 1, submitWhole: document.getElementById('calc-submit').scrollWidth <= document.getElementById('calc-submit').clientWidth,
        submitW: Math.round(document.getElementById('calc-submit').getBoundingClientRect().width) };`);
    check(`[${tag}] mode row: five chips, three over two, none cut short, "calc" lit`, lay.tops === 2 && lay.perRow.join() === '3,2' && lay.whole && lay.lit === 'calc', lay.labels);
    check(`[${tag}] 375 x 667: the tree keeps three rows (${lay.tree}px >= 132), the action row is on screen, nothing scrolls, the board is square (${lay.board}px)`,
      lay.tree >= 132 && lay.actionsBottom <= lay.h && lay.pageScroll <= 1 && lay.sideScroll <= 0 && lay.boardSquare && lay.board >= 240 && lay.chipH >= 40 && !lay.underKael, lay);
    check(`[${tag}] action row: delete, hint, solution and settings as icons at least 42 x 44, Hand in whole (${lay.submitW}px), all on one line`,
      lay.icons.length === 4 && lay.icons.every(i => { const [w, h] = i.split(' ')[1].split('x').map(Number); return w >= 42 && h >= 44; }) && lay.oneRow && lay.submitWhole && lay.submitW >= 80, lay.icons);
    let f = await fits();
    check(`[${tag}] the rating sits in Kael's line (${f.pill}px, line ${f.say}px) and costs no height`, fitsOk(f) && f.say <= 36, f);
    await shot(`${tag}-1-empty`);
    const act = await ev(`document.getElementById('calc-board').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      return (await import('/js/activity.js')).Activity.current();`);
    check(`[${tag}] time on this screen is counted as puzzles time`, act === 'puzzles', act);

    // ── the board never moves; an illegal move is refused; delete ──
    const three = await put(6);
    const [, a1, r1, a2, r2, a3] = three.moves;
    const s0 = await state();
    await sqTap(r1.slice(0, 2));   // a piece of the side that is NOT to move
    let s = await state();
    check(`[${tag}] a tap on a piece of the side not to move writes nothing and says why`, s.chips.length === 1 && s.chips[0].startsWith('?') && s.toast.length > 10, s.toast);
    await play(a1);
    s = await state();
    check(`[${tag}] a tapped move becomes a chip and the board does not move`, s.chips.length === 1 && !s.chips[0].startsWith('?') && s.boardFen === s0.boardFen && s.boardFen === s.startFen, s.chips);
    await play(a1);                // my own move again: it is the opponent's turn in my head
    s = await state();
    check(`[${tag}] the same move again is not legal in the imagined position and is refused`, s.chips.length === 1, s.chips);
    await play(r1);
    s = await state();
    check(`[${tag}] the opponent's reply, tapped where the pieces are imagined, is written with an empty slot after it`,
      s.chips.length === 3 && s.chips[2].startsWith('?') && s.boardFen === s.startFen, s.chips);
    await tap('#calc-tree .calc-chip:not(.calc-slot)');   // the first chip
    await tap('#calc-delete');
    s = await state();
    check(`[${tag}] selecting the first chip and deleting removes it and what follows`, s.chips.length === 1 && s.chips[0].startsWith('?'), s.chips);

    // ── three moves, perfect, with a side variation ──
    for (const u of [a1, r1, a2, r2, a3]) await play(u);
    await tap('#calc-tree .calc-chip:not(.calc-slot)');
    const side = await otherMove(await fenAfter(three.fen, [three.moves[0], a1]), r1);
    await play(side);
    const sideOwn = await otherMove(await fenAfter(three.fen, [three.moves[0], a1, side]), '');
    await play(sideOwn);
    await shot(`${tag}-2-written`);
    f = await fits();
    check(`[${tag}] four rows written: the tree still has its three rows and the board its size`, fitsOk(f), f);
    await rate(1260, 30);
    const want3 = { plain: await owed('solved', false, 1260, 30, three.rating), perfect: await owed('perfect', false, 1260, 30, three.rating) };
    const rowsSeen = await ev(`const t = document.getElementById('calc-tree'); return { rows: t.querySelectorAll('.calc-row').length, scrolls: t.scrollHeight > t.clientHeight };`);
    check(`[${tag}] the variation is its own row (four rows in all)`, rowsSeen.rows === 4, rowsSeen);
    await tap('#calc-submit');
    s = await state();
    check(`[${tag}] three-move puzzle, whole line right at the first hand-in: perfect and Next at once, before the engine has answered`,
      s.verdict === 'perfect' && s.next && !s.submit && s.chips.filter(c => /\bright\b/.test(c)).length >= 5, s);
    r = await rating();
    check(`[${tag}] ... and it is paid at once as a plain solve (${r.shown}), the perfect bonus waiting for the engine`,
      r.shown === signed(want3.plain) && r.n === 31 && r.badge === String(1260 + want3.plain) && r.log >= 1 && r.last === want3.plain && r.streak === 1, { r, want3 });
    check(`[${tag}] the engine finishes with the variation`, await judged());
    s = await state();
    const ownSide = s.chips[s.chips.length - 1], replySide = s.chips[s.chips.length - 2];
    check(`[${tag}] the variation: the opponent's reply plain, my move judged (${ownSide}); perfect only if it was right`,
      /\|reply/.test(replySide) && ((/\bright\b/.test(ownSide) && s.verdict === 'perfect' && !s.fixes.length) || (/\bwrong\b/.test(ownSide) && s.verdict === 'solved' && s.fixes.length === 1)), s);
    r = await rating();
    check(`[${tag}] ... the rating then reads ${r.shown}: the bonus if perfect, the plain amount if corrected, the puzzle counted once`,
      r.shown === signed(s.verdict === 'perfect' ? want3.perfect : want3.plain) && r.n === 31 && r.kvN === 31 && r.kvElo === r.elo && r.last === r.delta, { r, want3 });
    f = await fits();
    check(`[${tag}] the result on screen: three rows, the board its size, ⚙ Analysis and Next on one line beside Kael`, fitsOk(f) && f.acts.length === 3 && /calc-analyze/.test(f.acts[1]), f);
    await tap('#calc-tree .calc-chip.right');
    s = await state();
    check(`[${tag}] after the hand-in the board follows the tapped chip`, s.boardFen !== s.startFen && s.boardFen === await fenAfter(three.fen, [three.moves[0], a1]), s.boardFen);
    await shot(`${tag}-3-perfect-variation`);

    // ── one move, perfect ──
    const one = await put(2);
    await rate(1260, 30);
    await play(one.moves[1]);
    await tap('#calc-submit');
    s = await state();
    r = await rating();
    const wantOne = await owed('perfect', false, 1260, 30, one.rating);
    check(`[${tag}] a perfect solve with no variation is paid in full at the hand-in (${r.shown}), saved, marked perfect, and counts for the daily streak`,
      r.shown === signed(wantOne) && r.kvElo === r.elo && r.kvN === 31 && r.kvSolved[one.id] === 2 && r.hist === Math.round(r.elo) && /\bup\b/.test(r.cls) && r.streak === 2, { r, wantOne });
    check(`[${tag}] one-move puzzle: one chip, perfect`, s.verdict === 'perfect' && s.chips.length === 1 && /\bright\b/.test(s.chips[0]), s);
    await shot(`${tag}-4-one-move`);

    // ── failed on a wrong move ──
    const two = await put(4);
    await rate(1260, 30);
    const wrong = await otherMove(await fenAfter(two.fen, [two.moves[0]]), two.moves[1]);
    await play(wrong);
    await tap('#calc-submit');
    s = await state();
    r = await rating();
    const wantFail = await owed('failed', false, 1260, 30, two.rating);
    check(`[${tag}] a failed puzzle loses rating (${r.shown}), is counted, is not marked solved and does not count for the streak`,
      wantFail < 0 && r.shown === signed(wantFail) && /\bdown\b/.test(r.cls) && r.kvN === 31 && !r.kvSolved[two.id] && r.badge === String(1260 + wantFail) && r.streak === 2, { r, wantFail });
    f = await fits();
    check(`[${tag}] the failed result on screen keeps the heights`, fitsOk(f), f);
    const line = await ev(`return [...document.querySelectorAll('#calc-tree .calc-line .calc-chip')].length;`);
    check(`[${tag}] a wrong move: failed, the chip red, the puzzle's line shown (${line} moves)`, s.verdict === 'failed' && /\bwrong\b/.test(s.chips[line]) && line === 3 && s.next, s);
    await tap('#calc-tree .calc-line .calc-chip');
    s = await state();
    check(`[${tag}] tapping the puzzle's line plays it on the board`, s.boardFen === await fenAfter(two.fen, two.moves.slice(0, 2)), s.boardFen);
    await shot(`${tag}-5-failed`);

    // ── unfinished, finished through Kael's slot ──
    await put(6);
    await rate(1260, 30);
    await play(a1);
    await tap('#calc-submit');
    s = await state();
    r = await rating();
    check(`[${tag}] a hand-in that stops short pays nothing yet`, r.shown === '' && r.n === 30 && r.kvElo === 1260, r);
    check(`[${tag}] handed in after one move: not failed, Kael writes the reply in with an empty slot after it`,
      s.phase === 'write' && s.helped && s.chips.length === 3 && /kael/.test(s.chips[1]) && s.chips[2].startsWith('?') && /kael/.test(s.chips[2]) && s.say.length > 10, s);
    await shot(`${tag}-6-kael-slot`);
    await play(a2);
    await tap('#calc-submit');
    await play(a3);
    await tap('#calc-submit');
    s = await state();
    check(`[${tag}] the slots filled and handed in again: solved, not perfect (three hand-ins)`, s.verdict === 'solved' && s.handIns === 3 && s.chips.every(c => /\bright\b/.test(c)), s);
    r = await rating();
    check(`[${tag}] a plain solve pays ${r.shown}, less than the perfect ${signed(want3.perfect)} of the same puzzle, and is marked solved`,
      r.shown === signed(want3.plain) && want3.perfect > want3.plain && r.kvN === 31 && r.kvSolved[three.id] === 1, { r, want3 });
    await shot(`${tag}-7-solved`);

    // ── the engine at hand-in ──
    const wantOpen = { plain: await owed('solved'), perfect: await owed('perfect'), hint: await owed('solved', true) };
    await putOpen();
    await rate();
    for (const u of ['e7e5', 'g1f3', 'b8c6']) await play(u);
    await tap('#calc-tree .calc-chip:not(.calc-slot)');
    await play('b1c3'); await play('g8f6');               // 2.Nc3 Nf6: sound
    await tap('#calc-submit');
    s = await state();
    check(`[${tag}] sound variation: the main-line result is there at once`, s.verdict === 'perfect' && s.next, s);
    await judged();
    s = await state();
    r = await rating();
    check(`[${tag}] ... and once the engine has accepted it the perfect bonus is paid (${r.shown}, the plain solve is ${signed(wantOpen.plain)}), counted once, the log entry brought up to date`,
      wantOpen.perfect > wantOpen.plain && r.shown === signed(wantOpen.perfect) && r.n === 31 && r.kvElo === r.elo && r.last === wantOpen.perfect && r.kvSolved['verify-open'] === 2, { r, wantOpen });
    check(`[${tag}] a variation move the engine accepts turns green and the solve stays perfect`,
      s.verdict === 'perfect' && /\bright\b/.test(s.chips[4]) && !s.fixes.length && !s.chips.some(c => /unchecked|checking/.test(c)), s);

    await putOpen();
    await rate();
    for (const u of ['e7e5', 'g1f3', 'b8c6']) await play(u);
    await tap('#calc-tree .calc-chip:not(.calc-slot)');
    await play('d1h5'); await play('e8e7');               // 2.Qh5 Ke7: walks into Qxe5 mate
    await tap('#calc-submit');
    s = await state();
    check(`[${tag}] bad variation: still perfect at the moment of the hand-in`, s.verdict === 'perfect' && s.next, s);
    r = await rating();
    check(`[${tag}] ... paid as a plain solve at that moment (${r.shown})`, r.shown === signed(wantOpen.plain) && r.n === 31, r);
    await judged();
    s = await state();
    r = await rating();
    check(`[${tag}] a corrected variation costs the perfect bonus and nothing else: still ${r.shown}, counted once, marked solved`,
      r.shown === signed(wantOpen.plain) && r.n === 31 && r.kvN === 31 && r.kvElo === r.elo && r.kvSolved['verify-open'] === 1 && r.last === wantOpen.plain, { r, wantOpen });
    check(`[${tag}] a variation move the engine rejects turns red with the engine's move beside it (${s.fixes[0]}), and perfect becomes solved`,
      s.verdict === 'solved' && /\bwrong\b/.test(s.chips[4]) && s.fixes.length === 1 && s.fixes[0].length > 2 && s.chips.slice(0, 3).every(c => /\bright\b/.test(c)), s);
    await shot(`${tag}-8-variation-corrected`);

    blockEngine = true;
    await ev(`__calc.engine.terminate();`);
    await putOpen();
    await rate();
    for (const u of ['e7e5', 'g1f3', 'b8c6']) await play(u);
    await tap('#calc-tree .calc-chip:not(.calc-slot)');
    await play('d1h5'); await play('e8e7');
    await tap('#calc-submit');
    await judged();
    s = await state();
    r = await rating();
    check(`[${tag}] the engine unable to start: the variation could not be checked, so the bonus is paid (${r.shown})`, r.shown === signed(wantOpen.perfect) && r.n === 31, r);
    check(`[${tag}] the engine unable to start: the variation stays grey, "not checked", and the main-line result stands`,
      s.verdict === 'perfect' && /unchecked/.test(s.chips[4]) && !/checking/.test(s.chips[4]) && !s.fixes.length && s.next, s);
    await shot(`${tag}-9-not-checked`);
    blockEngine = false;
    await ev(`__calc.engine.terminate();`);

    // ── the hint ──
    await put(6);
    await play(a1);                                        // my own move is selected: no empty step
    await tap('#calc-hint');
    s = await state();
    check(`[${tag}] a hint asked with no empty main-line step selected is refused and costs nothing`, !s.hinted && s.toast.length > 10, s.toast);
    await play(r1);
    await tap('#calc-hint');
    const flashed = await ev(`return [...document.querySelectorAll('#calc-board .sq.hintsq')].map(e => e.dataset.sq).join();`);
    s = await state();
    check(`[${tag}] the hint flashes the square of the piece that moves (${a2.slice(0, 2)}) and Kael names it`, flashed === a2.slice(0, 2) && s.hinted && s.say.includes(a2.slice(0, 2)), { flashed, say: s.say });
    await shot(`${tag}-10-hint`);
    for (const u of [a2, r2, a3]) await play(u);
    await tap('#calc-submit');
    s = await state();
    check(`[${tag}] solved at the first hand-in after a hint: solved, not perfect`, s.verdict === 'solved' && s.handIns === 1, s);
    await putOpen();
    await rate();
    await play('e7e5'); await play('g1f3');
    await tap('#calc-hint');
    await play('b8c6');
    await tap('#calc-submit');
    s = await state();
    r = await rating();
    check(`[${tag}] a solve with a hint pays half (${r.shown}; plain ${signed(wantOpen.plain)}, perfect ${signed(wantOpen.perfect)}) and is not a failed puzzle`,
      s.verdict === 'solved' && s.hinted && r.shown === signed(wantOpen.hint) && wantOpen.hint > 0 && wantOpen.hint < wantOpen.plain && Math.abs(wantOpen.hint * 2 - wantOpen.plain) <= 1 && r.kvSolved['verify-open'] === 1, { r, wantOpen });
    await shot(`${tag}-10b-hint-paid`);

    // ── the log, the rating's sheet and the Analysis button ──
    const logged = r.log;
    await tap('#calc-rating');
    check(`[${tag}] a tap on the rating opens its sheet`, await until(`document.querySelector('.modal-box #calc-log')`, 3000));
    const sheet = await ev(`const b = document.querySelector('.modal-box'), r = b.getBoundingClientRect(), dots = [...b.querySelectorAll('#calc-log .plog-dot')];
      return { dots: dots.length, last: dots[dots.length - 1].textContent, label: dots[dots.length - 1].getAttribute('aria-label'), counts: b.querySelector('#calc-progress-counts').textContent,
        title: b.querySelector('h3').textContent, inside: r.top >= 0 && r.bottom <= innerHeight, cut: dots.some(d => d.scrollWidth > d.clientWidth) };`);
    check(`[${tag}] ... with the rating, the solved count and one dot for every puzzle handed in this session (${sheet.dots}), the last reading ${sheet.last}`,
      sheet.dots === logged && sheet.last === signed(wantOpen.hint) && sheet.title.includes(r.badge) && /1/.test(sheet.counts) && sheet.inside && !sheet.cut && sheet.label.includes(signed(wantOpen.hint)), sheet);
    await shot(`${tag}-12-rating-sheet`);
    await tap('.modal-box #calc-log .plog-dot:last-child');
    check(`[${tag}] a dot reopens its puzzle`, await until(`document.querySelectorAll('.modal-back').length === 2`, 3000));
    await ev(`document.querySelectorAll('.modal-back').forEach(e => e.remove());`);
    await tap('#calc-rating');
    await until(`document.querySelector('.modal-box #calc-progress-chart')`, 3000);
    await tap('.modal-box #calc-progress-chart');
    check(`[${tag}] "See the chart" opens the rating's history, titled as this mode's`, await until(`document.querySelectorAll('.modal-back').length === 1 && !document.querySelector('.modal-box #calc-log') && /sellad|Sealed/.test(document.querySelector('.modal-box h3').textContent)`, 3000));
    await shot(`${tag}-13-rating-chart`);
    await ev(`document.querySelectorAll('.modal-back').forEach(e => e.remove());`);
    await tap('#calc-analyze');
    const ana = await ev(`return { screen: __app.activeScreen, line: __app.Analysis.tree.mainlinePath().map(n => n.san).filter(Boolean).join(' '), event: __app.Analysis.tree.headers.Event };`);
    check(`[${tag}] the Analysis button opens the puzzle's line on the Analysis screen`, ana.screen === 'analysis' && ana.line === 'e4 e5 Nf3 Nc6' && /sellad|Sealed/.test(ana.event), ana);
    await ev(`__app.showScreen('calc');`);
    await sleep(300);
    s = await state();
    check(`[${tag}] ... and coming back the result is still there`, s.phase === 'done' && s.verdict === 'solved' && s.next, s);

    // ── a solved puzzle is not offered again ──
    const pool = await ev(`
      const { blindPick } = await import('/js/blind-pick.js');
      const list = blindPick(__pz.PUZZLES, __calc.targetRating(), null).list;
      const keep = list.slice(0, 3).map(p => p.id);
      __calc.solved = Object.fromEntries(list.filter(p => !keep.includes(p.id)).map(p => [p.id, 1]));
      const seen = [];
      for (let i = 0; i < 12; i++) { await __calc.next(); seen.push(__calc.current.id); }
      const twice = seen.some((id, i) => i && id === seen[i - 1]);
      __calc.solved = Object.fromEntries(list.map(p => [p.id, 2]));
      await __calc.next();
      return { pool: list.length, keep, seen: [...new Set(seen)], twice, afterAll: !!__calc.current && __calc.phase === 'write' };`);
    check(`[${tag}] with all but three of the ${pool.pool} puzzles in reach solved, twelve Next in a row bring only those three, never the same twice running`,
      pool.pool > 20 && pool.seen.every(id => pool.keep.includes(id)) && !pool.twice, pool);
    check(`[${tag}] ... and with every one solved a puzzle still comes up`, pool.afterAll, pool);
    await rate();
    await until(`__calc.ready`, 4000);

    // ── the mode's own theme, difficulty and auto-next ──
    const before = { theme: await ev(`return String(__app.Puzzles.themeFilter);`), diff: await kv('puzzleDifficulty'), auto: await kv('puzzleAutoNext') };
    // (a puzzle is already up for writing: the no-repeat check above ends on one)
    await until(`__calc.phase === 'write' && __calc.ready`, 6000);
    await tap('#calc-options');
    check(`[${tag}] the gear opens the settings sheet with a theme row on top`, await until(`document.querySelector('.modal-box .options-theme')`, 3000));
    await shot(`${tag}-11-settings`);
    await tap('.modal-box .seg button[data-v="250"]');
    await tapIn('.modal-box .theme-pick-row input');
    await tapIn('.modal-box .options-theme');
    check(`[${tag}] the theme row opens the theme picker`, await until(`document.querySelector('.modal-box input[data-th="fork"]')`, 3000));
    await tapIn('.modal-box input[data-th="fork"]');
    await tapIn('.modal-box .btn.primary.big');
    await until(`__calc.phase === 'write' && __calc.ready && __calc.current.themes.includes('fork')`, 8000);
    const mine = { theme: await kv('calcTheme'), diff: await kv('calcDifficulty'), auto: await kv('calcAutoNext'), cur: await ev(`return __calc.current.themes;`),
      pz: { theme: await ev(`return String(__app.Puzzles.themeFilter);`), diff: await kv('puzzleDifficulty'), auto: await kv('puzzleAutoNext') } };
    check(`[${tag}] theme, difficulty and auto-next chosen here are saved as calcTheme, calcDifficulty and calcAutoNext, and a fork puzzle comes up`,
      JSON.stringify(mine.theme) === '["fork"]' && mine.diff === 250 && mine.auto === true && mine.cur.includes('fork'), mine);
    check(`[${tag}] ... and the Puzzles theme, difficulty and auto-next are what they were`, JSON.stringify(mine.pz) === JSON.stringify(before), { before, after: mine.pz });
    // auto-next: a solved puzzle is followed by the next one, nothing tapped
    const one2 = await put(2, 1);
    await play(one2.moves[1]);
    await tap('#calc-submit');
    check(`[${tag}] auto-next on: after a solve the next puzzle comes by itself`, await until(`__calc.phase === 'write' && __calc.current.id !== ${JSON.stringify(one2.id)}`, 8000));
    // the other way round: a theme chosen in Puzzles
    await ev(`__app.showScreen('puzzles');`);
    await until(`__app.Puzzles.loaded && __app.Puzzles.current`, 10000);
    await tap('#puzzle-theme-btn');
    await until(`document.querySelector('.modal-box input[data-th="pin"]')`, 3000);
    await tapIn('.modal-box input[data-th="pin"]');
    await tapIn('.modal-box .btn.primary.big');
    await sleep(400);
    const cross = { pz: await ev(`return [...__app.Puzzles.themeFilter].join();`), calc: await ev(`return [...__calc.theme].join();`), kv: await kv('calcTheme') };
    check(`[${tag}] a theme chosen in Puzzles (pin) leaves the Sealed Moves theme (fork) alone`, cross.pz === 'pin' && cross.calc === 'fork' && JSON.stringify(cross.kv) === '["fork"]', cross);
    const paid = await ev(`
      const P = __app.Puzzles, out = [];
      for (const [elo, n, win] of [[1100.4, 30, true], [1100.4, 30, false], [1010, 3, true], [640, 3, false]]) {
        P.elo = elo; P.attemptCount = n; P.eloRecorded = false;
        const rating = P.current.rating, K = n < 10 ? 192 : 24;
        const old = Math.max(600, elo + K * ((win ? 1 : 0) - 1 / (1 + Math.pow(10, (rating - elo) / 400))));
        P.recordResult(win);
        out.push({ rating, got: P.elo, old, same: P.elo === old, n: P.attemptCount === n + 1 });
      }
      P.eloRecorded = true;
      return out;`);
    check(`[${tag}] Puzzles, live: four results are paid exactly what the old inline arithmetic paid`, paid.every(p => p.same && p.n), paid);
    await ev(`const db = await import('/js/db.js'); __app.Puzzles.elo = 1460; await db.kvSet('puzzleElo', 1460); __app.Puzzles.themeFilter = 'random'; __app.showScreen('calc');`);
    await sleep(300);
    // back to the defaults, through the sheet, for the next round
    await tap('#calc-options');
    await until(`document.querySelector('.modal-box .options-theme')`, 3000);
    await tap('.modal-box .seg button[data-v="0"]');
    await tapIn('.modal-box .theme-pick-row input');
    await tapIn('.modal-box .options-theme');
    await until(`document.querySelector('.modal-box #tp-random')`, 3000);
    await tapIn('.modal-box #tp-random');
    await tapIn('.modal-box .btn.primary.big');
    await sleep(300);
    const reset = { theme: await kv('calcTheme'), diff: await kv('calcDifficulty'), auto: await kv('calcAutoNext') };
    check(`[${tag}] set back to random, normal and off`, reset.theme === 'random' && reset.diff === 0 && reset.auto === false, reset);

    // ── the Solution button, and Next ──
    await put(4, 1);
    await tap('#calc-solution');
    s = await state();
    check(`[${tag}] Solution before solving counts as failed and shows the line`, s.verdict === 'failed' && s.chips.length === 3 && s.next, s);
    r = await rating();
    check(`[${tag}] ... and costs rating like any failed puzzle (${r.shown})`, r.delta < 0 && /\bdown\b/.test(r.cls), r);
    await tap('#calc-next');
    check(`[${tag}] Next puts a new puzzle up`, await until(`__calc.phase === 'write' && __calc.ready`, 6000));
    r = await rating();
    check(`[${tag}] ... with the last change gone from beside the rating`, r.shown === '' && r.badge === String(Math.round(r.elo)), r);
    check(`[${tag}] through all of it the PUZZLE rating was never touched by this mode`, r.pzElo === pz0.pzElo && r.pzN !== undefined, { before: pz0, after: { pzElo: r.pzElo, pzN: r.pzN } });

    // ── after a reload Kael does not explain again, and the rating is the saved one ──
    const savedElo = r.kvElo;
    await send('Page.reload', {});
    await sleep(2500);
    await ev(`document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove());
      window.__app = await import('/js/app.js'); window.__calc = (await import('/js/calc-ui.js')).CalcUI;
      __app.showScreen('calc');`);
    await until(`__calc.ready`, 8000);
    await sleep(1200);
    const again = await ev(`return { intro: !!document.querySelector('#calc-intro-ok'), modal: document.querySelectorAll('.modal-back').length, elo: __calc.elo, badge: document.getElementById('calc-elo').textContent };`);
    check(`[${tag}] after a reload: no explanation again, and the rating is the saved one (${again.badge})`, !again.intro && !again.modal && again.elo === savedElo && again.badge === String(Math.round(savedElo)), again);
  }
} catch (e) { failed = true; console.error('\nSTOPPED: ' + e.message); }

const bad = checks.filter(c => !c.ok);
console.log(`\n${checks.length - bad.length} of ${checks.length} checks passed${bad.length ? ' — FAILED: ' + bad.map(c => c.name).join(' | ') : ''}`);
// App Check cannot answer on localhost (403) and sw.js is refused on purpose (404).
// The engine file is refused on purpose for one check in each round (404 too).
const other = errors.filter(e => !/firebaseappcheck|AppCheck|app-check|bad HTTP response code \(404\) was received when fetching the script|status of 403|stockfish/i.test(e));
console.log(other.length ? `Console errors (${other.length}):\n  ` + [...new Set(other)].join('\n  ') : 'No console errors (other than App Check and the refused service worker).');
chrome.kill();
server.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(failed || bad.length ? 1 : 0);
