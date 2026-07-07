// Chess Training Center — main application.
import { Chess, validateFen } from '../vendor/chess.js';
import { t, getLang, setLang, applyStatic } from './i18n.js';
import { GameTree, parsePgn, splitPgn, START_FEN, nagText } from './tree.js';
import { Board, parsePlacement, setPieceSet, getPieceSet } from './board.js';
import { Engine, uciToMove, pvWithNumbers } from './engine.js';
import * as db from './db.js';
import { PUZZLES, PUZZLE_THEMES } from './puzzles-data.js';
import { ENDGAMES, ENDGAME_CATEGORIES } from './endgames-data.js';
import { Auth, authErrorMessage, fetchLeaderboard } from './firebase.js';

const $ = id => document.getElementById(id);
const engine = new Engine();

// ═════════════════════ small UI helpers ═════════════════════

let toastTimer = null;
function toast(msg, ms = 2200) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

function modal(contentBuilder) {
  return new Promise(resolve => {
    const root = $('modal-root');
    const back = document.createElement('div');
    back.className = 'modal-back';
    const box = document.createElement('div');
    box.className = 'modal-box';
    back.appendChild(box);
    const close = (v) => { back.remove(); resolve(v); };
    back.addEventListener('click', e => { if (e.target === back) close(null); });
    contentBuilder(box, close);
    root.appendChild(back);
  });
}

function askText(title, initial = '') {
  return modal((box, close) => {
    box.innerHTML = `<h3>${title}</h3>`;
    const inp = document.createElement('input');
    inp.className = 'input'; inp.value = initial;
    const row = document.createElement('div'); row.className = 'row';
    const ok = document.createElement('button'); ok.className = 'btn primary'; ok.textContent = t('ok');
    const ca = document.createElement('button'); ca.className = 'btn'; ca.textContent = t('cancel');
    ok.onclick = () => close(inp.value.trim() || null);
    ca.onclick = () => close(null);
    inp.onkeydown = e => { if (e.key === 'Enter') ok.click(); };
    row.append(ok, ca);
    box.append(inp, row);
    setTimeout(() => inp.focus(), 50);
  });
}

function askConfirm(msg) {
  return modal((box, close) => {
    box.innerHTML = `<p>${msg}</p>`;
    const row = document.createElement('div'); row.className = 'row';
    const ok = document.createElement('button'); ok.className = 'btn danger'; ok.textContent = t('yes');
    const ca = document.createElement('button'); ca.className = 'btn'; ca.textContent = t('no');
    ok.onclick = () => close(true); ca.onclick = () => close(false);
    row.append(ok, ca);
    box.append(row);
  });
}

// Bottom-sheet menu; items = [{label, action, danger}]
function sheet(items) {
  return modal((box, close) => {
    box.classList.add('sheet');
    for (const it of items) {
      const b = document.createElement('button');
      b.className = 'sheet-btn' + (it.danger ? ' danger' : '');
      b.textContent = it.label;
      b.onclick = () => { close(null); it.action(); };
      box.appendChild(b);
    }
    const ca = document.createElement('button');
    ca.className = 'sheet-btn cancel'; ca.textContent = t('cancel');
    ca.onclick = () => close(null);
    box.appendChild(ca);
  });
}

async function chooseBase(allowCreate = true) {
  let bases = await db.listBases();
  if (!bases.length) {
    const id = await db.createBase(t('my_games'));
    bases = [{ id, name: t('my_games'), count: 0 }];
  }
  return modal((box, close) => {
    box.innerHTML = `<h3>${t('choose_base')}</h3>`;
    for (const b of bases) {
      const btn = document.createElement('button');
      btn.className = 'sheet-btn';
      btn.textContent = `${b.name} (${b.count ?? 0} ${t('games')})`;
      btn.onclick = () => close(b.id);
      box.appendChild(btn);
    }
    if (allowCreate) {
      const nb = document.createElement('button');
      nb.className = 'sheet-btn';
      nb.textContent = '＋ ' + t('new_base');
      nb.onclick = async () => {
        const name = await askText(t('base_name'));
        if (name) { const id = await db.createBase(name); close(id); } else close(null);
      };
      box.appendChild(nb);
    }
    const ca = document.createElement('button');
    ca.className = 'sheet-btn cancel'; ca.textContent = t('cancel');
    ca.onclick = () => close(null);
    box.appendChild(ca);
  });
}

function openAuthModal() {
  return modal((box, close) => {
    let mode = 'signin';

    const tabs = document.createElement('div');
    tabs.className = 'auth-tabs';
    const tabIn = document.createElement('button'); tabIn.textContent = t('sign_in_tab'); tabIn.classList.add('on');
    const tabUp = document.createElement('button'); tabUp.textContent = t('sign_up_tab');
    tabs.append(tabIn, tabUp);

    const form = document.createElement('div');
    const errorEl = document.createElement('div'); errorEl.className = 'auth-error';

    const googleBtn = document.createElement('button');
    googleBtn.className = 'btn google-btn';
    googleBtn.innerHTML = `<img src="icons/google-g.svg" alt=""><span>${t('continue_with_google')}</span>`;
    const divider = document.createElement('div'); divider.className = 'auth-divider'; divider.textContent = t('or_divider');
    const switchLink = document.createElement('button'); switchLink.className = 'auth-link';

    async function withBusy(btn, fn) {
      errorEl.textContent = '';
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = '…';
      try {
        await fn();
        close(null);
      } catch (e) {
        const msg = e._msg ?? authErrorMessage(e.code, getLang());
        if (msg) errorEl.textContent = msg;
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    }

    googleBtn.onclick = () => withBusy(googleBtn, () => Auth.signInWithGoogle());

    function fieldInput(labelKey, type) {
      const wrap = document.createElement('div');
      const label = document.createElement('label'); label.className = 'fld-label'; label.textContent = t(labelKey);
      const input = document.createElement('input'); input.className = 'input'; input.type = type;
      wrap.append(label, input);
      return { wrap, input };
    }

    function renderForm() {
      form.innerHTML = '';
      errorEl.textContent = '';
      if (mode === 'signin') {
        const email = fieldInput('email', 'email');
        const pass = fieldInput('password', 'password');
        const submit = document.createElement('button');
        submit.className = 'btn primary big'; submit.textContent = t('sign_in_tab');
        submit.onclick = () => withBusy(submit, () => Auth.signInWithEmail(email.input.value.trim(), pass.input.value));
        switchLink.textContent = t('no_account_yet');
        form.append(email.wrap, pass.wrap, submit);
      } else {
        const first = fieldInput('first_name', 'text');
        const last = fieldInput('last_name', 'text');
        const dob = fieldInput('date_of_birth', 'date');
        const email = fieldInput('email', 'email');
        const pass = fieldInput('password', 'password');
        const pass2 = fieldInput('confirm_password', 'password');
        const submit = document.createElement('button');
        submit.className = 'btn primary big'; submit.textContent = t('create_account_btn');
        submit.onclick = () => withBusy(submit, () => {
          if (pass.input.value !== pass2.input.value) { const e = new Error('mismatch'); e.code = null; e._msg = t('passwords_dont_match'); throw e; }
          return Auth.signUpWithEmail({
            email: email.input.value.trim(), password: pass.input.value,
            firstName: first.input.value.trim(), lastName: last.input.value.trim(), dateOfBirth: dob.input.value,
          });
        });
        switchLink.textContent = t('have_account_already');
        form.append(first.wrap, last.wrap, dob.wrap, email.wrap, pass.wrap, pass2.wrap, submit);
      }
    }

    tabIn.onclick = () => { mode = 'signin'; tabIn.classList.add('on'); tabUp.classList.remove('on'); renderForm(); };
    tabUp.onclick = () => { mode = 'signup'; tabUp.classList.add('on'); tabIn.classList.remove('on'); renderForm(); };
    switchLink.onclick = () => (mode === 'signin' ? tabUp : tabIn).click();

    renderForm();
    box.append(tabs, form, errorEl, divider, googleBtn, switchLink);
  });
}

function openCompleteProfileModal() {
  return modal((box, close) => {
    box.innerHTML = `<h3>${t('complete_profile_title')}</h3><p class="hint">${t('complete_profile_hint')}</p>`;
    const first = document.createElement('input'); first.className = 'input'; first.placeholder = t('first_name');
    const last = document.createElement('input'); last.className = 'input'; last.placeholder = t('last_name');
    const dob = document.createElement('input'); dob.className = 'input'; dob.type = 'date'; dob.placeholder = t('date_of_birth');
    const errorEl = document.createElement('div'); errorEl.className = 'auth-error';
    const submit = document.createElement('button');
    submit.className = 'btn primary big'; submit.textContent = t('save');
    submit.onclick = async () => {
      if (!first.value.trim() || !last.value.trim()) return;
      submit.disabled = true;
      try {
        await Auth.completeProfile({ firstName: first.value.trim(), lastName: last.value.trim(), dateOfBirth: dob.value });
        close(null);
      } catch (e) {
        errorEl.textContent = authErrorMessage(e.code, getLang());
        submit.disabled = false;
      }
    };
    box.append(first, last, dob, errorEl, submit);
  });
}

async function sharePgnText(filename, text) {
  const file = new File([text], filename, { type: 'application/x-chess-pgn' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  // fallback: download
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast(t('saved'));
}

// ── shareable stat cards ──────────────────────────────────────────
function wrapCanvasText(ctx, text, cx, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '', lines = [];
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  const startY = y - (lines.length - 1) * lineHeight / 2;
  lines.forEach((l, i) => ctx.fillText(l, cx, startY + i * lineHeight));
}

function renderStatCard({ emoji, title, subtitle }) {
  const canvas = document.createElement('canvas');
  canvas.width = 1000; canvas.height = 1000;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 1000);
  grad.addColorStop(0, '#22201c'); grad.addColorStop(1, '#0f0d0b');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 1000, 1000);
  ctx.strokeStyle = '#7fa650'; ctx.lineWidth = 10;
  ctx.strokeRect(24, 24, 952, 952);
  ctx.textAlign = 'center';
  ctx.font = '220px sans-serif';
  ctx.fillText(emoji, 500, 430);
  ctx.fillStyle = '#f0ece6';
  ctx.font = 'bold 64px system-ui, sans-serif';
  wrapCanvasText(ctx, title, 500, 570, 820, 76);
  ctx.fillStyle = '#a99f92';
  ctx.font = '38px system-ui, sans-serif';
  wrapCanvasText(ctx, subtitle, 500, 680, 780, 48);
  ctx.fillStyle = '#7fa650';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.fillText('♞ Chess Training Center', 500, 940);
  return canvas;
}

async function shareStatCard(cardOpts, filename) {
  const canvas = renderStatCard(cardOpts);
  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast(t('saved'));
}

function headersFromPgn(pgnText) {
  const h = {};
  const re = /^\s*\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]\s*$/gm;
  let m;
  while ((m = re.exec(pgnText)) !== null) h[m[1]] = m[2];
  return h;
}

// ═════════════════════ daily streak ═════════════════════

// Streak tier ladder — icon art from streaks/{icon}.png, thresholds in days.
// Months converted at 30 days/month; the tail (rook/queen) extends the
// original artwork's 72-120 month cadence further so nothing repeats.
const STREAK_TIERS = [
  { days: 1, icon: 'flame1', label: { es: '1 día', en: '1 day' } },
  { days: 7, icon: 'flame2', label: { es: '7 días', en: '7 days' } },
  { days: 15, icon: 'flame3', label: { es: '15 días', en: '15 days' } },
  { days: 21, icon: 'flame4', label: { es: '21 días', en: '21 days' } },
  { days: 30, icon: 'flame5', label: { es: '1 mes', en: '1 month' } },
  { days: 60, icon: 'flame6', label: { es: '2 meses', en: '2 months' } },
  { days: 90, icon: 'pawn1', label: { es: '3 meses', en: '3 months' } },
  { days: 120, icon: 'pawn2', label: { es: '4 meses', en: '4 months' } },
  { days: 150, icon: 'pawn3', label: { es: '5 meses', en: '5 months' } },
  { days: 180, icon: 'pawn4', label: { es: '6 meses', en: '6 months' } },
  { days: 210, icon: 'pawn5', label: { es: '7 meses', en: '7 months' } },
  { days: 240, icon: 'pawn6', label: { es: '8 meses', en: '8 months' } },
  { days: 270, icon: 'pawn7', label: { es: '9 meses', en: '9 months' } },
  { days: 330, icon: 'pawn8', label: { es: '11 meses', en: '11 months' } },
  { days: 360, icon: 'pawn9', label: { es: '12 meses', en: '12 months' } },
  { days: 420, icon: 'knight1', label: { es: '14 meses', en: '14 months' } },
  { days: 480, icon: 'knight2', label: { es: '16 meses', en: '16 months' } },
  { days: 540, icon: 'knight3', label: { es: '18 meses', en: '18 months' } },
  { days: 720, icon: 'knight4', label: { es: '24 meses', en: '24 months' } },
  { days: 900, icon: 'knight5', label: { es: '30 meses', en: '30 months' } },
  { days: 1080, icon: 'knight6', label: { es: '36 meses', en: '36 months' } },
  { days: 1440, icon: 'knight7', label: { es: '48 meses', en: '48 months' } },
  { days: 1800, icon: 'knight8', label: { es: '60 meses', en: '60 months' } },
  { days: 2160, icon: 'bishop1', label: { es: '72 meses', en: '72 months' } },
  { days: 2520, icon: 'bishop2', label: { es: '84 meses', en: '84 months' } },
  { days: 2880, icon: 'bishop3', label: { es: '96 meses', en: '96 months' } },
  { days: 3240, icon: 'bishop4', label: { es: '108 meses', en: '108 months' } },
  { days: 3600, icon: 'bishop5', label: { es: '120 meses', en: '120 months' } },
  { days: 3960, icon: 'rook1', label: { es: '132 meses', en: '132 months' } },
  { days: 4320, icon: 'rook2', label: { es: '144 meses', en: '144 months' } },
  { days: 4680, icon: 'rook3', label: { es: '156 meses', en: '156 months' } },
  { days: 5040, icon: 'rook4', label: { es: '168 meses', en: '168 months' } },
  { days: 5400, icon: 'rook5', label: { es: '180 meses', en: '180 months' } },
  { days: 5760, icon: 'queen1', label: { es: '192 meses', en: '192 months' } },
  { days: 6120, icon: 'queen2', label: { es: '204 meses', en: '204 months' } },
  { days: 6480, icon: 'queen3', label: { es: '216 meses', en: '216 months' } },
  { days: 6840, icon: 'queen4', label: { es: '228 meses', en: '228 months' } },
  { days: 7200, icon: 'queen5', label: { es: '240 meses', en: '240 months' } },
];

