// Measures the live database search on a REAL PGN file, inside the real app in
// headless Chrome: how long the first search takes (reading + indexing every
// game), how much memory the index holds, how long a move takes afterwards,
// what adding one game costs, and — after a reload, i.e. a second app start —
// how long the first search takes when the index is reopened from disk.
// Dev tool, not shipped.
//
//   node tools/measure-livesearch.mjs http://localhost:9185 "C:\path\to\base.pgn" [cpuSlowdown]
//
// cpuSlowdown (default 1) throttles Chrome's CPU, e.g. 4 ≈ a mid-range phone.
// The file is imported into a throwaway browser profile; nothing touches the
// app's real data.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';

const APP_URL = process.argv[2];
const FILE = process.argv[3];
const SLOW = +(process.argv[4] || 1);
if (!APP_URL || !FILE) { console.error('usage: node tools/measure-livesearch.mjs <url> <file.pgn> [cpuSlowdown]'); process.exit(2); }
const text = fs.readFileSync(FILE, 'utf8');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpms-'));
setTimeout(() => { console.error('MEASURE TIMEOUT'); process.exit(2); }, 1800000).unref();

const getJSON = url => new Promise((res, rej) => {
  http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-precise-memory-info',
  '--js-flags=--expose-gc', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });

let ws, msgId = 0;
const pending = new Map();
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
for (let i = 0; i < 40; i++) {
  try {
    const targets = await getJSON(`http://127.0.0.1:${PORT}/json`);
    const page = targets.find(t => t.type === 'page');
    if (page) { ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 1 << 30 }); break; }
  } catch {}
  await sleep(250);
}
await new Promise(r => ws.on('open', r));
ws.on('message', m => {
  const msg = JSON.parse(m);
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id); pending.delete(msg.id);
    msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result);
  }
});
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: APP_URL }); await sleep(2500);
await evalP(`localStorage.setItem('tourDone', '1');`);
await send('Page.reload', {}); await sleep(3500);
await evalP(`document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove());`);

// Import: the app's own splitPgn + the same record shape its importer writes.
// Sent in slices so one message never carries the whole file.
await evalP(`window.__pgn = '';`);
for (let i = 0; i < text.length; i += 4000000) await evalP(`window.__pgn += ${JSON.stringify(text.slice(i, i + 4000000))};`);
const imported = await evalP(`const db = await import('/js/db.js'); const { splitPgn } = await import('/js/tree.js');
  const chunks = splitPgn(window.__pgn); window.__pgn = null;
  const baseId = await db.createBase('Measured base'); window.__baseId = baseId;
  const head = (c, k) => (c.match(new RegExp('\\\\[' + k + '\\\\s+"([^"]*)"')) || [])[1];
  let batch = [], chars = 0;
  for (const c of chunks) {
    chars += c.length;
    batch.push({ baseId, white: head(c, 'White') ?? '?', black: head(c, 'Black') ?? '?', event: head(c, 'Event') ?? '',
      date: head(c, 'Date') ?? '', result: head(c, 'Result') ?? '*', pgn: c.trim(), updatedAt: Date.now() });
    if (batch.length === 500) { await db.addGamesBatch(batch); batch = []; }
  }
  if (batch.length) await db.addGamesBatch(batch);
  return { games: chunks.length, chars };`);

if (SLOW > 1) await send('Emulation.setCPUThrottlingRate', { rate: SLOW });
const r = await evalP(`const { Analysis } = await import('/js/app.js'); const db = await import('/js/db.js');
  const { PositionIndex } = await import('/js/explore-index.js'); const { GameTree } = await import('/js/tree.js');
  const heap = () => { if (window.gc) window.gc(); return performance.memory.usedJSHeapSize; };
  const out = {};
  Analysis.loadTree(new GameTree());
  const before = heap();
  // exactly what choosing the base in the chooser does
  Analysis.explore = { baseId: window.__baseId, name: '', index: new PositionIndex(), rev: -1, syncing: null };
  Analysis.showGamesTab();
  let t0 = performance.now(); await Analysis.searchLive(); out.firstSearchMs = performance.now() - t0;
  out.heapGrowthBytes = heap() - before;
  out.indexBytes = Analysis.explore.index.bytes;
  out.positions = out.indexBytes / 8;
  out.startMatches = Analysis.explore.index.find(Analysis.tree.fen()).length;
  // a move on the board with the results showing: refresh() → lookup → draw the list
  const times = [];
  for (const san of ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']) {
    t0 = performance.now(); Analysis.tree.play(san); Analysis.refresh(); times.push(performance.now() - t0);
  }
  out.moveMs = times; out.afterSixMoves = Analysis.explore.index.find(Analysis.tree.fen()).length;
  t0 = performance.now(); for (let i = 0; i < 20; i++) Analysis.explore.index.find(Analysis.tree.fen()); out.lookupOnlyMs = (performance.now() - t0) / 20;
  // one game added to the base, then the next search
  await db.addGame({ baseId: window.__baseId, white: 'A', black: 'B', event: '', date: '', result: '*', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *', updatedAt: Date.now() });
  t0 = performance.now(); await Analysis.searchLive(); out.afterAddingOneGameMs = performance.now() - t0;
  out.afterAdd = Analysis.explore.index.find(Analysis.tree.fen()).length;
  return out;`);

