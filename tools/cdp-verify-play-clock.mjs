// Headless-Chrome check of the clock in Play. Serves the app itself and really
// runs Stockfish. Dev tool, not shipped.
//
//   node tools/cdp-verify-play-clock.mjs <outDir>
//
// READ FROM THE PAGE (real games, real engine):
//   - a game with no clock: no clock row, Undo there and working, the saved
//     record carries no time control;
//   - a 5+3 game: only the side to move counts down, the increment is added,
//     Undo is gone, a pre-move still fires;
//   - time that passes while the page is frozen is still taken off the clock;
//   - a fallen flag ends the game and the saved record and its PGN say so;
//   - Analyse still opens the game;
//   - the engine's flag is a win, and the win counts for the level's badge.
// PICTURES: the setup screen and a timed game at 375px, light and dark, Spanish
// and English, plus the history list, in <outDir>, to be opened and looked at.
//
// NOT A PHONE: locking the screen and switching apps are imitated here by
// freezing the page. Nobody has tried them on a real device with this tool.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/cdp-verify-play-clock.mjs <outDir>'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 420000).unref();
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = url => new Promise((res, rej) => {
  http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});

const port = 9900 + Math.floor(Math.random() * 90);
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
});
await new Promise(r => server.listen(port, '127.0.0.1', r));

