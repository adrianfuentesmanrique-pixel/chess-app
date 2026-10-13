// The profile icon in the top bar and Settings at the foot of the menu (the two
// swapped places). Dev tool, not shipped. Headless Chrome over CDP, signed out,
// no service worker; it serves the app itself.
//
//   node tools/cdp-verify-profile-icon.mjs <outDir>     about two minutes
//
// At 375 x 667 in ES and EN, light and dark. REALLY TAPPED (CDP touch events,
// after checking the control is the topmost thing at its own centre): the
// menu button, every drawer destination, the avatar in the top bar, Settings
// in the drawer, Leaderboard and Friends on Profile, the pencil and an avatar
// in the picker, "Replay the guided tour", the tour's Next and the avatar the
// tour points at. REALLY SWIPED: off Students and off Profile, both ways.
// CALLED, not tapped: history.back() for the Android Back gesture;
// showScreen('public-profile'), with no data behind it; Tour.go() to jump to
// the Profile step of the tour (tools/cdp-verify-tabheads.mjs walks every step).
// SEEDED: the friend-request dot. Nobody is signed in, so one request is
// written into the live Friends.incoming and Friends.paintCount() is called.
// NOT checked here: a signed-in user's avatar arriving from the cloud, and a
// real friend request lighting the dot.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/cdp-verify-profile-icon.mjs <outDir>'); process.exit(1); }
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const WEB = 9900 + Math.floor(Math.random() * 90);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-pi-'));
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 420000).unref();

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
});
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok }); console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); };
const shot = async name => fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
const until = async (expr, ms = 6000) => { for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (await ev(`return !!(${expr});`)) return true; await sleep(60); } return false; };
const touch = (type, p) => send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }] : [] });
// A finger on the centre of `sel`. Refuses (returns false) when something else
// is on top of it there, so a covered control cannot pass as tapped.
const tap = async (sel, ms = 450) => {
  const pt = await ev(`const e = typeof (${JSON.stringify(sel)}) === 'string' && document.querySelector(${JSON.stringify(sel)}); if (!e) return null;
    e.scrollIntoView({ block: 'nearest' });
    const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, hit = document.elementFromPoint(x, y);
    return { x, y, onTop: !!hit && (hit === e || e.contains(hit)) };`);
  if (!pt || !pt.onTop) return false;
  await touch('touchStart', pt); await sleep(40); await touch('touchEnd'); await sleep(ms);
  return true;
};
const killModals = () => ev(`document.querySelectorAll('.modal-back').forEach(e => e.remove());`);
const state = () => ev(`const app = await import('/js/app.js'), b = document.getElementById('btn-profile');
  return { screen: app.activeScreen, title: document.getElementById('app-title-name').textContent.trim(), titleIco: !!document.querySelector('#app-title-ico svg'),
    lit: [...document.querySelectorAll('#tabbar button.on')].map(x => x.dataset.screen), profOn: b.classList.contains('on'),
    menuOpen: document.body.classList.contains('menu-open'), modal: !!document.querySelector('.modal-back') };`);
async function swipe(dir) {
  const x0 = dir > 0 ? 300 : 75, x1 = dir > 0 ? 60 : 315;
  const y = await ev(`document.querySelector('main').scrollTop = 0;
    for (let y = 630; y > 110; y -= 10) { const e = document.elementFromPoint(${x0}, y);
      if (e && e.closest('main') && !e.closest('.board, .seg, button, a, input, select, textarea, .plog, .movelist, canvas')) return y; }
    return -1;`);
  if (y < 0) return false;
  await touch('touchStart', { x: x0, y });
  for (let i = 1; i <= 12; i++) { await sleep(16); await touch('touchMove', { x: x0 + (x1 - x0) * i / 12, y }); }
  await sleep(16); await touch('touchEnd'); await sleep(600);
  return true;
}

const TABS = ['analysis', 'endgame', 'base', 'trainer', 'puzzles', 'play', 'read', 'students'];
const L = { es: { profile: 'Perfil', settings: 'Ajustes' }, en: { profile: 'Profile', settings: 'Settings' } };