function streakTierIndex(days) {
  let idx = -1;
  for (let i = 0; i < STREAK_TIERS.length; i++) if (days >= STREAK_TIERS[i].days) idx = i; else break;
  return idx; // -1 means below the first tier (0 days)
}
function streakIcon(days) {
  const idx = streakTierIndex(days);
  return idx >= 0 ? STREAK_TIERS[idx].icon : 'flame1';
}

const Streak = {
  count: 0,
  lastDate: null,

  async init() {
    this.count = +(await db.kvGet('streakCount', 0));
    this.lastDate = await db.kvGet('streakLastDate', null);
    // if the player missed a day entirely, the streak is broken (shown as 0 until next activity)
    const today = todayStr();
    if (this.lastDate && this.lastDate !== today && !isYesterday(this.lastDate, today)) {
      this.count = 0;
    }
    this.render();
  },

  async recordActivity() {
    const today = todayStr();
    if (this.lastDate === today) { this.render(); return; }
    if (this.lastDate && isYesterday(this.lastDate, today)) this.count += 1;
    else this.count = 1;
    this.lastDate = today;
    await db.kvSet('streakCount', this.count);
    await db.kvSet('streakLastDate', this.lastDate);
    const best = await db.kvGet('bestStreak', 0);
    if (this.count > best) await db.kvSet('bestStreak', this.count);
    this.render();
    Badges.checkNew();
  },

  render() {
    const el = $('streak-badge');
    if (!el) return;
    el.innerHTML = `<img src="streaks/${streakIcon(this.count)}.png" alt="" class="streak-icon-img"><span>${this.count}</span>`;
    el.classList.toggle('zero', this.count === 0);
  },
};

function todayStr() { return new Date().toISOString().slice(0, 10); }
function isYesterday(dateStr, todayStrVal) {
  const d = new Date(dateStr + 'T00:00:00');
  const t = new Date(todayStrVal + 'T00:00:00');
  return (t - d) === 86400000;
}

// Appends (or updates today's) point to a dated ELO history array kept in kv.
async function recordEloHistory(key, value) {
  const hist = await db.kvGet(key, []);
  const today = todayStr();
  const last = hist[hist.length - 1];
  if (last && last.date === today) last.value = Math.round(value);
  else hist.push({ date: today, value: Math.round(value) });
  while (hist.length > 400) hist.shift();
  await db.kvSet(key, hist);
}

// ═════════════════════ tabs ═════════════════════

const SCREENS = ['analysis', 'base', 'play', 'trainer', 'puzzles', 'setup', 'endgame', 'profile', 'leaderboard', 'public-profile', 'rush'];
let activeScreen = 'analysis';

function showScreen(name) {
  activeScreen = name;
  for (const s of SCREENS) $('screen-' + s).classList.toggle('hidden', s !== name);
  document.querySelectorAll('#tabbar button').forEach(b =>
    b.classList.toggle('on', b.dataset.screen === name));
  if (name !== 'analysis') Analysis.pauseEngine();
  if (name !== 'endgame') { engine.stop(); Endgame.engineOn = false; }
  if (name === 'base') Base.refresh();
  if (name === 'trainer') Trainer.refreshBases();
  if (name === 'puzzles') Puzzles.ensureLoaded();
  if (name === 'endgame') Endgame.ensureLoaded();
  if (name === 'profile') Profile.refresh();
}

document.querySelectorAll('#tabbar button').forEach(b =>
  b.addEventListener('click', () => showScreen(b.dataset.screen)));

// segment control helper
function segInit(el, onChange) {
  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    el.querySelectorAll('button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    if (onChange) onChange(b.dataset.v);
  });
}
function segValue(el) { return el.querySelector('button.on')?.dataset.v; }

// engine levels
const LEVELS = [
  { elo: 1320, movetime: 300 }, { elo: 1450, movetime: 400 },
  { elo: 1600, movetime: 500 }, { elo: 1800, movetime: 600 },
  { elo: 2000, movetime: 800 }, { elo: 2200, movetime: 1000 },
  { elo: 2500, movetime: 1500 }, { elo: null, movetime: 2000 },
];
function buildLevelSeg(el, def = 2) {
  el.innerHTML = '';
  const names = t('level_names');
  LEVELS.forEach((lv, i) => {
    const b = document.createElement('button');
    b.dataset.v = i;
    b.textContent = (i + 1) + '·' + names[i];
    if (i === def) b.classList.add('on');
    el.appendChild(b);
  });
}

// ═════════════════════ ANALYSIS ═════════════════════

const Analysis = {
  tree: new GameTree(),
  board: null,
  engineOn: false,
  ctx: { baseId: null, gameId: null },   // where this game lives, if saved
  restartTimer: null,

  init() {
    this.board = new Board($('ana-board'), {
      onMove: (mv) => { if (this.tree.play(mv)) this.refresh(); },
      onShapesChange: (shapes) => { this.tree.current.shapes = shapes; },
    });
    $('ana-first').onclick = () => { this.tree.toStart(); this.refresh(); };
    $('ana-prev').onclick = () => { this.tree.prev(); this.refresh(); };
    $('ana-next').onclick = () => { this.tree.next(); this.refresh(); };
    $('ana-last').onclick = () => { this.tree.toEnd(); this.refresh(); };
    $('ana-flip').onclick = () => this.board.flip();
    $('ana-engine-toggle').onclick = () => this.toggleEngine();
    $('ana-comment').onclick = () => this.editComment();
    $('ana-setup-btn').onclick = () => Setup.open(this.tree.fen());
    $('ana-more').onclick = () => this.moreMenu();
    $('ana-annotate-toggle').onclick = () => $('ana-annotate').classList.toggle('hidden');
    $('ana-annotate-clear').onclick = () => this.board.clearShapes();
    $('ana-annotate').querySelectorAll('.annotate-btn[data-color]').forEach(b => {
      b.onclick = () => {
        const active = b.classList.contains('active');
        $('ana-annotate').querySelectorAll('.annotate-btn[data-color]').forEach(x => x.classList.remove('active'));
        if (active) { this.board.setDrawColor(null); }
        else { b.classList.add('active'); this.board.setDrawColor(b.dataset.color); }
      };
    });
    $('ana-comment-save').onclick = () => {
      this.tree.current.comment = $('ana-comment-text').value.trim();
      $('ana-comment-box').classList.add('hidden');
      this.renderMoves();
    };
    $('ana-comment-cancel').onclick = () => $('ana-comment-box').classList.add('hidden');
    $('ana-moves').addEventListener('click', e => {
      const span = e.target.closest('[data-node]');
      if (!span) return;
      const node = this.tree.findById(+span.dataset.node);
      if (node) { this.tree.goto(node); this.refresh(); }
    });
    this.refresh();
  },

  loadTree(tree, ctx = { baseId: null, gameId: null }) {
    this.tree = tree;
    this.ctx = ctx;
    this.tree.toStart();
    this.tree.toEnd();
    this.refresh();
    showScreen('analysis');
  },

  refresh() {
    const cur = this.tree.current;
    const last = cur.san ? { from: cur.from, to: cur.to } : null;
    this.board.setPosition(this.tree.fen(), last);
    this.board.setShapes(cur.shapes);
    this.renderMoves();
    if (this.engineOn) this.restartEngine();
  },

  renderMoves() {
    const el = $('ana-moves');
    el.innerHTML = '';
    if (this.tree.root.comment) {
      const c = document.createElement('span');
      c.className = 'mv-comment'; c.textContent = this.tree.root.comment + ' ';
      el.appendChild(c);
    }
    this.renderLine(el, this.tree.root, true, 0);
    const curEl = el.querySelector('.mv.current');
    if (curEl) curEl.scrollIntoView({ block: 'nearest' });
  },

  renderLine(container, fromNode, forceNum, depth) {
    let node = fromNode.children[0];
    let parent = fromNode;
    let needNum = forceNum;
    while (node) {
      const { num, whiteMoves } = this.tree.moveNumberFor(node);
      const span = document.createElement('span');
      span.className = 'mv' + (node === this.tree.current ? ' current' : '');
      span.dataset.node = node.id;
      let label = '';
      if (whiteMoves) label = num + '.';
      else if (needNum) label = num + '…';
      needNum = false;
      label += node.san + node.nags.map(nagText).join('');
      span.textContent = label + ' ';
      container.appendChild(span);
      if (node.comment) {
        const c = document.createElement('span');
        c.className = 'mv-comment';
        c.dataset.node = node.id;
        c.textContent = node.comment + ' ';
        container.appendChild(c);
        needNum = true;
      }
      for (let i = 1; i < parent.children.length; i++) {
        const varEl = document.createElement('span');
        varEl.className = 'variation d' + Math.min(depth + 1, 3);
        varEl.appendChild(document.createTextNode('( '));
        this.renderLine(varEl, { children: [parent.children[i]] }, true, depth + 1);
        varEl.appendChild(document.createTextNode(') '));
        container.appendChild(varEl);
        needNum = true;
      }
      parent = node;
      node = node.children[0];
    }
  },

  // --- engine ---
  async toggleEngine() {
    this.engineOn = !this.engineOn;
    $('ana-engine').classList.toggle('hidden', !this.engineOn);
    $('ana-engine-toggle').classList.toggle('on', this.engineOn);
    if (this.engineOn) {
      $('ana-engine-lines').innerHTML = `<div class="engine-line">${t('loading')}</div>`;
      engine.onLine = lines => this.showLines(lines);
      this.restartEngine();
      if (!(await db.kvGet('firstEngineUsed', false))) { await db.kvSet('firstEngineUsed', true); Badges.checkNew(); }
    } else {
      engine.stop();
    }
  },

  restartEngine() {
    clearTimeout(this.restartTimer);
    const fen = this.tree.fen();
    this.restartTimer = setTimeout(async () => {
      const n = +(await db.kvGet('engineLines', 2));
      engine.onLine = lines => this.showLines(lines);
      engine.analyse(fen, n).catch(err => {
        $('ana-engine-lines').innerHTML = `<div class="engine-line">⚠️ ${err.message || err}</div>`;
      });
    }, 200);
  },

  pauseEngine() { if (this.engineOn) engine.stop(); },

  showLines(lines) {
    if (!this.engineOn || activeScreen !== 'analysis') return;
    const el = $('ana-engine-lines');
    el.innerHTML = '';
    for (const ln of lines) {
      const div = document.createElement('div');
      div.className = 'engine-line';
      div.innerHTML = `<b class="${ln.scoreNum >= 0 ? 'good' : 'bad'}">${ln.scoreText}</b> <span class="depth">d${ln.depth}</span> ${pvWithNumbers(this.tree.fen(), ln.pvSan)}`;
      div.onclick = () => { if (ln.firstUci && this.tree.play(uciToMove(ln.firstUci))) this.refresh(); };
      el.appendChild(div);
    }
  },

  editComment() {
    const box = $('ana-comment-box');
    box.classList.remove('hidden');
    $('ana-comment-text').value = this.tree.current.comment || '';
    $('ana-comment-text').focus();
  },

  async moreMenu() {
    const items = [
      { label: '📝 ' + t('game_details'), action: () => this.editDetails() },
      { label: '💾 ' + t('save_to_base'), action: () => this.saveToBase() },
      { label: '📤 ' + t('share_game'), action: () => sharePgnText(gameFilename(this.tree.headers), this.tree.toPgn()) },
      { label: '📋 ' + t('copy_pgn'), action: () => { copyText(this.tree.toPgn()); } },
      { label: '📋 ' + t('copy_fen'), action: () => { copyText(this.tree.fen()); } },
      { label: '🆕 ' + t('new_game'), action: () => this.loadTree(new GameTree()) },
      { label: '🤖 ' + t('play_from_here'), action: () => Play.startFromFen(this.tree.fen()) },
    ];
    if (this.tree.current.san) {
      items.push({ label: '⬆️ ' + t('promote_var'), action: () => { this.tree.promote(this.tree.current); this.renderMoves(); } });
      items.push({ label: '🗑 ' + t('delete_move'), action: () => { this.tree.deleteNode(this.tree.current); this.refresh(); }, danger: true });
    }
    sheet(items);
  },

  editDetails() {
    const H = this.tree.headers;
    modal((box, close) => {
      box.innerHTML = `<h3>${t('game_details')}</h3>`;
      const fields = [
        ['White', t('white')], ['Black', t('black')],
        ['Event', t('event')], ['Date', t('date')],
      ];
      const inputs = {};
      for (const [k, label] of fields) {
        const l = document.createElement('label'); l.textContent = label; l.className = 'fld-label';
        const i = document.createElement('input'); i.className = 'input';
        i.value = H[k] && H[k] !== '?' ? H[k] : '';
        if (k === 'Date') i.placeholder = '2026.07.05';
        inputs[k] = i;
        box.append(l, i);
      }
      const l = document.createElement('label'); l.textContent = t('result'); l.className = 'fld-label';
      const sel = document.createElement('select'); sel.className = 'input';
      for (const r of ['*', '1-0', '0-1', '1/2-1/2']) {
        const o = document.createElement('option'); o.value = r; o.textContent = r;
        if ((H['Result'] ?? '*') === r) o.selected = true;
        sel.appendChild(o);
      }
      box.append(l, sel);
      const row = document.createElement('div'); row.className = 'row';
      const ok = document.createElement('button'); ok.className = 'btn primary'; ok.textContent = t('ok');
      ok.onclick = () => {
        for (const [k] of fields) this.tree.setHeader(k, inputs[k].value.trim());
        this.tree.setHeader('Result', sel.value);
        close(null);
      };
      const ca = document.createElement('button'); ca.className = 'btn'; ca.textContent = t('cancel');
      ca.onclick = () => close(null);
      row.append(ok, ca);
      box.appendChild(row);
    });
  },

  async saveToBase() {
    let { baseId, gameId } = this.ctx;
    if (!baseId) {
      baseId = await chooseBase();
      if (!baseId) return;
    }
    const H = this.tree.headers;
    const rec = {
      baseId,
      white: H['White'] ?? '?', black: H['Black'] ?? '?',
      event: H['Event'] ?? '', date: H['Date'] ?? '',
      result: H['Result'] ?? '*',
      pgn: this.tree.toPgn(),
      updatedAt: Date.now(),
    };
    if (gameId) { rec.id = gameId; await db.updateGame(rec); }
    else { const id = await db.addGame(rec); this.ctx = { baseId, gameId: id }; }
    toast(t('saved'));
  },
};

