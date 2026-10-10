// Headless-Chrome verification for the tab swipe on the puzzle modes: Rush,
// Blindfold and Sealed Moves (calc) swipe to the same neighbours as Puzzles (Openings one way,
// Play the other). The in-app pane does not composite, so this drives a real
// headless Chrome over CDP. Dev tool, not shipped.
//
//   node tools/cdp-verify-swipe-modes.mjs http://localhost:9190 <outDir>
//
// REALLY SWIPED (CDP Input.dispatchTouchEvent — a finger down, a dozen moves,
// a finger up; the page receives genuine touch pointer events): every tab
// swipe, every drag on a mode-chip strip, every drag on a board.
// CLICKED WITH element.click(), not a finger: ☰ and the drawer destinations,
// the three mode chips, Rush's Start button, Leaderboard and Friends on Profile.
// CALLED, not tapped: history.back() stands in for the Android Back gesture
// (it arrives at the app as the same popstate), and showScreen() opens
// Masterclass, a public profile and Set up position, with no data behind them.
// SEEDED: nothing. Nobody is signed in; the puzzles are the app's own.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';

const APP_URL = process.argv[2] || 'http://localhost:9190';
const OUT = process.argv[3] || path.join(os.tmpdir(), 'swipe-modes-shots');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-sw-'));
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 1200000).unref();

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
  const r = await send('Runtime.evaluate', { expression: `(async()=>{ ${expr} })()`, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
  return r.result.value;
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
}
const killModals = () => evalP(`document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove());`);
async function load(lang, scheme) {
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
  await send('Page.navigate', { url: APP_URL });
  await sleep(2500);
  await evalP(`localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1');`);
  await send('Page.reload', {});
  await sleep(3500);
  await killModals();
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
  }
});
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok }); console.error((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); };

const click = (sel, ms = 450) => evalP(`
  const e = document.querySelector(${JSON.stringify(sel)});
  if (!e) return false;
  e.click(); await new Promise(r => setTimeout(r, ${ms})); return true;`);
const tab = async screen => { await click('#tabmenu-btn', 350); await click(`#tabbar button[data-screen="${screen}"]`, 800); };
const call = screen => evalP(`const app = await import('/js/app.js'); app.showScreen('${screen}'); await new Promise(r => setTimeout(r, 500));`);
const back = async () => { await evalP(`history.back(); await new Promise(r => setTimeout(r, 500));`); };
const where = () => evalP(`const app = await import('/js/app.js');
  return { screen: app.activeScreen, title: document.getElementById('app-title-name').textContent.trim(),
    shown: [...document.querySelectorAll('main > section[id^="screen-"]')].filter(s => !s.classList.contains('hidden')).map(s => s.id.slice(7)) };`);
const text = id => evalP(`return document.getElementById('${id}').textContent.trim();`);
const hidden = id => evalP(`return document.getElementById('${id}').classList.contains('hidden');`);

// A finger: down at (x0,y), `steps` moves to (x1,y), up. `mid` runs with the
// finger still down, two thirds of the way across.
async function drag(x0, y, x1, mid) {
  const steps = 12;
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y, id: 1 }] });
  let midOut;
  for (let i = 1; i <= steps; i++) {
    await sleep(16);
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round(x0 + (x1 - x0) * i / steps), y, id: 1 }] });
    if (mid && i === 8) { await sleep(60); midOut = await mid(); }
  }
  await sleep(16);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(550); // the 250ms settle, then the switch
  return midOut;
}
// A height on the open screen where a finger at x lands on nothing that wants
// the drag for itself (no board, strip, button or field).
const freeY = x => evalP(`
  document.querySelector('main').scrollTop = 0;
  for (let y = 770; y > 110; y -= 10) {
    const e = document.elementFromPoint(${x}, y);
    if (e && e.closest('main') && !e.closest('.board, .seg, button, a, input, select, textarea, .plog, #puzzle-actions, .nag-bar, .movelist')) return y;
  }
  return -1;`);
