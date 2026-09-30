// Headless-Chrome verification for Students STAGE 5 (chapter + list homework: cards, student
// page list, assign sheet, Puzzles homework bar). The in-app pane does not
// composite, so screenshots come from a real
// headless Chrome over CDP. Dev tool, not shipped.
//
//   node tools/cdp-verify-students5.mjs http://localhost:9179 tools/stu5-seed.js <outDir>
//
// tools/stu5-seed.js is an async-function body that seeds Students (see HANDOVER) —
// everything signed-in on these shots is SEEDED; Firestore is unreachable here.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';

const APP_URL = process.argv[2] || 'http://localhost:9179';
const SEED = fs.readFileSync(process.argv[3], 'utf8').replace(/'seeded';\s*$/, "return 'seeded';");
const OUT = process.argv[4] || path.join(os.tmpdir(), 'stu5-shots');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp5-'));
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 240000).unref();

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

// Solves the puzzle on the board through Puzzles.userMove — the board's own
// onMove path — so the first-try branch and the counting hook run for real.
const SOLVE = `const { Puzzles } = await import('/js/app.js');
  const sl = ms => new Promise(r => setTimeout(r, ms));
  await sl(900);
  const p = Puzzles.current;
  while (Puzzles.current === p && Puzzles.moveIdx < p.moves.length) {
    const u = p.moves[Puzzles.moveIdx];
    await Puzzles.userMove({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    await sl(500);
  }
  return p.id;`;
const toastText = () => evalP(`const el = document.getElementById('toast'); return el.classList.contains('hidden') ? '' : el.textContent;`);
const startList = `[...document.querySelectorAll('#stu-hw-list .hw-card')].find(c => c.textContent.includes('Tuesday')).querySelector('.btn.primary').click();`;

for (const lang of ['en', 'es']) {
  for (const scheme of ['light', 'dark']) {
    const tag = `${lang}-${scheme}`;
    console.error('… ' + tag);
    await load(lang, scheme);
    console.error('  ' + await evalP(SEED));
    await sleep(400);
    // 1. Student: chapter card, list card, and the "no longer available" one.
    await scrollTo('#stu-hw');
    await sleep(200);
    await shot(`${tag}-1-my-homework`);
    // 2. Teacher: the student page's homework section + "Send puzzle list (2)".
    await evalP(`document.querySelector('#stu-list .stu-card.tappable').click();`);
    await sleep(500);
    await evalP(`document.querySelector('.hw-teacher').scrollIntoView({ block: 'start' });`);
    await sleep(300);
    await shot(`${tag}-2-page-homework`);
    // 3. Assign sheet → Chapter (my classes → chapters).
    await evalP(`document.querySelector('.hw-teacher .btn-wide').click();`);
    await sleep(400);
    await evalP(`document.querySelector('.hw-kind button[data-v="chapter"]').click();`);
    await sleep(500);
    await shot(`${tag}-3-assign-chapter`);
    // 4. Assign sheet → List (the draft, removable).
    await evalP(`document.querySelector('.hw-kind button[data-v="list"]').click();`);
    await sleep(300);
    await shot(`${tag}-4-assign-list`);
    await closeModals();
    // 5. Student: Start the list → Puzzles with the list bar.
    await evalP(startList);
    await sleep(2500);
    await shot(`${tag}-5-list-runner`);
    await evalP(`document.getElementById('puzzle-hw-exit').click();`);
    await sleep(300);
  }
}

// ── The real flows (EN, light) ──
console.error('… flows');
await load('en', 'light');
await evalP(SEED);
errors.length = 0;

// A. The list runner counts a solved puzzle for real.
await evalP(startList);
await sleep(1500);
const first = await evalP(`const { Puzzles } = await import('/js/app.js'); return Puzzles.current && Puzzles.current.id;`);
const solvedId = await evalP(SOLVE);
await sleep(300);
console.error('  list after one solve: ' + JSON.stringify(await evalP(`const { Students } = await import('/js/students.js');
  const h = Students.homework.find(x => x.id === 'm5');
  return { first: ${JSON.stringify(first)}, solved: ${JSON.stringify(solvedId)}, done: h.done, doneIds: h.doneIds, status: h.status,
    pending: Students.hwRun && { addDone: Students.hwRun.addDone, addIds: Students.hwRun.addIds },
    bar: document.getElementById('puzzle-hw').innerText.replace(/\\s+/g, ' ') };`)));
await shot('flow-A-list-counted');
// Next puzzle is the NEXT one in the teacher's order, not a random one.
await evalP(`const { Puzzles } = await import('/js/app.js'); await Puzzles.nextPuzzle();`);
await sleep(300);
console.error('  next in list: ' + await evalP(`const { Puzzles } = await import('/js/app.js'); return Puzzles.current.id;`));

