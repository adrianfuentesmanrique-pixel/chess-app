// The 🤖 Position homework (v218): the fourth button of the assign sheet, the
// board editor's way there and back, the student's card and game, and what
// finishes it. Dev tool, not shipped. Headless Chrome over CDP at 375 x 812,
// signed out, no service worker.
//
//   node tools/cdp-verify-students9.mjs <outDir>     about four minutes
//
// The skeleton (server, Chrome, tapX, load) is tools/cdp-verify-students8.mjs's.
// EVERYTHING signed-in is SEEDED: Firestore is unreachable from localhost (App
// Check), so nothing is written. What the sheet would send is read from
// assignSheet()'s own promise, what a finished game would save from
// Students.hwSave(); the write itself is proved by test:rules.
// REALLY TAPPED: the student's card, the finished strip, Assign homework, the
// kind buttons, "Set up the position", the editor's side-to-move switch, "Use
// for the homework" and Cancel, the colour switch, Send, the homework cards'
// buttons, Resign and its Yes, Back, the Play tab's Start, "Open game" (on the
// card and in the results sheet), Mark done and Yes, the endgame's Practice.
// CALLED, not tapped: Play.userMove(), Endgame.userMove() and
// Puzzles.userMove() with the moves, Play.undo() (its button is hidden),
// Setup.load() for the pieces, showScreen(), Students.hwChapterStep().
// SET by script: the level (a native <select> opens an OS list that CDP cannot
// tap), the note and the date.
// STOOD IN FOR: Masterclass.openForHomework (the chapter is in Firestore).
// THE COMPUTER REALLY PLAYS: Stockfish answers in G, H and I (G needs it to
// find a mate in one at the top level).
// NOT REACHED here: Firestore itself (no Firebase user), so "sent" means what
// the sheet hands to the write, and "done" means done on this phone.
//
// Ports are kept clear of tools/emu-verify-simul.mjs and the other students
// tools (9300-9899 and 9900-9989), which another session may be running.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/cdp-verify-students9.mjs <outDir>'); process.exit(1); }
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9100 + Math.floor(Math.random() * 90);
const WEB = 8700 + Math.floor(Math.random() * 90);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-stu9-'));
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 600000).unref();

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
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
});
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok }); console.log((ok ? '  PASS ' : '  FAIL ') + name + (!ok && detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); };
const shot = async name => fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
const until = async (expr, ms = 8000) => { for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (await ev(`return !!(${expr});`)) return true; await sleep(60); } return false; };
// A real touch in the middle of an element: `find` is a JS expression for it.
// It is scrolled into view first, and it must be what the finger reaches.
const tapX = async find => {
  // A toast sits over the bottom of the screen for up to 3.5 s: wait it out.
  await until(`document.getElementById('toast').classList.contains('hidden')`, 5000);
  const pt = await ev(`const e = ${find}; if (!e) return null; e.scrollIntoView({ block: 'center' });
    await new Promise(r => setTimeout(r, 120));
    const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, reach: !!hit && (hit === e || e.contains(hit)), by: hit ? hit.tagName + '#' + hit.id + '.' + hit.className : 'nothing' };`);
  if (!pt) throw new Error('nothing to tap: ' + find);
  if (!pt.reach) throw new Error('covered by ' + pt.by + ', a finger would not reach: ' + find);
  const touch = (type, p) => send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }] : [] });
  await touch('touchStart', pt); await sleep(40); await touch('touchEnd'); await sleep(350);
};
const tap = sel => tapX(`document.querySelector(${JSON.stringify(sel)})`);
const top = `[...document.querySelectorAll('.modal-box')].pop()`;      // the sheet on top
const closeModals = () => ev(`document.querySelectorAll('.modal-back').forEach(e => e.remove());`);
const toastText = () => ev(`const el = document.getElementById('toast'); return el.classList.contains('hidden') ? '' : el.textContent;`);

const load = async (lang, scheme) => {
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
  await send('Page.navigate', { url: `http://127.0.0.1:${WEB}/` });
  await sleep(2500);
  await ev(`localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1');`);
  await send('Page.reload', {});
  await sleep(3500);
  await ev(`document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove());
    window.__app = await import('/js/app.js'); window.__stu = (await import('/js/students.js')).Students;
    // What the sheet resolves to, kept for the checks (the write needs a user).
    const orig = __stu.assignSheet; window.__specs = [];
    __stu.assignSheet = function (...a) { const pr = orig.apply(this, a); pr.then(v => __specs.push(v)); return pr; };`);
};


const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FEN_WIN = '6k1/8/6K1/8/8/8/8/Q7 w - - 0 1';      // Qa8 is mate
const FEN_DRAW = '7k/8/6K1/8/8/8/8/5Q2 w - - 0 1';     // Qf7 is stalemate
const FEN_LOSS = '7k/4Q3/6K1/8/8/8/8/8 w - - 0 1';     // White (the computer) mates in one

