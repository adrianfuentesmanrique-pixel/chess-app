// Headless-Chrome verification for Students STAGE 6 (per-puzzle homework results + the
// teacher's Finished-homework strip). The in-app pane does not
// composite, so screenshots come from a real
// headless Chrome over CDP. Dev tool, not shipped.
//
//   node tools/cdp-verify-students6.mjs http://localhost:9183 tools/stu6-seed.js <outDir>
//
// tools/stu6-seed.js is an async-function body that seeds Students (see HANDOVER) —
// everything signed-in on these shots is SEEDED; Firestore is unreachable here.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';

const APP_URL = process.argv[2] || 'http://localhost:9183';
const SEED = fs.readFileSync(process.argv[3], 'utf8').replace(/'seeded';\s*$/, "return 'seeded';");
const OUT = process.argv[4] || path.join(os.tmpdir(), 'stu6-shots');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp6-'));
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
  console.error('  shot ' + name);
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


const closeModals = () => evalP(`document.querySelectorAll('.modal-back').forEach(e => e.remove());`);
const scrollTo = sel => evalP(`document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -8);`);
const dotOn = () => evalP(`return document.querySelector('#tabbar button[data-screen="students"]').classList.contains('has-dot');`);

// The practice-time detector (js/activity.js) counts a second only after a
// recent input, so every helper "touches" the page first. Then the helper
// waits, so the puzzle has real seconds on it.
const TOUCH = `window.dispatchEvent(new Event('pointerdown')); const sl = ms => new Promise(r => setTimeout(r, ms));`;
// Solves the puzzle on the board through Puzzles.userMove — the board's own
// onMove path — so the solve branch, log() and both homework hooks run for real.
const SOLVE = `const { Puzzles } = await import('/js/app.js'); ${TOUCH}
  await sl(2600);
  const p = Puzzles.current;
  while (Puzzles.current === p && Puzzles.moveIdx < p.moves.length) {
    const u = p.moves[Puzzles.moveIdx];
    await Puzzles.userMove({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    await sl(500);
  }
  return p.id;`;
// A legal move that is NOT the answer (and not a mate, which would count).
const WRONG = `const { Puzzles } = await import('/js/app.js'); ${TOUCH}
  await sl(2600);
  const p = Puzzles.current; const exp = p.moves[Puzzles.moveIdx];
  const mv = Puzzles.chess.moves({ verbose: true }).find(m => m.from + m.to + (m.promotion || '') !== exp && !m.san.includes('#'));
  await Puzzles.userMove({ from: mv.from, to: mv.to, promotion: mv.promotion });
  return p.id + ' (played ' + mv.san + ', failedThis ' + Puzzles.failedThis + ')';`;
// On to the next puzzle, whether or not auto-next already did it.
const NEXT = id => `const { Puzzles } = await import('/js/app.js'); const sl = ms => new Promise(r => setTimeout(r, ms));
  await sl(1500);
  if (Puzzles.homework && Puzzles.current && Puzzles.current.id === ${JSON.stringify(id)}) { await Puzzles.nextPuzzle(); await sl(300); }
  return Puzzles.current && Puzzles.current.id;`;
const state = id => evalP(`const { Students } = await import('/js/students.js'); const { unpackResult } = await import('/js/firebase.js');
  const h = Students.homework.find(x => x.id === '${id}');
  return { done: h.done, status: h.status, seconds: h.seconds, running: !!Students.hwRun,
    results: (h.results || []).map(unpackResult).map(r => r.puzzle.id + (r.ok ? ' RIGHT ' : ' WRONG ') + r.secs + 's') };`);
const start = text => evalP(`const app = await import('/js/app.js'); app.showScreen('students');
  [...document.querySelectorAll('#stu-hw-list .hw-card')].find(c => c.textContent.includes(${JSON.stringify(text)})).querySelector('.btn.primary').click();`);
const idOf = s => s.split(' ')[0];

