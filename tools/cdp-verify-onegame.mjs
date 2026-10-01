// Headless-Chrome verification for the Openings tab's "practice one game only"
// toggle. The in-app pane does not composite, so screenshots come from a real
// headless Chrome over CDP. Dev tool, not shipped.
//
//   node tools/cdp-verify-onegame.mjs http://localhost:9186 <outDir>
//
// SEEDED (written straight into IndexedDB through js/db.js, in the same record
// shape the PGN importer writes): four bases — see SEED below. Everything after
// the seed is driven through the page's own controls: the checkbox, the game
// rows and the Start button are clicked, the search box gets real input events,
// the <select> is set and fires its change event. The player's own moves go in
// through Trainer.userMove — the board's onMove path — not through taps.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';

const APP_URL = process.argv[2] || 'http://localhost:9186';
const OUT = process.argv[3] || path.join(os.tmpdir(), 'onegame-shots');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-og-'));
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 420000).unref();

const getJSON = url => new Promise((res, rej) => {
  http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });

let ws, msgId = 0;
const pending = new Map();
const errors = [];
function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
}
async function evalP(expr) {
  const r = await send('Runtime.evaluate', { expression: `(async()=>{ ${expr} })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
  return r.result.value;
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
  console.error('  shot ' + name);
}
async function load(lang, scheme) {
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
  await send('Page.navigate', { url: APP_URL });
  await sleep(2500);
  await evalP(`localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1');`);
  await send('Page.reload', {});
  await sleep(3500);
  await evalP(`document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove());`);
}

for (let i = 0; i < 40; i++) {
  try {
    const targets = await getJSON(`http://127.0.0.1:${PORT}/json`);
    const page = targets.find(t => t.type === 'page');
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
  } else if (msg.method === 'Runtime.exceptionThrown') {
    errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    errors.push(msg.params.args.map(a => a.value ?? a.description).join(' '));
  }
});
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });

// ── the seed ──
// "Verify Repertoire": two real games (Morphy's Opera Game; Anderssen's Immortal
// Game) and one opening study with variations and comments.
// The book builder walks 40 plies deep, so the 45-ply Immortal Game counts 41.
// "Verify Single": the Opera Game alone. "Verify Big": 450 SYNTHETIC one-move
// games, only there to exercise the picker's search and paging.
const OPERA = `[Event "Paris Opera"]\n[Date "1858.??.??"]\n[White "Morphy, Paul"]\n[Black "Duke Karl / Count Isouard"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;
const IMMORTAL = `[Event "London"]\n[Date "1851.06.21"]\n[White "Anderssen, Adolf"]\n[Black "Kieseritzky, Lionel"]\n[Result "1-0"]\n\n1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5 8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 Ng8 15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6 21. Nxg7+ Kd8 22. Qf6+ Nxf6 23. Be7# 1-0`;
const STUDY = `[Event "Queen's Gambit study"]\n[Date "2026.10.01"]\n[White "Study"]\n[Black "Queen's Gambit"]\n[Result "*"]\n\n1. d4 {Queen's pawn first.} d5 2. c4 e6 (2... dxc4 {The Queen's Gambit Accepted.} 3. Nf3 Nf6) (2... c6 3. Nf3) 3. Nc3 Nf6 4. Bg5 Be7 *`;
const SEED = `
  const db = await import('/js/db.js');
  const hdr = (pgn, k) => (pgn.match(new RegExp('\\\\[' + k + ' "([^"]*)"')) || [])[1] || '';
  const rec = (baseId, pgn, i) => ({ baseId, white: hdr(pgn, 'White'), black: hdr(pgn, 'Black'), event: hdr(pgn, 'Event'),
    date: hdr(pgn, 'Date'), result: hdr(pgn, 'Result'), pgn, updatedAt: Date.now() - i * 1000 });
  const rep = await db.createBase('Verify Repertoire');
  await db.addGames([${JSON.stringify(OPERA)}, ${JSON.stringify(IMMORTAL)}, ${JSON.stringify(STUDY)}].map((p, i) => rec(rep, p, i)));
  const single = await db.createBase('Verify Single');
  await db.addGames([rec(single, ${JSON.stringify(OPERA)}, 0)]);
  const big = await db.createBase('Verify Big');
  const many = [];
  for (let i = 1; i <= 450; i++) many.push(rec(big,
    '[Event "Synthetic ' + (i % 9) + '"]\\n[Date "2026.01.01"]\\n[White "Player ' + i + '"]\\n[Black "Opponent ' + i + '"]\\n[Result "*"]\\n\\n1. e4 *', i));
  await db.addGames(many);
  return { rep, single, big };`;

