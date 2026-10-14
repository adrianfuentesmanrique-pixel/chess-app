// The boxes you type in use the app's font (v221): every box of class .input
// and the Analysis comment box. Dev tool, not shipped. Headless Chrome over CDP
// at 375 x 812, signed out, no service worker.
//
//   node tools/cdp-verify-fonts.mjs <outDir>     about two minutes
//
// The skeleton (server, Chrome, tapX, load, seed) is tools/cdp-verify-students9.mjs's.
// At every stop each box on screen is measured TWICE in the same page: once
// with the font rule rolled back to the browser's own (`font-family: revert`,
// which is what v220 and before showed) and once as shipped. So "before" is not a second
// copy of the app, it is this one with the rule switched off.
// CALLED, not tapped: the openers (openAuthModal, askText, showScreen,
// Analysis.editComment / editDetails, Trainer.pickGame, history's open(),
// SimulUI.openingSheet) and db.createBase for one empty database. The font
// does not depend on how the box was opened.
// REALLY TAPPED: the Create-account tab, the database row, the buttons for
// Advanced search, Filters and Settings, the student's card, Assign homework
// and its four kind buttons.
// SET by script: the sample text in the boxes, so the screenshots show letters.
// NOT REACHED: the password pop-up (delete account) and the complete-your-
// profile pop-up need a signed-in user; both are built from the same .input.
// A real phone: this is Chrome on Windows with a phone's screen size.
//
// BUTTONS (v222): every <button> takes the app's font from one rule,
// `button { font-family: inherit; }`. At every stop, and on the main screens,
// each button on screen is measured with that one rule switched off in the
// stylesheet (what v221 and before showed: Arial) and as shipped, and compared:
// same font as the page, no button past the screen or its row, no label newly
// cut or newly on a second line.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/cdp-verify-fonts.mjs <outDir>'); process.exit(1); }
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9100 + Math.floor(Math.random() * 90);
const WEB = 8700 + Math.floor(Math.random() * 90);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-fonts-'));
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
console.log(`listening on ${WEB}, serving ${ROOT}`);
const getJSON = url => new Promise((res, rej) => {
  http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });

let ws, msgId = 0;
const pending = new Map();
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
});
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok }); console.log((ok ? '  PASS ' : '  FAIL ') + name + (!ok && detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); };
const shot = async name => fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
const until = async (expr, ms = 8000) => { for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (await ev(`return !!(${expr});`)) return true; await sleep(60); } return false; };
// A real touch in the middle of an element (students9's tapX).
const tapX = async find => {
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
const closeModals = () => ev(`document.querySelectorAll('.modal-back').forEach(e => e.remove());`);

const load = async (lang, scheme) => {
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
  await send('Page.navigate', { url: `http://127.0.0.1:${WEB}/` });
  await sleep(2500);
  await ev(`localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1');`);
  await send('Page.reload', {});
  await sleep(3500);
  await ev(`document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove());
    window.__app = await import('/js/app.js'); window.__stu = (await import('/js/students.js')).Students;`);
};

// I am the teacher of Marco (students9's seed, without the homework).
const seed = () => ev(`
  const { Students } = await import('/js/students.js');
  await Students.load();
  const now = Date.now(), S = 's_uid', ME = 'me_uid';
  Object.assign(Students, {
    uid: ME, loaded: true, failed: false, cachedAt: now,
    asStudent: [], asTeacher: [{ id: ME + '_' + S, teacherUid: ME, studentUid: S, status: 'active' }],
    people: {},
    reports: { [S]: { uid: S, teachers: [ME], profileName: 'Marco', username: 'marco',
      puzzleElo: 1342, openingEloAvg: 1210, endgameEloAvg: 1150, blindfoldElo: 1000,
      puzzleThemeElo: { fork: 1180, pin: 1250, skewer: 1400 }, puzzleEloHistory: [],
      puzzlesSolvedCount: 412, puzzleAttemptCount: 530, streakCount: 5, bestStreak: 12,
      activeTime: {}, hwOpen: 0, hwDone: 0, updatedAt: now - 3600e3 } },
    doneSeen: { [S]: 0 }, hwSeen: [], hwGiven: { [S]: [] }, finNew: [], finSeenAt: now,
    hwDraft: {}, hwPos: { [S]: '6k1/8/6K1/8/8/8/8/Q7 w - - 0 1' }, homework: [],
  });
  Students.load = async () => { Students.render(); };
  __app.showScreen('students');
  Students.render();`);

// Every box on screen that takes typing or a choice, as it stands.
const BOXES = `[...document.querySelectorAll('input, textarea, select')].filter(e => !['checkbox', 'radio', 'range', 'file', 'hidden'].includes(e.type)
  && e.id !== 'g-recaptcha-response' && e.getBoundingClientRect().height > 0 && getComputedStyle(e).visibility !== 'hidden'
  && (!document.querySelector('.modal-back') || e.closest('.modal-back')))`;
const measure = () => ev(`return ${BOXES}.map(e => { const c = getComputedStyle(e), r = e.getBoundingClientRect();
  return { who: e.tagName.toLowerCase() + (e.tagName === 'INPUT' ? '[' + e.type + ']' : '') + (e.id ? '#' + e.id : '.' + [...e.classList].join('.')),
    font: c.fontFamily, size: c.fontSize, h: Math.round(r.height), w: Math.round(r.width), right: Math.round(r.right), cut: e.scrollWidth > e.clientWidth + 1 }; });`);
// Sample text, so a screenshot shows the letters. Nothing listens for it.
const fill = () => ev(`${BOXES}.forEach(e => { if (e.value) return;
  if (e.type === 'date') e.value = '2026-11-05'; else if (e.type === 'number') e.value = '1500';
  else if (e.tagName !== 'SELECT') e.value = e.type === 'email' ? 'marco@example.com' : 'Rook endings 123'; });`);
const REVERT = `.input, .comment-box textarea { font-family: revert !important; }`;

// Every button on screen (in the open pop-up, if one is open): its font, its box,
// whether its row or the screen holds it, cut text, and how many lines its words take.
const BUTTONS = `[...document.querySelectorAll('button')].filter(e => { const r = e.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && (!document.querySelector('.modal-back') || e.closest('.modal-back')); })`;
const measureButtons = () => ev(`return ${BUTTONS}.map(e => { const c = getComputedStyle(e), r = e.getBoundingClientRect(), p = e.parentElement.getBoundingClientRect();
  const tops = [], w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) { if (!n.nodeValue.trim()) continue; const g = document.createRange(); g.selectNodeContents(n);
    for (const q of g.getClientRects()) if (q.width > 0 && !tops.some(t => Math.abs(t - q.top) < 6)) tops.push(q.top); }
  return { who: 'button' + (e.id ? '#' + e.id : '') + (e.classList.length ? '.' + [...e.classList].join('.') : '') + ' "' + e.textContent.trim().replace(/\\s+/g, ' ').slice(0, 30) + '"',
    font: c.fontFamily, w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), row: Math.round(p.right),
    cut: e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1, lines: tops.length }; });`);
// Switch the one `button { font-family: inherit }` rule off or back on, in the stylesheet itself.
const buttonRule = on => ev(`for (const s of document.styleSheets) { let rules; try { rules = s.cssRules; } catch { continue; }
  for (const r of rules) if (r.selectorText === 'button' && (r.style.fontFamily || r.__off)) {
    if (${on}) { r.style.setProperty('font-family', 'inherit'); r.__off = false; } else { r.style.removeProperty('font-family'); r.__off = true; } return true; } }
  return false;`);
const buttonStats = { stops: 0, buttons: 0, taller: new Map() };
const buttonStop = async (tag, name) => {
  check(`${tag} ${name}: the button font rule is in the stylesheet`, await buttonRule(false));
  const before = await measureButtons();
  await buttonRule(true);
  const after = await measureButtons();
  buttonStats.stops++; buttonStats.buttons += after.length;
  check(`${tag} ${name}: every button (${after.length}) is in the app's font`, after.length && after.every(b => b.font === bodyFont), after.filter(b => b.font !== bodyFont).map(b => [b.who, b.font]));
  check(`${tag} ${name}: with the rule off some were NOT (so the check can fail)`, before.some(b => b.font !== bodyFont), before.length);
  check(`${tag} ${name}: no button past the screen or its row, no label newly cut or on a new line`,
    after.every((b, i) => (b.right <= 375 || before[i].right > 375) && (b.right <= b.row + 1 || before[i].right > before[i].row + 1) && (!b.cut || before[i].cut) && b.lines <= before[i].lines),
    after.map((b, i) => [b, before[i]]).filter(([b, a]) => (b.right > 375 && a.right <= 375) || (b.right > b.row + 1 && a.right <= a.row + 1) || (b.cut && !a.cut) || b.lines > a.lines));
  after.forEach((b, i) => { const d = b.h - before[i].h; if (d) { const k = (d > 0 ? '+' : '') + d + 'px'; buttonStats.taller.set(k, (buttonStats.taller.get(k) || 0) + 1); } });
};

let bodyFont = '';
const changes = [];
// One stop: the boxes with the rule off, then as shipped, then a picture.
const stop = async (tag, name, want, file) => {
  await sleep(250);
  await buttonStop(tag, name);
  await fill();
  await ev(`const s = document.createElement('style'); s.id = '__rev'; s.textContent = ${JSON.stringify(REVERT)}; document.head.appendChild(s);`);
  const before = await measure();
  await ev(`document.getElementById('__rev').remove();`);
  const after = await measure();
  check(`${tag} ${name}: ${want} box${want === 1 ? '' : 'es'} on screen`, after.length === want, after.map(b => b.who));
  check(`${tag} ${name}: every box is in the app's font, at 15px`, after.length && after.every(b => b.font === bodyFont && b.size === '15px'), after.filter(b => b.font !== bodyFont || b.size !== '15px'));
  check(`${tag} ${name}: with the rule off they were NOT (so the check can fail)`, before.length && before.every(b => b.font !== bodyFont), before.map(b => b.font));
  check(`${tag} ${name}: no box runs off the screen, no text newly cut`, after.every((b, i) => b.right <= 375 && (!b.cut || before[i].cut)), after.filter((b, i) => b.right > 375 || (b.cut && !before[i].cut)));
  check(`${tag} ${name}: no box is wider; a one-line box at most 3px taller, a note box at most 6px`, after.every((b, i) => b.w <= before[i].w && b.h <= before[i].h + (b.who.startsWith('textarea') ? 6 : 3)), after.map((b, i) => [b.who, before[i].w, b.w, before[i].h, b.h]));
  after.forEach((b, i) => { if (b.h !== before[i].h || b.w !== before[i].w) changes.push(`${b.who}: ${before[i].w}x${before[i].h} -> ${b.w}x${b.h}`); });
  await ev(`const e = ${BOXES}[0]; if (e) e.scrollIntoView({ block: 'center' });`);
  await sleep(200);
  await shot(`${tag}-${file}`);
};
const screen = async id => { await closeModals(); await ev(`__app.showScreen('${id}');`); await sleep(400); };

for (const lang of ['es', 'en']) {
  for (const scheme of ['light', 'dark']) {
    const tag = `${lang}-${scheme}`;
    console.log(`\n== ${tag}`);
    await load(lang, scheme);
    bodyFont = await ev(`return getComputedStyle(document.body).fontFamily;`);
    check(`${tag}: the page's own font is the system one`, bodyFont.startsWith('system-ui'), bodyFont);

    // The main screens: their buttons only (no boxes to type in counted here).
    for (const [id, file] of [['home', '00a-home'], ['play', '00b-play'], ['puzzles', '00c-puzzles'], ['analysis', '00d-analysis'], ['endgame', '00e-endgame'],
      ['calc', '00f-calc'], ['blind', '00g-blind'], ['read', '00h-read'], ['profile', '00i-profile'], ['simul', '00j-simul']]) {
      await screen(id);
      await buttonStop(tag, `${id} screen`);
      await shot(`${tag}-${file}`);
    }

    // Sign in, create account.
    await ev(`__app.openAuthModal();`);
    await until(`document.querySelector('.modal-box .input')`);
    await stop(tag, 'sign in', 2, '01-sign-in');
    await tapX(`[...document.querySelectorAll('.modal-box .auth-tabs button')][1]`);
    await stop(tag, 'create account', 7, '02-create-account');
    await ev(`document.querySelector('.modal-box input[type=date]').scrollIntoView({ block: 'center' });`);
    await sleep(200);
    await shot(`${tag}-02b-create-account-date`);
    await closeModals();

    // The name pop-up.
    await ev(`__app.askText('Rook endings');`);
    await until(`document.querySelector('.modal-box .input')`);
    await stop(tag, 'name pop-up', 1, '03-name-popup');
    await closeModals();

    // Database: the list, one database's games, Advanced search.
    await ev(`const db = await import('/js/db.js'); if (!(await db.listBases()).some(b => b.name === 'Font check')) await db.createBase('Font check');`);
    await screen('base');
    await ev(`document.getElementById('base-search').scrollIntoView({ block: 'center' });`);
    await stop(tag, 'database list', 1, '04-database-search');
    await ev(`document.getElementById('base-search').value = '';`);
    await tapX(`[...document.querySelectorAll('#base-list .list-item')].find(e => e.textContent.includes('Font check'))`);
    await until(`!document.getElementById('base-games-view').classList.contains('hidden')`);
    await stop(tag, 'game list', 1, '05-game-search');
    await tap('#game-advanced');
    await until(`document.querySelector('.modal-box .input')`);
    const adv = await ev(`return document.querySelectorAll('.modal-box .input').length;`);
    await stop(tag, 'advanced search', adv, '06-advanced-search');
    check(`${tag} advanced search: it has its text boxes and the two years`, adv >= 4, adv);
    await closeModals();

    // Trainer, "My repertoire": the database list and the game picker.
    await screen('trainer');
    await tap('#trainer-views button[data-v="mine"]');
    await ev(`const s = document.getElementById('trainer-base'); const o = [...s.options].find(o => o.textContent.includes('Font check')); if (o) { s.value = o.value; s.dispatchEvent(new Event('change')); }`);
    await stop(tag, 'trainer', 1, '07-trainer');
    await ev(`__app.Trainer.pickGame();`);
    await until(`document.querySelector('.modal-box .input')`);
    await stop(tag, 'trainer game picker', 1, '08-trainer-picker');
    await closeModals();

    // Trainer, "Library": its search, then the filter inside one opening.
    await tap('#trainer-views button[data-v="library"]');
    await until(`document.querySelector('#lib-cards button[data-o]')`);
    await stop(tag, 'library', 1, '09-library');
    await ev(`document.getElementById('lib-search').value = '';`);
    await tapX(`document.querySelector('#lib-cards button[data-o]:not([data-l])')`);
    await until(`!document.getElementById('lib-opening').classList.contains('hidden')`);
    await stop(tag, 'library, one opening', 1, '09b-library-opening');

    // Leaderboard and Friends.
    await screen('leaderboard');
    const lb = await ev(`return document.getElementById('leaderboard-search').getBoundingClientRect().height > 0 ? 1 : 0;`);
    if (lb) await stop(tag, 'leaderboard', 1, '10-leaderboard'); else console.log('  (leaderboard search is not shown signed out)');
    await screen('friends');
    const fr = await ev(`return document.getElementById('friends-search').getBoundingClientRect().height > 0 ? 1 : 0;`);
    if (fr) await stop(tag, 'friends', 1, '11-friends');
    else check(`${tag} friends: the search is not shown signed out; its font, read where it hides, is the page's`, await ev(`return getComputedStyle(document.getElementById('friends-search')).fontFamily;`) === bodyFont);

    // Game history filter.
    await screen('play');
    await ev(`(await import('/js/history.js')).open();`);
    await sleep(300);
    await tap('#hist-filters');
    await until(`document.querySelector('.modal-box .input')`);
    await stop(tag, 'history filter', 4, '12-history-filter');
    await closeModals();

    // Settings: the reminder hour.
    await screen('home');
    await ev(`document.getElementById('menu-settings').click();`);
    await until(`document.querySelector('.modal-box')`);
    const rem = await ev(`const e = document.getElementById('remind-hour'); return e && e.getBoundingClientRect().height > 0 ? 1 : 0;`);
    if (rem) await stop(tag, 'settings reminder hour', 1, '13-settings'); else console.log('  (the reminder hour is not shown here)');
    await closeModals();

    // Analysis: the comment box and Game details.
    await screen('analysis');
    await ev(`__app.Analysis.editComment();`);
    await stop(tag, 'analysis comment box', 1, '14-analysis-comment');
    await ev(`document.getElementById('ana-comment-text').value = ''; document.getElementById('ana-comment-box').classList.add('hidden');`);
    await ev(`__app.Analysis.editDetails();`);
    await until(`document.querySelector('.modal-box .input')`);
    const det = await ev(`return document.querySelectorAll('.modal-box .input').length;`);
    await stop(tag, 'game details', det, '15-game-details');
    check(`${tag} game details: four text boxes and the result list`, det === 5, det);
    await closeModals();

    // Simul: the opening sheet's search.
    await ev(`(await import('/js/simul-ui.js')).SimulUI.openingSheet();`);
    await sleep(500);
    const so = await ev(`const e = document.getElementById('simul-op-search'); return e && e.getBoundingClientRect().height > 0 ? 1 : 0;`);
    if (so) await stop(tag, 'simul opening', 1, '16-simul-opening'); else console.log('  (the simul opening search is not shown here)');
    await closeModals();

    // Students: the assign sheet, kind by kind.
    await seed();
    await tap('#stu-list .stu-card.tappable');
    await until(`document.querySelector('.stu-page')`);
    await sleep(250);
    await buttonStop(tag, 'student page');
    await shot(`${tag}-16b-student-page`);
    await tap('.hw-teacher .btn-wide');
    await until(`document.querySelector('.hw-sheet')`);
    const three = await ev(`const s = document.querySelector('.hw-sheet'), f = q => getComputedStyle(s.querySelector(q)).fontFamily;
      return { title: f('.hw-title'), note: f('.hw-note-in'), due: f('.hw-due') };`);
    check(`${tag} assign sheet: the title, the note and the date are in the page's font`, three.title === bodyFont && three.note === bodyFont && three.due === bodyFont, three);
    for (const [kind, want, file] of [['position', 4, '17-sheet-position'], ['puzzles', 6, '18-sheet-puzzles'], ['chapter', 5, '19-sheet-chapter'], ['endgame', 5, '20-sheet-endgame']]) {
      await tapX(`document.querySelector('.hw-kind button[data-v="${kind}"]')`);
      await stop(tag, `assign sheet, ${kind}`, want, file);
      await ev(`document.querySelector('.hw-sheet .hw-due').scrollIntoView({ block: 'end' });`);
      await sleep(200);
      await shot(`${tag}-${file}-b-note-date`);
    }
    await closeModals();
  }
}

const bad = checks.filter(c => !c.ok);
console.log(`\nSizes that changed with the font (${new Set(changes).size} kinds):`);
[...new Set(changes)].forEach(c => console.log('  ' + c));
console.log(`\nButtons: ${buttonStats.buttons} measured at ${buttonStats.stops} stops; height change with the font: ` +
  ([...buttonStats.taller].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} x${n}`).join(', ') || 'none'));
console.log(`\n${checks.length - bad.length} of ${checks.length} checks passed`);
if (bad.length) { console.log('FAILED:'); bad.forEach(c => console.log('  ' + c.name)); }
chrome.kill(); server.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(bad.length ? 1 : 0);
