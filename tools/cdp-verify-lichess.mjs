// Verifies the optional Lichess link behind the Analysis tab's Internet search.
// NOTHING here reaches Lichess: every request to *lichess.org* is caught with
// CDP's Fetch domain and answered by this script, and the token is made up.
//
// MEASURED (per language x colour scheme, 375px): not connected -> the search
// explains itself and offers Connect; Connect builds the lichess.org/oauth
// address with the right parameters and NO scope; the return (?code&state) is
// stripped from the address bar, exchanged with the matching PKCE verifier and
// never stored in a cache; the search then carries the Authorization header to
// explorer.lichess.org; 429 says "a minute"; 401 clears the token and offers
// Connect again; Disconnect (Settings) deletes the token and asks Lichess to
// revoke it; offline, Connect and the search both answer at once; the reworded
// legal text is what the app shows.
// NOT MEASURED: a real sign-in, and the installed app (TWA) - Adrian's step.
//
// usage: node tools/cdp-verify-lichess.mjs <outDir>     (ONE=1 -> en/light only)
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/cdp-verify-lichess.mjs <outDir>'); process.exit(1); }
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 600000).unref();

const FAKE = 'lip_MADEUPfortesting';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = url => new Promise((res, rej) => {
  http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});

async function startServer() {
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
  return { url: `http://localhost:${port}`, stop: () => new Promise(r => { server.close(r); server.closeAllConnections(); }) };
}

