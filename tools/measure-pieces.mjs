// Dev-only measurement of PIECE accuracy in the Read tab's diagram reader (the
// board-finding side is measured by measure-fallback.mjs). Pages are rendered as
// the reader does on a 375px phone (1065-px canvas) in headless Chrome.
//
//   node tools/measure-pieces.mjs find <outDir> <step px> "<pdf>:<pages>" [...]
//     presses a grid over each page, saves one enlarged crop per distinct board
//     (grid drawn in red) and prints a press point for it — to write the truth
//     file from, by eye.   pages: "a-b" | "1,5,9"
//
//   node tools/measure-pieces.mjs measure <outDir> <truth.json>
//     truth.json: { books: [ { file, name, diagrams: [ { id, page, press:[x,y],
//     fen:"<placement>", teach:true? } ] } ] }. For every book, the templates are
//     built from each `teach` diagram in turn (as the app does: one diagram, by
//     buildTemplatesFromGrid) and every OTHER diagram of the book is read with
//     them. Writes squares.json (one record per square: truth, the reader's
//     answer, d1, d2, the empty distance, colour score) and prints the table:
//     wrong pieces placed / wrong colour only / correct pieces left out.
//     env NOGATE=1 counts what the reader placed BEFORE the whole-board gate
//     emptied an impossible position; LIST=1 names every wrong square,
//     LIST=all also every real piece left empty, with its numbers.
//     env LEARN=N measures learning: N more diagrams are confirmed after the
//     teaching one (every diagram of the book in turn and the N-1 after it), then
//     the others are read. Since v139 a new shape counts only once two diagrams
//     agree, so N >= 2 is the run that shows learning. NOLEARN=1 skips the
//     lessons but reads the same diagrams (the "nothing learned" line).
//     env POISON=swap|colour|forgot|one (with LEARN=1) confirms that extra diagram
//     WRONG, to check that a bad confirmation cannot make the book place wrong pieces.
//     With LEARN>=2 only the first lesson is wrong; POISON_BOTH=1 makes all wrong.
//     POISON=same (LEARN>=2) repeats ONE slip: the same piece on the same square
//     shade is called the same wrong type in the first two lessons (a pawn as a
//     knight, anything else as a pawn; SLIP_TO=<type letter> picks another).
//     env JSON_OUT=<file> TAG=<label> appends the per-book totals as JSON lines.
//     env DUMP=<file> writes one JSON line per square that holds a piece or had one
//     placed on it: truth, what was placed before the gate (raw) and after (shown),
//     nearest type, d1, lead, clear, and the piece codes the book held (have).
//     ('swap' leaves a board with no kings unless it holds both queens; the app's
//     dialog and learnFromCells both refuse that, so 'one' is the test that bites.)
//     env STRICT='{"full":{"match":0.1}}' tries other thresholds.
//     env DIAGRAM=<file> measures a candidate copy instead of js/diagram.js.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [MODE, OUT, ...REST] = process.argv.slice(2);
fs.mkdirSync(path.join(OUT, 'crops'), { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let BOOKS, TRUTH, STEP;
if (MODE === 'find') {
  STEP = +REST[0];
  BOOKS = REST.slice(1).map(s => { const i = s.lastIndexOf(':'); return { file: s.slice(0, i), pages: s.slice(i + 1) }; });
} else {
  TRUTH = JSON.parse(fs.readFileSync(REST[0], 'utf8'));
  BOOKS = TRUTH.books;
}

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
await new Promise(r => server.listen(0, '127.0.0.1', r));   // any free port
const WEB = server.address().port;
const getJSON = url => new Promise((res, rej) => { http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej); });

let chrome, evalP;
if (!(MODE === 'measure' && process.env.REUSE && fs.existsSync(path.join(OUT, 'features.json')))) {
const port = 9200 + Math.floor(Math.random() * 90);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-mp-'));
chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let ws, opened;
for (let i = 0; i < 80 && !ws; i++) { try { const t = (await getJSON(`http://127.0.0.1:${port}/json`)).find(t => t.type === 'page'); if (t) { ws = new WebSocket(t.webSocketDebuggerUrl); opened = new Promise(r => ws.on('open', r)); break; } } catch {} await sleep(250); }
await opened;
let id = 0; const pend = new Map();
ws.on('message', m => { const msg = JSON.parse(m); if (msg.id && pend.has(msg.id)) { const p = pend.get(msg.id); pend.delete(msg.id); msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result); } });
const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((res, rej) => pend.set(i, { res, rej })); };
evalP = async expr => { const r = await send('Runtime.evaluate', { expression: `(async()=>{ ${expr} })()`, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900)); return r.result.value; };
await send('Page.navigate', { url: `http://127.0.0.1:${WEB}/__probe` }); await sleep(1200);
await evalP(`
  const src = await (await fetch('/__diagram')).text();
  window.D = await import(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  window.lib = await import('/vendor/pdfjs-6.3.289/pdf.min.mjs');
  lib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs-6.3.289/pdf.worker.min.mjs';
  window.docs = {}; window.pages = {};
  window.pageImg = async (bi, n) => {
    const k = bi + ':' + n; if (pages[k]) return pages[k];
    const doc = docs[bi] || (docs[bi] = await lib.getDocument({ url: '/__book/' + bi, wasmUrl: '/vendor/' }).promise);
    const page = await doc.getPage(n);
    const vp0 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: 1065 / vp0.width });
    const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    return pages[k] = { cv, img: cv.getContext('2d').getImageData(0, 0, cv.width, cv.height) };
  };
  window.cropUrl = (cv, b, withGrid) => {
    const pad = 0.6 * b.cw, sx = Math.max(0, b.x0 - pad), sy = Math.max(0, b.y0 - pad), sw = 8 * b.cw + 2 * pad, sh = 8 * b.ch + 2 * pad;
    const z = 640 / sw, c2 = document.createElement('canvas'); c2.width = 640; c2.height = Math.round(sh * z);
    const x2 = c2.getContext('2d'); x2.drawImage(cv, sx, sy, sw, sh, 0, 0, c2.width, c2.height);
    if (withGrid) { x2.strokeStyle = 'rgba(255,0,0,0.75)'; x2.lineWidth = 1;
      for (let i = 0; i <= 8; i++) { x2.beginPath(); x2.moveTo((b.x0 - sx + i * b.cw) * z, (b.y0 - sy) * z); x2.lineTo((b.x0 - sx + i * b.cw) * z, (b.y0 - sy + 8 * b.ch) * z); x2.stroke();
        x2.beginPath(); x2.moveTo((b.x0 - sx) * z, (b.y0 - sy + i * b.ch) * z); x2.lineTo((b.x0 - sx + 8 * b.cw) * z, (b.y0 - sy + i * b.ch) * z); x2.stroke(); } }
    return c2.toDataURL('image/png');
  };
`);
}
const savePng = (file, url) => fs.writeFileSync(path.join(OUT, 'crops', file), Buffer.from(url.split(',')[1], 'base64'));