function copyText(text) {
  navigator.clipboard?.writeText(text).then(() => toast(t('copied'))).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove(); toast(t('copied'));
  });
}

function gameFilename(H) {
  const w = (H['White'] ?? 'blancas').replace(/[^\w-]+/g, '_');
  const b = (H['Black'] ?? 'negras').replace(/[^\w-]+/g, '_');
  return `${w}_vs_${b}.pgn`;
}

// ═════════════════════ DATABASE ═════════════════════

const Base = {
  currentBaseId: null,
  gamesCache: [],

  init() {
    $('base-new').onclick = async () => {
      const name = await askText(t('base_name'));
      if (name) { await db.createBase(name); this.refresh(); }
    };
    $('base-back').onclick = () => this.showList();
    $('base-import').onclick = () => $('pgn-file').click();
    $('pgn-file').addEventListener('change', e => this.importFile(e.target.files[0]));
    $('base-newgame').onclick = () => {
      const tree = new GameTree();
      Analysis.loadTree(tree, { baseId: this.currentBaseId, gameId: null });
    };
    $('base-share').onclick = () => this.shareBase();
    $('base-rename').onclick = async () => {
      const base = await db.getBase(this.currentBaseId);
      const name = await askText(t('base_name'), base.name);
      if (name) { await db.renameBase(this.currentBaseId, name); this.openBase(this.currentBaseId); }
    };
    $('base-delete').onclick = async () => {
      if (await askConfirm(t('delete_base_confirm'))) {
        await db.deleteBase(this.currentBaseId);
        this.showList();
      }
    };
    $('game-search').addEventListener('input', () => this.renderGames());
  },

  async refresh() {
    if (this.currentBaseId) return;
    this.showList();
  },

  async showList() {
    this.currentBaseId = null;
    $('base-list-view').classList.remove('hidden');
    $('base-games-view').classList.add('hidden');
    const bases = await db.listBases();
    const el = $('base-list');
    el.innerHTML = '';
    for (const b of bases) {
      const item = document.createElement('button');
      item.className = 'list-item';
      item.innerHTML = `<b>📚 ${esc(b.name)}</b><span class="sub">${b.count} ${t('games')}</span>`;
      item.onclick = () => this.openBase(b.id);
      el.appendChild(item);
    }
  },

  async openBase(id) {
    this.currentBaseId = id;
    const base = await db.getBase(id);
    if (!base) { this.showList(); return; }
    $('base-list-view').classList.add('hidden');
    $('base-games-view').classList.remove('hidden');
    $('base-games-title').textContent = base.name;
    this.gamesCache = await db.listGames(id);
    this.gamesCache.sort((a, b) => b.updatedAt - a.updatedAt);
    $('game-search').value = '';
    this.renderGames();
  },

  renderGames() {
    const q = $('game-search').value.toLowerCase();
    const el = $('game-list');
    el.innerHTML = '';
    const games = this.gamesCache.filter(g =>
      !q || `${g.white} ${g.black} ${g.event}`.toLowerCase().includes(q));
    if (!games.length) {
      el.innerHTML = `<p class="hint">${t('no_games')}</p>`;
      return;
    }
    for (const g of games) {
      const item = document.createElement('button');
      item.className = 'list-item';
      const sub = [g.event, g.date].filter(x => x && x !== '?').join(' · ');
      item.innerHTML = `<b>${esc(g.white)} – ${esc(g.black)}  <span class="result">${esc(g.result ?? '*')}</span></b><span class="sub">${esc(sub)}</span>`;
      item.onclick = () => this.openGame(g);
      item.oncontextmenu = (e) => { e.preventDefault(); this.gameMenu(g); };
      // long-press for mobile
      let timer = null;
      item.addEventListener('pointerdown', () => { timer = setTimeout(() => { timer = null; this.gameMenu(g); }, 550); });
      item.addEventListener('pointerup', () => clearTimeout(timer));
      item.addEventListener('pointermove', () => clearTimeout(timer));
      el.appendChild(item);
    }
  },

  gameMenu(g) {
    sheet([
      { label: '📤 ' + t('share_game'), action: () => sharePgnText(gameFilename({ White: g.white, Black: g.black }), g.pgn) },
      { label: '🗑 ' + t('delete'), action: async () => {
          if (await askConfirm(t('delete_game_confirm'))) { await db.deleteGame(g.id); this.openBase(this.currentBaseId); }
        }, danger: true },
    ]);
  },

  openGame(g) {
    try {
      const tree = parsePgn(g.pgn);
      Analysis.loadTree(tree, { baseId: g.baseId, gameId: g.id });
    } catch (e) {
      toast(t('import_failed'));
    }
  },

  async importFile(file) {
    if (!file) return;
    $('pgn-file').value = '';
    if (/\.cbh$/i.test(file.name)) { await modal((box, close) => { box.innerHTML = `<p>${t('cbh_note')}</p>`; const b = document.createElement('button'); b.className = 'btn primary'; b.textContent = t('ok'); b.onclick = () => close(null); box.appendChild(b); }); return; }
    try {
      const text = await file.text();
      const chunks = splitPgn(text);
      const games = [];
      for (const ch of chunks) {
        const H = headersFromPgn(ch);
        if (!H['White'] && !/\d+\./.test(ch)) continue;
        games.push({
          baseId: this.currentBaseId,
          white: H['White'] ?? '?', black: H['Black'] ?? '?',
          event: H['Event'] ?? '', date: H['Date'] ?? '',
          result: H['Result'] ?? '*',
          pgn: ch.trim(),
          updatedAt: Date.now(),
        });
      }
      if (!games.length) { toast(t('import_failed')); return; }
      await db.addGames(games);
      toast(`${games.length} ${t('imported')}`);
      if (!(await db.kvGet('firstImportDone', false))) { await db.kvSet('firstImportDone', true); Badges.checkNew(); }
      this.openBase(this.currentBaseId);
    } catch (e) {
      toast(t('import_failed'));
    }
  },

  async shareBase() {
    const base = await db.getBase(this.currentBaseId);
    const games = await db.listGames(this.currentBaseId);
    const all = games.map(g => g.pgn.trim()).join('\n\n') + '\n';
    sharePgnText(`${base.name.replace(/[^\w-]+/g, '_')}.pgn`, all);
  },
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ═════════════════════ PLAY vs ENGINE ═════════════════════

const Play = {
  board: null,
  chess: null,
  playerColor: 'w',
  level: 2,
  startFen: START_FEN,
  over: false,
  thinking: false,

  init() {
    buildLevelSeg($('play-level'));
    segInit($('play-color'));
    segInit($('play-level'));
    this.board = new Board($('play-board'), { onMove: mv => this.userMove(mv) });
    $('play-start').onclick = () => {
      this.level = +segValue($('play-level'));
      let c = segValue($('play-color'));
      if (c === 'r') c = Math.random() < 0.5 ? 'w' : 'b';
      this.begin(c, START_FEN);
    };
    $('play-resign').onclick = async () => {
      if (this.over) return;
      if (await askConfirm(t('resign') + '?')) this.finish(t('you_resigned'));
    };
    $('play-new').onclick = () => { engine.stop(); $('play-game').classList.add('hidden'); $('play-setup').classList.remove('hidden'); };
    $('play-analyze').onclick = () => this.toAnalysis();
    $('play-undo').onclick = () => this.undo();
  },

  undo() {
    if (this.thinking) return;
    if (this.chess.turn() !== this.playerColor) return;
    if (this.chess.history().length < 2) return;
    this.chess.undo();
    this.chess.undo();
    this.over = false;
    this.board.interactive = true;
    this.board.setPosition(this.chess.fen());
    this.renderMoves();
    this.setStatus(t('your_turn'));
  },

  startFromFen(fen) {
    showScreen('play');
    const turn = fen.split(' ')[1];
    this.level = +(segValue($('play-level')) ?? 2);
    this.begin(turn, fen); // you play the side to move
  },

  begin(color, fen) {
    this.playerColor = color;
    this.startFen = fen;
    this.chess = new Chess(fen);
    this.over = false;
    this.thinking = false;
    $('play-setup').classList.add('hidden');
    $('play-game').classList.remove('hidden');
    this.board.setOrientation(color);
    this.board.setPosition(fen);
    this.renderMoves();
    this.setStatus(t('your_turn'));
    if (this.chess.turn() !== color) this.engineMove();
  },

  setStatus(msg) { $('play-status').textContent = msg; },

  async userMove(mv) {
    if (this.over || this.thinking) return;
    if (this.chess.turn() !== this.playerColor) return;
    let m;
    try { m = this.chess.move(mv); } catch { return; }
    this.board.setPosition(this.chess.fen(), { from: m.from, to: m.to });
    this.renderMoves();
    if (this.checkEnd()) return;
    this.engineMove();
  },

  async engineMove() {
    this.thinking = true;
    this.board.interactive = false;
    this.setStatus(t('thinking'));
    const lv = LEVELS[this.level];
    try {
      const uci = await engine.bestMove(this.chess.fen(), { movetime: lv.movetime, elo: lv.elo });
      if (!uci || this.over) return;
      const m = this.chess.move(uciToMove(uci));
      this.board.setPosition(this.chess.fen(), { from: m.from, to: m.to });
      this.renderMoves();
      if (this.checkEnd()) return;
      this.setStatus(t('your_turn'));
    } catch (e) {
      this.setStatus('⚠️ ' + (e.message || e));
    } finally {
      this.thinking = false;
      this.board.interactive = true;
    }
  },

  checkEnd() {
    if (this.chess.isCheckmate()) {
      const winner = this.chess.turn() === 'w' ? 'b' : 'w';
      this.finish(winner === this.playerColor ? t('checkmate_win') : t('checkmate_loss'));
      return true;
    }
    if (this.chess.isDraw() || this.chess.isStalemate()) { this.finish(t('draw')); return true; }
    return false;
  },

  finish(msg) {
    this.over = true;
    this.setStatus(msg);
    Streak.recordActivity();
  },

  renderMoves() {
    const el = $('play-moves');
    const hist = this.chess.history();
    el.textContent = numberedHistory(hist, this.startFen);
    el.scrollTop = el.scrollHeight;
  },

  toAnalysis() {
    const tree = treeFromHistory(this.startFen, this.chess.history());
    const names = t('level_names');
    const me = getLang() === 'es' ? 'Yo' : 'Me';
    const sf = `Stockfish (${names[this.level]})`;
    tree.setHeader('White', this.playerColor === 'w' ? me : sf);
    tree.setHeader('Black', this.playerColor === 'b' ? me : sf);
    tree.setHeader('Date', new Date().toISOString().slice(0, 10).replace(/-/g, '.'));
    if (this.over && this.chess.isCheckmate()) tree.setHeader('Result', this.chess.turn() === 'w' ? '0-1' : '1-0');
    else if (this.over && this.chess.isDraw()) tree.setHeader('Result', '1/2-1/2');
    engine.stop();
    Analysis.loadTree(tree);
  },
};

function numberedHistory(sanList, startFen) {
  const parts = startFen.split(' ');
  let num = parseInt(parts[5], 10);
  let white = parts[1] === 'w';
  let out = '';
  sanList.forEach((san, i) => {
    if (white) out += `${num}. ${san} `;
    else { out += (i === 0 ? `${num}... ` : '') + san + ' '; num++; }
    white = !white;
  });
  return out.trim();
}

function treeFromHistory(startFen, sanList) {
  const tree = new GameTree(startFen === START_FEN ? undefined : startFen);
  for (const san of sanList) tree.play(san);
  return tree;
}

// ═════════════════════ OPENING TRAINER ═════════════════════

const Trainer = {
  board: null,
  chess: null,
  playerColor: 'w',
  level: 2,
  book: null,        // Map fenKey -> {san: count}
  bookBaseId: null,
  inBook: true,
  over: false,
  thinking: false,

  init() {
    buildLevelSeg($('trainer-level'));
    segInit($('trainer-color'));
    segInit($('trainer-level'));
    this.board = new Board($('trainer-board'), { onMove: mv => this.userMove(mv) });
    $('trainer-base').addEventListener('change', () => this.previewBook());
    $('trainer-start').onclick = () => this.start();
    $('trainer-new').onclick = () => { engine.stop(); $('trainer-game').classList.add('hidden'); $('trainer-setup').classList.remove('hidden'); };
    $('trainer-analyze').onclick = () => this.toAnalysis();
    $('trainer-undo').onclick = () => this.undo();
  },

  undo() {
    if (this.thinking) return;
    if (this.chess.turn() !== this.playerColor) return;
    if (this.chess.history().length < 2) return;
    this.chess.undo();
    this.chess.undo();
    this.over = false;
    this.board.interactive = true;
    this.board.setPosition(this.chess.fen());
    this.renderMoves();
    this.setStatus(t('your_turn'));
  },

  async refreshBases() {
    const bases = (await db.listBases()).filter(b => b.count > 0);
    const sel = $('trainer-base');
    const prev = sel.value;
    sel.innerHTML = '';
    if (!bases.length) {
      const o = document.createElement('option');
      o.textContent = t('no_book_bases'); o.value = '';
      sel.appendChild(o);
      $('trainer-book-info').textContent = '';
      return;
    }
    for (const b of bases) {
      const o = document.createElement('option');
      o.value = b.id; o.textContent = `${b.name} (${b.count} ${t('games')})`;
      sel.appendChild(o);
    }
    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
    this.previewBook();
  },

  async buildBook(baseId) {
    if (this.book && this.bookBaseId === baseId) return this.book;
    const games = await db.listGames(baseId);
    const book = new Map();
    for (const g of games.slice(0, 500)) {
      let tree;
      try { tree = parsePgn(g.pgn); } catch { continue; }
      // walk ALL branches (variations are part of the study!)
      const walk = (node, depth) => {
        if (depth > 40) return;
        for (const child of node.children) {
          const key = fenKey(node.fen);
          let entry = book.get(key);
          if (!entry) { entry = {}; book.set(key, entry); }
          entry[child.san] = (entry[child.san] ?? 0) + 1;
          walk(child, depth + 1);
        }
      };
      walk(tree.root, 0);
    }
    this.book = book;
    this.bookBaseId = baseId;
    return book;
  },

  async previewBook() {
    const id = +$('trainer-base').value;
    if (!id) return;
    this.book = null;
    const book = await this.buildBook(id);
    $('trainer-book-info').textContent = `${book.size} ${t('book_moves')}`;
  },

  async start() {
    const id = +$('trainer-base').value;
    if (!id) { toast(t('no_book_bases')); return; }
    await this.buildBook(id);
    const baseRec = await db.getBase(id);
    this.baseName = baseRec?.name ?? '?';
    this.playerColor = segValue($('trainer-color'));
    this.level = +segValue($('trainer-level'));
    this.chess = new Chess();
    this.over = false;
    this.inBook = true;
    $('trainer-setup').classList.add('hidden');
    $('trainer-game').classList.remove('hidden');
    this.board.setOrientation(this.playerColor);
    this.board.setPosition(this.chess.fen());
    this.renderMoves();
    this.updateBadge(true);
    this.setStatus(t('your_turn'));
    if (this.chess.turn() !== this.playerColor) this.computerMove();
  },

  setStatus(msg) { $('trainer-status').textContent = msg; },

  updateBadge(usedBook) {
    const el = $('trainer-book-status');
    el.textContent = usedBook ? t('in_book') : t('out_of_book');
    el.className = 'book-badge ' + (usedBook ? 'in' : 'out');
  },

  async userMove(mv) {
    if (this.over || this.thinking) return;
    if (this.chess.turn() !== this.playerColor) return;
    let m;
    try { m = this.chess.move(mv); } catch { return; }
    this.board.setPosition(this.chess.fen(), { from: m.from, to: m.to });
    this.renderMoves();
    if (this.checkEnd()) return;
    this.computerMove();
  },

  pickBookMove() {
    const entry = this.book.get(fenKey(this.chess.fen()));
    if (!entry) return null;
    const moves = Object.entries(entry);
    if (!moves.length) return null;
    const total = moves.reduce((s, [, c]) => s + c, 0);
    let r = Math.random() * total;
    for (const [san, c] of moves) { r -= c; if (r <= 0) return san; }
    return moves[0][0];
  },

  async computerMove() {
    this.thinking = true;
    this.board.interactive = false;
    const bookSan = this.pickBookMove();
    try {
      if (bookSan) {
        await sleep(450);
        let m;
        try { m = this.chess.move(bookSan); } catch { m = null; }
        if (m) {
          this.inBook = true;
          this.updateBadge(true);
          this.board.setPosition(this.chess.fen(), { from: m.from, to: m.to }, 'green');
          this.renderMoves();
          if (this.checkEnd()) return;
          this.setStatus(t('your_turn'));
          return;
        }
      }
      // out of book → engine
      const justLeftBook = this.inBook;
      this.inBook = false;
      this.updateBadge(false);
      this.setStatus(t('thinking'));
      const lv = LEVELS[this.level];
      const uci = await engine.bestMove(this.chess.fen(), { movetime: lv.movetime, elo: lv.elo });
      if (!uci || this.over) return;
      const m = this.chess.move(uciToMove(uci));
      this.board.setPosition(this.chess.fen(), { from: m.from, to: m.to }, justLeftBook ? 'yellow' : 'green');
      this.renderMoves();
      if (this.checkEnd()) return;
      this.setStatus(t('your_turn'));
    } catch (e) {
      this.setStatus('⚠️ ' + (e.message || e));
    } finally {
      this.thinking = false;
      this.board.interactive = true;
    }
  },

  checkEnd() {
    if (this.chess.isCheckmate()) {
      const winner = this.chess.turn() === 'w' ? 'b' : 'w';
      const won = winner === this.playerColor;
      this.finishMsg(won ? t('checkmate_win') : t('checkmate_loss'), won ? 'win' : 'loss');
      return true;
    }
    if (this.chess.isDraw() || this.chess.isStalemate()) { this.finishMsg(t('draw'), 'draw'); return true; }
    return false;
  },

  finishMsg(msg, result) {
    this.over = true;
    this.setStatus(msg);
    Streak.recordActivity();
    if (result) this.recordOpeningResult(result);
  },

  async recordOpeningResult(result) {
    const elo = await db.kvGet('openingElo', {});
    const cur = elo[this.baseName] ?? 1200;
    const expected = 1 / (1 + Math.pow(10, (NOMINAL_PRACTICE_RATING - cur) / 400));
    const score = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
    elo[this.baseName] = Math.max(600, cur + 20 * (score - expected));
    await db.kvSet('openingElo', elo);
    const names = Object.keys(elo);
    const avg = names.reduce((s, k) => s + elo[k], 0) / names.length;
    await recordEloHistory('openingEloHistory', avg);
    Badges.checkNew();
  },

  renderMoves() {
    $('trainer-moves').textContent = numberedHistory(this.chess.history(), START_FEN);
    $('trainer-moves').scrollTop = $('trainer-moves').scrollHeight;
  },

  toAnalysis() {
    const tree = treeFromHistory(START_FEN, this.chess.history());
    tree.setHeader('Event', getLang() === 'es' ? 'Entrenamiento de apertura' : 'Opening training');
    engine.stop();
    Analysis.loadTree(tree);
  },
};

function fenKey(fen) { return fen.split(' ').slice(0, 4).join(' '); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ═════════════════════ PUZZLES ═════════════════════

const Puzzles = {
  board: null,
  current: null,       // puzzle object
  chess: null,
  moveIdx: 0,          // index into puzzle.moves
  solved: {},          // id -> true
  failedThis: false,
  eloRecorded: false,
  loaded: false,
  elo: 1200,
  themeElo: {},
  attemptCount: 0,            // rated attempts so far — first 10 calibrate faster
  themeFilter: 'random',      // 'random' | Set<themeId>

  async init() {
    this.board = new Board($('puzzle-board'), { onMove: mv => this.userMove(mv) });
    $('puzzle-theme-btn').onclick = () => this.openThemePicker();
    $('puzzle-next').onclick = () => this.nextPuzzle();
    $('puzzle-hint').onclick = () => this.hint();
    $('puzzle-solution').onclick = () => this.showSolution();
    $('puzzle-share').onclick = () => this.share();
  },

  openThemePicker() {
    modal((box, close) => {
      box.innerHTML = `<h3>${t('select_theme')}</h3>`;
      let mode = this.themeFilter === 'random' ? 'random' : 'themes';
      let selected = this.themeFilter === 'random' ? new Set() : new Set(this.themeFilter);

      const randomRow = document.createElement('label');
      randomRow.className = 'theme-pick-row';
      randomRow.innerHTML = `<input type="checkbox" id="tp-random"><span>${t('theme_random')}</span>`;
      box.appendChild(randomRow);

      const themeRows = [];
      for (const th of PUZZLE_THEMES) {
        const row = document.createElement('label');
        row.className = 'theme-pick-row';
        row.innerHTML = `<input type="checkbox" data-th="${th}"><span>${t('theme_' + th)}</span>`;
        box.appendChild(row);
        themeRows.push(row);
      }

      const randomCb = randomRow.querySelector('input');
      function syncUI() {
        randomCb.checked = mode === 'random';
        for (const row of themeRows) {
          const cb = row.querySelector('input');
          cb.checked = mode === 'themes' && selected.has(cb.dataset.th);
        }
      }
      syncUI();

      randomCb.onchange = () => { mode = 'random'; selected.clear(); syncUI(); };
      for (const row of themeRows) {
        const cb = row.querySelector('input');
        cb.onchange = () => {
          mode = 'themes';
          if (cb.checked) selected.add(cb.dataset.th);
          else selected.delete(cb.dataset.th);
          if (selected.size === 0) { cb.checked = true; selected.add(cb.dataset.th); }
          syncUI();
        };
      }

      const applyBtn = document.createElement('button');
      applyBtn.className = 'btn primary big'; applyBtn.textContent = t('apply');
      applyBtn.onclick = () => {
        this.themeFilter = mode === 'random' ? 'random' : selected;
        close(null);
        this.nextPuzzle();
      };
      box.appendChild(applyBtn);
    });
  },

  async ensureLoaded() {
    if (this.loaded) { return; }
    this.solved = await db.kvGet('puzzlesSolved', {});
    this.elo = await db.kvGet('puzzleElo', 1200);
    this.themeElo = await db.kvGet('puzzleThemeElo', {});
    this.attemptCount = await db.kvGet('puzzleAttemptCount', 0);
    this.loaded = true;
    this.updateEloBadge();
    this.nextPuzzle();
  },

  pool() {
    if (this.themeFilter === 'random') return PUZZLES;
    return PUZZLES.filter(p => p.themes.some(th => this.themeFilter.has(th)));
  },

  updateProgress() {
    const pool = this.pool();
    const done = pool.filter(p => this.solved[p.id]).length;
    $('puzzle-progress').textContent = `${done}/${pool.length} ${t('solved_count')}`;
  },

  updateEloBadge() {
    $('puzzle-elo').textContent = `${t('puzzle_elo')}: ${Math.round(this.elo)}`;
  },

  recordResult(win) {
    if (this.eloRecorded || !this.current) return;
    this.eloRecorded = true;
    // First 10 rated attempts calibrate fast (a strong player starting at
    // 1200 shouldn't have to grind slowly through puzzles far below their
    // level) — up to ~±190 swing, then settle into the normal K.
    const K = this.attemptCount < 10 ? 192 : 24;
    this.attemptCount++;
    db.kvSet('puzzleAttemptCount', this.attemptCount);
    const expected = 1 / (1 + Math.pow(10, (this.current.rating - this.elo) / 400));
    const score = win ? 1 : 0;
    this.elo = Math.max(600, this.elo + K * (score - expected));
    db.kvSet('puzzleElo', this.elo);
    for (const th of this.current.themes) {
      const cur = this.themeElo[th] ?? 1200;
      const exp2 = 1 / (1 + Math.pow(10, (this.current.rating - cur) / 400));
      this.themeElo[th] = Math.max(600, cur + K * (score - exp2));
    }
    db.kvSet('puzzleThemeElo', this.themeElo);
    this.updateEloBadge();
    recordEloHistory('puzzleEloHistory', this.elo);
    Streak.recordActivity();
    Badges.checkNew();
  },

  share() {
    if (!this.current) return;
    const themeLabel = this.current.themes?.[0] ? t('theme_' + this.current.themes[0]) : '';
    shareStatCard({
      emoji: '🧩',
      title: t('card_puzzle_title'),
      subtitle: `${t('puzzle_elo')}: ${Math.round(this.elo)} · ${this.current.rating} ${themeLabel}`.trim(),
    }, 'puzzle-resuelto.png');
  },

  nextPuzzle() {
    $('puzzle-share').classList.add('hidden');
    const pool = this.pool();
    if (!pool.length) return;
    const fresh = pool.filter(p => !this.solved[p.id]);
    const list = fresh.length ? fresh : pool;
    let windowSize = 100, candidates = [];
    while (candidates.length === 0 && windowSize <= 1200) {
      candidates = list.filter(p => Math.abs(p.rating - this.elo) <= windowSize);
      windowSize += 100;
    }
    if (!candidates.length) candidates = list;
    this.current = candidates[Math.floor(Math.random() * candidates.length)];
    this.chess = new Chess(this.current.fen);
    this.moveIdx = 0;
    this.failedThis = false;
    this.eloRecorded = false;
    this.updateProgress();
    // the first move in the list is the opponent's move — play it
    const playerColor = this.chess.turn() === 'w' ? 'b' : 'w';
    this.board.setOrientation(playerColor);
    this.board.setPosition(this.chess.fen());
    this.board.interactive = false;
    setTimeout(() => {
      const m = this.applyUci(this.current.moves[0]);
      this.moveIdx = 1;
      this.board.setPosition(this.chess.fen(), m ? { from: m.from, to: m.to } : null);
      this.board.interactive = true;
      this.setStatus(`${t(playerColor === 'w' ? 'white' : 'black')} ${t('to_move_find')} (${this.current.rating})`);
    }, 600);
  },

  applyUci(u) {
    try { return this.chess.move(uciToMove(u)); } catch { return null; }
  },

  setStatus(msg) { $('puzzle-status').textContent = msg; },

  async userMove(mv) {
    if (!this.current || this.moveIdx >= this.current.moves.length) return;
    const expected = this.current.moves[this.moveIdx];
    const tryUci = mv.from + mv.to + (mv.promotion ?? '');
    // test the move
    let m;
    try { m = this.chess.move(mv); } catch { return; }
    const isMate = this.chess.isCheckmate();
    if (tryUci === expected || (isMate && this.moveIdx === this.current.moves.length - 1)) {
      this.moveIdx++;
      this.board.setPosition(this.chess.fen(), { from: m.from, to: m.to });
      if (this.moveIdx >= this.current.moves.length || isMate) {
        this.setStatus(t('solved'));
        if (!this.failedThis) {
          this.solved[this.current.id] = true;
          db.kvSet('puzzlesSolved', this.solved);
        }
        this.recordResult(!this.failedThis);
        this.updateProgress();
        $('puzzle-share').classList.remove('hidden');
        return;
      }
      this.setStatus(t('correct'));
      // opponent reply
      this.board.interactive = false;
      await sleep(400);
      const r = this.applyUci(this.current.moves[this.moveIdx]);
      this.moveIdx++;
      this.board.setPosition(this.chess.fen(), r ? { from: r.from, to: r.to } : null);
      this.board.interactive = true;
    } else {
      // wrong — undo, shake
      this.chess.undo();
      this.failedThis = true;
      this.board.setPosition(this.chess.fen());
      this.setStatus(t('wrong_try'));
      $('puzzle-board').classList.add('shake');
      setTimeout(() => $('puzzle-board').classList.remove('shake'), 500);
    }
  },

  hint() {
    if (!this.current || this.moveIdx >= this.current.moves.length) return;
    this.failedThis = true;
    const u = this.current.moves[this.moveIdx];
    const sq = this.board.squares[u.slice(0, 2)];
    if (sq) { sq.classList.add('hintsq'); setTimeout(() => sq.classList.remove('hintsq'), 1500); }
  },

  async showSolution() {
    if (!this.current) return;
    this.failedThis = true;
    this.recordResult(false);
    this.board.interactive = false;
    while (this.moveIdx < this.current.moves.length) {
      const m = this.applyUci(this.current.moves[this.moveIdx]);
      this.moveIdx++;
      this.board.setPosition(this.chess.fen(), m ? { from: m.from, to: m.to } : null);
      await sleep(700);
    }
    this.setStatus(t('solved'));
    this.board.interactive = true;
  },
};

// ═════════════════════ PUZZLE RUSH ═════════════════════

const Rush = {
  board: null,
  chess: null,
  usedIds: null,   // Set of puzzle ids already served this run
  current: null,
  moveIdx: 0,
  score: 0,
  duration: 180,
  timeLeft: 0,
  timer: null,
  running: false,

  init() {
    this.board = new Board($('rush-board'), { onMove: mv => this.userMove(mv) });
    $('rush-back').onclick = () => { this.stop(); showScreen('puzzles'); };
    $('puzzle-rush-open').onclick = () => this.openIntro();
    segInit($('rush-duration'), () => {});
    $('rush-start').onclick = () => this.start();
    $('rush-again').onclick = () => this.openIntro();
    $('rush-share').onclick = () => this.share();
  },

  async openIntro() {
    showScreen('rush');
    $('rush-intro').classList.remove('hidden');
    $('rush-game').classList.add('hidden');
    $('rush-result').classList.add('hidden');
    const best = await db.kvGet('rushBestScore', 0);
    $('rush-best-score').textContent = best;
  },

  // Target rating ramps up directly with the current run's score (a rush
  // "streak" is just its score, since one mistake ends the run), rather than
  // walking a fixed sorted list — so difficulty visibly tracks performance.
  pickNext() {
    const target = Math.min(2400, 900 + this.score * 55);
    let candidates = PUZZLES.filter(p => !this.usedIds.has(p.id));
    if (!candidates.length) { this.usedIds.clear(); candidates = PUZZLES; }
    candidates = [...candidates].sort((a, b) => Math.abs(a.rating - target) - Math.abs(b.rating - target));
    const top = candidates.slice(0, 5);
    const pick = top[Math.floor(Math.random() * top.length)];
    this.usedIds.add(pick.id);
    return pick;
  },

  start() {
    this.usedIds = new Set();
    this.duration = +segValue($('rush-duration'));
    this.timeLeft = this.duration;
    this.score = 0;
    this.running = true;
    $('rush-intro').classList.add('hidden');
    $('rush-result').classList.add('hidden');
    $('rush-game').classList.remove('hidden');
    this.updateHud();
    this.timer = setInterval(() => this.tick(), 1000);
    this.loadNext();
  },

  tick() {
    this.timeLeft--;
    this.updateHud();
    if (this.timeLeft <= 0) this.finish(t('rush_time_up'));
  },

  updateHud() {
    const m = Math.floor(Math.max(0, this.timeLeft) / 60), s = Math.max(0, this.timeLeft) % 60;
    $('rush-timer').textContent = `⏱ ${m}:${String(s).padStart(2, '0')}`;
    $('rush-score').textContent = `⚡ ${this.score}`;
  },

  loadNext() {
    this.current = this.pickNext();
    this.chess = new Chess(this.current.fen);
    this.moveIdx = 0;
    const playerColor = this.chess.turn() === 'w' ? 'b' : 'w';
    this.board.setOrientation(playerColor);
    this.board.setPosition(this.chess.fen());
    this.board.interactive = false;
    $('rush-status').textContent = t(playerColor === 'w' ? 'white' : 'black') + ' ' + t('to_move_find');
    setTimeout(() => {
      if (!this.running) return;
      const m = this.applyUci(this.current.moves[0]);
      this.moveIdx = 1;
      this.board.setPosition(this.chess.fen(), m ? { from: m.from, to: m.to } : null);
      this.board.interactive = true;
    }, 300);
  },

  applyUci(u) { try { return this.chess.move(uciToMove(u)); } catch { return null; } },

  userMove(mv) {
    if (!this.running || !this.current) return;
    const expected = this.current.moves[this.moveIdx];
    const tryUci = mv.from + mv.to + (mv.promotion ?? '');
    let m;
    try { m = this.chess.move(mv); } catch { return; }
    const isMate = this.chess.isCheckmate();
    if (tryUci === expected || (isMate && this.moveIdx === this.current.moves.length - 1)) {
      this.moveIdx++;
      this.board.setPosition(this.chess.fen(), { from: m.from, to: m.to });
      if (this.moveIdx >= this.current.moves.length || isMate) {
        this.score++;
        this.updateHud();
        setTimeout(() => { if (this.running) this.loadNext(); }, 350);
        return;
      }
      this.board.interactive = false;
      setTimeout(() => {
        if (!this.running) return;
        const r = this.applyUci(this.current.moves[this.moveIdx]);
        this.moveIdx++;
        this.board.setPosition(this.chess.fen(), r ? { from: r.from, to: r.to } : null);
        this.board.interactive = true;
      }, 300);
    } else {
      this.chess.undo();
      this.board.setPosition(this.chess.fen());
      this.finish(t('rush_wrong_end'));
    }
  },

  async finish(reason) {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.timer);
    this.board.interactive = false;
    const best = await db.kvGet('rushBestScore', 0);
    const isNewBest = this.score > best;
    if (isNewBest) await db.kvSet('rushBestScore', this.score);
    Badges.checkNew();
    Streak.recordActivity();
    $('rush-game').classList.add('hidden');
    $('rush-result').classList.remove('hidden');
    $('rush-result-title').textContent = reason;
    $('rush-result-score').textContent = this.score;
    $('rush-result-best').textContent = isNewBest ? t('rush_new_best') : `${t('rush_best')}: ${Math.max(best, this.score)}`;
  },

  stop() {
    this.running = false;
    clearInterval(this.timer);
  },

  share() {
    shareStatCard({
      emoji: '⚡',
      title: t('card_rush_title'),
      subtitle: `${this.score} ${t('rush_score_label')}`,
    }, 'puzzle-rush.png');
  },
};

// ═════════════════════ ENDGAME STUDY ═════════════════════

const NOMINAL_PRACTICE_RATING = 1500; // difficulty baseline for graded endgame/opening practice

const Endgame = {
  board: null,
  category: null,
  current: null,        // endgame position object
  mode: 'study',         // 'study' | 'practice'
  chess: null,
  playerColor: 'w',
  over: false,
  thinking: false,
  engineOn: false,
  elo: {},               // per-category rating

  init() {
    this.board = new Board($('endgame-board'), { onMove: mv => this.userMove(mv) });
    $('endgame-back-cat').onclick = () => this.showCategories();
    $('endgame-back-pos').onclick = () => this.openCategory(this.category);
    $('endgame-flip').onclick = () => this.board.flip();
    $('endgame-engine-toggle').onclick = () => this.toggleEngine();
    $('endgame-practice-start').onclick = () => this.startPractice();
    $('endgame-undo').onclick = () => this.undo();
    $('endgame-resign').onclick = async () => {
      if (this.over) return;
      if (await askConfirm(t('resign') + '?')) this.finishPractice(false);
    };
    $('endgame-share').onclick = () => shareStatCard({
      emoji: '🏁',
      title: t('card_endgame_title'),
      subtitle: t('cat_' + this.current.category),
    }, 'final-convertido.png');
    this.showCategories();
  },

  async ensureLoaded() {
    this.elo = await db.kvGet('endgameElo', {});
  },

  showCategories() {
    $('endgame-list-view').classList.remove('hidden');
    $('endgame-positions-view').classList.add('hidden');
    $('endgame-viewer-view').classList.add('hidden');
    const el = $('endgame-cat-list');
    el.innerHTML = '';
    for (const cat of ENDGAME_CATEGORIES) {
      const count = ENDGAMES.filter(e => e.category === cat).length;
      const rating = this.elo[cat] ? Math.round(this.elo[cat]) : '—';
      const item = document.createElement('button');
      item.className = 'list-item';
      item.innerHTML = `<b>${t('cat_' + cat)}</b><span class="sub">${count} ${t('games')} · ${t('endgame_elo')}: ${rating}</span>`;
      item.onclick = () => this.openCategory(cat);
      el.appendChild(item);
    }
  },

  openCategory(cat) {
    this.category = cat;
    $('endgame-list-view').classList.add('hidden');
    $('endgame-positions-view').classList.remove('hidden');
    $('endgame-viewer-view').classList.add('hidden');
    $('endgame-cat-title').textContent = t('cat_' + cat);
    const el = $('endgame-pos-list');
    el.innerHTML = '';
    for (const pos of ENDGAMES.filter(e => e.category === cat)) {
      const item = document.createElement('button');
      item.className = 'list-item';
      const badge = pos.practice ? `<span class="badge-practice">🎯</span>` : '';
      item.innerHTML = `<b>${esc(pos.name[getLang()])}${badge}</b>`;
      item.onclick = () => this.openPosition(pos);
      el.appendChild(item);
    }
  },

  openPosition(pos) {
    this.current = pos;
    this.mode = 'study';
    this.engineOn = false;
    engine.stop();
    $('endgame-positions-view').classList.add('hidden');
    $('endgame-viewer-view').classList.remove('hidden');
    $('endgame-pos-title').textContent = pos.name[getLang()];
    $('endgame-comment').textContent = pos.comment[getLang()];
    $('endgame-comment').classList.remove('hidden');
    $('endgame-status').classList.add('hidden');
    $('endgame-engine').classList.add('hidden');
    $('endgame-engine-toggle').classList.remove('on');
    $('endgame-practice-actions').style.display = 'none';
    $('endgame-practice-start').classList.toggle('hidden', !pos.practice);
    this.board.interactive = false;
    this.board.setOrientation(pos.fen.split(' ')[1]);
    this.board.setPosition(pos.fen);
  },

  toggleEngine() {
    this.engineOn = !this.engineOn;
    $('endgame-engine').classList.toggle('hidden', !this.engineOn);
    $('endgame-engine-toggle').classList.toggle('on', this.engineOn);
    if (this.engineOn) {
      $('endgame-engine-lines').innerHTML = `<div class="engine-line">${t('loading')}</div>`;
      engine.onLine = lines => this.showLines(lines);
      engine.analyse(this.board.fen, 2).catch(() => {});
    } else {
      engine.stop();
    }
  },

  showLines(lines) {
    if (!this.engineOn) return;
    const el = $('endgame-engine-lines');
    el.innerHTML = '';
    for (const ln of lines) {
      const div = document.createElement('div');
      div.className = 'engine-line';
      div.innerHTML = `<b class="${ln.scoreNum >= 0 ? 'good' : 'bad'}">${ln.scoreText}</b> <span class="depth">d${ln.depth}</span> ${pvWithNumbers(this.board.fen, ln.pvSan)}`;
      el.appendChild(div);
    }
  },

  startPractice() {
    engine.stop();
    this.engineOn = false;
    $('endgame-engine').classList.add('hidden');
    $('endgame-engine-toggle').classList.remove('on');
    this.mode = 'practice';
    this.chess = new Chess(this.current.fen);
    this.playerColor = this.current.fen.split(' ')[1];
    this.over = false;
    this.thinking = false;
    $('endgame-comment').classList.add('hidden');
    $('endgame-status').classList.remove('hidden');
    $('endgame-practice-actions').style.display = 'flex';
    $('endgame-share').classList.add('hidden');
    $('endgame-practice-start').classList.add('hidden');
    this.board.interactive = true;
    this.board.setOrientation(this.playerColor);
    this.board.setPosition(this.chess.fen());
    this.setStatus(`${t('practice_you_are')} ${t(this.playerColor === 'w' ? 'white' : 'black')}`);
  },

  setStatus(msg) { $('endgame-status').textContent = msg; },

  async userMove(mv) {
    if (this.mode !== 'practice' || this.over || this.thinking) return;
    if (this.chess.turn() !== this.playerColor) return;
    let m;
    try { m = this.chess.move(mv); } catch { return; }
    this.board.setPosition(this.chess.fen(), { from: m.from, to: m.to });
    if (this.checkEnd()) return;
    this.engineReply();
  },

  async engineReply() {
    this.thinking = true;
    this.board.interactive = false;
    this.setStatus(t('thinking'));
    try {
      const uci = await engine.bestMove(this.chess.fen(), { movetime: 700 });
      if (!uci || this.over) return;
      const m = this.chess.move(uciToMove(uci));
      this.board.setPosition(this.chess.fen(), { from: m.from, to: m.to });
      if (this.checkEnd()) return;
      this.setStatus(`${t('practice_you_are')} ${t(this.playerColor === 'w' ? 'white' : 'black')}`);
    } finally {
      this.thinking = false;
      this.board.interactive = true;
    }
  },

  checkEnd() {
    if (this.chess.isCheckmate()) {
      const winner = this.chess.turn() === 'w' ? 'b' : 'w';
      this.finishPractice(winner === this.playerColor ? 'win' : 'loss');
      return true;
    }
    if (this.chess.isDraw() || this.chess.isStalemate()) { this.finishPractice('draw'); return true; }
    return false;
  },

  undo() {
    if (this.thinking) return;
    if (this.chess.turn() !== this.playerColor) return;
    if (this.chess.history().length < 2) return;
    this.chess.undo();
    this.chess.undo();
    this.over = false;
    this.board.interactive = true;
    this.board.setPosition(this.chess.fen());
    this.setStatus(`${t('practice_you_are')} ${t(this.playerColor === 'w' ? 'white' : 'black')}`);
  },

  finishPractice(actual) {
    // actual: 'win' | 'draw' | 'loss' | false(resigned => loss)
    if (actual === false) actual = 'loss';
    this.over = true;
    const expected = this.current.expected;
    const success = expected === 'win' ? actual === 'win' : actual !== 'loss';
    this.setStatus(success ? (expected === 'win' ? t('practice_win') : t('practice_draw')) : t('practice_fail'));
    $('endgame-share').classList.toggle('hidden', !success);
    const cat = this.current.category;
    const cur = this.elo[cat] ?? 1200;
    const expScore = 1 / (1 + Math.pow(10, (NOMINAL_PRACTICE_RATING - cur) / 400));
    const score = success ? 1 : 0;
    this.elo[cat] = Math.max(600, cur + 24 * (score - expScore));
    db.kvSet('endgameElo', this.elo);
    const cats = Object.keys(this.elo);
    const avg = cats.reduce((s, c) => s + this.elo[c], 0) / cats.length;
    recordEloHistory('endgameEloHistory', avg);
    Streak.recordActivity();
    if (success) this.recordConversion(cat);
    Badges.checkNew();
  },

  async recordConversion(cat) {
    const conv = await db.kvGet('endgameConverted', {});
    if (!conv[cat]) { conv[cat] = true; await db.kvSet('endgameConverted', conv); }
  },
};

// ═════════════════════ POSITION SETUP ═════════════════════

const Setup = {
  board: null,
  grid: {},            // sq -> {color,type}
  palettePiece: null,  // {color,type} | 'trash' | null

  init() {
    this.board = new Board($('setup-board'), {
      onEditorTap: sq => this.tap(sq),
    });
    this.board.editorMode = true;
    this.buildPalette();
    segInit($('setup-turn'));
    $('setup-start').onclick = () => this.load(START_FEN);
    $('setup-clear').onclick = () => { this.grid = {}; this.sync(); };
    $('setup-cancel').onclick = () => showScreen('analysis');
    $('setup-analyze').onclick = () => this.done('analyze');
    $('setup-play').onclick = () => this.done('play');
  },

  buildPalette() {
    const pal = $('setup-palette');
    pal.innerHTML = '';
    for (const color of ['w', 'b']) {
      for (const type of ['k', 'q', 'r', 'b', 'n', 'p']) {
        const b = document.createElement('button');
        b.className = 'pal-btn';
        b.dataset.piece = color + type;
        b.innerHTML = `<img src="${getPieceSet()}/${color}${type.toUpperCase()}.svg" alt="">`;
        b.onclick = () => this.pick(b, { color, type });
        pal.appendChild(b);
      }
    }
    const trash = document.createElement('button');
    trash.className = 'pal-btn'; trash.textContent = '🗑';
    trash.dataset.piece = 'trash';
    trash.onclick = () => this.pick(trash, 'trash');
    pal.appendChild(trash);
  },

  pick(btn, piece) {
    const was = btn.classList.contains('on');
    document.querySelectorAll('.pal-btn').forEach(b => b.classList.remove('on'));
    if (was) { this.palettePiece = null; return; }
    btn.classList.add('on');
    this.palettePiece = piece;
  },

  open(fen = START_FEN) {
    this.load(fen);
    showScreen('setup');
  },

  load(fen) {
    this.grid = parsePlacement(fen.split(' ')[0]);
    const parts = fen.split(' ');
    const turn = parts[1] ?? 'w';
    $('setup-turn').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === turn));
    const cast = parts[2] ?? 'KQkq';
    for (const c of ['K', 'Q', 'k', 'q']) $('cast-' + c).checked = cast.includes(c);
    this.sync();
  },

  tap(sq) {
    if (this.palettePiece === 'trash' || (this.palettePiece === null && this.grid[sq])) {
      delete this.grid[sq];
    } else if (this.palettePiece && this.palettePiece !== 'trash') {
      const p = this.palettePiece;
      const same = this.grid[sq] && this.grid[sq].color === p.color && this.grid[sq].type === p.type;
      if (same) delete this.grid[sq];
      else {
        if (p.type === 'k') { // only one king per side
          for (const [s, gp] of Object.entries(this.grid)) if (gp.type === 'k' && gp.color === p.color) delete this.grid[s];
        }
        this.grid[sq] = { color: p.color, type: p.type };
      }
    }
    this.sync();
  },

  sync() {
    this.board.setPosition(this.buildFen());
  },

  buildFen() {
    const FILES = 'abcdefgh';
    let rows = [];
    for (let r = 8; r >= 1; r--) {
      let row = '', empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = this.grid[FILES[f] + r];
        if (!p) { empty++; continue; }
        if (empty) { row += empty; empty = 0; }
        row += p.color === 'w' ? p.type.toUpperCase() : p.type;
      }
      if (empty) row += empty;
      rows.push(row);
    }
    const turn = segValue($('setup-turn')) ?? 'w';
    let cast = '';
    for (const c of ['K', 'Q', 'k', 'q']) if ($('cast-' + c).checked) cast += c;
    return `${rows.join('/')} ${turn} ${cast || '-'} - 0 1`;
  },

  done(mode) {
    const fen = this.buildFen();
    const v = validateFen(fen);
    if (!v.ok) { toast(t('invalid_position') + (v.error ?? '')); return; }
    // also require both kings
    const pieces = Object.values(this.grid);
    if (!pieces.some(p => p.type === 'k' && p.color === 'w') || !pieces.some(p => p.type === 'k' && p.color === 'b')) {
      toast(t('invalid_position') + '♔+♚');
      return;
    }
    if (mode === 'analyze') Analysis.loadTree(new GameTree(fen));
    else Play.startFromFen(fen);
  },
};