async function startChrome() {
  const port = 9300 + Math.floor(Math.random() * 600);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-'));
  const proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });
  let ws, msgId = 0;
  const pending = new Map();
  const on = {};
  for (let i = 0; i < 40; i++) {
    try {
      const page = (await getJSON(`http://127.0.0.1:${port}/json`)).find(t => t.type === 'page');
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
    } else if (msg.method && on[msg.method]) on[msg.method](msg.params);
  });
  const send = (method, params = {}) => {
    const id = ++msgId;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => pending.set(id, { res, rej }));
  };
  const evalP = async expr => {
    const r = await send('Runtime.evaluate', { expression: `(async()=>{ ${expr} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
    return r.result.value;
  };
  const close = async () => {
    try { ws.close(); } catch {}
    proc.kill();
    await sleep(800);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  };
  return { send, evalP, close, on };
}

async function opened(c) {
  const t0 = Date.now();
  while (Date.now() - t0 < 25000) {
    const hid = await c.evalP(`const s = document.getElementById('splash'); return !!s && s.classList.contains('hide');`).catch(() => false);
    if (hid) return true;
    await sleep(250);
  }
  throw new Error('the app did not open');
}
async function until(c, expr, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = await c.evalP(expr).catch(() => null);
    if (v) return v;
    await sleep(150);
  }
  return null;
}
async function shoot(c, name) {
  const r = await c.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
}

const T = keys => `const { t } = await import('/js/i18n.js'); return Object.fromEntries(${JSON.stringify(keys)}.map(k => [k, t(k)]));`;
const SEARCH = `document.getElementById('ana-explore').click(); await new Promise(r => setTimeout(r, 250));
  const b = [...document.querySelectorAll('.sheet-btn')].find(x => x.textContent.includes('🌐')); if (!b) return 'no sheet'; b.click(); return 'ok';`;
const PANEL = `return { status: document.getElementById('ana-games-status').textContent,
  buttons: [...document.querySelectorAll('#ana-games-list button')].map(b => b.textContent),
  hint: (document.querySelector('#ana-games-list p.hint') || {}).textContent || '',
  token: localStorage.getItem('ctc-lichess-token'), pending: localStorage.getItem('ctc-lichess-pending'),
  toast: document.getElementById('toast').classList.contains('hidden') ? '' : document.getElementById('toast').textContent };`;

async function run(lang, scheme) {
  const name = `${lang}-${scheme}`;
  const web = await startServer();
  const c = await startChrome();
  const seen = [];          // every request that tried to reach lichess.org
  let explorer = 200;       // what the fake explorer answers next
  let offline = false;
  const fails = [];
  const check = (ok, what) => { if (!ok) fails.push(what); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}: ${what}`); };
  try {
    await c.send('Page.enable'); await c.send('Runtime.enable'); await c.send('Network.enable');
    await c.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
    await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1'); } catch {}` });
    await c.send('Fetch.enable', { patterns: [{ urlPattern: '*://lichess.org/*' }, { urlPattern: '*://explorer.lichess.org/*' }, { urlPattern: '*://explorer.lichess.ovh/*' }] });
    const cors = [{ name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Headers', value: 'Authorization, Content-Type' }, { name: 'Access-Control-Allow-Methods', value: 'GET, POST, DELETE, OPTIONS' }];
    c.on['Fetch.requestPaused'] = p => {
      const u = new URL(p.request.url), m = p.request.method;
      const h = Object.fromEntries(Object.entries(p.request.headers).map(([k, v]) => [k.toLowerCase(), v]));
      seen.push({ host: u.host, path: u.pathname, method: m, url: p.request.url, auth: h.authorization || '', body: p.request.postData || '' });
      const reply = (code, body = '', type = 'application/json') => c.send('Fetch.fulfillRequest', {
        requestId: p.requestId, responseCode: code, responseHeaders: [...cors, { name: 'Content-Type', value: type }], body: Buffer.from(body).toString('base64') }).catch(() => {});
      if (offline) return c.send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'InternetDisconnected' }).catch(() => {});
      if (m === 'OPTIONS') return reply(204);
      if (u.pathname === '/oauth') return reply(200, '<title>stopped here</title>not following through', 'text/html');
      if (u.pathname === '/api/token' && m === 'POST') return reply(200, JSON.stringify({ token_type: 'Bearer', access_token: FAKE, expires_in: 31536000 }));
      if (u.pathname === '/api/token' && m === 'DELETE') return reply(204);
      if (u.pathname.startsWith('/masters/pgn/')) {
        if (explorer !== 200) return reply(explorer, 'no', 'text/plain');
        return reply(200, '[Event "Made up"]\n[White "Test, White"]\n[Black "Test, Black"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 1-0\n', 'application/x-chess-pgn');
      }
      if (u.pathname === '/masters') {
        if (explorer !== 200) return reply(explorer, '<h1>no</h1>', 'text/html');
        return reply(200, JSON.stringify({ topGames: [
          { id: 'aAbBcCdD', winner: 'white', white: { name: 'Test, White' }, black: { name: 'Test, Black' }, year: 1999 },
          { id: 'eEfFgGhH', winner: null, white: { name: 'Other, White' }, black: { name: 'Other, Black' }, year: 2005 }] }));
      }
      return reply(404);
    };

    await c.send('Page.navigate', { url: web.url }); await opened(c);
    await c.evalP(`const db = await import('/js/db.js'); await db.kvSet('onboardingDone', true); await db.kvSet('tourDone', true);`);
    await until(c, `return !!(await navigator.serviceWorker.getRegistration())?.active;`, 30000);
    await c.send('Page.reload', {}); await opened(c); await sleep(800);
    const tr = await c.evalP(T(['lichess_explain', 'lichess_connect', 'lichess_connect_hint', 'lichess_disconnect', 'lichess_connected_line',
      'lichess_connected', 'lichess_expired', 'lichess_rate_limited', 'lichess_offline', 'explore_lichess_unavailable', 'lichess_disconnected']));

    // 1. not connected
    check(await c.evalP(SEARCH) === 'ok', 'the search sheet opens');
    let s = await until(c, `${PANEL.replace('return {', 'const o = {').replace(/;\s*$/, '')}; return o.buttons.length ? o : null;`);
    check(s && s.status === tr.lichess_explain && s.buttons.length === 1 && s.buttons[0] === tr.lichess_connect && s.hint === tr.lichess_connect_hint,
      `not connected: explains itself and offers "${tr.lichess_connect}"`);
    check(!seen.length, 'not connected: nothing was sent to Lichess');
    await shoot(c, `${name}-1-not-connected`);

    // 2. Connect builds the address
    const pendingP = c.evalP(`document.querySelector('#ana-games-list button').click(); await new Promise(r => setTimeout(r, 60)); return localStorage.getItem('ctc-lichess-pending');`).catch(() => null);
    await until({ evalP: async () => seen.some(x => x.path === '/oauth') }, '', 8000);
    await pendingP;
    const oauth = seen.find(x => x.path === '/oauth');
    const q = oauth ? new URL(oauth.url).searchParams : new URLSearchParams();
    check(oauth && oauth.host === 'lichess.org' && q.get('response_type') === 'code' && q.get('client_id') === 'chesstrainingcenter.app'
      && q.get('redirect_uri') === web.url + '/' && q.get('code_challenge_method') === 'S256' && /^[\w-]{43}$/.test(q.get('code_challenge') || '')
      && (q.get('state') || '').length >= 16 && !q.has('scope'),
      `Connect goes to lichess.org/oauth: code, S256, redirect ${q.get('redirect_uri')}, no scope`);

    // 3. the return
    await c.send('Page.navigate', { url: `${web.url}/?code=liu_MADEUPCODE&state=${encodeURIComponent(q.get('state'))}` }); await opened(c);
    s = await until(c, `${PANEL.replace('return {', 'const o = {').replace(/;\s*$/, '')}; o.search = location.search; return o.token ? o : null;`);
    const tok = seen.find(x => x.path === '/api/token' && x.method === 'POST');
    const body = new URLSearchParams(tok ? tok.body : '');
    const challenge = crypto.createHash('sha256').update(body.get('code_verifier') || '').digest('base64url');
    check(tok && body.get('grant_type') === 'authorization_code' && body.get('code') === 'liu_MADEUPCODE' && challenge === q.get('code_challenge')
      && body.get('redirect_uri') === web.url + '/' && body.get('client_id') === 'chesstrainingcenter.app',
      'return: the code is exchanged with the verifier that matches the challenge');
    check(s && s.token === FAKE && !s.pending && s.search === '', 'return: token kept on the device, one-time secret deleted, address bar clean');
    check(s && s.toast === tr.lichess_connected, `return: says "${tr.lichess_connected}"`);
    await shoot(c, `${name}-2-connected-toast`);
    await sleep(1200);
    const kept = await c.evalP(`const out = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) if (/[?&](code|state)=/.test(r.url)) out.push(r.url); return out;`);
    check(kept.length === 0, 'return: no cache entry holds the sign-in code');

    // 4. connected search
    seen.length = 0;
    await c.evalP(SEARCH);
    s = await until(c, `${PANEL.replace('return {', 'const o = {').replace(/;\s*$/, '')}; return o.buttons.length >= 3 ? o : null;`);
    const ex = seen.filter(x => x.path === '/masters' && x.method === 'GET');
    check(ex.length === 1 && ex[0].host === 'explorer.lichess.org' && ex[0].auth === 'Bearer ' + FAKE, 'search: ONE request, to explorer.lichess.org, with the Authorization header');
    check(s && s.buttons.length === 3 && s.buttons[2] === tr.lichess_disconnect, 'search: two games listed, then "connected" and Disconnect');
    const lines = await until(c, `const m = [...document.querySelectorAll('#ana-games-list .moves')].map(x => x.textContent); return m.length === 2 && m.every(Boolean) ? m : null;`);
    const pg = seen.filter(x => x.path.startsWith('/masters/pgn/'));
    check(lines && lines[0] === '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7' && pg.filter(x => x.method === 'GET').length === 2 && pg.every(x => x.method !== 'GET' || x.auth === 'Bearer ' + FAKE),
      'results: each game shows its moves on a third line (one request per game, with the header)');
    await shoot(c, `${name}-3-results`);
    await c.evalP(`window.__opened = 0; window.open = () => { window.__opened++; }; document.querySelector('#ana-games-list .list-item').click();`);
    const inApp = await until(c, `const txt = document.getElementById('ana-moves').textContent; return /Bb5/.test(txt) ? { opened: window.__opened, shown: !document.getElementById('ana-moves').classList.contains('hidden') } : null;`);
    check(inApp && inApp.opened === 0 && seen.filter(x => x.path.startsWith('/masters/pgn/') && x.method === 'GET').length === 2, 'tap on a game: it opens on the board in the app, no new window, no new request');
    await shoot(c, `${name}-3b-game-opened`);

    // 4b. LIVE, like the database search: remembered source, a lookup per board change
    const nSearch = () => seen.filter(x => x.path === '/masters' && x.method === 'GET').length;
    const LIST = `return { n: document.querySelectorAll('#ana-games-list .list-item').length, status: document.getElementById('ana-games-status').textContent,
      showing: !document.getElementById('ana-games-view').classList.contains('hidden'), sheet: document.querySelectorAll('.sheet-btn').length };`;
    const press = (id, n) => c.evalP(`for (let i = 0; i < ${n}; i++) document.getElementById('${id}').click();`);
    await c.evalP(`document.getElementById('ana-explore').click();`);
    let l = await until(c, `${LIST.replace('return {', 'const o = {').replace(/;\s*$/, '')}; return o.n === 2 ? o : null;`);
    check(l && l.showing && l.sheet === 0 && nSearch() === 2, 'live: with a game open, 🔎 goes straight back to the internet results for the position on the board (no menu)');
    await press('ana-prev', 3); await sleep(1600);
    l = await c.evalP(LIST);
    check(nSearch() === 3 && l.n === 2, 'live: three quick steps back = ONE new lookup, results refreshed');
    await press('ana-next', 3); await sleep(1200);
    l = await c.evalP(LIST);
    check(nSearch() === 3 && l.n === 2, 'live: back on a position already looked up = no request, results shown from memory');
    check(seen.filter(x => x.path.startsWith('/masters/pgn/') && x.method === 'GET').length === 2, 'live: games already fetched are not fetched again');
    explorer = 429;
    await press('ana-prev', 1); await sleep(1300);
    l = await c.evalP(LIST);
    const after429 = nSearch();
    await press('ana-prev', 1); await sleep(1300);
    const l2 = await c.evalP(LIST);
    check(after429 === 4 && nSearch() === 4 && l.status === '⚠️ ' + tr.lichess_rate_limited && l2.status === l.status, 'live: after a 429 the next move asks nothing and says to wait a minute');
    await c.evalP(`document.querySelector('#ana-view-tab button[data-v="moves"]').click();`);
    explorer = 200;
    await press('ana-prev', 1); await sleep(1000);
    check(nSearch() === 4, 'live: with the Moves tab showing, a move asks nothing');
    await c.evalP(`document.querySelector('#ana-view-tab button[data-v="games"]').click();`); await sleep(400);

    // 5. 429
    // a fresh start: the app remembers positions it has looked up, and these three need a real request each
    await c.send('Page.reload', {}); await opened(c); await sleep(600);
    explorer = 429; seen.length = 0;
    await c.evalP(SEARCH);
    s = await until(c, `${PANEL.replace('return {', 'const o = {').replace(/;\s*$/, '')}; return o.status.includes('⚠️') ? o : null;`);
    check(s && s.status === '⚠️ ' + tr.lichess_rate_limited && s.token === FAKE && seen.filter(x => x.path === '/masters' && x.method === 'GET').length === 1, `429: "${tr.lichess_rate_limited}", token kept, no retry`);

    // 6. 401
    explorer = 401;
    await c.send('Page.reload', {}); await opened(c); await sleep(600);
    await c.evalP(SEARCH);
    s = await until(c, `${PANEL.replace('return {', 'const o = {').replace(/;\s*$/, '')}; return o.token ? null : o;`);
    check(s && s.status === tr.lichess_expired && s.buttons.length === 1 && s.buttons[0] === tr.lichess_connect, '401: token cleared, says it expired, offers Connect again');
    await shoot(c, `${name}-4-expired`);

    // 7. offline search (token seeded again)
    explorer = 200; offline = true;
    await c.evalP(`localStorage.setItem('ctc-lichess-token', '${FAKE}');`);
    await c.send('Page.reload', {}); await opened(c); await sleep(600);
    await c.evalP(SEARCH);
    s = await until(c, `${PANEL.replace('return {', 'const o = {').replace(/;\s*$/, '')}; return o.status.includes('⚠️') ? o : null;`);
    check(s && s.status === '⚠️ ' + tr.explore_lichess_unavailable && s.token === FAKE, 'offline search: clear message at once, token kept');
    offline = false;

    // 8. Settings: Disconnect, then Connect offline
    await c.send('Page.reload', {}); await opened(c); await sleep(600);
    seen.length = 0;
    const SET_BTN = `[...document.querySelectorAll('.modal-box button')].find(x => x.textContent === a || x.textContent === b)`;
    const findBtn = `const a = ${JSON.stringify(tr.lichess_connect)}, b = ${JSON.stringify(tr.lichess_disconnect)}; const btn = ${SET_BTN};`;
    await c.evalP(`document.getElementById('btn-settings').click();`);
    const label1 = await until(c, `${findBtn} if (!btn) return null; btn.scrollIntoView({ block: 'center' }); return btn.textContent;`);
    await sleep(300); await shoot(c, `${name}-5-settings-connected`);
    await c.evalP(`${findBtn} btn.click();`);
    const after = await until(c, `${findBtn} return btn.textContent === a ? { label: btn.textContent, token: localStorage.getItem('ctc-lichess-token'), toast: document.getElementById('toast').textContent } : null;`);
    await sleep(300);
    const del = seen.find(x => x.path === '/api/token' && x.method === 'DELETE');
    check(label1 === tr.lichess_disconnect && after && after.token === null && after.toast === tr.lichess_disconnected, 'Settings: Disconnect deletes the token and the button turns into Connect');
    check(del && del.auth === 'Bearer ' + FAKE, 'Settings: Disconnect also asks Lichess to revoke the token');
    await shoot(c, `${name}-6-settings-disconnected`);

    await c.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    seen.length = 0;
    const t0 = Date.now();
    await c.evalP(`${findBtn} btn.click();`);
    const off = await until(c, `const el = document.getElementById('toast'); return el.textContent === ${JSON.stringify(tr.lichess_offline)} && !el.classList.contains('hidden') ? { href: location.href } : null;`, 4000);
    check(off && off.href.startsWith(web.url) && !seen.length, `offline Connect: "${tr.lichess_offline}" in ${Date.now() - t0} ms, the app stays open`);
    await shoot(c, `${name}-7-offline-connect`);
    // the header's offline mark (not Lichess, but this is where the script is offline)
    const mark = await c.evalP(`const { t } = await import('/js/i18n.js'); const el = document.getElementById('offline-ico'); const r = el.getBoundingClientRect(); el.click();
      return { shown: !el.classList.contains('hidden') && r.width > 0, aria: el.getAttribute('aria-label') === t('offline_mode'), toast: document.getElementById('toast').textContent === t('offline_mode_hint') };`);
    check(mark.shown && mark.aria && mark.toast, 'offline mark: shown in the header, labelled, a tap explains it');
    await c.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

    const gone = await until(c, `return document.getElementById('offline-ico').classList.contains('hidden');`, 3000);
    check(gone, 'offline mark: gone again once the connection is back');

    // 9. legal text, as the app shows it
    const legal = await c.evalP(`const L = await import('/js/legal-data.js'); const lang = ${JSON.stringify(lang)};
      const find = d => d[lang].sections.map(x => x.p).find(p => p.includes('Lichess') && p.includes('FEN')) || '';
      return { terms: find(L.LEGAL_TERMS), privacy: find(L.LEGAL_PRIVACY), updated: L.LEGAL_PRIVACY[lang].updated };`);
    const stale = /sin datos que te identifiquen|no data that identifies you|servicio público|public service|API pública|public API/;
    const fresh = lang === 'es' ? /solo funciona si conectas tu cuenta de Lichess[\s\S]*proviene de tu cuenta/ : /only works if you connect your Lichess account[\s\S]*comes from your account/;
    const freshP = lang === 'es' ? /requiere que conectes tu cuenta de Lichess[\s\S]*No recibimos ni guardamos tu nombre de usuario de Lichess/ : /requires you to connect your Lichess account[\s\S]*We do not receive or store your Lichess username/;
    check(fresh.test(legal.terms) && freshP.test(legal.privacy) && !stale.test(legal.terms) && !stale.test(legal.privacy) && legal.updated.includes('2026-10-06'), 'legal: both paragraphs reworded, old claim gone, date 2026-10-06');
    for (const [key, file] of [['view_terms', '8-terms'], ['view_privacy', '9-privacy']]) {
      await c.send('Page.reload', {}); await opened(c); await sleep(500);
      await c.evalP(`document.getElementById('btn-settings').click();`);
      await until(c, `const { t } = await import('/js/i18n.js'); const b = [...document.querySelectorAll('.modal-box button')].find(x => x.textContent === t('${key}')); if (!b) return null; b.click(); return true;`);
      const shown = await until(c, `const p = [...document.querySelectorAll('.legal-p')].find(x => x.textContent.includes('Lichess') && x.textContent.includes('FEN')); if (!p) return null; p.scrollIntoView({ block: 'center' }); return p.textContent;`);
      check(shown === (key === 'view_terms' ? legal.terms : legal.privacy), `legal: ${key} shows the reworded paragraph on screen`);
      await sleep(300); await shoot(c, `${name}-${file}`);
    }
  } catch (e) { check(false, 'crashed: ' + e.message); }
  finally { await c.close(); await web.stop().catch(() => {}); }
  console.log(`${fails.length ? 'FAIL' : 'PASS'} ${name}${fails.length ? ` (${fails.length} failed)` : ''}`);
  return !fails.length;
}

const combos = process.env.ONE ? [['en', 'light']] : [['en', 'light'], ['en', 'dark'], ['es', 'light'], ['es', 'dark']];
let bad = 0;
for (const [lang, scheme] of combos) if (!await run(lang, scheme)) bad++;
console.log(bad ? `\n${bad} FAILED` : '\nALL PASSED');
process.exit(bad ? 1 : 0);
