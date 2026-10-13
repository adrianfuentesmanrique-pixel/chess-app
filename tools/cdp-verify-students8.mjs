// The ♟ Endgame homework (v217): the third button of the assign sheet, the
// student's card, and what finishes it. Dev tool, not shipped. Headless Chrome
// over CDP at 375 x 812, signed out, no service worker.
//
//   node tools/cdp-verify-students8.mjs <outDir>     about three minutes
//
// The skeleton (server, Chrome, tapX, load) is tools/cdp-verify-students7.mjs's.
// EVERYTHING signed-in is SEEDED: Firestore is unreachable from localhost (App
// Check), so nothing is written. What the sheet would send is read from
// assignSheet()'s own promise; the write itself is proved by test:rules.
// REALLY TAPPED: the student's card, the finished strip, Assign homework, the
// three kind buttons, Send, the homework cards' buttons, Walk me through,
// Practice, Resign and its Yes, Back, the Learn tab's lists, Mark done and Yes.
// CALLED, not tapped: Endgame.userMove() and Puzzles.userMove() with the moves,
// showScreen(), Students.hwChapterStep() for the chapter's last move.
// SET by script: the two pickers' values (a native <select> opens an OS list
// that CDP cannot tap), the title, the note and the date.
// STOOD IN FOR: Masterclass.openForHomework (the chapter is in Firestore).
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
if (!OUT) { console.error('usage: node tools/cdp-verify-students8.mjs <outDir>'); process.exit(1); }
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9100 + Math.floor(Math.random() * 90);
const WEB = 8700 + Math.floor(Math.random() * 90);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-stu8-'));
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 420000).unref();

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

// I am the teacher of Marco and the student of Coach Elena. Marco has three
// endgames from me (one finished, one open, one the app no longer has); I
// have three from Elena, and one of each older kind, all sent before.
const seed = () => ev(`
  const { Students } = await import('/js/students.js');
  const { packPuzzle } = await import('/js/firebase.js');
  __app.showScreen('base');
  await Students.load();
  const now = Date.now(), T = 't_uid', S = 's_uid', ME = 'me_uid';
  const lib = await (await fetch('/puzzles/puzzles-3.json')).json();
  const two = lib.slice(0, 2), packed = two.map(packPuzzle);
  const given = [
    { id: 'g1', teacherUid: ME, studentUid: S, kind: 'endgame', title: 'Rook vs. Pawn', params: { endgameId: 'r1' },
      status: 'done', done: 1, seconds: 250, tries: 3, mistakes: 1, completedAt: now - 2 * 3600e3, doneMs: now - 2 * 3600e3, createdAt: now - 2 * 86400e3 },
    { id: 'g2', teacherUid: ME, studentUid: S, kind: 'endgame', title: 'For Friday', params: { endgameId: 'p1' },
      status: 'open', done: 0, seconds: 40, tries: 1, createdAt: now - 3600e3 },
    { id: 'g3', teacherUid: ME, studentUid: S, kind: 'endgame', title: 'An old endgame', params: { endgameId: 'zz99' },
      status: 'open', done: 0, seconds: 0, createdAt: now - 7200e3 },
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
      activeTime: {}, hwOpen: 2, hwDone: 1, updatedAt: now - 3600e3 } },
    doneSeen: { [S]: 1 }, hwSeen: [],
    hwGiven: { [S]: given },
    finNew: [{ id: 'g1', studentUid: S, title: given[0].title, kind: 'endgame', doneMs: now - 2 * 3600e3, seen: false }],
    finSeenAt: now - 4 * 3600e3,
    hwDraft: {},
    homework: [
      mine('e1', 'endgame', 'The Pawn Is on the Sixth Rank', { endgameId: 'p2' }, { dueDate: '2026-10-20' }),
      mine('e2', 'endgame', 'An old endgame', { endgameId: 'zz99' }),
      mine('e3', 'endgame', 'For Friday', { endgameId: 'p3' }),
      mine('k1', 'text', 'Replay the Opera Game', {}),
      mine('k2', 'list', 'Puzzles from Tuesday', { puzzles: packed }, { doneIds: [] }),
      mine('k3', 'puzzles', 'One puzzle', { themes: [], minRating: 1000, maxRating: 1600, count: 1 }),
      mine('k4', 'chapter', 'The Lucena chapter', { mcId: 'mc1', chapterId: 'ch1' }),
    ],
  });
  // With a seeded uid and no Firebase user, load() would fetch empty lists
  // and wipe this seed. Test only: from here on "load" just redraws.
  Students.load = async () => { Students.render(); };
  Students.paintDot();
  __app.showScreen('students');
  Students.render();`);