// dir +1 = finger moves left (next tab), -1 = finger moves right (previous tab).
async function swipeTab(dir, mid) {
  const x0 = dir > 0 ? 300 : 75, x1 = dir > 0 ? 60 : 315;
  const y = await freeY(x0);
  if (y < 0) return { noRoom: true };
  return { y, mid: await drag(x0, y, x1, mid) };
}
// Centre of the first visible thing matching sel.
const centre = sel => evalP(`
  const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.getClientRects().length);
  if (!e) return null;
  e.scrollIntoView({ block: 'center', behavior: 'instant' });
  await new Promise(r => setTimeout(r, 150));
  const r = e.getBoundingClientRect();
  const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
  const hit = document.elementFromPoint(x, y);
  return { x, y, onIt: !!hit && (hit === e || e.contains(hit)), hit: hit ? hit.tagName + '.' + hit.className : null };`);
// Drag sideways starting on sel, far enough to switch tabs if nothing stopped it.
async function dragOn(sel) {
  const c = await centre(sel);
  if (!c) return null;
  await drag(c.x, c.y, c.x > 190 ? c.x - 180 : c.x + 180);
  return c;
}
const waitFor = async (sel, ms = 8000) => {
  for (let t = 0; t < ms; t += 250) {
    if (await evalP(`return [...document.querySelectorAll(${JSON.stringify(sel)})].some(e => e.getClientRects().length);`)) return true;
    await sleep(250);
  }
  return false;
};
// Rush counts in 5…1 over its board before the clock starts; wait that out.
const startedRun = async () => {
  for (let t = 0; t < 12000 && !(await hidden('rush-countdown')); t += 250) await sleep(250);
  await waitFor('#rush-board .sq.grabbable');
};
// Is the Rush clock moving? Two readings 1.3s apart.
const clockMoves = async () => { const a = await text('rush-timer'); await sleep(1300); return a !== await text('rush-timer'); };

const T = {
  en: { trainer: 'Openings', puzzles: 'Puzzles', play: 'Play', profile: 'Profile', analysis: 'Analysis', base: 'Bases' },
  es: { trainer: 'Aperturas', puzzles: 'Puzzles', play: 'Jugar', profile: 'Perfil', analysis: 'Análisis', base: 'Bases' },
};

// Swipe both ways off `screen` and come back with Back each time.
async function bothWays(tag, L, screen, reopen) {
  for (const [dir, to] of [[1, 'play'], [-1, 'trainer']]) {
    const side = dir > 0 ? 'left' : 'right';
    const s = await swipeTab(dir, dir > 0 ? () => evalP(`
      const cur = document.getElementById('screen-${screen}'), nb = document.getElementById('screen-${to}');
      return { curMoved: /translate3d\\(-/.test(cur.style.transform), nbShown: !nb.classList.contains('hidden'), nbFixed: nb.style.position === 'fixed',
        othersHidden: ['puzzles', 'rush', 'blind', 'calc'].filter(n => n !== '${screen}').every(n => document.getElementById('screen-' + n).classList.contains('hidden')) };`) : null);
    const w = await where();
    check(`${tag}: ${screen} — swipe ${side} lands on ${to}, top bar says "${L[to]}", only that screen shown`,
      w.screen === to && w.title === L[to] && w.shown.join() === to, { ...w, y: s.y });
    if (s.mid) check(`${tag}: ${screen} — mid-drag it is #screen-${screen} that follows the finger, with ${to} beside it`,
      s.mid.curMoved && s.mid.nbShown && s.mid.nbFixed && s.mid.othersHidden, s.mid);
    if (dir > 0 && screen !== 'puzzles') await shot(`${tag}-${screen}-to-${to}`);
    await back();
    const b = await where();
    check(`${tag}: ${screen} — Back after that swipe returns to ${screen}, top bar "${L.puzzles}"`, b.screen === screen && b.title === L.puzzles, b);
    if (reopen) await reopen();
  }
}
const noSwitch = async (tag, screen, what, sel) => {
  const c = await dragOn(sel);
  const w = await where();
  check(`${tag}: ${screen} — a sideways drag started on ${what} does not switch tabs`, !!c && c.onIt && w.screen === screen, c ? { ...w, finger: c } : 'nothing to drag');
};

