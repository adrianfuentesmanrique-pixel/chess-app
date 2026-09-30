// Headless-Chrome verification for Students STAGE 3 (active time + student
// page). The in-app pane does not composite, so screenshots come from a real
// headless Chrome over CDP. Dev tool, not shipped.
//
//   node tools/cdp-verify-students3.mjs http://localhost:9178 <seed.js> <outDir>
//
// <seed.js> is an async-function body that seeds Students (see HANDOVER) —
// everything signed-in on these shots is SEEDED; Firestore is unreachable here.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';

const APP_URL = process.argv[2] || 'http://localhost:9178';
const SEED = fs.readFileSync(process.argv[3], 'utf8').replace(/'seeded';\s*$/, "return 'seeded';");
const OUT = process.argv[4] || path.join(os.tmpdir(), 'stu3-shots');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp3-'));
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

for (const lang of ['en', 'es']) {
  for (const scheme of ['light', 'dark']) {
    const tag = `${lang}-${scheme}`;
    console.error('… ' + tag);
    await load(lang, scheme);
    console.error('  ' + await evalP(SEED));
    await sleep(400);
    await shot(`${tag}-1-screen`);
    // The student page for the seeded student with data (first card).
    await evalP(`document.querySelector('#stu-list .stu-card.tappable').click();`);
    await sleep(400);
    await shot(`${tag}-2-page-top`);
    await evalP(`const b = document.querySelector('.stu-page'); b.scrollTop = b.scrollHeight;`);
    await sleep(300);
    await shot(`${tag}-3-page-bottom`);
    if (lang === 'en' && scheme === 'light') {
      await evalP(`document.querySelector('.stu-more').click(); const b = document.querySelector('.stu-page'); b.scrollTop = b.scrollHeight;`);
      await sleep(300);
      await shot(`${tag}-3b-themes-all`);
    }
    // A rating tile opens the Profile chart with the student's history.
    await evalP(`document.querySelector('.stu-page-tiles .stu-stat').click();`);
    await sleep(900);
    await shot(`${tag}-4-chart`);
    console.error('  chart: ' + JSON.stringify(await evalP(`const m = [...document.querySelectorAll('.modal-box')].pop(); return { title: m.querySelector('h3')?.textContent, canvas: !!m.querySelector('canvas'), share: [...m.querySelectorAll('button')].map(b => b.textContent) };`)));
    await evalP(`document.querySelectorAll('.modal-back').forEach(e => e.remove());`);
    // The student's own view ("what my teachers see"), from local kv.
    await evalP(`document.querySelector('.stu-mine').click();`);
    await sleep(900);
    await shot(`${tag}-5-self`);
    await evalP(`document.querySelectorAll('.modal-back').forEach(e => e.remove());`);
  }
}

// Offline boot: the SW (v115) must serve the app, with js/activity.js cached.
console.error('… offline');
await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
errors.length = 0;
await send('Page.reload', {});
await sleep(4000);
console.error('  offline: ' + JSON.stringify(await evalP(`const { Activity } = await import('/js/activity.js'); const keys = await caches.keys(); return { title: document.title, activityLoaded: Activity.loaded, caches: keys, sw: !!navigator.serviceWorker.controller };`)));
console.error('ERRORS (offline boot): ' + JSON.stringify(errors, null, 1));
ws.close(); chrome.kill();
process.exit(0);
