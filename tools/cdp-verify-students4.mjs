// Headless-Chrome verification for Students STAGE 4 (homework: cards, student
// page list, assign sheet, Puzzles homework bar). The in-app pane does not
// composite, so screenshots come from a real
// headless Chrome over CDP. Dev tool, not shipped.
//
//   node tools/cdp-verify-students4.mjs http://localhost:9179 tools/stu4-seed.js <outDir>
//
// tools/stu4-seed.js is an async-function body that seeds Students (see HANDOVER) —
// everything signed-in on these shots is SEEDED; Firestore is unreachable here.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';

const APP_URL = process.argv[2] || 'http://localhost:9179';
const SEED = fs.readFileSync(process.argv[3], 'utf8').replace(/'seeded';\s*$/, "return 'seeded';");
const OUT = process.argv[4] || path.join(os.tmpdir(), 'stu4-shots');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp4-'));
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

for (const lang of ['en', 'es']) {
  for (const scheme of ['light', 'dark']) {
    const tag = `${lang}-${scheme}`;
    console.error('… ' + tag);
    await load(lang, scheme);
    console.error('  ' + await evalP(SEED));
    await sleep(400);
    console.error('  dot after viewing: ' + await evalP(`return document.querySelector('#tabbar button[data-screen="students"]').classList.contains('has-dot');`));
    // 1. The student's homework cards (top of the screen).
    await scrollTo('#stu-hw');
    await sleep(200);
    await shot(`${tag}-1-my-homework`);
    // 2. The done list unfolded + the roster card with the homework line.
    await evalP(`document.querySelector('.hw-done-list').open = true;`);
    await scrollTo('#stu-list');
    await sleep(200);
    await shot(`${tag}-2-roster-card`);
    // 3. The student page, scrolled to the homework section (teacher view).
    await evalP(`document.querySelector('#stu-list .stu-card.tappable').click();`);
    await sleep(500);
    await evalP(`const b = document.querySelector('.stu-page'); b.scrollTop = b.scrollHeight;`);
    await sleep(300);
    await shot(`${tag}-3-page-homework`);
    // 4. The assign sheet on top of it, two themes picked.
    await evalP(`document.querySelector('.hw-teacher .btn-wide').click();`);
    await sleep(500);
    await evalP(`const c = document.querySelectorAll('.hw-chip'); c[0].click(); c[1].click();`);
    await sleep(200);
    await shot(`${tag}-4-assign-puzzles`);
    await evalP(`const m = [...document.querySelectorAll('.modal-box')].pop(); m.scrollTop = m.scrollHeight;`);
    await sleep(200);
    await shot(`${tag}-4b-assign-bottom`);
    await evalP(`document.querySelector('.hw-kind button[data-v="text"]').click();`);
    await sleep(200);
    await shot(`${tag}-4c-assign-text`);
    await closeModals();
    // 5. Start → Puzzles in homework mode.
    await evalP(`document.querySelector('#stu-hw-list .hw-card .btn.primary').click();`);
    await sleep(3500);
    await shot(`${tag}-5-puzzles-hw-bar`);
    console.error('  puzzles: ' + JSON.stringify(await evalP(`const { Puzzles } = await import('/js/app.js'); return { bar: document.getElementById('puzzle-hw').innerText.replace(/\s+/g, ' '), cur: Puzzles.current && [Puzzles.current.rating, Puzzles.current.themes.includes('fork')], themeBtnHidden: document.getElementById('puzzle-theme-btn').classList.contains('hidden') };`)));
    await evalP(`document.getElementById('puzzle-hw-exit').click();`);
    await sleep(300);
  }
}

// The assign sheet's output, read straight from the promise (no Firebase user,
// so going through the Assign button would write nothing anyway).
console.error('… assign spec');
await load('en', 'light');
await evalP(SEED);
const spec = await evalP(`const { Students } = await import('/js/students.js');
  const p = Students.who('s_uid'); const r = Students.reports['s_uid'];
  const pr = Students.assignSheet(p, r);
  await new Promise(r => setTimeout(r, 300));
  const c = document.querySelectorAll('.hw-chip'); c[0].click(); c[2].click();
  document.querySelector('.hw-count').value = '12';
  document.querySelector('.hw-due').value = '2026-10-09';
  [...document.querySelectorAll('.modal-box .row .btn.primary')].pop().click();
  const a = await pr;
  const pr2 = Students.assignSheet(p, r);
  await new Promise(r => setTimeout(r, 300));
  document.querySelector('.hw-min').value = '1600'; document.querySelector('.hw-max').value = '1500';
  [...document.querySelectorAll('.modal-box .row .btn.primary')].pop().click();
  await new Promise(r => setTimeout(r, 200));
  const badBand = document.querySelector('.toast')?.textContent;
  document.querySelector('.hw-kind button[data-v="text"]').click();
  document.querySelector('.hw-title').value = 'Read chapter 3';
  document.querySelector('.hw-note-in').value = 'Pages 40-52';
  [...document.querySelectorAll('.modal-box .row .btn.primary')].pop().click();
  const b = await pr2;
  return { puzzles: a, badBand, text: b };`);
console.error('  ' + JSON.stringify(spec));

console.error('ERRORS (online run): ' + JSON.stringify(errors, null, 1));

// Offline boot: the SW (v116) must serve the app.
console.error('… offline');
await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
errors.length = 0;
await send('Page.reload', {});
await sleep(4000);
console.error('  offline: ' + JSON.stringify(await evalP(`const keys = await caches.keys(); const { Students } = await import('/js/students.js'); return { title: document.title, caches: keys, sw: !!navigator.serviceWorker.controller, hwBar: !!document.getElementById('puzzle-hw'), students: typeof Students.hwSolved };`)));
console.error('ERRORS (offline boot): ' + JSON.stringify(errors, null, 1));
ws.close(); chrome.kill();
process.exit(0);