const openPage = async () => { await tap('#stu-list .stu-card.tappable'); await until(`document.querySelector('.stu-page')`); };
const openSheet = async () => { await tap('.hw-teacher .btn-wide'); await until(`document.querySelector('.hw-sheet')`); };
const sheetState = () => ev(`const s = document.querySelector('.hw-sheet'); if (!s) return null;
  const vis = q => { const e = s.querySelector(q); return !!e && !e.classList.contains('hidden') && e.getBoundingClientRect().height > 0; };
  const btns = q => [...s.querySelectorAll(q + ' button')].map(b => ({ v: b.dataset.v, text: b.textContent, on: b.classList.contains('on'),
    cut: b.scrollWidth > b.clientWidth, h: Math.round(b.getBoundingClientRect().height) }));
  const opts = q => [...s.querySelectorAll(q + ' option')].map(o => ({ v: o.value, text: o.textContent }));
  const box = s.getBoundingClientRect();
  return { kinds: btns('.hw-kind'), mode: vis('.hw-mode'), pz: vis('.hw-pz'), ls: vis('.hw-ls'), ch: vis('.hw-ch'), eg: vis('.hw-eg'),
    cats: opts('.hw-egc'), egs: opts('.hw-egs'), cat: s.querySelector('.hw-egc').value, pick: s.querySelector('.hw-egs').value,
    labels: [...s.querySelectorAll('.hw-eg .hw-label')].map(l => l.childNodes[0].textContent),
    selFits: [...s.querySelectorAll('.hw-eg select')].every(e => e.getBoundingClientRect().right <= box.right + 1),
    wide: s.scrollWidth > s.clientWidth };`);
const cards = sel => ev(`return [...document.querySelectorAll(${JSON.stringify(sel)})].map(c => ({ text: c.innerText,
  btns: [...c.querySelectorAll('.fr-actions .btn')].map(b => b.textContent), wide: c.scrollWidth > c.clientWidth }));`);
const hw = id => ev(`const h = __stu.homework.find(x => x.id === ${JSON.stringify(id)}); return h ? { status: h.status, done: h.done, tries: h.tries, mistakes: h.mistakes } : null;`);
const myCard = text => `[...document.querySelectorAll('#stu-hw-list > .hw-card')].find(c => c.textContent.includes(${JSON.stringify(text)}))`;
const cardBtn = text => tapX(`${myCard(text)}.querySelector('.fr-actions .btn')`);
const where = () => ev(`const E = __app.Endgame; const on = id => !document.getElementById(id).classList.contains('hidden');
  return { screen: on('screen-endgame'), viewer: on('endgame-viewer-view'), id: E.current && E.current.id, mode: E.mode, over: E.over,
    title: document.getElementById('endgame-pos-title').innerText, status: document.getElementById('endgame-status').textContent,
    run: __stu.hwRun ? { id: __stu.hwRun.id, kind: __stu.hwRun.kind } : null };`);
// One move through Endgame.userMove, the board's own path.
const move = uci => ev(`await __app.Endgame.userMove({ from: '${uci.slice(0, 2)}', to: '${uci.slice(2, 4)}'${uci[4] ? `, promotion: '${uci[4]}'` : ''} });`);
// Solves the puzzle on the board through Puzzles.userMove.
const SOLVE = `const P = __app.Puzzles, sl = ms => new Promise(r => setTimeout(r, ms));
  await sl(900);
  const p = P.current;
  while (P.current === p && P.moveIdx < p.moves.length) {
    const u = p.moves[P.moveIdx];
    await P.userMove({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    await sl(500);
  }
  return p.id;`;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const P2 = { en: 'The Pawn Is on the Sixth Rank', es: 'El peón está en la sexta fila' };
