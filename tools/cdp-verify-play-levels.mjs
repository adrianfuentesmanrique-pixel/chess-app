// Headless-Chrome check of the level picker on Play's setup screen: each button
// reads its name and "Level N" / "Nivel N" (no rating numbers: none could be
// measured offline, 2026-10-12), nothing is wider than 375px, in light and
// dark, Spanish and English. Dev tool, not shipped.
//
//   node tools/cdp-verify-play-levels.mjs <outDir>
//
// READ FROM THE PAGE: the eight buttons' text and boxes. PICTURES: one per
// language and scheme in <outDir>, to be opened and looked at.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/cdp-verify-play-levels.mjs <outDir>'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 300000).unref();
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = url => new Promise((res, rej) => {
  http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});

const port = 9900 + Math.floor(Math.random() * 90);
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
});
await new Promise(r => server.listen(port, '127.0.0.1', r));

const dbg = 9300 + Math.floor(Math.random() * 600);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-'));
const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${dbg}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let ws, msgId = 0;
const pending = new Map();
for (let i = 0; i < 40; i++) {
  try {
    const page = (await getJSON(`http://127.0.0.1:${dbg}/json`)).find(t => t.type === 'page');
    if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
  } catch {}
  await sleep(250);
}
await new Promise(r => ws.on('open', r));
ws.on('message', m => {
  const msg = JSON.parse(m);
  if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result); }
});
const send = (method, params = {}) => { const id = ++msgId; ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => pending.set(id, { res, rej })); };
const evalP = async expr => {
  const r = await send('Runtime.evaluate', { expression: `(async()=>{ ${expr} })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
  return r.result.value;
};

let bad = 0;
const say = (ok, text) => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`); };
try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: `http://localhost:${port}` });
  await sleep(4000);
  await evalP(`const db = await import('/js/db.js'); await db.kvSet('onboardingDone', true); await db.kvSet('tourDone', true);`);
  for (const [lang, scheme] of [['es', 'light'], ['es', 'dark'], ['en', 'light'], ['en', 'dark']]) {
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await evalP(`localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1');`);
    await send('Page.reload', {});
    await sleep(3500);
    await evalP(`document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove()); document.querySelector('#tabbar button[data-screen="play"]').click();`);
    await sleep(600);
    await evalP(`document.getElementById('play-level').scrollIntoView({ block: 'center' });`);
    await sleep(300);
    const L = await evalP(`
      const bs = [...document.querySelectorAll('#play-level button')];
      return { pageW: document.documentElement.scrollWidth,
        bg: getComputedStyle(document.body).backgroundColor,
        rows: bs.map(b => { const r = b.getBoundingClientRect(), e = b.querySelector('.lv-elo'), n = b.querySelector('.lv-name');
          return { name: n.textContent, sub: e.textContent, left: Math.round(r.left), right: Math.round(r.right),
            clipped: e.scrollWidth > e.clientWidth + 1 || n.scrollWidth > n.clientWidth + 1, subColor: getComputedStyle(e).color }; }) };`);
    const word = lang === 'es' ? 'Nivel' : 'Level';
    const tag = `${lang}-${scheme}`;
    say(L.rows.length === 8 && L.rows.every((r, i) => r.sub === `${word} ${i + 1}`), `${tag}: the eight buttons read "${word} 1" to "${word} 8" (${L.rows.map(r => r.name + ' / ' + r.sub).join(', ')})`);
    say(L.rows.every(r => !/\d{3}/.test(r.sub + r.name)), `${tag}: no rating number on any button`);
    say(L.pageW <= 375 && L.rows.every(r => r.left >= 0 && r.right <= 375 && !r.clipped), `${tag}: nothing wider than 375 or cut off (page ${L.pageW})`);
    console.log(`     page background ${L.bg}, label colour ${L.rows[0].subColor}`);
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, `play-levels-${tag}.png`), Buffer.from(r.data, 'base64'));
  }
} catch (e) { say(false, e.message); }
finally {
  try { ws.close(); } catch {}
  proc.kill();
  await new Promise(r => { server.close(r); server.closeAllConnections(); });
  await sleep(800);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
console.log(bad ? `\n${bad} FAILED` : '\nALL PASSED');
process.exit(bad ? 1 : 0);