// ── helpers that act through the page's own controls ──
const openTrainer = () => evalP(`document.querySelector('#tabbar button[data-screen="trainer"]').click(); await new Promise(r => setTimeout(r, 700));`);
const state = () => evalP(`const { Trainer } = await import('/js/app.js');
  const pick = document.getElementById('trainer-game-pick');
  return { base: document.getElementById('trainer-base').selectedOptions[0]?.textContent,
    toggle: document.getElementById('trainer-one').checked, toggleDisabled: document.getElementById('trainer-one').disabled,
    pickShown: !pick.classList.contains('hidden'), pick: pick.textContent.trim().replace(/\\s+/g, ' '),
    info: document.getElementById('trainer-book-info').textContent, bookKey: Trainer.bookKey, bookSize: Trainer.book ? Trainer.book.size : null };`);
const selectBase = id => evalP(`const s = document.getElementById('trainer-base'); s.value = String(${id});
  s.dispatchEvent(new Event('change', { bubbles: true })); await new Promise(r => setTimeout(r, 700));`);
const clickToggle = () => evalP(`document.getElementById('trainer-one').click(); await new Promise(r => setTimeout(r, 700));`);
const openPicker = () => evalP(`document.getElementById('trainer-game-pick').click(); await new Promise(r => setTimeout(r, 600));`);
const pickRow = text => evalP(`const row = [...document.querySelectorAll('.trainer-pick-list .list-item')].find(b => b.textContent.includes(${JSON.stringify(text)}));
  if (!row) return 'NO ROW'; row.click(); await new Promise(r => setTimeout(r, 700)); return 'picked';`);
const pickerRows = () => evalP(`return { rows: document.querySelectorAll('.trainer-pick-list .list-item').length,
  more: document.querySelector('.trainer-pick-list .btn')?.textContent || null,
  empty: document.querySelector('.trainer-pick-list .hint')?.textContent || null };`);
const typeSearch = q => evalP(`const i = document.querySelector('.modal-box input.input'); i.value = ${JSON.stringify(q)};
  i.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => setTimeout(r, 500));`);
const closeModals = () => evalP(`document.querySelectorAll('.modal-back').forEach(e => e.remove());`);
// Plays as Black: clicks Black + Start, lets the computer open, answers with
// `reply`, and returns what the computer played around it.
const playAsBlack = reply => evalP(`const { Trainer } = await import('/js/app.js'); const sl = ms => new Promise(r => setTimeout(r, ms));
  document.querySelector('#trainer-color button[data-v="b"]').click();
  document.getElementById('trainer-start').click();
  await sl(1500);
  const first = Trainer.chess.history()[0];
  let second = null, badge = null;
  if (${JSON.stringify(reply)}) {
    await Trainer.userMove(${JSON.stringify(reply)});
    await sl(${reply && reply.slow ? 6000 : 1500});
    second = Trainer.chess.history()[2] || null;
    badge = document.getElementById('trainer-book-status').className;
  }
  document.getElementById('trainer-back').click();
  await sl(200);
  return { first, second, badge };`);