const W = {
  en: { kinds: ['🧩 Puzzles', '📖 Chapter', '♟ Endgame', '🤖 Position'], labels: ['Endgame type', 'Endgame'], cats: ['Pawn', 'Rook'],
    what: `Endgame: ${P2.en} — solve it in Practice`, whatT: 'Endgame: Rook vs. Pawn — done when they solve it in Practice',
    gone: 'This endgame is no longer available. You can mark it done.', goneT: 'This endgame is no longer in the app. The student can mark it done.',
    open: 'Open', mark: 'Mark done', detail: '3 tries · 1 mistake', one: '1 try', results: 'Results' },
  es: { kinds: ['🧩 Problemas', '📖 Capítulo', '♟ Final', '🤖 Posición'], labels: ['Tipo de final', 'Final'], cats: ['Peones', 'Torres'],
    what: `Final: ${P2.es} — resuélvelo en Practicar`, whatT: 'Final: Torre contra peón — hecho cuando lo resuelve en Practicar',
    gone: 'Este final ya no está disponible. Puedes marcarlo como hecho.', goneT: 'Este final ya no está en la app. El alumno puede marcarlo como hecho.',
    open: 'Abrir', mark: 'Marcar hecha', detail: '3 intentos · 1 error', one: '1 intento', results: 'Resultados' },
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
      const names = await ev(`const { ENDGAMES } = await import('/js/endgames-data.js'); const g = id => ENDGAMES.find(e => e.id === id);
        return { r1: g('r1').name['${lang}'], p1: g('p1').name['${lang}'] + ' — ' + g('p1').subtitle['${lang}'], p1dot: g('p1').name['${lang}'] + ' · ' + g('p1').subtitle['${lang}'], p3: g('p3').name['${lang}'] };`);
      if (lang === 'es') w.whatT = `Final: ${names.r1} — hecho cuando lo resuelve en Practicar`;

      // The student's side.
      const mine = await cards('#stu-hw-list > .hw-card');
      const by = t => mine.find(c => c.text.includes(t));
      check(`${tag}: all seven of my homework show (3 endgames, Task, List, Puzzles, Chapter)`, mine.length === 7, mine.map(c => c.text.split('\n')[0]));
      check(`${tag}: the endgame card says what it is, naming the endgame`, by(P2.en) && by(P2.en).text.includes(w.what) && by(P2.en).text.includes('♟'), by(P2.en));
      check(`${tag}: its one button is "${w.open}"`, by(P2.en) && same(by(P2.en).btns, [w.open]), by(P2.en) && by(P2.en).btns);
      check(`${tag}: a title I typed still shows which endgame it is`, by('For Friday') && by('For Friday').text.includes(names.p3), by('For Friday'));
      check(`${tag}: an endgame the app no longer has says so, with "${w.mark}"`, by('An old endgame') && by('An old endgame').text.includes(w.gone) && same(by('An old endgame').btns, [w.mark]), by('An old endgame'));
      check(`${tag}: no card is wider than the screen`, mine.every(c => !c.wide));
      await ev(`document.getElementById('stu-hw').scrollIntoView({ block: 'start' });`);
      await sleep(200);
      await shot(`${tag}-1-student-side`);

      // The teacher's finished strip, and how it went.
      const fin = await ev(`return [...document.querySelectorAll('#stu-fin-list .fin-row')].map(r => r.innerText);`);
      check(`${tag}: the finished strip shows Marco's endgame`, fin.length === 1 && fin[0].includes('Rook vs. Pawn'), fin);
      await tap('#stu-fin-list .fin-row');
      await until(`document.querySelector('.hwr-sheet')`);
      const res = await ev(`return document.querySelector('.hwr-sheet').innerText;`);
      check(`${tag}: tapping it opens how it went: "${w.detail}"`, res.includes(w.detail) && res.includes(w.whatT), res);
      await shot(`${tag}-2-how-it-went`);
      await closeModals();

      // The student's page.
      await openPage();
      const page = await cards('.hw-teacher .hw-card');
      const pg = t => page.find(c => c.text.includes(t));
      check(`${tag}: Marco's page lists the three endgames I sent`, page.length === 3, page.map(c => c.text));
      check(`${tag}: the finished one says "${w.detail}"`, pg('Rook vs. Pawn') && pg('Rook vs. Pawn').text.includes(w.detail) && pg('Rook vs. Pawn').text.includes(w.whatT), pg('Rook vs. Pawn'));
      check(`${tag}: the open one says "${w.one}", names the endgame with its subtitle, and no mistakes yet`, pg('For Friday') && pg('For Friday').text.includes(w.one) && pg('For Friday').text.includes(names.p1dot) && !/error|mistake/i.test(pg('For Friday').text), pg('For Friday'));
      check(`${tag}: the one the app no longer has says so to the teacher`, pg('An old endgame') && pg('An old endgame').text.includes(w.goneT), pg('An old endgame'));
      check(`${tag}: an endgame has no "${w.results}" button, and no card is too wide`, page.every(c => c.btns.length === 1 && !c.wide), page.map(c => c.btns));
      await ev(`document.querySelector('.hw-teacher').scrollIntoView({ block: 'start' });`);
      await sleep(200);
      await shot(`${tag}-3-teacher-page`);

      // The sheet.
      await openSheet();
      let s = await sheetState();
      // Four since v218 (🤖 Position), two by two: was "three buttons" on "one line".
      check(`${tag}: the sheet has four buttons: Puzzles, Chapter, Endgame, Position`, same(s.kinds.map(b => b.text), w.kinds) && same(s.kinds.map(b => b.v), ['puzzles', 'chapter', 'endgame', 'position']), s.kinds);
      check(`${tag}: the four are the same height, nothing cut, nothing wider than the sheet`, s.kinds.every(b => !b.cut && b.h < 48 && b.h === s.kinds[0].h) && !s.wide, s.kinds);
      check(`${tag}: it still opens on Puzzles, by theme and level`, s.kinds[0].on && s.mode && s.pz && !s.eg && !s.ch && !s.ls, s);
      await shot(`${tag}-4-sheet`);
      await tapX(`document.querySelector('.hw-kind button[data-v="endgame"]')`);
      s = await sheetState();
      check(`${tag}: Endgame shows its two pickers and hides the switch and the other forms`, s.eg && !s.mode && !s.pz && !s.ch && !s.ls && s.kinds[2].on, s);
      check(`${tag}: the pickers are labelled "${w.labels.join('" and "')}"`, same(s.labels, w.labels), s.labels);
      check(`${tag}: six categories in my language, the first two "${w.cats.join('", "')}"`, s.cats.length === 6 && same(s.cats.slice(0, 2).map(c => c.text), w.cats), s.cats);
      check(`${tag}: the pawn endgames, by name and subtitle`, s.egs.length === 54 && s.egs[0].v === 'p1' && s.egs[0].text === names.p1, s.egs.slice(0, 2));
      check(`${tag}: the pickers stay inside the sheet`, s.selFits && !s.wide, s);
      await shot(`${tag}-5-sheet-endgame`);
      await ev(`const c = document.querySelector('.hw-egc'); c.value = 'rook'; c.dispatchEvent(new Event('change'));`);
      s = await sheetState();
      check(`${tag}: another category brings its own endgames`, s.egs.length === 121 && s.egs[0].v === 'r1' && s.egs[0].text.startsWith(names.r1), s.egs.slice(0, 2));
      await tapX(`document.querySelector('.hw-kind button[data-v="chapter"]')`);
      s = await sheetState();
      check(`${tag}: Chapter hides the endgame pickers`, s.ch && !s.eg && !s.mode, s);
      await tapX(`document.querySelector('.hw-kind button[data-v="puzzles"]')`);
      s = await sheetState();
      check(`${tag}: and Puzzles brings the switch back`, s.mode && s.pz && !s.eg && !s.ch, s);
      await closeModals();

      // The student's button lands on exactly that endgame.
      await ev(`__app.showScreen('students');`);
      await sleep(300);
      await cardBtn(P2.en);
      await sleep(500);
      const at = await where();
      check(`${tag}: "${w.open}" lands in Learn on exactly that endgame`, at.screen && at.viewer && at.id === 'p2' && at.title.includes(P2[lang]) && at.mode === 'study', at);
      await shot(`${tag}-6-landed`);
    }
  }

  // ── The real flows (English, light) ──
  console.log('… flows');
  await load('en', 'light');
  await seed();
  await sleep(300);
  errors.length = 0;

  // D. Assigning.
  await openPage();
  await openSheet();
  await tapX(`document.querySelector('.hw-kind button[data-v="endgame"]')`);
  await ev(`const c = document.querySelector('.hw-egc'); c.value = 'rook'; c.dispatchEvent(new Event('change'));
    document.querySelector('.hw-egs').value = 'r1'; document.querySelector('.hw-due').value = '2026-10-20';
    document.querySelector('.hw-note-in').value = 'Cut the king off first';`);
  await tapX(`${top}.querySelector('.row .btn.primary')`);
  await sleep(500);
  const d1 = await ev(`return __specs.pop();`);
  check('D. Send hands over kind "endgame" with the same five fields as the other kinds', d1 && d1.kind === 'endgame' && same(Object.keys(d1).sort(), ['dueDate', 'kind', 'note', 'params', 'title']), d1);
  check('D. its params are exactly the id of the endgame picked', d1 && same(d1.params, { endgameId: 'r1' }), d1 && d1.params);
  check('D. the title is the endgame\'s name, the note and the date are kept', d1 && d1.title === 'Rook vs. Pawn' && d1.note === 'Cut the king off first' && d1.dueDate === '2026-10-20', d1);
  await closeModals();
  await openPage();
  await openSheet();
  await tapX(`document.querySelector('.hw-kind button[data-v="endgame"]')`);
  await ev(`document.querySelector('.hw-title').value = 'For Friday';`);
  await tapX(`${top}.querySelector('.row .btn.primary')`);
  await sleep(500);
  const d2 = await ev(`return __specs.pop();`);
  check('D. a title I type is kept, and the first endgame of the first category is the default', d2 && d2.title === 'For Friday' && same(d2.params, { endgameId: 'p1' }) && d2.dueDate === '' && d2.note === '', d2);
  await closeModals();

  // E. The walk-through is not solving.
  await ev(`__app.showScreen('students');`);
  await sleep(300);
  await cardBtn(P2.en);
  await sleep(500);
  let at = await where();
  check('E. opened from the card: endgame p2, and the homework is the one running', at.id === 'p2' && at.run && at.run.id === 'e1' && at.run.kind === 'endgame', at);
  await tap('#endgame-walk-btn');
  const walked = await ev(`const E = __app.Endgame, w = E.walker, line = E.current.moves, sl = ms => new Promise(r => setTimeout(r, ms));
    for (const t0 = Date.now(); w.active && w.idx < line.length && Date.now() - t0 < 30000;) {
      if (!w.busy && w.isMine(w.idx) && E.board.interactive) { const u = line[w.idx]; await E.userMove({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); }
      await sl(200);
    }
    await sl(1500);
    return { idx: w.idx, n: line.length };`);
  let h = await hw('e1');
  check('E. the walk-through played to its last move leaves the homework open, with no try counted', walked.idx === walked.n && h.status === 'open' && !h.tries && !h.done, { walked, h });
  check('E. and says nothing about homework', !(await toastText()).includes('Homework'), await toastText());

  // F. A failed practice leaves it open.
  const reopen = async () => {                    // Back to the list, then the same endgame again
    await tap('#endgame-back-pos');
    await sleep(300);
    await tapX(`[...document.querySelectorAll('#endgame-pos-list .list-item')].find(b => b.textContent.includes(${JSON.stringify(P2.en)}))`);
    await sleep(400);
  };
  await reopen();
  await tap('#endgame-practice-start');
  await sleep(300);
  h = await hw('e1');
  check('F. starting the practice counts one try', h.tries === 1 && h.status === 'open', h);
  await tap('#endgame-resign');
  await until(`${top} && ${top}.querySelector('.btn.danger')`);
  await tapX(`${top}.querySelector('.btn.danger')`);
  await sleep(600);
  at = await where();
  h = await hw('e1');
  check('F. resigned: the practice says it did not work out', at.over && at.status.includes("Didn't work out"), at);
  check('F. the homework is still open, one try, nothing about mistakes', h.status === 'open' && h.tries === 1 && !h.done && h.mistakes === undefined, h);
  check('F. and no "Homework done!"', !(await toastText()).includes('Homework'), await toastText());

  // G. A practice that ends well, with one wrong move on the way, finishes it.
  await reopen();
  await tap('#endgame-practice-start');
  await sleep(300);
  await move('g6h5');                             // gives the pawn away: the engine refuses it
  await until(`!__app.Endgame.thinking`, 20000);
  const slip = await ev(`const E = __app.Endgame; return { mistakes: E.mistakes, book: E.bookMode, fen: E.chess.fen() };`);
  check('G. a wrong move is taken back and counted as a mistake', slip.mistakes === 1 && slip.book && slip.fen.startsWith('5k2/8/5PK1'), slip);
  await move('f6f7');
  await until(`__app.Endgame.moveIdx === 2 && __app.Endgame.board.interactive`, 6000);
  await move('g6g7');
  await sleep(600);
  at = await where();
  h = await hw('e1');
  const said = await toastText();
  check('G. the line played to its end: the practice is a success', at.over && at.status.includes('converted'), at);
  check('G. the homework is done: 2 tries, 1 mistake', h.status === 'done' && h.done === 1 && h.tries === 2 && h.mistakes === 1, h);
  check('G. it says "Homework done!" with the title, and nothing is left running', said.includes('Homework done!') && said.includes(P2.en) && at.run === null, { said, run: at.run });
  await shot('flow-G1-solved');
  await ev(`__app.showScreen('students');`);
  await sleep(400);
  await ev(`const d = document.querySelector('#stu-hw-list .hw-done-list'); d.open = true; d.scrollIntoView({ block: 'center' });`);
  await sleep(300);
  const doneRows = await cards('#stu-hw-list .hw-done-list .hw-card');
  check('G. it moved under "done", saying "2 tries · 1 mistake"', doneRows.length === 1 && doneRows[0].text.includes(P2.en) && doneRows[0].text.includes('2 tries · 1 mistake'), doneRows);
  check('G. and is no longer among the open cards', (await cards('#stu-hw-list > .hw-card')).length === 6);
  await shot('flow-G2-under-done');

  // H. Reached through the Learn tab instead of the card: it counts the same.
  await ev(`__app.showScreen('endgame'); __app.Endgame.showSections();`);
  await sleep(300);
  await tapX(`[...document.querySelectorAll('#endgame-section-list .list-item')].find(b => b.textContent.includes('Endings'))`);
  await sleep(300);
  await tapX(`document.querySelectorAll('#endgame-cat-list .list-item')[0]`);
  await sleep(300);
  await tapX(`[...document.querySelectorAll('#endgame-pos-list .list-item')].find(b => b.textContent.includes('Key Squares'))`);
  await sleep(400);
  at = await where();
  check('H. walked to "Key Squares" through the Learn tab: nothing is running yet', at.id === 'p3' && at.run === null, at);
  await tap('#endgame-practice-start');
  await sleep(300);
  for (const [i, u] of ['e6f6', 'f6g7', 'f5f6', 'f6f7'].entries()) {
    await move(u);
    if (i < 3) await until(`__app.Endgame.moveIdx === ${2 * i + 2} && __app.Endgame.board.interactive`, 6000);
  }
  await sleep(600);
  h = await hw('e3');
  check('H. solved without a slip: that homework is done too, 1 try, 0 mistakes', h.status === 'done' && h.tries === 1 && h.mistakes === 0, h);
  check('H. "Homework done!" names my teacher\'s title', (await toastText()).includes('Homework done!') && (await toastText()).includes('For Friday'), await toastText());
  await ev(`__app.showScreen('students');`);
  await sleep(400);
  await ev(`const d = document.querySelector('#stu-hw-list .hw-done-list'); d.open = true;`);
  check('H. under "done" it says "1 try · no mistakes"', (await cards('#stu-hw-list .hw-done-list .hw-card')).some(c => c.text.includes('For Friday') && c.text.includes('1 try · no mistakes')));

  // I. An endgame the app no longer has is ticked off, as a deleted chapter is.
  const yes = async () => { await until(`${top} && ${top}.querySelector('.btn.danger')`); await tapX(`${top}.querySelector('.btn.danger')`); await sleep(1500); };
  await cardBtn('An old endgame');
  await sleep(300);
  const ask = await ev(`const m = ${top}; return m ? m.innerText : '';`);
  check('I. "Mark done" on the unavailable endgame asks first, naming it', ask.includes('An old endgame'), ask);
  await yes();
  check('I. after Yes it is done', (await hw('e2')).status === 'done' && (await toastText()).includes('An old endgame'), await hw('e2'));

  // J. The four older kinds, sent before, still show and still complete.
  const bar = () => ev(`return document.getElementById('puzzle-hw').innerText.replace(/\\s+/g, ' ');`);
  const left = await cards('#stu-hw-list > .hw-card');
  check('J. Task, List, Puzzles and Chapter are the four cards left', left.length === 4 && ['Opera', 'Tuesday', 'One puzzle', 'Lucena'].every(t => left.some(c => c.text.includes(t))), left.map(c => c.text.split('\n')[0]));
  check('J. each still has its own button', same(['Opera', 'Tuesday', 'One puzzle', 'Lucena'].map(t => left.find(c => c.text.includes(t)).btns[0]), ['Mark done', 'Start', 'Start', 'Open']), left.map(c => c.btns));
  await cardBtn('One puzzle');
  await until(`!document.getElementById('puzzle-hw').classList.contains('hidden') && __app.Puzzles.current`, 15000);
  check('J. Puzzles starts: 0/1', (await bar()).includes('0/1'), await bar());
  await ev(SOLVE);
  await sleep(500);
  check('J. one solved, the Puzzles homework is done', (await hw('k3')).status === 'done', await hw('k3'));
  await ev(`document.getElementById('puzzle-hw-exit')?.click(); __app.showScreen('students');`);
  await sleep(400);
  await cardBtn('Puzzles from Tuesday');
  await until(`!document.getElementById('puzzle-hw').classList.contains('hidden') && __app.Puzzles.current`);
  check('J. the List starts: 0/2', (await bar()).includes('0/2'), await bar());
  await ev(SOLVE);
  await sleep(400);
  await ev(`await __app.Puzzles.nextPuzzle();`);
  await sleep(300);
  await ev(SOLVE);
  await sleep(500);
  check('J. both solved, the List is done', (await hw('k2')).status === 'done', await hw('k2'));
  await ev(`document.getElementById('puzzle-hw-exit')?.click(); __app.showScreen('students');`);
  await sleep(400);
  await cardBtn('Replay the Opera Game');
  await yes();
  check('J. the Task is ticked off', (await hw('k1')).status === 'done', await hw('k1'));
  // The chapter lives in Firestore, which a signed-out browser cannot read:
  // the class is stood in for, and the "last move reached" call is made here.
  await ev(`const { Masterclass } = await import('/js/masterclass.js'); Masterclass.openForHomework = async () => 'ok';`);
  await cardBtn('The Lucena chapter');
  await sleep(400);
  const armed = await ev(`const r = __stu.hwRun; return r ? { kind: r.kind, armed: r.armed, mcId: r.mcId } : null;`);
  check('J. the Chapter\'s "Open" starts its run', armed && armed.kind === 'chapter' && armed.armed && armed.mcId === 'mc1', armed);
  await ev(`const root = { parent: null, children: [] }, n = { parent: root, children: [] }; root.children.push(n);
    __stu.hwChapterStep('mc1', 'ch1', { current: n });`);
  await sleep(300);
  check('J. reaching its last move finishes the Chapter', (await hw('k4')).status === 'done' && (await toastText()).includes('Lucena'), await hw('k4'));
  check('J. nothing is left open', (await ev(`return __stu.homework.filter(x => x.status === 'open').length;`)) === 0);
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