// I am the teacher of Marco and the student of Coach Elena. Marco has four
// positions from me (won, drawn, resigned without a move, open); I have five
// from Elena, and one of each older kind, all sent before.
const seed = () => ev(`
  const { Students } = await import('/js/students.js');
  const { packPuzzle } = await import('/js/firebase.js');
  __app.showScreen('base');
  await Students.load();
  const now = Date.now(), T = 't_uid', S = 's_uid', ME = 'me_uid';
  const lib = await (await fetch('/puzzles/puzzles-3.json')).json();
  const packed = lib.slice(0, 2).map(packPuzzle);
  const gv = (id, title, params, extra = {}) => ({ id, teacherUid: ME, studentUid: S, kind: 'position', title, params,
    status: 'done', done: 1, seconds: 250, completedAt: now - 2 * 3600e3, doneMs: now - 2 * 3600e3, createdAt: now - 2 * 86400e3, ...extra });
  const given = [
    gv('g1', 'Mate the king', { fen: ${JSON.stringify(FEN_WIN)}, color: 'w', level: 3 }, { game: { outcome: 'win', end: 'checkmate', moves: 'a1a8' } }),
    gv('g2', 'Do not stalemate', { fen: ${JSON.stringify(FEN_DRAW)}, color: 'w', level: 0 }, { game: { outcome: 'draw', end: 'stalemate', moves: 'f1f7' } }),
    gv('g3', 'Gave up at once', { fen: ${JSON.stringify(START)}, color: 'b', level: 7 }, { game: { outcome: 'loss', end: 'resign', moves: '' } }),
    gv('g4', 'Still to play', { fen: ${JSON.stringify(START)}, color: 'w', level: 5 }, { status: 'open', done: 0, seconds: 0, completedAt: undefined, doneMs: undefined }),
  ];
  const mine = (id, kind, title, params, extra = {}) => ({ id, teacherUid: T, studentUid: ME, kind, title, params,
    status: 'open', done: 0, seconds: 0, createdAt: now - 3600e3, ...extra });
  Object.assign(Students, {
    uid: ME, loaded: true, failed: false, cachedAt: now,
    asStudent: [{ id: T + '_' + ME, teacherUid: T, studentUid: ME, status: 'active' }],
    asTeacher: [{ id: ME + '_' + S, teacherUid: ME, studentUid: S, status: 'active' }],
    people: { [T]: { uid: T, profileName: 'Coach Elena', username: 'elena' } },
    reports: { [S]: { uid: S, teachers: [ME], profileName: 'Marco', username: 'marco',
      puzzleElo: 1342, openingEloAvg: 1210, endgameEloAvg: 1150, blindfoldElo: 1000,
      puzzleThemeElo: { fork: 1180, pin: 1250, skewer: 1400 }, puzzleEloHistory: [],
      puzzlesSolvedCount: 412, puzzleAttemptCount: 530, streakCount: 5, bestStreak: 12,
      activeTime: {}, hwOpen: 1, hwDone: 3, updatedAt: now - 3600e3 } },
    doneSeen: { [S]: 3 }, hwSeen: [],
    hwGiven: { [S]: given },
    finNew: [{ id: 'g1', studentUid: S, title: given[0].title, kind: 'position', doneMs: now - 2 * 3600e3, seen: false }],
    finSeenAt: now - 4 * 3600e3,
    hwDraft: {}, hwPos: {},
    homework: [
      mine('p1', 'position', 'Win this', { fen: ${JSON.stringify(FEN_WIN)}, color: 'w', level: 3 }, { dueDate: '2026-10-20' }),
      mine('p2', 'position', 'Hold the draw', { fen: ${JSON.stringify(FEN_DRAW)}, color: 'w', level: 0 }),
      mine('p3', 'position', 'Defend', { fen: ${JSON.stringify(FEN_LOSS)}, color: 'b', level: 7 }),
      mine('p4', 'position', 'Resign me', { fen: ${JSON.stringify(START)}, color: 'w', level: 1 }),
      mine('p5', 'position', 'Leave me', { fen: ${JSON.stringify(START)}, color: 'b', level: 0 }),
      mine('k1', 'text', 'Replay the Opera Game', {}),
      mine('k2', 'list', 'Puzzles from Tuesday', { puzzles: packed }, { doneIds: [] }),
      mine('k3', 'puzzles', 'One puzzle', { themes: [], minRating: 1000, maxRating: 1600, count: 1 }),
      mine('k4', 'chapter', 'The Lucena chapter', { mcId: 'mc1', chapterId: 'ch1' }),
      mine('k5', 'endgame', 'Key Squares for Friday', { endgameId: 'p3' }),
    ],
  });
  // With a seeded uid and no Firebase user, load() would fetch empty lists
  // and wipe this seed. Test only: from here on "load" just redraws.
  Students.load = async () => { Students.render(); };
  // What a finishing save carries, kept for the checks (the write needs a user).
  window.__saves = [];
  const save = Students.hwSave;
  Students.hwSave = function (a) { if (a && a.finish && this.hwRun) __saves.push({ id: this.hwRun.id, addDone: this.hwRun.addDone, game: this.hwRun.game }); return save.call(this, a); };
  Students.paintDot();
  __app.showScreen('students');
  Students.render();`);

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const openPage = async () => { await tap('#stu-list .stu-card.tappable'); await until(`document.querySelector('.stu-page')`); };
const openSheet = async () => { await tap('.hw-teacher .btn-wide'); await until(`document.querySelector('.hw-sheet')`); };
const sheetState = () => ev(`const s = document.querySelector('.hw-sheet'); if (!s) return null;
  const vis = q => { const e = s.querySelector(q); return !!e && !e.classList.contains('hidden') && e.getBoundingClientRect().height > 0; };
  const btns = q => [...s.querySelectorAll(q + ' button')].map(b => { const r = b.getBoundingClientRect(); return { v: b.dataset.v, text: b.textContent, on: b.classList.contains('on'),
    cut: b.scrollWidth > b.clientWidth, h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) }; });
  const box = s.getBoundingClientRect(), bd = s.querySelector('.hw-ps-board').getBoundingClientRect();
  return { kinds: btns('.hw-kind'), mode: vis('.hw-mode'), pz: vis('.hw-pz'), ls: vis('.hw-ls'), ch: vis('.hw-ch'), eg: vis('.hw-eg'), ps: vis('.hw-ps'),
    board: vis('.hw-ps-board'), pieces: s.querySelectorAll('.hw-ps-board img').length, boardSq: Math.round(bd.width) === Math.round(bd.height) && bd.width > 100,
    hint: vis('.hw-ps-hint') ? s.querySelector('.hw-ps-hint').textContent : '', set: s.querySelector('.hw-ps-set').textContent, opts: vis('.hw-ps-opts'),
    colors: btns('.hw-ps-color'), level: s.querySelector('.hw-ps-lv').value, levels: [...s.querySelectorAll('.hw-ps-lv option')].map(o => o.textContent),
    labels: [...s.querySelectorAll('.hw-ps-opts .hw-label')].map(l => l.childNodes[0].textContent),
    fits: [...s.querySelectorAll('.hw-ps *')].every(e => e.getBoundingClientRect().right <= box.right + 1), wide: s.scrollWidth > s.clientWidth };`);
