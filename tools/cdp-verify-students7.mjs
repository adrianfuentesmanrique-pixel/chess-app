// The assign-homework sheet after v215: Puzzles and Chapter (and, since v217,
// Endgame: tools/cdp-verify-students8.mjs), and
// inside Puzzles a switch "by theme and level" / "chosen by me" (what the List
// button was). Task is no longer offered. Dev tool, not shipped. Headless
// Chrome over CDP at 375 x 812, signed out, no service worker.
//
//   node tools/cdp-verify-students7.mjs <outDir>     about two minutes
//
// It serves this folder itself and counts its checks (the older students
// tools only print). EVERYTHING signed-in is SEEDED, as in tools/stu6-seed.js:
// Firestore is unreachable from localhost (App Check), so nothing is written.
// What the sheet would send is read from assignSheet()'s own promise.
// REALLY TAPPED: the student's card, Assign homework, both kind buttons, both
// sides of the switch, theme chips, Remove, Send, "Go to Puzzles", "Send
// puzzle list", a dot of the session strip, "Give to a student", Start, Mark
// done and its Yes.
// CALLED, not tapped: Puzzles.userMove() with the puzzle's own moves,
// Puzzles.nextPuzzle(), showScreen(). SET by script: the "how many" box.
// NOT REACHED here: Firestore itself (no Firebase user), so "arrives" means
// what the sheet hands to the write, and "done" means done on this phone.
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
if (!OUT) { console.error('usage: node tools/cdp-verify-students7.mjs <outDir>'); process.exit(1); }
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9100 + Math.floor(Math.random() * 90);
const WEB = 8700 + Math.floor(Math.random() * 90);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-stu7-'));
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

// I am the teacher of Marco and the student of Coach Elena. Already sent, in
// both directions: a Task and a List (the two kinds the sheet no longer has a
// button for), finished on Marco's side and open on mine.
const seed = () => ev(`
  const { Students } = await import('/js/students.js');
  const { packPuzzle } = await import('/js/firebase.js');
  __app.showScreen('base');
  await Students.load();
  const now = Date.now(), T = 't_uid', S = 's_uid', ME = 'me_uid';
  const lib = await (await fetch('/puzzles/puzzles-3.json')).json();
  const two = lib.slice(0, 2), packed = two.map(packPuzzle);
  const given = [
    { id: 'g1', teacherUid: ME, studentUid: S, kind: 'puzzles', title: '10 puzzles: Fork',
      params: { themes: ['fork'], minRating: 1200, maxRating: 1500, count: 10 }, status: 'open', done: 4, seconds: 300, createdAt: now - 3600e3 },
    { id: 'g2', teacherUid: ME, studentUid: S, kind: 'text', title: 'Replay the Opera Game', params: {},
      status: 'done', done: 1, seconds: 0, completedAt: now - 2 * 3600e3, doneMs: now - 2 * 3600e3, createdAt: now - 2 * 86400e3 },
    { id: 'g3', teacherUid: ME, studentUid: S, kind: 'list', title: 'Puzzles from Tuesday', params: { puzzles: packed },
      doneIds: two.map(p => p.id), status: 'done', done: 2, seconds: 95, completedAt: now - 3 * 3600e3, doneMs: now - 3 * 3600e3, createdAt: now - 86400e3 },
  ];
  Object.assign(Students, {
    uid: ME, loaded: true, failed: false, cachedAt: now,
    asStudent: [{ id: T + '_' + ME, teacherUid: T, studentUid: ME, status: 'active' }],
    asTeacher: [{ id: ME + '_' + S, teacherUid: ME, studentUid: S, status: 'active' }],
    people: { [T]: { uid: T, profileName: 'Coach Elena', username: 'elena' } },
    reports: { [S]: { uid: S, teachers: [ME], profileName: 'Marco', username: 'marco',
      puzzleElo: 1342, openingEloAvg: 1210, endgameEloAvg: 1150, blindfoldElo: 1000,
      puzzleThemeElo: { fork: 1180, pin: 1250, skewer: 1400 }, puzzleEloHistory: [],
      puzzlesSolvedCount: 412, puzzleAttemptCount: 530, streakCount: 5, bestStreak: 12,
      activeTime: {}, hwOpen: 1, hwDone: 2, updatedAt: now - 3600e3 } },
    doneSeen: { [S]: 2 }, hwSeen: ['m2', 'm3'],
    hwGiven: { [S]: given },
    finNew: [
      { id: 'g2', studentUid: S, title: given[1].title, kind: 'text', doneMs: now - 2 * 3600e3, seen: false },
      { id: 'g3', studentUid: S, title: given[2].title, kind: 'list', doneMs: now - 3 * 3600e3, seen: false },
    ],
    finSeenAt: now - 4 * 3600e3,
    hwDraft: {},
    homework: [
      { id: 'm2', teacherUid: T, studentUid: ME, kind: 'text', title: 'Replay the Opera Game', params: {},
        status: 'open', done: 0, seconds: 0, createdAt: now - 3600e3 },
      { id: 'm3', teacherUid: T, studentUid: ME, kind: 'list', title: 'Puzzles from Tuesday', params: { puzzles: packed },
        doneIds: [], status: 'open', done: 0, seconds: 0, createdAt: now - 7200e3 },
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
  return { kinds: btns('.hw-kind'), modes: btns('.hw-mode'), mode: vis('.hw-mode'), pz: vis('.hw-pz'), ls: vis('.hw-ls'), ch: vis('.hw-ch'),
    rows: s.querySelectorAll('.hw-ls-row').length, head: s.querySelector('.hw-ls-head').textContent,
    hint: s.querySelector('.hw-ls-rows .hint')?.textContent || '', go: s.querySelector('.hw-ls-go')?.textContent || '',
    wide: s.scrollWidth > s.clientWidth, words: s.innerText };`);
