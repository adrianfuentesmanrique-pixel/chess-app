// Dev-only measurement: how often does detectBoard's OLD window search (the
// fallback after the tone search) find a REAL board the tone search missed, vs a
// FALSE one? Renders pages exactly as the reader does on a 375px phone (1065-px
// canvas), presses a dense grid over the WHOLE page, and replays detectBoard's
// steps one by one (the module's internals are re-exported from a blob copy, so
// js/diagram.js itself is untouched). Of two grids that overlap on a page, the
// one with less checker contrast is SLID, whichever search gave it. A fallback
// board that matches a tone-search board that is not slid is "confirmed". Every
// slid grid and every other unconfirmed fallback grid is saved as a crop (grid in
// red, the board a slid one slid off in green) to judge by eye.
//
//   node tools/measure-fallback.mjs <outDir> <step px> <workers> <pdf>:<pages> [...]
//   pages: "all" | "a-b/s" (every s-th page from a to b) | "1,5,9"
//   env GATE=80: the fallback must reach that checkerVotes score, as detectBoard
//   does since v132 (GATE=0 replays the v131 fallback). env DIAGRAM=<file>
//   measures a candidate copy instead of js/diagram.js. Every 40th press is also
//   run through the real detectBoard; probe!=detectBoard must read 0/N.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [OUT, STEP, NW, ...SPECS] = process.argv.slice(2);
const BOOKS = SPECS.map(s => { const i = s.lastIndexOf(':'); return { file: s.slice(0, i), pages: s.slice(i + 1) }; });
fs.mkdirSync(path.join(OUT, 'crops'), { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const WEB = 9900 + Math.floor(Math.random() * 90);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/__probe') { res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>p</title>'); return; }
  const m = /^\/__book\/(\d+)$/.exec(p);
  const file = m ? BOOKS[+m[1]].file : p === '/__diagram' ? (process.env.DIAGRAM || path.join(ROOT, 'js/diagram.js')) : path.join(ROOT, p);
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end(); return; }
    const t = file.endsWith('.pdf') ? 'application/pdf' : file.endsWith('.wasm') ? 'application/wasm' : /\.m?js$/.test(file) ? 'text/javascript' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': t, 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
});
await new Promise(r => server.listen(WEB, '127.0.0.1', r));
const getJSON = url => new Promise((res, rej) => { http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej); });

async function worker(k) {
  const port = 9300 + k * 7 + Math.floor(Math.random() * 5);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-mf-'));
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let ws, opened;
  for (let i = 0; i < 80 && !ws; i++) { try { const t = (await getJSON(`http://127.0.0.1:${port}/json`)).find(t => t.type === 'page'); if (t) { ws = new WebSocket(t.webSocketDebuggerUrl); opened = new Promise(r => ws.on('open', r)); break; } } catch {} await sleep(250); }
  await opened;
  let id = 0; const pend = new Map();
  ws.on('message', m => { const msg = JSON.parse(m); if (msg.id && pend.has(msg.id)) { const p = pend.get(msg.id); pend.delete(msg.id); msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result); } });
  const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((res, rej) => pend.set(i, { res, rej })); };
  const evalP = async expr => { const r = await send('Runtime.evaluate', { expression: `(async()=>{ ${expr} })()`, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900)); return r.result.value; };
  await send('Page.navigate', { url: `http://127.0.0.1:${WEB}/__probe` }); await sleep(1200);
  await evalP(`
    const src = await (await fetch('/__diagram')).text();
    window.D = await import(URL.createObjectURL(new Blob([src + '\\nexport { toGray, toneMap, detectFromBand, detectInWindow, placeByTone, accept, fitBoard, checkerVotes, isSlid, cellTone };'], { type: 'text/javascript' })));
    window.lib = await import('/vendor/pdf.min.mjs');
    lib.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';
    window.docs = {}; window.GATE = ${+(process.env.GATE || 0)};
  `);
  return { send, evalP, chrome };
}

