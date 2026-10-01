// Headless-Chrome verification for the move-list redesign (one move pair per
// row, variations underneath, the Variation colour setting). The in-app pane
// does not composite, so screenshots come from a real headless Chrome over CDP.
// Dev tool, not shipped.
//
//   node tools/cdp-verify-movelist.mjs http://localhost:9184 <outDir>
//
// The games are SEEDED (handed to Analysis.loadTree in the page). Taps, the
// long-press, the arrow buttons, the Settings buttons and the Play / Opening
// board moves are real mouse events sent through CDP.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';

const APP_URL = process.argv[2] || 'http://localhost:9184';
const OUT = process.argv[3] || path.join(os.tmpdir(), 'movelist-shots');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpml-'));
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
const centre = sel => evalP(`const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null;
  const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
const mouse = (type, p) => send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
async function click(sel, holdMs = 40) {
  const p = await centre(sel);
  if (!p) throw new Error('nothing to click: ' + sel);
  await mouse('mousePressed', p); await sleep(holdMs); await mouse('mouseReleased', p);
  await sleep(150);
}
// Brings a move into the list's visible box by scrolling the LIST only.
const reveal = sel => evalP(`const l = document.getElementById('ana-moves'); const e = l.querySelector(${JSON.stringify(sel)});
  l.scrollTop += e.getBoundingClientRect().top - l.getBoundingClientRect().top - 20;`);

// ── the games (SEEDED) ──
const NESTED = `{A long comment before the first move. It is long enough to wrap over several lines on a phone, so we can see how the list handles it.}
1. e4 e5 2. Nf3 (2. Bc4 Nf6 (2... Bc5 3. c3 (3. b4 $5 Bxb4 4. c3 Ba5 5. d4 exd4 6. Nf3 d6 7. Qb3 Qd7) 3... Nf6 4. d4 exd4 5. cxd4 Bb4+ 6. Bd2 Bxd2+ 7. Nxd2 d5)
3. d3 c6 4. Nf3 d5 5. Bb3 Bd6 {A comment inside a variation, also long enough to wrap around on a narrow phone screen.} 6. Nc3 dxe4 7. Ng5 O-O 8. Ncxe4 Nxe4 9. Nxe4 Bf5)
2... Nc6 3. Bb5 $1 {The Ruy Lopez. This comment comes after a White move, so White stands alone on the row and Black carries on below as 3… a6.} a6
(3... Nf6 4. O-O Nxe4 $5 5. d4 Nd6 6. Bxc6 dxc6 7. dxe5 Nf5 8. Qxd8+ Kxd8 9. Nc3 Ke8 10. h3 h5)
4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 (9. d4 Bg4) *`;
const LOAD_NESTED = `const { Analysis } = await import('/js/app.js'); const { parsePgn } = await import('/js/tree.js');
  Analysis.loadTree(parsePgn(${JSON.stringify(NESTED)})); document.getElementById('ana-moves').scrollTop = 0;`;
// A long game with no variations: 150 plies of legal moves picked by a fixed rule.
const LOAD_LONG = `const { Analysis } = await import('/js/app.js'); const { GameTree } = await import('/js/tree.js');
  const { Chess } = await import('/vendor/chess.js');
  const tree = new GameTree(); const c = new Chess();
  for (let n = 0; n < 150 && !c.isGameOver(); n++) { const m = c.moves(); const san = m[(n * 7 + 3) % m.length]; c.move(san); tree.play(san); }
  Analysis.loadTree(tree); return tree.toPgn().length;`;

// ── the measurement ──
// Walks every character of the list, finds where each VISUAL line ends (by the
// character's own position on screen), and reports what each line ends with.
const CHECK = sel => evalP(`const { Analysis } = await import('/js/app.js');
  const list = document.querySelector(${JSON.stringify(sel)});
  const out = { rows: list.querySelectorAll(':scope > .mv-row').length, variations: list.querySelectorAll('.variation').length,
    comments: list.querySelectorAll('.mv-comment').length, varLines: 0, endOnBracket: [], endOnSymbol: [], endOnWhiteWithReply: [],
    endOnWhiteStructural: 0, splitUnits: 0, rowsNotOneLine: 0, widerThanList: 0,
    listScrollsSideways: list.scrollWidth > list.clientWidth, pageScrollsSideways: document.documentElement.scrollWidth > window.innerWidth };
  const lr = list.getBoundingClientRect();
  for (const row of list.querySelectorAll(':scope > .mv-row')) {
    const tops = [...row.children].filter(c => c.textContent).map(c => Math.round(c.getBoundingClientRect().bottom));
    if (Math.max(...tops) - Math.min(...tops) > 3) out.rowsNotOneLine++;
    for (const c of row.children) if (c.getBoundingClientRect().right > lr.right + 0.5) out.widerThanList++;
  }
  for (const u of list.querySelectorAll('.mv-unit')) {
    // a unit is split if its first and last move do not sit on the same line
    const mvs = [...u.querySelectorAll('.mv')].map(m => m.getBoundingClientRect());
    if (Math.abs(mvs[0].top - mvs[mvs.length - 1].top) > 3 || u.getBoundingClientRect().height > mvs[0].height * 1.5) out.splitUnits++;
    if (u.getBoundingClientRect().right > lr.right + 0.5) out.widerThanList++;
  }
  const isWhite = el => { const n = Analysis.tree.findById(+el.dataset.node); return Analysis.tree.moveNumberFor(n).whiteMoves; };
  for (const v of list.querySelectorAll('.variation')) {
    // the characters that belong to THIS variation's own line (not to a comment
    // or a nested variation inside it)
    const chars = [];
    const walker = document.createTreeWalker(v, NodeFilter.SHOW_TEXT);
    for (let tn = walker.nextNode(); tn; tn = walker.nextNode()) {
      const unit = tn.parentElement.closest('.mv-unit');
      if (!unit || unit.parentElement !== v) continue;
      for (let i = 0; i < tn.data.length; i++) {
        if (!tn.data[i].trim()) continue;
        const r = document.createRange(); r.setStart(tn, i); r.setEnd(tn, i + 1);
        const b = r.getBoundingClientRect();
        chars.push({ ch: tn.data[i], mid: (b.top + b.bottom) / 2, left: b.left, unit, mv: tn.parentElement.closest('.mv') });
      }
    }
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i], next = chars[i + 1];
      // a line ends where the next character sits lower, or where a block
      // (comment / nested variation) follows, or at the end of the variation
      const wrapped = next && next.mid > c.mid + 4 && next.unit.previousElementSibling === c.unit;
      const lastOfRun = !next || next.unit !== c.unit && next.unit.previousElementSibling !== c.unit;
      if (!wrapped && !lastOfRun) continue;
      out.varLines++;
      const where = c.unit.textContent;
      if (c.ch === '(') out.endOnBracket.push(where);
      else if (!c.mv && c.ch !== ')') out.endOnSymbol.push(where);
      const lastMv = [...c.unit.querySelectorAll('.mv')].pop();
      if (isWhite(lastMv)) {
        if (wrapped) out.endOnWhiteWithReply.push(where);
        else out.endOnWhiteStructural++;
      }
    }
  }
  return out;`);
const failed = r => r.endOnBracket.length || r.endOnSymbol.length || r.endOnWhiteWithReply.length || r.splitUnits ||
  r.rowsNotOneLine || r.widerThanList || r.listScrollsSideways || r.pageScrollsSideways;
let failures = 0;
const report = (label, r) => { const bad = failed(r); if (bad) failures++; console.error(`  ${bad ? 'FAIL' : 'ok  '} ${label}: ${JSON.stringify(r)}`); };

// WCAG contrast of the variation text against the list's background.
const CONTRAST = `const lum = s => { const [r, g, b] = s.match(/[\\d.]+/g).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return +((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)).toFixed(2); };
  const list = document.getElementById('ana-moves'); const bg = getComputedStyle(list).backgroundColor;
  return { variation: ratio(getComputedStyle(list.querySelector('.variation')).color, bg), comment: ratio(getComputedStyle(list.querySelector('.mv-comment')).color, bg),
    mainMove: ratio(getComputedStyle(list.querySelector('.mv-row .mv:not(.current)')).color, bg) };`;
// For looking at the whole list in one picture. NOT how the app shows it — the
// real list is 30% of the screen tall and scrolls.
const EXPAND = on => evalP(`const l = document.getElementById('ana-moves'); l.style.maxHeight = ${on ? "'none'" : "''"};
  ${on ? "l.scrollIntoView({ block: 'start' }); window.scrollBy(0, -8);" : 'window.scrollTo(0, 0);'}`);

for (const lang of ['en', 'es']) {
  for (const scheme of ['light', 'dark']) {
    const tag = `${lang}-${scheme}`;
    console.error('… ' + tag);
    await load(lang, scheme);
    await evalP(LOAD_LONG); await sleep(300);
    report('long game, no variations', await CHECK('#ana-moves'));
    await shot(`${tag}-1-long`);
    await evalP(LOAD_NESTED); await sleep(300);
    report('nested 3 deep + long comments', await CHECK('#ana-moves'));
    await shot(`${tag}-2-nested-real-height`);
    await EXPAND(true); await sleep(200);
    for (const col of ['grey', 'blue', 'gold']) {
      await evalP(`const { Themes } = await import('/js/appearance.js'); Themes.setVariationColor('${col}');`);
      await sleep(150);
      console.error(`  contrast ${col}: ` + JSON.stringify(await evalP(CONTRAST)));
      await shot(`${tag}-3-expanded-${col}`);
    }
    await EXPAND(false);
    await evalP(`const { Themes } = await import('/js/appearance.js'); Themes.setVariationColor('grey');`);
  }
}

// ── Width sweep: the same nested game at other phone widths, so the lines wrap
// in different places each time. ──
console.error('… width sweep (EN, dark)');
for (const w of [320, 344, 360, 375, 390, 412, 430]) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: 812, deviceScaleFactor: 2, mobile: true });
  await evalP(LOAD_NESTED); await sleep(250);
  report(`nested at ${w}px`, await CHECK('#ana-moves'));
}
// Control: does the measurement catch the old bug? Take the glue away and it must fail.
await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 812, deviceScaleFactor: 2, mobile: true });
await evalP(`const st = document.createElement('style'); st.id = 'cdp-unglue'; st.textContent = '.mv-unit { white-space: normal !important; }'; document.head.appendChild(st);`);
await evalP(LOAD_NESTED); await sleep(250);
const control = await CHECK('#ana-moves');
await evalP(`document.getElementById('cdp-unglue').remove();`);
if (!failed(control)) failures++;
console.error(`  ${failed(control) ? 'ok  ' : 'FAIL'} control (glue removed, the checker MUST complain): bracket ${control.endOnBracket.length} · symbol ${control.endOnSymbol.length} · White-with-reply ${control.endOnWhiteWithReply.length} · split units ${control.splitUnits}`);
await evalP(LOAD_NESTED); await sleep(250);
await EXPAND(true); await sleep(200); await shot('sweep-320-expanded'); await EXPAND(false);
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });

// ── The real flows (EN, light) ──
console.error('… flows (real mouse events)');
await load('en', 'light');
errors.length = 0;
await evalP(LOAD_NESTED); await sleep(300);
const cur = () => evalP(`const { Analysis } = await import('/js/app.js'); const c = document.querySelector('#ana-moves .mv.current');
  return { treeNode: Analysis.tree.current.id, san: Analysis.tree.current.san, highlighted: c && +c.dataset.node, highlightedCount: document.querySelectorAll('#ana-moves .mv.current').length };`);
const idOf = sel => evalP(`return +document.querySelector(${JSON.stringify(sel)}).dataset.node;`);

// A. tap a main-line move
let sel = '#ana-moves > .mv-row .mv';
let want = await idOf(sel);
await click(sel);
console.error(`  A. tap main-line move (node ${want}): ` + JSON.stringify(await cur()));
// B. tap a move inside the depth-3 variation
sel = '#ana-moves .variation.d3 .mv-unit:nth-of-type(2) .mv:last-child';
want = await idOf(sel); await reveal(sel); await sleep(150);
await click(sel);
console.error(`  B. tap move 3 levels deep (node ${want}): ` + JSON.stringify(await cur()));
await shot('flow-B-deep-move-current');
// C. tap a comment → jumps to the move it belongs to
sel = '#ana-moves .variation .mv-comment';
want = await idOf(sel); await reveal(sel); await sleep(150);
await click(sel);
console.error(`  C. tap a comment (belongs to node ${want}): ` + JSON.stringify(await cur()));
// D. long-press → the move menu
await evalP(`document.querySelectorAll('#ana-moves > .mv-row')[1].querySelector('.mv').id = 'cdp-hold';`);
sel = '#cdp-hold';
want = await idOf(sel); await reveal(sel); await sleep(150);
await click(sel, 750);
await sleep(300);
console.error(`  D. long-press (node ${want}): ` + JSON.stringify(await cur()) + ' · menu: ' +
  JSON.stringify(await evalP(`return [...document.querySelectorAll('.modal-back button, .sheet button')].map(b => b.textContent.trim());`)));
await shot('flow-D-long-press-menu');
await evalP(`document.querySelectorAll('.modal-back, .sheet-back').forEach(e => e.remove());`);

// E. arrow buttons through the long game: the current move stays inside the
// list's visible box and the PAGE never scrolls.
await evalP(LOAD_LONG); await sleep(300);
const inView = () => evalP(`const l = document.getElementById('ana-moves').getBoundingClientRect(); const c = document.querySelector('#ana-moves .mv.current');
  if (!c) return 'none'; const r = c.getBoundingClientRect(); return r.top >= l.top - 1 && r.bottom <= l.bottom + 1;`);
await click('#ana-first');
const y0 = await evalP(`return window.scrollY;`);
let steps = 0, outOfView = 0, pageMoved = 0;
for (let i = 0; i < 150; i++) {
  await click('#ana-next'); steps++;
  if ((await inView()) !== true) outOfView++;
  if (await evalP(`return window.scrollY;`) !== y0) pageMoved++;
}
console.error(`  E. ▶ x${steps}: current move out of view ${outOfView} times · page scrolled ${pageMoved} times · now ` + JSON.stringify(await cur()));
await shot('flow-E-arrows-end');
outOfView = 0;
for (let i = 0; i < 60; i++) { await click('#ana-prev'); if ((await inView()) !== true) outOfView++; }
console.error(`  E. ◀ x60: current move out of view ${outOfView} times · now ` + JSON.stringify(await cur()));

// F. a Masterclass chapter, through Masterclass.openChapter (the chapter itself
// is SEEDED — Firestore is unreachable here).
await evalP(`const { Masterclass } = await import('/js/masterclass.js'); Masterclass.openChapter({ id: 'seeded-chapter', pgn: ${JSON.stringify(NESTED)} });`);
await sleep(400);
report('F. Masterclass chapter (seeded) via openChapter', await CHECK('#ana-moves'));
await evalP(`const { Masterclass } = await import('/js/masterclass.js'); Masterclass.liveChapterId = null;`);

// G. Settings → Variation colour, with the real buttons; then a reload.
await evalP(LOAD_NESTED); await sleep(200);
await click('#btn-settings'); await sleep(500);
const segs = await evalP(`const lab = [...document.querySelectorAll('.modal-box .fld-label')].find(l => l.textContent === 'Variation color');
  if (!lab) return null; lab.nextElementSibling.id = 'cdp-var-seg'; lab.scrollIntoView({ block: 'center' });
  return [...lab.nextElementSibling.querySelectorAll('button')].map(b => b.textContent + (b.classList.contains('on') ? '*' : ''));`);
console.error('  G. Settings row: ' + JSON.stringify(segs));
await sleep(200);
await shot('flow-G-settings-row');
await click('#cdp-var-seg button[data-v="gold"]');
const afterGold = await evalP(`const db = await import('/js/db.js'); return { body: [...document.body.classList].filter(c => c.startsWith('varcol')), saved: await db.kvGet('variationColor', null),
  on: document.querySelector('#cdp-var-seg button.on').dataset.v };`);
console.error('  G. after tapping Gold: ' + JSON.stringify(afterGold));
await send('Page.reload', {}); await sleep(3500);
console.error('  G. after reload: ' + JSON.stringify(await evalP(`return [...document.body.classList].filter(c => c.startsWith('varcol'));`)));
await evalP(`document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove());`);

// H. Play: a real game against Stockfish, moves made on the board.
const boardMove = async (board, from, to) => {
  await click(`#${board} [data-sq="${from}"]`); await click(`#${board} [data-sq="${to}"]`);
};
await evalP(`const app = await import('/js/app.js'); app.showScreen('play');`);
await sleep(300);
await click('#play-start'); await sleep(1500);
for (const [f, t] of [['e2', 'e4'], ['d2', 'd4'], ['g1', 'f3'], ['b1', 'c3']]) { await boardMove('play-board', f, t); await sleep(3500); }
console.error('  H. Play list: "' + await evalP(`return document.getElementById('play-moves').innerText.replace(/\\s+/g, ' ');`) + '"');
report('H. Play list', await CHECK('#play-moves'));
await evalP(`document.getElementById('play-moves').scrollIntoView({ block: 'center' });`); await sleep(200);
await shot('flow-H-play');