// Solves the puzzle on the board through Puzzles.userMove, the board's own path.
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
  en: { kinds: ['🧩 Puzzles', '📖 Chapter', '♟ Endgame'], modes: ['By theme and level', 'Chosen by me'], go: '🧩 Go to Puzzles',
    hint: 'You have not chosen any yet', task: 'Task', list: '🎯 List', mark: 'Mark done', ready: '🎯 Send puzzle list (2)' },
  es: { kinds: ['🧩 Problemas', '📖 Capítulo', '♟ Final'], modes: ['Por tema y nivel', 'Elegidos por mí'], go: '🧩 Ir a Problemas',
    hint: 'Todavía no has elegido ninguno', task: 'Tarea', list: '🎯 Lista', mark: 'Marcar hecha', ready: '🎯 Enviar lista (2)' },
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let failed = false;
try {
  // ── The sheet, in both languages and both themes ──
  for (const lang of ['es', 'en']) {
    for (const scheme of ['light', 'dark']) {
      const tag = `${lang}-${scheme}`, w = W[lang];
      console.log('… ' + tag);
      await load(lang, scheme);
      await seed();
      await sleep(300);
      // What was already sent as Task and as List is still there for me, the student…
      const mine = await ev(`return [...document.querySelectorAll('#stu-hw-list .hw-card')].map(c => ({ text: c.innerText, btn: c.querySelector('.fr-actions .btn')?.textContent }));`);
      check(`${tag}: my Task and my List, sent before, both still show`, mine.length === 2 && mine.some(c => c.text.includes('Opera')) && mine.some(c => c.text.includes('Tuesday')), mine);
      // …and in the teacher's "finished" strip.
      const fin = await ev(`return [...document.querySelectorAll('#stu-fin-list .fin-row')].map(r => r.innerText);`);
      check(`${tag}: the finished strip shows the Task and the List`, fin.length === 2 && fin.some(x => x.includes('Opera')) && fin.some(x => x.includes('Tuesday')), fin);
      await ev(`document.getElementById('stu-hw').scrollIntoView({ block: 'start' });`);
      await sleep(200);
      await shot(`${tag}-1-student-side`);

      await openPage();
      const page = await ev(`const s = document.querySelector('.hw-send-list'); return { sendHidden: s.classList.contains('hidden'),
        cards: [...document.querySelectorAll('.hw-teacher .hw-card')].map(c => c.innerText) };`);
      check(`${tag}: nothing chosen, so no "send puzzle list" button on the page`, page.sendHidden);
      check(`${tag}: the student's page lists the Task and the List I sent`, page.cards.length === 3 && page.cards.some(x => x.includes('Opera')) && page.cards.some(x => x.includes('Tuesday')), page.cards);

      await openSheet();
      let s = await sheetState();
      check(`${tag}: the sheet has three buttons, Puzzles, Chapter and Endgame`, same(s.kinds.map(b => b.text), w.kinds) && same(s.kinds.map(b => b.v), ['puzzles', 'chapter', 'endgame']), s.kinds);
      check(`${tag}: no Task and no List button anywhere on the sheet`, !s.words.includes(w.task) && !s.words.includes(w.list) && !s.words.includes('📝'), s.words);
      check(`${tag}: the switch reads "${w.modes.join('" / "')}"`, same(s.modes.map(b => b.text), w.modes), s.modes);
      check(`${tag}: it opens on Puzzles, by theme and level`, s.kinds[0].on && s.modes[0].on && !s.modes[1].on && s.mode && s.pz && !s.ls && !s.ch, s);
      check(`${tag}: the switch fits on one line, nothing cut, nothing wider than the sheet`, s.modes.every(b => !b.cut && b.h < 44) && s.modes[0].h === s.modes[1].h && !s.wide, s.modes);
      await shot(`${tag}-2-by-theme`);

      await tapX(`document.querySelector('.hw-mode button[data-v="list"]')`);
      s = await sheetState();
      check(`${tag}: "chosen by me", empty: it says how to add puzzles`, s.ls && !s.pz && s.modes[1].on && s.rows === 0 && s.hint.startsWith(w.hint) && s.hint.includes(lang === 'es' ? 'Poner a un alumno' : 'Give to a student'), s.hint);
      check(`${tag}: and has the button "${w.go}"`, s.go === w.go, s.go);
      await shot(`${tag}-3-chosen-empty`);

      await tapX(`document.querySelector('.hw-kind button[data-v="chapter"]')`);
      s = await sheetState();
      check(`${tag}: Chapter hides the switch and both puzzle forms`, s.ch && !s.mode && !s.pz && !s.ls && s.kinds[1].on, s);
      await shot(`${tag}-4-chapter`);
      await tapX(`document.querySelector('.hw-kind button[data-v="puzzles"]')`);
      s = await sheetState();
      check(`${tag}: back on Puzzles it is still on "chosen by me"`, s.mode && s.ls && !s.pz && !s.ch && s.modes[1].on, s);

      await tap('.hw-ls-go');
      await sleep(400);
      const went = await ev(`return { modals: document.querySelectorAll('.modal-back').length, puzzles: !document.getElementById('screen-puzzles').classList.contains('hidden'),
        students: !document.getElementById('screen-students').classList.contains('hidden') };`);
      check(`${tag}: the button closes the sheet and the page and lands on the Puzzles tab`, went.modals === 0 && went.puzzles && !went.students, went);
    }
  }

  // ── The real flows (English, light) ──
  console.log('… flows');
  await load('en', 'light');
  await seed();
  await sleep(300);
  errors.length = 0;

  // A. By theme and level: what is sent is what was sent before v215.
  await openPage();
  await openSheet();
  const chipNames = await ev(`return [...document.querySelectorAll('.hw-chip')].slice(0, 3).map(c => c.childNodes[0].textContent.trim());`);
  await tapX(`document.querySelectorAll('.hw-chip')[0]`);
  await tapX(`document.querySelectorAll('.hw-chip')[2]`);
  await ev(`document.querySelector('.hw-count').value = '12'; document.querySelector('.hw-due').value = '2026-10-20';`);
  await tapX(`${top}.querySelector('.row .btn.primary')`);
  await sleep(500);
  const a = await ev(`return __specs.pop();`);
  check('A. by theme and level sends kind "puzzles" with the same five fields as before', a && same(Object.keys(a).sort(), ['dueDate', 'kind', 'note', 'params', 'title']) && a.kind === 'puzzles', a);
  check('A. its count, level band and the two themes tapped', a && same(a.params, { themes: a.params.themes, minRating: 1200, maxRating: 1500, count: 12 }) && a.params.themes.length === 2 && a.dueDate === '2026-10-20', a);
  check('A. its automatic title names the count and the themes', a && a.title === `12 puzzles: ${chipNames[0]}, ${chipNames[2]}`, a && a.title);
  await closeModals();

  // B. Two puzzles chosen in the Puzzles tab, one removed, a list of one sent.
  await ev(`__app.showScreen('puzzles');`);
  if (!await until(`__app.Puzzles.current`, 6000)) await ev(`await __app.Puzzles.nextPuzzle();`);
  const s1 = await ev(SOLVE);
  await ev(`await __app.Puzzles.nextPuzzle();`);
  await sleep(300);
  const s2 = await ev(SOLVE);
  await sleep(300);
  const dots = await ev(`return document.querySelectorAll('#puzzle-log .plog-dot').length;`);
  check('B. two solved puzzles are two dots in the session strip', dots === 2 && s1 !== s2, { dots, s1, s2 });
  for (const i of [0, 1]) {
    await tapX(`document.querySelectorAll('#puzzle-log .plog-dot')[${i}]`);
    await until(`[...document.querySelectorAll('.modal-box .btn')].some(b => b.textContent.includes('🎯'))`);
    await sleep(500);                 // the review slides up
    if (i === 0) await shot('flow-B1-give-to-a-student');
    await tapX(`[...document.querySelectorAll('.modal-box .btn')].find(b => b.textContent.includes('🎯'))`);
    const said = await toastText();
    if (i === 1) check('B. "Give to a student" says where it went', said.includes("Added to Marco's list (2/20)"), said);
    await closeModals();
  }
  const draft = await ev(`return (__stu.hwDraft.s_uid || []).map(x => x.split('|')[0]);`);
  check('B. both are waiting for Marco', same([...draft].sort(), [s1, s2].sort()), draft);
  await ev(`__app.showScreen('students');`);
  await sleep(300);
  await openPage();
  const ready = await ev(`const s = document.querySelector('.hw-send-list'); return { hidden: s.classList.contains('hidden'), text: s.textContent };`);
  check('B. the page now offers "Send puzzle list (2)"', !ready.hidden && ready.text === W.en.ready, ready);
  await ev(`document.querySelector('.hw-teacher').scrollIntoView({ block: 'start' });`);
  await shot('flow-B2-page-send-list');
  await tap('.hw-send-list');
  await until(`document.querySelector('.hw-sheet')`);
  let s = await sheetState();
  check('B. that button opens the sheet on Puzzles, chosen by me, with the two puzzles', s.kinds[0].on && s.modes[1].on && s.ls && !s.pz && s.rows === 2 && s.head.includes('2/20') && !s.go, s);
  await shot('flow-B3-chosen-two');
  await tapX(`document.querySelector('.hw-ls-row .btn')`);
  s = await sheetState();
  check('B. Remove takes one away: one row, 1/20', s.rows === 1 && s.head.includes('1/20'), s);
  await shot('flow-B4-chosen-one');
  await tapX(`${top}.querySelector('.row .btn.primary')`);
  await sleep(500);
  const b = await ev(`return __specs.pop();`);
  check('B. what is sent is kind "list" with that one puzzle, packed as before', b && b.kind === 'list' && same(Object.keys(b).sort(), ['dueDate', 'kind', 'note', 'params', 'title'])
    && same(Object.keys(b.params), ['puzzles']) && b.params.puzzles.length === 1 && b.params.puzzles[0].split('|').length === 5 && b.params.puzzles[0].split('|')[0] === draft[1]
    && b.title === 'List of 1 puzzles', b);
  await closeModals();
  // The student gets exactly that (seeded onto my own list: no user, no write).
  await ev(`__stu.homework.push({ id: 'm9', teacherUid: 't_uid', studentUid: 'me_uid', ...${JSON.stringify(b)}, title: 'The new list of one',
    doneIds: [], status: 'open', done: 0, seconds: 0, createdAt: Date.now() }); __stu.render();`);
  const startCard = text => tapX(`[...document.querySelectorAll('#stu-hw-list .hw-card')].find(c => c.textContent.includes(${JSON.stringify(text)})).querySelector('.fr-actions .btn')`);
  const bar = () => ev(`return document.getElementById('puzzle-hw').innerText.replace(/\\s+/g, ' ');`);
  await startCard('The new list of one');
  await until(`!document.getElementById('puzzle-hw').classList.contains('hidden') && __app.Puzzles.current`);
  const onBoard = await ev(`return __app.Puzzles.current.id;`);
  check('B. the student starts it: the bar says 0/1 and the board has that puzzle', (await bar()).includes('0/1') && onBoard === draft[1], { bar: await bar(), onBoard });
  await shot('flow-B5-student-list-of-one');
  await ev(SOLVE);
  await sleep(500);
  check('B. solved once, the list of one is done', await ev(`return __stu.homework.find(h => h.id === 'm9').status;`) === 'done');
  await ev(`document.getElementById('puzzle-hw-exit')?.click(); __app.showScreen('students');`);
  await sleep(400);

  // C. Sent before v215: the List is still played to the end, the Task is still ticked.
  await startCard('Puzzles from Tuesday');
  await until(`!document.getElementById('puzzle-hw').classList.contains('hidden') && __app.Puzzles.current`);
  check('C. the old List starts: 0/2', (await bar()).includes('0/2'), await bar());
  await ev(SOLVE);
  await sleep(400);
  await ev(`await __app.Puzzles.nextPuzzle();`);
  await sleep(300);
  await ev(SOLVE);
  await sleep(500);
  check('C. both solved, the old List is done', await ev(`return __stu.homework.find(h => h.id === 'm3').status;`) === 'done');
  await ev(`document.getElementById('puzzle-hw-exit')?.click(); __app.showScreen('students');`);
  await sleep(400);
  const markBtn = `[...document.querySelectorAll('#stu-hw-list .hw-card')].find(c => c.textContent.includes('Opera')).querySelector('.fr-actions .btn')`;
  check('C. the old Task still has its "Mark done" button', await ev(`return ${markBtn}.textContent;`) === W.en.mark, await ev(`return ${markBtn}.textContent;`));
  await tapX(markBtn);
  await sleep(300);
  const confirm = await ev(`const m = ${top}; return m ? { text: m.innerText, yes: !!m.querySelector('.btn.danger') } : null;`);
  check('C. tapping it asks first, naming the task', confirm && confirm.yes && confirm.text.includes('Replay the Opera Game'), confirm);
  await shot('flow-C-task-confirm');
  await tapX(`${top}.querySelector('.btn.danger')`);
  await sleep(1500);
  const ticked = await ev(`return __stu.homework.find(h => h.id === 'm2').status;`);
  check('C. after Yes the old Task is done', ticked === 'done' && (await toastText()).includes('Replay the Opera Game'), { ticked, toast: await toastText() });
} catch (e) { failed = true; console.error('\nSTOPPED: ' + e.message); }

const bad = checks.filter(c => !c.ok);
console.log(`\n${checks.length - bad.length} of ${checks.length} checks passed${bad.length ? ' — FAILED: ' + bad.map(c => c.name).join(' | ') : ''}`);
// App Check cannot answer on localhost (403), sw.js is refused on purpose (404),
// and the Task's write has no user to write as.
const other = errors.filter(e => !/firebaseappcheck|AppCheck|app-check|bad HTTP response code \(404\) was received when fetching the script|status of 403|Marking homework done failed|Saving homework progress failed|permission|Missing or insufficient/i.test(e));
console.log(other.length ? `Console errors (${other.length}):\n  ` + [...new Set(other)].join('\n  ') : 'No console errors (other than App Check, the refused service worker and the signed-out write).');
chrome.kill();
server.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(failed || bad.length ? 1 : 0);
