// The opening library in the Openings tab: Library | My databases, the cards,
// the search, an opening's variations, the preview. Dev tool, not shipped.
// Headless Chrome over CDP, signed out.
//
//   node tools/cdp-verify-opening-lib.mjs <outDir>     about two minutes
//
// At 375 x 667 in ES and EN, light and dark. REALLY TAPPED (CDP touch events):
// the switch, the colour buttons, the first-move chips, cards, rows, the four
// preview buttons, a move in the list, both back buttons, Start and the game's
// back. TYPED (CDP insertText): the search and the filter. CALLED, not tapped:
// showScreen(), the seeding of one database, Tour.running.
// Checked: js/opening-library.js is not asked for until the Library shows, and
// not at all when My databases is the remembered view; the cards and their
// boards; the order; the filters; the accent-blind search; the Sicilian's 400
// rows and how long they take; a one-line opening; the preview's name at every
// move and that the board never moves; My databases and a game from a database;
// the remembered view; the guided tour's view.
// Then OFFLINE: the app is loaded once through its real service worker, the
// server is taken away, and the Library must open and a preview play through.
// NOT checked here: a real phone. The timings are a desktop's.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/cdp-verify-opening-lib.mjs <outDir>'); process.exit(1); }
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const WEB = 9900 + Math.floor(Math.random() * 90);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-lib-'));
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 420000).unref();
const net = { sw: false, down: false, hits: [] };   // the server: serve sw.js? answer at all? what was asked for

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.wav': 'audio/wav' };
const server = http.createServer((req, res) => {
  if (net.down) { req.socket.destroy(); return; }
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  net.hits.push(p);
  if (p === '/sw.js' && !net.sw) { res.writeHead(404).end(); return; }
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
const touch = (type, p) => send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }] : [] });
// A real tap, on something scrolled to first.
const tap = async sel => {
  const pt = await ev(`const e = document.querySelector(${JSON.stringify(sel)}); e.scrollIntoView({ block: 'center' }); await new Promise(r => requestAnimationFrame(r));
    const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
  await touch('touchStart', pt); await sleep(40); await touch('touchEnd'); await sleep(220);
};
const type = async (sel, text) => {
  await tap(sel);
  await ev(`const e = document.querySelector(${JSON.stringify(sel)}); e.focus(); e.select();`);
  if (text) await send('Input.insertText', { text });
  else await ev(`const e = document.querySelector(${JSON.stringify(sel)}); e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true }));`);
  await sleep(400);
};
const shown = id => ev(`const e = document.getElementById(${JSON.stringify(id)}); return !!e && e.getClientRects().length > 0;`);
const kv = key => ev(`return await (await import('/js/db.js')).kvGet(${JSON.stringify(key)}, null);`);
const boot = async () => {
  await sleep(2500);
  await ev(`document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove());
    window.__app = await import('/js/app.js'); window.__lib = (await import('/js/opening-lib-ui.js')).OpeningLib;`);
};
const libAsked = () => net.hits.includes('/js/opening-library.js');
// Scrolls the page to its end until `sel` counts `want`, as a thumb would.
const scrollAll = async (sel, want) => ev(`
  const main = document.querySelector('main'), t0 = performance.now();
  for (let i = 0; i < 400 && document.querySelectorAll(${JSON.stringify(sel)}).length < ${want}; i++) {
    main.scrollTop = main.scrollHeight;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => setTimeout(r, 30));
  }
  return { n: document.querySelectorAll(${JSON.stringify(sel)}).length, ms: Math.round(performance.now() - t0) };`);
const cardsState = () => ev(`
  const cs = [...document.querySelectorAll('#lib-cards .lib-card')];
  return { n: cs.length, names: cs.slice(0, 3).map(c => c.querySelector('.lib-card-name').textContent),
    first: cs[0] ? [...cs[0].querySelectorAll('.sub')].map(s => s.textContent) : [],
    sides: [...new Set(cs.map(c => c.querySelector('.lib-side-ico').dataset.side))].join(),
    moves: cs.map(c => c.querySelector('.sub.moves').textContent.split(' ')[0]) };`);

let failed = false;
try {
  for (const [lang, scheme] of [['es', 'light'], ['es', 'dark'], ['en', 'light'], ['en', 'dark']]) {
    const tag = `${lang}-${scheme}`, es = lang === 'es';
    console.log(`\n── ${tag} ──`);
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await send('Page.navigate', { url: `http://localhost:${WEB}/` });
    await sleep(1200);
    await ev(`localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1');
      await (await import('/js/db.js')).kvSet('trainerView', null);`);
    net.hits = [];
    await send('Page.reload', {});
    await boot();
    check(`[${tag}] start-up: ${net.hits.length} files asked for, js/opening-library.js is not one of them`, net.hits.length > 30 && !libAsked());

    // ── the Library is what a new user sees ──
    await ev(`__app.showScreen('trainer');`);
    check(`[${tag}] the Openings tab opens on the Library and the cards come up`, await until(`document.querySelectorAll('#lib-cards .lib-card').length > 0`, 8000));
    check(`[${tag}] ... and only now is js/opening-library.js asked for`, libAsked());
    await until(`[...document.querySelectorAll('#lib-cards .lib-mini img')].every(i => i.complete && i.naturalWidth > 0)`, 6000);
    let c = await cardsState();
    const lay = await ev(`
      const r = s => document.querySelector(s).getBoundingClientRect(), card = document.querySelector('#lib-cards .lib-card'), mini = card.querySelector('.lib-mini');
      const sw = [...document.querySelectorAll('#trainer-views button')];
      return { sw: sw.map(b => b.textContent + (b.classList.contains('on') ? '*' : '')), swWhole: sw.every(b => b.scrollWidth <= b.clientWidth),
        mini: Math.round(mini.getBoundingClientRect().width) + 'x' + Math.round(mini.getBoundingClientRect().height),
        pieces: mini.querySelectorAll('img').length, drawn: [...mini.querySelectorAll('img')].every(i => i.naturalWidth > 0),
        e4: (() => { const p = [...mini.querySelectorAll('img')].find(i => i.style.left === '50%' && i.style.top === '50%'); return p ? p.getAttribute('src') : null; })(),
        card: Math.round(r('#lib-cards .lib-card').height), sideScroll: document.documentElement.scrollWidth - innerWidth,
        nameWhole: [...document.querySelectorAll('.lib-card-name')].every(n => n.getBoundingClientRect().right <= innerWidth - 10),
        ph: document.getElementById('lib-search').placeholder, seg: [...document.querySelectorAll('#lib-side button, #lib-first button')].map(b => b.textContent),
        setup: document.getElementById('trainer-setup').getClientRects().length, view: document.getElementById('screen-trainer').dataset.view };`);
    check(`[${tag}] the switch reads ${lay.sw.join(' | ')}, Library first and lit, nothing cut`, lay.sw.join() === (es ? 'Biblioteca*,Mis bases' : 'Library*,My databases') && lay.swWhole && lay.view === 'library' && lay.setup === 0, lay.sw);
    check(`[${tag}] the screen's own words are in ${es ? 'Spanish' : 'English'}: "${lay.ph}", ${lay.seg.join(' / ')}`,
      lay.ph === (es ? 'Buscar aperturas' : 'Search openings') && lay.seg.join() === (es ? 'Ambos,Blancas,Negras,1.e4,1.d4,Otras' : 'Both,White,Black,1.e4,1.d4,Other'));
    check(`[${tag}] ${c.n} cards drawn to begin with, not 150; the first is the Sicilian: ${c.first.join(' · ')}`,
      c.n === 16 && c.names.join() === 'Sicilian Defense,Ruy Lopez,French Defense' && c.first.join('|') === (es ? 'Negras|1.e4 c5|400 variantes' : 'Black|1.e4 c5|400 variations'), c.names);
    check(`[${tag}] its board: ${lay.mini}px, ${lay.pieces} pieces, all drawn, a white pawn on e4 (${lay.e4})`, lay.mini === '88x88' && lay.pieces === 32 && lay.drawn && /wP\.svg$/.test(lay.e4 || ''), lay);
    check(`[${tag}] no sideways scroll and no name running off the card (card ${lay.card}px high)`, lay.sideScroll <= 0 && lay.nameWhole, lay);
    await shot(`${tag}-1-cards`);

    // ── the whole list, scrolled ──
    const all = await scrollAll('#lib-cards .lib-card', 150);
    const dom = await ev(`
      const main = document.querySelector('main'); let worst = 0, last = performance.now();
      main.scrollTop = 0;
      for (let i = 0; i < 60; i++) { main.scrollTop += 260; await new Promise(r => requestAnimationFrame(r)); const now = performance.now(); worst = Math.max(worst, now - last); last = now; }
      return { imgs: document.querySelectorAll('#lib-cards img').length, nodes: document.querySelectorAll('#lib-cards *').length, worst: Math.round(worst), height: main.scrollHeight };`);
    check(`[${tag}] scrolled to the end: all 150 cards in ${all.ms} ms; ${dom.imgs} piece images, ${dom.nodes} elements; then 60 scroll steps, slowest frame ${dom.worst} ms`, all.n === 150 && dom.worst < 120, { ...all, ...dom });
    c = await cardsState();
    const tail = await ev(`return [...document.querySelectorAll('#lib-cards .lib-card')].slice(-40).every(x => /^1 /.test(x.querySelector('.sub:last-child').textContent));`);
    check(`[${tag}] the 40 one-line openings are the last 40 cards`, tail);

    // ── colour and first move ──
    await tap('#lib-side [data-v="w"]');
    c = await cardsState();
    check(`[${tag}] White: only White openings, the Ruy Lopez first`, c.sides === 'w' && c.names[0] === 'Ruy Lopez', c.names);
    await tap('#lib-first [data-v="d4"]');
    c = await cardsState();
    check(`[${tag}] White and 1.d4: every card begins 1.d4 (${c.names[0]} first)`, c.sides === 'w' && c.n > 0 && c.moves.every(m => m === '1.d4'), c.names);
    await tap('#lib-first [data-v="d4"]');
    await tap('#lib-first [data-v="other"]');
    await tap('#lib-side [data-v="both"]');
    c = await cardsState();
    check(`[${tag}] a chip tapped again lets go; Other with Both: no 1.e4 and no 1.d4 (${c.names[0]} first)`, c.n > 0 && c.moves.every(m => m !== '1.e4' && m !== '1.d4') && c.sides.length > 1, c.names);
    await shot(`${tag}-1b-filtered`);
    await tap('#lib-first [data-v="other"]');

    // ── the search ──
    await type('#lib-search', 'grunfeld');
    let rows = await ev(`const b = [...document.querySelectorAll('#lib-cards .list-item')];
      return { n: b.length, cards: document.querySelectorAll('#lib-cards .lib-card').length, names: b.map(x => x.firstChild.textContent), count: document.getElementById('lib-count').textContent,
        moves: b[0] ? b[0].querySelector('.sub.moves').textContent : '' };`);
    check(`[${tag}] "grunfeld" typed without its accent: ${rows.count}, variations and not cards, every one a Grünfeld`,
      rows.n > 20 && rows.cards === 0 && rows.names.every(n => /Grünfeld/.test(n)) && rows.count === `${await ev(`return __lib.index.filter(e => e.text.includes('grunfeld')).length;`)} ${es ? 'variantes' : 'variations'}`, rows.names.slice(0, 3));
    await shot(`${tag}-2-search`);
    await type('#lib-search', 'zzzz');
    const none = await ev(`return document.getElementById('lib-cards').textContent;`);
    check(`[${tag}] a search that finds nothing says so: "${none}"`, none === (es ? 'Nada coincide con esa búsqueda.' : 'Nothing matches that search.'));
    await type('#lib-search', 'najdorf english attack');
    await tap('#lib-cards .list-item');
    const fromSearch = await ev(`return { preview: document.getElementById('lib-preview').getClientRects().length, name: document.getElementById('lib-name').textContent };`);
    check(`[${tag}] a search result opens its preview (${fromSearch.name})`, fromSearch.preview > 0 && /Sicilian Defense.*Najdorf.*English Attack/.test(fromSearch.name), fromSearch);
    await tap('#lib-preview-back');
    const backToSearch = await ev(`return { list: document.getElementById('lib-list').getClientRects().length, q: document.getElementById('lib-search').value, rows: document.querySelectorAll('#lib-cards .list-item').length };`);
    check(`[${tag}] ... and Back returns to the same search`, backToSearch.list > 0 && backToSearch.q === 'najdorf english attack' && backToSearch.rows > 0, backToSearch);
    await type('#lib-search', '');

    // ── a long opening: the Sicilian ──
    await ev(`document.querySelector('main').scrollTop = 0;`);
    await tap('#lib-cards .lib-card');
    check(`[${tag}] a tap on the Sicilian's card opens its page`, await until(`document.getElementById('lib-opening').getClientRects().length > 0`, 3000));
    const op = await ev(`return { name: document.getElementById('lib-opening-name').textContent, sub: document.getElementById('lib-opening-sub').textContent,
      rows: document.querySelectorAll('#lib-rows .list-item').length, first: document.querySelector('#lib-rows .list-item').textContent,
      sw: document.getElementById('trainer-views').getClientRects().length, filter: document.getElementById('lib-filter').getClientRects().length, ph: document.getElementById('lib-filter').placeholder,
      sideScroll: document.documentElement.scrollWidth - innerWidth, top: document.querySelector('main').scrollTop };`);
    check(`[${tag}] Sicilian Defense · ${op.sub}; ${op.rows} rows drawn to begin with; its own filter box ("${op.ph}"); the switch gone; the page at its top`,
      op.name === 'Sicilian Defense' && op.sub === (es ? 'Negras · 400 variantes' : 'Black · 400 variations') && op.rows === 60 && op.first === 'Sicilian Defense1.e4 c5' && op.sw === 0 && op.filter > 0 && op.sideScroll <= 0 && op.top === 0, op);
    await shot(`${tag}-3-sicilian`);
    const open = await ev(`const i = __lib.opening, t0 = performance.now(); __lib.openOpening(i); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return Math.round(performance.now() - t0);`);
    const allRows = await scrollAll('#lib-rows .list-item', 400);
    check(`[${tag}] opening the page takes ${open} ms to the next frame; scrolled to the end, all 400 rows are there (${allRows.ms} ms)`, open < 250 && allRows.n === 400, { open, ...allRows });
    await type('#lib-filter', 'najdorf');
    rows = await ev(`const b = [...document.querySelectorAll('#lib-rows .list-item')]; return { n: b.length, names: b.map(x => x.firstChild.textContent) };`);
    check(`[${tag}] the filter "najdorf" leaves ${rows.n} rows, every one a Najdorf, in the order of the data`,
      rows.n > 5 && rows.n < 400 && rows.names.every(n => /Najdorf/.test(n)) && JSON.stringify(rows.names) === JSON.stringify(await ev(`return __lib.lib[__lib.opening].lines.filter(l => /Najdorf/.test(l[1])).map(l => l[1]);`)), rows.names.slice(0, 3));

    // ── the preview ──
    const pick = await ev(`const b = [...document.querySelectorAll('#lib-rows .list-item')]; const i = b.findIndex(x => x.firstChild.textContent === 'Najdorf Variation, English Attack');
      b[i].id = 'verify-row'; b[i].scrollIntoView({ block: 'center' }); return { i, top: document.querySelector('main').scrollTop, moves: b[i].querySelector('.sub.moves').textContent };`);
    await tap('#verify-row');
    const scrollBefore = await ev(`return __lib.scroll.opening;`);
    const pv = () => ev(`const L = __lib.line, r = document.getElementById('lib-board').getBoundingClientRect(), d = id => document.getElementById(id).disabled;
      return { ply: L.ply, n: L.moves.length, fenOk: __lib.board.fen === L.fens[L.ply], name: document.getElementById('lib-name-opening').textContent, variation: document.getElementById('lib-name-variation').textContent,
        top: Math.round((r.top + document.querySelector('main').scrollTop) * 10) / 10, listBottom: Math.round(document.getElementById('lib-moves').getBoundingClientRect().bottom + document.querySelector('main').scrollTop), w: Math.round(r.width), mvs: document.querySelectorAll('#lib-moves .mv').length, cur: document.querySelector('#lib-moves .mv.current')?.textContent ?? null,
        off: [d('lib-nav-first'), d('lib-nav-prev'), d('lib-nav-next'), d('lib-nav-last')].map(x => x ? 1 : 0).join(''), last: document.querySelectorAll('#lib-board .sq.lastmove').length,
        live: document.getElementById('lib-board').classList.contains('live'), page: document.querySelector('main').scrollHeight - document.querySelector('main').clientHeight,
        h: innerHeight, sideScroll: document.documentElement.scrollWidth - innerWidth,
        dead: [...document.querySelectorAll('#lib-preview button')].map(b => b.id).join() };`);
    let p = await pv();
    check(`[${tag}] a tap on a variation opens the preview at its last move (${p.n} moves): ${p.name} / ${p.variation}`,
      p.ply === p.n && p.n === 11 && p.fenOk && p.name === 'Sicilian Defense' && p.variation === 'Najdorf Variation, English Attack' && p.mvs === 11 && p.cur === 'Be3' && p.off === '0011' && p.last === 2, p);
    check(`[${tag}] the board is ${p.w}px and cannot be moved on; board, buttons and the whole move list fit the screen with nothing scrolled (list ends at ${p.listBottom} of ${p.h}); nothing sideways; no buttons but back and the four`,
      p.w >= 340 && !p.live && p.listBottom <= p.h && p.sideScroll <= 0 && p.dead === 'lib-preview-back,lib-nav-first,lib-nav-prev,lib-nav-next,lib-nav-last', p);
    await shot(`${tag}-4-preview`);
    const top0 = p.top, seen = [];
    for (let i = p.n; i > 0; i--) { await tap('#lib-nav-prev'); p = await pv(); seen.push({ ply: p.ply, name: p.name, variation: p.variation, top: p.top, ok: p.fenOk }); }
    const at = n => seen.find(s => s.ply === n);
    check(`[${tag}] back, one move at a time: the name is always the deepest one earned (after 10: ${at(10).variation}; after 2: ${at(2).name}; after 1: ${at(1).name})`,
      seen.every(s => s.ok) && at(10).variation === 'Najdorf Variation' && at(2).name === 'Sicilian Defense' && at(2).variation === '' && at(1).name === "King's Pawn Game", seen.map(s => s.ply + ' ' + s.name + ': ' + s.variation));
    check(`[${tag}] ... and through all of it the board did not move a pixel (top ${top0})`, seen.every(s => s.top === top0), seen.map(s => s.top));
    check(`[${tag}] at the start: "${p.name}", back and first switched off`, p.ply === 0 && p.name === (es ? 'Posición inicial' : 'Start position') && p.off === '1100' && p.cur === null, p);
    await tap('#lib-nav-last'); p = await pv();
    const atEnd = p.ply === p.n;
    await tap('#lib-nav-first'); await tap('#lib-nav-next'); await tap('#lib-nav-next'); await tap('#lib-nav-next'); p = await pv();
    check(`[${tag}] last, first, then next three times: move 3 (${p.cur}) on the board`, atEnd && p.ply === 3 && p.cur === 'Nf3' && p.fenOk && p.top === top0, p);
    await tap('#lib-moves .mv[data-ply="7"]'); p = await pv();
    check(`[${tag}] a tap on a move in the list (${p.cur}) puts it on the board`, p.ply === 7 && p.cur === 'Nxd4' && p.fenOk, p);
    await shot(`${tag}-5-preview-mid`);
    const fenBefore = await ev(`return __lib.board.fen;`);
    await tap('#lib-board .sq[data-sq="g8"]'); await tap('#lib-board .sq[data-sq="f6"]');
    check(`[${tag}] tapping a piece and a square on the preview board plays nothing`, fenBefore === await ev(`return __lib.board.fen;`) && !(await ev(`return document.querySelector('#lib-board .sq.selected');`)));
    await tap('#lib-preview-back');
    const back1 = await ev(`return { page: document.getElementById('lib-opening').getClientRects().length, top: document.querySelector('main').scrollTop, filter: document.getElementById('lib-filter').value };`);
    check(`[${tag}] Back returns to the Sicilian's list where it was left (scroll ${back1.top}, filter "${back1.filter}")`, back1.page > 0 && Math.abs(back1.top - scrollBefore) <= 1 && back1.filter === 'najdorf', { back1, scrollBefore });
    await tap('#lib-opening-back');
    const back2 = await ev(`return { list: document.getElementById('lib-list').getClientRects().length, sw: document.getElementById('trainer-views').getClientRects().length, cards: document.querySelectorAll('#lib-cards .lib-card').length };`);
    check(`[${tag}] Back again returns to the cards, with the switch`, back2.list > 0 && back2.sw > 0 && back2.cards > 0, back2);

    // ── a one-line opening ──
    await scrollAll('#lib-cards .lib-card', 150);
    const lastName = await ev(`const c = [...document.querySelectorAll('#lib-cards .lib-card')].pop(); c.id = 'verify-last'; return c.querySelector('.lib-card-name').textContent;`);
    await tap('#verify-last');
    const one = await ev(`return { name: document.getElementById('lib-opening-name').textContent, sub: document.getElementById('lib-opening-sub').textContent, rows: document.querySelectorAll('#lib-rows .list-item').length,
      filter: document.getElementById('lib-filter').getClientRects().length, row: document.querySelector('#lib-rows .list-item').textContent };`);
    check(`[${tag}] the last card, ${lastName}: ${one.sub}, one row, no filter box`, one.name === lastName && one.rows === 1 && one.filter === 0 && /^(Blancas|Negras|White|Black) · 1 (variante|variation)$/.test(one.sub), one);
    await shot(`${tag}-6-one-line`);
    await tap('#lib-rows .list-item');
    p = await pv();
    check(`[${tag}] ... and its one line previews (${p.name} / ${p.variation}, ${p.n} moves)`, p.ply === p.n && p.fenOk && p.name === lastName, p);
    await shot(`${tag}-6b-one-line-preview`);
    await tap('#lib-preview-back'); await tap('#lib-opening-back');

    // ── My databases: today's form, unchanged ──
    await ev(`document.querySelector('main').scrollTop = 0;`);
    await tap('#trainer-views [data-v="mine"]');
    const seeded = await ev(`
      const db = await import('/js/db.js');
      if (!(await db.listBases()).some(b => b.name === 'Verify Library')) {
        const id = await db.createBase('Verify Library');
        await db.addGames([{ baseId: id, white: 'Verify', black: 'Book', event: 'Test', date: '2026.10.12', result: '*', updatedAt: Date.now(),
          pgn: '[Event "Test"]\\n[White "Verify"]\\n[Black "Book"]\\n[Result "*"]\\n\\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 *' }]);
      }
      await __app.Trainer.refreshBases();
      const sel = document.getElementById('trainer-base');
      sel.value = [...sel.options].find(o => /Verify Library/.test(o.textContent)).value; sel.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 500));
      return sel.selectedOptions[0].textContent;`);
    const mine = await ev(`const main = document.querySelector('main'), start = document.getElementById('trainer-start').getBoundingClientRect(), tab = document.getElementById('tabbar');
      return { view: document.getElementById('screen-trainer').dataset.view, setup: document.getElementById('trainer-setup').getClientRects().length, lib: document.getElementById('trainer-library').getClientRects().length,
        pageScroll: main.scrollHeight - main.clientHeight, startBottom: Math.round(start.bottom), h: innerHeight, sideScroll: document.documentElement.scrollWidth - innerWidth,
        controls: ['trainer-base', 'trainer-one', 'trainer-color', 'trainer-level', 'trainer-start'].filter(id => document.getElementById(id).getClientRects().length > 0).length,
        levels: document.querySelectorAll('#trainer-level button').length, lit: document.querySelector('#trainer-views button.on').dataset.v };`);
    check(`[${tag}] My databases, tapped: the setup form with all its controls, the Library gone, remembered as "${await kv('trainerView')}"`,
      mine.view === 'mine' && mine.setup > 0 && mine.lib === 0 && mine.controls === 5 && mine.levels >= 5 && mine.lit === 'mine' && await kv('trainerView') === 'mine', { mine, seeded });
    check(`[${tag}] ... Start is on screen with nothing scrolled (${mine.startBottom} of ${mine.h}); a database with its one-game row leaves ${mine.pageScroll}px to scroll`, mine.startBottom <= mine.h && mine.pageScroll <= 20 && mine.sideScroll <= 0, mine);
    await shot(`${tag}-7-mine`);
    await tap('#trainer-start');
    const game = await until(`document.getElementById('trainer-game').getClientRects().length > 0 && __app.Trainer.posHistory.length > 0`, 6000);
    const g = await ev(`return { sw: document.getElementById('trainer-views').getClientRects().length, setup: document.getElementById('trainer-setup').getClientRects().length, book: __app.Trainer.book?.size ?? 0,
      badge: document.getElementById('trainer-book-status').textContent, board: Math.round(document.getElementById('trainer-board').getBoundingClientRect().width) };`);
    check(`[${tag}] Start plays a game from my own database (book of ${g.book} positions, "${g.badge}"), the switch out of the way`, game && g.sw === 0 && g.setup === 0 && g.book >= 8 && g.board >= 340, g);
    await shot(`${tag}-8-game`);
    await tap('#trainer-back');
    const after = await ev(`return { sw: document.getElementById('trainer-views').getClientRects().length, setup: document.getElementById('trainer-setup').getClientRects().length, game: document.getElementById('trainer-game').getClientRects().length };`);
    check(`[${tag}] the game's Back returns to the form and the switch`, after.sw > 0 && after.setup > 0 && after.game === 0, after);

    // ── the remembered view ──
    net.hits = [];
    await send('Page.reload', {});
    await boot();
    await ev(`__app.showScreen('trainer');`);
    await sleep(600);
    const rem = await ev(`return { view: document.getElementById('screen-trainer').dataset.view, setup: document.getElementById('trainer-setup').getClientRects().length, lit: document.querySelector('#trainer-views button.on').dataset.v };`);
    check(`[${tag}] after a reload the tab opens on My databases again, and the library file was not asked for at all`, rem.view === 'mine' && rem.setup > 0 && rem.lit === 'mine' && !libAsked(), rem);
    await tap('#trainer-views [data-v="library"]');
    check(`[${tag}] the switch back to Library loads it then, and is remembered`, await until(`document.querySelectorAll('#lib-cards .lib-card').length > 0`, 8000) && libAsked() && await kv('trainerView') === 'library');

    // ── the guided tour explains the setup form ──
    const tour = await ev(`const Tour = (await import('/js/tour.js')).default;
      __app.showScreen('analysis'); Tour.running = true; __app.showScreen('trainer'); await new Promise(r => setTimeout(r, 300));
      const during = { view: document.getElementById('screen-trainer').dataset.view, setup: document.getElementById('trainer-setup').getClientRects().length, base: document.getElementById('trainer-base').getClientRects().length,
        kv: await (await import('/js/db.js')).kvGet('trainerView', null) };
      Tour.running = false; __app.showScreen('analysis'); __app.showScreen('trainer'); await new Promise(r => setTimeout(r, 300));
      return { during, after: document.getElementById('screen-trainer').dataset.view };`);
    check(`[${tag}] while the guided tour runs the tab shows the setup form it explains; that is not remembered, and afterwards it is the Library again`,
      tour.during.view === 'mine' && tour.during.setup > 0 && tour.during.base > 0 && tour.during.kv === 'library' && tour.after === 'library', tour);
  }

  // ── offline, through the real service worker ──
  console.log('\n── offline ──');
  net.sw = true;
  await send('Page.navigate', { url: `http://localhost:${WEB}/` });
  await sleep(1500);
  let cached = null;
  for (let i = 0; i < 80; i++) {
    cached = await ev(`const names = (await caches.keys()).filter(k => k.startsWith('chess-training-center-')); if (names.length !== 1) return null;
      const keys = (await (await caches.open(names[0])).keys()).map(r => new URL(r.url).pathname.slice(1));
      return { name: names[0], n: keys.length, lib: ['js/opening-library.js', 'js/opening-lib.js', 'js/opening-lib-ui.js'].filter(f => keys.includes(f)).length,
        controlled: !!navigator.serviceWorker.controller || !!(await navigator.serviceWorker.getRegistration())?.active };`).catch(() => null);
    if (cached && cached.lib === 3 && cached.controlled && cached.n > 90) break;
    await sleep(500);
  }
  check(`[offline] one online visit: the worker's cache ${cached?.name} holds ${cached?.n} files, the three library files among them`, cached && cached.lib === 3, cached);
  await sleep(1500);
  net.down = true;
  server.closeAllConnections();
  net.hits = [];
  await send('Page.reload', {});
  await sleep(3500);
  const up = await ev(`return { controller: !!navigator.serviceWorker.controller, tabs: document.querySelectorAll('#tabbar button').length };`).catch(e => ({ err: e.message }));
  check(`[offline] the server taken away, the app still opens (the worker is in charge, ${net.hits.length} requests answered by the server)`, up.controller && up.tabs > 3 && net.hits.length === 0, up);
  await ev(`document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove());
    window.__app = await import('/js/app.js'); window.__lib = (await import('/js/opening-lib-ui.js')).OpeningLib; __app.showScreen('trainer');`);
  check(`[offline] the Library opens with no connection`, await until(`document.querySelectorAll('#lib-cards .lib-card').length === 16`, 8000));
  await until(`[...document.querySelectorAll('#lib-cards .lib-mini img')].every(i => i.complete && i.naturalWidth > 0)`, 6000);
  check(`[offline] ... its boards drawn`, await ev(`return [...document.querySelectorAll('#lib-cards .lib-mini img')].every(i => i.naturalWidth > 0);`));
  await shot('offline-1-cards');
  await tap('#lib-cards .lib-card:nth-child(2)');
  await tap('#lib-rows .list-item:nth-child(5)');
  const off = [];
  await tap('#lib-nav-first');
  for (let i = 0; i < 30; i++) {
    off.push(await ev(`const L = __lib.line; return { ply: L.ply, n: L.moves.length, ok: __lib.board.fen === L.fens[L.ply], name: document.getElementById('lib-name').textContent };`));
    if (off[off.length - 1].ply === off[off.length - 1].n) break;
    await tap('#lib-nav-next');
  }
  const end = off[off.length - 1];
  check(`[offline] a Ruy Lopez line plays through from the first move to the last (${end.n} moves, ending on "${end.name}")`, off.length === end.n + 1 && off.every((o, i) => o.ok && o.ply === i) && /^Ruy Lopez/.test(end.name), off.map(o => o.name));
  await shot('offline-2-preview');
} catch (e) { failed = true; console.error('\nSTOPPED: ' + e.message); }

const bad = checks.filter(c => !c.ok);
console.log(`\n${checks.length - bad.length} of ${checks.length} checks passed${bad.length ? ' — FAILED: ' + bad.map(c => c.name).join(' | ') : ''}`);
// App Check cannot answer on localhost (403), sw.js is refused on purpose until
// the offline round (404), and with the server gone Firebase cannot connect.
const other = errors.filter(e => !/firebaseappcheck|AppCheck|app-check|bad HTTP response code \(404\) was received when fetching the script|status of 403|ERR_CONNECTION|ERR_INTERNET|ERR_FAILED|Failed to fetch|offline|firestore|googleapis/i.test(e));
console.log(other.length ? `Console errors (${other.length}):\n  ` + [...new Set(other)].join('\n  ') : 'No console errors (other than App Check, the refused service worker and the missing connection).');
chrome.kill();
server.close();
server.closeAllConnections();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(failed || bad.length ? 1 : 0);