for (const lang of ['en', 'es']) {
  for (const scheme of ['light', 'dark']) {
    const tag = `${lang}-${scheme}`;
    console.error('… ' + tag);
    await load(lang, scheme);
    console.error('  ' + await evalP(SEED));
    await sleep(400);
    // 1. Teacher: the "Finished homework" strip on top of Students.
    await evalP(`window.scrollTo(0, 0);`);
    await sleep(200);
    await shot(`${tag}-1-strip`);
    // 2. Tap the puzzles line → the results sheet (SEEDED results, 14 attempts).
    await evalP(`[...document.querySelectorAll('#stu-fin-list .fin-row')].find(r => r.textContent.includes('Fork')).click();`);
    await sleep(500);
    await shot(`${tag}-2-results`);
    await evalP(`document.querySelector('.hwr-list').scrollIntoView({ block: 'start' });`);
    await sleep(200);
    await shot(`${tag}-3-results-list`);
    // 3. A missed attempt → the position, in the puzzle-log replay.
    await evalP(`document.querySelector('.hwr-row.miss').click();`);
    await sleep(600);
    await shot(`${tag}-4-position`);
    await closeModals();
    // 4. The student page: homework rows with their Results button.
    await evalP(`document.querySelector('#stu-list .stu-card.tappable').click();`);
    await sleep(500);
    await evalP(`document.querySelector('.hw-teacher').scrollIntoView({ block: 'start' });`);
    await sleep(300);
    await shot(`${tag}-5-page-rows`);
    // 5. An OLD finished homework, from before results existed.
    await evalP(`[...document.querySelectorAll('.hw-teacher .hw-card')].find(c => c.textContent.includes('before results')).querySelector('.hw-results').click();`);
    await sleep(400);
    await shot(`${tag}-6-no-detail`);
    await closeModals();
  }
}

// ── The real flows (EN, light) ──
console.error('… flows');
await load('en', 'light');
console.error('  ' + await evalP(SEED));
errors.length = 0;

// A. The gold dot and the strip (the two lines are SEEDED; what follows is real).
console.error('  A. dot with the strip on screen: ' + await dotOn() + ' · lines: ' +
  await evalP(`return document.querySelectorAll('#stu-fin-list .fin-row').length;`));
await evalP(`[...document.querySelectorAll('#stu-fin-list .fin-row')].find(r => r.textContent.includes('Opera')).click();`);
await sleep(400);
console.error('  A. text task opened from the strip: "' + await evalP(`return document.querySelector('.hwr-sheet .empty-note').textContent;`) +
  '" · lines left: ' + await evalP(`return document.querySelectorAll('#stu-fin-list .fin-row').length;`));
await shot('flow-A-text-from-strip');
await closeModals();
await evalP(`document.getElementById('stu-fin-clear').click();`);
await sleep(200);
console.error('  A. after Clear: strip hidden ' + await evalP(`return document.getElementById('stu-fin').classList.contains('hidden');`) + ' · dot ' + await dotOn());
// The check itself: nobody without an accepted student runs it; a teacher is
// asked at most once per 15 minutes. (No Firebase user here, so the query
// inside returns nothing — the QUERY is covered by the rules test.)
console.error('  A. checkFinished guards: ' + JSON.stringify(await evalP(`const { Students } = await import('/js/students.js');
  const keep = Students.asTeacher; Students.finCheckAt = 0;
  Students.asTeacher = []; await Students.checkFinished(); const noStudents = Students.finCheckAt;
  Students.asTeacher = keep; await Students.checkFinished(); const first = Students.finCheckAt;
  await Students.checkFinished(); const again = Students.finCheckAt;
  return { ranWithNoStudents: noStudents !== 0, ranWithStudents: first > 0, secondCallThrottled: again === first };`)));