// ═════════════════════ SETTINGS ═════════════════════

function openSettings() {
  modal(async (box, close) => {
    box.innerHTML = `<h3>${t('settings')}</h3>`;
    // appearance
    const l0 = document.createElement('label'); l0.className = 'fld-label'; l0.textContent = t('appearance');
    const seg0 = document.createElement('div'); seg0.className = 'seg';
    for (const [v, key] of [['light', 'mode_light'], ['dark', 'mode_dark'], ['system', 'mode_system']]) {
      const b = document.createElement('button');
      b.textContent = t(key); b.dataset.v = v;
      if (ColorMode.mode === v) b.classList.add('on');
      seg0.appendChild(b);
    }
    segInit(seg0, v => ColorMode.set(v));
    box.append(l0, seg0);
    // language
    const l1 = document.createElement('label'); l1.className = 'fld-label'; l1.textContent = t('language');
    const seg = document.createElement('div'); seg.className = 'seg';
    for (const [v, name] of [['es', 'Español'], ['en', 'English']]) {
      const b = document.createElement('button');
      b.textContent = name; b.dataset.v = v;
      if (getLang() === v) b.classList.add('on');
      seg.appendChild(b);
    }
    segInit(seg, v => { setLang(v); relabel(); });
    // engine lines
    const l2 = document.createElement('label'); l2.className = 'fld-label'; l2.textContent = t('engine_lines');
    const seg2 = document.createElement('div'); seg2.className = 'seg';
    const cur = +(await db.kvGet('engineLines', 2));
    for (const n of [1, 2, 3]) {
      const b = document.createElement('button');
      b.textContent = n; b.dataset.v = n;
      if (cur === n) b.classList.add('on');
      seg2.appendChild(b);
    }
    segInit(seg2, v => db.kvSet('engineLines', +v));
    // board color theme
    const l3 = document.createElement('label'); l3.className = 'fld-label'; l3.textContent = t('board_theme');
    const seg3 = document.createElement('div'); seg3.className = 'seg';
    const curBoardTheme = await db.kvGet('boardTheme', 'wood');
    for (const [v, key] of [['wood', 'theme_wood'], ['green', 'theme_green'], ['blue', 'theme_blue']]) {
      const b = document.createElement('button');
      b.textContent = t(key); b.dataset.v = v;
      if (curBoardTheme === v) b.classList.add('on');
      seg3.appendChild(b);
    }
    segInit(seg3, v => Themes.setBoardTheme(v));
    // piece style
    const l4 = document.createElement('label'); l4.className = 'fld-label'; l4.textContent = t('piece_style');
    const seg4 = document.createElement('div'); seg4.className = 'seg';
    const curPieceSet = await db.kvGet('pieceSet', 'pieces');
    for (const [v, key] of [['pieces', 'piece_classic'], ['pieces2', 'piece_alt']]) {
      const b = document.createElement('button');
      b.textContent = t(key); b.dataset.v = v;
      if (curPieceSet === v) b.classList.add('on');
      seg4.appendChild(b);
    }
    segInit(seg4, v => Themes.setPieceSetChoice(v));
    const about = document.createElement('p'); about.className = 'hint'; about.textContent = t('about');
    const ok = document.createElement('button'); ok.className = 'btn primary'; ok.textContent = t('close');
    ok.onclick = () => close(null);
    box.append(l1, seg, l2, seg2, l3, seg3, l4, seg4, about, ok);
  });
}

