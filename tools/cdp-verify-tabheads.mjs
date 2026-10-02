// Headless-Chrome verification for the compact tab headers: the ten top-level
// tabs no longer repeat their name in an <h2> under the top bar. The in-app
// pane does not composite, so screenshots come from a real headless Chrome over
// CDP. Dev tool, not shipped.
//
//   node tools/cdp-verify-tabheads.mjs http://localhost:9189 <outDir>
//
// REALLY CLICKED (element.click() on the live control, after checking that the
// control is the topmost thing at its own centre): ☰ and every drawer
// destination, the Puzzles / Blindfold / Rush chips, New base, Import PGN, Add
// book, ⟳, Leaderboard, Friends, a base, Game History, the Learn sections down
// to a lesson and an ending position, every Back, Settings → replay the tour,
// and every step of the tour.
// SEEDED: nobody is signed in. For the signed-in Students tab, Students.uid, one
// coaching link and one summary are written straight into the live Students
// object and Students.load is replaced by a counter (so ⟳ can be seen to call
// it). Masterclass, a public profile, Blocked and the Friends leaderboard are
// opened with the app's own showScreen() — a call, not a tap — with no data
// behind them, so only the heading's place in the row is checked there.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';

const APP_URL = process.argv[2] || 'http://localhost:9189';
const OUT = process.argv[3] || path.join(os.tmpdir(), 'tabheads-shots');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-th-'));
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 540000).unref();

const getJSON = url => new Promise((res, rej) => {
  http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });

let ws, msgId = 0, choosers = 0;
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
  } else if (msg.method === 'Page.fileChooserOpened') choosers++;
});
await send('Page.enable'); await send('Runtime.enable');
await send('Page.setInterceptFileChooserDialog', { enabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });

// Shared in-page helpers, prepended to every probe.
const LIB = `
  const vis = e => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 && getComputedStyle(e).visibility !== 'hidden'; };
  const txt = e => (e.textContent || '').trim();
  const wait = ms => new Promise(r => setTimeout(r, ms));
`;
// What the top of screen `id` looks like right now.
const probe = id => evalP(LIB + `
  const sec = document.getElementById('screen-${id}');
  document.querySelector('main').scrollTop = 0;
  const bar = document.getElementById('topbar').getBoundingClientRect();
  const shown = [...sec.querySelectorAll('*')].filter(e => vis(e) && !e.classList.contains('watermark') && !e.classList.contains('sr-only'));
  const h1 = [...document.querySelectorAll('h1')];
  return {
    open: !sec.classList.contains('hidden'),
    title: txt(document.getElementById('app-title-name')),
    h1: h1.length === 1 && h1[0].id === 'app-title' ? txt(h1[0]) : 'BAD:' + h1.length,
    h2: [...sec.querySelectorAll('h2')].filter(e => vis(e) && !e.classList.contains('sr-only')).map(txt),
    srH2: [...sec.querySelectorAll('h2.sr-only')].filter(e => e.getClientRects().length).map(txt),
    // Measured to the first thing with something to see (text, a childless
    // control or image, or a painted box such as a card or a button), not to
    // an empty wrapper that merely starts higher.
    gap: (() => { const leaf = shown.filter(e => !e.children.length || e.tagName === 'BUTTON' || getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)'
        || [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));
      return leaf.length ? Math.round(Math.min(...leaf.map(e => e.getBoundingClientRect().top)) - bar.bottom) : -1; })(),
    // The decorative watermark hangs off the right edge on purpose and <main>
    // clips it, so it is left out; anything else past the edge is a real fault.
    wide: document.documentElement.scrollWidth > window.innerWidth || shown.some(e => e.getBoundingClientRect().right > window.innerWidth + 0.5),
  };`);
