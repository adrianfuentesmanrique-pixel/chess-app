// Headless-Chrome verification for the LIVE database search on the Analysis tab.
// The in-app pane does not composite, so screenshots come from a real headless
// Chrome over CDP. Dev tool, not shipped.
//
//   node tools/cdp-verify-livesearch.mjs http://localhost:9185 <outDir>
//
// SEEDED (written straight into IndexedDB through js/db.js): two bases of real
// games, the game added mid-run, and the Masterclass context at the end.
// REALLY CLICKED (CDP mouse events at 375px): 🔎, every sheet and chooser
// button, every move on the board, the ⏮ ◀ ▶ arrows, the result that is opened,
// and the Moves switch.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';

const APP_URL = process.argv[2] || 'http://localhost:9185';
const OUT = process.argv[3] || path.join(os.tmpdir(), 'livesearch-shots');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpls-'));
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
  await evalP(`document.getElementById('ana-toolbar').scrollIntoView({ block: 'start' });`);
  await sleep(150);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
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

// ── real mouse input ──
// `text` picks, among the elements matching `sel`, the one containing it.
const centre = (sel, text) => evalP(`const all = [...document.querySelectorAll(${JSON.stringify(sel)})];
  const e = ${JSON.stringify(text ?? null)} === null ? all[0] : all.find(x => x.textContent.includes(${JSON.stringify(text ?? '')}));
  if (!e) return null;
  e.scrollIntoView({ block: 'center' });
  const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
const mouse = (type, p) => send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
async function click(sel, text) {
  const p = await centre(sel, text);
  if (!p) throw new Error('nothing to click: ' + sel + (text ? ' "' + text + '"' : ''));
  await mouse('mousePressed', p); await sleep(40); await mouse('mouseReleased', p);
  await sleep(350);
}
// A move on the board: tap the piece, tap the square.
const move = async (from, to) => { await click(`#ana-board [data-sq="${from}"]`); await click(`#ana-board [data-sq="${to}"]`); };

// ── the games (SEEDED) — real games, typed out ──
const G = {
  opera: ['Morphy', 'Duke Karl / Count Isouard', 'Paris', '1858', '1-0', 33,
    '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0'],
  immortal: ['Anderssen', 'Kieseritzky', 'London', '1851', '1-0', 45,
    '1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5 8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 Ng8 15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6 21. Nxg7+ Kd8 22. Qf6+ Nxf6 23. Be7# 1-0'],
  evergreen: ['Anderssen', 'Dufresne', 'Berlin', '1852', '1-0', 47,
    '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O d3 8. Qb3 Qf6 9. e5 Qg6 10. Re1 Nge7 11. Ba3 b5 12. Qxb5 Rb8 13. Qa4 Bb6 14. Nbd2 Bb7 15. Ne4 Qf5 16. Bxd3 Qh5 17. Nf6+ gxf6 18. exf6 Rg8 19. Rad1 Qxf3 20. Rxe7+ Nxe7 21. Qxd7+ Kxd7 22. Bf5+ Ke8 23. Bd7+ Kf8 24. Bxe7# 1-0'],
  legal: ['Legal', 'Saint Brie', 'Paris', '1750', '1-0', 13,
    '1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0'],
  reti: ['Reti', 'Tartakower', 'Vienna', '1910', '1-0', 21,
    '1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Nf6 5. Qd3 e5 6. dxe5 Qa5+ 7. Bd2 Qxe5 8. O-O-O Nxe4 9. Qd8+ Kxd8 10. Bg5+ Kc7 11. Bd8# 1-0'],
  gibaud: ['Gibaud', 'Lazard', 'Paris', '1924', '0-1', 8,
    '1. d4 Nf6 2. Nd2 e5 3. dxe5 Ng4 4. h3 Ne3 0-1'],
};
const rec = (k, baseId) => `{ baseId: ${baseId}, white: ${JSON.stringify(G[k][0])}, black: ${JSON.stringify(G[k][1])}, event: ${JSON.stringify(G[k][2])},
  date: ${JSON.stringify(G[k][3])}, result: ${JSON.stringify(G[k][4])}, pgn: ${JSON.stringify(`[White "${G[k][0]}"]\n[Black "${G[k][1]}"]\n\n${G[k][6]}`)}, updatedAt: Date.now() }`;
// Every typed-out game must replay to its full length — parsePgn() drops a move
// it cannot play, so a typo would otherwise pass silently as a shorter game.
const SEED = `const db = await import('/js/db.js'); const { parsePgn } = await import('/js/tree.js');
  const G = ${JSON.stringify(G)}; const bad = [];
  for (const k in G) { const tr = parsePgn(G[k][6]); let n = 0; tr.toEnd(); for (let c = tr.current; c.parent; c = c.parent) n++; if (n !== G[k][5]) bad.push(k + ' ' + n); }
  if (bad.length) return 'BAD PGN: ' + bad.join(', ');
  // Each run starts from the same two bases (the last run added a game to one).
  for (const old of await db.listBases()) if (old.name === 'Classics' || old.name === 'One game') await db.deleteBase(old.id);
  const a = await db.createBase('Classics'); const b = await db.createBase('One game');
  for (const g of [${['opera', 'immortal', 'evergreen', 'legal', 'reti'].map(k => rec(k, 'a')).join(', ')}]) await db.addGame(g);
  await db.addGame(${rec('reti', 'b')});
  return 'seeded bases ' + a + ', ' + b;`;

// Counts every call into the search, so "does no extra work" is a number.
const SPY = `const { Analysis } = await import('/js/app.js'); const { PositionIndex } = await import('/js/explore-index.js');
  window.__n = { live: 0, find: 0, sync: 0, parsed: [] };
  const live = Analysis.searchLive; Analysis.searchLive = function () { window.__n.live++; return live.apply(this, arguments); };
  const find = PositionIndex.prototype.find; PositionIndex.prototype.find = function () { window.__n.find++; return find.apply(this, arguments); };
  const sync = PositionIndex.prototype.sync; PositionIndex.prototype.sync = async function () { window.__n.sync++; const s = await sync.apply(this, arguments); window.__n.parsed.push(s.parsed); return s; };`;
const counts = () => evalP(`return JSON.stringify(window.__n);`);
const resetCounts = () => evalP(`window.__n = { live: 0, find: 0, sync: 0, parsed: [] };`);
const view = () => evalP(`const { Analysis } = await import('/js/app.js');
  return { status: document.getElementById('ana-games-status').innerText.replace(/\\n/g, ' | '),
    rows: [...document.querySelectorAll('#ana-games-list .list-item b')].map(b => b.textContent),
    gamesShowing: !document.getElementById('ana-games-view').classList.contains('hidden'),
    modal: document.querySelectorAll('.modal-back').length,
    modalButtons: [...document.querySelectorAll('.modal-box .sheet-btn')].map(b => b.textContent),
    base: Analysis.explore && Analysis.explore.baseId, source: Analysis.exploreSource,
    sideways: document.documentElement.scrollWidth > window.innerWidth };`);

let failed = 0;
const log = [];
function check(name, ok, detail) {
  if (!ok) failed++;
  log.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : '  → ' + (typeof detail === 'string' ? detail : JSON.stringify(detail))}`);
}

async function run(lang, scheme, first) {
  const tag = `${lang}-${scheme}`;
  const one = lang === 'en' ? 'game' : 'partida', many = lang === 'en' ? 'games' : 'partidas';
  const count = (v, base, n) => v.status.startsWith(`📚 ${base} · ${n} ${n === 1 ? one : many}`) && v.rows.length === n;
  log.push(`\n══ ${tag} ══`);
  await load(lang, scheme);
  check('seed', true, await evalP(SEED));
  await send('Page.reload', {}); await sleep(3500);
  await evalP(`document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove());`);
  await evalP(SPY);
  let v;

  // 1. search OFF: normal analysis does no search work
  await move('e2', 'e4'); await click('#ana-prev');
  check('search off: a move and a step back call the search 0 times', await counts() === '{"live":0,"find":0,"sync":0,"parsed":[]}', await counts());

  // 2. first press: Database / Internet, then which base
  await click('#ana-explore'); v = await view();
  check('first press offers Database + Internet', v.modal === 1 && v.modalButtons.length === 3, v.modalButtons);
  await click('.modal-box .sheet-btn'); v = await view();   // first button = Database
  check('then asks which base (empty "My games" not offered)', v.modal === 1 && v.modalButtons.length === 3 && v.modalButtons[0].startsWith('Classics') && v.modalButtons[1].startsWith('One game'), v.modalButtons);
  if (first) await shot(`${tag}-1-chooser`);
  await click('.modal-box .sheet-btn', 'Classics'); await sleep(500); v = await view();
  check('start position: all 5 games, base named', count(v, 'Classics', 5), v.status);
  check('the index was built once, reading 5 games', JSON.parse(await counts()).parsed.join() === '5', await counts());

  // 3. live: each move narrows the list, each step back widens it
  await move('e2', 'e4'); v = await view(); check('1.e4 → 5', count(v, 'Classics', 5), v.status);
  await move('e7', 'e5'); v = await view(); check('1...e5 → 4', count(v, 'Classics', 4), v.status);
  await move('g1', 'f3'); v = await view(); check('2.Nf3 → 3', count(v, 'Classics', 3), v.status);
  await move('d7', 'd6'); v = await view(); check('2...d6 → 2 (Morphy, Legal)', count(v, 'Classics', 2) && v.rows[0].startsWith('Morphy') && v.rows[1].startsWith('Legal'), v.rows);
  await shot(`${tag}-2-after-moves`);
  await click('#ana-prev'); v = await view(); check('step back → 3 again', count(v, 'Classics', 3), v.status);
  await click('#ana-prev'); v = await view(); check('step back → 4 again', count(v, 'Classics', 4), v.status);
  check('still one index build, no page scrolling sideways', JSON.parse(await counts()).sync === 1 && !v.sideways, await counts());

  // 4. a position no game reaches
  await click('#ana-first'); await move('d2', 'd4'); v = await view();
  check('1.d4 → 0 games, with the no-results line', count(v, 'Classics', 0) && v.status.includes(' | '), v.status);
  await shot(`${tag}-3-no-games`);
  await click('#ana-prev'); v = await view(); check('back to the start → 5', count(v, 'Classics', 5), v.status);

  // 5. open a result, press 🔎: same base, current position, no chooser
  await click('#ana-next'); await click('#ana-next'); await click('#ana-next'); await click('#ana-next'); v = await view();
  check('▶ x4 to 2...d6 → 2', count(v, 'Classics', 2), v.status);
  await click('#ana-games-list .list-item'); await sleep(400);
  const opened = await evalP(`const { Analysis } = await import('/js/app.js'); return { white: Analysis.tree.headers.White, gameId: Analysis.ctx.gameId, baseId: Analysis.ctx.baseId, explore: Analysis.explore.baseId };`);
  v = await view();
  check('tapping a result opens it and shows the moves', opened.white === 'Morphy' && !v.gamesShowing && opened.explore === opened.baseId, opened);
  await resetCounts();
  await click('#ana-prev'); await click('#ana-next');
  check('with the moves showing, stepping calls the search 0 times', JSON.parse(await counts()).live === 0, await counts());
  await click('#ana-explore'); v = await view();
  check('🔎 from the moves: no chooser, same base, this position (mate → 1 game)', v.modal === 0 && v.gamesShowing && count(v, 'Classics', 1) && v.rows[0].startsWith('Morphy'), v.status);
  check('…and the index was not rebuilt', JSON.parse(await counts()).sync === 0, await counts());
  await click('#ana-first'); v = await view(); check('⏮ in the opened game → 5 (still live)', count(v, 'Classics', 5), v.status);

  // 6. 🔎 with the results showing: the chooser
  await click('#ana-explore'); v = await view();
  check('🔎 from the results offers Database + Internet', v.modal === 1 && v.modalButtons.length === 3, v.modalButtons);
  await click('.modal-box .sheet-btn'); v = await view();
  check('the base in use is ticked', v.modalButtons[0].startsWith('✓ Classics'), v.modalButtons);
  if (first) await shot(`${tag}-4-change-base`);

  // 7. a base with one game
  await click('.modal-box .sheet-btn', 'One game'); await sleep(500); v = await view();
  check('one-game base: 1 game at the start', count(v, 'One game', 1) && v.rows[0].startsWith('Reti'), v.status);
  await shot(`${tag}-5-one-game`);
  await move('d2', 'd4'); v = await view(); check('1.d4 in the one-game base → 0', count(v, 'One game', 0), v.status);
  await click('#ana-prev'); v = await view(); check('back → 1', count(v, 'One game', 1), v.status);

  // 8. a game added to the base is found, and only that game is read (SEEDED add)
  await resetCounts();
  const baseId = v.base;
  await evalP(`const db = await import('/js/db.js'); await db.addGame(${rec('gibaud', baseId)});`);
  await move('d2', 'd4'); await sleep(500); v = await view();
  check('game added to the base → 1.d4 now finds it', count(v, 'One game', 1) && v.rows[0].startsWith('Gibaud'), v.rows);
  check('…by reading 1 game, not the base again', JSON.parse(await counts()).parsed.join() === '1', await counts());

  // 9. offline
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await click('#ana-prev'); v = await view();
  check('offline: the database search still follows the board → 2', count(v, 'One game', 2), v.status);
  await click('#ana-explore'); await click('.modal-box .sheet-btn', '🌐'); await sleep(1200); v = await view();
  check('offline: Internet search fails with a message, no crash', v.status.startsWith('⚠️') && v.source === 'lichess', v.status);
  await move('e2', 'e4'); const v2 = await view();
  check('Internet results are not live (a move leaves them alone)', v2.status === v.status && v2.source === 'lichess', v2.status);
  await click('#ana-view-tab button[data-v="moves"]'); await click('#ana-explore'); v = await view();
  check('Moves, then 🔎: straight back to the database, no chooser', v.modal === 0 && v.source === 'local' && count(v, 'One game', 1), v.status);
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  // 10. a Masterclass chapter (SEEDED context) with a base still remembered
  await evalP(`const { Analysis } = await import('/js/app.js'); const { parsePgn } = await import('/js/tree.js');
    Analysis.loadTree(parsePgn(${JSON.stringify(G.opera[6])}), { baseId: null, gameId: null, fromMasterclass: 'seeded-class' });`);
  await resetCounts();
  await click('#ana-prev'); await click('#ana-prev'); await click('#ana-next'); v = await view();
  check('Masterclass chapter: opens on its moves, stepping calls the search 0 times', !v.gamesShowing && await counts() === '{"live":0,"find":0,"sync":0,"parsed":[]}', await counts());

  // 11. the index is kept on disk: a new app start reopens it and reads no game
  const restart = async () => {
    await send('Page.reload', {}); await sleep(3500);
    await evalP(`document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove());`);
    await evalP(SPY);
  };
  const pickBase = async name => { await click('#ana-explore'); await click('.modal-box .sheet-btn'); await click('.modal-box .sheet-btn', name); await sleep(500); return view(); };
  await restart(); v = await pickBase('One game');
  check('app restarted: the base is searched again → 2', count(v, 'One game', 2), v.status);
  check('…from the stored index: the base was not read (0 index builds)', JSON.parse(await counts()).sync === 0, await counts());
  await move('d2', 'd4'); v = await view();
  check('…and it still follows the board: 1.d4 → Gibaud', count(v, 'One game', 1) && v.rows[0].startsWith('Gibaud'), v.rows);

  // 12. a game deleted, then the app restarted: the stored index is not trusted blindly (SEEDED delete)
  const oneId = v.base;
  await evalP(`const db = await import('/js/db.js'); const g = (await db.listGameSummaries(${oneId})).find(x => x.white === 'Gibaud'); await db.deleteGame(g.id);`);
  await restart(); v = await pickBase('One game');
  check('game deleted + restart: it is gone from the results → 1', count(v, 'One game', 1) && v.rows[0].startsWith('Reti'), v.rows);
  check('…noticed by one check of the base that re-read 0 games', JSON.parse(await counts()).sync === 1 && JSON.parse(await counts()).parsed.join() === '0', await counts());

  // 13. a game edited (SEEDED edit), found at once and still right after a restart with no rebuild
  await evalP(`const db = await import('/js/db.js'); const g = await db.getGame((await db.listGameSummaries(${oneId}))[0].id);
    await db.updateGame({ ...g, white: 'Gibaud', black: 'Lazard', pgn: ${JSON.stringify(G.gibaud[6])}, updatedAt: Date.now() });`);
  await move('d2', 'd4'); await sleep(500); v = await view();
  check('game edited into a 1.d4 game → found, by re-reading 1 game', count(v, 'One game', 1) && v.rows[0].startsWith('Gibaud') && JSON.parse(await counts()).parsed.join() === '0,1', await counts());
  await restart(); v = await pickBase('One game');
  await move('d2', 'd4'); v = await view();
  check('restart after the edit: 1.d4 → the edited game, 0 index builds', count(v, 'One game', 1) && v.rows[0].startsWith('Gibaud') && JSON.parse(await counts()).sync === 0, await counts());

  // 14. deleting a base removes its stored index
  const left = await evalP(`const db = await import('/js/db.js'); await db.deleteBase(${oneId});
    const s = await db.loadPosIndex(${oneId}); const other = await db.loadPosIndex(${oneId} - 1);
    return { blocks: s.blocks.length, built: s.built, rev: s.rev, otherBlocks: other.blocks.length };`);
  check('base deleted: nothing of its index is left, the other base keeps its own', left.blocks === 0 && left.built === null && left.rev === 0 && left.otherBlocks === 1, left);
}

let first = true;
for (const scheme of ['light', 'dark']) for (const lang of ['en', 'es']) {
  try { await run(lang, scheme, first); } catch (e) { failed++; log.push('CRASH  ' + (e.stack || e)); }
  first = false;
}
const real = errors.filter(e => !/403|App ?Check|appCheck|Failed to load resource|ERR_INTERNET_DISCONNECTED|Failed to fetch/i.test(e));
console.log(log.join('\n'));
console.log(`\n${failed ? failed + ' FAILED' : 'ALL PASSED'} · page errors: ${real.length}${real.length ? '\n' + real.join('\n') : ''} (ignored App Check / offline noise: ${errors.length - real.length})`);
ws.close(); chrome.kill();
process.exit(failed ? 1 : 0);