// One page: render at 1065, press the grid, replay detectBoard step by step.
const PAGE_JOB = (bi, n, step, noFb) => `
  const doc = docs[${bi}] || (docs[${bi}] = await lib.getDocument({ url: '/__book/${bi}', wasmUrl: '/vendor/' }).promise);
  if (${n} > doc.numPages) return { skip: true, numPages: doc.numPages };
  const page = await doc.getPage(${n});
  const vp0 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: 1065 / vp0.width });
  const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
  await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
  const ctx = cv.getContext('2d'), img = ctx.getImageData(0, 0, cv.width, cv.height);
  const { g, W, H } = D.toGray(img);
  const minDim = Math.min(W, H), r = Math.max(2, Math.round(W / 355)), tone = D.toneMap(g, W, H, r);
  function probe(tapX, tapY) {
    tapX = Math.round(tapX); tapY = Math.round(tapY);
    for (const frac of [0.03, 0.06, 0.12, 0.25]) { const b = D.detectFromBand(tone, g, W, H, tapX, tapY, Math.round(frac * minDim), r); if (b) return { k: 'tone', b }; }
    for (const frac of [0.16, 0.22, 0.30, 0.40, 0.48]) {
      const S = Math.round(frac * minDim); if (S < 40) continue;
      const found = D.detectInWindow(g, W, H, tapX, tapY, S); if (!found) continue;
      const minGap = Math.max(10, 5 * r);
      let moved = D.placeByTone(g, W, H, found, 7, tapX, tapY);
      let board = moved ? D.fitBoard(tone, W, H, moved, minGap, r) : found;
      const again = board && D.placeByTone(g, W, H, board, 2, tapX, tapY);
      if (again) { moved = again; board = D.fitBoard(tone, W, H, again, minGap, r); }
      if (moved) board = D.accept(g, W, H, board);
      const votes = board ? D.checkerVotes(g, W, board) : 0;
      if (board && votes >= (window.GATE || 0) && !D.isSlid(g, W, H, board)) return { k: moved ? 'moved' : 'asis', b: board, votes, frac };
    }
    return null;
  }
  const res = [], t0 = performance.now();
  let checked = 0, mismatch = 0;
  for (let y = ${step} / 2; y < H - 1; y += ${step}) for (let x = ${step} / 2; x < W - 1; x += ${step}) {
    const p = probe(x, y);
    if (res.length % 40 === 0) { checked++; const d = D.detectBoard(img, x, y); if (JSON.stringify(d && [d.x0, d.y0, d.cw]) !== JSON.stringify(p && [p.b.x0, p.b.y0, p.b.cw])) mismatch++; }
    res.push({ x, y, k: p ? p.k : null, b: p && { x0: +p.b.x0.toFixed(1), y0: +p.b.y0.toFixed(1), cw: +p.b.cw.toFixed(2), ch: +p.b.ch.toFixed(2) }, votes: p && p.votes, frac: p && p.frac });
  }
  const same = (a, b) => Math.abs(a.x0 - b.x0) < 0.35 * b.cw && Math.abs(a.y0 - b.y0) < 0.35 * b.ch && Math.abs(a.cw / b.cw - 1) < 0.06;
  const inside = (q, b) => q.x >= b.x0 && q.x <= b.x0 + 8 * b.cw && q.y >= b.y0 && q.y <= b.y0 + 8 * b.ch;
  // every distinct grid any press gave (tone search included) and how many gave it
  const grids = [], of = new Map();
  for (const q of res) {
    if (!q.b) continue;
    let G = grids.find(G => same(q.b, G.b));
    if (!G) grids.push(G = { b: q.b, n: 0, tone: 0, k: q.k, votes: q.votes, press: [q.x, q.y] });
    G.n++; if (q.k === 'tone') G.tone++; of.set(q, G);
  }
  // SLID: two boards never overlap, so of two grids that do (corners under 7
  // squares apart) one is the board and the other a slide of it. The slid one is
  // the one with LESS checker contrast: the summed light/dark difference over its
  // 112 neighbour pairs, each capped at 60 — a caption or text row that happens to
  // alternate does so faintly (20–30 against a real rank's 50–60), which the +-1
  // votes in diagram.js cannot see. NOT "the less-pressed one": on FCE p120 and
  // Chess Life p52 the slid grid is the one most presses give. A rule, so the crops
  // (slid grid red, the board it slid off green) are there to check it by eye.
  for (const G of grids) {
    const b = G.b; let s = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const v = D.cellTone(g, W, b, r, c), sg = ((r + c) & 1) ? -1 : 1, cap = d => Math.max(-60, Math.min(60, d));
      if (c < 7) s += sg * cap(v - D.cellTone(g, W, b, r, c + 1));
      if (r < 7) s += sg * cap(v - D.cellTone(g, W, b, r + 1, c));
    }
    G.con = Math.round(Math.abs(s));
  }
  grids.forEach((A, i) => grids.forEach((B, j) => {
    if (i === j || !(A.con < B.con || (A.con === B.con && (A.n < B.n || (A.n === B.n && i > j))))) return;
    const off = Math.max(Math.abs(A.b.x0 - B.b.x0) / B.b.cw, Math.abs(A.b.y0 - B.b.y0) / B.b.ch);
    if (off < 7 && (!A.of || B.con > A.of.con)) { A.of = B; A.off = +off.toFixed(2); }
  }));
  // a REAL board: one the tone search found that is not a slide of another
  const real = grids.filter(G => G.tone && !G.of);
  for (const q of res) {
    const G = of.get(q), on = real.find(R => inside(q, R.b));
    q.onTone = !!on; q.gaveIt = !!on && G === on; q.slid = !!(G && G.of);
    if (q.k === 'asis' || q.k === 'moved') q.confirmed = real.includes(G);
  }
  const crops = [];
  const crop = (G, kind) => {
    const b = G.b, pad = 2 * b.cw, sx = Math.max(0, b.x0 - pad), sy = Math.max(0, b.y0 - pad), sw = Math.min(W - sx, 8 * b.cw + 2 * pad), sh = Math.min(H - sy, 8 * b.ch + 2 * pad);
    const z = Math.max(1, Math.round(700 / sw));   // small magazine boards enlarged, to be judged by eye
    const c2 = document.createElement('canvas'); c2.width = sw * z; c2.height = sh * z; const x2 = c2.getContext('2d');
    x2.scale(z, z); x2.drawImage(cv, sx, sy, sw, sh, 0, 0, sw, sh); x2.lineWidth = 1;
    const grid = (b, col) => { x2.strokeStyle = col; for (let i = 0; i <= 8; i++) { x2.beginPath(); x2.moveTo(b.x0 - sx + i * b.cw, b.y0 - sy); x2.lineTo(b.x0 - sx + i * b.cw, b.y0 - sy + 8 * b.ch); x2.stroke(); x2.beginPath(); x2.moveTo(b.x0 - sx, b.y0 - sy + i * b.ch); x2.lineTo(b.x0 - sx + 8 * b.cw, b.y0 - sy + i * b.ch); x2.stroke(); } };
    if (G.of) grid(G.of.b, 'rgba(0,160,0,0.8)');
    grid(b, 'rgba(255,0,0,0.7)');
    x2.fillStyle = 'blue'; x2.beginPath(); x2.arc(G.press[0] - sx, G.press[1] - sy, 4, 0, 7); x2.fill();
    crops.push({ kind, b, k: G.k, votes: G.votes, n: G.n, tone: G.tone, con: G.con, press: G.press, of: G.of && { b: G.of.b, n: G.of.n, con: G.of.con }, off: G.off, url: c2.toDataURL('image/jpeg', 0.8) });
  };
  // a crop of every slid grid, and of every other fallback grid no real board confirms
  for (const G of grids) { if (G.of) crop(G, 'slid'); else if (!G.tone) crop(G, 'unconfirmed'); }
  return { W, H, numPages: doc.numPages, ms: Math.round(performance.now() - t0), checked, mismatch, res, crops };
`;