const cards = sel => ev(`return [...document.querySelectorAll(${JSON.stringify(sel)})].map(c => ({ text: c.innerText,
  btns: [...c.querySelectorAll('.fr-actions .btn')].map(b => b.textContent), wide: c.scrollWidth > c.clientWidth }));`);
const hw = id => ev(`const h = __stu.homework.find(x => x.id === ${JSON.stringify(id)}); return h ? { status: h.status, done: h.done, game: h.game } : null;`);
const myCard = text => `[...document.querySelectorAll('#stu-hw-list > .hw-card')].find(c => c.textContent.includes(${JSON.stringify(text)}))`;
const cardBtn = text => tapX(`${myCard(text)}.querySelector('.fr-actions .btn')`);
const on = id => `!document.getElementById('${id}').classList.contains('hidden')`;
// The Play screen as it stands.
const play = () => ev(`const P = __app.Play;
  return { screen: ${on('screen-play')}, game: ${on('play-game')}, setup: ${on('play-setup')}, color: P.playerColor, level: P.level, hwId: P.hwId, over: P.over,
    startFen: P.startFen, fen: P.chess ? P.chess.fen() : '', plies: P.chess ? P.chess.history().length : 0, turn: P.chess ? P.chess.turn() : '',
    orient: P.board.orientation, undo: ${on('play-undo')}, clocks: ${on('play-clocks')}, clock: !!P.clock, status: document.getElementById('play-status').textContent,
    run: __stu.hwRun ? { id: __stu.hwRun.id, kind: __stu.hwRun.kind } : null };`);
// One move through Play.userMove, the board's own path.
const move = uci => ev(`await __app.Play.userMove({ from: '${uci.slice(0, 2)}', to: '${uci.slice(2, 4)}'${uci[4] ? `, promotion: '${uci[4]}'` : ''} });`);
const myTurn = (plies, ms = 40000) => until(`__app.Play.chess.history().length >= ${plies} && !__app.Play.thinking && __app.Play.chess.turn() === __app.Play.playerColor`, ms);
const yes = async () => { await until(`${top} && ${top}.querySelector('.btn.danger')`); await tapX(`${top}.querySelector('.btn.danger')`); await sleep(900); };
const toStudents = async () => { await ev(`__app.showScreen('students');`); await sleep(400); };
// Puzzles.userMove through the puzzle on the board.
const SOLVE = `const P = __app.Puzzles, sl = ms => new Promise(r => setTimeout(r, ms));
  await sl(900);
  const p = P.current;
  while (P.current === p && P.moveIdx < p.moves.length) {
    const u = p.moves[P.moveIdx];
    await P.userMove({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    await sl(500);
  }
  return p.id;`;