function relabel() {
  applyStatic();
  buildLevelSeg($('play-level'), +(segValue($('play-level')) ?? 2));
  buildLevelSeg($('trainer-level'), +(segValue($('trainer-level')) ?? 2));
  Puzzles.updateProgress?.();
  if (activeScreen === 'profile') Profile.refresh();
  if (activeScreen === 'endgame') Endgame.showCategories();
}

const Themes = {
  async init() {
    const boardTheme = await db.kvGet('boardTheme', 'wood');
    document.body.classList.add('theme-' + boardTheme);
    const pieceSet = await db.kvGet('pieceSet', 'pieces');
    setPieceSet(pieceSet);
  },
  setBoardTheme(v) {
    document.body.classList.remove('theme-wood', 'theme-green', 'theme-blue');
    document.body.classList.add('theme-' + v);
    db.kvSet('boardTheme', v);
  },
  setPieceSetChoice(v) {
    setPieceSet(v);
    db.kvSet('pieceSet', v);
    Setup.buildPalette();
  },
};

const ColorMode = {
  mode: 'dark',        // user preference: 'light' | 'dark' | 'system'
  mql: null,

  async init() {
    this.mode = await db.kvGet('colorMode', 'system');
    this.mql = window.matchMedia('(prefers-color-scheme: light)');
    this.mql.addEventListener('change', () => { if (this.mode === 'system') this.apply(); });
    this.apply();
  },

  set(mode) {
    this.mode = mode;
    db.kvSet('colorMode', mode);
    this.apply();
  },

  effective() {
    if (this.mode === 'system') return this.mql.matches ? 'light' : 'dark';
    return this.mode;
  },

  apply() {
    const eff = this.effective();
    document.body.classList.remove('mode-light', 'mode-dark');
    document.body.classList.add('mode-' + eff);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', eff === 'light' ? '#f5f3ef' : '#1a1714');
    if (activeScreen === 'profile') Profile.refresh();
  },
};