if (MODE === 'find') {
  for (const [bi, b] of BOOKS.entries()) {
    let list;
    if (b.pages.includes('-')) { const [a, z] = b.pages.split('-').map(Number); list = []; for (let p = a; p <= z; p++) list.push(p); }
    else list = b.pages.split(',').map(Number);
    for (const n of list) {
      const found = await evalP(`
        const { cv, img } = await pageImg(${bi}, ${n}); const W = cv.width, H = cv.height, out = [];
        const same = (a, b) => Math.abs(a.x0 - b.x0) < 0.35 * b.cw && Math.abs(a.y0 - b.y0) < 0.35 * b.ch && Math.abs(a.cw / b.cw - 1) < 0.06;
        for (let y = ${STEP} / 2; y < H; y += ${STEP}) for (let x = ${STEP} / 2; x < W; x += ${STEP}) {
          const b = D.detectBoard(img, x, y); if (!b) continue;
          const G = out.find(G => same(b, G.b)); if (G) { G.n++; continue; }
          out.push({ b, n: 1, press: [x, y] });
        }
        return out.map(G => ({ ...G, url: cropUrl(cv, G.b, true) }));
      `);
      found.forEach((G, i) => {
        const f = `b${bi}-p${n}-${i}.png`; savePng(f, G.url);
        console.log(`${f}  page ${n}  press [${G.press}]  board ${G.b.x0.toFixed(1)},${G.b.y0.toFixed(1)} cw ${G.b.cw.toFixed(2)} ch ${G.b.ch.toFixed(2)}  (${G.n} presses)`);
      });
      await evalP(`pages = {};`);
    }
  }
} else {
  // The 64 cell measurements of every truth diagram come from the browser (the
  // only part that needs pixels) and are kept in features.json; REUSE=1 skips
  // Chrome and re-reads them. Templates and classification then run here in
  // Node on the real js/diagram.js, so a rule change is measured in a second.
  const fenGrid = fen => fen.split(' ')[0].split('/').map(row => { const o = []; for (const ch of row) { if (/\d/.test(ch)) for (let i = 0; i < +ch; i++) o.push(''); else o.push(ch); } return o; });
  const featFile = path.join(OUT, 'features.json');
  let feats = process.env.REUSE && fs.existsSync(featFile) ? JSON.parse(fs.readFileSync(featFile, 'utf8')) : null;
  if (!feats) {
    feats = {};
    for (const [bi, book] of BOOKS.entries()) for (const d of book.diagrams) {
      const g = fenGrid(d.fen);
      if (g.length !== 8 || g.some(r => r.length !== 8)) throw new Error('bad fen ' + book.name + ' ' + d.id);
      const r = await evalP(`
        const P = await pageImg(${bi}, ${d.page}), b = D.detectBoard(P.img, ${d.press[0]}, ${d.press[1]});
        if (!b) return null;
        return { board: b, url: cropUrl(P.cv, b, true), cells: D.boardCells(P.img, b).map(c => ({ feat: Array.from(c.feat, v => +v.toFixed(5)), lumStd: +c.lumStd.toFixed(2), colorScore: +c.colorScore.toFixed(4) })) };
      `);
      if (!r) { console.log(book.name + ' ' + d.id + ': NO BOARD at the press point'); continue; }
      savePng(book.name + '-' + d.id + '.png', r.url);
      feats[book.name + '/' + d.id] = { board: r.board, cells: r.cells };
    }
    fs.writeFileSync(featFile, JSON.stringify(feats));
  }
  const D = await import(pathToFileURL(process.env.DIAGRAM || path.join(ROOT, 'js/diagram.js')).href);
  if (process.env.STRICT && D.STRICT) { const o = JSON.parse(process.env.STRICT); for (const k of Object.keys(o)) typeof o[k] === 'object' ? Object.assign(D.STRICT[k], o[k]) : D.STRICT[k] = o[k]; }
  const cellsOf = k => feats[k].cells.map(c => ({ feat: Float32Array.from(c.feat), lumStd: c.lumStd, colorScore: c.colorScore }));
  const lc = s => s.toLowerCase();
  const rows = [], bad = [], missed = [], DUMP = process.env.DUMP, dump = [];
  for (const book of BOOKS) {
    const tot = { pairs: 0, real: 0, ok: 0, ghost: 0, type: 0, colour: 0, miss: 0, shown: 0, gated: 0 };
    // LEARN=1: after the teaching diagram, ONE more diagram of the book is added
    // as a confirmed correction (every choice of it in turn), then the rest are read.
    const known = book.diagrams.filter(d => feats[book.name + '/' + d.id]);
    const plans = [];
    const N = +process.env.LEARN || 0;
    for (const teach of known.filter(d => d.teach)) for (const extra of N ? known.filter(d => d !== teach) : [null]) {
      // LEARN=N: the lessons are the N diagrams of the book that follow `extra`, in order.
      const rest = known.filter(d => d !== teach), lessons = [];
      for (let i = 0; extra && i < Math.min(N, rest.length); i++) lessons.push(rest[(rest.indexOf(extra) + i) % rest.length]);
      plans.push({ teach, extra, lessons });
    }
    for (const { teach, extra, lessons } of plans) {
      const tm = D.templatesFromCells(cellsOf(book.name + '/' + teach.id), fenGrid(teach.fen));
      // POISON=same: ONE slip repeated — a piece (same type, same colour) standing on
      // the same square shade in the first two lessons is called the same wrong type
      // in both (POISON_BOTH=1: in every lesson that has it). Plans whose first two
      // lessons share no such piece are run clean and not counted as slipped.
      const wrongOf = c => { const x = process.env.SLIP_TO || (c.toLowerCase() === 'p' ? 'n' : 'p'); return c === c.toUpperCase() ? x.toUpperCase() : x; };
      const spot = (g, key) => { for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (g[r][c] && g[r][c] + (r + c) % 2 === key) return [r, c]; return null; };
      let same = null;
      if (process.env.POISON === 'same' && lessons.length > 1) {
        const g0 = fenGrid(lessons[0].fen), g1 = fenGrid(lessons[1].fen);
        for (let r = 0; r < 8 && !same; r++) for (let c = 0; c < 8 && !same; c++) { const x = g0[r][c]; if (x && !'kK'.includes(x) && wrongOf(x) !== x && spot(g1, x + (r + c) % 2)) same = x + (r + c) % 2; }
        if (same) tot.slipPlans = (tot.slipPlans || 0) + 1;
      }
      const slipped = [];
      for (const [li, lesson] of (process.env.NOLEARN ? [] : lessons).entries()) {
        const extra = lesson, POISON = li && !process.env.POISON_BOTH ? '' : process.env.POISON;
        // POISON: the extra diagram is confirmed WRONG — 'swap' calls kings queens and
        // bishops pawns (and back), 'colour' flips every piece's colour, 'forgot'
        // leaves every second piece off the board.
        let g = fenGrid(extra.fen), k = 0;
        const sw = { k: 'q', q: 'k', b: 'p', p: 'b' }, flip = c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase();
        if (POISON === 'swap') g = g.map(r => r.map(c => { const x = sw[c.toLowerCase()]; return !c || !x ? c : c === c.toUpperCase() ? x.toUpperCase() : x; }));
        if (POISON === 'colour') g = g.map(r => r.map(c => c ? flip(c) : c));
        if (POISON === 'forgot') g = g.map(r => r.map(c => c && !'kK'.includes(c) && k++ % 2 ? '' : c));
        // 'one': a single slip — the first piece that is not a king is confirmed as
        // another type (a pawn as a knight, anything else as a pawn). Kings stay, so
        // the lesson is one the app's dialog would accept.
        if (POISON === 'one') g = g.map(r => r.map(c => { if (!c || 'kK'.includes(c) || k++) return c; const x = c.toLowerCase() === 'p' ? 'n' : 'p'; return c === c.toUpperCase() ? x.toUpperCase() : x; }));
        if (same && (li < 2 || process.env.POISON_BOTH)) { const at = spot(g, same); if (at) { g[at[0]][at[1]] = wrongOf(same[0]); slipped.push({ code: wrongOf(same[0]), feat: cellsOf(book.name + '/' + extra.id)[at[0] * 8 + at[1]].feat }); } }
        const rep = D.learnFromCells(tm, cellsOf(book.name + '/' + extra.id), g);
        tot.lessons = (tot.lessons || 0) + 1; if (rep.learned) tot.took = (tot.took || 0) + 1;
      }
      // Did the repeated slip become a trusted sample of the wrong type?
      const dist = (x, y) => { let t = 0; for (let i = 0; i < x.length; i++) t += x[i] * y[i]; return 1 - t; };
      if (slipped.some(x => ((tm.samples || {})[x.code] || []).some(v => dist(x.feat, v) < 1e-3))) tot.slipTook = (tot.slipTook || 0) + 1;
      tot.held = (tot.held || 0) + Object.values(tm.pending || {}).reduce((n, l) => n + l.length, 0);
      for (const d of book.diagrams) {
        if (d === teach || lessons.includes(d) || !feats[book.name + '/' + d.id]) continue;
        const res = D.classifyCells(cellsOf(book.name + '/' + d.id), tm), truth = fenGrid(d.fen);
        tot.pairs++; if (res.refused) tot.gated++;
        const src = tm.samples || tm.pieces, have = Object.keys(src).filter(k => !tm.samples || src[k].length).sort().join('');
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
          const t = truth[r][c], got = (process.env.NOGATE && res.ungated || res.grid)[r][c], sq = 'abcdefgh'[c] + (8 - r);
          if (DUMP && (t || res.ungated[r][c])) { const x = res.detail[r * 8 + c]; dump.push({ tag: process.env.TAG, book: book.name, teach: teach.id, lessons: lessons.map(l => l.id).join('+'), d: d.id, sq, t, raw: res.ungated[r][c], shown: res.grid[r][c], near: x.type, d1: +x.d1.toFixed(4), lead: +(x.d2 - x.d1).toFixed(4), clear: x.dEmp == null ? null : +(x.dEmp - x.d1).toFixed(4), have }); }
          if (t) tot.real++;
          if (got) tot.shown++;
          if (got && got === t) tot.ok++;
          else if (got && !t) { tot.ghost++; bad.push(book.name + ' ' + teach.id + '->' + d.id + ' ' + sq + ': ' + got + ' on an empty square'); }
          else if (got && lc(got) !== lc(t)) { tot.type++; bad.push(book.name + ' ' + teach.id + '->' + d.id + ' ' + sq + ': ' + got + ' for ' + t); }
          else if (got) { tot.colour++; bad.push(book.name + ' ' + teach.id + (extra ? '+' + extra.id : '') + '->' + d.id + ' ' + sq + ': ' + got + ' for ' + t + ' (colour only)'); }
          else if (t) { tot.miss++; const x = res.detail && res.detail[r * 8 + c]; if (x) missed.push(book.name + ' ' + teach.id + '->' + d.id + ' ' + sq + ' ' + t + ': nearest ' + x.type + ' ' + x.d1.toFixed(3) + ', lead ' + (x.d2 - x.d1).toFixed(3) + ', empty ' + (x.dEmp == null ? '-' : (x.dEmp - x.d1).toFixed(3)) + ', fill ' + x.colorScore.toFixed(2) + (tm.colorRef ? ' (white ' + tm.colorRef.white.toFixed(2) + ' black ' + tm.colorRef.black.toFixed(2) + ')' : ' (no colour reference)')); }
        }
      }
    }
    rows.push({ book: book.name, 'reads (diagram x teacher)': tot.pairs, 'real pieces': tot.real, correct: tot.ok, 'WRONG PIECE': tot.ghost + tot.type, '(on empty sq)': tot.ghost, '(wrong type)': tot.type, 'wrong colour only': tot.colour, 'left empty': tot.miss, 'boards refused': tot.gated, ...(process.env.LEARN ? { 'lessons learned / given': (tot.took || 0) + ' / ' + (tot.lessons || 0) } : {}), ...(process.env.POISON === 'same' ? { 'same slip: accepted / made (plans)': (tot.slipTook || 0) + ' / ' + (tot.slipPlans || 0) } : {}) });
    if (process.env.JSON_OUT) fs.appendFileSync(process.env.JSON_OUT, JSON.stringify({ tag: process.env.TAG, book: book.name, plans: plans.length, ...tot }) + '\n');
  }
  console.table(rows);
  if (DUMP) fs.writeFileSync(DUMP, dump.map(x => JSON.stringify(x)).join('\n') + '\n');
  if (process.env.LIST) for (const b of bad) console.log(b);
  if (process.env.LIST === 'all') for (const b of missed) console.log('left empty: ' + b);
}
if (chrome) chrome.kill(); server.close();
process.exit(0);