const jobs = [];
const wk = await Promise.all(Array.from({ length: +NW }, (_, k) => worker(k)));
const counts = await wk[0].evalP(`const out = []; for (let i = 0; i < ${BOOKS.length}; i++) { const d = docs[i] = await lib.getDocument({ url: '/__book/' + i, wasmUrl: '/vendor/' }).promise; out.push(d.numPages); } return out;`);
BOOKS.forEach((b, bi) => {
  const N = counts[bi]; let pages;
  if (b.pages === 'all') pages = Array.from({ length: N }, (_, i) => i + 1);
  else if (b.pages.includes('-')) { const [ab, s] = b.pages.split('/'); const [a, z] = ab.split('-').map(Number); pages = []; for (let p = a; p <= Math.min(z, N); p += +(s || 1)) pages.push(p); }
  else pages = b.pages.split(',').map(Number);
  for (const p of pages) jobs.push({ bi, p });
});
console.error(`${jobs.length} pages, ${wk.length} workers`);
const results = [];
let next = 0;
await Promise.all(wk.map(async w => {
  while (next < jobs.length) {
    const j = jobs[next++];
    try {
      const r = await w.evalP(PAGE_JOB(j.bi, j.p, +STEP));
      if (r.skip) continue;
      r.crops.forEach((c, i) => { const f = `${c.kind}-b${j.bi}-p${j.p}-${i}.jpg`; fs.writeFileSync(path.join(OUT, 'crops', f), Buffer.from(c.url.split(',')[1], 'base64')); c.file = f; delete c.url; });
      results.push({ ...j, book: path.basename(BOOKS[j.bi].file), ...r });
      process.stderr.write(`.${j.bi}:${j.p}`);
    } catch (e) { console.error(`\nERR ${j.bi}:${j.p} ${e.message}`); }
  }
}));
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results));

