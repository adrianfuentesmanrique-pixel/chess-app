// Home ("Inicio"): the screen exists, the app opens on it, it shows Kael's line
// and the "Hoy" card (conversation 1), its two boards: the puzzle of the day
// and "Descubre" (conversation 2), and the block between them, "Continuar" /
// "Empieza por aquí", with Home drawn again when the account or the day
// changes (conversation 3). Dev tool, not shipped. Headless Chrome over CDP,
// signed out, no service worker.
//
//   node tools/cdp-verify-home.mjs <outDir>     about ten minutes
//
// Conversation 3's part SEEDS what there is to continue (said again where it
// is done): a game through History.buildRecord + saveGame, a book through
// Read.importFile (a 6-page PDF this tool writes itself: makePdf), a homework
// by setting Students.homework by hand. A sign-out is Auth._notify() with
// nobody signed in; a new day is the page's Date moved one day on, then the
// app's own visibilitychange listener.
//
// The tool's own server can HOLD the puzzle files (the request arrives, the
// answer waits) and REFUSE them (404, as with no connection and no stored copy).
// "Descubre" is random: each kind is FORCED by setting Home.pick and calling
// Home.drawDiscover(), then its button or board is really tapped.
//
// At 375 x 667 in ES and EN, light and dark. REALLY TAPPED (CDP touch events):
// the level picker and the tour's own buttons and targets, the menu, the
// Resolver button, Profile's missions row, the swipes. Android Back is
// history.back(). CALLED, not tapped or waited for: DailyMissions.complete()
// (from the mission's own screen), DailyMissions.remindIfIncomplete() (the
// function the 45-second timer calls), KaelQuotes.show() (to make Kael speak),
// and Auth.user set by hand for the one picture with a greeting by name.
// NOT checked here: anything signed in, the service worker, a real phone.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/cdp-verify-home.mjs <outDir>'); process.exit(1); }
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const WEB = 9900 + Math.floor(Math.random() * 90);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-home-'));
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 1800000).unref();

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const requested = [];
const puzzles = { hold: false, refuse: false, waiting: [] };
const release = () => { puzzles.hold = false; for (const go of puzzles.waiting.splice(0)) go(); };
const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  requested.push(p);
  if (p === '/sw.js') { res.writeHead(404).end(); return; }
  if (p.startsWith('/puzzles/')) {
    if (puzzles.refuse) { res.writeHead(404).end(); return; }
    if (puzzles.hold) await new Promise(r => puzzles.waiting.push(r));
  }
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
const tapAt = async pt => { await touch('touchStart', pt); await sleep(40); await touch('touchEnd'); await sleep(220); };
const tap = async sel => tapAt(await ev(`const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`));
// A finger dragged sideways, slowly enough to be a drag and far enough to commit.
const swipe = async (x0, x1, y) => {
  await touch('touchStart', { x: x0, y });
  for (let i = 1; i <= 8; i++) { await sleep(25); await touch('touchMove', { x: x0 + (x1 - x0) * i / 8, y }); }
  await sleep(25); await touch('touchEnd'); await sleep(700);
};
const screen = () => ev(`return (await import('/js/app.js')).activeScreen;`);
const navIndex = async () => (await send('Page.getNavigationHistory')).currentIndex;
const booted = () => until(`document.getElementById('splash').classList.contains('hide')`, 20000);
const open = async (url = '/') => { await send('Page.navigate', { url: `http://localhost:${WEB}${url}` }); await booted(); await sleep(500); };
const hook = () => ev(`window.__app = await import('/js/app.js'); window.__db = await import('/js/db.js');`);
// What the saved keys say about this player, written the way the app reads them.
const save = kind => ev(`
  const db = await import('/js/db.js');
  const p = n => String(n).padStart(2, '0'), day = x => x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate());
  const now = new Date(), y = new Date(now); y.setDate(now.getDate() - 1);
  await db.kvSet('onboardingDone', true); await db.kvSet('tourDone', 'completed');
  await db.kvSet('dailyMissionsDate', day(now)); await db.kvSet('dailyMissionsDone', { puzzle: false, play: false, opening: false });
  await db.kvSet('dailyMissionStreak', 0); await db.kvSet('bestDailyMissionStreak', 0);
  if (${JSON.stringify(kind)} === 'new') { await db.kvSet('streakCount', 0); await db.kvSet('streakLastDate', null); await db.kvSet('bestStreak', 0); }
  else { await db.kvSet('streakCount', 12); await db.kvSet('streakLastDate', day(y)); await db.kvSet('bestStreak', 12); }`);
const home = () => ev(`
  const q = s => document.querySelector(s), corner = getComputedStyle(q('#kael-corner')), fab = q('#kael-fab').getBoundingClientRect();
  const btn = q('#home-puzzle-btn'), card = q('#home-today').getBoundingClientRect(), main = q('main');
  return { line: q('#home-kael-line').textContent, chip: q('#home-today-chip').textContent, btn: btn.textContent, btnDone: btn.classList.contains('done'),
    btnBg: getComputedStyle(btn).backgroundColor, rows: [...document.querySelectorAll('#daily-missions-list .daily-mission-row')].map(r => r.classList.contains('done')),
    title: q('#app-title-name').textContent, titleIco: !!q('#app-title-ico svg'), lit: [...document.querySelectorAll('#tabbar button.on')].map(b => b.dataset.screen),
    order: [...document.querySelectorAll('#tabbar button')].map(b => b.dataset.screen),
    cornerOpacity: +corner.opacity, fabLeft: Math.round(fab.left), w: innerWidth, sideScroll: document.documentElement.scrollWidth - innerWidth,
    cardBorder: getComputedStyle(q('#home-today')).borderTopColor, cardIn: card.left >= 0 && card.right <= innerWidth,
    board: !q('#home-puzzle-board').classList.contains('hidden') && q('#home-puzzle-board').getBoundingClientRect().width > 0, boardW: Math.round(q('#home-puzzle-board').getBoundingClientRect().width),
    pieces: q('#home-puzzle-board').querySelectorAll('img').length, side: q('#home-puzzle-side').textContent, hasBoard: q('#home-today .home-puzzle').classList.contains('has-board'),
    pageScroll: main.scrollHeight - main.clientHeight, bubble: q('#kael-bubble').classList.contains('show'), saying: q('#home-kael-line').classList.contains('saying'), hidden: q('#screen-home').classList.contains('hidden') };`);
const corner = () => ev(`const c = getComputedStyle(document.getElementById('kael-corner')), f = document.getElementById('kael-fab').getBoundingClientRect();
  return { opacity: +(+c.opacity).toFixed(2), left: Math.round(f.left), right: Math.round(f.right), w: innerWidth, tappable: getComputedStyle(document.getElementById('kael-fab')).pointerEvents };`);
// The "Descubre" card as it is on the page.
const discover = () => ev(`
  const q = s => document.querySelector(s), card = q('#home-discover').getBoundingClientRect(), b = q('#home-discover-board').getBoundingClientRect(), btn = q('#home-discover-btn').getBoundingClientRect();
  return { head: q('#home-discover h3').textContent, kind: q('#home-discover-kind').textContent, name: q('#home-discover-name').textContent, sub: q('#home-discover-sub').textContent,
    btn: q('#home-discover-btn').textContent, pieces: q('#home-discover-board').querySelectorAll('img').length, boardW: Math.round(b.width), boardH: Math.round(b.height),
    cardIn: card.left >= 0 && card.right <= innerWidth && btn.right <= card.right && btn.width > 60, sideScroll: document.documentElement.scrollWidth - innerWidth,
    below: card.top >= q('#home-today').getBoundingClientRect().bottom, pick: JSON.stringify(__app.Home.pick) };`);
