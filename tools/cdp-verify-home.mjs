// Home ("Inicio"), conversation 1: the screen exists, the app opens on it, and
// it shows Kael's line and the "Hoy" card. Dev tool, not shipped. Headless
// Chrome over CDP, signed out, no service worker.
//
//   node tools/cdp-verify-home.mjs <outDir>     about three minutes
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
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 540000).unref();

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const requested = [];
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  requested.push(p);
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
    pageScroll: main.scrollHeight - main.clientHeight, bubble: q('#kael-bubble').classList.contains('show'), hidden: q('#screen-home').classList.contains('hidden') };`);
const corner = () => ev(`const c = getComputedStyle(document.getElementById('kael-corner')), f = document.getElementById('kael-fab').getBoundingClientRect();
  return { opacity: +(+c.opacity).toFixed(2), left: Math.round(f.left), right: Math.round(f.right), w: innerWidth, tappable: getComputedStyle(document.getElementById('kael-fab')).pointerEvents };`);
const TEXT = {
  es: { title: 'Inicio', welcome: 'Bienvenido.', solve: 'Resolver', solved: 'Resuelto ✓', pending: 'Tu racha de 12 días te espera', alldone: 'Las tres misiones', greet: /^Buen[oa]s (días|tardes|noches), Adrián\./ },
  en: { title: 'Home', welcome: 'Welcome.', solve: 'Solve', solved: 'Solved ✓', pending: 'Your 12-day streak is waiting', alldone: 'All three', greet: /^Good (morning|afternoon|evening), Adrián\./ },
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
      const ring = await ev(`const a = document.querySelector('.tour-ring').getBoundingClientRect(), b = document.getElementById('home-today').getBoundingClientRect();
        return { dx: Math.abs(a.left - b.left), dy: Math.abs(a.top - b.top), dw: Math.abs(a.width - b.width) };`);
      check('tour step 2 rings the "Hoy" card on Home', await screen() === 'home' && ring.dx < 14 && ring.dy < 14 && ring.dw < 26, ring);
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
    const before = await navIndex();
    await send('Page.reload', {}); await sleep(300); await booted(); await sleep(700); await hook();

    // ── opens on Home; the new player's page ──
    let h = await home();
    check(`[${tag}] after a reload the app is on Home, no history entry of its own`, await screen() === 'home' && !h.hidden && await navIndex() === before, { index: await navIndex() - before });
    check(`[${tag}] top bar: "${T.title}" with the house icon; the menu lights Home, first of nine`, h.title === T.title && h.titleIco && h.lit.join() === 'home' && h.order[0] === 'home' && h.order[1] === 'analysis' && h.order.length === 9, { title: h.title, lit: h.lit, order: h.order });
    check(`[${tag}] new player: Kael welcomes, 0 / 3, a gold "${T.solve}", two mission rows, nothing sideways`, h.line.startsWith(T.welcome) && h.chip === '0 / 3' && h.btn === T.solve && !h.btnDone && h.rows.join() === 'false,false' && h.sideScroll === 0 && h.cardIn, h);
    // Kael's quote on opening (0.9 s after the splash) still comes, on Home too.
    const quote = await until(`document.getElementById('kael-bubble').classList.contains('show')`, 4000);
    await sleep(500);
    check(`[${tag}] Kael's quote on opening still appears, now over Home`, quote && (await corner()).opacity === 1);
    await shot(`home-${tag}-opening-quote`);
    await ev(`(await import('/js/app.js')).KaelQuotes.hide();`); await sleep(700);
    h = await home();
    check(`[${tag}] Home, idle: Kael's corner is not visible and cannot be tapped`, h.cornerOpacity === 0 && h.fabLeft >= h.w && !h.bubble && (await corner()).tappable === 'none', { opacity: h.cornerOpacity, fabLeft: h.fabLeft, bubble: h.bubble });
    check(`[${tag}] opening Home asked for no puzzle file and no opening library`, !requested.some(p => /puzzles\/|opening-library/.test(p)), requested.filter(p => /puzzles\/|opening-library/.test(p)));
    await shot(`home-${tag}-new`);

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
    await tap('#home-puzzle-btn');
    const daily = await until(`__app.activeScreen === 'puzzles' && __app.Puzzles.isDailyPuzzle`, 15000);
    check(`[${tag}] "${T.solve}", tapped, opens the puzzle of the day on Puzzles`, daily, await screen());
    const idle = { puzzles: await corner() };
    await ev(`await __app.DailyMissions.complete('puzzle'); __app.KaelQuotes.hide(); history.back();`); await sleep(700);
    h = await home();
    check(`[${tag}] the puzzle mission done: "${T.solved}", quiet (not gold), 2 / 3`, h.btn === T.solved && h.btnDone && h.chip === '2 / 3' && await screen() === 'home', { btn: h.btn, bg: h.btnBg, chip: h.chip });
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
    await ev(`__app.KaelQuotes.show({ text: ${JSON.stringify(lang === 'es' ? '¡Partida jugada! Ya tienes esa misión lista.' : 'Game played! That mission is done.')} }, 2600);`);
    await sleep(700);
    const spoke = await corner();
    check(`[${tag}] on Home, when Kael really speaks he slides fully in`, spoke.opacity === 1 && spoke.right <= spoke.w && (await home()).bubble, spoke);
    await shot(`home-${tag}-kael-speaking`);
    await sleep(2900);
    check(`[${tag}] ...and leaves again when he has finished`, (await corner()).opacity === 0 && !(await home()).bubble);

    // ── the reminder the 45-second timer calls ──
    await ev(`__app.DailyMissions.done = { puzzle: false, play: false, opening: false }; __app.DailyMissions.reminded = false; __app.DailyMissions.render();`);
    await ev(`__app.DailyMissions.remindIfIncomplete();`); await sleep(400);
    check(`[${tag}] the missions reminder does not appear on Home`, !(await home()).bubble && await ev(`return __app.DailyMissions.reminded === false;`));
    await ev(`__app.showScreen('analysis'); __app.DailyMissions.remindIfIncomplete();`); await sleep(500);
    check(`[${tag}] ...and still appears on Analysis`, await ev(`const b = document.getElementById('kael-bubble'); return b.classList.contains('show') && b.classList.contains('actionable');`));
    await ev(`__app.KaelQuotes.hide();`);
    await shot(`analysis-${tag}`);

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
    await send('Page.reload', {}); await sleep(300); await booted(); await sleep(700); await hook();
    const i1 = await navIndex();
    await tap('#tabmenu-btn'); await sleep(450);
    check(`[${tag}] the menu opens, Home first and lit`, await ev(`return document.body.classList.contains('menu-open') && document.querySelector('#tabbar button').dataset.screen === 'home' && document.querySelector('#tabbar button').classList.contains('on');`));
    await shot(`menu-${tag}`);
    await ev(`history.back();`); await sleep(500);
    check(`[${tag}] Back with the menu open closes only the menu`, await ev(`return !document.body.classList.contains('menu-open');`) && await screen() === 'home' && await navIndex() === i1);
    for (const dest of ['analysis', 'puzzles', 'play']) { await tap('#tabmenu-btn'); await sleep(400); await tap(`#tabbar button[data-screen="${dest}"]`); await sleep(500); }
    check(`[${tag}] three tabs deep through the menu: on Play, three entries of ours`, await screen() === 'play' && await navIndex() === i1 + 3, { screen: await screen(), index: await navIndex() - i1 });
    const walk = [];
    for (let i = 0; i < 3; i++) { await ev(`history.back();`); await sleep(500); walk.push(await screen()); }
    check(`[${tag}] Back walks Play, Puzzles, Analysis, Home; then none of ours is left, so one more leaves the app`, walk.join() === 'puzzles,analysis,home' && await navIndex() === i1, { walk, left: await navIndex() - i1 });
    await shot(`home-${tag}-after-back`);
  }

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
const other = errors.filter(e => !/firebaseappcheck|AppCheck|app-check|bad HTTP response code \(404\) was received when fetching the script|status of 403/i.test(e));
console.log(other.length ? `Console errors (${other.length}):\n  ` + [...new Set(other)].join('\n  ') : 'No console errors (other than App Check and the refused service worker).');
chrome.kill();
server.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(failed || bad.length ? 1 : 0);