// -- summary per book --
console.log('\nbook | pages | presses | tone | fb confirmed (a real board the tone search missed from here) | fb unconfirmed, not slid (to judge) | their grids | SLID grids | SLID presses (tone / fallback) | inside a real board: gave it / presses | probe!=detectBoard');
BOOKS.forEach((b, bi) => {
  const R = results.filter(r => r.bi === bi); const all = R.flatMap(r => r.res), crops = R.flatMap(r => r.crops);
  const fb = all.filter(q => q.k === 'asis' || q.k === 'moved'), slid = all.filter(q => q.slid);
  console.log([path.basename(b.file).slice(0, 40), R.length, all.length, all.filter(q => q.k === 'tone').length,
    fb.filter(q => q.confirmed).length, fb.filter(q => !q.confirmed && !q.slid).length, crops.filter(c => c.kind === 'unconfirmed').length,
    crops.filter(c => c.kind === 'slid').length, `${slid.length} (${slid.filter(q => q.k === 'tone').length} / ${slid.filter(q => q.k !== 'tone').length})`,
    all.filter(q => q.gaveIt).length + ' / ' + all.filter(q => q.onTone).length,
    R.reduce((s, r) => s + r.mismatch, 0) + '/' + R.reduce((s, r) => s + r.checked, 0)].join(' | '));
});
for (const r of results) for (const c of r.crops) if (c.kind === 'slid') console.log(`slid ${c.file}: ${c.b.x0},${c.b.y0} cw ${c.b.cw}, ${c.n} presses (${c.tone} tone), contrast ${c.con}, ${c.off} sq off ${c.of.b.x0},${c.of.b.y0} cw ${c.of.b.cw} (${c.of.n} presses, contrast ${c.of.con})`);
wk.forEach(w => w.chrome.kill()); server.close();
process.exit(0);