for (const lang of ['es', 'en']) {
  for (const scheme of ['light', 'dark']) {
    const tag = `${lang}-${scheme}`;
    console.log(`\n== ${tag} ==`);
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await send('Page.navigate', { url: `http://localhost:${WEB}/` });
    await sleep(1200);
    await ev(`localStorage.setItem('lang', '${lang}'); const db = await import('/js/db.js');
      await db.kvSet('tourDone', 'completed'); await db.kvSet('avatarId', 'pawn_w'); await db.kvSet('remindInvite', { never: true });`);
    await send('Page.reload', {});
    await until(`document.querySelector('#btn-profile img') && !document.getElementById('splash')?.offsetParent`, 10000);
    await sleep(1500);
    await killModals();

    // ── the top bar ──
    const bar = await ev(`const b = document.getElementById('btn-profile').getBoundingClientRect(), img = document.querySelector('#btn-profile img'), i = img.getBoundingClientRect(),
        t = document.getElementById('topbar').getBoundingClientRect(), m = document.getElementById('tabmenu-btn').getBoundingClientRect();
      return { gear: !!document.getElementById('btn-settings'), w: b.width, h: b.height, right: b.right, top: b.top, src: img.getAttribute('src'), loaded: img.naturalWidth > 0,
        img: Math.round(i.width) + 'x' + Math.round(i.height), imgRight: Math.round(innerWidth - i.right), menuLeft: Math.round(m.left + 8), barH: Math.round(t.height),
        label: document.getElementById('btn-profile').getAttribute('aria-label'), side: document.documentElement.scrollWidth - innerWidth };`);
    check(`[${tag}] the old settings button is gone from the top bar`, !bar.gear);
    check(`[${tag}] the profile icon is at least 44 x 44 to tap, inside the screen`, bar.w >= 44 && bar.h >= 44 && bar.right <= 375.5 && bar.top >= 0, bar);
    check(`[${tag}] it shows the saved avatar (the white pawn), loaded, 32px, as far from the right edge as the menu lines are from the left`,
      bar.src === 'avatars/pawn_w.png' && bar.loaded && bar.img === '32x32' && Math.abs(bar.imgRight - bar.menuLeft) <= 2, bar);
    check(`[${tag}] the bar is 52px high as before, nothing wider than the screen, the icon is named "${L[lang].profile}"`, bar.barH === 52 && bar.side <= 0 && bar.label === L[lang].profile, bar);
    await shot(`${tag}-1-topbar-analysis`);

    // ── every tab: the menu highlight, then the icon opens Profile, then Back ──
    for (const scr of TABS) {
      const a = await tap('#tabmenu-btn', 400);
      const b = await tap(`#tabbar button[data-screen="${scr}"]`, 900);
      await killModals();
      let s = await state();
      check(`[${tag}] ${scr}: opened from the menu; it alone is lit and the profile icon is not`, a && b && s.screen === scr && s.lit.join() === scr && !s.profOn && !s.menuOpen, s);
      const c = await tap('#btn-profile', 800);
      s = await state();
      check(`[${tag}] ${scr}: the profile icon opens Profile, ring on, no menu row lit, title "${L[lang].profile}" with its icon`,
        c && s.screen === 'profile' && s.profOn && s.lit.length === 0 && s.title === L[lang].profile && s.titleIco, s);
      if (scr === 'analysis') await shot(`${tag}-2-profile-open`);
      await ev(`history.back(); await new Promise(r => setTimeout(r, 500));`);
      s = await state();
      check(`[${tag}] ${scr}: Back returns from Profile to it, ring off`, s.screen === scr && !s.profOn && s.lit.join() === scr, s);
    }

    // ── swiping: Students is the end of the row; Profile has no neighbours ──
    let ok = await swipe(1), s = await state();
    check(`[${tag}] on Students (the last tab) a swipe onward goes nowhere`, ok && s.screen === 'students', s);
    ok = await swipe(-1); s = await state();
    check(`[${tag}] ... and a swipe back goes to Read`, ok && s.screen === 'read', s);
    await tap('#btn-profile', 800);
    const f = await swipe(1), s1 = await state(), g = await swipe(-1), s2 = await state();
    check(`[${tag}] on Profile a swipe either way goes nowhere`, f && g && s1.screen === 'profile' && s2.screen === 'profile', { s1: s1.screen, s2: s2.screen });

    // ── the screens reached from Profile keep the ring ──
    for (const [name, sel] of [['leaderboard', '#profile-leaderboard-btn'], ['friends', '#profile-friends-btn']]) {
      await ev(`(await import('/js/app.js')).showScreen('profile'); await new Promise(r => setTimeout(r, 500));`);
      const t0 = await tap(sel, 800);
      await killModals();
      s = await state();
      if (s.screen !== name) { console.log(`  (${name} did not open by tap while signed out: opened by call)`); await ev(`(await import('/js/app.js')).showScreen('${name}'); await new Promise(r => setTimeout(r, 400));`); s = await state(); }
      check(`[${tag}] ${name}: ring still on, title "${L[lang].profile}"`, t0 && s.screen === name && s.profOn && s.title === L[lang].profile && s.lit.length === 0, s);
      const t1 = await tap('#btn-profile', 700);
      s = await state();
      check(`[${tag}] ${name}: the icon goes back to Profile itself`, t1 && s.screen === 'profile' && s.profOn, s);
    }
    await ev(`(await import('/js/app.js')).showScreen('public-profile'); await new Promise(r => setTimeout(r, 400));`);
    s = await state();
    check(`[${tag}] public-profile (opened by call): ring on, title "${L[lang].profile}"`, s.profOn && s.title === L[lang].profile, s);

    // ── the avatar picked in Profile is the one in the top bar ──
    await ev(`(await import('/js/app.js')).showScreen('profile'); await new Promise(r => setTimeout(r, 600));`);
    const p1 = await tap('#profile-edit-btn', 700), p2 = await tap('.modal-box .avatar-pick-cell[data-id="lion"]', 700);
    const pic = await ev(`return { top: document.querySelector('#btn-profile img').getAttribute('src'), page: document.querySelector('#profile-avatar-wrap img').getAttribute('src') };`);
    check(`[${tag}] picking the lion in Profile changes the top bar at once`, p1 && p2 && pic.top === 'avatars/lion.png' && pic.page === pic.top, pic);
    await killModals();

    // ── the friend-request dot (seeded: nobody is signed in) ──
    await ev(`const { Friends } = await import('/js/friends.js'); Friends.incoming = [{ uid: 'seeded' }]; Friends.paintCount();`);
    const dot = await ev(`const b = document.getElementById('btn-profile'), c = getComputedStyle(b, '::after');
      return { cls: b.classList.contains('has-dot'), w: c.width, pos: c.position, bg: c.backgroundColor, gold: getComputedStyle(document.documentElement).getPropertyValue('--gold').trim() };`);
    check(`[${tag}] one waiting request (seeded) puts the 9px gold dot on the profile icon`, dot.cls && dot.w === '9px' && dot.pos === 'absolute', dot);
    await ev(`(await import('/js/app.js')).showScreen('analysis'); await new Promise(r => setTimeout(r, 500));`);
    await shot(`${tag}-3-dot`);
    await ev(`const { Friends } = await import('/js/friends.js'); Friends.incoming = []; Friends.paintCount();`);
    check(`[${tag}] ... and none takes it away`, await ev(`return !document.getElementById('btn-profile').classList.contains('has-dot');`));

    // ── Settings, the last row of the menu ──
    await tap('#tabmenu-btn', 500);
    const menu = await ev(`const nav = document.getElementById('tabbar'), kids = [...nav.children].map(e => e.id || e.dataset.screen || e.tagName), e = document.getElementById('menu-settings'), r = e.getBoundingClientRect();
      return { kids, text: e.textContent.trim(), h: Math.round(r.height), bottom: Math.round(r.bottom), vh: innerHeight, buttons: [...nav.querySelectorAll('button')].map(b => b.dataset.screen),
        profileRow: !!nav.querySelector('[data-screen="profile"]') };`);
    check(`[${tag}] the menu ends: divider, Limits & storage, "${L[lang].settings}"; no Profile row; eight destinations`,
      menu.kids.slice(-3).join() === 'HR,menu-limits,menu-settings' && menu.text === L[lang].settings && !menu.profileRow && menu.buttons.join() === TABS.join(), menu);
    check(`[${tag}] the Settings row is 44px or more and on the screen`, menu.h >= 44 && menu.bottom <= menu.vh, menu);
    await shot(`${tag}-4-menu`);
    const ts = await tap('#menu-settings', 800);
    s = await state();
    const sheet = await ev(`const { t } = await import('/js/i18n.js'); return [...document.querySelectorAll('.modal-back button')].some(b => b.textContent.trim() === t('tour_replay'));`);
    check(`[${tag}] tapping it closes the menu and opens the Settings sheet, the screen behind unchanged`, ts && s.modal && sheet && !s.menuOpen && s.screen === 'analysis', s);
    await shot(`${tag}-5-settings-sheet`);

    // ── the tour: started from that sheet; its Profile and Settings steps ──
    await ev(`const { t } = await import('/js/i18n.js'); [...document.querySelectorAll('.modal-back button')].find(b => b.textContent.trim() === t('tour_replay')).id = 'cdp-tour-replay';`);
    await tap('#cdp-tour-replay', 1200);
    check(`[${tag}] tour: starts from Settings in the menu`, await until(`document.getElementById('tour-root')`, 3000));
    const ring = () => ev(`const Tour = (await import('/js/tour.js')).default, st = Tour.step(), r = document.querySelector('#tour-root .tour-ring'), e = st.target && document.querySelector(st.target);
      const a = r.getBoundingClientRect(), b = e ? e.getBoundingClientRect() : null;
      return { key: st.key, hidden: r.hidden, around: !!b && a.left <= b.left && a.right >= b.right && a.top <= b.top && a.bottom >= b.bottom && a.width < b.width + 30,
        hint: getComputedStyle(document.querySelector('#tour-root .tour-scroll')).display !== 'none',
        body: document.querySelector('#tour-root .tour-body').textContent, menuOpen: document.body.classList.contains('menu-open'), inView: !!b && b.top >= 0 && b.bottom <= innerHeight };`);
    await ev(`const m = await import('/js/tour.js'), Tour = m.default; let i = 0; while (Tour.idx !== i || Tour.step().key !== 'profTab') { Tour.go(++i); if (i > 60) break; } await new Promise(r => setTimeout(r, 900));`);
    let r = await ring();
    check(`[${tag}] tour: the Profile step rings the avatar in the top bar, menu closed, and says where it is`,
      r.key === 'profTab' && !r.hidden && r.around && !r.menuOpen && /arriba a la derecha|top right/.test(r.body), r);
    await shot(`${tag}-6-tour-profile`);
    const tt = await tap('#btn-profile', 900);
    r = await ring(); s = await state();
    check(`[${tag}] tour: tapping the avatar there opens Profile and moves the tour on`, tt && s.screen === 'profile' && r.key === 'profMiss', { key: r.key, screen: s.screen });
    for (let k = 0; k < 6 && (await ring()).key !== 'settings'; k++) await tap('#tour-root .tour-next', 900);
    await sleep(1800);
    r = await ring();
    check(`[${tag}] tour: the Settings step opens the menu and rings its last row, on the screen, with no "keep scrolling" arrow`,
      r.key === 'settings' && !r.hidden && r.around && r.menuOpen && r.inView && !r.hint && /menú|menu/.test(r.body), r);
    await shot(`${tag}-7-tour-settings`);
    await tap('#tour-root .tour-next', 900);
    r = await ev(`const Tour = (await import('/js/tour.js')).default; return { key: Tour.step().key, menuOpen: document.body.classList.contains('menu-open') };`);
    check(`[${tag}] tour: the last step closes the menu again`, r.key === 'done' && !r.menuOpen, r);
    await tap('#tour-root .tour-next', 900);
    check(`[${tag}] tour: Finish ends it`, await ev(`return !document.getElementById('tour-root');`));
  }
}

check('no uncaught page error', errors.length === 0, errors.join(' | ').slice(0, 400));
const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed` + (failed.length ? ' — FAILED: ' + failed.map(f => f.name).join('; ') : ''));
ws.close(); chrome.kill(); server.close();
process.exit(failed.length ? 1 : 0);