// A second app start: the page is reloaded, so everything in memory is gone and
// only what was stored on disk is left. `changed` writes one more game first, so
// the stored index cannot be taken as it is and the base has to be checked.
async function restart(changed) {
  if (changed) await evalP(`const db = await import('/js/db.js');
    await db.addGame({ baseId: window.__baseId, white: 'C', black: 'D', event: '', date: '', result: '*', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *', updatedAt: Date.now() });`);
  await send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await send('Page.reload', {}); await sleep(4000);
  await evalP(`document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove());`);
  if (SLOW > 1) await send('Emulation.setCPUThrottlingRate', { rate: SLOW });
  return evalP(`const { Analysis } = await import('/js/app.js'); const db = await import('/js/db.js');
    const { PositionIndex } = await import('/js/explore-index.js'); const { GameTree } = await import('/js/tree.js');
    window.__baseId = (await db.listBases()).find(b => b.name === 'Measured base').id;
    const out = { parsed: 'none — the base was not read' };
    const sync = PositionIndex.prototype.sync;
    PositionIndex.prototype.sync = async function () { const s = await sync.apply(this, arguments); out.parsed = s.parsed + ' game(s) re-read'; return s; };
    Analysis.loadTree(new GameTree());
    Analysis.explore = { baseId: window.__baseId, name: '', index: new PositionIndex(), rev: -1, syncing: null };
    Analysis.showGamesTab();
    const t0 = performance.now(); await Analysis.searchLive(); out.ms = performance.now() - t0;
    PositionIndex.prototype.sync = sync;
    out.matches = Analysis.explore.index.find(Analysis.tree.fen()).length; out.games = Analysis.explore.index.size;
    out.stored = !Analysis.explore.noStore;
    const st = await db.loadPosIndex(window.__baseId);
    out.blocks = st.blocks.length; out.diskBytes = st.blocks.reduce((n, b) => n + b.hashes.byteLength + b.counts.byteLength, 0);
    return out;`);
}
const again = await restart(false);
const afterChange = await restart(true);

const mb = b => (b / 1048576).toFixed(1) + ' MB';
const s = ms => ms >= 1000 ? (ms / 1000).toFixed(1) + ' s' : ms.toFixed(1) + ' ms';
console.log(`file: ${path.basename(FILE)} · ${mb(text.length)} · ${imported.games} games · CPU slowdown x${SLOW}`);
console.log(`first search (read + index every game): ${s(r.firstSearchMs)}  (${(r.firstSearchMs / imported.games).toFixed(2)} ms per game)`);
console.log(`index size: ${mb(r.indexBytes)} for ${r.positions} positions (${Math.round(r.positions / imported.games)} per game)`);
console.log(`whole-page memory change while indexing (noisy — the browser tidies up as it goes): ${mb(r.heapGrowthBytes)}`);
console.log(`a move with results showing (lookup + redraw): ${r.moveMs.map(s).join(', ')}`);
console.log(`lookup alone: ${s(r.lookupOnlyMs)} · matches at start ${r.startMatches}, after 1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 ${r.afterSixMoves} (${r.afterAdd} after adding one)`);
console.log(`next search after ONE game was added: ${s(r.afterAddingOneGameMs)}`);
console.log(`SECOND APP START, first search: ${s(again.ms)}  (${again.parsed}; ${again.games} games, ${again.matches} at the start position)`);
console.log(`second start after ONE game was added while the index was not in use: ${s(afterChange.ms)}  (${afterChange.parsed}; ${afterChange.games} games)`);
console.log(`index stored on disk: ${afterChange.stored ? 'yes' : 'NO (no room)'} · ${afterChange.blocks} blocks · ${mb(afterChange.diskBytes)} of position lists`);
ws.close(); chrome.kill();
process.exit(0);