const E5 = { from: 'e7', to: 'e5' };
// Walks the real tour to the Openings set-up step and measures frame and card.
const tourStep = () => evalP(`const app = await import('/js/app.js'); const db = await import('/js/db.js'); const Tour = (await import('/js/tour.js')).default;
  Tour.start({ db, modal: app.modal, toast: app.toast, showScreen: app.showScreen,
    activeScreen: () => document.querySelector('.screen:not(.hidden)').id.replace('screen-', '') });
  let i = 0; while (Tour.step().key !== 'trainerSet' && i < 80) Tour.go(++i);
  await new Promise(r => setTimeout(r, 2200));
  const box = sel => document.querySelector(sel).getBoundingClientRect();
  const ring = box('.tour-ring'), card = box('.tour-card'), top = box('#trainer-base'), bottom = box('#trainer-level');
  return { key: Tour.step().key, ring: [ring.top, ring.bottom].map(Math.round), card: [card.top, card.bottom].map(Math.round),
    base: [top.top, top.bottom].map(Math.round), level: [bottom.top, bottom.bottom].map(Math.round),
    covers: ring.top <= top.top + 1 && ring.bottom >= bottom.bottom - 1,
    cardClear: card.top >= bottom.bottom || card.bottom <= top.top };`);
const tourEnd = async () => { await evalP(`const Tour = (await import('/js/tour.js')).default; Tour.stop('skipped'); await new Promise(r => setTimeout(r, 300));`); await closeModals(); await openTrainer(); };  // ending the tour leaves the Openings tab

const log = (label, v) => console.error('  ' + label + ': ' + JSON.stringify(v));
const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok }); console.error((ok ? '  PASS ' : '  FAIL ') + name + (detail ? ' — ' + detail : '')); };

// ── 0. Empty state: no base at all (fresh profile, nothing seeded) ──
console.error('… empty');
await load('en', 'light');
await openTrainer();
let s = await state();
log('no bases', s);
check('no bases: no toggle line, no game row', s.toggleDisabled && !s.pickShown && s.info === '' && await evalP(`return document.getElementById('trainer-one-row').classList.contains('hidden');`));
await shot('en-light-0-empty');

const ids = await evalP(SEED);
log('seeded base ids', ids);

// ── 1. The real flow (EN, light) ──
console.error('… flow');
await load('en', 'light');
errors.length = 0;
await openTrainer();
await selectBase(ids.rep);
s = await state(); log('toggle off', s);
const whole = s.bookSize;
check('toggle off by default, whole base', !s.toggle && !s.pickShown && s.bookKey === ids.rep + '|' && whole === 81, 'book ' + whole);

// Toggle on → the picker opens by itself; choose game A (Opera).
await clickToggle();
let rows = await pickerRows(); log('picker (3 games)', rows);
check('toggle on opens the picker with the base\'s 3 games', rows.rows === 3);
s = await state();
check('no game yet → asks for one, no book', s.info === 'Choose a game to practice.' && s.bookSize === null, s.info);
await pickRow('Morphy');
s = await state(); log('game A', s);
const sizeA = s.bookSize;
check('game A: book from A alone', s.toggle && s.pick.includes('Morphy') && sizeA === 33 && s.info.startsWith('33 '), 'book ' + sizeA);
let aSeconds = [];
for (let i = 0; i < 6; i++) { const r = await playAsBlack(E5); aSeconds.push(r.first + ' ' + r.second); }
log('game A, computer as White ×6', aSeconds);
check('game A: computer only plays A (1.e4 … 2.Nf3, never 2.f4)', aSeconds.every(x => x === 'e4 Nf3'));

// Switch to game B (Immortal) — the cache trap.
await openPicker();
await pickRow('Anderssen');
s = await state(); log('game B', s);
check('game B: book rebuilt, not the cached A book', s.pick.includes('Anderssen') && s.bookSize === 41 && s.bookKey !== ids.rep + '|', 'book ' + s.bookSize);
let bSeconds = [];
for (let i = 0; i < 6; i++) { const r = await playAsBlack(E5); bSeconds.push(r.first + ' ' + r.second); }
log('game B, computer as White ×6', bSeconds);
check('game B: computer only plays B (2.f4, never 2.Nf3)', bSeconds.every(x => x === 'e4 f4'));
// Leaving the one game's moves hands over to the engine.
const off = await playAsBlack({ from: 'c7', to: 'c5', slow: true });
log('game B, 1...c5 (not in B)', off);
check('out of the game\'s moves → engine takes over, badge says out of book', !!off.second && /\bout\b/.test(off.badge || ''));