// I. Opening trainer. It needs a database to read its book from: that one game
// is SEEDED; the moves on the board are real.
await evalP(`const db = await import('/js/db.js'); const id = await db.createBase('CDP openings');
  await db.addGame({ baseId: id, white: 'A', black: 'B', result: '*', date: '', event: '', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 *', updatedAt: Date.now() });
  const app = await import('/js/app.js'); app.showScreen('trainer');`);
await sleep(300);
await click('#trainer-start'); await sleep(1500);
for (const [f, t] of [['e2', 'e4'], ['g1', 'f3'], ['f1', 'c4']]) { await boardMove('trainer-board', f, t); await sleep(2500); }
console.error('  I. Opening list: "' + await evalP(`return document.getElementById('trainer-moves').innerText.replace(/\\s+/g, ' ');`) + '"');
report('I. Opening list', await CHECK('#trainer-moves'));
await evalP(`document.getElementById('trainer-moves').scrollIntoView({ block: 'center' });`); await sleep(200);
await shot('flow-I-opening');

console.error('ERRORS: ' + JSON.stringify(errors, null, 1));
console.error(failures ? `FAILED: ${failures} check(s)` : 'ALL LAYOUT CHECKS PASSED');
ws.close(); chrome.kill();
process.exit(failures ? 1 : 0);