// Is control `id` on screen, inside the viewport's width, and the topmost thing at its own centre?
const ctl = id => evalP(LIB + `
  const e = document.getElementById('${id}');
  if (!e) return { exists: false };
  const r = e.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { exists: true, visible: vis(e), text: txt(e), inside: r.left >= 0 && r.right <= window.innerWidth + 0.5,
    top: Math.round(r.top), onTop: !!hit && (hit === e || e.contains(hit)) };`);
const click = (sel, ms = 450) => evalP(LIB + `
  const e = document.querySelector(${JSON.stringify(sel)});
  if (!e) return false;
  e.click(); await wait(${ms}); return true;`);
const tab = async screen => { await click('#tabmenu-btn', 350); await click(`#tabbar button[data-screen="${screen}"]`, 800); };
const call = (screen) => evalP(`const app = await import('/js/app.js'); app.showScreen('${screen}'); await new Promise(r => setTimeout(r, 500));`);
const modalUp = () => evalP(`return !!document.querySelector('.modal-back');`);
const viewOpen = id => evalP(`const e = document.getElementById('${id}'); return !!e && !e.classList.contains('hidden') && e.getClientRects().length > 0;`);
const h2Of = id => evalP(LIB + `const e = document.getElementById('${id}'); return e && vis(e) ? txt(e) : null;`);
const h2In = sel => evalP(LIB + `const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find(vis); return e ? txt(e) : null;`);

const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok }); console.error((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); };
const GAP = 14; // px between the top bar and the first thing on the tab (main's own padding is 10)

const T = {
  en: { analysis: 'Analysis', endgame: 'Learn', base: 'Bases', trainer: 'Openings', puzzles: 'Puzzles', play: 'Play', read: 'Read', students: 'Students', profile: 'Profile',
    rush: 'Puzzle Rush', blind: 'Blindfold Puzzles', history: '📜 Game History', endings: 'Endings', lb: 'Leaderboard', friends: 'Friends', blocked: 'Blocked', flb: 'Friends leaderboard', setup: 'Set up position' },
  es: { analysis: 'Análisis', endgame: 'Aprender', base: 'Bases', trainer: 'Aperturas', puzzles: 'Puzzles', play: 'Jugar', read: 'Leer', students: 'Alumnos', profile: 'Perfil',
    rush: 'Puzzle Rush', blind: 'Puzzles a ciegas', history: '📜 Historial de partidas', endings: 'Finales', lb: 'Clasificación', friends: 'Amigos', blocked: 'Bloqueados', flb: 'Clasificación de amigos', setup: 'Colocar posición' },
};

// One top-level tab: right title, no second title, first content close under the bar.
async function topTab(tag, L, screen, titleKey = screen) {
  const p = await probe(screen);
  await shot(`${tag}-tab-${screen}`);
  check(`${tag}: ${screen} — open, top bar says "${L[titleKey]}", and it is the page's one h1`, p.open && p.title === L[titleKey] && p.h1 === L[titleKey], p);
  check(`${tag}: ${screen} — no second title`, p.h2.length === 0, p.h2);
  check(`${tag}: ${screen} — first content ${p.gap}px under the top bar (limit ${GAP})`, p.gap >= 0 && p.gap <= GAP);
  check(`${tag}: ${screen} — no sideways scroll`, !p.wide);
  return p;
}
const okCtl = c => c.exists && c.visible && c.inside && c.onTop;

