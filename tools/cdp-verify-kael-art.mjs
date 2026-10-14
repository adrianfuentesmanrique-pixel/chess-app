// Every place the Kael pictures show, after the 2026-10-14 art swap
// (tools/kael-art.py): a screenshot of each, plus a 4x close-up of the small
// circles, at 375 x 667 in ES and EN, light and dark. Dev tool, not shipped.
// Headless Chrome over CDP, signed out, no service worker (the notification
// pictures are tools/cdp-verify-remind.mjs's job).
//
//   node tools/cdp-verify-kael-art.mjs <outDir>
//
// REALLY TAPPED: the level picker and the tour offer (a fresh profile each
// time). CALLED: CalcUI.open() (its intro is the first-visit modal),
// RemindInvite.kael(), History.open() with no games, showScreen('puzzles')
// for the corner button. SYNTHETIC: one modal with the bust at the full
// .kael-portrait width (130px), the markup GameReview uses (js/app.js), since
// a real review needs a finished game.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/cdp-verify-kael-art.mjs <outDir>'); process.exit(1); }
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const WEB = 9900 + Math.floor(Math.random() * 90);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-kael-'));
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
  else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') errors.push('LOG ' + (msg.params.entry.text + ' ' + (msg.params.entry.url || '')).slice(0, 300));
});
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok }); console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); };
const shot = async name => fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
// A 4x close-up of one element, padded a little so its ring shows.
const zoom = async (name, sel) => {
  const r = await ev(`const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left - 4, y: b.top - 4, width: b.width + 8, height: b.height + 8 };`);
  if (!r) return;
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png', clip: { ...r, scale: 4 } })).data, 'base64'));
};
const until = async (expr, ms = 8000) => { for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (await ev(`return !!(${expr});`)) return true; await sleep(60); } return false; };
const touch = (type, p) => send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }] : [] });
const tapAt = async pt => { await touch('touchStart', pt); await sleep(40); await touch('touchEnd'); await sleep(220); };
const tap = async sel => tapAt(await ev(`const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`));
const booted = () => until(`document.getElementById('splash').classList.contains('hide')`, 20000);
const open = async () => { await send('Page.navigate', { url: `http://localhost:${WEB}/` }); await booted(); await sleep(600); };
const closeModals = () => ev(`document.querySelectorAll('.modal-back').forEach(m => m.remove());`);
// Every Kael picture on the page: loaded, the new file (its real width), and
// how big it is drawn.
const pics = sel => ev(`return [...document.querySelectorAll(${JSON.stringify(sel)})].filter(i => i.getBoundingClientRect().width > 0).map(i => ({ src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0, nw: i.naturalWidth, w: Math.round(i.getBoundingClientRect().width), h: Math.round(i.getBoundingClientRect().height) }));`);
const NEW_W = { 'icons/kael/kael-bust.png': 390, 'icons/kael/kael-welcome.png': 390, 'icons/notif/daily.png': 192 };
const picOk = (list, src) => list.length > 0 && list.every(p => p.ok && p.src === src && p.nw === NEW_W[src]);