function openEloHistoryModal(historyKey, titleKey) {
  return modal(async (box, close) => {
    const hist = await db.kvGet(historyKey, []);
    box.innerHTML = `<h3>${t(titleKey)}</h3>`;
    if (hist.length < 2) {
      const p = document.createElement('p'); p.className = 'hint'; p.textContent = t('no_history_yet');
      const ok = document.createElement('button'); ok.className = 'btn primary'; ok.textContent = t('close');
      ok.onclick = () => close(null);
      box.append(p, ok);
      return;
    }
    const peak = Math.max(...hist.map(h => h.value));
    const tf = document.createElement('div'); tf.className = 'elo-history-timeframe';
    const options = [['7', 'timeframe_7d'], ['30', 'timeframe_30d'], ['90', 'timeframe_90d'], ['all', 'timeframe_all']];
    for (const [v, key] of options) {
      const b = document.createElement('button'); b.className = 'btn'; b.dataset.v = v; b.textContent = t(key);
      if (v === '30') b.classList.add('on');
      tf.appendChild(b);
    }
    const chartWrap = document.createElement('div'); chartWrap.className = 'elo-history-wrap';
    const canvas = document.createElement('canvas'); chartWrap.appendChild(canvas);
    const peakEl = document.createElement('div'); peakEl.className = 'elo-peak';
    peakEl.innerHTML = `${t('elo_peak')}: <b>${peak}</b>`;
    const shareBtn = document.createElement('button'); shareBtn.className = 'btn big'; shareBtn.textContent = t('share');
    shareBtn.onclick = () => shareStatCard({
      emoji: '📈',
      title: t('card_elo_title'),
      subtitle: `${t(titleKey)}: ${peak}`,
    }, 'record-elo.png');
    const closeBtn = document.createElement('button'); closeBtn.className = 'btn big'; closeBtn.textContent = t('close');
    closeBtn.onclick = () => close(null);
    box.append(tf, chartWrap, peakEl, shareBtn, closeBtn);

    let chart = null;
    function render(days) {
      let points = hist;
      if (days !== 'all') {
        const cutoff = Date.now() - (+days) * 86400000;
        points = hist.filter(h => new Date(h.date + 'T00:00:00').getTime() >= cutoff);
        if (points.length < 2) points = hist.slice(-2);
      }
      const light = ColorMode.effective() === 'light';
      const labelColor = light ? '#2a2521' : '#f0ece6';
      const gridColor = light ? 'rgba(42,37,33,0.12)' : 'rgba(240,236,230,0.12)';
      if (chart) chart.destroy();
      chart = new Chart(canvas, {
        type: 'line',
        data: {
          labels: points.map(h => h.date.slice(5)),
          datasets: [{
            data: points.map(h => h.value),
            borderColor: '#7fa650', backgroundColor: 'rgba(127,166,80,0.15)',
            fill: true, tension: .25, pointRadius: 2,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: labelColor, maxTicksLimit: 6 }, grid: { color: gridColor } },
            y: { ticks: { color: labelColor }, grid: { color: gridColor } },
          },
        },
      });
    }
    segInit(tf, v => render(v));
    render('30');
  });
}