// The game with variations and comments.
await openPicker();
await pickRow('Queen\'s Gambit');
s = await state(); log('study game', s);
check('game with variations: every branch is in the book (11 positions)', s.bookSize === 11, 'book ' + s.bookSize);
const branches = await evalP(`const { Trainer } = await import('/js/app.js');
  const entries = [...Trainer.book.values()].map(e => Object.keys(e).sort().join(','));
  return { threeWay: entries.includes('c6,dxc4,e6'), comments: [...Trainer.bookComments.values()] };`);
log('branches + comments', branches);
check('variations 2...e6 / 2...dxc4 / 2...c6 all offered, comments kept', branches.threeWay && branches.comments.length === 2);
const study = await playAsBlack(null);
check('study: computer opens 1.d4', study.first === 'd4', study.first);

// Toggle off → whole base again.
await clickToggle();
s = await state(); log('toggle off again', s);
check('toggle off again: whole base book is back', !s.toggle && !s.pickShown && s.bookSize === whole && s.bookKey === ids.rep + '|');
// …and on again brings the same game back without re-picking.
await clickToggle();
s = await state();
check('toggle on again: same game still chosen', s.toggle && s.pick.includes('Queen\'s Gambit') && s.bookSize === 11);
await closeModals();

// Change database → game cleared.
await selectBase(ids.big);
await closeModals();
s = await state(); log('changed base', s);
check('change database: game cleared, asks for one', s.toggle && s.pick === 'Choose a game…' && s.bookSize === null, s.pick);
// Start with nothing chosen must not start a game.
const blocked = await evalP(`document.getElementById('trainer-start').click(); await new Promise(r => setTimeout(r, 500));
  return { gameHidden: document.getElementById('trainer-game').classList.contains('hidden'), picker: !!document.querySelector('.trainer-pick-list') };`);
check('Start with no game chosen: no game starts, picker opens', blocked.gameHidden && blocked.picker);
rows = await pickerRows(); log('big base picker', rows);
check('450-game base: first page of 200 + load more', rows.rows === 200 && !!rows.more);
await typeSearch('player 437');
rows = await pickerRows();
check('search narrows to one game', rows.rows === 1, JSON.stringify(rows));
await typeSearch('zzzz');
rows = await pickerRows();
check('search with no match: empty message', rows.rows === 0 && rows.empty === 'No game matches your search.');
await shot('en-light-7-search-empty');
await typeSearch('synthetic 4');
rows = await pickerRows();
check('search also matches the event (50 games)', rows.rows === 50, JSON.stringify(rows));
await closeModals();

// A database with one game.
await selectBase(ids.single);
s = await state(); log('single-game base', s);
check('one-game base: its game is chosen by itself', s.toggle && s.pick.includes('Morphy') && s.bookSize === 33);

// Remembered across a reload.
await selectBase(ids.rep);
await closeModals();
await openPicker();
await pickRow('Anderssen');
await send('Page.reload', {});
await sleep(3500);
await openTrainer();
s = await state(); log('after reload', s);
check('reload: base, toggle and game remembered', s.base.startsWith('Verify Repertoire') && s.toggle && s.pick.includes('Anderssen') && s.bookSize === 41);

// Offline: cut the network, then use the whole thing again.
await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
await openPicker();
await pickRow('Morphy');
s = await state();
const offl = await playAsBlack(E5);
log('offline', { s, offl });
check('offline: pick a game, book builds, computer plays it', s.bookSize === 33 && offl.first === 'e4' && offl.second === 'Nf3');
await send('Page.reload', {});
await sleep(4000);
const offReload = await evalP(`return !!document.getElementById('trainer-one');`).catch(() => false);
if (offReload) { await openTrainer(); s = await state(); }
check('offline reload: app loads from the service worker, choice still there', offReload && s.toggle && s.pick.includes('Morphy'), JSON.stringify(offReload));
await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
if (!offReload) { await load('en', 'light'); await openTrainer(); }