let failed = false;
try {
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: `http://localhost:${WEB}/` }); await sleep(800);
  for (const [lang, scheme] of [['es', 'light'], ['es', 'dark'], ['en', 'light'], ['en', 'dark']]) {
    const tag = `${lang}-${scheme}`;
    console.log(`\n── ${tag} ──`);
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await send('Storage.clearDataForOrigin', { origin: `http://localhost:${WEB}`, storageTypes: 'all' });
    await ev(`localStorage.setItem('lang', '${lang}');`);
    await open();

    // A fresh profile: the level picker (kael-welcome), then the tour offer.
    check(`[${tag}] level picker shows kael-welcome`, await until(`document.querySelector('.modal-back .kael-portrait')`, 6000) && picOk(await pics('.modal-back .kael-portrait'), 'icons/kael/kael-welcome.png'), await pics('.modal-back .kael-portrait'));
    await sleep(300); await shot(`${tag}-1-picker`);
    await tap('.modal-back .btn.primary.big');
    await tap('.modal-back .kael-level-cell');
    await tap('.modal-back .btn.primary.big');
    await until(`document.querySelector('.modal-back .btn.quiet')`, 5000); await sleep(300);
    check(`[${tag}] tour offer shows kael-welcome`, picOk(await pics('.modal-back .kael-portrait'), 'icons/kael/kael-welcome.png'), await pics('.modal-back .kael-portrait'));
    await shot(`${tag}-2-tour-offer`);
    await tap('.modal-back .btn.primary.big');
    check(`[${tag}] tour card shows the bust in its circle`, await until(`document.querySelector('.tour-kael')`, 5000) && picOk(await pics('.tour-kael'), 'icons/kael/kael-bust.png'), await pics('.tour-kael'));
    await sleep(500); await shot(`${tag}-3-tour-step`); await zoom(`${tag}-3z-tour-kael`, '.tour-kael');
    await ev(`(await import('/js/tour.js')).default.end?.();`).catch(() => {});
    await ev(`document.getElementById('tour-root')?.remove(); const db = await import('/js/db.js'); await db.kvSet('tourDone', 'completed'); await db.kvSet('onboardingDone', true);`);
    await open();

    // Home: the 44px ring.
    await ev(`document.querySelector('main').scrollTop = 0;`); await sleep(300);
    check(`[${tag}] Home: the bust in the gold ring`, picOk(await pics('#screen-home .home-kael-pic, .home-kael-pic'), 'icons/kael/kael-bust.png'), await pics('.home-kael-pic'));
    await shot(`${tag}-4-home`); await zoom(`${tag}-4z-home-kael`, '.home-kael-pic');

    // Away from Home: the corner button.
    await ev(`(await import('/js/app.js')).showScreen?.('puzzles') ?? document.querySelector('[data-screen="puzzles"]')?.click();`).catch(() => {});
    await sleep(900); await closeModals();
    check(`[${tag}] the corner button (#kael-fab) shows the bust`, picOk(await pics('#kael-fab img'), 'icons/kael/kael-bust.png'), await pics('#kael-fab img'));
    await shot(`${tag}-5-fab`); await zoom(`${tag}-5z-fab`, '#kael-fab');

    // Calc: the first-visit intro (bust at 90px), then the 32px line.
    await ev(`localStorage.removeItem('calcIntroDone'); const { CalcUI } = await import('/js/calc-ui.js'); CalcUI.open();`);
    await until(`document.querySelector('.modal-back .kael-portrait')`, 6000); await sleep(400);
    check(`[${tag}] calc intro: the bust at 90px`, picOk(await pics('.modal-back .kael-portrait'), 'icons/kael/kael-bust.png'), await pics('.modal-back .kael-portrait'));
    await shot(`${tag}-6-calc-intro`);
    await closeModals(); await sleep(300);
    check(`[${tag}] calc line: the bust at 32px`, picOk(await pics('#calc-say img'), 'icons/kael/kael-bust.png'), await pics('#calc-say img'));
    await shot(`${tag}-7-calc-say`); await zoom(`${tag}-7z-calc-say`, '#calc-say img');

    // The reminder invitation: daily.png at 110px.
    await ev(`const { RemindInvite } = await import('/js/app.js'); RemindInvite.kael('Kael', [['OK', () => null]]);`);
    await until(`document.querySelector('.modal-back .kael-portrait')`, 4000); await sleep(400);
    check(`[${tag}] reminder invitation: daily.png`, picOk(await pics('.modal-back .kael-portrait'), 'icons/notif/daily.png'), await pics('.modal-back .kael-portrait'));
    await shot(`${tag}-8-invite`); await closeModals();

    // The bust at the full portrait width, as in GameReview.
    await ev(`const { modal } = await import('/js/app.js'); modal(box => { box.innerHTML = '<div class="kael-modal-head"><img src="icons/kael/kael-bust.png" class="kael-portrait" alt="Kael"></div><p>GameReview</p>'; });`);
    await sleep(500);
    check(`[${tag}] modal portrait: the bust at 130px`, picOk(await pics('.modal-back .kael-portrait'), 'icons/kael/kael-bust.png'), await pics('.modal-back .kael-portrait'));
    await shot(`${tag}-9-portrait`); await closeModals();

    // History with no games: .kael-empty.
    await ev(`const app = await import('/js/app.js'); app.showScreen?.('play'); (await import('/js/history.js')).open();`).catch(e => console.log('history', e.message));
    await until(`document.querySelector('.kael-empty .kael-portrait')`, 6000); await sleep(400);
    check(`[${tag}] history, no games: the bust`, picOk(await pics('.kael-empty .kael-portrait'), 'icons/kael/kael-bust.png'), await pics('.kael-empty .kael-portrait'));
    await shot(`${tag}-10-history`);
  }
} catch (e) { failed = true; console.error('FAILED', e.message); }

const bad = checks.filter(c => !c.ok).length;
console.log(`\n${checks.length - bad}/${checks.length} checks pass; page errors: ${errors.length}`);
for (const e of errors) console.log('  ' + e);
chrome.kill(); server.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(failed || bad ? 1 : 0);