// ═════════════════════ AVATARS (placeholder set) ═════════════════════
// Simple built-in icon set until real artwork is supplied; swapping later
// only means changing this table, not the storage/selection logic.

const AVATAR_OPTIONS = [
  { id: 'a1', bg: '#7fa650' },
  { id: 'a2', bg: '#4a6c31' },
  { id: 'a3', bg: '#5f8741' },
  { id: 'a4', bg: '#8a6d3b' },
  { id: 'a5', bg: '#b8453a' },
  { id: 'a6', bg: '#3a5a8c' },
  { id: 'a7', bg: '#6b4c9a' },
  { id: 'a8', bg: '#c07830' },
  { id: 'a9', bg: '#b8862e' },
  { id: 'a10', bg: '#a0522d' },
  { id: 'a11', bg: '#556270' },
  { id: 'a12', bg: '#4a4a4a' },
];

function avatarHtml(avatarId, sizePx = 40) {
  const opt = AVATAR_OPTIONS.find(a => a.id === avatarId) ?? AVATAR_OPTIONS[0];
  return `<div class="avatar-badge" style="width:${sizePx}px;height:${sizePx}px;background:${opt.bg}"><img src="avatars/${opt.id}.png" alt="" width="${sizePx}" height="${sizePx}"></div>`;
}

const Avatars = {
  renderGridInto(container, selectedId, onPick) {
    container.innerHTML = '';
    for (const opt of AVATAR_OPTIONS) {
      const cell = document.createElement('div');
      cell.className = 'avatar-pick-cell';
      cell.dataset.id = opt.id;
      cell.classList.toggle('selected', opt.id === selectedId);
      cell.innerHTML = avatarHtml(opt.id, 44);
      cell.onclick = () => onPick(opt.id);
      container.appendChild(cell);
    }
  },

  async refresh() {
    const id = await db.kvGet('avatarId', AVATAR_OPTIONS[0].id);
    $('profile-avatar-wrap').innerHTML = avatarHtml(id, 56);
    return id;
  },
};

// ═════════════════════ MEMBERSHIP ═════════════════════
// The trial is a pure client-side entitlement flag (free by definition, so
// granting it costs nothing and needs no billing). Paid renewal after the
// trial ends requires real billing (Stripe/RevenueCat) which is future
// work — the subscribe button is an honest placeholder until that lands.

const MEMBER_TRIAL_DAYS = 30;

function memberBadgeHtml(isMember) {
  return isMember ? `<span class="member-badge" title="${t('member_badge_title')}">👑</span>` : '';
}

const Membership = {
  async status() {
    const isMember = await db.kvGet('isMember', false);
    const trialUsed = await db.kvGet('memberTrialUsed', false);
    const trialEndsAt = await db.kvGet('memberTrialEndsAt', null);
    return { isMember, trialUsed, trialEndsAt };
  },

  async checkExpiry() {
    const { isMember, trialEndsAt } = await this.status();
    if (isMember && trialEndsAt && Date.now() > trialEndsAt) {
      await db.kvSet('isMember', false);
    }
  },

  async startTrial() {
    await db.kvSet('isMember', true);
    await db.kvSet('memberTrialUsed', true);
    await db.kvSet('memberTrialEndsAt', Date.now() + MEMBER_TRIAL_DAYS * 86400000);
    toast(t('member_trial_started_toast'));
  },

  async openModal() {
    const { isMember, trialUsed, trialEndsAt } = await this.status();
    await modal((box, close) => {
      box.innerHTML = `<h3>${t('member_modal_title')}</h3>`;

      if (isMember && trialEndsAt) {
        const daysLeft = Math.max(0, Math.ceil((trialEndsAt - Date.now()) / 86400000));
        const status = document.createElement('p');
        status.className = 'hint';
        status.textContent = t('member_active_trial').replace('{n}', daysLeft);
        box.appendChild(status);
      } else if (isMember) {
        const status = document.createElement('p');
        status.className = 'hint';
        status.textContent = t('member_active_paid');
        box.appendChild(status);
      }

      const benefitsTitle = document.createElement('h4');
      benefitsTitle.style.margin = '10px 0 4px';
      benefitsTitle.textContent = t('member_benefits_title');
      box.appendChild(benefitsTitle);

      const ul = document.createElement('ul');
      ul.className = 'member-benefits';
      for (let i = 1; i <= 7; i++) {
        const li = document.createElement('li');
        li.textContent = t(`member_benefit_${i}`);
        ul.appendChild(li);
      }
      box.appendChild(ul);

      const priceRow = document.createElement('div');
      priceRow.className = 'member-price-row';
      priceRow.innerHTML = `
        <div class="member-price-card"><b>${t('member_price_monthly')}</b></div>
        <div class="member-price-card"><b>${t('member_price_yearly')}</b></div>
      `;
      box.appendChild(priceRow);

      const trialNote = document.createElement('p');
      trialNote.className = 'hint';
      trialNote.style.textAlign = 'center';
      trialNote.textContent = t('member_trial_note');
      box.appendChild(trialNote);

      const cta = document.createElement('button');
      cta.className = 'btn primary big';
      let ctaIsClose = false;
      if (!trialUsed && !isMember) {
        cta.textContent = t('member_start_trial_btn');
        cta.onclick = async () => {
          await this.startTrial();
          await Profile.refresh();
          close(null);
        };
      } else if (!isMember) {
        cta.textContent = t('member_subscribe_btn');
        cta.onclick = () => toast(t('member_subscribe_toast'));
      } else {
        ctaIsClose = true;
        cta.textContent = t('close');
        cta.onclick = () => close(null);
      }
      box.appendChild(cta);

      if (!ctaIsClose) {
        const closeBtn = document.createElement('button');
        closeBtn.className = 'btn';
        closeBtn.style.marginTop = '8px';
        closeBtn.textContent = t('close');
        closeBtn.onclick = () => close(null);
        box.appendChild(closeBtn);
      }
    });
  },
};

// ═════════════════════ ACHIEVEMENTS / BADGES ═════════════════════

const BADGE_DEFS = [
  // puzzle count milestones
  { id: 'puz_10', icon: '🧩', name: { es: 'Novato de la táctica', en: 'Puzzle Novice' }, check: s => s.puzzlesSolved >= 10 },
  { id: 'puz_50', icon: '🧩', name: { es: 'Aficionado', en: 'Puzzle Enthusiast' }, check: s => s.puzzlesSolved >= 50 },
  { id: 'puz_200', icon: '🧩', name: { es: 'Táctico', en: 'Tactician' }, check: s => s.puzzlesSolved >= 200 },
  { id: 'puz_1000', icon: '🧩', name: { es: 'Veterano', en: 'Puzzle Veteran' }, check: s => s.puzzlesSolved >= 1000 },
  { id: 'puz_5000', icon: '👑', name: { es: 'Maestro Táctico', en: 'Tactics Master' }, check: s => s.puzzlesSolved >= 5000 },
  // per-theme mastery
  ...PUZZLE_THEMES.map(th => ({
    id: 'theme_' + th, icon: '🎯',
    label: lang => `${lang === 'en' ? 'Master' : 'Maestro'}: ${t('theme_' + th)}`,
    check: s => (s.themeCounts[th] ?? 0) >= 15,
  })),
  // streak
  { id: 'streak_3', icon: '🔥', name: { es: 'Racha de 3 días', en: '3-Day Streak' }, check: s => s.bestStreak >= 3 },
  { id: 'streak_7', icon: '🔥', name: { es: 'Racha de 7 días', en: '7-Day Streak' }, check: s => s.bestStreak >= 7 },
  { id: 'streak_30', icon: '⚡', name: { es: 'Racha de 30 días', en: '30-Day Streak' }, check: s => s.bestStreak >= 30 },
  { id: 'streak_100', icon: '👑', name: { es: 'Racha de 100 días', en: '100-Day Streak' }, check: s => s.bestStreak >= 100 },
  // endgame conversions
  ...ENDGAME_CATEGORIES.map(cat => ({
    id: 'endgame_' + cat, icon: '🏁',
    label: lang => `${lang === 'en' ? 'Converted' : 'Convirtió'}: ${t('cat_' + cat)}`,
    check: s => !!s.endgameConverted[cat],
  })),
  // opening trainer
  { id: 'opening_1', icon: '📖', name: { es: 'Primera apertura entrenada', en: 'First Opening Trained' }, check: s => s.openingCount >= 1 },
  { id: 'opening_3', icon: '📖', name: { es: 'Explorador de aperturas', en: 'Opening Explorer' }, check: s => s.openingCount >= 3 },
  // study / onboarding
  { id: 'first_import', icon: '📥', name: { es: 'Primera partida importada', en: 'First Game Imported' }, check: s => !!s.firstImportDone },
  { id: 'first_engine', icon: '💡', name: { es: 'Primer análisis con motor', en: 'First Engine Analysis' }, check: s => !!s.firstEngineUsed },
  // puzzle rush
  { id: 'rush_1', icon: '⚡', name: { es: 'Primer Puzzle Rush', en: 'First Puzzle Rush' }, check: s => s.rushBestScore >= 1 },
  { id: 'rush_10', icon: '⚡', name: { es: 'Rush: 10 en una racha', en: 'Rush: 10 in a row' }, check: s => s.rushBestScore >= 10 },
  { id: 'rush_30', icon: '👑', name: { es: 'Rush: 30 en una racha', en: 'Rush: 30 in a row' }, check: s => s.rushBestScore >= 30 },
];

function badgeLabel(def) {
  return def.label ? def.label(getLang()) : def.name[getLang()];
}

const Badges = {
  earned: {},   // id -> timestamp

  async gatherState() {
    const solved = await db.kvGet('puzzlesSolved', {});
    const themeCounts = {};
    for (const id of Object.keys(solved)) {
      const p = PUZZLES.find(pz => pz.id === id);
      if (p) for (const th of p.themes) themeCounts[th] = (themeCounts[th] ?? 0) + 1;
    }
    const endgameConverted = await db.kvGet('endgameConverted', {});
    const openingElo = await db.kvGet('openingElo', {});
    return {
      puzzlesSolved: Object.keys(solved).length,
      themeCounts,
      bestStreak: await db.kvGet('bestStreak', 0),
      endgameConverted,
      openingCount: Object.keys(openingElo).length,
      firstImportDone: await db.kvGet('firstImportDone', false),
      firstEngineUsed: await db.kvGet('firstEngineUsed', false),
      rushBestScore: await db.kvGet('rushBestScore', 0),
    };
  },

  async checkNew() {
    this.earned = await db.kvGet('earnedBadges', {});
    const state = await this.gatherState();
    let changed = false;
    for (const def of BADGE_DEFS) {
      if (!this.earned[def.id] && def.check(state)) {
        this.earned[def.id] = Date.now();
        changed = true;
        toast(`🏆 ${t('badge_earned')}: ${badgeLabel(def)}`, 3500);
      }
    }
    if (changed) await db.kvSet('earnedBadges', this.earned);
    if (activeScreen === 'profile') this.renderTrophyCase();
    return changed;
  },

  async renderTrophyCase() {
    this.earned = await db.kvGet('earnedBadges', {});
    const el = $('trophy-case');
    if (!el) return;
    el.innerHTML = '';
    const earnedCount = BADGE_DEFS.filter(d => this.earned[d.id]).length;
    $('trophy-count').textContent = `${earnedCount}/${BADGE_DEFS.length}`;
    for (const def of BADGE_DEFS) {
      const got = !!this.earned[def.id];
      const label = badgeLabel(def);
      const cell = document.createElement('div');
      cell.className = 'badge-cell' + (got ? ' earned' : '');
      cell.title = label;
      cell.innerHTML = `<div class="badge-icon">${def.icon}</div><div class="badge-name">${esc(label)}</div>`;
      el.appendChild(cell);
    }
  },
};

const RADAR_MIN = 800, RADAR_MAX = 2200;