// The block between "Hoy" and "Descubre" ("Continuar" / "Empieza por aquí") as
// it is on the page. discoverTop/Bottom: where "Descubre" sits with the page
// at its top, in screen pixels (the screen is 667 high).
const nextBlock = () => ev(`
  const q = s => document.querySelector(s), box = q('#home-next'), b = box.getBoundingClientRect(), d = q('#home-discover').getBoundingClientRect(), today = q('#home-today').getBoundingClientRect();
  const rows = [...box.querySelectorAll('.home-row')], up = q('main').scrollTop;
  return { shown: !box.classList.contains('hidden'), kind: box.dataset.kind || '', head: q('#home-next-head').textContent,
    types: rows.map(r => r.dataset.type).join(), titles: rows.map(r => r.querySelector('b').textContent), subs: rows.map(r => r.querySelector('.sub').textContent),
    pills: rows.map(r => r.querySelector('.hw-new')?.textContent || ''), icons: rows.every(r => r.querySelector('.home-row-ico svg')),
    between: box.classList.contains('hidden') || (b.top >= today.bottom && b.bottom <= d.top),
    rowsIn: rows.every(r => { const x = r.getBoundingClientRect(); return x.left >= 0 && x.right <= innerWidth && x.height >= 44; }),
    gap: Math.round(d.top - today.bottom), discoverTop: Math.round(d.top + up), discoverBottom: Math.round(d.bottom + up), h: innerHeight,
    sideScroll: document.documentElement.scrollWidth - innerWidth };`);
