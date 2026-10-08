// Headless-Chrome check of the daily streak reminder's app side.
// Dev tool, not shipped.
//
//   node tools/cdp-verify-remind.mjs <outDir>
//
// REALLY DONE: the Settings button and the On button are clicked; the pushes
// are delivered to the real service worker (CDP ServiceWorker.deliverPushMessage)
// and the notifications are read back from it.
// SEEDED: the kv store, the language and the colour mode. Nothing is signed in,
// so NOTHING is written to Firestore: for the "On" pictures and the failed
// switch-on, Auth.user is set by hand in the page's memory only.
// NOT COVERED: a subscription stored in Firestore and a real delivery — both
// need a real login. That is Adrian's phone (plan Step 14) and Task 4.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/cdp-verify-remind.mjs <outDir>'); process.exit(1); }
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const WEB = 9900 + Math.floor(Math.random() * 90);
const APP_URL = `http://localhost:${WEB}`;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-remind-'));
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
await send('Browser.grantPermissions', { origin: APP_URL, permissions: ['notifications'] });
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok }); console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); };

// The kv seed is written on a first visit and read by the app on the reload,
// as in tools/cdp-verify-streak-grey.mjs.
async function load(lang, scheme, seed = {}) {
  const kv = { onboardingDone: true, tourDone: 'done', earnedBadges: {}, soundEnabled: false,
    streakCount: 11, streakLastDate: null, bestStreak: 11, colorMode: scheme, remindOn: false, pushSubId: null, ...seed };
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
      N: (await import('${APP_URL}/js/notifications.js')).Notifications, i18n: await import('${APP_URL}/js/i18n.js') };`);
}

const openSettings = async () => { await killModals(); await evalP(`document.getElementById('btn-settings').click();`); await sleep(700); };
const settingsBlock = () => evalP(`const seg = document.getElementById('remind-seg'), sel = document.getElementById('remind-hour'), hint = document.getElementById('remind-hint');
  if (!seg) return null;
  const btns = [...seg.querySelectorAll('button')];
  const box = document.querySelector('.modal-box').getBoundingClientRect();
  const inside = el => { const r = el.getBoundingClientRect(); return r.left >= box.left - 0.5 && r.right <= box.right + 0.5; };
  return { label: document.getElementById('remind-label').textContent, btns: btns.map(b => b.textContent), disabled: btns.map(b => b.disabled),
    on: seg.querySelector('button.on')?.dataset.v, options: sel.options.length, first: sel.options[0].textContent, last: sel.options[23].textContent,
    value: sel.value, selDisabled: sel.disabled, hint: hint.textContent,
    fits: inside(seg) && inside(sel) && inside(hint), selBg: getComputedStyle(sel).backgroundColor, selColor: getComputedStyle(sel).color };`);
const profileRow = () => evalP(`const el = document.getElementById('profile-remind-row'), r = el.getBoundingClientRect();
  return { hidden: el.classList.contains('hidden'), shown: r.width > 0 && r.height > 0, text: el.textContent,
    fits: r.left >= 0 && r.right <= 375, oneLine: r.height < 40 };`);
const openProfile = async () => { await killModals(); await evalP(`__t.app.showScreen('profile');`); await sleep(900);
  await evalP(`document.getElementById('profile-remind-row').scrollIntoView({ block: 'center' });`); await sleep(300); };
const scrollToBlock = async () => { await evalP(`document.getElementById('remind-label').scrollIntoView({ block: 'start' });`); await sleep(300); };

const daily = () => evalP(`const reg = await navigator.serviceWorker.ready;
  return (await reg.getNotifications({ tag: 'daily' })).map(n => ({ title: n.title, body: n.body, tag: n.tag, silent: n.silent, icon: n.icon, badge: n.badge }));`);
async function push(data) {
  await send('ServiceWorker.deliverPushMessage', { origin: APP_URL, registrationId, data });
  await sleep(900);
  return daily();
}

const TEXT = {
  es: { section: 'Recordatorio diario', off: 'Desactivado', on: 'Activado', signedOut: 'Inicia sesión para usar los recordatorios.',
        hint: 'Un recordatorio al día, solo si aún no has entrenado.', rowOff: 'Recordatorio diario: desactivado', rowOn: 'Recordatorio diario: 19:00',
        failed: 'No se pudo activar. En Brave: Ajustes, Privacidad, "Usar servicios de Google para mensajes push".' },
  en: { section: 'Daily reminder', off: 'Off', on: 'On', signedOut: 'Sign in to use reminders.',
        hint: 'One reminder a day, only if you have not trained yet.', rowOff: 'Daily reminder: off', rowOn: 'Daily reminder: 19:00',
        failed: 'Could not turn it on. In Brave: Settings, Privacy, "Use Google services for push messaging".' },
};

async function run() {
  // 1 ── no gate: a fresh profile draws the row and the block, and asks for nothing
  await load('es', 'light');
  await openProfile();
  let row = await profileRow();
  check('fresh profile: the Profile row is shown', !row.hidden && row.shown, row);
  await openSettings();
  check('fresh profile: Settings has the reminder block', (await settingsBlock()) !== null);
  check('fresh profile: nothing asked for permission, nothing subscribed',
    await evalP(`const reg = await navigator.serviceWorker.ready; return (await reg.pushManager.getSubscription()) === null && (await __t.db.kvGet('remindOn', false)) === false;`));

  // 2 ── signed out: the block is there, switched off and locked.
  //      8 pictures: Settings and Profile, each language, light and dark.
  for (const [lang, scheme] of [['es', 'light'], ['es', 'dark'], ['en', 'light'], ['en', 'dark']]) {
    const tag = `${lang.toUpperCase()}/${scheme}`, T = TEXT[lang];
    await load(lang, scheme);
    await openSettings();
    const s = await settingsBlock();
    check(`${tag} Settings: label, On/Off pair, 24 hours 00:00..23:00 with 19:00 chosen`,
      s && s.label === T.section && s.btns.join('|') === `${T.on}|${T.off}` && s.options === 24 && s.first === '00:00' && s.last === '23:00' && s.value === '19', s);
    check(`${tag} Settings, signed out: reads Off, both buttons and the hour locked, hint says to sign in`,
      s && s.on === 'off' && s.disabled.every(Boolean) && s.selDisabled && s.hint === T.signedOut, s && { on: s.on, disabled: s.disabled, hint: s.hint });
    check(`${tag} Settings: nothing wider than the sheet at 375px`, s && s.fits, s && { selBg: s.selBg, selColor: s.selColor });
    await scrollToBlock();
    await shot(`settings-${lang}-${scheme}`);
    await openProfile();
    row = await profileRow();
    check(`${tag} Profile row: shown, "${T.rowOff}", one line, inside 375px`, !row.hidden && row.shown && row.text === T.rowOff && row.fits && row.oneLine, row);
    await shot(`profile-${lang}-${scheme}`);
  }

  // 3 ── the Profile row opens Settings scrolled to the block (still EN/dark)
  await evalP(`document.getElementById('profile-remind-row').click();`);
  await sleep(900);
  const at = await evalP(`const l = document.getElementById('remind-label'); if (!l) return null;
    const r = l.getBoundingClientRect(); return { top: Math.round(r.top), inView: r.top >= 0 && r.bottom <= innerHeight };`);
  check('Profile row tapped: Settings opens with the reminder block in view', at && at.inView, at);

  // 4 ── what a signed-in user sees. Auth.user is set in memory only; with no
  //      real login every Firestore helper returns at once, so nothing is written.
  for (const [lang, scheme] of [['es', 'dark'], ['en', 'light']]) {
    const tag = `${lang.toUpperCase()}/${scheme}`, T = TEXT[lang];
    await load(lang, scheme);
    await evalP(`__t.fb.Auth.user = { uid: 'headless' };`);
    await openSettings();
    let s = await settingsBlock();
    check(`${tag} signed in, never switched on: Off, buttons free, hour locked, the plain hint`,
      s.on === 'off' && s.disabled.every(d => !d) && s.selDisabled && s.hint === T.hint, s);
    // The real button is clicked. With no real login the subscription cannot
    // be stored, so switching on fails: the same road, from the store step on,
    // that Brave takes when subscribe() itself is refused.
    await evalP(`document.querySelector('#remind-seg button[data-v="on"]').click();`);
    for (let i = 0; i < 60 && (await evalP(`return document.getElementById('remind-hint').textContent;`)) === T.hint; i++) await sleep(250);
    s = await settingsBlock();
    check(`${tag} On tapped, switching on fails: back to Off, the "could not turn it on" hint, nothing stored`,
      s.on === 'off' && s.hint === T.failed && s.fits && await evalP(`return (await __t.db.kvGet('remindOn', null)) === false && !(await __t.db.kvGet('pushSubId', null));`), s && { on: s.on, hint: s.hint, fits: s.fits });
    await scrollToBlock();
    await shot(`settings-failed-${lang}-${scheme}`);
    // The On look, painted from memory (a real On needs a real phone).
    await evalP(`__t.N.failed = false; __t.N.on = true;`);
    await openSettings();
    s = await settingsBlock();
    check(`${tag} switched on: reads On, hour free, the plain hint`, s.on === 'on' && !s.selDisabled && s.hint === T.hint && s.fits, s && { on: s.on, selDisabled: s.selDisabled, hint: s.hint });
    await scrollToBlock();
    await shot(`settings-on-${lang}-${scheme}`);
    await openProfile();
    row = await profileRow();
    check(`${tag} switched on, Profile row: "${T.rowOn}"`, row.text === T.rowOn && row.fits && row.oneLine, row);
    await shot(`profile-on-${lang}-${scheme}`);
  }

  // 5 ── the service worker's push handler
  await load('es', 'light');
  await evalP(`await navigator.serviceWorker.ready; return true;`);
  for (let i = 0; i < 40 && !registrationId; i++) await sleep(250);
  check('service worker registered (v' + await evalP(`return (await caches.keys()).find(k => /^chess-training-center-v/.test(k)) || '?';`) + ')', !!registrationId);
  await evalP(`await caches.delete('ctc-notif');`);
  let list = await push('{"t":"daily","lang":"en","n":11}');
  check('push EN, n=11: one notification, "Your streak is waiting" / "Keep your 11-day streak alive: train today."',
    list.length === 1 && list[0].title === 'Your streak is waiting' && list[0].body === 'Keep your 11-day streak alive: train today.', list);
  check('push: icon and badge are the two shrunk files, first one of the day is not silent',
    list.length === 1 && /icons\/notif\/daily\.png$/.test(list[0].icon) && /icons\/notif\/badge\.png$/.test(list[0].badge || 'icons/notif/badge.png') && list[0].silent !== true, list[0]);
  list = await push('{"t":"daily","lang":"es","n":1}');
  check('push ES, n=1: still exactly one (same tag replaces), "Tu racha te espera" / "Mantén viva tu racha de 1 día: entrena hoy."',
    list.length === 1 && list[0].title === 'Tu racha te espera' && list[0].body === 'Mantén viva tu racha de 1 día: entrena hoy.', list);
  check('second push on the same day is silent', list.length === 1 && list[0].silent === true, list[0] && list[0].silent);
  list = await push('{"t":"daily","lang":"es","n":4}');
  check('push ES, n=4: "Mantén viva tu racha de 4 días: entrena hoy."', list.length === 1 && list[0].body === 'Mantén viva tu racha de 4 días: entrena hoy.', list);
  // Review Focus 1: a payload that cannot be read must still show something.
  await evalP(`(await (await navigator.serviceWorker.ready).getNotifications()).forEach(n => n.close());`);
  list = await push('not json');
  check('push "not json": a notification is still shown, in the Spanish default', list.length === 1 && list[0].title === 'Tu racha te espera' && list[0].tag === 'daily', list);
  await evalP(`(await (await navigator.serviceWorker.ready).getNotifications()).forEach(n => n.close());`);
  list = await push('null');
  check('push "null" (readable, but not an object): a notification is still shown', list.length === 1 && list[0].title === 'Tu racha te espera', list);
  for (const f of ['icons/notif/daily.png', 'icons/notif/badge.png']) {
    check(`${f} is served`, await evalP(`const r = await fetch('${APP_URL}/${f}'); return r.ok && r.headers.get('content-type') === 'image/png';`));
  }

  // 6 ── today credited: the reminder on screen is closed
  await evalP(`await __t.N.clearDaily();`);
  await sleep(300);
  check('clearDaily(): no "daily" notification is left', (await daily()).length === 0);
  await push('{"t":"daily","lang":"es","n":11}');
  const before = (await daily()).length;
  await evalP(`await __t.app.Streak.recordActivity();`);
  await sleep(500);
  check('Streak.recordActivity() closes the reminder that is on screen', before === 1 && (await daily()).length === 0, { before });

  // 7 ── Review Focus 5: signing out stops this device's reminders
  await evalP(`await __t.db.kvSet('remindOn', true); await __t.db.kvSet('pushSubId', 'a'.repeat(64));`);
  await evalP(`await __t.fb.dropThisDevicePush();`);
  const after = await evalP(`return { id: await __t.db.kvGet('pushSubId', 'unset'), on: await __t.db.kvGet('remindOn', 'unset'),
    sub: await (await navigator.serviceWorker.ready).pushManager.getSubscription() };`);
  check('sign-out clean-up: pushSubId is null, remindOn is false, no browser subscription', after.id === null && after.on === false && after.sub === null, after);
  await send('Page.navigate', { url: APP_URL + '/' });
  await sleep(3500);
  await killModals();
  await openSettings();
  const s = await settingsBlock();
  check('after the clean-up and a fresh start the switch reads Off', s && s.on === 'off', s && s.on);
}

let fatal = null;
try { await run(); } catch (e) { fatal = e; console.log('FATAL', e); }

fs.writeFileSync(path.join(OUT, 'errors.json'), JSON.stringify(errors, null, 1));
const bad = checks.filter(c => !c.ok);
console.log(`\n${checks.length - bad.length}/${checks.length} checks pass; console errors: ${errors.length}`);
for (const e of [...new Set(errors)]) console.log('  ' + e.slice(0, 200));
chrome.kill(); server.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(fatal || bad.length ? 1 : 0);
