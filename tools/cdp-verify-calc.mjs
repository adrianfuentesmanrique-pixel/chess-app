// Sealed Moves ("calc"), the fifth puzzle mode: the frozen board, the answer
// tree and the hand-in. Dev tool, not shipped. Headless Chrome over CDP,
// signed out, no service worker.
//
//   node tools/cdp-verify-calc.mjs <outDir>     about two minutes
//
// At 375 x 667 in ES and EN, light and dark. REALLY TAPPED (CDP touch events):
// every square, chip, slot and button. CALLED, not tapped: CalcUI.load(), to
// put up a puzzle of a known length from the app's own files.
// Checked: the layout (the tree keeps three rows, nothing scrolls but the
// tree, no chip label cut short); the board does not move while moves are
// written; an illegal move is refused; delete; a one-move and a three-move
// puzzle solved perfectly; one failed on a wrong move; one handed in unfinished
// and finished through Kael's slot; a side variation drawn "not checked".
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
const state = () => ev(`
  const c = __calc, tree = document.getElementById('calc-tree');
  return { phase: c.phase, verdict: c.verdict, handIns: c.handIns, helped: c.helped, boardFen: c.board.fen, startFen: c.main.fen,
    chips: [...tree.querySelectorAll('.calc-chip')].map(b => b.textContent + '|' + b.className.replace('calc-chip', '').trim()),
    say: document.getElementById('calc-say-text').textContent, toast: document.getElementById('toast').classList.contains('hidden') ? '' : document.getElementById('toast').textContent,
    next: !document.getElementById('calc-next').classList.contains('hidden'), submit: !document.getElementById('calc-submit').classList.contains('hidden') };`);
// Puts up a loaded puzzle with `plies` moves (the opponent's first included)
// and no promotion, and returns it.
const put = async (plies, skip = 0) => {
  const p = await ev(`
    const list = __pz.PUZZLES.filter(p => p.moves.length === ${plies} && p.moves.every(u => u.length === 4));
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
    await ev(`localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1');`);
    await send('Page.reload', {});
    await sleep(2500);
    await ev(`document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove());
      window.__app = await import('/js/app.js'); window.__calc = (await import('/js/calc-ui.js')).CalcUI;
      window.__pz = await import('/js/puzzles.js'); window.__Chess = (await import('/vendor/chess.js')).Chess;
      __app.showScreen('puzzles');`);
    await tap('#screen-puzzles .puzzle-modes [data-v="calc"]');
    check(`[${tag}] the fifth chip on Puzzles, really tapped, opens the mode`, await until(`__app.activeScreen === 'calc'`, 6000));
    check(`[${tag}] a puzzle comes up by itself, with the opponent's move highlighted`,
      await until(`__calc.ready && document.querySelectorAll('#calc-board .sq.lastmove').length === 2`, 8000));

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
        underKael: act.some(a => a.right > kael.left && a.bottom > kael.top) };`);
    check(`[${tag}] mode row: five chips, three over two, none cut short, "calc" lit`, lay.tops === 2 && lay.perRow.join() === '3,2' && lay.whole && lay.lit === 'calc', lay.labels);
    check(`[${tag}] 375 x 667: the tree keeps three rows (${lay.tree}px >= 132), the action row is on screen, nothing scrolls, the board is square (${lay.board}px)`,
      lay.tree >= 132 && lay.actionsBottom <= lay.h && lay.pageScroll <= 1 && lay.sideScroll <= 0 && lay.boardSquare && lay.board >= 240 && lay.chipH >= 40 && !lay.underKael, lay);
    await shot(`${tag}-1-empty`);

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
    const rowsSeen = await ev(`const t = document.getElementById('calc-tree'); return { rows: t.querySelectorAll('.calc-row').length, scrolls: t.scrollHeight > t.clientHeight };`);
    check(`[${tag}] the variation is its own row (four rows in all)`, rowsSeen.rows === 4, rowsSeen);
    await tap('#calc-submit');
    s = await state();
    check(`[${tag}] three-move puzzle, whole line right at the first hand-in: perfect, five chips green, the variation's two grey`,
      s.verdict === 'perfect' && s.chips.filter(c => /\bright\b/.test(c)).length === 5 && s.chips.filter(c => /unchecked/.test(c)).length === 2 && s.next && !s.submit, s);
    await tap('#calc-tree .calc-chip.right');
    s = await state();
    check(`[${tag}] after the hand-in the board follows the tapped chip`, s.boardFen !== s.startFen && s.boardFen === await fenAfter(three.fen, [three.moves[0], a1]), s.boardFen);
    await shot(`${tag}-3-perfect-variation`);

    // ── one move, perfect ──
    const one = await put(2);
    await play(one.moves[1]);
    await tap('#calc-submit');
    s = await state();
    check(`[${tag}] one-move puzzle: one chip, perfect`, s.verdict === 'perfect' && s.chips.length === 1 && /\bright\b/.test(s.chips[0]), s);
    await shot(`${tag}-4-one-move`);

    // ── failed on a wrong move ──
    const two = await put(4);
    const wrong = await otherMove(await fenAfter(two.fen, [two.moves[0]]), two.moves[1]);
    await play(wrong);
    await tap('#calc-submit');
    s = await state();
    const line = await ev(`return [...document.querySelectorAll('#calc-tree .calc-line .calc-chip')].length;`);
    check(`[${tag}] a wrong move: failed, the chip red, the puzzle's line shown (${line} moves)`, s.verdict === 'failed' && /\bwrong\b/.test(s.chips[line]) && line === 3 && s.next, s);
    await tap('#calc-tree .calc-line .calc-chip');
    s = await state();
    check(`[${tag}] tapping the puzzle's line plays it on the board`, s.boardFen === await fenAfter(two.fen, two.moves.slice(0, 2)), s.boardFen);
    await shot(`${tag}-5-failed`);

    // ── unfinished, finished through Kael's slot ──
    await put(6);
    await play(a1);
    await tap('#calc-submit');
    s = await state();
    check(`[${tag}] handed in after one move: not failed, Kael writes the reply in with an empty slot after it`,
      s.phase === 'write' && s.helped && s.chips.length === 3 && /kael/.test(s.chips[1]) && s.chips[2].startsWith('?') && /kael/.test(s.chips[2]) && s.say.length > 10, s);
    await shot(`${tag}-6-kael-slot`);
    await play(a2);
    await tap('#calc-submit');
    await play(a3);
    await tap('#calc-submit');
    s = await state();
    check(`[${tag}] the slots filled and handed in again: solved, not perfect (three hand-ins)`, s.verdict === 'solved' && s.handIns === 3 && s.chips.every(c => /\bright\b/.test(c)), s);
    await shot(`${tag}-7-solved`);

    // ── the Solution button, and Next ──
    await put(4, 1);
    await tap('#calc-solution');
    s = await state();
    check(`[${tag}] Solution before solving counts as failed and shows the line`, s.verdict === 'failed' && s.chips.length === 3 && s.next, s);
    await tap('#calc-next');
    check(`[${tag}] Next puts a new puzzle up`, await until(`__calc.phase === 'write' && __calc.ready`, 6000));
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