const tapRow = async type => {
  await ev(`document.querySelector('#home-next .home-row[data-type="${type}"]').scrollIntoView({ block: 'center' });`);
  await sleep(150);
  await tap(`#home-next .home-row[data-type="${type}"]`);
};
// A plain PDF of n pages ("Page 1" ... "Page n"), as base64: the book for the
// "Continuar" row. Six pages, because a two-page book cannot be scrolled far
// enough on this screen for its second page to be the page being read.
const makePdf = n => {
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${Array.from({ length: n }, (_, i) => `${4 + 2 * i} 0 R`).join(' ')}] /Count ${n} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  for (let i = 0; i < n; i++) {
    const text = `BT /F1 48 Tf 60 400 Td (Page ${i + 1}) Tj ET`;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 595] /Contents ${5 + 2 * i} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
      `<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
  }
  let out = '%PDF-1.4\n';
  const at = objs.map((o, i) => { const pos = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return pos; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + at.map(p => String(p).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1').toString('base64');
};
// Leave Home and come back, the way a tab change does.
const awayAndBack = async () => { await ev(`__app.showScreen('analysis'); __app.showScreen('home'); document.querySelector('main').scrollTop = 0;`); await sleep(500); };
const force = (kind, index) => ev(`__app.Home.pick = { kind: '${kind}', index: ${index} }; __app.Home.drawDiscover(); document.querySelector('main').scrollTop = 99999;`);
// The puzzle now on the Puzzles screen, once its opening move has been played.
const onPuzzles = async () => {
  await until(`__app.activeScreen === 'puzzles' && __app.Puzzles.isDailyPuzzle && __app.Puzzles.moveIdx === 1`, 20000);
  return ev(`const P = __app.Puzzles; return P.current ? { id: P.current.id, placement: P.chess.fen().split(' ')[0], side: P.chess.turn(), faces: P.board.orientation, moveIdx: P.moveIdx } : null;`);
};
const TEXT = {
  es: { title: 'Inicio', welcome: 'Bienvenido.', solve: 'Resolver', solved: 'Resuelto ✓', pending: 'Tu racha de 12 días te espera', alldone: 'Las tres misiones', greet: /^Buen[oa]s (días|tardes|noches), Adrián\./,
    toMove: { w: 'Juegan blancas', b: 'Juegan negras' }, discover: 'Descubre', endgame: 'Final', opening: 'Apertura', egQ: '¿Conoces este final?', opQ: '¿La juegas contra el motor?', learn: 'Aprenderlo', play: 'Jugarla',
    cont: 'Continuar', start: 'Empieza por aquí', lesson: 'Tu primera lección', lessonSub: 'Aprender · Reglas', playK: 'Juega contra Kael', playSub: 'Nivel 1 · Principiante', tour: 'Tour guiado', rules: 'Reglas',
    pill: 'nuevo', hwTitle: '10 problemas de clavada', hwSub: 'Deberes · De Marta · 2 abiertos', bookSub: 'Leer · Pág. 4 de 6', gameTitle: 'Tú – Bot Club · 1-0', gameSub: /^Jaque mate · 4 jugadas · Hoy \d\d:\d\d$/ },
  en: { title: 'Home', welcome: 'Welcome.', solve: 'Solve', solved: 'Solved ✓', pending: 'Your 12-day streak is waiting', alldone: 'All three', greet: /^Good (morning|afternoon|evening), Adrián\./,
    toMove: { w: 'White to move', b: 'Black to move' }, discover: 'Discover', endgame: 'Endgame', opening: 'Opening', egQ: 'Do you know this endgame?', opQ: 'Play it against the engine?', learn: 'Learn it', play: 'Play it',
    cont: 'Continue', start: 'Start here', lesson: 'Your first lesson', lessonSub: 'Learn · Rules', playK: 'Play against Kael', playSub: 'Level 1 · Beginner', tour: 'Guided tour', rules: 'Rules',
    pill: 'new', hwTitle: '10 pin puzzles', hwSub: 'Homework · From Marta · 2 open', bookSub: 'Read · Page 4 of 6', gameTitle: 'You – Club bot · 1-0', gameSub: /^Checkmate · 4 moves · Today \d\d:\d\d$/ },
};

let failed = false;
try {
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });

  // ── a brand-new profile: the level picker, then the tour, end to end ──
  console.log('\n── a fresh profile, and the tour ──');
  await send('Page.navigate', { url: `http://localhost:${WEB}/` });
  await sleep(800);
  await ev(`localStorage.setItem('lang', 'es');`);
  await open('/');
  check('fresh profile: the app opens on Home, under the level picker', await screen() === 'home' && await until(`document.querySelector('.modal-back .kael-portrait')`, 6000), await screen());
  check('fresh profile: opening added no history entry (state is empty)', await ev(`return history.state === null;`));
  await tap('.modal-back .btn.primary.big');
  await tap('.modal-back .kael-level-cell');
  await tap('.modal-back .btn.primary.big');
  check('the tour is offered after the level picker', await until(`document.querySelector('.modal-back .btn.primary.big') && document.querySelector('.modal-back .btn.quiet')`, 5000));
  await tap('.modal-back .btn.primary.big');
  check('the tour starts', await until(`document.getElementById('tour-root')`, 5000));
  await ev(`const m = await import('/js/tour.js'); window.__tour = m.default; window.__steps = m.STEPS;`);
  const total = await ev(`return __steps.length;`);
  const missing = [], seen = [];
  for (let guard = 0; guard < 80 && await ev(`return __tour.running;`); guard++) {
    const st = await ev(`const s = __steps[__tour.idx]; return { idx: __tour.idx, key: s.key, screen: s.screen, target: s.target || null, tap: s.action === 'tap' };`);
    seen.push(st.key);
    if (st.target) {
      const ringed = await until(`!document.querySelector('.tour-ring').hidden && document.querySelector('.tour-ring').getBoundingClientRect().width > 4`, 5000);
      if (!ringed) missing.push(st.key);
    }
    await sleep(350);
    if (st.idx === 0) { check('tour step 1 is on Home', await screen() === 'home'); await shot('tour-1-welcome'); }
    if (st.key === 'homeToday') {
      const withBoard = await until(`!document.getElementById('home-puzzle-board').classList.contains('hidden')`, 15000);
      await sleep(500);
      const ring = await ev(`const a = document.querySelector('.tour-ring').getBoundingClientRect(), b = document.getElementById('home-today').getBoundingClientRect(), c = document.querySelector('.tour-card').getBoundingClientRect();
        return { dx: Math.abs(a.left - b.left), dy: Math.abs(a.top - b.top), dw: Math.abs(a.width - b.width), dh: Math.abs(a.height - b.height), cardH: Math.round(b.height),
          cardBottom: Math.round(b.bottom), tourTop: Math.round(c.top), tourBottom: Math.round(c.bottom), h: innerHeight };`);
      check('tour step 2 rings the whole "Hoy" card on Home, with the puzzle board in it', withBoard && await screen() === 'home' && ring.dx < 14 && ring.dy < 14 && ring.dw < 26 && ring.dh < 26, ring);
      check('tour step 2: the tour\'s own card is below the "Hoy" card, not over it, and on the screen', ring.tourTop >= ring.cardBottom && ring.tourBottom <= ring.h, ring);
      await shot('tour-2-hoy');
    }
    if (st.idx === total - 1) await shot('tour-last');
    if (st.tap) {
      const pt = await ev(`const r = document.querySelector('.tour-ring').getBoundingClientRect(); return { x: r.left + r.width / 2, y: Math.min(innerHeight - 6, r.top + Math.min(r.height / 2, 28)) };`);
      await tapAt(pt);
    } else await tap('.tour-next');
    await until(`!__tour.running || __tour.idx !== ${st.idx}`, 7000);
  }
  check(`the tour ran all ${total} steps, each one once, in order`, seen.length === total && new Set(seen).size === total, seen.length);
  check('no tour step was missing its target', missing.length === 0, missing);
  check('the tour has no profMiss step and has homeToday', !seen.includes('profMiss') && seen[1] === 'homeToday');
  await sleep(400);
  check('the tour ends on Home, saved as completed', await screen() === 'home' && await ev(`return await (await import('/js/db.js')).kvGet('tourDone', null);`) === 'completed');

  for (const [lang, scheme] of [['es', 'light'], ['es', 'dark'], ['en', 'light'], ['en', 'dark']]) {
    const tag = `${lang}-${scheme}`, T = TEXT[lang];
    console.log(`\n── ${tag} ──`);
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await ev(`localStorage.setItem('lang', '${lang}');`);
    await save('new');
    requested.length = 0;
    puzzles.hold = true;   // the puzzle file is asked for, and its answer waits
    const before = await navIndex();
    await send('Page.reload', {}); await sleep(300); await booted(); await sleep(700); await hook();

    // ── opens on Home; the new player's page ──
    let h = await home();
    await sleep(600);
    const held = await home(), heldD = await discover();
    check(`[${tag}] with the puzzle file not yet answered, Home is already drawn whole: Kael, 0 / 3, "${T.solve}", the two rows, "${T.discover}"; no board and no empty box`,
      puzzles.waiting.length === 1 && held.line.startsWith(T.welcome) && held.chip === '0 / 3' && held.btn === T.solve && held.rows.length === 2 && !held.board && !held.hasBoard && held.boardW === 0 && held.side === ''
      && heldD.head === T.discover && heldD.pieces >= 2 && heldD.name.length > 2, { waiting: puzzles.waiting.length, board: held.board, discover: heldD.name });
    check(`[${tag}] the puzzle file was asked for (only the day's own band, once) and the opening library was not`,
      requested.filter(p => /puzzles\//.test(p)).join() === '/puzzles/puzzles-0.json' && !requested.some(p => /opening-library/.test(p)), requested.filter(p => /puzzles\/|opening-library/.test(p)));
    await shot(`home-${tag}-before-board`);
    release();
    const filled = await until(`!document.getElementById('home-puzzle-board').classList.contains('hidden')`, 15000);
    await sleep(300);
    const hb = await home(), shown = await ev(`return __app.Home.puzzle;`);
    check(`[${tag}] when the file comes the board fills in: 118px, pieces on it, "${T.toMove.w}" or "${T.toMove.b}" under the title`,
      filled && hb.board && hb.hasBoard && hb.boardW === 118 && hb.pieces >= 3 && shown && hb.side === T.toMove[shown.side] && hb.sideScroll === 0 && hb.cardIn, { side: hb.side, pieces: hb.pieces, boardW: hb.boardW, id: shown && shown.id });
    check(`[${tag}] after a reload the app is on Home, no history entry of its own`, await screen() === 'home' && !h.hidden && await navIndex() === before, { index: await navIndex() - before });
    check(`[${tag}] top bar: "${T.title}" with the house icon; the menu lights Home, first of nine`, h.title === T.title && h.titleIco && h.lit.join() === 'home' && h.order[0] === 'home' && h.order[1] === 'analysis' && h.order.length === 9, { title: h.title, lit: h.lit, order: h.order });
    check(`[${tag}] new player: Kael welcomes, 0 / 3, a gold "${T.solve}", two mission rows, nothing sideways`, h.line.startsWith(T.welcome) && h.chip === '0 / 3' && h.btn === T.solve && !h.btnDone && h.rows.join() === 'false,false' && h.sideScroll === 0 && h.cardIn, h);
    await sleep(1800);   // past the moment Kael's quote on opening used to appear
    h = await home();
    check(`[${tag}] Home: Kael's corner is not visible, cannot be tapped, and no quote is said on opening`, h.cornerOpacity === 0 && h.fabLeft >= h.w && !h.bubble && !h.saying && h.line.startsWith(T.welcome) && (await corner()).tappable === 'none', { opacity: h.cornerOpacity, fabLeft: h.fabLeft, bubble: h.bubble, line: h.line });
    await shot(`home-${tag}-new`);

    // ── "Empieza por aquí": never practised, nothing half-way ──
    let nb = await nextBlock();
    check(`[${tag}] new player: "${T.start}" between "Hoy" and "${T.discover}", three rows: "${T.lesson}", "${T.playK}", "${T.tour}"`,
      nb.shown && nb.kind === 'start' && nb.head === T.start && nb.types === 'lesson,play,tour' && nb.titles.join('|') === [T.lesson, T.playK, T.tour].join('|')
      && nb.subs[0] === T.lessonSub && nb.subs[1] === T.playSub && nb.subs[2].length > 8 && nb.icons && nb.between && nb.rowsIn && nb.sideScroll === 0, nb);
    let reqN = requested.length;
    await ev(`__app.Home.nextHtml = null; await __app.Home.drawNext();`);
    check(`[${tag}] drawing "${T.start}" again from nothing asks the network for nothing`, requested.length === reqN, requested.slice(reqN));
    await tapRow('lesson'); await sleep(500);
    const les = await ev(`return { screen: __app.activeScreen, list: !document.getElementById('learn-lesson-list-view').classList.contains('hidden'), title: document.getElementById('learn-cat-title').textContent, n: document.getElementById('learn-lesson-list').children.length };`);
    check(`[${tag}] "${T.lesson}", tapped, opens Learn on the first lesson list: "${T.rules}", ${les.n} lessons`, les.screen === 'endgame' && les.list && les.title === T.rules && les.n > 3, les);
    await shot(`learn-${tag}-first-lesson`);
    await ev(`history.back();`); await sleep(600);
    const lvWas = await ev(`return document.querySelector('#play-level button.on')?.dataset.v;`);
    await tapRow('play'); await sleep(500);
    const pl = await ev(`return { screen: __app.activeScreen, level: document.querySelector('#play-level button.on')?.dataset.v, ons: document.querySelectorAll('#play-level button.on').length,
      setup: !document.getElementById('play-setup').classList.contains('hidden'), game: !document.getElementById('play-game').classList.contains('hidden') };`);
    check(`[${tag}] "${T.playK}", tapped, opens Play with the lowest level chosen (it was ${lvWas}) and no game started`, pl.screen === 'play' && pl.level === '0' && pl.ons === 1 && pl.setup && !pl.game, pl);
    await shot(`play-${tag}-lowest-level`);
    await ev(`history.back();`); await sleep(600);
    check(`[${tag}] Back from Play returns to Home, the block as it was`, await screen() === 'home' && (await nextBlock()).types === 'lesson,play,tour');
    await tapRow('tour');
    const touring = await until(`document.getElementById('tour-root')`, 5000);
    await sleep(400);
    await shot(`tour-${tag}-from-home`);
    const tr = await ev(`const m = (await import('/js/tour.js')).default; const r = { running: m.running, idx: m.idx, screen: __app.activeScreen }; m.stop('skipped'); return r;`);
    check(`[${tag}] "${T.tour}", tapped, starts the tour at its first step, on Home`, touring && tr.running && tr.idx === 0 && tr.screen === 'home', tr);
    await sleep(3500);   // the tour's own "skipped" toast goes
    await ev(`await __db.kvSet('tourDone', 'completed'); document.querySelector('main').scrollTop = 0;`);

    // ── "Descubre" ──
    const first = await discover(), firstPick = JSON.parse(first.pick);
    check(`[${tag}] "${T.discover}" is under the "Hoy" card with one thing picked: ${first.kind} — ${first.name}`,
      first.below && first.head === T.discover && ['endgame', 'opening'].includes(firstPick.kind) && first.kind === T[firstPick.kind] && first.boardW === 118 && first.boardH === 118 && first.cardIn, first);
    await ev(`__app.showScreen('analysis');`); await sleep(400);
    await ev(`__app.showScreen('home');`); await sleep(500);
    const again = await discover();
    check(`[${tag}] leaving Home and coming back does not change the card`, again.pick === first.pick && again.name === first.name && again.sub === first.sub, { was: first.pick, now: again.pick });

    // An endgame, forced: a different one in each pass.
    const egIndex = { 'es-light': 0, 'es-dark': 41, 'en-light': 120, 'en-dark': 264 }[tag];
    const eg = await ev(`const { ENDGAMES } = await import('/js/endgames-data.js'); const e = ENDGAMES[${egIndex}]; return { n: ENDGAMES.length, id: e.id, name: e.name['${lang}'], sub: e.subtitle ? e.subtitle['${lang}'] : '', placement: e.fen.split(' ')[0], category: e.category };`);
    await force('endgame', egIndex); await sleep(300);
    let d = await discover();
    const menOn = eg.placement.replace(/[^a-zA-Z]/g, '').length;
    check(`[${tag}] an endgame: "${T.endgame}" in the corner, its name "${eg.name}", "${T.egQ}" and its subtitle, the button "${T.learn}", its ${menOn} men on the board`,
      d.kind === T.endgame && d.name === eg.name && d.sub === (T.egQ + (eg.sub ? ' ' + eg.sub : '')) && d.btn === T.learn && d.pieces === menOn && d.cardIn && d.sideScroll === 0, d);
    await shot(`home-${tag}-discover-endgame`);
    await tap(lang === 'es' ? '#home-discover-btn' : '#home-discover-board'); await sleep(700);
    const study = await ev(`const E = __app.Endgame; return { screen: __app.activeScreen, id: E.current && E.current.id, viewer: !document.getElementById('endgame-viewer-view').classList.contains('hidden'),
      title: document.querySelector('#endgame-pos-title .ttl')?.textContent, placement: E.board.fen.split(' ')[0] };`);
    check(`[${tag}] "${T.learn}" (${lang === 'es' ? 'the button' : 'the board'}), tapped, opens Learn with that exact study open: ${eg.id}`,
      study.screen === 'endgame' && study.id === eg.id && study.viewer && study.title === eg.name && study.placement === eg.placement, study);
    await shot(`learn-${tag}-from-discover`);
    await tap('#endgame-back-pos'); await sleep(400);
    check(`[${tag}] the study's own Back leads to the list it belongs to`, await ev(`return !document.getElementById('endgame-positions-view').classList.contains('hidden') && __app.Endgame.category === '${eg.category}' && document.getElementById('endgame-pos-list').children.length > 0;`));
    await ev(`history.back();`); await sleep(600);
    check(`[${tag}] Back from Learn returns to Home, the card unchanged`, await screen() === 'home' && (await discover()).name === eg.name);

    // An opening, forced: a short one and the longest on the list.
    const opIndex = { 'es-light': 0, 'es-dark': 13, 'en-light': 27, 'en-dark': 31 }[tag];
    const op = await ev(`const { HOME_OPENINGS } = await import('/js/home.js'); const { numbered } = await import('/js/opening-lib.js'); const o = HOME_OPENINGS[${opIndex}]; return { n: HOME_OPENINGS.length, name: o[0], moves: o[1], numbered: numbered(o[1]) };`);
    await force('opening', opIndex); await sleep(300);
    d = await discover();
    check(`[${tag}] an opening: "${T.opening}" in the corner, "${op.name}", "${T.opQ}" and its moves, the button "${T.play}"`,
      d.kind === T.opening && d.name === op.name && d.sub === T.opQ + ' ' + op.numbered && d.btn === T.play && d.pieces >= 30 && d.cardIn && d.sideScroll === 0, d);
    check(`[${tag}] drawing the opening's board asked for no opening library`, !requested.some(p => /opening-library/.test(p)));
    await shot(`home-${tag}-discover-opening`);
    await tap(lang === 'es' ? '#home-discover-board' : '#home-discover-btn');
    const asked = await until(`document.querySelector('.lib-study-sheet #lib-study-start')`, 15000);
    await sleep(400);
    const sheet = await ev(`const { OpeningLib } = await import('/js/opening-lib-ui.js'); const L = OpeningLib.line, box = document.querySelector('.lib-study-sheet');
      return { screen: __app.activeScreen, view: document.getElementById('screen-trainer').dataset.view, line: L && L.moves.join(' '), name: box && box.querySelector('p.hint').textContent,
        starts: document.querySelectorAll('#lib-study-start').length, sheets: document.querySelectorAll('.lib-study-sheet').length, preview: !document.getElementById('lib-preview').classList.contains('hidden'),
        playing: !!OpeningLib.game };`);
    check(`[${tag}] "${T.play}" (${lang === 'es' ? 'the board' : 'the button'}), tapped, opens Openings with the library's own Study question for that exact line`,
      asked && sheet.screen === 'trainer' && sheet.view === 'library' && sheet.line === op.moves && sheet.name === op.name && sheet.preview, sheet);
    check(`[${tag}] ...one question with one Start, and no game has begun without it; the library was loaded for this, once`,
      sheet.starts === 1 && sheet.sheets === 1 && !sheet.playing && requested.filter(p => /opening-library/.test(p)).length === 1, { starts: sheet.starts, lib: requested.filter(p => /opening-library/.test(p)).length });
    await shot(`openings-${tag}-study-question`);
    await tap('#lib-study-cancel'); await sleep(400);
    check(`[${tag}] Cancel leaves that line on the Library's preview board`, await ev(`return !document.querySelector('.lib-study-sheet') && !document.getElementById('lib-preview').classList.contains('hidden') && __app.activeScreen === 'trainer';`));
    await ev(`__app.showScreen('home');`); await sleep(500);
    check(`[${tag}] back on Home the card is still that opening`, (await discover()).name === op.name);
    await ev(`document.querySelector('main').scrollTop = 0;`);

    // ── a regular player: a streak waiting, one mission done on its own screen ──
    await save('active');
    await ev(`await __app.Streak.init(); await __app.DailyMissions.init(); __app.showScreen('play'); await __app.DailyMissions.complete('play');`);
    await sleep(700);
    const onPlay = await corner();
    await ev(`__app.KaelQuotes.hide(); history.back();`); await sleep(700);
    h = await home();
    check(`[${tag}] a mission finished on Play shows done on Home: 1 / 3, its row ticked, Back returned to Home`, await screen() === 'home' && h.chip === '1 / 3' && h.rows.join() === 'true,false', { chip: h.chip, rows: h.rows });
    check(`[${tag}] Kael's line is about the streak only: "${T.pending}…"`, h.line.startsWith(T.pending) && !/3/.test(h.line.replace('12', '')), h.line);
    check(`[${tag}] on Play, Kael's "mission done" came in as before (corner fully in)`, onPlay.opacity === 1 && onPlay.right <= onPlay.w, onPlay);
    await shot(`home-${tag}-active`);

    // The one picture with a greeting by name: a signed-in user, set by hand.
    await ev(`const { Auth } = await import('/js/firebase.js'); await __db.kvSet('profileName', 'Adrián'); const was = Auth.user; Auth.user = { displayName: 'Adrián Fuentes' }; await __app.Home.render(); Auth.user = was;`);
    h = await home();
    check(`[${tag}] with a name Kael greets by name and time of day`, T.greet.test(h.line), h.line);
    await shot(`home-${tag}-greeting`);
    await ev(`await __db.kvSet('profileName', ''); await __app.Home.render();`);

    // ── Profile's one row ──
    await tap('#btn-profile'); await sleep(500);
    const prof = await ev(`const r = document.getElementById('profile-missions-row'), b = r.getBoundingClientRect();
      return { screen: __app.activeScreen, text: r.textContent.replace(/\\s+/g, ' ').trim(), count: document.getElementById('profile-missions-count').textContent,
        oldList: !!document.querySelector('#screen-profile .daily-missions-list'), inView: b.top >= 0 && b.bottom <= innerHeight, wide: Math.round(b.width) };`);
    check(`[${tag}] Profile: one row "${prof.text}", no mission list there any more`, prof.screen === 'profile' && prof.count === '1 / 3' && !prof.oldList && prof.inView, prof);
    await shot(`profile-${tag}`);
    await tap('#profile-missions-row'); await sleep(500);
    check(`[${tag}] Profile's row, tapped, opens Home`, await screen() === 'home');

    // ── the puzzle of the day ──
    await until(`!document.getElementById('home-puzzle-board').classList.contains('hidden')`, 15000);
    const onHome = await ev(`return __app.Home.puzzle;`);
    await tap('#home-puzzle-board');
    let there = await onPuzzles();
    check(`[${tag}] the board, tapped, opens the puzzle of the day; it is the puzzle Home showed: same id (${onHome && onHome.id}), same position, same side to move, seen from that side`,
      onHome && there && there.id === onHome.id && there.placement === onHome.placement && there.side === onHome.side && there.faces === onHome.side, { home: onHome, puzzles: there });
    await shot(`puzzles-${tag}-from-home-board`);
    await ev(`history.back();`); await sleep(700);
    check(`[${tag}] Back returns to Home with the same board`, await screen() === 'home' && (await ev(`return __app.Home.puzzle.id;`)) === onHome.id && (await home()).board);
    await ev(`__app.Puzzles.isDailyPuzzle = false;`);
    await tap('#home-puzzle-btn');
    there = await onPuzzles();
    const daily = !!there && there.id === onHome.id && there.placement === onHome.placement;
    check(`[${tag}] "${T.solve}", tapped, opens the same puzzle of the day on Puzzles`, daily, await screen());
    const idle = { puzzles: await corner() };
    await ev(`await __app.DailyMissions.complete('puzzle'); __app.KaelQuotes.hide(); history.back();`); await sleep(700);
    h = await home();
    check(`[${tag}] the puzzle mission done: "${T.solved}", quiet (not gold), 2 / 3, and the board stays on the card`, h.btn === T.solved && h.btnDone && h.chip === '2 / 3' && h.board && h.side === T.toMove[onHome.side] && await screen() === 'home', { btn: h.btn, bg: h.btnBg, chip: h.chip, board: h.board });
    await shot(`home-${tag}-solved`);
    await ev(`__app.showScreen('trainer'); await __app.DailyMissions.complete('opening'); __app.KaelQuotes.hide(); history.back();`); await sleep(700);
    h = await home();
    check(`[${tag}] all three done: 3 / 3 and Kael says well done, with no word about the streak`, h.chip === '3 / 3' && h.rows.join() === 'true,true' && h.line.startsWith(T.alldone) && !/12/.test(h.line), h.line);
    await shot(`home-${tag}-alldone`);

    // ── Kael's corner ──
    await ev(`__app.showScreen('analysis');`); await sleep(600);
    idle.analysis = await corner();
    await ev(`__app.showScreen('puzzles');`); await sleep(600);
    idle.puzzles = await corner();
    check(`[${tag}] Kael's idle sliver is there as before on Analysis and Puzzles`, [idle.analysis, idle.puzzles].every(c => c.opacity === 0.55 && c.left < c.w && c.right > c.w && c.tappable === 'auto'), idle);
    await shot(`puzzles-${tag}-kael-idle`);
    await ev(`__app.showScreen('home');`); await sleep(600);
    check(`[${tag}] back on Home the sliver is gone again`, (await corner()).opacity === 0);
    // A bubble still open in the corner is closed on the way into Home.
    await ev(`__app.showScreen('analysis'); __app.KaelQuotes.show({ text: 'x' }, 8000); __app.showScreen('home');`); await sleep(600);
    check(`[${tag}] a corner bubble open on Analysis is closed on entering Home`, !(await home()).bubble && (await corner()).opacity === 0);
    const said = lang === 'es' ? '¡Partida jugada! Ya tienes esa misión lista.' : 'Game played! That mission is done.';
    const usual = (await home()).line;
    await ev(`__app.KaelQuotes.show({ title: '🎯', text: ${JSON.stringify(said)} }, 2600);`);
    await sleep(700);
    h = await home();
    const spoke = await corner();
    check(`[${tag}] on Home, what Kael says is said in his bubble at the top; the corner stays away`, h.saying && h.line.includes(said) && !h.bubble && spoke.opacity === 0 && spoke.left >= spoke.w && h.sideScroll === 0, { line: h.line, corner: spoke });
    await shot(`home-${tag}-kael-speaking`);
    await sleep(2600);
    h = await home();
    check(`[${tag}] ...and his usual line comes back when he has finished`, !h.saying && h.line === usual, h.line);
    // The rare message that goes somewhere: a gold edge, and a tap runs it.
    await ev(`window.__went = 0; __app.KaelQuotes.show({ text: ${JSON.stringify(said)}, cta: '›', onTap: () => { window.__went++; } }, 8000);`);
    await sleep(300);
    const gold = await ev(`return document.getElementById('home-kael-line').classList.contains('actionable');`);
    await tap('#home-kael-line');
    h = await home();
    check(`[${tag}] a message that goes somewhere: gold edge, a tap runs it once and the usual line returns`, gold && await ev(`return window.__went;`) === 1 && !h.saying && h.line === usual, { gold, line: h.line });
    await tap('#home-kael-line');
    check(`[${tag}] his usual line is not tappable`, await ev(`return window.__went;`) === 1);
    await ev(`__app.KaelQuotes.show({ text: ${JSON.stringify(said)} }, 8000); __app.showScreen('analysis');`); await sleep(500);
    check(`[${tag}] leaving Home ends what he was saying there, and nothing follows him to the corner`, await ev(`return !__app.Home.saying && !document.getElementById('kael-bubble').classList.contains('show');`));
    await ev(`__app.showScreen('home');`); await sleep(400);
    check(`[${tag}] ...and back on Home his usual line is there`, (await home()).line === usual);

    // ── the reminder the 45-second timer calls ──
    await ev(`__app.DailyMissions.done = { puzzle: false, play: false, opening: false }; __app.DailyMissions.reminded = false; __app.DailyMissions.render();`);
    await ev(`__app.DailyMissions.remindIfIncomplete();`); await sleep(400);
    check(`[${tag}] the missions reminder does not appear on Home`, !(await home()).bubble && !(await home()).saying &&await ev(`return __app.DailyMissions.reminded === false;`));
    await ev(`__app.showScreen('analysis'); __app.DailyMissions.remindIfIncomplete();`); await sleep(500);
    check(`[${tag}] ...and still appears on Analysis`, await ev(`const b = document.getElementById('kael-bubble'); return b.classList.contains('show') && b.classList.contains('actionable');`));
    await ev(`__app.KaelQuotes.hide();`);
    await shot(`analysis-${tag}`);

    // ── "Continuar" ──
    // SEEDED, and how: the game by History.buildRecord + saveGame (what Play
    // calls when a game ends; the moves are not played on the board here); the
    // book by Read.importFile (the app's own import, minus the file picker) and
    // then its page set to 4 in the database by hand; the homework by setting
    // Students.homework by hand and calling Students.paintDot(), because the
    // tool is signed out and there is no real teacher.
    await ev(`__app.showScreen('home'); document.querySelector('main').scrollTop = 0;`); await sleep(500);
    nb = await nextBlock();
    check(`[${tag}] practised (best streak 12), nothing half-way: no middle block and no heading; "${T.discover}" sits right under "Hoy"`,
      !nb.shown && nb.kind === 'none' && nb.types === '' && nb.gap >= 0 && nb.gap <= 16, { shown: nb.shown, kind: nb.kind, gap: nb.gap });
    await shot(`home-${tag}-no-middle`);
    const pickWas = (await discover()).pick;
    const gid = await ev(`const H = await import('/js/history.js'), { Chess } = await import('/vendor/chess.js'), { START_FEN } = await import('/js/tree.js'); const c = new Chess();
      for (const s of ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#']) c.move(s);
      await H.saveGame(H.buildRecord({ chess: c, startFen: START_FEN, playerColor: 'w', level: 3, levelElo: 1500, playedAt: Date.now() - 300000, pgn: c.pgn() }));
      return (await __db.pageHistory({ count: 1 })).items[0].id;`);
    // The app comes back to the front: its own listener redraws Home.
    await ev(`document.dispatchEvent(new Event('visibilitychange'));`);
    await until(`document.querySelector('#home-next .home-row[data-type="game"]')`, 5000); await sleep(200);
    nb = await nextBlock();
    check(`[${tag}] with only a game (and the app brought back to the front): "${T.cont}" and that one row, "${T.gameTitle}"`,
      nb.shown && nb.kind === 'continue' && nb.head === T.cont && nb.types === 'game' && nb.titles[0] === T.gameTitle && T.gameSub.test(nb.subs[0]) && nb.between && nb.rowsIn, nb);
    await shot(`home-${tag}-continue-game`);
    const bid = await ev(`const R = await import('/js/read.js'); const bytes = Uint8Array.from(atob(${JSON.stringify(makePdf(6))}), c => c.charCodeAt(0));
      await R.importFile(new File([bytes], 'Mi sistema.pdf', { type: 'application/pdf' }));
      const b = (await __db.listBookSummaries())[0]; if (b) await __db.updateBookMeta(b.id, { page: 4 }); return b ? b.id : null;`);
    await sleep(300);
    await ev(`const S = (await import('/js/students.js')).Students, now = Date.now();
      S.people.t1 = { profileName: 'Marta' };
      S.homework = [
        { id: 'hwOld', status: 'open', kind: 'text', title: 'Repasar', teacherUid: 't1', createdAt: now - 9e6, done: 0 },
        { id: 'hwNew', status: 'open', kind: 'puzzles', title: ${JSON.stringify(T.hwTitle)}, teacherUid: 't1', createdAt: { seconds: Math.round((now - 1e6) / 1000), nanoseconds: 0 }, params: { count: 10, themes: ['pin'], minRating: 1200, maxRating: 1500 }, done: 0 },
        { id: 'hwDone', status: 'done', kind: 'text', title: 'x', teacherUid: 't1', createdAt: now, completedAt: now },
      ];
      S.hwSeen = ['hwOld']; S.paintDot();`);
    await until(`document.querySelector('#home-next .home-row[data-type="homework"]')`, 5000); await sleep(200);
    await ev(`document.querySelector('main').scrollTop = 0;`);
    nb = await nextBlock();
    check(`[${tag}] a homework arrives with Home open (no reload): three rows in order, homework, book, game`, nb.kind === 'continue' && nb.head === T.cont && nb.types === 'homework,book,game' && nb.between && nb.rowsIn && nb.icons && nb.sideScroll === 0, nb);
    check(`[${tag}] the homework row: the newest one not seen yet, "${T.hwTitle}", "${T.hwSub}", a gold "${T.pill}" pill`, nb.titles[0] === T.hwTitle && nb.subs[0] === T.hwSub && nb.pills[0] === T.pill, { title: nb.titles[0], sub: nb.subs[0], pill: nb.pills[0] });
    check(`[${tag}] the book row: "Mi sistema", "${T.bookSub}"; the game row: "${T.gameTitle}"`, bid != null && nb.titles[1] === 'Mi sistema' && nb.subs[1] === T.bookSub && nb.titles[2] === T.gameTitle && nb.pills[1] === '' && nb.pills[2] === '', nb.subs);
    console.log(`  NOTE [${tag}] with three rows, "${T.discover}" starts at y=${nb.discoverTop} and ends at y=${nb.discoverBottom}; the screen is ${nb.h} high`);
    await shot(`home-${tag}-continue`);
    await ev(`document.querySelector('main').scrollTop = 99999;`); await sleep(200);
    await shot(`home-${tag}-continue-scrolled`);
    await ev(`document.querySelector('main').scrollTop = 0;`);
    reqN = requested.length;
    await ev(`__app.Home.nextHtml = null; await __app.Home.drawNext();`);
    check(`[${tag}] drawing the three rows again from nothing asks the network for nothing`, requested.length === reqN, requested.slice(reqN));
    await ev(`window.__row = document.querySelector('#home-next .home-row');`);
    await awayAndBack();
    check(`[${tag}] leaving Home and coming back with nothing changed leaves the rows as they are (not drawn again), and "${T.discover}" unchanged`,
      await ev(`return window.__row.isConnected;`) && (await discover()).pick === pickWas && (await nextBlock()).types === 'homework,book,game');
    // Each row, tapped.
    await tapRow('game');
    await until(`__app.activeScreen === 'analysis' && __app.Analysis.ctx.historyId === ${JSON.stringify(gid)}`, 8000); await sleep(400);
    const an = await ev(`const A = __app.Analysis; return { screen: __app.activeScreen, historyId: A.ctx.historyId, pgn: A.tree.toPgn().replace(/\\s+/g, ' '), fen: A.tree.fen() };`);
    check(`[${tag}] the game row, tapped, opens that exact game in Analysis, as Play's history does (History.openGame): its 7 moves, on the last one`,
      an.screen === 'analysis' && an.historyId === gid && /1\. e4 e5 2\. Qh5 Nc6 3\. Bc4 Nf6 4\. Qxf7#/.test(an.pgn) && an.fen.startsWith('r1bqkb1r/pppp1Qpp'), an);
    await shot(`analysis-${tag}-from-home-game`);
    await ev(`history.back();`); await sleep(600);
    check(`[${tag}] Back from the game returns to Home`, await screen() === 'home');
    await tapRow('book');
    const reading = await until(`__app.activeScreen === 'read' && !document.getElementById('read-reader').classList.contains('hidden') && /^4/.test(document.getElementById('read-page-ind').textContent)`, 25000);
    await sleep(500);
    const rd = await ev(`return { screen: __app.activeScreen, title: document.getElementById('read-book-title').textContent, page: document.getElementById('read-page-ind').textContent, shelf: !document.getElementById('read-shelf').classList.contains('hidden') };`);
    check(`[${tag}] the book row, tapped, opens Read with that exact book open at its saved page (4 of 6)`, reading && rd.screen === 'read' && rd.title === 'Mi sistema' && /^4/.test(rd.page) && !rd.shelf, rd);
    await shot(`read-${tag}-from-home-book`);
    await ev(`history.back();`); await sleep(700);
    nb = await nextBlock();
    check(`[${tag}] Back from the book returns to Home; the row still says "${T.bookSub}"`, await screen() === 'home' && nb.subs[1] === T.bookSub, nb.subs);
    await tapRow('homework'); await sleep(500);
    check(`[${tag}] the homework row, tapped, opens the Students screen`, await screen() === 'students', await screen());
    await shot(`students-${tag}-from-home`);
    await ev(`history.back();`); await sleep(600);
    // Seen (set by hand: signed out, the Students screen lists no homework).
    await ev(`const S = (await import('/js/students.js')).Students; S.hwSeen = ['hwOld', 'hwNew']; S.paintDot();`); await sleep(400);
    nb = await nextBlock();
    check(`[${tag}] once seen, the same homework row stays, without the pill`, await screen() === 'home' && nb.types === 'homework,book,game' && nb.titles[0] === T.hwTitle && nb.pills[0] === '', { title: nb.titles[0], pill: nb.pills[0] });
    // The account goes: the listeners Firebase calls on a sign-out are called
    // (Auth._notify(), with nobody signed in), after telling Students that the
    // lists in memory belonged to somebody.
    const errSignOut = errors.length;
    await ev(`const S = (await import('/js/students.js')).Students, { Auth } = await import('/js/firebase.js'); S.uid = 'somebody'; Auth._notify();`);
    const gone = await until(`!document.querySelector('#home-next .home-row[data-type="homework"]')`, 6000); await sleep(600);
    nb = await nextBlock();
    check(`[${tag}] a sign-out removes the homework row without a reload; book and game stay; nothing threw`,
      gone && nb.types === 'book,game' && await screen() === 'home' && (await discover()).pick === pickWas && !errors.slice(errSignOut).some(e => e.startsWith('EXC')), { types: nb.types, errors: errors.slice(errSignOut) });
    await shot(`home-${tag}-signed-out-two-rows`);
    // The book is deleted (what the shelf's own Delete does after its question).
    await ev(`await __db.deleteBook(${JSON.stringify(bid)});`);
    await awayAndBack();
    nb = await nextBlock();
    check(`[${tag}] deleting the book removes its row: only the game and the heading are left`, nb.shown && nb.head === T.cont && nb.types === 'game', nb.types);

    // ── the day changes with the app open ──
    // The page's clock is moved one day on and the app's own "back to the
    // front" listener is fired; nothing of Home is called by hand.
    await until(`!document.getElementById('home-puzzle-board').classList.contains('hidden')`, 15000);
    await ev(`__app.DailyMissions.done = { puzzle: true, play: true, opening: false }; await __db.kvSet('dailyMissionsDone', __app.DailyMissions.done); __app.DailyMissions.render();`);
    await sleep(300);
    const d0 = { h: await home(), d: await discover(), pid: await ev(`return __app.Home.puzzle.id;`), date: await ev(`return await __db.kvGet('dailyMissionsDate', null);`) };
    await ev(`const Real = Date; window.__RealDate = Real;
      window.Date = class extends Real { constructor(...a) { if (a.length) super(...a); else super(Real.now() + 86400000); } static now() { return Real.now() + 86400000; } };
      document.dispatchEvent(new Event('visibilitychange'));`);
    const turned = await until(`document.getElementById('home-today-chip').textContent === '0 / 3' && __app.Home.puzzle && __app.Home.puzzle.id !== ${JSON.stringify(d0.pid)}`, 10000);
    await sleep(500);
    const d1 = { h: await home(), d: await discover(), pid: await ev(`return __app.Home.puzzle && __app.Home.puzzle.id;`), date: await ev(`return await __db.kvGet('dailyMissionsDate', null);`), nb: await nextBlock() };
    check(`[${tag}] before midnight: 2 / 3 and "${T.solved}"`, d0.h.chip === '2 / 3' && d0.h.btn === T.solved && d0.h.btnDone, { chip: d0.h.chip, btn: d0.h.btn });
    check(`[${tag}] the day changes with Home open: the chip returns to 0 / 3, the button to a gold "${T.solve}", both mission rows open, the new date saved`,
      turned && d1.h.chip === '0 / 3' && d1.h.btn === T.solve && !d1.h.btnDone && d1.h.rows.join() === 'false,false' && d1.date > d0.date, { chip: d1.h.chip, btn: d1.h.btn, was: d0.date, now: d1.date });
    check(`[${tag}] ...the board shows the new day's puzzle (${d0.pid} -> ${d1.pid}), and Kael's line is drawn again`, d1.h.board && d1.pid && d1.pid !== d0.pid && d1.h.line.length > 10 && d1.h.line !== d0.h.line, { was: d0.h.line, now: d1.h.line });
    check(`[${tag}] ..."${T.discover}" is unchanged, and so is "${T.cont}"`, d1.d.pick === d0.d.pick && d1.d.name === d0.d.name && d1.nb.types === 'game');
    await shot(`home-${tag}-next-day`);
    // The real clock back, the test game gone, and the regular player's keys again.
    await ev(`window.Date = window.__RealDate; document.dispatchEvent(new Event('visibilitychange'));`); await sleep(900);
    await ev(`await __db.clearHistory();`);
    await save('active');
    await ev(`await __app.Streak.init(); await __app.DailyMissions.init();`);
    await awayAndBack();
    check(`[${tag}] the game gone too: the middle block is gone again`, !(await nextBlock()).shown);

    // ── a clean start for the gestures: swipe, the menu, Back ──
    await send('Page.reload', {}); await sleep(300); await booted(); await sleep(700); await hook();
    await swipe(300, 60, 300);
    check(`[${tag}] swipe from Home goes to Analysis`, await screen() === 'analysis', await screen());
    const by = await ev(`const r = document.getElementById('ana-board').getBoundingClientRect(); return r.top + r.height * 0.4375;`);
    await swipe(90, 330, by);
    check(`[${tag}] swipe back from Analysis returns to Home`, await screen() === 'home', await screen());
    await swipe(90, 330, 300);
    check(`[${tag}] nothing before Home: a swipe the other way stays on Home`, await screen() === 'home' && !(await home()).hidden);
    await ev(`history.back(); await new Promise(r => setTimeout(r, 300)); history.back();`); await sleep(500);
    // Chrome keeps 50 history entries and this tool has pushed many by now: at
    // the limit the index stops growing, so the list is emptied before counting.
    await send('Page.resetNavigationHistory');
    await send('Page.reload', {}); await sleep(300); await booted(); await sleep(700); await hook();
    const i1 = await navIndex();
    await tap('#tabmenu-btn'); await sleep(450);
    check(`[${tag}] the menu opens, Home first and lit`, await ev(`return document.body.classList.contains('menu-open') && document.querySelector('#tabbar button').dataset.screen === 'home' && document.querySelector('#tabbar button').classList.contains('on');`));
    await shot(`menu-${tag}`);
    await ev(`history.back();`); await sleep(500);
    check(`[${tag}] Back with the menu open closes only the menu`, await ev(`return !document.body.classList.contains('menu-open');`) && await screen() === 'home' && await navIndex() === i1);
    for (const dest of ['analysis', 'puzzles', 'play']) { await tap('#tabmenu-btn'); await sleep(400); await tap(`#tabbar button[data-screen="${dest}"]`); await until(`__app.activeScreen === '${dest}'`, 5000); await sleep(400); }
    check(`[${tag}] three tabs deep through the menu: on Play, three entries of ours`, await screen() === 'play' && await navIndex() === i1 + 3, { screen: await screen(), index: await navIndex() - i1 });
    const walk = [];
    for (let i = 0; i < 3; i++) { await ev(`history.back();`); await sleep(500); walk.push(await screen()); }
    check(`[${tag}] Back walks Play, Puzzles, Analysis, Home; then none of ours is left, so one more leaves the app`, walk.join() === 'puzzles,analysis,home' && await navIndex() === i1, { walk, left: await navIndex() - i1 });
    await shot(`home-${tag}-after-back`);
  }

  // ── the puzzle file cannot be had (no connection, no stored copy) ──
  console.log('\n── the puzzle file refused ──');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await ev(`localStorage.setItem('lang', 'es');`);
  await save('active');
  puzzles.refuse = true;
  requested.length = 0;
  const errorsBefore = errors.length;
  await send('Page.reload', {}); await sleep(300); await booted(); await sleep(2500); await hook();
  const off = await home(), offD = await discover();
  const offErrors = errors.slice(errorsBefore).filter(e => !/firebaseappcheck|AppCheck|app-check|status of 403|fetching the script/i.test(e));
  check('refused: the file was asked for and Home still draws whole: Kael, the chip, "Resolver", the two rows, "Descubre"; no board and no empty box',
    requested.some(p => /puzzles\/puzzles-0\.json/.test(p)) && await screen() === 'home' && off.line.length > 10 && off.chip === '0 / 3' && off.btn === 'Resolver' && off.rows.length === 2 && !off.board && !off.hasBoard && off.boardW === 0 && off.side === ''
    && offD.head === 'Descubre' && offD.pieces >= 2 && off.sideScroll === 0, { board: off.board, side: off.side, discover: offD.name });
  check('refused: nothing threw; the only complaints are the 404 itself and the loader saying that band did not load', offErrors.every(e => /Puzzle band failed to load|puzzles\/puzzles-\d\.json/.test(e)) && !offErrors.some(e => e.startsWith('EXC')), offErrors);
  await shot('home-es-light-no-puzzle-file');
  await tap('#home-puzzle-btn'); await sleep(2500);
  const offP = await ev(`return { screen: __app.activeScreen, daily: !!__app.Puzzles.isDailyPuzzle, toast: document.querySelector('.toast')?.textContent || '' };`);
  check('refused: "Resolver" behaves as before the board: it opens Puzzles, which says itself that the puzzles are not there', offP.screen === 'puzzles' && !errors.slice(errorsBefore).some(e => e.startsWith('EXC')), offP);
  await shot('puzzles-es-light-no-puzzle-file');
  puzzles.refuse = false;
  await ev(`history.back();`); await sleep(600);
  const backOn = await until(`!document.getElementById('home-puzzle-board').classList.contains('hidden')`, 15000);
  check('...and once the file can be had again, coming back to Home fills the board in', backOn && await screen() === 'home');

  // ── what opens the app for a reason still wins ──
  console.log('\n── arriving for a reason ──');
  await ev(`const c = await caches.open('ctc-shared-inbox');
    await c.put('/__ctc-shared', new Response('[Event "Test"]\\n[White "A"]\\n[Black "B"]\\n[Result "1-0"]\\n\\n1. e4 e5 2. Nf3 Nc6 1-0\\n', { headers: { 'x-file-name': 'prueba.pgn', 'content-type': 'application/x-chess-pgn' } }));`);
  await open('/?shared=1');
  check('a shared PGN still lands on Databases', await until(`(await import('/js/app.js')).activeScreen === 'base'`, 8000), await screen());
  await open('/?duel=nobodyabc');
  check('a Duel link still lands on the Duel screen (signed out)', await until(`(await import('/js/app.js')).activeScreen === 'pulso'`, 12000), await screen());
  await open('/?state=x&code=y');
  await sleep(600);
  check('a Lichess return with nothing pending stays on the opening screen (now Home) and cleans the address', await screen() === 'home' && await ev(`return location.search === '';`));
} catch (e) { failed = true; console.error('\nSTOPPED: ' + e.message); }

const bad = checks.filter(c => !c.ok);
console.log(`\n${checks.length - bad.length} of ${checks.length} checks passed${bad.length ? ' — FAILED: ' + bad.map(c => c.name).join(' | ') : ''}`);
// App Check cannot answer on localhost (403) and sw.js is refused on purpose (404).
// The refused puzzle file (the tool's own doing) is judged in its own section.
const other = errors.filter(e => !/firebaseappcheck|AppCheck|app-check|bad HTTP response code \(404\) was received when fetching the script|status of 403|Puzzle band failed to load|puzzles\/puzzles-\d\.json/i.test(e));
console.log(other.length ? `Console errors (${other.length}):\n  ` + [...new Set(other)].join('\n  ') : 'No console errors (other than App Check and the refused service worker).');
chrome.kill();
server.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(failed || bad.length ? 1 : 0);