const W = {
  en: { kinds: ['🧩 Puzzles', '📖 Chapter', '♟ Endgame', '🤖 Position'],
    what: 'Play this position as White against the computer (Club)', whatB: 'Play this position as Black against the computer (Maximum)',
    whatT: 'Position: plays White against the computer (Club) — done when the game ends',
    play: 'Play', won: 'Won · Checkmate · 1 move', drew: 'Draw by stalemate · 1 move', lost: 'Lost · Resignation · 0 moves', game: 'Open game',
    set: '✏️ Set up the position', change: '✏️ Change the position', use: 'Use for the homework', hint: 'Set the position up on the board first',
    labels: ['The student plays', 'Computer level'], colors: ['White', 'Black'], lv: '3 · Casual', auto: 'Position vs the computer' },
  es: { kinds: ['🧩 Problemas', '📖 Capítulo', '♟ Final', '🤖 Posición'],
    what: 'Juega esta posición con blancas contra la computadora (Club)', whatB: 'Juega esta posición con negras contra la computadora (Máximo)',
    whatT: 'Posición: juega con blancas contra la computadora (Club) — hecho cuando termina la partida',
    play: 'Jugar', won: 'Ganó · Jaque mate · 1 jugada', drew: 'Tablas por ahogado · 1 jugada', lost: 'Perdió · Abandono · 0 jugadas', game: 'Ver partida',
    set: '✏️ Colocar la posición', change: '✏️ Cambiar la posición', use: 'Usar para los deberes', hint: 'Coloca primero la posición en el tablero',
    labels: ['El alumno juega con', 'Nivel de la computadora'], colors: ['Blancas', 'Negras'], lv: '3 · Casual', auto: 'Posición contra la computadora' },
};

