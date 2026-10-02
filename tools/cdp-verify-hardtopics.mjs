// Headless-Chrome verification for the Students tab's "Hardest topics for your
// students" block and the weak-spot marks on a student's page. The in-app pane
// does not composite, so screenshots come from a real headless Chrome over CDP.
// Dev tool, not shipped.
//
//   node tools/cdp-verify-hardtopics.mjs http://localhost:9188 <outDir>
//
// SEEDED (nobody is signed in and no Firestore is read): Students.uid, the
// coaching links (asTeacher) and the students' summaries (reports) are written
// straight into the live Students object, Students.load is replaced by a no-op
// so opening the tab cannot wipe them, and the tab is opened with the app's own
// showScreen('students') — a call, not a tap. REALLY CLICKED: the student
// cards, "Show all" and the page's Close button.
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';

const APP_URL = process.argv[2] || 'http://localhost:9188';
const OUT = process.argv[3] || path.join(os.tmpdir(), 'hardtopics-shots');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 600);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-ht-'));
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('VERIFY TIMEOUT'); process.exit(2); }, 300000).unref();

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
  const r = await send('Runtime.evaluate', { expression: `(async()=>{ ${expr} })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
  return r.result.value;
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
  console.error('  shot ' + name);
}
async function load(lang, scheme) {
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
  await send('Page.navigate', { url: APP_URL });
  await sleep(2500);
  await evalP(`localStorage.setItem('lang', '${lang}'); localStorage.setItem('tourDone', '1');`);
  await send('Page.reload', {});
  await sleep(3500);
  await evalP(`document.querySelectorAll('.tour-back, .tour-overlay, .modal-back').forEach(e => e.remove());`);
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

// ── the seed ──
// Seven accepted students and one pending invitation. A theme is a weak spot
// when its (rounded) rating is 75 or more under the student's own puzzle
// rating, the lowest three at most. Counted BY HAND from the numbers below:
//
//   Ana   1500  fork 1300 (−200) · pin 1380 (−120) · skewer 1410 (−90) ·
//               discoveredAttack 1425.4 → 1425 (−75, a 4th: over the cap of 3) ·
//               mateIn2 1430 (−70, too close) · 7 more themes above 1500 ·
//               meta-tags endgame/short/crushing far below — never shown
//               → WEAK: fork, pin, skewer.          12 named themes in all.
//   Luis  1000  fork 880 (−120) · hangingPiece 900 (−100) · pin 940 (−60)
//               → WEAK: fork, hangingPiece.
//   Marta 1900  pin 1700 (−200) · fork 1820 (−80) · skewer 1826 (−74)
//               → WEAK: pin, fork.
//   Nico  1200  skewer 1100 (−100) · backRankMate 1125 (−75, exactly on the
//               line) · pin 1126 (−74) → WEAK: skewer, backRankMate.
//   Olga  1300  shares no themes at all.
//   Pepe        no summary yet.
//   Quique 1400 only meta-tags (endgame, short) — nothing the app names.
//   Rita        invitation still pending — not a student yet.
//
// So 4 of 7 students share themes, and per theme:
//   fork   Ana, Luis, Marta  = 3   (200 + 120 + 80  = 400)
//   pin    Ana, Marta        = 2   (120 + 200       = 320)
//   skewer Ana, Nico         = 2   (90 + 100        = 190)
//   hangingPiece Luis = 1 · backRankMate Nico = 1   → below two, not listed
// Expected block: 1. fork 3 of 4 · 2. pin 2 of 4 · 3. skewer 2 of 4.
const REPORTS = {
  ana: { profileName: 'Ana', username: 'ana', puzzleElo: 1500.3, puzzleThemeElo: {
    fork: 1300, pin: 1380, skewer: 1410, discoveredAttack: 1425.4, mateIn2: 1430,
    mateIn1: 1560, sacrifice: 1540, deflection: 1520, attraction: 1610, promotion: 1505,
    quietMove: 1515, zugzwang: 1650, endgame: 900, short: 800, crushing: 850 } },
  luis: { profileName: 'Luis', username: 'luis', puzzleElo: 1000, puzzleThemeElo: {
    fork: 880, hangingPiece: 900, pin: 940, mateIn1: 1080, endgame: 700 } },
  marta: { profileName: 'Marta', username: 'marta', puzzleElo: 1900, puzzleThemeElo: {
    pin: 1700, fork: 1820, skewer: 1826, mateIn2: 1950, sacrifice: 1930 } },
  nico: { profileName: 'Nico', username: 'nico', puzzleElo: 1200, puzzleThemeElo: {
    skewer: 1100, backRankMate: 1125, pin: 1126, fork: 1210, mateIn1: 1300, endgame: 700 } },
  olga: { profileName: 'Olga', username: 'olga', puzzleElo: 1300 },
  quique: { profileName: 'Quique', username: 'quique', puzzleElo: 1400, puzzleThemeElo: { endgame: 900, short: 950 } },
};
const PEOPLE = { pepe: { uid: 'pepe', profileName: 'Pepe', username: 'pepe' }, rita: { uid: 'rita', profileName: 'Rita', username: 'rita' } };
const WEAK = { ana: ['fork', 'pin', 'skewer'], luis: ['fork', 'hangingPiece'], marta: ['pin', 'fork'], nico: ['skewer', 'backRankMate'] };
const NAMED = { ana: 12, luis: 4, marta: 5, nico: 5 };

// Puts `uids` on the tab as accepted students (plus `pending` invitations) and
// returns what the block shows. Theme labels are looked up by id, so the
// expectations above stay in ids whatever the language.
const seed = (uids, pending = []) => evalP(`
  const { Students } = await import('/js/students.js');
  const app = await import('/js/app.js');
  const { t } = await import('/js/i18n.js');
  const all = ${JSON.stringify(REPORTS)};
  Students.load = async () => {};
  Students.uid = 'teacher'; Students.loaded = true; Students.failed = false;
  Students.asStudent = []; Students.homework = []; Students.finNew = []; Students.hwGiven = {};
  Students.people = ${JSON.stringify(PEOPLE)};
  Students.asTeacher = [
    ...${JSON.stringify(uids)}.map(u => ({ studentUid: u, teacherUid: 'teacher', status: 'active' })),
    ...${JSON.stringify(pending)}.map(u => ({ studentUid: u, teacherUid: 'teacher', status: 'pending' })),
  ];
  Students.reports = {};
  for (const u of ${JSON.stringify(uids)}) if (all[u]) Students.reports[u] = { ...all[u], updatedAt: { seconds: Math.floor(Date.now() / 1000) - 600 } };
  app.showScreen('students');
  await new Promise(r => setTimeout(r, 400));
  const label = {};
  for (const id of ['fork', 'pin', 'skewer', 'hangingPiece', 'backRankMate']) label[t('theme_' + id)] = id;
  const wrap = document.getElementById('stu-hard');
  return {
    onScreen: !document.getElementById('screen-students').classList.contains('hidden'),
    hidden: wrap.classList.contains('hidden'),
    title: wrap.querySelector('h3').textContent,
    note: document.getElementById('stu-hard-note').textContent,
    rows: [...wrap.querySelectorAll('.stu-hard-row')].map(r => ({
      head: r.querySelector('b').textContent, id: label[r.querySelector('b').textContent.replace(/^\\d+\\. /, '')] || '?',
      count: r.querySelector('em').textContent, who: r.querySelector('span').textContent,
      bar: r.querySelector('i b').style.width })),
    cards: [...document.querySelectorAll('#stu-list .stu-card')].length,
    above: wrap.getBoundingClientRect().top < document.getElementById('stu-list').getBoundingClientRect().top,
    wide: document.documentElement.scrollWidth > window.innerWidth,
  };`);

// Clicks the roster card of the student called `name` and reads the themes.
const openStudent = name => evalP(`
  const { t } = await import('/js/i18n.js');
  const card = [...document.querySelectorAll('#stu-list .stu-card')].find(c => c.querySelector('.fr-name').firstChild.textContent === ${JSON.stringify(name)});
  if (!card) return { missing: true };
  card.click();
  await new Promise(r => setTimeout(r, 400));
  const page = document.querySelector('.stu-page');
  if (!page) return { noPage: true, tappable: card.classList.contains('tappable') };
  const label = {};
  for (const id of ['fork', 'pin', 'skewer', 'hangingPiece', 'backRankMate', 'discoveredAttack', 'mateIn2']) label[t('theme_' + id)] = id;
  const read = () => [...page.querySelectorAll('.stu-theme')].map(e => ({
    id: label[e.querySelector('span').textContent] || e.querySelector('span').textContent, v: +e.querySelector('b').textContent,
    weak: e.classList.contains('weak'), mark: !!e.querySelector('i'), aria: e.querySelector('i')?.getAttribute('aria-label') || '',
    clipped: e.scrollWidth > e.clientWidth }));
  const first = read();
  const more = page.querySelector('.stu-more');
  if (more) { more.click(); await new Promise(r => setTimeout(r, 200)); }
  const edge = page.querySelector('.stu-theme.weak');
  return { first, all: read(), hadMore: !!more, key: page.querySelector('.stu-weak-key')?.textContent || '',
    hint: [...page.querySelectorAll('p.hint')].map(p => p.textContent),
    edge: edge ? getComputedStyle(edge).boxShadow : '',
    pageWide: page.scrollWidth > page.clientWidth, wide: document.documentElement.scrollWidth > window.innerWidth };`);
const closePage = () => evalP(`
  const b = [...document.querySelectorAll('.stu-page .btn.primary')].pop();
  if (b) b.click();
  await new Promise(r => setTimeout(r, 300));
  return !document.querySelector('.stu-page');`);
// Scrolls the open student page so the themes are in the picture.
const showThemes = () => evalP(`document.querySelector('.stu-page .stu-themes')?.scrollIntoView({ block: 'center' }); await new Promise(r => setTimeout(r, 200));`);

const log = (label, v) => console.error('  ' + label + ': ' + JSON.stringify(v));
const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok }); console.error((ok ? '  PASS ' : '  FAIL ') + name + (detail ? ' — ' + detail : '')); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const TEXT = {
  en: { title: 'Hardest topics for your students', count: c => `${c} of 4 students`, share: '4 of 7 students share themes', few: n => `So far: ${n}.`, none: 'No topic is a weak spot for two or more students.', mark: 'Weak spot', noThemes: 'No themed puzzles played yet.' },
  es: { title: 'Temas más difíciles para tus alumnos', count: c => `${c} de 4 alumnos`, share: '4 de 7 alumnos comparten temas', few: n => `Por ahora: ${n}.`, none: 'Ningún tema es un punto débil para dos o más alumnos.', mark: 'Punto débil', noThemes: 'Aún no ha resuelto problemas por tema.' },
};

for (const lang of ['en', 'es']) {
  for (const scheme of ['light', 'dark']) {
    const tag = `${lang}-${scheme}`;
    const T = TEXT[lang];
    console.error(`\n── ${tag} ──`);
    await load(lang, scheme);

    // 1. The whole class.
    const cls = await seed(['ana', 'luis', 'marta', 'nico', 'olga', 'pepe', 'quique'], ['rita']);
    log('class block', cls);
    check(`${tag}: Students tab is showing, 7 student cards`, cls.onScreen && cls.cards === 7);
    check(`${tag}: block visible, titled, above the roster`, !cls.hidden && cls.title === T.title && cls.above);
    check(`${tag}: ranking by hand count — fork, pin, skewer and nothing else`, same(cls.rows.map(r => r.id), ['fork', 'pin', 'skewer']));
    check(`${tag}: counts 3, 2, 2 of 4`, same(cls.rows.map(r => r.count), [T.count(3), T.count(2), T.count(2)]));
    check(`${tag}: who — Ana/Luis/Marta, Ana/Marta, Ana/Nico`, same(cls.rows.map(r => r.who), ['Ana, Luis, Marta', 'Ana, Marta', 'Ana, Nico']));
    check(`${tag}: rows are numbered 1-3 and bars are 75/50/50%`, same(cls.rows.map(r => r.head.slice(0, 3)), ['1. ', '2. ', '3. ']) && same(cls.rows.map(r => r.bar), ['75%', '50%', '50%']));
    check(`${tag}: note says 4 of 7 share themes and gives the 75-point rule`, cls.note.includes(T.share) && cls.note.includes('75'));
    check(`${tag}: no sideways scroll, class view`, !cls.wide);
    await shot(`${tag}-1-class`);

    // 2. Each student's page — cards really clicked.
    for (const [uid, name] of [['ana', 'Ana'], ['luis', 'Luis'], ['marta', 'Marta'], ['nico', 'Nico']]) {
      const pg = await openStudent(name);
      if (uid === 'ana') { log('Ana page', pg); await showThemes(); await shot(`${tag}-2-ana-themes`); }
      const weak = pg.all.filter(x => x.weak).map(x => x.id);
      check(`${tag}: ${name} — marked themes are exactly ${WEAK[uid].join(', ')}`, same(weak, WEAK[uid]), weak.join(','));
      check(`${tag}: ${name} — every mark has the ▼ and its "${T.mark}" label, no other row has one`,
        pg.all.every(x => x.weak === x.mark && (!x.weak || x.aria === T.mark)));
      check(`${tag}: ${name} — ${NAMED[uid]} named themes, lowest first, no meta-tag`,
        pg.all.length === NAMED[uid] && pg.all.every((x, i) => !i || pg.all[i - 1].v <= x.v) && !pg.all.some(x => ['endgame', 'short', 'crushing'].includes(x.id)));
      check(`${tag}: ${name} — key line names the 75 points and the rating`, pg.key.includes('75') && pg.key.includes(String(Math.round(REPORTS[uid].puzzleElo))));
      check(`${tag}: ${name} — gold edge drawn, no sideways scroll`, pg.edge !== 'none' && pg.edge !== '' && !pg.wide && !pg.pageWide);
      if (uid === 'ana') {
        check(`${tag}: Ana — 8 shown, then Show all gives 12`, pg.hadMore && pg.first.length === 8 && pg.all.length === 12);
        check(`${tag}: Ana — the 4th theme at −75 and mateIn2 at −70 are NOT marked`,
          pg.all.find(x => x.id === 'discoveredAttack')?.weak === false && pg.all.find(x => x.id === 'mateIn2')?.weak === false);
      }
      if (uid === 'nico') {
        check(`${tag}: Nico — exactly −75 is marked, −74 is not`,
          pg.all.find(x => x.id === 'backRankMate')?.weak === true && pg.all.find(x => x.id === 'pin')?.weak === false);
      }
      check(`${tag}: ${name} — Close closes the page`, await closePage());
    }
    for (const name of ['Olga', 'Quique']) {
      const pg = await openStudent(name);
      check(`${tag}: ${name} (shares no named theme) — page opens, says so, no mark, no key line`,
        !pg.noPage && !pg.missing && pg.all.length === 0 && pg.key === '' && pg.hint.includes(T.noThemes), JSON.stringify(pg.hint));
      if (name === 'Olga') await shot(`${tag}-3-olga-nothing`);
      await closePage();
    }
    const pepe = await openStudent('Pepe');
    check(`${tag}: Pepe (no summary) — card is not tappable, nothing opens`, pepe.noPage === true && pepe.tappable === false);

    // 3. One student only.
    const one = await seed(['ana']);
    log('one student', one);
    check(`${tag}: one student — block says it needs two, shows 1, ranks nothing`, !one.hidden && one.rows.length === 0 && one.note.includes(T.few(1)) && !one.wide);
    await shot(`${tag}-4-one-student`);

    // 4. Students, but none sharing themes.
    const zero = await seed(['olga', 'pepe', 'quique']);
    check(`${tag}: three students sharing nothing — says so with 0, ranks nothing`, !zero.hidden && zero.rows.length === 0 && zero.note.includes(T.few(0)));

    // 5. Two sharing students with no weak spot in common (Luis: fork,
    //    hangingPiece · Nico: skewer, backRankMate).
    const apart = await seed(['luis', 'nico']);
    log('nothing in common', apart);
    check(`${tag}: two students, nothing in common — plain sentence, no ranking`, apart.rows.length === 0 && apart.note.startsWith(T.none) && !apart.wide);
    await shot(`${tag}-5-nothing-in-common`);

    // 6. No accepted student (one pending invitation): no block at all.
    const nobody = await seed([], ['rita']);
    check(`${tag}: no accepted student — block is hidden`, nobody.hidden);
  }
}

check('no uncaught page error', errors.length === 0, errors.join(' | ').slice(0, 400));
const failed = checks.filter(c => !c.ok);
console.error(`\n${checks.length - failed.length}/${checks.length} checks passed` + (failed.length ? ' — FAILED: ' + failed.map(f => f.name).join('; ') : ''));
ws.close();
chrome.kill();
process.exit(failed.length ? 1 : 0);