const dbg = 9300 + Math.floor(Math.random() * 600);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-'));
const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${dbg}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let ws, msgId = 0;
const pending = new Map();
for (let i = 0; i < 40; i++) {
  try {
    const page = (await getJSON(`http://127.0.0.1:${dbg}/json`)).find(t => t.type === 'page');
    if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
  } catch {}
  await sleep(250);
}
await new Promise(r => ws.on('open', r));
const pageErrors = [];
ws.on('message', m => {
  const msg = JSON.parse(m);
  if (msg.method === 'Runtime.exceptionThrown') pageErrors.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || 'exception');
  if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result); }
});
const send = (method, params = {}) => { const id = ++msgId; ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => pending.set(id, { res, rej })); };
const evalP = async expr => {
  const r = await send('Runtime.evaluate', { expression: `(async()=>{ ${expr} })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
  return r.result.value;
};
const shot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
};

let bad = 0;
const say = (ok, text) => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`); };

// Everything the checks read, in one go.
const STATE = `
  const { Play } = await import('/js/app.js');
  const pc = await import('/js/play-clock.js');
  const now = Date.now(), c = Play.clock, bot = Play.playerColor === 'w' ? 'b' : 'w';
  const el = id => document.getElementById(id);
  return {
    plies: Play.chess ? Play.chess.history() : [], over: Play.over, thinking: Play.thinking, flag: Play.flag,
    myTurn: !!Play.chess && Play.chess.turn() === Play.playerColor, level: Play.level,
    hasClock: !!c, me: c ? pc.timeLeft(c, Play.playerColor, now) : null, bot: c ? pc.timeLeft(c, bot, now) : null,
    turn: c ? c.turn : null, running: c ? c.since !== null : null,
    rowHidden: el('play-clocks').classList.contains('hidden'), undoHidden: el('play-undo').classList.contains('hidden'),
    meRun: el('play-clock-me').classList.contains('run'), botRun: el('play-clock-bot').classList.contains('run'),
    meLow: el('play-clock-me').classList.contains('low'),
    meText: el('play-clock-me').querySelector('.pc-time').textContent, botText: el('play-clock-bot').querySelector('.pc-time').textContent,
    meName: el('play-clock-me').querySelector('.pc-name').textContent, botName: el('play-clock-bot').querySelector('.pc-name').textContent,
    status: el('play-status').textContent,
  };`;
const state = () => evalP(STATE);
const until = async (test, ms = 60000) => {
  const end = Date.now() + ms;
  for (;;) {
    const s = await state();
    if (test(s)) return s;
    if (Date.now() > end) throw new Error('timed out waiting; last state ' + JSON.stringify(s).slice(0, 400));
    await sleep(120);
  }
};
const move = (from, to) => evalP(`const { Play } = await import('/js/app.js'); Play.userMove({ from: '${from}', to: '${to}' });`);
const closeModals = () => evalP(`document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove());`);
const records = () => evalP(`const db = await import('/js/db.js'); const { items } = await db.pageHistory({ count: 10 });
  const out = []; for (const r of items) { const full = await db.getHistoryGame(r.id); out.push({ ...r, pgn: full.pgn }); } return out;`);
const openPlay = async () => {
  await closeModals();
  await evalP(`document.querySelector('#tabbar button[data-screen="play"]').click();
    if (!document.getElementById('play-game').classList.contains('hidden')) document.getElementById('play-back').click();`);
  await sleep(400);
};
const start = async tc => {
  await evalP(`document.querySelector('#play-color button[data-v="w"]').click();
    document.querySelector('#play-tc button[data-v="${tc}"]').click();
    document.getElementById('play-start').click();`);
  await sleep(300);
};

try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await send('Page.navigate', { url: `http://localhost:${port}` });
  await sleep(4000);
  await evalP(`const db = await import('/js/db.js'); await db.kvSet('onboardingDone', true); await db.kvSet('tourDone', true);
    localStorage.setItem('lang', 'es'); localStorage.setItem('tourDone', '1');`);
  await send('Page.reload', {});
  await sleep(3500);

  // ── 1. no clock: as before ──
  await openPlay();
  const setup = await evalP(`return { on: document.querySelector('#play-tc button.on').dataset.v,
    labels: [...document.querySelectorAll('#play-tc button')].map(b => b.textContent) };`);
  say(setup.on === '' && setup.labels.length === 7, `setup: "no clock" is the default; the choices read ${setup.labels.join(' | ')}`);
  await start('');
  let s = await state();
  say(!s.hasClock && s.rowHidden && !s.undoHidden, `no clock: no clock row, Undo on show (clock ${s.hasClock}, row hidden ${s.rowHidden}, undo hidden ${s.undoHidden})`);
  await move('e2', 'e4');
  s = await until(x => x.plies.length >= 2 && x.myTurn && !x.thinking, 90000);
  say(true, `no clock: the engine answered 1.e4 with ${s.plies[1]}`);
  await move('d2', 'd4');
  s = await until(x => x.plies.length >= 4 && x.myTurn && !x.thinking);
  await evalP(`document.getElementById('play-undo').click();`);
  s = await state();
  say(s.plies.length === 2, `no clock: Undo took the last pair of moves back (${s.plies.length} plies left)`);
  await move('d2', 'd4');
  s = await until(x => x.plies.length >= 4 && x.myTurn && !x.thinking);
  await evalP(`document.getElementById('play-back').click();`);
  await sleep(600);
  let recs = await records();
  say(recs.length === 1 && !('timeControl' in recs[0]) && recs[0].endReason === 'abandoned' && !/TimeControl/.test(recs[0].pgn),
    `no clock: the saved record has no time control (endReason ${recs[0]?.endReason}, keys ${Object.keys(recs[0] || {}).filter(k => k !== 'pgn').join(',')})`);

  // ── 2. a 5+3 game ──
  await start('5+3');
  s = await state();
  say(s.hasClock && !s.rowHidden && s.undoHidden, `5+3: the clock row is on show and Undo is gone`);
  say(s.meRun && !s.botRun && s.turn === 'w', `5+3: my clock is the one framed at the start (me ${s.meRun}, engine ${s.botRun})`);
  say(/^[45]:\d\d$/.test(s.meText) && s.botText === '5:00', `5+3: the clocks read ${s.meText} and ${s.botText}; the names read "${s.meName}" and "${s.botName}"`);
  const a0 = s;
  await sleep(1500);
  const a1 = await state();
  say(a0.me - a1.me >= 1300 && a0.me - a1.me <= 2600 && a1.bot === 300000,
    `5+3: after 1.5 s mine fell by ${a0.me - a1.me} ms and the engine's by ${300000 - a1.bot}`);
  await evalP(`document.getElementById('play-undo').click();`);
  await move('e2', 'e4');
  const b0 = await state();
  say(b0.plies.length === 1 && b0.me > a1.me + 2000 && b0.me <= a1.me + 3000 && b0.turn === 'b' && b0.botRun && !b0.meRun,
    `5+3: my move added the increment (${a1.me} -> ${b0.me}) and passed the clock to the engine`);
  // a pre-move, queued while the engine thinks
  await evalP(`const { Play } = await import('/js/app.js'); Play.board.premove = { from: 'd2', to: 'd4' };`);
  await sleep(150);
  const b1 = await state();
  say(b1.me === b0.me, `5+3: my clock stands still while the engine thinks (${b0.me} -> ${b1.me})`);
  s = await until(x => x.plies.length >= 4 && x.myTurn && !x.thinking);
  say(s.plies[2] === 'd4', `5+3: the pre-move fired (${s.plies.slice(0, 4).join(' ')})`);
  say(s.bot < 300000 + 6000 && s.bot !== 300000 && s.me > b0.me + 2500,
    `5+3: after two moves each, me ${s.me} ms (pre-move cost nothing, +3 s), engine ${s.bot} ms`);

  // ── 3. time passes while the page is frozen ──
  const f0 = await state();
  let frozen = true;
  try { await send('Page.setWebLifecycleState', { state: 'frozen' }); } catch (e) { frozen = false; console.log('     (could not freeze the page: ' + e.message + ')'); }
  await sleep(4000);
  if (frozen) await send('Page.setWebLifecycleState', { state: 'active' });
  const hiddenAfter = await evalP(`return document.hidden;`);
  const tries = [];
  for (const [method, params] of [['Page.bringToFront', {}], ['Emulation.setFocusEmulationEnabled', { enabled: true }],
    ['Page.setWebLifecycleState', { state: 'active' }]]) {
    if (!(await evalP(`return document.hidden;`))) break;
    try { await send(method, params); } catch (e) { tries.push(method + ' refused'); continue; }
    await sleep(500);
    tries.push(`${method} -> hidden ${await evalP(`return document.hidden;`)}`);
  }
  console.log('     waking: ' + tries.join('; '));
  await sleep(600);
  const f1 = await state();
  const shownAgain = await evalP(`return !document.hidden;`);
  say(shownAgain && f0.me - f1.me >= 3900 && f0.me - f1.me <= 6500 && f1.meText !== f0.meText,
    `${frozen ? 'page frozen' : 'page left alone'} for 4 s (hidden on waking: ${hiddenAfter}): back in front, my clock had fallen by ${f0.me - f1.me} ms and reads ${f0.meText} -> ${f1.meText}`);

  // ── 4. my flag falls ──
  await evalP(`const { Play } = await import('/js/app.js'); const c = Play.clock; c.left[Play.playerColor] = (Date.now() - c.since) + 19000;`);
  await sleep(350);
  s = await state();
  say(s.meLow && s.meText === '0:19', `under 20 s my clock turns red (reads ${s.meText}, low ${s.meLow})`);
  await evalP(`const { Play } = await import('/js/app.js'); const c = Play.clock; c.left[Play.playerColor] = (Date.now() - c.since) + 700;`);
  s = await until(x => x.over, 5000);
  say(s.flag === 'w' && s.status === 'Se te acabó el tiempo. El motor gana.' && s.meText === '0:00' && !s.meRun,
    `my flag fell: the game is over, the status reads "${s.status}", my clock ${s.meText}`);
  await sleep(700);
  await closeModals();
  recs = await records();
  const lost = recs[0];
  say(recs.length === 2 && lost.endReason === 'timeout' && lost.outcome === 'loss' && lost.result === '0-1'
    && lost.timeControl && lost.timeControl.base === 300 && lost.timeControl.inc === 3,
    `saved: endReason ${lost.endReason}, outcome ${lost.outcome}, result ${lost.result}, timeControl ${JSON.stringify(lost.timeControl)}`);
  say(/\[TimeControl "300\+3"\]/.test(lost.pgn) && /\[Result "0-1"\]/.test(lost.pgn) && /1\. e4/.test(lost.pgn),
    `saved PGN carries [TimeControl "300+3"] and [Result "0-1"]`);
  const dead = await state();
  await move('g1', 'f3');
  await sleep(300);
  s = await state();
  say(s.plies.length === dead.plies.length && s.me === 0, `after the flag no move is taken and the clock stays stopped`);

  // ── 5. Analyse still opens the game ──
  await evalP(`document.getElementById('play-analyze').click();`);
  await sleep(1200);
  const ana = await evalP(`const { Analysis } = await import('/js/app.js');
    return { shown: !document.getElementById('screen-analysis').classList.contains('hidden'),
      pgn: Analysis.tree && Analysis.tree.toPgn ? Analysis.tree.toPgn() : '' };`);
  say(ana.shown && /1\. e4/.test(ana.pgn) && /d4/.test(ana.pgn) && /\[Result "0-1"\]/.test(ana.pgn),
    `Analyse opened the game on the Analysis screen with its moves and result (${ana.pgn.replace(/\s+/g, ' ').slice(-70)})`);

  // ── 6. the engine's flag: a win, and it counts for the badge ──
  await openPlay();
  await start('3+2');
  await move('e2', 'e4');
  s = await until(x => x.plies.length >= 2 && x.myTurn && !x.thinking);
  await move('d2', 'd4');
  s = await until(x => x.plies.length >= 4 && x.myTurn && !x.thinking);
  const beatenBefore = await evalP(`const db = await import('/js/db.js'); return await db.kvGet('engineLevelsBeaten', {});`);
  await evalP(`const { Play } = await import('/js/app.js'); Play.clock.left[Play.playerColor === 'w' ? 'b' : 'w'] = 1;`);
  await move('g1', 'f3');
  s = await until(x => x.over, 8000);
  say(s.flag === 'b' && s.status === 'Al motor se le acabó el tiempo. ¡Ganaste! 🎉' && s.botText === '0:00',
    `the engine's flag fell: "${s.status}"`);
  await sleep(900);
  await closeModals();
  recs = await records();
  const beaten = await evalP(`const db = await import('/js/db.js'); return await db.kvGet('engineLevelsBeaten', {});`);
  say(recs.length === 3 && recs[0].endReason === 'timeout' && recs[0].outcome === 'win' && recs[0].result === '1-0'
    && recs[0].timeControl.base === 180 && recs[0].timeControl.inc === 2,
    `saved: endReason ${recs[0].endReason}, outcome ${recs[0].outcome}, result ${recs[0].result}, timeControl ${JSON.stringify(recs[0].timeControl)}`);
  say(!beatenBefore[s.level] && beaten[s.level] === true, `the win on time counts for the level's badge (level ${s.level}: ${JSON.stringify(beaten)})`);

  // ── 7. pictures: 375px, light and dark, Spanish and English ──
  for (const [lang, scheme] of [['es', 'light'], ['es', 'dark'], ['en', 'light'], ['en', 'dark']]) {
    const tag = `${lang}-${scheme}`;
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await evalP(`localStorage.setItem('lang', '${lang}');`);
    await send('Page.reload', {});
    await sleep(3500);
    await openPlay();
    await evalP(`document.querySelector('#play-tc button[data-v="5+3"]').click(); window.scrollTo(0, 0);`);
    await sleep(300);
    const L = await evalP(`const bs = [...document.querySelectorAll('#play-tc button')];
      return { pageW: document.documentElement.scrollWidth, label: document.querySelector('#play-tc').previousElementSibling.textContent,
        rows: bs.map(b => { const r = b.getBoundingClientRect(); return { t: b.textContent, left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), clipped: b.scrollWidth > b.clientWidth + 1 }; }) };`);
    say(L.pageW <= 375 && L.rows.every(r => r.left >= 0 && r.right <= 375 && !r.clipped) && L.rows[1].top === L.rows[3].top && L.rows[4].top === L.rows[6].top && L.rows[0].top < L.rows[1].top,
      `${tag} setup: "${L.label}" / "${L.rows[0].t}" on its own row, then two rows of three; nothing wider than 375 (page ${L.pageW})`);
    await shot(`play-clock-setup-${tag}`);
    await start('5+3');
    await move('e2', 'e4');
    await until(x => x.plies.length >= 2 && x.myTurn && !x.thinking, 90000);
    const G = await evalP(`const box = id => { const e = document.getElementById(id), r = e.getBoundingClientRect(), n = e.querySelector('.pc-name');
        return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), h: Math.round(r.height), name: n.textContent, cut: n.scrollWidth > n.clientWidth + 1, time: e.querySelector('.pc-time').textContent }; };
      window.scrollTo(0, 0);
      return { pageW: document.documentElement.scrollWidth, status: document.getElementById('play-status').textContent, bot: box('play-clock-bot'), me: box('play-clock-me'),
        movesBottom: Math.round(document.getElementById('play-moves').getBoundingClientRect().bottom) };`);
    say(G.pageW <= 375 && G.bot.left >= 0 && G.me.right <= 375 && G.bot.right <= G.me.left && G.bot.top === G.me.top && !G.bot.cut && !G.me.cut,
      `${tag} game: "${G.bot.name}" ${G.bot.time} | "${G.me.name}" ${G.me.time}, one row, no name cut, page ${G.pageW}, status "${G.status}", move list ends at ${G.movesBottom} of 812`);
    await shot(`play-clock-game-${tag}`);
    if (scheme === (lang === 'es' ? 'light' : 'dark')) {
      // low on time, then the flag, then the history list
      await evalP(`const { Play } = await import('/js/app.js'); const c = Play.clock; c.left[Play.playerColor] = (Date.now() - c.since) + 12400;`);
      await sleep(400);
      await shot(`play-clock-low-${tag}`);
      await move('d2', 'd4');
      await until(x => x.plies.length >= 4 && x.myTurn && !x.thinking);
      await evalP(`const { Play } = await import('/js/app.js'); const c = Play.clock; c.left[Play.playerColor] = (Date.now() - c.since) + 300;`);
      const e = await until(x => x.over, 5000);
      await sleep(700);
      await closeModals();
      await sleep(200);
      say(e.status.length > 10, `${tag} flag: the status reads "${e.status}"`);
      await shot(`play-clock-flag-${tag}`);
      await evalP(`document.getElementById('play-back').click(); document.getElementById('play-history-btn').click();`);
      await sleep(900);
      const H = await evalP(`return [...document.querySelectorAll('#hist-list .hist-item')].slice(0, 2).map(i => i.innerText.replace(/\\n/g, ' / '));`);
      say(H.length > 0 && /5\+3/.test(H[0]), `${tag} history: the newest card reads "${H[0]}"`);
      await shot(`play-clock-history-${tag}`);
      await evalP(`document.getElementById('hist-back').click();`);
    }
  }
  say(pageErrors.length === 0, `no uncaught error on the page${pageErrors.length ? ': ' + pageErrors.slice(0, 3).join(' | ') : ''}`);
} catch (e) { say(false, e.message); }
finally {
  try { ws.close(); } catch {}
  proc.kill();
  await new Promise(r => { server.close(r); server.closeAllConnections(); });
  await sleep(800);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
console.log(bad ? `\n${bad} FAILED` : '\nALL PASSED');
process.exit(bad ? 1 : 0);