let failed = false;
try {
  // ── What shows, in both languages and both themes ──
  for (const lang of ['es', 'en']) {
    for (const scheme of ['light', 'dark']) {
      const tag = `${lang}-${scheme}`, w = W[lang];
      console.log('… ' + tag);
      await load(lang, scheme);
      await seed();
      await sleep(300);

      // The student's side.
      const mine = await cards('#stu-hw-list > .hw-card');
      const by = t => mine.find(c => c.text.includes(t));
      check(`${tag}: all ten of my homework show (5 positions, Task, List, Puzzles, Chapter, Endgame)`, mine.length === 10, mine.map(c => c.text.split('\n')[0]));
      check(`${tag}: the position card says "${w.what}", with the robot`, by('Win this') && by('Win this').text.includes(w.what) && by('Win this').text.includes('🤖'), by('Win this'));
      check(`${tag}: as Black at the top level it says "${w.whatB}"`, by('Defend') && by('Defend').text.includes(w.whatB), by('Defend'));
      check(`${tag}: its one button is "${w.play}", not "Mark done"`, ['Win this', 'Hold the draw', 'Defend', 'Resign me', 'Leave me'].every(t => by(t) && same(by(t).btns, [w.play])), mine.map(c => c.btns));
      check(`${tag}: no card is wider than the screen`, mine.every(c => !c.wide));
      await ev(`document.getElementById('stu-hw').scrollIntoView({ block: 'start' });`);
      await sleep(200);
      await shot(`${tag}-1-student-cards`);

      // The teacher's side: the finished strip…
      const fin = await ev(`return [...document.querySelectorAll('#stu-fin-list .fin-row')].map(r => r.innerText);`);
      check(`${tag}: the finished strip shows Marco's position`, fin.length === 1 && fin[0].includes('Mate the king'), fin);
      await tap('#stu-fin-list .fin-row');
      await until(`document.querySelector('.hwr-sheet')`);
      const res = await ev(`const s = document.querySelector('.hwr-sheet'); return { text: s.innerText, game: !!s.querySelector('.hw-game') };`);
      check(`${tag}: tapping it opens how it went: "${w.won}", with "${w.game}"`, res.text.includes(w.won) && res.text.includes(w.whatT) && res.game && res.text.includes(w.game), res);
      await shot(`${tag}-2-how-it-went`);
      await closeModals();

      // …and the student's page.
      await openPage();
      const page = await cards('.hw-teacher .hw-card');
      const pg = t => page.find(c => c.text.includes(t));
      check(`${tag}: Marco's page lists the four positions I sent`, page.length === 4, page.map(c => c.text));
      check(`${tag}: the won one says "${w.won}" and has "${w.game}"`, pg('Mate the king') && pg('Mate the king').text.includes(w.won) && pg('Mate the king').btns.includes(w.game), pg('Mate the king'));
      check(`${tag}: the drawn one says "${w.drew}" and has "${w.game}"`, pg('Do not stalemate') && pg('Do not stalemate').text.includes(w.drew) && pg('Do not stalemate').btns.includes(w.game), pg('Do not stalemate'));
      check(`${tag}: one resigned before any move says "${w.lost}" and has no game to open`, pg('Gave up at once') && pg('Gave up at once').text.includes(w.lost) && pg('Gave up at once').btns.length === 1, pg('Gave up at once'));
      check(`${tag}: the open one has no result and no game`, pg('Still to play') && pg('Still to play').btns.length === 1 && !/Won|Lost|Ganó|Perdió|Tablas|Draw/.test(pg('Still to play').text), pg('Still to play'));
      check(`${tag}: no card is too wide`, page.every(c => !c.wide));
      await ev(`document.querySelector('.hw-teacher').scrollIntoView({ block: 'start' });`);
      await sleep(200);
      await shot(`${tag}-3-teacher-page`);

      // The sheet.
      await openSheet();
      let s = await sheetState();
      check(`${tag}: the sheet has four buttons: Puzzles, Chapter, Endgame, Position`, same(s.kinds.map(b => b.text), w.kinds) && same(s.kinds.map(b => b.v), ['puzzles', 'chapter', 'endgame', 'position']), s.kinds);
      check(`${tag}: two rows of two, same size, nothing cut, nothing wider than the sheet`,
        s.kinds[0].y === s.kinds[1].y && s.kinds[2].y === s.kinds[3].y && s.kinds[2].y > s.kinds[0].y && s.kinds[0].x === s.kinds[2].x && s.kinds[1].x === s.kinds[3].x
        && s.kinds.every(b => !b.cut && b.h < 48 && b.h === s.kinds[0].h && b.w === s.kinds[0].w) && !s.wide, s.kinds);
      check(`${tag}: it still opens on Puzzles, by theme and level`, s.kinds[0].on && s.mode && s.pz && !s.ps && !s.eg && !s.ch && !s.ls, s);
      await shot(`${tag}-4-sheet`);
      await tapX(`document.querySelector('.hw-kind button[data-v="position"]')`);
      s = await sheetState();
      check(`${tag}: Position hides the switch and the other forms`, s.ps && s.kinds[3].on && !s.mode && !s.pz && !s.ch && !s.eg && !s.ls, s);
      check(`${tag}: with no position yet: the hint and "${w.set}", no board, no colour, no level`, s.hint.startsWith(w.hint) && s.set === w.set && !s.board && !s.opts, s);
      await shot(`${tag}-5-sheet-position-empty`);

      // Off to the board editor and back.
      await tapX(`document.querySelector('.hw-ps-set')`);
      await sleep(400);
      let ed = await ev(`return { screen: ${on('screen-setup')}, hw: ${on('setup-homework')}, an: ${on('setup-analyze')}, pl: ${on('setup-play')},
        use: document.getElementById('setup-homework').textContent, modals: document.querySelectorAll('.modal-back').length, forHw: __app.Setup.forHw };`);
      check(`${tag}: "${w.set}" closes the page and opens the board editor for Marco`, ed.screen && ed.modals === 0 && ed.forHw === 's_uid', ed);
      check(`${tag}: the editor's exit is "${w.use}"; Analyse and Play from here are away`, ed.hw && ed.use === w.use && !ed.an && !ed.pl, ed);
      await ev(`__app.Setup.load(${JSON.stringify(FEN_WIN)}); document.getElementById('setup-homework').scrollIntoView({ block: 'center' });`);
      await sleep(200);
      await shot(`${tag}-6-editor`);
      await tap('#setup-homework');
      await until(`document.querySelector('.hw-sheet')`);
      await sleep(300);
      s = await sheetState();
      const back = await ev(`return { screen: ${on('screen-students')}, page: !!document.querySelector('.stu-page'), fen: __stu.hwPos.s_uid };`);
      check(`${tag}: it comes back to Marco's page with the sheet open on Position`, back.screen && back.page && s && s.ps && s.kinds[3].on && back.fen === FEN_WIN, { back, s });
      check(`${tag}: the board shows the position (3 pieces), square, and "${w.change}"`, s.board && s.pieces === 3 && s.boardSq && s.set === w.change && !s.hint, s);
      check(`${tag}: "${w.labels.join('" and "')}": ${w.colors.join(' / ')}, the side to move chosen; level "${w.lv}"`,
        s.opts && same(s.labels, w.labels) && same(s.colors.map(b => b.text), w.colors) && s.colors[0].on && !s.colors[1].on && s.levels.length === 8 && s.levels[+s.level] === w.lv, s);
      check(`${tag}: everything stays inside the sheet`, s.fits && !s.wide, s);
      await ev(`document.querySelector('.hw-sheet .hw-kind').scrollIntoView({ block: 'start' });`);
      await sleep(200);
      await shot(`${tag}-7-sheet-position`);
      await closeModals();

      // The student's button starts exactly that game.
      await toStudents();
      await cardBtn('Win this');
      await sleep(500);
      const at = await play();
      check(`${tag}: "${w.play}" starts that position, as White, at level 4 (Club)`, at.screen && at.game && !at.setup && at.startFen === FEN_WIN && at.fen === FEN_WIN && at.color === 'w' && at.level === 3 && at.orient === 'w' && at.hwId === 'p1', at);
      check(`${tag}: no clock and no Undo button`, !at.clock && !at.clocks && !at.undo, at);
      await shot(`${tag}-8-the-game`);
      await tap('#play-back');
      await sleep(300);
    }
  }

  // ── The real flows (English, light) ──
  console.log('… flows');
  await load('en', 'light');
  await seed();
  await sleep(300);
  errors.length = 0;
  const w = W.en;

  // D. Assigning.
  await openPage();
  await openSheet();
  await tapX(`document.querySelector('.hw-kind button[data-v="position"]')`);
  await tapX(`${top}.querySelector('.row .btn.primary')`);
  await sleep(300);
  check('D. Send with no position says to set it up first, and the sheet stays', (await toastText()).includes('Set up the position first') && !!(await sheetState()), await toastText());
  await tapX(`document.querySelector('.hw-ps-set')`);
  await sleep(400);
  await ev(`__app.Setup.load('6k1/8/6K1/8/8/8/8/8 w - - 0 1');`);
  await tap('#setup-homework');
  await sleep(400);
  check('D. two bare kings cannot be played: the editor says so and stays', (await toastText()).includes('already over') && (await ev(`return ${on('screen-setup')};`)), await toastText());
  await tap('#setup-cancel');
  await until(`document.querySelector('.hw-sheet')`);
  let s = await sheetState();
  check('D. Cancel in the editor comes back to the sheet on Position, still with no position', s.ps && s.kinds[3].on && !s.board && s.set === w.set, s);
  await tapX(`document.querySelector('.hw-ps-set')`);
  await sleep(400);
  // REALLY TAPPED in the editor: the black side to move. The pieces are set by script.
  await ev(`__app.Setup.load(${JSON.stringify(FEN_LOSS)});`);
  await tapX(`document.querySelector('#setup-turn button[data-v="b"]')`);
  await tap('#setup-homework');
  await sleep(600);
  const warn = await ev(`const m = ${top}; return m && !m.classList.contains('hw-sheet') && !m.classList.contains('stu-page') ? m.innerText : '';`);
  check('D. a legal position asks nothing on the way back', warn === '', warn);
  await until(`document.querySelector('.hw-sheet')`);
  s = await sheetState();
  const FEN_B = FEN_LOSS.replace(' w ', ' b ');
  check('D. Black to move in the editor: the sheet proposes Black, board seen from Black', s.colors[1].on && !s.colors[0].on && (await ev(`return __stu.hwPos.s_uid;`)) === FEN_B, s.colors);
  await tapX(`document.querySelector('.hw-ps-color button[data-v="w"]')`);
  // SET by script: the level (a native <select>), the note and the date.
  await ev(`document.querySelector('.hw-ps-lv').value = '5'; document.querySelector('.hw-due').value = '2026-10-20';
    document.querySelector('.hw-note-in').value = 'Do not hurry';`);
  await tapX(`${top}.querySelector('.row .btn.primary')`);
  await sleep(500);
  const d1 = await ev(`return __specs.filter(x => x && x.kind).pop();`);
  check('D. Send hands over kind "position" with the same five fields as the other kinds', d1 && d1.kind === 'position' && same(Object.keys(d1).sort(), ['dueDate', 'kind', 'note', 'params', 'title']), d1);
  check('D. its params are exactly the position, the colour I tapped and the level I chose', d1 && same(d1.params, { fen: FEN_B, color: 'w', level: 5 }), d1 && d1.params);
  check('D. the position passes the rule\'s own FEN pattern', d1 && /^[1-8pnbrqkPNBRQK/]{15,71} [wb] [-KQkq]{1,4} [-a-h1-8]{1,2} [0-9]{1,3} [0-9]{1,4}$/.test(d1.params.fen), d1 && d1.params.fen);
  check('D. the title is automatic, the note and the date are kept', d1 && d1.title === w.auto && d1.note === 'Do not hurry' && d1.dueDate === '2026-10-20', d1);
  check('D. once sent, the position is not kept for the next homework', (await ev(`return __stu.hwPos.s_uid === undefined;`)));
  await closeModals();
  // The editor opened the usual way is the usual editor again.
  await ev(`__app.Setup.open();`);
  await sleep(300);
  const usual = await ev(`return { hw: ${on('setup-homework')}, an: ${on('setup-analyze')}, pl: ${on('setup-play')}, forHw: __app.Setup.forHw };`);
  check('D. opened from Analysis, the editor has Analyse and Play again and no homework button', !usual.hw && usual.an && usual.pl && usual.forHw === null, usual);

  // E. A won game finishes it.
  const done = async (id, title) => {
    const h = await hw(id), said = await toastText(), at = await play();
    const sv = await ev(`return __saves.filter(x => x.id === ${JSON.stringify(id)});`);
    return { h, said, at, sv, ok: h.status === 'done' && h.done === 1 && said.includes('Homework done!') && said.includes(title) && at.run === null && at.hwId === null
      && sv.length === 1 && sv[0].addDone === 1 && same(sv[0].game, h.game) };
  };
  await toStudents();
  await cardBtn('Win this');
  await sleep(500);
  let at = await play();
  check('E. the game is the homework\'s, and that homework is the one running', at.hwId === 'p1' && at.run && at.run.id === 'p1' && at.run.kind === 'position', at);
  await ev(`__app.Play.undo();`);
  await move('a1a8');
  await sleep(600);
  let r = await done('p1', 'Win this');
  check('E. mate delivered: done, "Homework done!", one finishing save, nothing left running', r.ok && r.at.over, r);
  check('E. what is saved: won, by checkmate, the one move', same(r.h.game, { outcome: 'win', end: 'checkmate', moves: 'a1a8' }), r.h.game);
  await shot('flow-E-won');

  // F. A drawn game finishes it.
  await toStudents();
  check('F. the won one is no longer among the open cards', (await cards('#stu-hw-list > .hw-card')).length === 9);
  await cardBtn('Hold the draw');
  await sleep(500);
  at = await play();
  check('F. that position, as White, at level 1', at.startFen === FEN_DRAW && at.color === 'w' && at.level === 0 && at.hwId === 'p2', at);
  await move('f1f7');
  await sleep(600);
  r = await done('p2', 'Hold the draw');
  check('F. stalemate: done all the same', r.ok, r);
  check('F. what is saved: a draw, by stalemate', same(r.h.game, { outcome: 'draw', end: 'stalemate', moves: 'f1f7' }), r.h.game);

  // G. A lost game finishes it: Black, so the computer moves first, and mates.
  await toStudents();
  await cardBtn('Defend');
  at = await play();                              // the computer may already have mated: no hwId here
  check('G. as Black at the top level: the board is turned and the computer moves first', at.startFen === FEN_LOSS && at.color === 'b' && at.level === 7 && at.orient === 'b', at);
  await until(`__app.Play.over`, 60000);
  await sleep(600);
  r = await done('p3', 'Defend');
  check('G. mated: done all the same', r.ok, r);
  check('G. what is saved: lost, by checkmate, the computer\'s one move', r.h.game && r.h.game.outcome === 'loss' && r.h.game.end === 'checkmate' && /^e7[a-h][1-8]$/.test(r.h.game.moves), r.h.game);
  await shot('flow-G-lost');

  // H. Resigning finishes it; no taking back on the way.
  await toStudents();
  await cardBtn('Resign me');
  await sleep(500);
  await move('e2e4');
  await myTurn(2);
  at = await play();
  check('H. my move and the computer\'s reply are on the board', at.plies === 2 && at.turn === 'w' && !at.over, at);
  await ev(`__app.Play.undo();`);
  at = await play();
  check('H. Undo is not there, and calling it takes nothing back', !at.undo && at.plies === 2, at);
  await tap('#play-resign');
  await yes();
  r = await done('p4', 'Resign me');
  check('H. resigned: done all the same', r.ok, r);
  check('H. what is saved: lost, by resignation, the two moves', r.h.game && r.h.game.outcome === 'loss' && r.h.game.end === 'resign' && /^e2e4 [a-h][1-8][a-h][1-8]$/.test(r.h.game.moves), r.h.game);

  // I. A game left in the middle leaves it open, and the card starts it again.
  await toStudents();
  await cardBtn('Leave me');
  await myTurn(1);
  at = await play();
  check('I. as Black from the start: the computer has moved first', at.color === 'b' && at.plies === 1 && at.turn === 'b' && at.level === 0 && at.hwId === 'p5', at);
  await move('e7e5');
  await myTurn(3);
  await tap('#play-back');
  await sleep(500);
  at = await play();
  let h = await hw('p5');
  check('I. Back in the middle: the homework is still open, nothing saved as finished', h.status === 'open' && !h.done && h.game === undefined && (await ev(`return __saves.filter(x => x.id === 'p5').length;`)) === 0, h);
  check('I. no "Homework done!", and the Play tab is back on its own choices', !(await toastText()).includes('Homework') && at.setup && !at.game && at.hwId === null, { at, said: await toastText() });
  // The Play tab's own Start is an ordinary game.
  await tap('#play-start');
  await sleep(500);
  at = await play();
  check('I. Start on the Play tab is an ordinary game: not homework, Undo is back', at.game && at.hwId === null && at.undo && at.startFen === START, at);
  // …and with it on the board, the card starts the homework game over it.
  await toStudents();
  check('I. the card is still there with "Play"', same((await cards('#stu-hw-list > .hw-card')).find(c => c.text.includes('Leave me')).btns, ['Play']));
  await cardBtn('Leave me');
  await myTurn(1);
  at = await play();
  check('I. it starts again from the position, not where I left it', at.plies === 1 && at.color === 'b' && at.hwId === 'p5' && at.startFen === START && !at.undo, at);
  await tap('#play-resign');
  await yes();
  r = await done('p5', 'Leave me');
  check('I. finished this time: done', r.ok && r.h.game.outcome === 'loss' && r.h.game.end === 'resign', r);
  await toStudents();
  await ev(`const d = document.querySelector('#stu-hw-list .hw-done-list'); d.open = true; d.scrollIntoView({ block: 'center' });`);
  await sleep(300);
  const doneRows = await cards('#stu-hw-list .hw-done-list .hw-card');
  check('I. all five positions are under "done", with no button to play them again', doneRows.length === 5 && doneRows.every(c => c.btns.length === 0), doneRows.map(c => c.text.split('\n')[0]));
  await shot('flow-I-under-done');

  // J. I open Marco's game on a board.
  await openPage();
  await tapX(`[...document.querySelectorAll('.hw-teacher .hw-card')].find(c => c.textContent.includes('Mate the king')).querySelector('.hw-game')`);
  await sleep(600);
  let g = await ev(`const A = __app.Analysis; return { screen: ${on('screen-analysis')}, modals: document.querySelectorAll('.modal-back').length, fen: A.tree.fen(),
    white: A.tree.headers ? A.tree.headers.White : undefined, moves: document.getElementById('ana-moves') ? document.getElementById('ana-moves').innerText : '' };`);
  check('J. "Open game" on the card closes the page and opens the Analysis board on the last move: mate', g.screen && g.modals === 0 && g.fen.startsWith('Q5k1/8/6K1/8/8/8/8/8 b'), g);
  await shot('flow-J-game-on-board');
  await toStudents();
  await ev(`__stu.finNew = [{ id: 'g2', studentUid: 's_uid', title: 'Do not stalemate', kind: 'position', doneMs: Date.now(), seen: false }]; __stu.render();`);
  await tap('#stu-fin-list .fin-row');
  await until(`document.querySelector('.hwr-sheet .hw-game')`);
  await tapX(`document.querySelector('.hwr-sheet .hw-game')`);
  await sleep(600);
  g = await ev(`const A = __app.Analysis; return { screen: ${on('screen-analysis')}, modals: document.querySelectorAll('.modal-back').length, fen: A.tree.fen() };`);
  check('J. and from the finished strip: the drawn game, on its last move', g.screen && g.modals === 0 && g.fen.startsWith('7k/5Q2/6K1/8/8/8/8/8 b'), g);

  // K. The five older kinds, sent before, still show and still complete.
  await toStudents();
  const bar = () => ev(`return document.getElementById('puzzle-hw').innerText.replace(/\\s+/g, ' ');`);
  const left = await cards('#stu-hw-list > .hw-card');
  const OLD = ['Opera', 'Tuesday', 'One puzzle', 'Lucena', 'Key Squares'];
  check('K. Task, List, Puzzles, Chapter and Endgame are the five cards left', left.length === 5 && OLD.every(t => left.some(c => c.text.includes(t))), left.map(c => c.text.split('\n')[0]));
  check('K. each still has its own button', same(OLD.map(t => left.find(c => c.text.includes(t)).btns[0]), ['Mark done', 'Start', 'Start', 'Open', 'Open']), left.map(c => c.btns));
  const st = async id => (await hw(id)).status;
  await cardBtn('One puzzle');
  await until(`!document.getElementById('puzzle-hw').classList.contains('hidden') && __app.Puzzles.current`, 15000);
  check('K. Puzzles starts: 0/1', (await bar()).includes('0/1'), await bar());
  await ev(SOLVE);
  await sleep(500);
  check('K. one solved, the Puzzles homework is done', (await st('k3')) === 'done');
  await ev(`document.getElementById('puzzle-hw-exit')?.click(); __app.showScreen('students');`);
  await sleep(400);
  await cardBtn('Puzzles from Tuesday');
  await until(`!document.getElementById('puzzle-hw').classList.contains('hidden') && __app.Puzzles.current`);
  await ev(SOLVE);
  await sleep(400);
  await ev(`await __app.Puzzles.nextPuzzle();`);
  await sleep(300);
  await ev(SOLVE);
  await sleep(500);
  check('K. both solved, the List is done', (await st('k2')) === 'done');
  await ev(`document.getElementById('puzzle-hw-exit')?.click(); __app.showScreen('students');`);
  await sleep(400);
  await cardBtn('Replay the Opera Game');
  await yes();
  await sleep(600);
  check('K. the Task is ticked off', (await st('k1')) === 'done');
  // The chapter lives in Firestore, which a signed-out browser cannot read:
  // the class is stood in for, and the "last move reached" call is made here.
  await ev(`const { Masterclass } = await import('/js/masterclass.js'); Masterclass.openForHomework = async () => 'ok';`);
  await cardBtn('The Lucena chapter');
  await sleep(400);
  await ev(`const root = { parent: null, children: [] }, n = { parent: root, children: [] }; root.children.push(n);
    __stu.hwChapterStep('mc1', 'ch1', { current: n });`);
  await sleep(300);
  check('K. reaching its last move finishes the Chapter', (await st('k4')) === 'done');
  await toStudents();
  await cardBtn('Key Squares for Friday');
  await sleep(500);
  await tap('#endgame-practice-start');
  await sleep(300);
  for (const [i, u] of ['e6f6', 'f6g7', 'f5f6', 'f6f7'].entries()) {
    await ev(`await __app.Endgame.userMove({ from: '${u.slice(0, 2)}', to: '${u.slice(2, 4)}' });`);
    if (i < 3) await until(`__app.Endgame.moveIdx === ${2 * i + 2} && __app.Endgame.board.interactive`, 6000);
  }
  await sleep(600);
  check('K. its practice solved, the Endgame is done', (await st('k5')) === 'done');
  check('K. nothing is left open', (await ev(`return __stu.homework.filter(x => x.status === 'open').length;`)) === 0);
} catch (e) { failed = true; console.error('\nSTOPPED: ' + e.message); }

const bad = checks.filter(c => !c.ok);
console.log(`\n${checks.length - bad.length} of ${checks.length} checks passed${bad.length ? ' — FAILED: ' + bad.map(c => c.name).join(' | ') : ''}`);
// App Check cannot answer on localhost (403), sw.js is refused on purpose (404),
// and the writes have no user to write as.
const other = errors.filter(e => !/firebaseappcheck|AppCheck|app-check|bad HTTP response code \(404\) was received when fetching the script|status of 403|Marking homework done failed|Saving homework progress failed|permission|Missing or insufficient/i.test(e));
console.log(other.length ? `Console errors (${other.length}):\n  ` + [...new Set(other)].join('\n  ') : 'No console errors (other than App Check, the refused service worker and the signed-out write).');
chrome.kill();
server.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(failed || bad.length ? 1 : 0);