const Profile = {
  charts: {},

  init() {
    $('profile-edit-btn').onclick = () => this.openEditModal();
    $('profile-auth-btn').onclick = () => openAuthModal();
    $('profile-signout-btn').onclick = () => Auth.signOut();
    $('profile-elo-puzzle-card').onclick = () => openEloHistoryModal('puzzleEloHistory', 'puzzle_elo');
    $('profile-elo-opening-card').onclick = () => openEloHistoryModal('openingEloHistory', 'opening_elo');
    $('profile-elo-endgame-card').onclick = () => openEloHistoryModal('endgameEloHistory', 'endgame_elo');
    $('profile-leaderboard-btn').onclick = () => Leaderboard.open();
    $('profile-member-btn').onclick = () => Membership.openModal();
    $('profile-share-streak').onclick = () => shareStatCard({
      emoji: '🔥',
      title: t('card_streak_title').replace('{n}', Streak.count),
      subtitle: t('card_streak_subtitle'),
    }, 'racha.png');
    Auth.onChange(() => this.renderAccount());
  },

  openEditModal() {
    return modal((box, close) => {
      box.innerHTML = `<h3>${t('edit_profile_title')}</h3>`;

      const grid = document.createElement('div');
      grid.className = 'trophy-grid';
      box.appendChild(grid);

      const nameLabel = document.createElement('label');
      nameLabel.className = 'fld-label';
      nameLabel.style.marginTop = '14px';
      nameLabel.textContent = t('your_name');
      box.appendChild(nameLabel);

      const nameRow = document.createElement('div');
      nameRow.className = 'row';
      const input = document.createElement('input');
      input.className = 'input'; input.maxLength = 40;
      const saveBtn = document.createElement('button');
      saveBtn.className = 'btn primary'; saveBtn.textContent = t('save');
      saveBtn.onclick = async () => {
        await db.kvSet('profileName', input.value.trim());
        toast(t('name_saved'));
        await this.renderAccount();
      };
      nameRow.append(input, saveBtn);
      box.appendChild(nameRow);

      const closeBtn = document.createElement('button');
      closeBtn.className = 'btn'; closeBtn.style.marginTop = '14px';
      closeBtn.textContent = t('close');
      closeBtn.onclick = () => close(null);
      box.appendChild(closeBtn);

      (async () => {
        input.value = await db.kvGet('profileName', '');
        const currentAvatar = await db.kvGet('avatarId', AVATAR_OPTIONS[0].id);
        const pick = async (id) => {
          await db.kvSet('avatarId', id);
          await Avatars.refresh();
          Avatars.renderGridInto(grid, id, pick);
        };
        Avatars.renderGridInto(grid, currentAvatar, pick);
      })();
    });
  },

  async renderAccount() {
    const user = Auth.user;
    $('profile-auth-btn').classList.toggle('hidden', !!user);
    $('profile-signout-btn').classList.toggle('hidden', !user);
    const profileName = await db.kvGet('profileName', '');
    $('profile-display-name').textContent = profileName || (user && (user.displayName || user.email)) || t('your_name');
    const isMember = await db.kvGet('isMember', false);
    $('profile-account-badge').innerHTML = memberBadgeHtml(isMember);
  },

  async renderMemberCard() {
    const { isMember, trialEndsAt } = await Membership.status();
    const statusEl = $('profile-member-status');
    const btn = $('profile-member-btn');
    if (isMember && trialEndsAt) {
      const daysLeft = Math.max(0, Math.ceil((trialEndsAt - Date.now()) / 86400000));
      statusEl.textContent = t('member_active_trial').replace('{n}', daysLeft);
    } else if (isMember) {
      statusEl.textContent = t('member_active_paid');
    } else {
      statusEl.textContent = t('member_trial_note');
    }
    btn.textContent = isMember ? t('member_manage_btn') : t('become_member_btn');
  },

  renderStreakTimeline() {
    const el = $('profile-streak-timeline');
    if (!el) return;
    const days = Streak.count;
    const idx = streakTierIndex(days);
    const lang = getLang();
    el.innerHTML = STREAK_TIERS.map((tier, i) => {
      const locked = i > idx;
      const label = tier.label[lang];
      return `<div class="streak-timeline-tier${locked ? ' locked' : ''}${i === idx ? ' current' : ''}" title="${esc(label)}">
        <img src="streaks/${tier.icon}.png" alt="${esc(label)}">
      </div>`;
    }).join('');
    if (idx >= 0) {
      requestAnimationFrame(() => {
        const currentEl = el.children[idx];
        if (currentEl) currentEl.scrollIntoView({ inline: 'center', block: 'nearest' });
      });
    }
  },

  async refresh() {
    await Membership.checkExpiry();
    await this.renderAccount();
    await this.renderMemberCard();
    await Avatars.refresh();
    await Badges.checkNew();
    Badges.renderTrophyCase();
    this.renderStreakTimeline();

    const puzzleElo = await db.kvGet('puzzleElo', 1200);
    const themeElo = await db.kvGet('puzzleThemeElo', {});
    const openingElo = await db.kvGet('openingElo', {});
    const endgameElo = await db.kvGet('endgameElo', {});

    const openingNames = Object.keys(openingElo);
    const openingAvg = openingNames.length
      ? openingNames.reduce((s, k) => s + openingElo[k], 0) / openingNames.length : 1200;
    const endgameNames = ENDGAME_CATEGORIES.filter(c => endgameElo[c] != null);
    const endgameAvg = endgameNames.length
      ? endgameNames.reduce((s, c) => s + endgameElo[c], 0) / endgameNames.length : 1200;

    $('profile-elo-puzzle').textContent = Math.round(puzzleElo);
    $('profile-elo-opening').textContent = openingNames.length ? Math.round(openingAvg) : '—';
    $('profile-elo-endgame').textContent = endgameNames.length ? Math.round(endgameAvg) : '—';

    this.drawRadar('overall',
      [t('radar_axis_opening'), t('radar_axis_puzzle'), t('radar_axis_endgame')],
      [openingNames.length ? openingAvg : RADAR_MIN, puzzleElo, endgameNames.length ? endgameAvg : RADAR_MIN]);

    $('profile-opening-empty').classList.toggle('hidden', openingNames.length > 0);
    $('chart-opening').classList.toggle('hidden', openingNames.length === 0);
    if (openingNames.length) {
      this.drawRadar('opening', openingNames, openingNames.map(k => openingElo[k]));
    }

    this.drawRadar('puzzle',
      PUZZLE_THEMES.map(th => t('theme_' + th)),
      PUZZLE_THEMES.map(th => themeElo[th] ?? 1200));

    this.drawRadar('endgame',
      ENDGAME_CATEGORIES.map(c => t('cat_' + c)),
      ENDGAME_CATEGORIES.map(c => endgameElo[c] ?? 1200));
  },

  drawRadar(key, labels, data) {
    const canvas = $('chart-' + key);
    if (!canvas) return;
    const light = ColorMode.effective() === 'light';
    const labelColor = light ? '#2a2521' : '#f0ece6';
    const gridColor = light ? 'rgba(42,37,33,0.15)' : 'rgba(240,236,230,0.15)';
    const cfg = {
      type: 'radar',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: 'rgba(127,166,80,0.25)',
          borderColor: '#7fa650',
          pointBackgroundColor: '#7fa650',
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false } },
        scales: {
          r: {
            min: RADAR_MIN, max: RADAR_MAX,
            ticks: { display: false, stepSize: 350 },
            grid: { color: gridColor },
            angleLines: { color: gridColor },
            pointLabels: { color: labelColor, font: { size: 11 } },
          },
        },
      },
    };
    if (this.charts[key]) { this.charts[key].destroy(); }
    this.charts[key] = new Chart(canvas, cfg);
  },
};

// ═════════════════════ LEADERBOARD ═════════════════════

const Leaderboard = {
  entries: [],
  field: 'puzzleElo',

  init() {
    $('leaderboard-back').onclick = () => showScreen('profile');
    $('leaderboard-search').addEventListener('input', () => this.filter($('leaderboard-search').value));
    segInit($('leaderboard-mode'), v => { this.field = v; this.open(); });
  },

  async open() {
    showScreen('leaderboard');
    $('leaderboard-search').value = '';
    $('leaderboard-list').innerHTML = '';
    $('leaderboard-status').textContent = t('loading');
    try {
      this.entries = await fetchLeaderboard(200, this.field);
    } catch (e) {
      this.entries = [];
      $('leaderboard-status').textContent = '⚠️ ' + (e.message || e);
      return;
    }
    this.render(this.entries);
  },

  filter(qstr) {
    const q = qstr.trim().toLowerCase();
    const list = q ? this.entries.filter(e => (e.profileName || '').toLowerCase().includes(q)) : this.entries;
    this.render(list, q);
  },

  render(list, q) {
    $('leaderboard-status').textContent = this.entries.length ? '' : t('leaderboard_empty');
    const el = $('leaderboard-list');
    el.innerHTML = '';
    if (q && !list.length) { $('leaderboard-status').textContent = t('leaderboard_no_match'); return; }
    const label = this.field === 'rushBestScore' ? t('rush_title') : t('puzzle_elo');
    list.forEach((e, i) => {
      const value = this.field === 'rushBestScore' ? Math.round(e.rushBestScore ?? 0) : Math.round(e.puzzleElo ?? 1200);
      const item = document.createElement('button');
      item.className = 'list-item';
      item.style.cssText = 'flex-direction:row; align-items:center; gap:10px;';
      item.innerHTML = `${avatarHtml(e.avatarId, 34)}<span style="display:flex;flex-direction:column;align-items:flex-start;"><b>#${i + 1} ${esc(e.profileName || '?')}${memberBadgeHtml(e.isMember)}</b><span class="sub">${label}: ${value}</span></span>`;
      item.onclick = () => PublicProfile.open(e);
      el.appendChild(item);
    });
  },
};

// ═════════════════════ PUBLIC PROFILE ═════════════════════

const PublicProfile = {
  init() {
    $('pubprofile-back').onclick = () => showScreen('leaderboard');
  },

  open(entry) {
    showScreen('public-profile');
    $('pubprofile-name').innerHTML = `${esc(entry.profileName || '?')}${memberBadgeHtml(entry.isMember)}`;
    $('pubprofile-avatar-wrap').innerHTML = avatarHtml(entry.avatarId, 64);

    const puzzleElo = entry.puzzleElo ?? 1200;
    const themeElo = entry.puzzleThemeElo ?? {};
    const openingElo = entry.openingElo ?? {};
    const endgameElo = entry.endgameElo ?? {};

    const openingNames = Object.keys(openingElo);
    const openingAvg = openingNames.length
      ? openingNames.reduce((s, k) => s + openingElo[k], 0) / openingNames.length : 1200;
    const endgameNames = ENDGAME_CATEGORIES.filter(c => endgameElo[c] != null);
    const endgameAvg = endgameNames.length
      ? endgameNames.reduce((s, c) => s + endgameElo[c], 0) / endgameNames.length : 1200;

    $('pubprofile-elo-puzzle').textContent = Math.round(puzzleElo);
    $('pubprofile-elo-opening').textContent = openingNames.length ? Math.round(openingAvg) : '—';
    $('pubprofile-elo-endgame').textContent = endgameNames.length ? Math.round(endgameAvg) : '—';

    Profile.drawRadar('pub-overall',
      [t('radar_axis_opening'), t('radar_axis_puzzle'), t('radar_axis_endgame')],
      [openingNames.length ? openingAvg : RADAR_MIN, puzzleElo, endgameNames.length ? endgameAvg : RADAR_MIN]);

    $('pubprofile-opening-empty').classList.toggle('hidden', openingNames.length > 0);
    $('chart-pub-opening').classList.toggle('hidden', openingNames.length === 0);
    if (openingNames.length) Profile.drawRadar('pub-opening', openingNames, openingNames.map(k => openingElo[k]));

    Profile.drawRadar('pub-puzzle',
      PUZZLE_THEMES.map(th => t('theme_' + th)),
      PUZZLE_THEMES.map(th => themeElo[th] ?? 1200));

    Profile.drawRadar('pub-endgame',
      ENDGAME_CATEGORIES.map(c => t('cat_' + c)),
      ENDGAME_CATEGORIES.map(c => endgameElo[c] ?? 1200));
  },
};

// ═════════════════════ init ═════════════════════

async function main() {
  const splashStart = Date.now();
  await ColorMode.init();
  applyStatic();
  Analysis.init();
  Base.init();
  Play.init();
  Trainer.init();
  Puzzles.init();
  Rush.init();
  Endgame.init();
  Profile.init();
  Leaderboard.init();
  PublicProfile.init();
  Setup.init();
  await Themes.init();
  await Streak.init();
  Auth.onChange(async () => {
    // remote data may have just replaced local kv values (sign-in) — refresh live views
    await Streak.init();
    if (Puzzles.loaded) {
      Puzzles.elo = await db.kvGet('puzzleElo', 1200);
      Puzzles.themeElo = await db.kvGet('puzzleThemeElo', {});
      Puzzles.solved = await db.kvGet('puzzlesSolved', {});
      Puzzles.attemptCount = await db.kvGet('puzzleAttemptCount', 0);
      Puzzles.updateEloBadge();
      Puzzles.updateProgress();
    }
    Endgame.elo = await db.kvGet('endgameElo', {});
    if (activeScreen === 'endgame') Endgame.showCategories();
    if (activeScreen === 'profile') Profile.refresh();
    if (Auth.user && Auth.needsProfileCompletion) openCompleteProfileModal();
  });
  $('btn-settings').onclick = openSettings;
  showScreen('analysis');
  // make sure at least one base exists so saving is one tap
  const bases = await db.listBases();
  if (!bases.length) await db.createBase(t('my_games'));
  // register service worker for offline use
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }
  const elapsed = Date.now() - splashStart;
  setTimeout(() => $('splash').classList.add('hide'), Math.max(0, 600 - elapsed));
}

main().catch(e => { window.__mainError = (e && e.stack) || String(e); console.error('MAIN FAILED', e); });