// B. "Give to a student" from the puzzle log review → the draft.
const before = await evalP(`const { Students } = await import('/js/students.js'); return Students.hwDraft.s_uid.length;`);
await evalP(`document.querySelector('#puzzle-log .plog-dot').click();`);
await sleep(500);
await shot('flow-B-log-review');
await evalP(`[...document.querySelectorAll('.modal-box .btn')].find(b => b.textContent.includes('🎯')).click();`);
await sleep(300);
console.error('  draft ' + before + ' → ' + await evalP(`const { Students } = await import('/js/students.js'); return Students.hwDraft.s_uid.length;`) + ' · toast: ' + await toastText());
await shot('flow-B-added-toast');
await evalP(`[...document.querySelectorAll('.modal-box .btn')].find(b => b.textContent.includes('🎯')).click();`);
await sleep(200);
console.error('  again → toast: ' + await toastText());
await closeModals();
await evalP(`document.getElementById('puzzle-hw-exit').click();`);

// C. The chapter: open (SEEDED — openForHomework's network part needs a
// Firebase user), then stepped for REAL through Analysis's own buttons.
const openRes = await evalP(`const { Masterclass } = await import('/js/masterclass.js'); const { Students } = await import('/js/students.js');
  const a = await import('/js/app.js');
  const real = await Masterclass.openForHomework('mc1', 'ch1');
  Masterclass.openChapter(Masterclass.chapters[0]); a.Analysis.tree.toStart(); a.Analysis.refresh();
  const h = Students.homework.find(x => x.id === 'm4');
  const run = Students.hwBegin(h); run.mcId = 'mc1'; run.chapterId = 'ch1'; run.armed = true;
  return { realOpenWithoutUser: real, screen: document.querySelector('.screen.active')?.id, atStart: a.Analysis.tree.atStart(), status: h.status };`);
console.error('  chapter opened: ' + JSON.stringify(openRes));
const st = () => evalP(`const { Students } = await import('/js/students.js'); const a = await import('/js/app.js'); const h = Students.homework.find(x => x.id === 'm4'); return h.status + ' @ ' + (a.Analysis.tree.current.san || 'start');`);
await evalP(`document.getElementById('ana-next').click();`); await sleep(200);
console.error('  after ▶: ' + await st());
await evalP(`const a = await import('/js/app.js'); const t = a.Analysis.tree; const e5 = t.root.children[0].children[0]; t.goto(e5.children[1].children[0].children[0]); a.Analysis.refresh();`);
await sleep(200);
console.error('  at the END of a variation: ' + await st());
await evalP(`document.getElementById('ana-first').click();`); await sleep(150);
await evalP(`document.getElementById('ana-last').click();`); await sleep(400);
console.error('  after ⏭ (main line end): ' + await st() + ' · run: ' + await evalP(`const { Students } = await import('/js/students.js'); return JSON.stringify(Students.hwRun);`) + ' · toast: ' + await toastText());
await shot('flow-C-chapter-done');

// D. The assign sheet's output, read from its promise.
const spec = await evalP(`const { Students } = await import('/js/students.js');
  const p = Students.who('s_uid'); const r = Students.reports['s_uid'];
  const click = () => [...document.querySelectorAll('.modal-box .row .btn.primary')].pop().click();
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const pr = Students.assignSheet(p, r, 'chapter'); await wait(400);
  document.querySelector('.hw-chs').value = 'ch2'; click();
  const chapter = await pr;
  const pr2 = Students.assignSheet(p, r, 'list'); await wait(300);
  document.querySelector('.hw-ls-row .btn').click(); await wait(100);
  document.querySelector('.hw-due').value = '2026-10-09'; click();
  const list = await pr2;
  return { chapter, list: { ...list, params: { n: list.params.puzzles.length, first: list.params.puzzles[0] } }, draftLeft: Students.hwDraft.s_uid.length };`);
console.error('  specs: ' + JSON.stringify(spec));

console.error('ERRORS (online run): ' + JSON.stringify(errors, null, 1));

console.error('… offline');
await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
errors.length = 0;
await send('Page.reload', {});
await sleep(4000);
console.error('  offline: ' + JSON.stringify(await evalP(`const keys = await caches.keys(); const { Students } = await import('/js/students.js'); return { title: document.title, caches: keys, sw: !!navigator.serviceWorker.controller, chapterStep: typeof Students.hwChapterStep };`)));
console.error('ERRORS (offline boot): ' + JSON.stringify(errors, null, 1));
ws.close(); chrome.kill();
process.exit(0);
