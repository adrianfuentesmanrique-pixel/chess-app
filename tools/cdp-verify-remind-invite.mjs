// Headless-Chrome check of Kael's invitation to the daily reminder.
// Dev tool, not shipped.
//
//   node tools/cdp-verify-remind-invite.mjs <outDir>
//
// REALLY DONE: the dialog's buttons are clicked and the kv store is read back.
// SEEDED: language, colour mode, the notification permission (through CDP),
// Auth.user (memory only, so nothing reaches Firestore) and, in step 4 only, a
// stand-in for a switch-on that succeeds.
// NOT COVERED: the phone's real permission question and a real delivery. That
// needs a phone. The harness below is the one from tools/cdp-verify-remind.mjs.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/cdp-verify-remind-invite.mjs <outDir>'); process.exit(1); }
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const WEB = 9900 + Math.floor(Math.random() * 90);
const APP_URL = `http://localhost:${WEB}`;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-invite-'));
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 600000).unref();

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.wav': 'audio/wav' };
// Unlike the other cdp-verify tools this one DOES serve sw.js: the push handler
// under test lives there.
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
await new Promise(r => server.listen(WEB, '127.0.0.1', r));

const getJSON = url => new Promise((res, rej) => {
  http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });

let ws, msgId = 0, registrationId = null;
const pending = new Map();
const errors = [];
function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
}
async function evalP(expr) {
  const r = await send('Runtime.evaluate', { expression: `(async()=>{ ${expr} })()`, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
  return r.result.value;
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
}
const killModals = () => evalP(`document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove());`);

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
  } else if (msg.method === 'ServiceWorker.workerRegistrationUpdated') {
    const reg = msg.params.registrations.find(r => r.scopeURL.startsWith(APP_URL) && !r.isDeleted);
    if (reg) registrationId = reg.registrationId;
  } else if (msg.method === 'Runtime.exceptionThrown') {
    errors.push('EXC ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    errors.push('CON ' + msg.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  }
});
await send('Page.enable'); await send('Runtime.enable'); await send('ServiceWorker.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok }); console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); };

// The kv seed is written on a first visit and read by the app on the reload,
// as in tools/cdp-verify-streak-grey.mjs.
async function load(lang, scheme, seed = {}) {
  const kv = { onboardingDone: true, tourDone: 'done', earnedBadges: {}, soundEnabled: false,
    streakCount: 11, streakLastDate: null, bestStreak: 11, colorMode: scheme, remindOn: false, pushSubId: null, remindAskCount: null, remindAskLast: null, ...seed };
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
  await send('Page.navigate', { url: APP_URL + '/' });
  await sleep(2500);
  await evalP(`localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1');
    const db = await import('${APP_URL}/js/db.js');
    for (const [k, v] of Object.entries(${JSON.stringify(kv)})) await db.kvSet(k, v);`);
  await send('Page.navigate', { url: APP_URL + '/' });
  await sleep(3500);
  await killModals();
  await evalP(`const app = await import('${APP_URL}/js/app.js');
    window.__t = { app, db: await import('${APP_URL}/js/db.js'), fb: await import('${APP_URL}/js/firebase.js'),
      N: (await import('${APP_URL}/js/notifications.js')).Notifications, badge: (await import('${APP_URL}/js/badge-card.js')).BadgeCard, i18n: await import('${APP_URL}/js/i18n.js') };`);
}

const grant = () => send('Browser.grantPermissions', { origin: APP_URL, permissions: ['notifications'] });
const deny = () => send('Browser.setPermission', { origin: APP_URL, permission: { name: 'notifications' }, setting: 'denied' });
const reset = () => send('Browser.setPermission', { origin: APP_URL, permission: { name: 'notifications' }, setting: 'prompt' });
// Auth.user is set in memory only. The counter proves WHEN the phone's own
// permission question is asked.
const signIn = () => evalP(`__t.fb.Auth.user = { uid: 'headless' };
  window.__asked = 0; const real = Notification.requestPermission.bind(Notification);
  Notification.requestPermission = (...a) => { window.__asked++; return real(...a); };`);
const dialog = () => evalP(`const box = document.querySelector('#modal-root .modal-box'); if (!box) return null;
  const r = box.getBoundingClientRect();
  return { text: box.querySelector('p')?.textContent || '', title: box.querySelector('h3')?.textContent || '',
    btns: [...box.querySelectorAll('button')].map(b => b.textContent),
    fits: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight
      && document.documentElement.scrollWidth <= innerWidth,
    btnsFit: [...box.querySelectorAll('button')].every(b => { const q = b.getBoundingClientRect(); return q.left >= r.left && q.right <= r.right && b.scrollWidth <= b.clientWidth + 1; }) };`);
const waitDialog = async (ms = 20000) => { for (let i = 0; i < ms / 250; i++) { const d = await dialog(); if (d) return d; await sleep(250); } return null; };
const tap = i => evalP(`document.querySelectorAll('#modal-root .modal-box button')[${i}].click();`);
const toastText = () => evalP(`const e = document.getElementById('toast'); return e.classList.contains('hidden') ? '' : e.textContent;`);
const kv = k => evalP(`return await __t.db.kvGet('${k}', null);`);
const credit = (mid = false) => evalP(`__t.app.Streak.recordActivity(${mid ? '{ midGame: true }' : ''});`);
const oweAgain = () => evalP(`__t.app.RemindInvite.owed = true; await __t.app.RemindInvite.maybe();`);
const DAY = 86400000;

const TEXT = {
  es: { ask: 'Hoy ya cumpliste. Si mañana a las {h} aún no has entrenado, ¿te aviso? Un solo aviso al día, para que no pierdas tu racha.',
    btns: ['Sí, avísame', 'Ahora no'], later: 'Está bien. Lo encuentras en Ajustes cuando quieras.', ok: 'Entendido',
    denied: 'Las notificaciones están bloqueadas', failed: 'No se pudo activar', done: 'Hecho. Te aviso a las ' },
  en: { ask: 'Today is done. If you have not trained by {h} tomorrow, shall I remind you? One reminder a day, so you do not lose your streak.',
    btns: ['Yes, remind me', 'Not now'], later: 'All right. It is in Settings whenever you want it.', ok: 'Got it',
    denied: 'Notifications are blocked', failed: 'Could not turn it on', done: 'Done. I will remind you at ' },
};

try {
  // 1 ── the invitation itself, four ways; then what a Yes does when the
  //      switch-on does not work (refused by the phone / the Brave road)
  for (const [lang, scheme, road] of [['es', 'dark', 'denied'], ['en', 'light', 'denied'], ['es', 'light', 'failed'], ['en', 'dark', 'failed']]) {
    const tag = `${lang.toUpperCase()}/${scheme}`, T = TEXT[lang];
    await reset(); if (road === 'failed') await grant();
    await load(lang, scheme);
    await signIn();
    const h = await evalP(`return (await import('${APP_URL}/js/remind-time.js')).hourLabel(__t.N.hour);`);
    check(`${tag} nothing on screen before a day is credited`, !(await dialog()) && (await kv('remindAskCount')) === null);
    await credit();
    const d = await waitDialog();
    check(`${tag} invitation appears after a finished training`, d && d.title.includes('Kael') && d.text === T.ask.replace('{h}', h), d);
    check(`${tag} the two buttons, in order`, d && d.btns.join('|') === T.btns.join('|'), d?.btns);
    check(`${tag} fits 375px, buttons not cut`, d && d.fits && d.btnsFit, d);
    check(`${tag} the phone's question has NOT been asked yet`, (await evalP('return window.__asked')) === 0);
    await sleep(400); await shot(`invite-${lang}-${scheme}`);
    // Headless Chrome cannot show the phone's question, so its answer is given
    // here: refused, at the moment it would have been asked.
    if (road === 'denied') await deny();
    await tap(0);
    const r = await waitDialog(14000);
    check(`${tag} Yes: the phone's question is asked exactly once, from the tap`, (await evalP('return window.__asked')) === 1);
    check(`${tag} Yes then ${road}: Kael explains, one button`, r && r.text.startsWith(T[road]) && r.btns.join('|') === T.ok && r.fits && r.btnsFit, r);
    await sleep(300); await shot(`after-yes-${road}-${lang}-${scheme}`);
    if (r) await tap(0);
    await sleep(300);
    check(`${tag} Yes closes the invitation for good`, (await kv('remindAskCount')) === 2);
    await oweAgain(); await sleep(600);
    check(`${tag} not asked again after a Yes`, !(await dialog()));
  }

  // 2 ── Not now: once more after a week, never a third time
  for (const lang of ['es', 'en']) {
    const T = TEXT[lang];
    await reset(); await load(lang, 'dark'); await signIn();
    await credit();
    check(`${lang} first ask appears`, !!(await waitDialog()));
    await tap(1); await sleep(300);
    check(`${lang} Not now: the short line, count 1, phone never asked`, (await toastText()) === T.later && (await kv('remindAskCount')) === 1 && (await evalP('return window.__asked')) === 0, await toastText());
    await shot(`not-now-toast-${lang}`);
    await oweAgain(); await sleep(600);
    check(`${lang} the same week: quiet`, !(await dialog()));
    await evalP(`await __t.db.kvSet('remindAskLast', Date.now() - ${6 * DAY});`);
    await oweAgain(); await sleep(600);
    check(`${lang} six days later: still quiet`, !(await dialog()));
    await evalP(`await __t.db.kvSet('remindAskLast', Date.now() - ${8 * DAY}); document.getElementById('toast').classList.add('hidden');`);
    await evalP(`__t.app.RemindInvite.owed = true; __t.app.RemindInvite.maybe();`);
    check(`${lang} eight days later: asked once more`, !!(await waitDialog(3000)));
    // tapping outside the box counts as Not now
    await evalP(`document.querySelector('#modal-root .modal-back').click();`); await sleep(300);
    check(`${lang} second Not now (tap outside): count 2, no second toast`, (await kv('remindAskCount')) === 2 && (await toastText()) === '');
    await evalP(`await __t.db.kvSet('remindAskLast', Date.now() - ${400 * DAY});`);
    await oweAgain(); await sleep(600);
    check(`${lang} never a third time, even a year later`, !(await dialog()));
  }

  // 3 ── who never sees it
  await reset(); await grant(); await load('es', 'dark', { remindOn: true }); await signIn();
  check('reminder already on: state is on', (await evalP('return __t.N.state()')) === 'on');
  await credit();
  check('reminder already on: no invitation', !(await waitDialog(17000)) && (await kv('remindAskCount')) === null);

  await reset(); await deny(); await load('en', 'light'); await signIn();
  check('permission already blocked: state is denied', (await evalP('return __t.N.state()')) === 'denied');
  await credit();
  check('permission already blocked: no invitation', !(await waitDialog(17000)) && (await kv('remindAskCount')) === null);

  await reset(); await load('es', 'light');
  check('signed out: state is signed-out', (await evalP('return __t.N.state()')) === 'signed-out');
  await credit();
  check('signed out: no invitation', !(await waitDialog(17000)) && (await kv('remindAskCount')) === null);

  // 4 ── a day credited by a move on a live board waits for a screen change
  await reset(); await load('es', 'dark'); await signIn();
  await credit(true);
  check('mid-game credit: nothing over the board', !(await waitDialog(17000)));
  // a badge card earned by the seeded streak has to leave first
  for (let i = 0; i < 60 && await evalP(`return !!(__t.badge.current || __t.badge.queue.length)`); i++) await sleep(500);
  await evalP(`__t.app.showScreen('profile');`);
  check('mid-game credit: asked at the next screen change', !!(await waitDialog(3000)));
  await sleep(400); await shot('invite-on-profile-es-dark');
  // Yes, with the switch-on itself replaced by a stand-in that succeeds (a real
  // one needs a real login): only the "Done" line is under test here.
  await evalP(`__t.N.enable = async () => { __t.N.on = true; return 'on'; };`);
  await tap(0); await sleep(400);
  const done = await toastText();
  check('Yes and it turned on: the Done line with the hour', done.startsWith(TEXT.es.done) && !done.includes('{h}'), done);
  await shot('done-toast-es-dark');

  // 5 ── offline: wait, do not burn an ask
  await reset(); await load('en', 'dark'); await signIn();
  await send('Network.enable');
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await sleep(300);
  await oweAgain(); await sleep(600);
  check('offline: no invitation, nothing counted', !(await dialog()) && (await kv('remindAskCount')) === null, await evalP('return navigator.onLine'));
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  // 6 ── using the Settings switch by hand closes the invitation
  await reset(); await load('en', 'light'); await signIn();
  await killModals(); await evalP(`document.getElementById('btn-settings').click();`); await sleep(700);
  await evalP(`document.querySelector('#remind-seg button[data-v="off"]').click();`); await sleep(600);
  check('Settings switch used by hand: count 2', (await kv('remindAskCount')) === 2);
  await killModals();
  await oweAgain(); await sleep(600);
  check('Settings switch used by hand: no invitation afterwards', !(await dialog()));
} catch (e) { console.error('VERIFY ERROR', e); checks.push({ name: 'script', ok: false }); }

const bad = checks.filter(c => !c.ok).length;
console.log(`\n${checks.length - bad} pass, ${bad} fail`);
const real = errors.filter(e => !/403|App Check|appCheck|AppCheck|Failed to load resource/i.test(e));
if (real.length) console.log('page errors:\n  ' + [...new Set(real)].slice(0, 12).join('\n  '));
chrome.kill(); server.close();
setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(bad ? 1 : 0); }, 800);