// The remembered game is deleted elsewhere → back to the whole base.
await evalP(`const db = await import('/js/db.js'); const { Trainer } = await import('/js/app.js'); await db.deleteGame(Trainer.game.id);`);
await evalP(`document.querySelector('#tabbar button[data-screen="base"]').click(); await new Promise(r => setTimeout(r, 400));`);
await openTrainer();
s = await state(); log('chosen game deleted', s);
check('chosen game deleted: falls back to the whole base', !s.toggle && !s.pickShown && s.bookSize === 51, 'book ' + s.bookSize);
const flowErrors = errors.filter(e => !/app-?check|403|appCheck|net::ERR_INTERNET_DISCONNECTED|Failed to fetch|offline/i.test(e));
check('no unexpected console errors in the flow', flowErrors.length === 0, flowErrors.slice(0, 3).join(' | '));
// Put the deleted game back for the screenshots.
await evalP(`const db = await import('/js/db.js'); const pgn = ${JSON.stringify(OPERA)};
  await db.addGames([{ baseId: ${ids.rep}, white: 'Morphy, Paul', black: 'Duke Karl / Count Isouard', event: 'Paris Opera', date: '1858.??.??', result: '1-0', pgn, updatedAt: Date.now() }]);`);

// ── 2. Screenshots: EN/ES × light/dark ──
for (const lang of ['en', 'es']) {
  for (const scheme of ['light', 'dark']) {
    const tag = `${lang}-${scheme}`;
    console.error('… ' + tag);
    await load(lang, scheme);
    await openTrainer();
    if ((await state()).toggle) await clickToggle();
    await selectBase(ids.big);          // a base change clears the remembered game
    await selectBase(ids.rep);
    await closeModals();
    await shot(`${tag}-1-off`);
    const oneLine = await evalP(`const a = document.querySelector('.trainer-one').getBoundingClientRect(), b = document.getElementById('trainer-book-info').getBoundingClientRect();
      return { sameLine: Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < 14 && b.left > a.right, rowH: Math.round(document.getElementById('trainer-one-row').getBoundingClientRect().height) };`);
    check(`${tag}: toggle and book-move count share one line`, oneLine.sameLine, JSON.stringify(oneLine));
    // The tour as a first-time user meets it: toggle off. Kael's card must not
    // sit on the controls the step is explaining.
    const tourOff = await tourStep();
    log('tour, toggle off', tourOff);
    check(`${tag}: tour step frames base → level and the card covers neither`, tourOff.key === 'trainerSet' && tourOff.covers && tourOff.cardClear, JSON.stringify(tourOff));
    await shot(`${tag}-1b-tour-off`);
    await tourEnd();
    await clickToggle();
    await sleep(300);
    await shot(`${tag}-2-picker`);
    await closeModals();
    await shot(`${tag}-3-none-chosen`);
    await openPicker();
    await pickRow('Anderssen');
    await shot(`${tag}-4-chosen`);
    await openPicker();
    await sleep(300);
    await shot(`${tag}-5-picker-current`);
    await closeModals();
    // The same step with a game chosen — the tallest this group ever gets.
    const tourOn = await tourStep();
    log('tour, game chosen', tourOn);
    check(`${tag}: tour step, game chosen: frame still holds base → level`, tourOn.key === 'trainerSet' && tourOn.covers);
    await shot(`${tag}-6-tour`);
    await tourEnd();
    const overflow = await evalP(`return document.documentElement.scrollWidth > window.innerWidth;`);
    check(`${tag}: no sideways scroll at 375px`, !overflow);
  }
}

const failed = checks.filter(c => !c.ok);
console.error(`\n${checks.length - failed.length}/${checks.length} checks passed` + (failed.length ? ' — FAILED: ' + failed.map(f => f.name).join('; ') : ''));
ws.close();
chrome.kill();
process.exit(failed.length ? 1 : 0);