for (const lang of ['en', 'es']) {
  for (const scheme of ['light', 'dark']) {
    const tag = `${lang}-${scheme}`;
    const L = T[lang];
    console.error(`\n── ${tag} ──`);
    await load(lang, scheme);

    // The model: Analysis never had a second title.
    const ana = await probe('analysis');
    console.error('  analysis (the model): gap ' + ana.gap + 'px, h2 ' + JSON.stringify(ana.h2));
    check(`${tag}: analysis — top bar "${L.analysis}" is the h1`, ana.h1 === L.analysis);

    // ── Learn ──
    await tab('endgame');
    await topTab(tag, L, 'endgame');
    await click('#endgame-section-list .list-item:nth-child(2)');
    const cat = await h2Of('learn-cat-title');
    check(`${tag}: Learn → a section keeps its title beside Back`, !!cat && okCtl(await ctl('learn-back-cat')), cat);
    await click('#learn-lesson-list .list-item');
    const les = await h2Of('learn-lesson-title');
    await shot(`${tag}-sub-learn-lesson`);
    check(`${tag}: Learn → a lesson keeps its title beside Back`, !!les && okCtl(await ctl('learn-back-lessons')), les);
    await click('#learn-back-lessons'); await click('#learn-back-cat');
    await click('#endgame-section-list .list-item:nth-child(3)');
    const endT = await h2In('#endgame-list-view h2');
    check(`${tag}: Learn → Endings keeps "${L.endings}"`, endT === L.endings, endT);
    await click('#endgame-cat-list .list-item');
    const ecat = await h2Of('endgame-cat-title');
    check(`${tag}: Learn → an endings category keeps its title`, !!ecat, ecat);
    await click('#endgame-pos-list .list-item');
    const epos = await h2Of('endgame-pos-title');
    await shot(`${tag}-sub-ending-position`);
    check(`${tag}: Learn → an ending position keeps its title`, !!epos, epos);
    await click('#endgame-back-pos'); await click('#endgame-back-cat'); await click('#endgame-back-sections');
    check(`${tag}: Learn — every Back leads home to the section list`, await viewOpen('endgame-sections-view'));

    // ── Bases ──
    await tab('base');
    await topTab(tag, L, 'base');
    const bNew = await ctl('base-new'), bImp = await ctl('base-import-new'), bCnt = await ctl('base-count');
    check(`${tag}: base — New base and Import PGN on ONE row, counter present`, okCtl(bNew) && okCtl(bImp) && bCnt.exists && bNew.top === bImp.top, { bNew, bImp, bCnt });
    await click('#base-new');
    check(`${tag}: base — New base opens its dialog`, await modalUp());
    await killModals();
    let before = choosers; await click('#base-import-new');
    check(`${tag}: base — Import PGN opens the file picker`, choosers === before + 1);
    const hasBase = await click('#base-list .list-item');
    if (hasBase) {
      const bt = await h2Of('base-games-title');
      await shot(`${tag}-sub-base-games`);
      check(`${tag}: base → an open base keeps its name beside Back`, !!bt && okCtl(await ctl('base-back')), bt);
      await click('#base-back');
    } else console.error('  (no base in a fresh profile — an open base was not checked)');

    // ── Openings ──
    await tab('trainer');
    await topTab(tag, L, 'trainer');

    // ── Puzzles, Blindfold, Rush ──
    await tab('puzzles');
    await sleep(1200);
    await topTab(tag, L, 'puzzles');
    const pe = await ctl('puzzle-elo'), pd = await ctl('puzzle-elo-delta');
    check(`${tag}: puzzles — rating badge shown, change badge still in the page`, pe.exists && pe.visible && pe.inside && /\d/.test(pe.text) && pd.exists, pe);
    await click('#screen-puzzles .puzzle-modes button[data-v="blind"]', 1500);
    const bl = await topTab(tag, L, 'blind', 'puzzles');
    const be = await ctl('blind-elo');
    check(`${tag}: blind — hidden heading "${L.blind}" for screen readers, Blindfold chip lit`, bl.srH2[0] === L.blind && await evalP(`return document.querySelector('#screen-blind .puzzle-modes button.on')?.dataset.v === 'blind';`), bl.srH2);
    check(`${tag}: blind — rating badge shown`, be.exists && be.visible && be.inside && /\d/.test(be.text), be);
    await click('#screen-blind .puzzle-modes button[data-v="rush"]', 900);
    const ru = await topTab(tag, L, 'rush', 'puzzles');
    check(`${tag}: rush — hidden heading "${L.rush}" for screen readers, Rush chip lit`, ru.srH2[0] === L.rush && await evalP(`return document.querySelector('#screen-rush .puzzle-modes button.on')?.dataset.v === 'rush';`), ru.srH2);
    await click('#screen-rush .puzzle-modes button[data-v="puzzles"]', 900);

    // ── Play ──
    await tab('play');
    await topTab(tag, L, 'play');
    await click('#play-history-btn');
    const hi = await h2In('#play-history h2');
    await shot(`${tag}-sub-play-history`);
    check(`${tag}: play → Game History keeps "${L.history}"`, hi === L.history, hi);
    await click('#hist-back');

    // ── Read ──
    await tab('read');
    await topTab(tag, L, 'read');
    const ra = await ctl('read-add');
    check(`${tag}: read — Add book present and reachable`, okCtl(ra), ra);
    before = choosers; await click('#read-add');
    const readModal = await modalUp();
    check(`${tag}: read — Add book reacts (file picker or dialog)`, choosers === before + 1 || readModal, { choosers: choosers - before, readModal });
    await killModals();

    // ── Profile and what hangs off it ──
    await tab('profile');
    await topTab(tag, L, 'profile');
    check(`${tag}: profile — Leaderboard and Friends buttons reachable`, okCtl(await ctl('profile-leaderboard-btn')) && okCtl(await ctl('profile-friends-btn')));
    await click('#profile-leaderboard-btn', 700);
    if (await evalP(`return !document.getElementById('screen-leaderboard').classList.contains('hidden');`)) {
      const t1 = await h2In('#screen-leaderboard h2');
      await shot(`${tag}-sub-leaderboard`);
      check(`${tag}: profile → Leaderboard (tapped) keeps "${L.lb}"`, t1 === L.lb, t1);
      await click('#leaderboard-back', 600);
    } else { console.error('  (Leaderboard did not open by tap while signed out — opened by call below)'); await killModals(); }
    await call('profile');
    await click('#profile-friends-btn', 700);
    const friendsByTap = await evalP(`return !document.getElementById('screen-friends').classList.contains('hidden');`);
    await killModals();
    for (const [scr, key] of [['leaderboard', 'lb'], ['friends', 'friends'], ['friends-blocked', 'blocked'], ['friends-leaderboard', 'flb']]) {
      await call(scr);
      const t2 = await h2In(`#screen-${scr} h2`);
      const p2 = await probe(scr);
      check(`${tag}: ${scr} (opened by call) keeps "${L[key]}" under top bar "${L.profile}"`, t2 === L[key] && p2.title === L.profile, { t2, title: p2.title });
    }
    console.error('  friends opened by a real tap: ' + friendsByTap);
    for (const [scr, id] of [['masterclass', 'mc-title'], ['public-profile', 'pubprofile-name']]) {
      await call(scr);
      const there = await evalP(`const e = document.getElementById('${id}'); return !!e && e.tagName === 'H2' && e.parentElement.getClientRects().length > 0;`);
      check(`${tag}: ${scr} (opened by call, no data) — its title heading is still in the head row`, there);
    }
    await call('analysis');
    await click('#ana-setup-btn', 700);
    const su = await h2In('#screen-setup h2');
    check(`${tag}: analysis → Set up position keeps "${L.setup}"`, su === L.setup, su);
    await call('analysis');

    // ── Students: signed out (real), then signed in (seeded) ──
    await tab('students');
    const so = await topTab(tag, L, 'students');
    await shot(`${tag}-tab-students-signedout`);
    check(`${tag}: students signed out — sign-in button is the content, ⟳ is not shown`, okCtl(await ctl('stu-signin')) && !(await ctl('stu-refresh')).visible, so);
    await evalP(`
      const { Students } = await import('/js/students.js');
      const app = await import('/js/app.js');
      window.__loads = 0;
      Students.load = async () => { window.__loads++; };
      Students.uid = 'teacher'; Students.loaded = true; Students.failed = false;
      Students.asStudent = []; Students.homework = []; Students.finNew = []; Students.hwGiven = {};
      Students.people = {};
      Students.asTeacher = [{ studentUid: 'ana', teacherUid: 'teacher', status: 'active' }];
      Students.reports = { ana: { profileName: 'Ana', username: 'ana', puzzleElo: 1500, updatedAt: { seconds: Math.floor(Date.now() / 1000) - 600 } } };
      app.showScreen('analysis'); app.showScreen('students');
      await new Promise(r => setTimeout(r, 500));`);
    await topTab(tag, L, 'students');
    const rf = await ctl('stu-refresh');
    const loads0 = await evalP(`return window.__loads;`);
    await click('#stu-refresh', 200);
    const loads1 = await evalP(`return window.__loads;`);
    const sameRow = await evalP(`const a = document.getElementById('stu-refresh').getBoundingClientRect(), b = document.querySelector('[data-i18n="stu_my_students"]').getBoundingClientRect();
      return a.top < b.bottom && a.bottom > b.top && a.left > b.right;`);
    check(`${tag}: students signed in (seeded) — ⟳ sits right of "My students", reachable, and one tap reloads once`, okCtl(rf) && sameRow && loads1 === loads0 + 1, { rf, sameRow, loads0, loads1 });

    // ── The guided tour, from Settings, every step ──
    await load(lang, scheme);
    await click('#btn-settings', 600);
    const started = await evalP(LIB + `
      const { t } = await import('/js/i18n.js');
      const b = [...document.querySelectorAll('.modal-back button')].find(x => txt(x) === t('tour_replay'));
      if (!b) return false;
      b.click(); await wait(900);
      return !!document.getElementById('tour-root');`);
    check(`${tag}: tour — starts from Settings`, started);
    if (started) {
      const walk = await evalP(LIB + `
        const Tour = (await import('/js/tour.js')).default;
        const seen = [], bad = [];
        for (let guard = 0; guard < 80 && Tour.running; guard++) {
          await wait(450);
          const st = Tour.step(), i = Tour.idx;
          const ring = document.querySelector('#tour-root .tour-ring');
          const sels = st.target == null ? [] : [].concat(st.target);
          const found = sels.filter(s => { const e = document.querySelector(s); return e && e.getClientRects().length; });
          seen.push(st.key);
          if (sels.length && (found.length !== sels.length || ring.hidden)) bad.push(st.key + ' → ' + sels.join(' + '));
          if (st.action === 'tap') {
            let e = document.querySelector(sels[0]);
            if (e && !e.matches('button, .list-item')) e = e.querySelector('.list-item, button') || e;
            if (!e) { bad.push(st.key + ' (nothing to tap)'); break; }
            e.click();
            for (let k = 0; k < 16 && Tour.running && Tour.idx === i; k++) await wait(250);
            if (Tour.running && Tour.idx === i) { bad.push(st.key + ' (tap did not advance)'); break; }
          } else document.querySelector('#tour-root .tour-next').click();
        }
        await wait(400);
        const total = +(document.querySelector('.tour-count')?.textContent.match(/(\\d+)\\D*$/)?.[1] || 0);
        return { steps: seen.length, distinct: new Set(seen).size, last: seen[seen.length - 1], bad, finished: !Tour.running && !document.getElementById('tour-root') };`);
      console.error('  tour: ' + JSON.stringify(walk));
      check(`${tag}: tour — ${walk.steps} steps walked to the end, every highlighted target exists and is ringed`, walk.finished && walk.last === 'done' && walk.bad.length === 0 && walk.steps === walk.distinct, walk.bad);
    }
  }
}

check('no uncaught page error', errors.length === 0, errors.join(' | ').slice(0, 400));
const failed = checks.filter(c => !c.ok);
console.error(`\n${checks.length - failed.length}/${checks.length} checks passed` + (failed.length ? ' — FAILED: ' + failed.map(f => f.name).join('; ') : ''));
ws.close();
chrome.kill();
process.exit(failed.length ? 1 : 0);