// B. A 'puzzles' homework PLAYED: right, wrong + skipped, wrong + then solved, right, right.
await start('any theme');
await sleep(1500);
const a1 = await evalP(SOLVE);
console.error('  B. right: ' + a1 + ' → ' + JSON.stringify(await state('m7')));
await evalP(NEXT(a1));
const a2 = await evalP(WRONG);
console.error('  B. wrong: ' + a2 + ' → before leaving it: ' + JSON.stringify((await state('m7')).results));
await evalP(NEXT(idOf(a2)));
console.error('  B. …skipped → ' + JSON.stringify(await state('m7')));
const a3 = await evalP(WRONG);
const a3s = await evalP(SOLVE);
console.error('  B. wrong then solved: ' + a3 + ' / ' + a3s + ' → ' + JSON.stringify(await state('m7')));
await evalP(NEXT(a3s));
const a4 = await evalP(SOLVE);
await evalP(NEXT(a4));
await shot('flow-B-runner');
const a5 = await evalP(SOLVE);
await sleep(400);
console.error('  B. two more right (' + a4 + ', ' + a5 + ') → ' + JSON.stringify(await state('m7')));

// C. A 'list' PLAYED: #1 wrong and left, #2 right, #3 right, #1 comes back and is solved.
await start('Tuesday');
await sleep(1500);
const l1 = await evalP(WRONG);
await evalP(NEXT(idOf(l1)));
const l2 = await evalP(SOLVE);
await evalP(NEXT(l2));
const l3 = await evalP(SOLVE);
await evalP(NEXT(l3));
const l4 = await evalP(SOLVE);
await sleep(400);
console.error('  C. list: wrong ' + idOf(l1) + ', right ' + l2 + ', right ' + l3 + ', back to ' + l4 + ' → ' + JSON.stringify(await state('m5')));

// D. The teacher's sheet drawn from the results JUST PLAYED (handed over in
// the page — no Firestore here), then a line → the position.
await evalP(`const app = await import('/js/app.js'); const { Students } = await import('/js/students.js');
  app.showScreen('students');
  Students.resultsSheet(Students.homework.find(x => x.id === 'm7'), { profileName: 'Played in this run' });`);
await sleep(500);
console.error('  D. sheet from played results: ' + JSON.stringify(await evalP(`return {
  totals: [...document.querySelectorAll('.hwr-totals .stu-stat')].map(e => e.innerText.replace(/\\s+/g, ' ')),
  rows: [...document.querySelectorAll('.hwr-row')].map(e => e.innerText.replace(/\\s+/g, ' ')) };`)));
await shot('flow-D-played-results');
await evalP(`document.querySelector('.hwr-row').click();`);
await sleep(600);
console.error('  D. position opened: board ' + await evalP(`return !!document.querySelector('.modal-box .board-wrap .board, .modal-box .board-wrap > *');`) +
  ' · "' + await evalP(`return [...document.querySelectorAll('.modal-box .hint')].pop().textContent;`) + '"');
await shot('flow-D-played-position');
await closeModals();
const sample = await evalP(`const { Students } = await import('/js/students.js'); return JSON.stringify(Students.hwGiven.s_uid[0]);`);

console.error('ERRORS (online run): ' + JSON.stringify(errors, null, 1));

console.error('… offline');
await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
errors.length = 0;
await send('Page.reload', {});
await sleep(4000);
console.error('  offline: ' + JSON.stringify(await evalP(`const keys = await caches.keys(); const { Students } = await import('/js/students.js');
  document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove());
  Students.resultsSheet(${sample}, { profileName: 'Marco' });
  await new Promise(r => setTimeout(r, 400));
  const rows = document.querySelectorAll('.hwr-row').length;
  document.querySelector('.hwr-row').click();
  await new Promise(r => setTimeout(r, 500));
  return { title: document.title, caches: keys, sw: !!navigator.serviceWorker.controller, rows, position: !!document.querySelector('.modal-box .board-wrap') };`)));
await shot('offline-position');
console.error('ERRORS (offline boot): ' + JSON.stringify(errors, null, 1));
ws.close(); chrome.kill();
process.exit(0);
