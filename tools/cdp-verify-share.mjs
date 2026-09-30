// Headless-Chrome verification for files arriving from other apps: the
// "Open with" file-handler URL (?open-file=1) and the share-target hand-off
// (?shared=1 with a file stashed by the service worker). Runs every case in
// EN/ES x light/dark at 375px, plus an offline boot. Dev tool, not shipped.
//
//   node tools/cdp-verify-share.mjs http://localhost:9182 [shotsDir]
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';

const APP_URL = process.argv[2] || 'http://localhost:9182';
const SHOTS = process.argv[3] || '';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-share-'));
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 240000).unref();

// A tiny but real PDF (one page, "Test Book") so Read.importFile succeeds.
const PDF_B64 = fs.readFileSync(new URL('./fixtures/TestBook.pdf', import.meta.url)).toString('base64');
const PGN = '[Event "Emu"]\n[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 1-0\n';

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
const consoleErrors = [];
function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
}
async function evalP(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function load(url) {
  await send('Page.navigate', { url });
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    if (await evalP('document.readyState === "complete" && !!document.getElementById("screen-analysis")').catch(() => false)) break;
  }
}
const state = `({
  screen: [...document.querySelectorAll('section.screen')].find(s => !s.classList.contains('hidden'))?.id,
  toast: document.getElementById('toast').classList.contains('hidden') ? '' : document.getElementById('toast').textContent,
  books: document.querySelectorAll('#screen-read .book, #screen-read [class*="book-card"]').length,
  base: document.querySelector('#screen-base h2, #screen-base .base-title, #screen-base [id*="base-name"]')?.textContent || '',
})`;

// Stash a file exactly the way sw.js does after a share-target POST.
const stash = (b64, type, name) => `(async () => {
  const bin = Uint8Array.from(atob(${JSON.stringify(b64)}), c => c.charCodeAt(0));
  const c = await caches.open('ctc-shared-inbox');
  await c.put('/__ctc-shared', new Response(new Blob([bin], { type: ${JSON.stringify(type)} }), {
    headers: { 'content-type': ${JSON.stringify(type)}, 'x-file-name': encodeURIComponent(${JSON.stringify(name)}) } }));
  return true;
})()`;

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  → ' + JSON.stringify(detail)}`);
}
async function shot(name) {
  if (!SHOTS) return;
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.data, 'base64'));
}

const T = {
  en: { receiving: 'Receiving the file…', failed: "Couldn't receive the file on open.", unsupported: 'I can only open PDF or PGN files.' },
  es: { receiving: 'Recibiendo el archivo…', failed: 'No pude recibir el archivo al abrirlo.', unsupported: 'Solo puedo abrir archivos PDF o PGN.' },
};

async function main() {
  let targets;
  for (let i = 0; i < 40; i++) {
    try { targets = await getJSON(`http://127.0.0.1:${PORT}/json`); break; } catch { await sleep(250); }
  }
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));
  ws.on('message', m => {
    const d = JSON.parse(m);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
    if (d.method === 'Runtime.exceptionThrown') consoleErrors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') consoleErrors.push(d.params.args.map(a => a.value ?? a.description).join(' '));
  });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });

  await load(APP_URL + '/');
  await sleep(2500);   // let the SW install

  for (const lang of ['en', 'es']) {
    for (const theme of ['light', 'dark']) {
      const tag = `${lang}-${theme}`;
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
      await evalP(`localStorage.setItem('lang', '${lang}'); localStorage.setItem('onboarded', '1'); true`);

      // 1. "Open with" URL, no file ever arrives (the TWA case).
      await load(APP_URL + '/?open-file=1');
      await sleep(900);
      let s = await evalP(state);
      check(`${tag} open-file: stays off Read, says receiving`, s.screen === 'screen-analysis' && s.toast === T[lang].receiving, s);
      await sleep(2600);
      s = await evalP(state);
      check(`${tag} open-file: failure toast, still not on Read`, s.screen === 'screen-analysis' && s.toast.startsWith(T[lang].failed), s);
      check(`${tag} open-file: URL cleaned`, !(await evalP('location.search')), await evalP('location.search'));
      check(`${tag} theme applied`, await evalP(`document.body.classList.contains('mode-${theme}')`), theme);
      await shot(`open-file-failed-${tag}`);

      // 2. Share target: PDF → Read.
      await evalP(stash(PDF_B64, 'application/pdf', 'TestBook.pdf'));
      await load(APP_URL + '/?shared=1');
      await sleep(3500);
      s = await evalP(state);
      check(`${tag} shared PDF → Read`, s.screen === 'screen-read', s);
      await shot(`shared-pdf-${tag}`);

      // 3. Share target: PGN → new base.
      await evalP(stash(Buffer.from(PGN).toString('base64'), 'application/x-chess-pgn', 'ShareLines.pgn'));
      await load(APP_URL + '/?shared=1');
      await sleep(3000);
      s = await evalP(state);
      check(`${tag} shared PGN → new base`, s.screen === 'screen-base' && /ShareLines/.test(await evalP('document.getElementById("screen-base").textContent')), s);

      // 4. PGN labelled application/octet-stream with a junk name → new base.
      await evalP(stash(Buffer.from(PGN).toString('base64'), 'application/octet-stream', 'OctetLines.dat'));
      await load(APP_URL + '/?shared=1');
      await sleep(3000);
      s = await evalP(state);
      check(`${tag} octet-stream PGN → new base`, s.screen === 'screen-base' && /OctetLines/.test(await evalP('document.getElementById("screen-base").textContent')), s);

      // 5. Binary junk → refused, stays where boot landed.
      await evalP(stash(Buffer.from([0, 1, 2, 3, 0, 255, 254, 0, 9, 9]).toString('base64'), 'application/octet-stream', 'junk.bin'));
      await load(APP_URL + '/?shared=1');
      await sleep(1500);
      s = await evalP(state);
      check(`${tag} junk → share_unsupported`, s.toast === T[lang].unsupported && s.screen === 'screen-analysis', s);
    }
  }

  // 6. Offline boot from the service-worker cache.
  const errsBefore = consoleErrors.length;
  await send('Network.enable');
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await load(APP_URL + '/');
  await sleep(2500);
  const s = await evalP(state);
  check('offline boot renders the app', s.screen === 'screen-analysis', s);
  const offlineErrs = consoleErrors.slice(errsBefore);

  // App Check / Firebase network failures are expected (localhost, offline).
  const noise = /app-?check|firebase|firestore|googleapis|gstatic|ERR_INTERNET_DISCONNECTED|Failed to fetch|403|net::/i;
  const real = consoleErrors.filter(e => !noise.test(e));
  check('no unexpected console errors', real.length === 0, real.slice(0, 5));
  console.log(`(offline-phase errors, all filtered as expected noise: ${offlineErrs.length})`);

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  chrome.kill();
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); chrome.kill(); process.exit(2); });
