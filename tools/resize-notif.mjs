// Shrinks the daily-reminder art into the two files a notification uses.
// Dev tool, not shipped. Needs the source drawing, which git does not track:
// Notification/Daily reminder.png.
//
//   node tools/resize-notif.mjs [previewDir]
//
//   icons/notif/daily.png  192x192, the whole artwork fitted inside, transparent ground
//   icons/notif/badge.png   96x96, white on transparent, from the alpha of icons/logo-mark.png
//   icons/notif/daily-wide.jpg  960x480, the same artwork on navy: the large picture
//                               Android shows when the notification is expanded
//
// No image library on this machine, so headless Chrome does the drawing
// (same launch and CDP plumbing as tools/cdp-verify-streak-grey.mjs).
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const WEB = 9900 + Math.floor(Math.random() * 90);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-notif-'));
// Optional: a folder OUTSIDE the repo to also write each result on a navy ground.
const PREVIEW = process.argv[2];
if (PREVIEW) fs.mkdirSync(PREVIEW, { recursive: true });
setTimeout(() => { console.error('TIMEOUT'); process.exit(2); }, 120000).unref();

const JOBS = [
  ['/Notification/Daily%20reminder.png', 192, false, 'icons/notif/daily.png'],
  ['/icons/logo-mark.png', 96, true, 'icons/notif/badge.png'],
];

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>resize</title>'); return; }
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(WEB, '127.0.0.1', r));

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
function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
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
  }
});
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: `http://localhost:${WEB}/` });
await sleep(800);

// In-page: draw `src` fitted inside a size×size transparent canvas. With
// `silhouette`, every visible pixel becomes opaque white (Android draws the
// badge from the alpha channel alone; a colour image there is a white square).
// Also reports how much of the result is see-through, so a source with no
// transparency (a solid square badge) is caught here and not on a phone.
const SHRINK = `async function shrink(src, size, silhouette) {
  const img = new Image(); img.src = src; await img.decode();
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const k = Math.min(size / img.width, size / img.height);
  const w = Math.round(img.width * k), h = Math.round(img.height * k);
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, Math.round((size - w) / 2), Math.round((size - h) / 2), w, h);
  const d = g.getImageData(0, 0, size, size);
  let clear = 0;
  for (let i = 0; i < d.data.length; i += 4) {
    if (d.data[i + 3] < 16) clear++;
    if (silhouette) d.data[i] = d.data[i + 1] = d.data[i + 2] = 255;
    // Colour art: drop the two lowest bits of each colour. Invisible at this
    // size, and it is what brings the file under the 60 KB the spec asks for.
    else for (let j = 0; j < 3; j++) d.data[i + j] = Math.min(255, Math.round(d.data[i + j] / 4) * 4);
  }
  g.putImageData(d, 0, 0);
  const b64 = c.toDataURL('image/png').split(',')[1];
  // The same picture on the app's navy, for looking at: a white badge on a
  // transparent ground shows as nothing in an image viewer.
  g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#0f1b33'; g.fillRect(0, 0, size, size);
  return { b64, onNavy: c.toDataURL('image/png').split(',')[1], from: img.width + 'x' + img.height, clear: Math.round(100 * clear / (size * size)) };
}`;

// In-page: the wide picture. Android crops an expanded notification's image to
// about 2:1, so a square would lose the ears. The artwork is a bust that already
// ends in a cut, so it is drawn taller than the banner and runs off the bottom
// edge: head, hand and brooch all stay inside. Opaque, so JPEG.
const BANNER = `async function banner(src, w, h) {
  const img = new Image(); img.src = src; await img.decode();
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const bg = g.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, w * 0.6);
  bg.addColorStop(0, '#22386a'); bg.addColorStop(1, '#0f1b33');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  const ih = Math.round(h * 1.25), iw = Math.round(img.width * ih / img.height);
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, Math.round((w - iw) / 2), Math.round(h * 0.04), iw, ih);
  return { b64: c.toDataURL('image/jpeg', 0.86).split(',')[1], from: img.width + 'x' + img.height };
}`;
const WIDE = ['/Notification/Daily%20reminder.png', 960, 480, 'icons/notif/daily-wide.jpg'];

let bad = false;
try {
  {
    const [src, w, h, out] = WIDE;
    const r = await send('Runtime.evaluate', { expression: `(async()=>{ ${BANNER}; return banner(${JSON.stringify(src)}, ${w}, ${h}); })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(src + ': ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
    const file = path.join(ROOT, out);
    fs.writeFileSync(file, Buffer.from(r.result.value.b64, 'base64'));
    if (PREVIEW) fs.copyFileSync(file, path.join(PREVIEW, path.basename(out)));
    console.log(`${out}  ${w}x${h}  from ${r.result.value.from}  ${(fs.statSync(file).size / 1024).toFixed(1)} KB`);
  }
  for (const [src, size, silhouette, out] of JOBS) {
    const r = await send('Runtime.evaluate', { expression: `(async()=>{ ${SHRINK}; return shrink(${JSON.stringify(src)}, ${size}, ${silhouette}); })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(src + ': ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
    const v = r.result.value;
    const file = path.join(ROOT, out);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(v.b64, 'base64'));
    if (PREVIEW) fs.writeFileSync(path.join(PREVIEW, path.basename(out, '.png') + '-on-navy.png'), Buffer.from(v.onNavy, 'base64'));
    console.log(`${out}  ${size}x${size}  from ${v.from}  ${(fs.statSync(file).size / 1024).toFixed(1)} KB  ${v.clear}% transparent`);
  }
} catch (e) { bad = true; console.error('FAILED', e.message); }

chrome.kill(); server.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(bad ? 1 : 0);