for (const lang of ['en', 'es']) {
  for (const scheme of ['light', 'dark']) {
    const tag = `${lang}-${scheme}`;
    const L = T[lang];
    console.error(`\n── ${tag} ──`);
    await load(lang, scheme);

    // ── Puzzles: unchanged ──
    await tab('puzzles');
    await waitFor('#puzzle-board .sq.grabbable');
    await bothWays(tag, L, 'puzzles');
    await noSwitch(tag, 'puzzles', 'the mode chips', '#screen-puzzles .puzzle-modes');
    await noSwitch(tag, 'puzzles', 'a piece', '#puzzle-board .sq.grabbable');

    // ── Rush, before a run ──
    await click('#screen-puzzles .puzzle-modes button[data-v="rush"]', 700);
    await bothWays(tag, L, 'rush');
    await noSwitch(tag, 'rush', 'the mode chips', '#screen-rush .puzzle-modes');

    // ── Rush, run in progress ──
    await click('#rush-start', 600);
    await noSwitch(tag, 'rush', 'the count-in over the Rush board', '#rush-countdown');
    await startedRun();
    await noSwitch(tag, 'rush', 'a piece on the Rush board', '#rush-board .sq.grabbable');
    await noSwitch(tag, 'rush', 'an empty Rush square', '#rush-board .sq:not(.grabbable):not(:has(img))');
    check(`${tag}: rush — the clock is still running after those board drags`, await clockMoves());
    await swipeTab(1);
    const rs = { screen: (await where()).screen, clockStopped: !(await clockMoves()), noResultCard: await hidden('rush-result'), dialog: await evalP(`return !!document.querySelector('.modal-back');`) };
    await back();
    rs.back = (await where()).screen;
    // The same exit through the drawer, for comparison.
    await click('#screen-rush .puzzle-modes button[data-v="puzzles"]', 500);
    await click('#screen-puzzles .puzzle-modes button[data-v="rush"]', 700);
    await click('#rush-start', 300);
    await startedRun();
    const ranAgain = await clockMoves();
    await tab('play');
    const rd = { screen: (await where()).screen, clockStopped: !(await clockMoves()), noResultCard: await hidden('rush-result'), dialog: await evalP(`return !!document.querySelector('.modal-back');`) };
    await back();
    rd.back = (await where()).screen;
    check(`${tag}: rush mid-run — the swipe leaves exactly as the drawer does (on Play, clock stopped, no result card, no dialog, Back → rush)`,
      ranAgain && JSON.stringify(rs) === JSON.stringify(rd) && rs.screen === 'play' && rs.clockStopped && rs.noResultCard && !rs.dialog && rs.back === 'rush', { swipe: rs, drawer: rd });

    // ── Blindfold, during the memorise countdown ──
    const openBlind = async () => {
      await tab('puzzles');
      await click('#screen-puzzles .puzzle-modes button[data-v="blind"]', 900);
      // Blindfold opens on its start panel (since v17x); the countdown begins after Start.
      await click('#blind-go', 300);
      await waitFor('#blind-countdown');
    };
    await openBlind();
    const counting = !(await hidden('blind-countdown'));
    await swipeTab(1);
    const bs = { screen: (await where()).screen, countdownGone: await hidden('blind-countdown'), dialog: await evalP(`return !!document.querySelector('.modal-back');`) };
    await back();
    bs.back = (await where()).screen;
    await openBlind();
    await tab('play');
    const bd = { screen: (await where()).screen, countdownGone: await hidden('blind-countdown'), dialog: await evalP(`return !!document.querySelector('.modal-back');`) };
    await back();
    bd.back = (await where()).screen;
    check(`${tag}: blind mid-countdown — the swipe leaves exactly as the drawer does (on Play, countdown gone, no dialog, Back → blind)`,
      counting && JSON.stringify(bs) === JSON.stringify(bd) && bs.screen === 'play' && bs.countdownGone && !bs.dialog && bs.back === 'blind', { counting, swipe: bs, drawer: bd });

    await openBlind();
    await bothWays(tag, L, 'blind', openBlind);
    await noSwitch(tag, 'blind', 'the mode chips', '#screen-blind .puzzle-modes');

    // ── Blindfold, pieces hidden ──
    await openBlind();
    for (let t = 0; t < 14000 && !(await hidden('blind-countdown')); t += 500) await sleep(500);
    await sleep(600);
    const blindState = await evalP(`
      const b = document.getElementById('blind-board');
      const imgs = [...b.querySelectorAll('.sq img')];
      return { countdownGone: document.getElementById('blind-countdown').classList.contains('hidden'), pieces: imgs.length,
        seen: imgs.filter(i => { const c = getComputedStyle(i); return c.visibility !== 'hidden' && c.opacity !== '0' && c.display !== 'none'; }).length };`);
    check(`${tag}: blind — after the countdown the pieces are hidden`, blindState.countdownGone && blindState.pieces > 0 && blindState.seen === 0, blindState);
    await shot(`${tag}-blind-hidden`);
    await noSwitch(tag, 'blind', 'a hidden piece', '#blind-board .sq.grabbable');
    await noSwitch(tag, 'blind', 'an empty Blindfold square', '#blind-board .sq:not(:has(img))');

    // ── Sealed Moves: swipes as Puzzles does; its chips and its frozen board keep the drag ──
    const openCalc = async () => {
      await tab('puzzles');
      await click('#screen-puzzles .puzzle-modes button[data-v="calc"]', 900);
      await waitFor('#calc-board .sq.lastmove');
    };
    await openCalc();
    await bothWays(tag, L, 'calc', openCalc);
    await noSwitch(tag, 'calc', 'the mode chips', '#screen-calc .puzzle-modes');
    await noSwitch(tag, 'calc', 'a piece on the frozen board', '#calc-board .sq:has(img)');
    await noSwitch(tag, 'calc', 'an empty square of the frozen board', '#calc-board .sq:not(:has(img))');
    await swipeTab(1); // calc → play, so the next block starts where it did before

    // ── Swiping back INTO the Puzzles tab lands on plain Puzzles ──
    await swipeTab(-1); // play → ?
    let w = await where();
    check(`${tag}: swiping back from Play lands on plain Puzzles, not a mode`, w.screen === 'puzzles' && w.shown.join() === 'puzzles' && w.title === L.puzzles, w);

    // ── Sub-screens that keep a Back button: no neighbours, as before ──
    await tab('profile');
    for (const [name, open] of [['leaderboard', () => click('#profile-leaderboard-btn', 700)], ['friends', () => click('#profile-friends-btn', 700)],
      ['friends-leaderboard', () => call('friends-leaderboard')], ['friends-blocked', () => call('friends-blocked')],
      ['public-profile', () => call('public-profile')], ['masterclass', () => call('masterclass')], ['setup', () => call('setup')]]) {
      await open();
      await killModals();
      const before = await where();
      const a = await swipeTab(1), mid1 = await where();
      const b = await swipeTab(-1), after = await where();
      check(`${tag}: ${name} — opened, and a swipe either way goes nowhere`,
        before.screen === name && !a.noRoom && !b.noRoom && mid1.screen === name && after.screen === name && after.shown.join() === name, { before: before.screen, mid1: mid1.screen, after });
      if (name === 'leaderboard' || name === 'friends') {
        await back();
        w = await where();
        check(`${tag}: ${name} — Back still returns to Profile`, w.screen === 'profile', w);
      }
    }

    // ── An ordinary tab still swipes: Bases → Openings and back the other way ──
    await tab('base');
    await swipeTab(1);
    w = await where();
    check(`${tag}: base — swipe left still lands on Openings`, w.screen === 'trainer' && w.title === L.trainer, w);
    await swipeTab(-1);
    w = await where();
    check(`${tag}: trainer — swipe right still lands on Bases`, w.screen === 'base' && w.title === L.base, w);
  }
}

check('no uncaught page error', errors.length === 0, errors.join(' | ').slice(0, 400));
const failed = checks.filter(c => !c.ok);
console.error(`\n${checks.length - failed.length}/${checks.length} checks passed` + (failed.length ? ' — FAILED: ' + failed.map(f => f.name).join('; ') : ''));
ws.close();
chrome.kill();
process.exit(failed.length ? 1 : 0);
