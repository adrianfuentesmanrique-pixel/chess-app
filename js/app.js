// Chess Training Center — main application.
import { Chess, validateFen } from '../vendor/chess.js';
import { t, getLang, setLang, applyStatic } from './i18n.js';
import { GameTree, parsePgn, splitPgn, START_FEN, nagText } from './tree.js';
import { Board, parsePlacement, setPieceSet, getPieceSet } from './board.js';
import { Engine, uciToMove, pvWithNumbers } from './engine.js';
import * as db from './db.js';
import { PUZZLES, PUZZLE_THEMES } from './puzzles-data.js';
import { ENDGAMES, ENDGAME_CATEGORIES } from './endgames-data.js';
import { LEARNING_CATEGORIES } from './learning-data.js';
import { QUOTES, KAEL_LINES, KAEL_PRAISE, KAEL_MISTAKE, KAEL_CHECKIN, KAEL_BLINDFOLD, KAEL_HINT_WARNING, KAEL_GAME_REVIEW, KAEL_ALT_MOVE } from './quotes-data.js';
import { Auth, authErrorMessage, fetchLeaderboard } from './firebase.js';
import { LEGAL_TERMS, LEGAL_PRIVACY } from './legal-data.js';
import { classifyOpening, VALID_OPENING_NAMES } from './openings-eco.js';

// One-time cleanup for accounts that accumulated openingElo entries before
// openings were tracked by detected name instead of by (possibly
// mislabeled) study base name — those stale keys would otherwise sit in
// the radar forever since nothing ever overwrites or removes them.
async function cleanStaleOpenings() {
  const elo = await db.kvGet('openingElo', {});
  let changed = false;
  for (const name of Object.keys(elo)) {
    if (!VALID_OPENING_NAMES.has(name)) { delete elo[name]; changed = true; }
  }
  if (changed) await db.kvSet('openingElo', elo);
}

// A short Kael line about the opening the player just reached, flavored by
// its general character (gambit, sharp, solid, hypermodern, classical…)
// rather than needing hand-written text for every single named opening.
function openingFlavorMsg(name) {
  const lower = name.toLowerCase();
  let flavor;
  if (/gambit/.test(lower)) flavor = { es: 'un gambito atrevido', en: 'a bold gambit' };
  else if (/sicilian/.test(lower)) flavor = { es: 'una elección afilada y combativa', en: 'a sharp, fighting choice' };
  else if (/king's indian|grünfeld|grunfeld|benoni/.test(lower)) flavor = { es: 'una apertura hipermoderna y contundente', en: 'a hypermodern, punchy opening' };
  else if (/french|caro-kann|slav|scheveningen|karpov/.test(lower)) flavor = { es: 'una elección sólida y bien fundamentada', en: 'a solid, well-founded choice' };
  else if (/queen's gambit|london|catalan|torre/.test(lower)) flavor = { es: 'un planteamiento clásico y estable', en: 'a classical, stable setup' };
  else if (/dutch|budapest|latvian|owl|nimzowitsch defense/.test(lower)) flavor = { es: 'una apertura poco común y llena de vida', en: 'an uncommon opening full of life' };
  else if (/ruy lopez|italian|scotch|petrov|philidor|vienna/.test(lower)) flavor = { es: 'una apertura clásica con mucha historia', en: 'a classical opening with a lot of history' };
  else if (/english|réti|reti|bird|larsen|sokolsky/.test(lower)) flavor = { es: 'un enfoque flexible por el flanco', en: 'a flexible flank approach' };
  else if (/najdorf|dragon|sveshnikov|winawer/.test(lower)) flavor = { es: 'una variante afilada de mucho peso teórico', en: 'a sharp, theory-heavy variation' };
  else flavor = { es: 'una buena elección', en: 'a good choice' };
  return getLang() === 'es' ? `${name}, ¡${flavor.es}!` : `${name}, ${flavor.en}!`;
}

const $ = id => document.getElementById(id);
const engine = new Engine();

// ═════════════════════ sound ═════════════════════

const Sound = {
  enabled: true,
  cache: {},

  async init() {
    this.enabled = await db.kvGet('soundEnabled', true);
  },

  async setEnabled(v) {
    this.enabled = v;
    await db.kvSet('soundEnabled', v);
  },

  play(name) {
    if (!this.enabled) return;
    let audio = this.cache[name];
    if (!audio) { audio = new Audio(`sounds/${name}.wav`); this.cache[name] = audio; }
    const el = audio.paused ? audio : audio.cloneNode(true);
    el.volume = 0.6;
    el.play().catch(() => {});
  },
};

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

function openLegalModal(doc) {
  return modal((box, close) => {
    const content = doc[getLang()];
    box.innerHTML = `<h3>${esc(content.title)}</h3><p class="hint">${esc(content.updated)}</p>` +
      content.sections.map(s => `<h4 class="legal-h">${esc(s.h)}</h4><p class="legal-p">${esc(s.p)}</p>`).join('');
    const ok = document.createElement('button');
    ok.className = 'btn primary big'; ok.textContent = t('close');
    ok.onclick = () => close(null);
    box.appendChild(ok);
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

    const consentWrap = document.createElement('label');
    consentWrap.className = 'auth-consent hidden';
    const consentCb = document.createElement('input'); consentCb.type = 'checkbox';
    const consentText = document.createElement('span');
    const termsLink = document.createElement('a');
    termsLink.href = '#'; termsLink.textContent = t('terms_link_text');
    termsLink.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openLegalModal(LEGAL_TERMS); };
    const privacyLink = document.createElement('a');
    privacyLink.href = '#'; privacyLink.textContent = t('privacy_link_text');
    privacyLink.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openLegalModal(LEGAL_PRIVACY); };
    consentText.append(t('agree_terms_prefix') + ' ', termsLink, ' ' + t('agree_terms_middle') + ' ', privacyLink, '.');
    consentWrap.append(consentCb, consentText);

    function updateGate() {
      const needsConsent = mode === 'signup';
      consentWrap.classList.toggle('hidden', !needsConsent);
      const blocked = needsConsent && !consentCb.checked;
      googleBtn.disabled = blocked;
      const submit = form.querySelector('button.primary');
      if (submit) submit.disabled = blocked;
    }
    consentCb.onchange = updateGate;

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
        const username = fieldInput('username_field', 'text');
        username.input.maxLength = 24;
        const usernameHint = document.createElement('p');
        usernameHint.className = 'hint';
        usernameHint.textContent = t('username_permanent_hint');
        const dob = fieldInput('date_of_birth', 'date');
        const email = fieldInput('email', 'email');
        const pass = fieldInput('password', 'password');
        const pass2 = fieldInput('confirm_password', 'password');
        const submit = document.createElement('button');
        submit.className = 'btn primary big'; submit.textContent = t('create_account_btn');
        submit.onclick = () => withBusy(submit, () => {
          if (pass.input.value !== pass2.input.value) { const e = new Error('mismatch'); e.code = null; e._msg = t('passwords_dont_match'); throw e; }
          if (!username.input.value.trim()) { const e = new Error('no username'); e.code = null; e._msg = t('username_required'); throw e; }
          return Auth.signUpWithEmail({
            email: email.input.value.trim(), password: pass.input.value,
            firstName: first.input.value.trim(), lastName: last.input.value.trim(),
            username: username.input.value.trim(), dateOfBirth: dob.input.value,
          });
        });
        switchLink.textContent = t('have_account_already');
        form.append(first.wrap, last.wrap, username.wrap, usernameHint, dob.wrap, email.wrap, pass.wrap, pass2.wrap, submit);
      }
      updateGate();
    }

    tabIn.onclick = () => { mode = 'signin'; tabIn.classList.add('on'); tabUp.classList.remove('on'); renderForm(); };
    tabUp.onclick = () => { mode = 'signup'; tabUp.classList.add('on'); tabIn.classList.remove('on'); renderForm(); };
    switchLink.onclick = () => (mode === 'signin' ? tabUp : tabIn).click();

    renderForm();
    box.append(tabs, form, consentWrap, errorEl, divider, googleBtn, switchLink);
  });
}

function openCompleteProfileModal() {
  return modal((box, close) => {
    box.innerHTML = `<h3>${t('complete_profile_title')}</h3><p class="hint">${t('complete_profile_hint')}</p>`;
    const first = document.createElement('input'); first.className = 'input'; first.placeholder = t('first_name');
    const last = document.createElement('input'); last.className = 'input'; last.placeholder = t('last_name');
    const username = document.createElement('input'); username.className = 'input'; username.placeholder = t('username_field'); username.maxLength = 24;
    const usernameHint = document.createElement('p'); usernameHint.className = 'hint'; usernameHint.textContent = t('username_permanent_hint');
    const dob = document.createElement('input'); dob.className = 'input'; dob.type = 'date'; dob.placeholder = t('date_of_birth');
    const errorEl = document.createElement('div'); errorEl.className = 'auth-error';
    const submit = document.createElement('button');
    submit.className = 'btn primary big'; submit.textContent = t('save');
    submit.onclick = async () => {
      if (!first.value.trim() || !last.value.trim() || !username.value.trim()) return;
      submit.disabled = true;
      try {
        await Auth.completeProfile({ firstName: first.value.trim(), lastName: last.value.trim(), username: username.value.trim(), dateOfBirth: dob.value });
        close(null);
      } catch (e) {
        errorEl.textContent = authErrorMessage(e.code, getLang());
        submit.disabled = false;
      }
    };
    box.append(first, last, username, usernameHint, dob, errorEl, submit);
  });
}

// ═════════════════════ KAEL ONBOARDING ═════════════════════

const LEVEL_TIERS = [
  { id: 'beginner', min: 0, max: 1200, color: '#2bb673', icon: '♟' },
  { id: 'intermediate', min: 1201, max: 1900, color: '#3659d9', icon: '♞' },
  { id: 'expert', min: 1901, max: 2300, color: '#f5b942', icon: '♝' },
  { id: 'master', min: 2301, max: 3000, color: '#eb5757', icon: '♛' },
];

function kaelRecoText(levelId) {
  if (levelId === 'beginner') return t('kael_reco_beginner');
  if (levelId === 'master') return t('kael_reco_master');
  return t('kael_reco_middle');
}

const Onboarding = {
  async maybeShow() {
    const done = await db.kvGet('onboardingDone', false);
    if (done) return false;
    await this.run();
    return true;
  },

  async run() {
    let chosen = null;
    await modal((box, close) => {
      let step = 1;

      const render = () => {
        box.innerHTML = '';
        const head = document.createElement('div');
        head.className = 'kael-modal-head';
        head.innerHTML = `<img src="icons/kael/kael-welcome.png" class="kael-portrait" alt="Kael">`;
        box.appendChild(head);

        const bubble = document.createElement('div');
        bubble.className = 'kael-bubble';
        box.appendChild(bubble);

        if (step === 1) {
          bubble.innerHTML = `<b>${t('kael_welcome_title')}</b><p>${t('kael_welcome_body')}</p>`;
          const next = document.createElement('button');
          next.className = 'btn primary big'; next.textContent = t('kael_continue');
          next.onclick = () => { step = 2; render(); };
          box.appendChild(next);
        } else if (step === 2) {
          bubble.innerHTML = `<p>${t('kael_level_question')}</p>`;
          const grid = document.createElement('div');
          grid.className = 'kael-level-grid';
          for (const tier of LEVEL_TIERS) {
            const cell = document.createElement('button');
            cell.className = 'kael-level-cell';
            cell.style.setProperty('--tier-color', tier.color);
            cell.innerHTML = `
              <span class="kael-level-icon" style="background:${tier.color}">${tier.icon}</span>
              <b>${t('level_' + tier.id + '_name')}</b>
              <span class="kael-level-range">ELO ${tier.min}-${tier.max}</span>
              <span class="kael-level-desc">${t('level_' + tier.id + '_desc')}</span>
            `;
            cell.onclick = () => { chosen = tier.id; step = 3; render(); };
            grid.appendChild(cell);
          }
          box.appendChild(grid);
        } else {
          const tier = LEVEL_TIERS.find(x => x.id === chosen);
          bubble.innerHTML = `<b>${t('level_' + chosen + '_name')}</b><p>${kaelRecoText(chosen)}</p>`;
          const done = document.createElement('button');
          done.className = 'btn primary big'; done.textContent = t('kael_start_btn');
          done.onclick = async () => {
            await db.kvSet('onboardingDone', true);
            await db.kvSet('userLevel', chosen);
            close(null);
          };
          box.appendChild(done);
        }
      };
      render();
    });
  },
};

// ═════════════════════ KAEL QUOTES ═════════════════════
// A small, non-blocking corner widget — never a modal — so it never
// interrupts whatever the player is doing on the board.

const KaelQuotes = {
  lastIdx: -1,
  timer: null,

  init() {
    $('kael-fab').onclick = () => this.showRandom();
  },

  pick() {
    const lang = getLang();
    if (Math.random() < 0.3) {
      const lines = KAEL_LINES[lang];
      let idx = Math.floor(Math.random() * lines.length);
      if (lines.length > 1 && idx === this.lastIdx) idx = (idx + 1) % lines.length;
      this.lastIdx = idx;
      return { text: lines[idx], author: null };
    }
    let idx = Math.floor(Math.random() * QUOTES.length);
    if (idx === this.lastIdx) idx = (idx + 1) % QUOTES.length;
    this.lastIdx = idx;
    const item = QUOTES[idx];
    return { text: item.q, author: item.a };
  },

  show(item, duration = 6000) {
    const bubble = $('kael-bubble');
    const title = item.title ? `<b class="kael-quote-title">${esc(item.title)}</b>` : '';
    const text = `${title}<p>${esc(item.text)}</p>${item.author ? `<span class="kael-quote-author">— ${esc(item.author)}</span>` : ''}`;
    bubble.innerHTML = item.image
      ? `<div class="kael-quote-row"><img src="${item.image}" class="kael-quote-badge" alt=""><div>${text}</div></div>`
      : text;
    bubble.classList.add('show');
    Sound.play('kael-pop');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => bubble.classList.remove('show'), duration);
  },

  showRandom() { this.show(this.pick()); },
};

// Picks a random line from a { es: [...], en: [...] } dict and wraps it in
// the { text, author } shape KaelQuotes.show() expects.
function pickKael(dict) {
  const lines = dict[getLang()];
  return { text: lines[Math.floor(Math.random() * lines.length)], author: null };
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

const PIECE_GLYPHS = {
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
};

function parseFenBoard(fen) {
  return fen.split(' ')[0].split('/').map(row => {
    const cells = [];
    for (const ch of row) {
      if (/\d/.test(ch)) { for (let i = 0; i < Number(ch); i++) cells.push(null); }
      else cells.push({ color: ch === ch.toUpperCase() ? 'w' : 'b', type: ch.toLowerCase() });
    }
    return cells;
  });
}

// Renders the puzzle position itself (not a "solved!" card) so it can be
// shared before, during, or after solving.
function renderPuzzleCard(puzzle, orientation) {
  const W = 1000, H = 1250;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#22201c'); grad.addColorStop(1, '#0f0d0b');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#7fa650'; ctx.lineWidth = 10;
  ctx.strokeRect(24, 24, W - 48, H - 48);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f0ece6';
  ctx.font = 'bold 46px system-ui, sans-serif';
  ctx.fillText(`🧩 ${t('puzzles_title')} · ${puzzle.rating}`, W / 2, 96);

  const toMove = puzzle.fen.split(' ')[1] === 'w' ? 'w' : 'b';
  ctx.fillStyle = '#a99f92';
  ctx.font = '34px system-ui, sans-serif';
  ctx.fillText(`${t(toMove === 'w' ? 'white' : 'black')} ${t('to_move_find')}`, W / 2, 148);

  const boardSize = 800, boardX = (W - boardSize) / 2, boardY = 190, sq = boardSize / 8;
  let rows = parseFenBoard(puzzle.fen);
  if (orientation === 'b') rows = rows.slice().reverse().map(r => r.slice().reverse());

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#e9d5b0' : '#a5713f';
      ctx.fillRect(boardX + c * sq, boardY + r * sq, sq, sq);
    }
  }
  ctx.strokeStyle = '#3a352c'; ctx.lineWidth = 3;
  ctx.strokeRect(boardX, boardY, boardSize, boardSize);

  ctx.textBaseline = 'middle';
  ctx.lineWidth = 2;
  ctx.font = `${Math.round(sq * 0.72)}px 'Segoe UI Symbol', 'DejaVu Sans', sans-serif`;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = rows[r][c];
      if (!piece) continue;
      const glyph = PIECE_GLYPHS[piece.color][piece.type];
      const x = boardX + c * sq + sq / 2, y = boardY + r * sq + sq / 2 + 6;
      ctx.strokeStyle = piece.color === 'w' ? '#1c1a17' : '#f5f1ea';
      ctx.strokeText(glyph, x, y);
      ctx.fillStyle = piece.color === 'w' ? '#f5f1ea' : '#1c1a17';
      ctx.fillText(glyph, x, y);
    }
  }

  ctx.fillStyle = '#7fa650';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.fillText('♞ Chess Training Center', W / 2, H - 60);
  return canvas;
}

async function shareCanvas(canvas, filename) {
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

// ═════════════════════ DAILY MISSIONS ═════════════════════

// Deterministic small string hash — same input always yields the same
// number, so "today's" pick is stable across users/reloads without needing
// a server.
function dailySeed(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h;
}

// Rating bands the puzzle of the day scales across, keyed by the player's
// own puzzle ELO — a beginner and a 2500 get a different "puzzle of the
// day", but everyone in the same band gets the same one on a given date.
const PUZZLE_OF_DAY_BANDS = [0, 1800, 2000, 2300, 2500, 2800, Infinity];

function puzzleOfDay(playerElo) {
  let tier = 0;
  for (let i = 1; i < PUZZLE_OF_DAY_BANDS.length - 1; i++) if (playerElo >= PUZZLE_OF_DAY_BANDS[i]) tier = i;
  const lo = PUZZLE_OF_DAY_BANDS[tier], hi = PUZZLE_OF_DAY_BANDS[tier + 1];
  const pool = PUZZLES.filter(p => p.rating >= lo && p.rating < hi);
  const list = pool.length ? pool : PUZZLES;
  const seed = dailySeed(todayStr() + '_tier' + tier);
  return list[seed % list.length];
}

const DailyMissions = {
  date: null,
  done: { puzzle: false, play: false, opening: false },
  streak: 0,
  reminded: false,

  async init() {
    const today = todayStr();
    this.date = await db.kvGet('dailyMissionsDate', null);
    this.done = await db.kvGet('dailyMissionsDone', { puzzle: false, play: false, opening: false });
    this.streak = +(await db.kvGet('dailyMissionStreak', 0));
    if (this.date !== today) {
      const lastComplete = await db.kvGet('dailyMissionLastCompleteDate', null);
      if (!(lastComplete && isYesterday(lastComplete, today))) this.streak = 0;
      this.date = today;
      this.done = { puzzle: false, play: false, opening: false };
      await db.kvSet('dailyMissionsDate', this.date);
      await db.kvSet('dailyMissionsDone', this.done);
      await db.kvSet('dailyMissionStreak', this.streak);
    }
    this.render();
  },

  async complete(key) {
    if (this.date !== todayStr()) await this.init();
    if (this.done[key]) return;
    this.done[key] = true;
    await db.kvSet('dailyMissionsDone', this.done);
    const doneMsgKey = { puzzle: 'mission_done_puzzle', play: 'mission_done_play', opening: 'mission_done_opening' }[key];
    if (this.done.puzzle && this.done.play && this.done.opening) {
      const today = todayStr();
      await db.kvSet('dailyMissionLastCompleteDate', today);
      this.streak += 1;
      await db.kvSet('dailyMissionStreak', this.streak);
      const best = await db.kvGet('bestDailyMissionStreak', 0);
      if (this.streak > best) await db.kvSet('bestDailyMissionStreak', this.streak);
      KaelQuotes.show({ title: '🎯 ' + t('daily_missions_complete'), text: t(doneMsgKey) }, 5500);
      // delayed so it doesn't immediately overwrite the message just shown above
      setTimeout(() => Badges.checkNew(), 5700);
    } else {
      KaelQuotes.show({ text: t(doneMsgKey) }, 4000);
      setTimeout(() => Badges.checkNew(), 4200);
    }
    this.render();
  },

  // A one-time-per-session nudge if the player hasn't touched their daily
  // missions yet — not shown if they're already all done, and never more
  // than once per app load.
  remindIfIncomplete() {
    if (this.reminded) return;
    this.reminded = true;
    if (this.done.puzzle && this.done.play && this.done.opening) return;
    KaelQuotes.show({ text: t('daily_missions_reminder'), author: null }, 5500);
  },

  render() {
    const el = $('daily-missions-list');
    if (!el) return;
    const streakEl = $('daily-missions-streak');
    if (streakEl) streakEl.textContent = this.streak > 0 ? `🔥 ${this.streak}` : '';
    const rows = [
      { key: 'puzzle', label: t('mission_puzzle'), go: () => this.goPuzzle() },
      { key: 'play', label: t('mission_play'), go: () => showScreen('play') },
      { key: 'opening', label: t('mission_opening'), go: () => showScreen('trainer') },
    ];
    el.innerHTML = '';
    for (const row of rows) {
      const done = !!this.done[row.key];
      const btn = document.createElement('button');
      btn.className = 'daily-mission-row' + (done ? ' done' : '');
      btn.innerHTML = `<span class="daily-mission-check">✓</span><span class="daily-mission-label">${esc(row.label)}</span><span class="daily-mission-arrow">${done ? '' : '›'}</span>`;
      btn.onclick = () => row.go();
      el.appendChild(btn);
    }
  },

  async goPuzzle() {
    showScreen('puzzles');
    await Puzzles.ensureLoaded();
    const elo = await db.kvGet('puzzleElo', 1200);
    Puzzles.loadPuzzle(puzzleOfDay(elo));
    Puzzles.isDailyPuzzle = true;
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

const SCREENS = ['analysis', 'base', 'play', 'trainer', 'puzzles', 'setup', 'endgame', 'learn', 'profile', 'leaderboard', 'public-profile', 'rush', 'blind'];
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
  if (name === 'learn') Learning.showCategories();
  if (name === 'profile') Profile.refresh();
  if (name !== 'blind') Blind.cleanup();
  if (name !== 'puzzles') Puzzles.disarmCheckin();
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
  _commentTarget: null,   // node the comment box is currently editing
  _holdTimer: null,       // long-press timer for the move-list context menu
  _holdXY: null,
  _justHeld: false,       // suppresses the click-to-navigate right after a long-press fires
  undoStack: [],          // snapshots for undoing annotation mistakes (shapes/NAGs/deletions) — never moves

  // Snapshots the tree (as PGN, which round-trips shapes/NAGs/comments) plus
  // the current node's FEN, so a mistaken annotation, NAG, or variation
  // deletion can be undone without touching the actual move history.
  pushUndo() {
    this.undoStack.push({ pgn: this.tree.toPgn(), fen: this.tree.current.fen });
    if (this.undoStack.length > 20) this.undoStack.shift();
  },

  undoAnnotation() {
    if (!this.undoStack.length) { toast(t('nothing_to_undo')); return; }
    const snap = this.undoStack.pop();
    const tree = parsePgn(snap.pgn);
    let target = tree.root;
    const stack = [tree.root];
    while (stack.length) {
      const n = stack.pop();
      if (n.fen === snap.fen) { target = n; break; }
      stack.push(...n.children);
    }
    tree.current = target;
    this.tree = tree;
    this.refresh();
  },

  init() {
    this.board = new Board($('ana-board'), {
      onMove: (mv) => { if (this.tree.play(mv)) this.refresh(); },
      onShapesChange: (shapes) => { this.pushUndo(); this.tree.current.shapes = shapes; },
      onSound: type => Sound.play(type),
    });
    $('ana-first').onclick = () => { this.tree.toStart(); this.refresh(); };
    $('ana-prev').onclick = () => { this.tree.prev(); this.refresh(); };
    $('ana-next').onclick = () => { this.tree.next(); this.refresh(); };
    $('ana-last').onclick = () => { this.tree.toEnd(); this.refresh(); };
    $('ana-flip').onclick = () => this.board.flip();
    $('ana-engine-toggle').onclick = () => this.toggleEngine();
    $('ana-explore').onclick = () => this.openExplore();
    $('ana-view-tab').addEventListener('click', e => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      if (b.dataset.v === 'games') this.showGamesTab(); else this.showMovesTab();
    });
    $('ana-setup-btn').onclick = () => Setup.open(this.tree.fen());
    $('ana-new-game-btn').onclick = () => this.loadTree(new GameTree());
    $('ana-undo-btn').onclick = () => this.undoAnnotation();
    $('ana-more').onclick = () => this.moreMenu();
    $('ana-base-back').onclick = () => this.backToBase();
    $('ana-base-exit').onclick = () => this.exitBase();
    $('ana-gr-exit').onclick = () => this.exitGameReview();
    $('ana-base-prev').onclick = () => this.gotoAdjacentGame(-1);
    $('ana-base-next').onclick = () => this.gotoAdjacentGame(1);
    $('ana-annotate-toggle').onclick = () => {
      const nowHidden = $('ana-annotate').classList.toggle('hidden');
      if (nowHidden) {
        this.board.setDrawColor(null);
        $('ana-annotate').querySelectorAll('.annotate-btn[data-color]').forEach(x => x.classList.remove('active'));
      }
    };
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
      (this._commentTarget || this.tree.current).comment = $('ana-comment-text').value.trim();
      $('ana-comment-box').classList.add('hidden');
      this._commentTarget = null;
      this.renderMoves();
    };
    $('ana-comment-cancel').onclick = () => { $('ana-comment-box').classList.add('hidden'); this._commentTarget = null; };
    $('ana-moves').addEventListener('click', e => {
      if (this._justHeld) { this._justHeld = false; return; }
      const span = e.target.closest('[data-node]');
      if (!span) return;
      const node = this.tree.findById(+span.dataset.node);
      if (node) { this.tree.goto(node); this.refresh(); }
    });
    $('ana-moves').addEventListener('pointerdown', e => {
      const span = e.target.closest('.mv[data-node]');
      if (!span) return;
      const node = this.tree.findById(+span.dataset.node);
      if (!node) return;
      this._holdXY = { x: e.clientX, y: e.clientY };
      clearTimeout(this._holdTimer);
      this._holdTimer = setTimeout(() => {
        this._holdTimer = null;
        this._justHeld = true;
        this.tree.goto(node);
        this.refresh();
        this.moveContextMenu(node);
      }, 500);
    });
    const cancelHold = () => { clearTimeout(this._holdTimer); this._holdTimer = null; this._holdXY = null; };
    $('ana-moves').addEventListener('pointerup', cancelHold);
    $('ana-moves').addEventListener('pointercancel', cancelHold);
    $('ana-moves').addEventListener('pointermove', e => {
      if (!this._holdXY) return;
      if (Math.abs(e.clientX - this._holdXY.x) > 10 || Math.abs(e.clientY - this._holdXY.y) > 10) cancelHold();
    });
    $('ana-nag-bar').addEventListener('click', e => {
      const btn = e.target.closest('button[data-nag]');
      if (!btn || !this.tree.current.san) return;
      this.pushUndo();
      const nag = +btn.dataset.nag;
      const nags = this.tree.current.nags;
      const i = nags.indexOf(nag);
      if (i === -1) nags.push(nag); else nags.splice(i, 1);
      this.renderMoves();
      this.updateNagBar();
    });
    this.refresh();
  },

  loadTree(tree, ctx = { baseId: null, gameId: null }) {
    this.tree = tree;
    this.ctx = ctx;
    this.undoStack = [];
    this.tree.toStart();
    this.tree.toEnd();
    this.refresh();
    showScreen('analysis');
    this.updateBaseNav();
  },

  // Opening a game from a database keeps the player oriented in the Bases
  // tab — same board/engine/comment tools, but the tab bar stays on
  // "Bases" and there's a way back to the list plus prev/next game.
  updateBaseNav() {
    const inBase = !!this.ctx.baseId;
    $('ana-base-nav').classList.toggle('hidden', !inBase);
    if (inBase) {
      document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.screen === 'base'));
      const idx = Base.gamesCache.findIndex(g => g.id === this.ctx.gameId);
      $('ana-base-prev').disabled = idx <= 0;
      $('ana-base-next').disabled = idx === -1 || idx >= Base.gamesCache.length - 1;
    }
    $('ana-gr-nav').classList.toggle('hidden', !this.ctx.fromGameReview);
  },

  backToBase() {
    const baseId = this.ctx.baseId;
    showScreen('base');
    Base.openBase(baseId);
  },

  // Leaves the base-linked context without leaving the game on screen —
  // stays on this position, but as a normal, un-linked Analysis session.
  exitBase() {
    this.ctx = { baseId: null, gameId: null };
    showScreen('analysis');
    this.updateBaseNav();
  },

  // Leaves the "just analyzed this played game" context without discarding
  // the position on screen — same idea as exitBase() but for games that
  // arrived here via Game Review's "Analyze the game" button.
  exitGameReview() {
    this.ctx = { baseId: null, gameId: null };
    this.updateBaseNav();
  },

  gotoAdjacentGame(dir) {
    const idx = Base.gamesCache.findIndex(g => g.id === this.ctx.gameId);
    if (idx === -1) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= Base.gamesCache.length) return;
    const g = Base.gamesCache[newIdx];
    try {
      const tree = parsePgn(g.pgn);
      this.loadTree(tree, { baseId: g.baseId, gameId: g.id });
    } catch { toast(t('import_failed')); }
  },

  refresh() {
    const cur = this.tree.current;
    const last = cur.san ? { from: cur.from, to: cur.to } : null;
    this.board.setPosition(this.tree.fen(), last);
    this.board.setShapes(cur.shapes);
    this.renderMoves();
    this.updateNagBar();
    if (this.engineOn) this.restartEngine();
  },

  updateNagBar() {
    const nags = this.tree.current.nags;
    $('ana-nag-bar').querySelectorAll('button[data-nag]').forEach(b => {
      b.classList.toggle('on', nags.includes(+b.dataset.nag));
    });
  },

  // --- explore (find games matching the current position) ------------
  showMovesTab() {
    $('ana-moves').classList.remove('hidden');
    $('ana-nag-bar').classList.remove('hidden');
    $('ana-games-view').classList.add('hidden');
    $('ana-view-tab').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === 'moves'));
  },

  showGamesTab() {
    $('ana-moves').classList.add('hidden');
    $('ana-nag-bar').classList.add('hidden');
    $('ana-games-view').classList.remove('hidden');
    $('ana-view-tab').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === 'games'));
  },

  async openExplore() {
    sheet([
      { label: '📚 ' + t('explore_database'), action: () => this.exploreDatabase() },
      { label: '🌐 ' + t('explore_internet'), action: () => this.exploreInternet() },
    ]);
  },

  async exploreDatabase() {
    const allBases = await db.listBases();
    // A base always exists (main() auto-creates "My games"), so check for
    // any games at all rather than any bases — an empty default base
    // shouldn't silently search nothing and report "no results".
    const bases = allBases.filter(b => b.count > 0);
    if (!bases.length) {
      await modal((box, close) => {
        box.innerHTML = `<p>${esc(t('explore_need_base'))}</p>`;
        const ok = document.createElement('button');
        ok.className = 'btn primary big'; ok.textContent = t('ok');
        ok.onclick = () => close(null);
        box.appendChild(ok);
      });
      return;
    }
    let baseId = bases[0].id;
    if (bases.length > 1) {
      baseId = await modal((box, close) => {
        box.innerHTML = `<h3>${t('choose_base')}</h3>`;
        for (const b of bases) {
          const btn = document.createElement('button');
          btn.className = 'sheet-btn';
          btn.textContent = `${b.name} (${b.count ?? 0} ${t('games')})`;
          btn.onclick = () => close(b.id);
          box.appendChild(btn);
        }
        const ca = document.createElement('button');
        ca.className = 'sheet-btn cancel'; ca.textContent = t('cancel');
        ca.onclick = () => close(null);
        box.appendChild(ca);
      });
      if (!baseId) return;
    }
    this.showGamesTab();
    $('ana-games-status').textContent = t('explore_searching');
    $('ana-games-list').innerHTML = '';
    const key = fenKey(this.tree.fen());
    const games = await db.listGames(baseId);
    const matches = [];
    for (const g of games) {
      let tree;
      try { tree = parsePgn(g.pgn); } catch { continue; }
      if (this.treeHasFen(tree.root, key)) matches.push(g);
    }
    this.renderGameResults(matches, 'local');
  },

  // Walks every branch (including side variations) looking for a matching position.
  treeHasFen(node, key, depth = 0) {
    if (depth > 300) return false;
    if (fenKey(node.fen) === key) return true;
    for (const c of node.children) if (this.treeHasFen(c, key, depth + 1)) return true;
    return false;
  },

  async exploreInternet() {
    this.showGamesTab();
    $('ana-games-status').textContent = t('explore_searching');
    $('ana-games-list').innerHTML = '';
    try {
      const url = `https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(this.tree.fen())}&topGames=15`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Lichess: ${res.status}`);
      const data = await res.json();
      this.renderGameResults(data.topGames || [], 'lichess');
    } catch (e) {
      $('ana-games-status').textContent = '⚠️ ' + (e.message || e);
    }
  },

  renderGameResults(list, source) {
    $('ana-games-status').textContent = list.length ? '' : t('explore_no_results');
    const el = $('ana-games-list');
    el.innerHTML = '';
    for (const item of list) {
      const btn = document.createElement('button');
      btn.className = 'list-item';
      if (source === 'local') {
        btn.innerHTML = `<b>${esc(item.white)} — ${esc(item.black)}</b><span class="sub">${esc(item.event || '')} ${esc(item.date || '')} · ${esc(item.result)}</span>`;
        btn.onclick = () => {
          try { this.loadTree(parsePgn(item.pgn), { baseId: item.baseId, gameId: item.id }); this.showMovesTab(); }
          catch { toast(t('import_failed')); }
        };
      } else {
        const w = item.white?.name ?? '?', b = item.black?.name ?? '?';
        const res = item.winner === 'white' ? '1-0' : item.winner === 'black' ? '0-1' : '½-½';
        btn.innerHTML = `<b>${esc(w)} — ${esc(b)}</b><span class="sub">${item.year ?? ''} · ${res}</span>`;
        btn.onclick = () => window.open(`https://lichess.org/${item.id}`, '_blank');
      }
      el.appendChild(btn);
    }
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
      span.className = 'mv' + (node === this.tree.current ? ' current' : '') + nagMoveClass(node.nags);
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

  editComment(node = this.tree.current) {
    this._commentTarget = node;
    const box = $('ana-comment-box');
    box.classList.remove('hidden');
    $('ana-comment-text').value = node.comment || '';
    $('ana-comment-text').focus();
  },

  // Long-press on a move in the list — quick edit actions for that move.
  moveContextMenu(node) {
    const items = [
      { label: '💬 ' + t('text_before_move'), action: () => this.editComment(node.parent) },
      { label: '💬 ' + t('text_after_move'), action: () => this.editComment(node) },
      { label: '⬆️ ' + t('promote_var'), action: () => { this.pushUndo(); this.tree.promote(node); this.refresh(); } },
      { label: '🗑 ' + t('delete'), action: () => this.deleteSubmenu(node) },
    ];
    sheet(items);
  },

  deleteSubmenu(node) {
    const items = [];
    if (this.tree.isInVariation(node)) {
      items.push({ label: '🗑 ' + t('delete_variation'), action: () => { this.pushUndo(); this.tree.deleteVariation(node); this.refresh(); }, danger: true });
    }
    items.push({ label: '🗑 ' + t('delete_remaining'), action: () => { this.pushUndo(); this.tree.deleteNode(node); this.refresh(); }, danger: true });
    if (node.parent && node.parent !== this.tree.root) {
      items.push({ label: '🗑 ' + t('delete_previous'), action: () => { this.pushUndo(); this.tree.truncateBefore(node); this.refresh(); }, danger: true });
    }
    sheet(items);
  },

  async moreMenu() {
    const items = [
      { label: '📝 ' + t('game_details'), action: () => this.editDetails() },
      { label: '💾 ' + t('save_to_base'), action: () => this.saveToBase() },
      { label: '📤 ' + t('share_game'), action: () => sharePgnText(gameFilename(this.tree.headers), this.tree.toPgn()) },
      { label: '📋 ' + t('copy_pgn'), action: () => { copyText(this.tree.toPgn()); } },
      { label: '📋 ' + t('copy_fen'), action: () => { copyText(this.tree.fen()); } },
      { label: '🤖 ' + t('play_from_here'), action: () => Play.startFromFen(this.tree.fen()) },
    ];
    if (this.tree.current.san) {
      items.push({ label: '⬆️ ' + t('promote_var'), action: () => { this.pushUndo(); this.tree.promote(this.tree.current); this.refresh(); } });
      items.push({ label: '🗑 ' + t('delete'), action: () => this.deleteSubmenu(this.tree.current) });
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
    this.board = new Board($('play-board'), { onMove: mv => this.userMove(mv), onSound: type => Sound.play(type) });
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
      const won = winner === this.playerColor;
      Sound.play(won ? 'game-win' : 'game-lose');
      this.finish(won ? t('checkmate_win') : t('checkmate_loss'));
      if (won) this.recordLevelBeaten();
      return true;
    }
    if (this.chess.isDraw() || this.chess.isStalemate()) { Sound.play('game-draw'); this.finish(t('draw')); return true; }
    return false;
  },

  async recordLevelBeaten() {
    const beaten = await db.kvGet('engineLevelsBeaten', {});
    if (!beaten[this.level]) {
      beaten[this.level] = true;
      await db.kvSet('engineLevelsBeaten', beaten);
      Badges.checkNew();
    }
  },

  finish(msg) {
    this.over = true;
    this.setStatus(msg);
    Streak.recordActivity();
    const hist = this.chess.history();
    if (hist.length >= 2) DailyMissions.complete('play');
    if (hist.length >= 4) {
      const names = t('level_names');
      const me = getLang() === 'es' ? 'Yo' : 'Me';
      const sf = `Stockfish (${names[this.level]})`;
      const outcome = this.chess.isCheckmate()
        ? ((this.chess.turn() === 'w' ? 'b' : 'w') === this.playerColor ? 'win' : 'loss')
        : (this.chess.isDraw() || this.chess.isStalemate()) ? 'draw'
        : (msg === t('you_resigned') ? 'loss' : 'draw');
      GameReview.open({
        startFen: this.startFen,
        sanHistory: hist,
        whiteName: this.playerColor === 'w' ? me : sf,
        blackName: this.playerColor === 'b' ? me : sf,
        outcome,
      });
    }
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
    Analysis.loadTree(tree, { baseId: null, gameId: null, fromGameReview: true });
  },
};

// ═════════════════════ GAME REVIEW ═════════════════════

const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const GR_CATEGORY_COLOR = { brilliant: '#1fb6a6', best: 'var(--success)', good: 'var(--accent)', mistake: 'var(--warning)', blunder: 'var(--danger)' };
const GR_CATEGORY_ICON = { brilliant: '💎', best: '⭐', good: '👍', mistake: '❓', blunder: '❌' };
const GR_CATEGORIES = ['brilliant', 'best', 'good', 'mistake', 'blunder'];

function grClassify(cpLoss, isSac) {
  if (cpLoss <= 10) return isSac ? 'brilliant' : 'best';
  if (cpLoss <= 50) return 'good';
  if (cpLoss <= 200) return 'mistake';
  return 'blunder';
}

// A capture-or-hang move that the opponent could immediately recapture at a
// material loss for the mover, yet the engine still rates it near-best —
// a simple proxy for "brilliant" sacrifices. Excludes forced moves (the
// only legal move is never a "choice") and moves made from an already
// clearly-lost position (delaying an inevitable loss isn't brilliant).
function grIsSacrifice(move, legalMoveCount, evalBeforeMover) {
  if (legalMoveCount <= 1) return false;
  if (evalBeforeMover < -300) return false;
  const movedVal = PIECE_VALUE[move.piece] || 0;
  const gainedVal = move.captured ? (PIECE_VALUE[move.captured] || 0) : 0;
  if (movedVal - gainedVal < 2) return false;
  const chessAfter = new Chess(move.afterFen);
  return chessAfter.moves({ verbose: true }).some(m => m.to === move.to && m.captured);
}

function grAccuracy(avgCpLoss) {
  const acc = 103.1668 * Math.exp(-0.04354 * avgCpLoss) - 3.1668;
  return Math.max(0, Math.min(100, acc));
}

function grBuildMoves(startFen, sanHistory) {
  const chess = new Chess(startFen);
  const moves = [];
  for (const san of sanHistory) {
    const legalMoveCount = chess.moves().length;
    const mv = chess.move(san);
    moves.push({ san: mv.san, color: mv.color, piece: mv.piece, captured: mv.captured, to: mv.to, afterFen: chess.fen(), legalMoveCount });
  }
  return moves;
}

function grChartSvg(evals, cats) {
  const W = 600, H = 110, CLAMP = 500;
  const N = evals.length;
  const clamp = v => Math.max(-CLAMP, Math.min(CLAMP, v));
  const xFor = i => (i / (N - 1)) * W;
  const yFor = v => H / 2 - (clamp(v) / CLAMP) * (H / 2 - 6);
  let line = `M 0 ${yFor(evals[0]).toFixed(1)}`;
  for (let i = 1; i < N; i++) line += ` L ${xFor(i).toFixed(1)} ${yFor(evals[i]).toFixed(1)}`;
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;
  const dots = cats.map((cat, idx) => {
    if (cat !== 'brilliant' && cat !== 'mistake' && cat !== 'blunder') return '';
    const i = idx + 1;
    return `<circle cx="${xFor(i).toFixed(1)}" cy="${yFor(evals[i]).toFixed(1)}" r="4.5" fill="${GR_CATEGORY_COLOR[cat]}" stroke="var(--panel)" stroke-width="1.5"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="gr-chart" preserveAspectRatio="none">
    <line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="var(--muted)" stroke-opacity=".35" stroke-width="1"/>
    <path d="${area}" fill="var(--text)" fill-opacity=".12"/>
    <path d="${line}" fill="none" stroke="var(--text)" stroke-width="2"/>
    ${dots}
  </svg>`;
}

const GameReview = {
  async open({ startFen, sanHistory, whiteName, blackName, outcome }) {
    const moves = grBuildMoves(startFen, sanHistory);
    const fens = [startFen, ...moves.map(m => m.afterFen)];

    await modal(async (box, close) => {
      box.innerHTML = `
        <div class="kael-modal-head"><img src="icons/kael/kael-bust.png" class="kael-portrait" alt="Kael"></div>
        <div class="kael-bubble"><b>${esc(t('game_review_title'))}</b><p>${esc(t('game_review_analyzing'))}</p></div>
        <div class="gr-spinner"></div>
        <div class="gr-progress" id="gr-progress">0 / ${fens.length}</div>`;

      const evals = [];
      for (let i = 0; i < fens.length; i++) {
        evals.push(await engine.evaluate(fens[i], 220));
        const p = $('gr-progress');
        if (p) p.textContent = `${i + 1} / ${fens.length}`;
      }

      const cats = moves.map((mv, i) => {
        const before = evals[i], after = evals[i + 1];
        const cpLoss = Math.max(0, mv.color === 'w' ? before - after : after - before);
        const evalBeforeMover = mv.color === 'w' ? before : -before;
        const isSac = cpLoss <= 10 && grIsSacrifice(mv, mv.legalMoveCount, evalBeforeMover);
        return grClassify(cpLoss, isSac);
      });
      const cpLosses = moves.map((mv, i) => {
        const before = evals[i], after = evals[i + 1];
        return Math.max(0, mv.color === 'w' ? before - after : after - before);
      });

      const counts = { w: {}, b: {} };
      for (const c of GR_CATEGORIES) { counts.w[c] = 0; counts.b[c] = 0; }
      let cplW = 0, cplB = 0, nW = 0, nB = 0;
      moves.forEach((mv, i) => {
        const side = mv.color === 'w' ? 'w' : 'b';
        counts[side][cats[i]]++;
        if (side === 'w') { cplW += cpLosses[i]; nW++; } else { cplB += cpLosses[i]; nB++; }
      });
      const accW = grAccuracy(nW ? cplW / nW : 0);
      const accB = grAccuracy(nB ? cplB / nB : 0);

      const kaelMsg = pickKael(KAEL_GAME_REVIEW[outcome] || KAEL_GAME_REVIEW.draw);
      const tableRows = GR_CATEGORIES.map(c => `
        <tr>
          <td>${GR_CATEGORY_ICON[c]} ${esc(t('cat_' + c))}</td>
          <td style="color:${GR_CATEGORY_COLOR[c]}">${counts.w[c]}</td>
          <td style="color:${GR_CATEGORY_COLOR[c]}">${counts.b[c]}</td>
        </tr>`).join('');

      box.innerHTML = `
        <div class="kael-modal-head"><img src="icons/kael/kael-bust.png" class="kael-portrait" alt="Kael"></div>
        <div class="kael-bubble"><b>${esc(t('game_review_title'))}</b><p>${esc(kaelMsg.text)}</p></div>
        ${grChartSvg(evals, cats)}
        <div class="gr-players">
          <div class="gr-player"><b>${esc(whiteName)}</b><span class="gr-accuracy">${accW.toFixed(1)}</span></div>
          <div class="gr-player"><b>${esc(blackName)}</b><span class="gr-accuracy">${accB.toFixed(1)}</span></div>
        </div>
        <table class="gr-table">${tableRows}</table>
        <div class="gr-cpl"><span>${esc(t('game_review_cpl'))}: ${Math.round(cplW)}</span><span>${Math.round(cplB)}</span></div>
        <div class="gr-actions">
          <button class="btn" id="gr-analyze">${esc(t('analyze_game'))}</button>
          <button class="btn primary" id="gr-close">${esc(t('close'))}</button>
        </div>`;
      $('gr-close').onclick = () => close(null);
      $('gr-analyze').onclick = () => {
        close(null);
        const tree = treeFromHistory(startFen, moves.map(m => m.san));
        const NAG_FOR = { brilliant: 3, mistake: 2, blunder: 4 };
        let node = tree.root;
        moves.forEach((mv, i) => {
          node = node.children[0];
          const nag = NAG_FOR[cats[i]];
          if (nag) node.nags.push(nag);
        });
        tree.setHeader('White', whiteName);
        tree.setHeader('Black', blackName);
        tree.setHeader('Date', new Date().toISOString().slice(0, 10).replace(/-/g, '.'));
        const finalChess = new Chess(fens[fens.length - 1]);
        if (finalChess.isCheckmate()) tree.setHeader('Result', finalChess.turn() === 'w' ? '0-1' : '1-0');
        else if (finalChess.isDraw()) tree.setHeader('Result', '1/2-1/2');
        engine.stop();
        Analysis.loadTree(tree, { baseId: null, gameId: null, fromGameReview: true });
      };
    });
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
  posHistory: [],      // [{fen, lastMove, inBook}] snapshots for the nav buttons
  viewIdx: -1,
  liveInteractive: false,
  announcedOpening: null,

  init() {
    buildLevelSeg($('trainer-level'));
    segInit($('trainer-color'));
    segInit($('trainer-level'));
    this.board = new Board($('trainer-board'), { onMove: mv => this.userMove(mv), onSound: type => Sound.play(type) });
    $('trainer-base').addEventListener('change', () => this.previewBook());
    $('trainer-start').onclick = () => this.start();
    $('trainer-new-btn').onclick = () => { engine.stop(); $('trainer-game').classList.add('hidden'); $('trainer-setup').classList.remove('hidden'); };
    $('trainer-analyze').onclick = () => this.toAnalysis();
    $('trainer-first').onclick = () => this.gotoHistory(0);
    $('trainer-prev').onclick = () => this.gotoHistory(this.viewIdx - 1);
    $('trainer-next').onclick = () => this.gotoHistory(this.viewIdx + 1);
    $('trainer-last').onclick = () => this.gotoHistory(this.posHistory.length - 1);
    $('trainer-hint').onclick = () => this.hint();
    $('trainer-resign').onclick = async () => {
      if (this.over) return;
      if (await askConfirm(t('resign') + '?')) this.finishMsg(t('you_resigned'), 'loss');
    };
  },

  // Renders a move and records it in the browsable history, same pattern
  // as the Puzzles nav — lets the player look back through the game
  // (including past a point where they left book, or into any variation
  // the engine free-plays) without that browsing ever being mistaken for
  // an undo.
  place(fen, lastMove, inBook, color) {
    this.board.setPosition(fen, lastMove, color);
    this.posHistory.push({ fen, lastMove, inBook });
    this.viewIdx = this.posHistory.length - 1;
    this.updateBadgeForView();
    this.updateNavButtons();
  },

  updateNavButtons() {
    const atStart = this.viewIdx <= 0;
    const atEnd = this.viewIdx >= this.posHistory.length - 1;
    $('trainer-first').disabled = atStart;
    $('trainer-prev').disabled = atStart;
    $('trainer-next').disabled = atEnd;
    $('trainer-last').disabled = atEnd;
  },

  gotoHistory(idx) {
    if (!this.posHistory.length) return;
    idx = Math.max(0, Math.min(idx, this.posHistory.length - 1));
    this.viewIdx = idx;
    const snap = this.posHistory[idx];
    this.board.setPosition(snap.fen, snap.lastMove);
    const live = idx === this.posHistory.length - 1;
    this.board.interactive = live && this.liveInteractive;
    this.updateBadgeForView();
    this.updateNavButtons();
  },

  updateBadgeForView() {
    const snap = this.posHistory[this.viewIdx];
    if (snap) this.updateBadge(snap.inBook);
  },

  hint() {
    if (this.over || this.thinking) return;
    if (this.viewIdx !== this.posHistory.length - 1) return;
    if (this.chess.turn() !== this.playerColor) return;
    const key = fenKey(this.chess.fen());
    const entry = this.book?.get(key);
    if (!entry) { toast(t('no_book_hint')); return; }
    const moves = Object.entries(entry);
    const bestSan = moves.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
    const c = new Chess(this.chess.fen());
    let mv;
    try { mv = c.move(bestSan); } catch { mv = null; }
    if (!mv) return;
    const sq = this.board.squares[mv.from];
    if (sq) { sq.classList.add('hintsq'); setTimeout(() => sq.classList.remove('hintsq'), 1500); }
    const comment = this.bookComments?.get(key + '|' + bestSan);
    toast(comment || t('no_book_comment'));
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
    const bookComments = new Map();
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
          if (child.comment) {
            const ck = key + '|' + child.san;
            if (!bookComments.has(ck)) bookComments.set(ck, child.comment);
          }
          walk(child, depth + 1);
        }
      };
      walk(tree.root, 0);
    }
    this.book = book;
    this.bookComments = bookComments;
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
    this.playerColor = segValue($('trainer-color'));
    this.level = +segValue($('trainer-level'));
    this.chess = new Chess();
    this.over = false;
    this.inBook = true;
    this.announcedOpening = null;
    this.posHistory = [];
    this.viewIdx = -1;
    $('trainer-setup').classList.add('hidden');
    $('trainer-game').classList.remove('hidden');
    this.board.setOrientation(this.playerColor);
    this.place(this.chess.fen(), null, true);
    this.renderMoves();
    this.setLiveInteractive(true);
    this.setStatus(t('your_turn'));
    if (this.chess.turn() !== this.playerColor) this.computerMove();
  },

  setStatus(msg) { $('trainer-status').textContent = msg; },

  // Sets whether the board should be interactive once the player is
  // viewing the live (most recent) position — and applies it immediately
  // if so, matching the Puzzles nav pattern.
  setLiveInteractive(v) {
    this.liveInteractive = v;
    if (this.viewIdx === this.posHistory.length - 1) this.board.interactive = v;
  },

  updateBadge(usedBook) {
    const el = $('trainer-book-status');
    el.textContent = usedBook ? t('in_book') : t('out_of_book');
    el.className = 'book-badge ' + (usedBook ? 'in' : 'out');
  },

  announceOpeningIfNew() {
    const name = classifyOpening(this.chess.history());
    if (!name || name === this.announcedOpening) return;
    this.announcedOpening = name;
    KaelQuotes.show({ text: openingFlavorMsg(name), author: null }, 5500);
  },

  async userMove(mv) {
    if (this.over || this.thinking) return;
    if (this.viewIdx !== this.posHistory.length - 1) return;
    if (this.chess.turn() !== this.playerColor) return;
    let m;
    try { m = this.chess.move(mv); } catch { return; }
    this.place(this.chess.fen(), { from: m.from, to: m.to }, this.inBook);
    this.renderMoves();
    this.announceOpeningIfNew();
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
    this.setLiveInteractive(false);
    const bookSan = this.pickBookMove();
    try {
      if (bookSan) {
        await sleep(450);
        let m;
        try { m = this.chess.move(bookSan); } catch { m = null; }
        if (m) {
          this.inBook = true;
          this.place(this.chess.fen(), { from: m.from, to: m.to }, true, 'green');
          this.renderMoves();
          this.announceOpeningIfNew();
          if (this.checkEnd()) return;
          this.setStatus(t('your_turn'));
          return;
        }
      }
      // out of book → engine
      const justLeftBook = this.inBook;
      this.inBook = false;
      this.setStatus(t('thinking'));
      const lv = LEVELS[this.level];
      const uci = await engine.bestMove(this.chess.fen(), { movetime: lv.movetime, elo: lv.elo });
      if (!uci || this.over) return;
      const m = this.chess.move(uciToMove(uci));
      this.place(this.chess.fen(), { from: m.from, to: m.to }, false, justLeftBook ? 'yellow' : 'green');
      this.renderMoves();
      if (this.checkEnd()) return;
      this.setStatus(t('your_turn'));
    } catch (e) {
      this.setStatus('⚠️ ' + (e.message || e));
    } finally {
      this.thinking = false;
      this.setLiveInteractive(true);
    }
  },

  checkEnd() {
    if (this.chess.isCheckmate()) {
      const winner = this.chess.turn() === 'w' ? 'b' : 'w';
      const won = winner === this.playerColor;
      Sound.play(won ? 'game-win' : 'game-lose');
      this.finishMsg(won ? t('checkmate_win') : t('checkmate_loss'), won ? 'win' : 'loss');
      return true;
    }
    if (this.chess.isDraw() || this.chess.isStalemate()) { Sound.play('game-draw'); this.finishMsg(t('draw'), 'draw'); return true; }
    return false;
  },

  finishMsg(msg, result) {
    this.over = true;
    this.setStatus(msg);
    Streak.recordActivity();
    if (result) this.recordOpeningResult(result);
  },

  async recordOpeningResult(result) {
    // Track the radar by the opening actually reached on the board, not
    // by however the study base happens to be named — a base can mix
    // openings or be mislabeled, which would otherwise silently corrupt
    // the tracking.
    const openingName = classifyOpening(this.chess.history());
    if (!openingName) {
      KaelQuotes.show({ text: t('not_an_opening_msg'), author: null }, 5500);
      DailyMissions.complete('opening');
      return;
    }
    const elo = await db.kvGet('openingElo', {});
    const cur = elo[openingName] ?? 1200;
    const expected = 1 / (1 + Math.pow(10, (NOMINAL_PRACTICE_RATING - cur) / 400));
    const score = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
    elo[openingName] = Math.max(600, cur + 20 * (score - expected));
    await db.kvSet('openingElo', elo);
    const names = Object.keys(elo);
    const avg = names.reduce((s, k) => s + elo[k], 0) / names.length;
    await recordEloHistory('openingEloHistory', avg);
    DailyMissions.complete('opening');
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
    Analysis.loadTree(tree, { baseId: null, gameId: null, fromGameReview: true });
  },
};

function fenKey(fen) { return fen.split(' ').slice(0, 4).join(' '); }

// Colors a move in the notation when it carries a Game-Review-assigned
// quality NAG ($3 brilliant, $2 mistake, $4 blunder) — a plain " mv-xxx"
// suffix (or '') so it can be appended straight into a className string.
function nagMoveClass(nags) {
  if (nags.includes(4)) return ' mv-blunder';
  if (nags.includes(2)) return ' mv-mistake';
  if (nags.includes(3)) return ' mv-brilliant';
  return '';
}
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
  isDailyPuzzle: false,
  posHistory: [],             // [{fen, lastMove}] snapshots for the nav buttons
  viewIdx: -1,                 // index into posHistory currently shown on the board
  liveInteractive: false,      // whether the board should accept moves at the live position
  timerInterval: null,
  timerStart: 0,

  async init() {
    this.board = new Board($('puzzle-board'), { onMove: mv => this.userMove(mv), onSound: type => Sound.play(type) });
    $('puzzle-theme-btn').onclick = () => this.openThemePicker();
    $('puzzle-next').onclick = () => this.nextPuzzle();
    $('puzzle-hint').onclick = () => this.hint();
    $('puzzle-solution').onclick = () => this.showSolution();
    $('puzzle-share').onclick = () => this.shareProblem();
    $('puzzle-analyze').onclick = () => this.toAnalysis();
    $('puzzle-nav-first').onclick = () => this.gotoHistory(0);
    $('puzzle-nav-prev').onclick = () => this.gotoHistory(this.viewIdx - 1);
    $('puzzle-nav-next').onclick = () => this.gotoHistory(this.viewIdx + 1);
    $('puzzle-nav-last').onclick = () => this.gotoHistory(this.posHistory.length - 1);
    this.updateNavButtons();
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
    $('puzzle-progress').textContent = `${done} ${t('solved_count')}`;
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
    if (win && this.isDailyPuzzle) DailyMissions.complete('puzzle');
    Badges.checkNew();
  },

  // Shares the puzzle position itself — always available, regardless of
  // whether it's been solved yet.
  async shareProblem() {
    if (!this.current) return;
    const canvas = renderPuzzleCard(this.current, this.board.orientation);
    await shareCanvas(canvas, 'puzzle.png');
  },

  toAnalysis() {
    if (!this.current || !this.chess) return;
    const tree = treeFromHistory(this.current.fen, this.chess.history());
    tree.setHeader('Event', getLang() === 'es' ? 'Puzzle de táctica' : 'Tactics puzzle');
    engine.stop();
    Analysis.loadTree(tree, { baseId: null, gameId: null, fromGameReview: true });
  },

  startTimer() {
    this.stopTimer();
    this.timerStart = Date.now();
    const update = () => {
      const s = Math.floor((Date.now() - this.timerStart) / 1000);
      const mm = String(Math.floor(s / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      $('puzzle-timer').textContent = `⏱ ${mm}:${ss}`;
    };
    update();
    this.timerInterval = setInterval(update, 1000);
  },

  stopTimer() {
    clearInterval(this.timerInterval);
  },

  // Sets whether the board should be interactive once the user is viewing
  // the live (most recent) position — and applies it immediately if so.
  setLiveInteractive(v) {
    this.liveInteractive = v;
    if (this.viewIdx === this.posHistory.length - 1) this.board.interactive = v;
  },

  // Renders a move and records it in the browsable history.
  place(fen, lastMove) {
    this.board.setPosition(fen, lastMove);
    this.posHistory.push({ fen, lastMove });
    this.viewIdx = this.posHistory.length - 1;
    this.updateNavButtons();
  },

  updateNavButtons() {
    const atStart = this.viewIdx <= 0;
    const atEnd = this.viewIdx >= this.posHistory.length - 1;
    $('puzzle-nav-first').disabled = atStart;
    $('puzzle-nav-prev').disabled = atStart;
    $('puzzle-nav-next').disabled = atEnd;
    $('puzzle-nav-last').disabled = atEnd;
  },

  gotoHistory(idx) {
    if (!this.posHistory.length) return;
    idx = Math.max(0, Math.min(idx, this.posHistory.length - 1));
    this.viewIdx = idx;
    const snap = this.posHistory[idx];
    this.board.setPosition(snap.fen, snap.lastMove);
    const live = idx === this.posHistory.length - 1;
    this.board.interactive = live && this.liveInteractive;
    this.updateNavButtons();
  },

  nextPuzzle() {
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
    this.isDailyPuzzle = false;
    this.loadPuzzle(candidates[Math.floor(Math.random() * candidates.length)]);
  },

  loadPuzzle(puzzle) {
    $('puzzle-analyze').classList.add('hidden');
    this.current = puzzle;
    this.chess = new Chess(this.current.fen);
    this.moveIdx = 0;
    this.failedThis = false;
    this.eloRecorded = false;
    this.posHistory = [];
    this.viewIdx = -1;
    this.updateProgress();
    this.armCheckin();
    this.startTimer();
    // the first move in the list is the opponent's move — play it
    const playerColor = this.chess.turn() === 'w' ? 'b' : 'w';
    this.board.setOrientation(playerColor);
    this.place(this.chess.fen());
    this.setLiveInteractive(false);
    setTimeout(() => {
      const m = this.applyUci(this.current.moves[0]);
      this.moveIdx = 1;
      this.place(this.chess.fen(), m ? { from: m.from, to: m.to } : null);
      this.setLiveInteractive(true);
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
      this.place(this.chess.fen(), { from: m.from, to: m.to });
      if (this.moveIdx >= this.current.moves.length || isMate) {
        this.disarmCheckin();
        this.stopTimer();
        Sound.play('puzzle-correct');
        KaelQuotes.show(pickKael(KAEL_PRAISE), 4500);
        this.setStatus(t('solved'));
        if (!this.failedThis) {
          this.solved[this.current.id] = true;
          db.kvSet('puzzlesSolved', this.solved);
        }
        this.recordResult(!this.failedThis);
        this.updateProgress();
        $('puzzle-analyze').classList.remove('hidden');
        this.setLiveInteractive(false);
        return;
      }
      this.setStatus(t('correct'));
      // opponent reply
      this.setLiveInteractive(false);
      await sleep(400);
      const r = this.applyUci(this.current.moves[this.moveIdx]);
      this.moveIdx++;
      this.place(this.chess.fen(), r ? { from: r.from, to: r.to } : null);
      this.setLiveInteractive(true);
    } else {
      // wrong — undo, shake
      const firstMistake = !this.failedThis;
      this.chess.undo();
      this.failedThis = true;
      Sound.play('puzzle-wrong');
      if (firstMistake) KaelQuotes.show(pickKael(KAEL_MISTAKE), 4500);
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
    this.disarmCheckin();
    this.failedThis = true;
    this.stopTimer();
    this.recordResult(false);
    this.setLiveInteractive(false);
    while (this.moveIdx < this.current.moves.length) {
      const m = this.applyUci(this.current.moves[this.moveIdx]);
      this.moveIdx++;
      this.place(this.chess.fen(), m ? { from: m.from, to: m.to } : null);
      await sleep(700);
    }
    this.setStatus(t('solved'));
    $('puzzle-analyze').classList.remove('hidden');
    this.setLiveInteractive(true);
  },

  // If a puzzle sits unsolved for 5 minutes, Kael checks in rather than
  // leaving the player stuck silently.
  armCheckin() {
    this.disarmCheckin();
    this.checkinTimer = setTimeout(() => this.showCheckin(), 5 * 60 * 1000);
  },

  disarmCheckin() {
    clearTimeout(this.checkinTimer);
  },

  showCheckin() {
    if (!this.current || activeScreen !== 'puzzles') return;
    const msg = KAEL_CHECKIN[getLang()];
    modal((box, close) => {
      box.innerHTML = `<div class="kael-modal-head"><img src="icons/kael/kael-bust.png" class="kael-portrait" alt="Kael" style="width:90px;"></div>
        <div class="kael-bubble"><p>${esc(msg.text)}</p></div>`;
      const okBtn = document.createElement('button');
      okBtn.className = 'btn primary big'; okBtn.textContent = msg.okBtn;
      okBtn.onclick = () => { this.hint(); close(null); };
      const dismissBtn = document.createElement('button');
      dismissBtn.className = 'btn'; dismissBtn.style.marginTop = '8px';
      dismissBtn.textContent = msg.dismissBtn;
      dismissBtn.onclick = () => close(null);
      box.append(okBtn, dismissBtn);
    });
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
    this.board = new Board($('rush-board'), { onMove: mv => this.userMove(mv), onSound: type => Sound.play(type) });
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

// ═════════════════════ BLIND PUZZLES ═════════════════════
// Look at the position for 10s, then the pieces vanish — moves still work
// normally (Board only hides the <img>, it never gates interaction on
// visibility). "Peek" is the equivalent of a hint: reveal pieces for 5s.

const Blind = {
  board: null,
  current: null,
  chess: null,
  moveIdx: 0,
  peeksUsed: 0,
  peekedThis: false,
  failedThis: false,
  eloRecorded: false,
  countdownTimer: null,
  peekTimer: null,
  loaded: false,
  elo: 1200,
  hintWarningSeen: false,
  greetedThisOpen: false,

  init() {
    this.board = new Board($('blind-board'), { onMove: mv => this.userMove(mv), onSound: type => Sound.play(type) });
    $('puzzle-blind-open').onclick = () => this.open();
    $('blind-back').onclick = () => { this.cleanup(); showScreen('puzzles'); };
    $('blind-peek').onclick = () => this.peek();
    $('blind-solution').onclick = () => this.showSolution();
    $('blind-next').onclick = () => this.nextPuzzle();
    $('blind-share').onclick = () => this.share();
  },

  async ensureLoaded() {
    if (this.loaded) return;
    this.elo = await db.kvGet('blindfoldElo', 1200);
    this.hintWarningSeen = await db.kvGet('blindfoldHintWarningSeen', false);
    this.loaded = true;
  },

  updateEloBadge() {
    $('blind-elo').textContent = `${t('blindfold_elo')}: ${Math.round(this.elo)}`;
  },

  async open() {
    showScreen('blind');
    await this.ensureLoaded();
    this.updateEloBadge();
    this.greetedThisOpen = false;
    this.nextPuzzle();
  },

  cleanup() {
    clearTimeout(this.countdownTimer);
    clearTimeout(this.peekTimer);
    $('blind-countdown').classList.add('hidden');
  },

  recordResult(win) {
    if (this.eloRecorded || !this.current) return;
    this.eloRecorded = true;
    // Using a peek (hint) still earns ELO on a win, just less of it — the
    // point is to nudge people toward solving from memory, not punish them.
    const K = this.peekedThis ? 12 : 32;
    const expected = 1 / (1 + Math.pow(10, (this.current.rating - this.elo) / 400));
    const score = win ? 1 : 0;
    this.elo = Math.max(600, this.elo + K * (score - expected));
    db.kvSet('blindfoldElo', this.elo);
    this.updateEloBadge();
    recordEloHistory('blindfoldEloHistory', this.elo);
  },

  updateTurnIndicator() {
    if (!this.chess) return;
    const turnColor = this.chess.turn() === 'w' ? 'white' : 'black';
    $('blind-turn').textContent = `${t(turnColor)} ${t('to_move_short')}`;
  },

  nextPuzzle() {
    this.cleanup();
    $('blind-share').classList.add('hidden');
    const candidates = PUZZLES.filter(p => Math.abs(p.rating - this.elo) <= 300);
    const list = candidates.length ? candidates : PUZZLES;
    this.current = list[Math.floor(Math.random() * list.length)];
    this.chess = new Chess(this.current.fen);
    this.moveIdx = 0;
    this.peeksUsed = 0;
    this.peekedThis = false;
    this.failedThis = false;
    this.eloRecorded = false;
    const playerColor = this.chess.turn() === 'w' ? 'b' : 'w';
    this.board.setOrientation(playerColor);
    this.board.setPiecesHidden(false);
    this.board.setPosition(this.chess.fen());
    this.board.interactive = false;
    $('blind-status').textContent = t('blind_watch_now');
    this.updatePeekBtn();
    this.updateTurnIndicator();
    if (!this.greetedThisOpen) {
      this.greetedThisOpen = true;
      setTimeout(() => KaelQuotes.show(pickKael(KAEL_BLINDFOLD), 5000), 900);
    }
    setTimeout(() => {
      const m = this.applyUci(this.current.moves[0]);
      this.moveIdx = 1;
      this.board.setPosition(this.chess.fen(), m ? { from: m.from, to: m.to } : null);
      this.updateTurnIndicator();
      this.startCountdown(10, () => this.hidePieces());
    }, 500);
  },

  startCountdown(seconds, onDone) {
    let n = seconds;
    const el = $('blind-countdown');
    el.classList.remove('hidden');
    el.textContent = n;
    this.countdownTimer = setInterval(() => {
      n--;
      if (n <= 0) {
        clearInterval(this.countdownTimer);
        el.classList.add('hidden');
        onDone();
      } else {
        el.textContent = n;
      }
    }, 1000);
  },

  hidePieces() {
    this.board.setPiecesHidden(true);
    this.board.interactive = true;
    this.setStatus(t('blind_solve_now'));
  },

  async updatePeekBtn() {
    const { isMember } = await Membership.status();
    const btn = $('blind-peek');
    if (isMember) {
      btn.textContent = '👁 ' + t('blind_peek_btn');
      btn.disabled = false;
    } else {
      const left = Math.max(0, 2 - this.peeksUsed);
      btn.textContent = `👁 ${t('blind_peek_btn')} (${left})`;
      btn.disabled = left === 0;
    }
  },

  setStatus(msg) { $('blind-status').textContent = msg; },

  async peek() {
    if (!this.current) return;
    const { isMember } = await Membership.status();
    if (!isMember && this.peeksUsed >= 2) {
      toast(t('blind_no_peeks_toast'));
      return;
    }
    if (!this.hintWarningSeen) {
      this.hintWarningSeen = true;
      db.kvSet('blindfoldHintWarningSeen', true);
      const proceed = await modal((box, close) => {
        const msg = KAEL_HINT_WARNING[getLang()];
        box.innerHTML = `<h3>🦉 Kael</h3><p>${esc(msg.text)}</p>`;
        const row = document.createElement('div'); row.className = 'row';
        const ok = document.createElement('button'); ok.className = 'btn primary'; ok.textContent = msg.okBtn;
        const ca = document.createElement('button'); ca.className = 'btn'; ca.textContent = msg.dismissBtn;
        ok.onclick = () => close(true);
        ca.onclick = () => close(false);
        row.append(ok, ca);
        box.append(row);
      });
      if (!proceed) return;
    }
    this.peeksUsed++;
    this.peekedThis = true;
    this.updatePeekBtn();
    this.board.setPiecesHidden(false);
    this.board.interactive = false;
    clearTimeout(this.peekTimer);
    this.peekTimer = setTimeout(() => {
      this.board.setPiecesHidden(true);
      this.board.interactive = true;
    }, 5000);
  },

  applyUci(u) {
    try { return this.chess.move(uciToMove(u)); } catch { return null; }
  },

  async userMove(mv) {
    if (!this.current || this.moveIdx >= this.current.moves.length) return;
    const expected = this.current.moves[this.moveIdx];
    const tryUci = mv.from + mv.to + (mv.promotion ?? '');
    let m;
    try { m = this.chess.move(mv); } catch { return; }
    const isMate = this.chess.isCheckmate();
    if (tryUci === expected || (isMate && this.moveIdx === this.current.moves.length - 1)) {
      this.moveIdx++;
      this.board.setPosition(this.chess.fen(), { from: m.from, to: m.to });
      if (this.moveIdx >= this.current.moves.length || isMate) {
        clearTimeout(this.peekTimer);
        this.board.setPiecesHidden(false);
        Sound.play('puzzle-correct');
        KaelQuotes.show(pickKael(KAEL_PRAISE), 4500);
        this.setStatus(t('solved'));
        this.recordResult(true);
        $('blind-share').classList.remove('hidden');
        Streak.recordActivity();
        return;
      }
      this.setStatus(t('correct'));
      this.board.interactive = false;
      await sleep(400);
      const r = this.applyUci(this.current.moves[this.moveIdx]);
      this.moveIdx++;
      this.board.setPosition(this.chess.fen(), r ? { from: r.from, to: r.to } : null);
      this.board.interactive = true;
      this.updateTurnIndicator();
    } else {
      const firstMistake = !this.failedThis;
      this.failedThis = true;
      this.chess.undo();
      this.board.setPosition(this.chess.fen());
      Sound.play('puzzle-wrong');
      if (firstMistake) KaelQuotes.show(pickKael(KAEL_MISTAKE), 4500);
      this.setStatus(t('wrong_try'));
      $('blind-board').classList.add('shake');
      setTimeout(() => $('blind-board').classList.remove('shake'), 500);
    }
  },

  async showSolution() {
    if (!this.current) return;
    clearTimeout(this.peekTimer);
    this.recordResult(false);
    this.board.setPiecesHidden(false);
    this.board.interactive = false;
    while (this.moveIdx < this.current.moves.length) {
      const m = this.applyUci(this.current.moves[this.moveIdx]);
      this.moveIdx++;
      this.board.setPosition(this.chess.fen(), m ? { from: m.from, to: m.to } : null);
      await sleep(700);
    }
    this.setStatus(t('solved'));
  },

  share() {
    if (!this.current) return;
    shareStatCard({
      emoji: '🙈',
      title: t('card_blind_title'),
      subtitle: `${this.current.rating}`,
    }, 'puzzle-ciego.png');
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
    this.board = new Board($('endgame-board'), { onMove: mv => this.userMove(mv), onSound: type => Sound.play(type) });
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
      item.innerHTML = `<b>${esc(pos.name[getLang()])}</b>`;
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
    $('endgame-practice-start').classList.remove('hidden');
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
    this.bookMode = true;      // still replaying the book's move sequence
    this.moveIdx = 0;          // index into current.moves
    this.mistakes = 0;
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
    const preFen = this.chess.fen();
    const tryUci = mv.from + mv.to + (mv.promotion ?? '');
    let m;
    try { m = this.chess.move(mv); } catch { return; }
    const afterFen = this.chess.fen();

    if (!this.bookMode) {
      // Already off the book line — free play against the engine.
      this.board.setPosition(afterFen, { from: m.from, to: m.to });
      if (this.checkEnd()) return;
      this.engineReply();
      return;
    }

    const bookUci = this.current.moves[this.moveIdx];
    if (tryUci === bookUci) {
      this.moveIdx++;
      this.board.setPosition(afterFen, { from: m.from, to: m.to });
      Sound.play('puzzle-correct');
      if (this.moveIdx >= this.current.moves.length) { this.finishPractice(true); return; }
      this.playBookReply();
      return;
    }

    // A different move — check with the engine whether it's still sound
    // before treating it as a mistake.
    this.thinking = true;
    this.board.interactive = false;
    this.board.setPosition(afterFen, { from: m.from, to: m.to });
    this.setStatus(t('checking_move'));
    const bookChess = new Chess(preFen);
    let bookAfterFen = null;
    try { bookChess.move(uciToMove(bookUci)); bookAfterFen = bookChess.fen(); } catch { }
    const evalMine = await engine.evaluate(afterFen, 400);
    const evalBook = bookAfterFen ? await engine.evaluate(bookAfterFen, 400) : evalMine;
    this.thinking = false;
    const sign = this.playerColor === 'w' ? 1 : -1;
    const cpLoss = Math.max(0, sign * (evalBook - evalMine));
    if (cpLoss <= 50) {
      this.bookMode = false;
      Sound.play('puzzle-correct');
      KaelQuotes.show(pickKael(KAEL_ALT_MOVE), 4500);
      if (this.checkEnd()) return;
      this.board.interactive = true;
      this.setStatus(`${t('practice_you_are')} ${t(this.playerColor === 'w' ? 'white' : 'black')}`);
    } else {
      this.mistakes++;
      this.chess.undo();
      this.board.setPosition(preFen);
      Sound.play('puzzle-wrong');
      KaelQuotes.show(pickKael(KAEL_MISTAKE), 4500);
      this.setStatus(t('wrong_try'));
      $('endgame-board').classList.add('shake');
      setTimeout(() => $('endgame-board').classList.remove('shake'), 500);
      this.board.interactive = true;
    }
  },

  async playBookReply() {
    this.board.interactive = false;
    this.setStatus(t('correct'));
    await sleep(400);
    const bookUci = this.current.moves[this.moveIdx];
    let mv;
    try { mv = this.chess.move(uciToMove(bookUci)); } catch { mv = null; }
    if (!mv) { this.finishPractice(true); return; }
    this.moveIdx++;
    this.board.setPosition(this.chess.fen(), { from: mv.from, to: mv.to });
    if (this.checkEnd()) return;
    if (this.moveIdx >= this.current.moves.length) { this.finishPractice(true); return; }
    this.board.interactive = true;
    this.setStatus(`${t('practice_you_are')} ${t(this.playerColor === 'w' ? 'white' : 'black')}`);
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
      this.finishPractice(winner === this.playerColor);
      return true;
    }
    if (this.chess.isDraw() || this.chess.isStalemate()) { this.finishPractice(true); return true; }
    return false;
  },

  undo() {
    if (this.thinking || this.bookMode) return;
    if (this.chess.turn() !== this.playerColor) return;
    if (this.chess.history().length < 2) return;
    this.chess.undo();
    this.chess.undo();
    this.over = false;
    this.board.interactive = true;
    this.board.setPosition(this.chess.fen());
    this.setStatus(`${t('practice_you_are')} ${t(this.playerColor === 'w' ? 'white' : 'black')}`);
  },

  // success: true (completed the technique — full book line, an approved
  // alternative that reached a natural end, or checkmate/draw along the way)
  // or false (resigned, or lost after leaving the book line).
  finishPractice(success) {
    this.over = true;
    Sound.play(success ? 'game-win' : 'game-lose');
    this.setStatus(success ? t('practice_win') : t('practice_fail'));
    $('endgame-share').classList.toggle('hidden', !success);
    const cat = this.current.category;
    const cur = this.elo[cat] ?? 1200;
    const expScore = 1 / (1 + Math.pow(10, (NOMINAL_PRACTICE_RATING - cur) / 400));
    // A perfect replay scores a full point; each mistake made along the way
    // chips away at the credit, down to zero (same as an outright fail).
    const score = success ? Math.max(0, 1 - this.mistakes * 0.34) : 0;
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

// ═════════════════════ LEARN ═════════════════════

const Learning = {
  board: null,
  category: null,
  lessons: [],
  lessonIdx: 0,
  practicing: false,
  practiceFen: null,
  vsEngine: false,
  chess: null,
  thinking: false,
  demoIdx: 0,
  demoTimer: null,
  progressEvals: [],
  hintCooldown: 0,

  init() {
    this.board = new Board($('learn-board'), {
      interactive: false,
      onMove: mv => this.checkPracticeMove(mv),
      onSound: type => Sound.play(type),
    });
    $('learn-back-cat').onclick = () => this.showCategories();
    $('learn-back-lessons').onclick = () => this.openCategory(this.category);
    $('learn-prev-lesson').onclick = () => this.openLesson(this.lessonIdx - 1);
    $('learn-next-lesson').onclick = () => this.openLesson(this.lessonIdx + 1);
    $('learn-practice-btn').onclick = () => this.startPractice();
    $('learn-demo-prev').onclick = () => this.demoStep(-1);
    $('learn-demo-next').onclick = () => this.demoStep(1);
    $('learn-demo-play').onclick = () => this.demoTogglePlay();
  },

  showCategories() {
    $('learn-cat-view').classList.remove('hidden');
    $('learn-lesson-list-view').classList.add('hidden');
    $('learn-lesson-view').classList.add('hidden');
    const el = $('learn-cat-list');
    el.innerHTML = '';
    for (const cat of LEARNING_CATEGORIES) {
      const item = document.createElement('button');
      item.className = 'list-item';
      item.innerHTML = `<b>${esc(cat.title[getLang()])}</b><span class="sub">${cat.lessons.length} ${t('lessons_count')}</span>`;
      item.onclick = () => this.openCategory(cat);
      el.appendChild(item);
    }
  },

  openCategory(cat) {
    this.category = cat;
    $('learn-cat-view').classList.add('hidden');
    $('learn-lesson-list-view').classList.remove('hidden');
    $('learn-lesson-view').classList.add('hidden');
    $('learn-cat-title').textContent = cat.title[getLang()];
    this.lessons = cat.lessons;
    const el = $('learn-lesson-list');
    el.innerHTML = '';
    cat.lessons.forEach((lesson, i) => {
      const item = document.createElement('button');
      item.className = 'list-item';
      item.innerHTML = `<b>${esc(lesson.title[getLang()])}</b>`;
      item.onclick = () => this.openLesson(i);
      el.appendChild(item);
    });
  },

  openLesson(idx) {
    if (idx < 0 || idx >= this.lessons.length) return;
    this.lessonIdx = idx;
    const lesson = this.lessons[idx];
    $('learn-lesson-list-view').classList.add('hidden');
    $('learn-lesson-view').classList.remove('hidden');
    $('learn-lesson-title').textContent = lesson.title[getLang()];
    $('learn-lesson-text').textContent = lesson.text[getLang()];
    this.practicing = false;
    this.vsEngine = false;
    clearInterval(this.demoTimer);
    this.demoTimer = null;
    this.board.interactive = false;
    this.board.setOrientation('w');
    this.board.setPosition(lesson.fen);
    this.board.setShapes(lesson.shapes || { squares: [], arrows: [] });
    $('learn-practice-status').classList.add('hidden');
    $('learn-practice-btn').classList.toggle('hidden', !lesson.practice);
    $('learn-practice-btn').disabled = false;
    $('learn-prev-lesson').disabled = idx === 0;
    $('learn-next-lesson').disabled = idx === this.lessons.length - 1;
    if (lesson.demo) {
      $('learn-demo-nav').classList.remove('hidden');
      $('learn-demo-play').textContent = '▶️';
      this.demoIdx = 0;
      this.renderDemoStep();
    } else {
      $('learn-demo-nav').classList.add('hidden');
    }
    if (lesson.setupMove) {
      setTimeout(() => {
        if (this.lessons[this.lessonIdx] !== lesson) return;
        const c = new Chess(lesson.fen);
        let mv;
        try { mv = c.move(uciToMove(lesson.setupMove)); } catch { mv = null; }
        if (mv) this.board.setPosition(c.fen(), { from: mv.from, to: mv.to });
      }, 900);
    }
  },

  renderDemoStep() {
    const lesson = this.lessons[this.lessonIdx];
    const demo = lesson.demo;
    const c = new Chess(lesson.fen);
    let last = null;
    for (let i = 0; i < this.demoIdx; i++) last = c.move(uciToMove(demo.moves[i]));
    this.board.setPosition(c.fen(), last ? { from: last.from, to: last.to } : null);
    $('learn-demo-counter').textContent = `${this.demoIdx} / ${demo.moves.length}`;
    $('learn-demo-prev').disabled = this.demoIdx === 0;
    $('learn-demo-next').disabled = this.demoIdx === demo.moves.length;
  },

  demoStep(dir) {
    const lesson = this.lessons[this.lessonIdx];
    if (!lesson.demo) return;
    const next = this.demoIdx + dir;
    if (next < 0 || next > lesson.demo.moves.length) {
      clearInterval(this.demoTimer);
      this.demoTimer = null;
      $('learn-demo-play').textContent = '▶️';
      return;
    }
    this.demoIdx = next;
    this.renderDemoStep();
    if (this.demoIdx === lesson.demo.moves.length) {
      clearInterval(this.demoTimer);
      this.demoTimer = null;
      $('learn-demo-play').textContent = '▶️';
    }
  },

  demoTogglePlay() {
    if (this.demoTimer) {
      clearInterval(this.demoTimer);
      this.demoTimer = null;
      $('learn-demo-play').textContent = '▶️';
      return;
    }
    $('learn-demo-play').textContent = '⏸️';
    this.demoTimer = setInterval(() => this.demoStep(1), 900);
  },

  startPractice() {
    const lesson = this.lessons[this.lessonIdx];
    if (!lesson.practice) return;
    clearInterval(this.demoTimer);
    this.demoTimer = null;
    this.practicing = true;
    this.practiceFen = lesson.practice.fen || lesson.fen;
    this.board.setShapes({ squares: [], arrows: [] });
    $('learn-practice-status').classList.remove('hidden');
    $('learn-practice-status').classList.remove('good', 'bad');
    if (lesson.practice.vsEngine) {
      this.vsEngine = true;
      this.chess = new Chess(this.practiceFen);
      this.thinking = false;
      this.progressEvals = [];
      this.hintCooldown = 0;
      this.board.setOrientation(this.practiceFen.split(' ')[1]);
      this.board.setPosition(this.chess.fen());
      this.board.interactive = true;
      $('learn-practice-status').textContent = t('learn_practice_prompt');
      return;
    }
    this.vsEngine = false;
    this.board.setPosition(this.practiceFen);
    this.board.interactive = true;
    $('learn-practice-status').textContent = t('learn_practice_prompt');
  },

  checkPracticeMove(mv) {
    if (!this.practicing) return;
    if (this.vsEngine) { this.checkVsEngineMove(mv); return; }
    const lesson = this.lessons[this.lessonIdx];
    const p = lesson.practice;
    const chess = new Chess(this.practiceFen);
    let result;
    try { result = chess.move(mv); } catch { return; }
    let ok = true;
    if (p.from && result.from !== p.from) ok = false;
    if (p.to && result.to !== p.to) ok = false;
    if (p.requireCapture && !result.captured) ok = false;
    if (p.requireCastle && result.san !== 'O-O' && result.san !== 'O-O-O') ok = false;
    if (p.requireCheckmate && !chess.isCheckmate()) ok = false;
    const statusEl = $('learn-practice-status');
    statusEl.classList.remove('good', 'bad');
    if (ok) {
      this.board.setPosition(chess.fen(), { from: result.from, to: result.to });
      this.board.interactive = false;
      this.practicing = false;
      Sound.play('puzzle-correct');
      statusEl.textContent = t('learn_correct');
      statusEl.classList.add('good');
    } else {
      Sound.play('puzzle-wrong');
      this.board.setPosition(this.practiceFen);
      statusEl.textContent = t('learn_try_again');
      statusEl.classList.add('bad');
      $('learn-board').classList.add('shake');
      setTimeout(() => $('learn-board').classList.remove('shake'), 500);
    }
  },

  async checkVsEngineMove(mv) {
    if (this.thinking) return;
    const playerColor = this.practiceFen.split(' ')[1];
    if (this.chess.turn() !== playerColor) return;
    let result;
    try { result = this.chess.move(mv); } catch { return; }
    const statusEl = $('learn-practice-status');
    statusEl.classList.remove('good', 'bad');
    this.board.setPosition(this.chess.fen(), { from: result.from, to: result.to });
    if (this.chess.isCheckmate()) {
      this.board.interactive = false;
      this.practicing = false;
      Sound.play('puzzle-correct');
      statusEl.textContent = t('learn_correct');
      statusEl.classList.add('good');
      return;
    }
    if (this.chess.isDraw() || this.chess.isStalemate()) {
      Sound.play('puzzle-wrong');
      this.chess = new Chess(this.practiceFen);
      this.board.setPosition(this.chess.fen());
      statusEl.textContent = t('learn_try_again');
      statusEl.classList.add('bad');
      $('learn-board').classList.add('shake');
      setTimeout(() => $('learn-board').classList.remove('shake'), 500);
      return;
    }
    await this.checkProgress(playerColor);
    this.engineReply();
  },

  // Tracks whether the player's own evaluation (from their side) is
  // actually improving over a longer stretch of their own moves. Endgame
  // technique naturally has quiet/waiting moves and more than one correct
  // path, so this only speaks up when progress has been flat for a while —
  // and never once the position is already close to winning outright,
  // since cp scores saturate near mate even while the technique is being
  // executed perfectly (that false "no progress" reading was the bug
  // behind Kael nagging about the two-bishop barrier when it was already
  // being applied correctly).
  async checkProgress(playerColor) {
    if (this.thinking) return;
    const lesson = this.lessons[this.lessonIdx];
    if (!lesson.hint) return;
    const sign = playerColor === 'w' ? 1 : -1;
    let raw;
    try { raw = await engine.evaluate(this.chess.fen(), 200); } catch { return; }
    const evalForPlayer = sign * raw;
    this.progressEvals.push(evalForPlayer);
    if (this.hintCooldown > 0) { this.hintCooldown--; return; }
    const WINDOW = 8;
    if (this.progressEvals.length < WINDOW) return;
    const recent = this.progressEvals.slice(-WINDOW);
    if (recent.some(v => v >= 700)) return; // already clearly winning — nothing useful to say
    const delta = recent[WINDOW - 1] - recent[0];
    if (delta < 15) {
      KaelQuotes.show({ text: lesson.hint[getLang()], author: null }, 5500);
      this.hintCooldown = 8;
    }
  },

  async engineReply() {
    this.thinking = true;
    this.board.interactive = false;
    const statusEl = $('learn-practice-status');
    statusEl.textContent = t('thinking');
    try {
      const uci = await engine.bestMove(this.chess.fen(), { movetime: 500 });
      if (!this.practicing || !uci) return;
      const m = this.chess.move(uciToMove(uci));
      this.board.setPosition(this.chess.fen(), { from: m.from, to: m.to });
      if (this.chess.isCheckmate() || this.chess.isDraw() || this.chess.isStalemate()) {
        Sound.play('puzzle-wrong');
        this.chess = new Chess(this.practiceFen);
        this.board.setPosition(this.chess.fen());
        statusEl.textContent = t('learn_try_again');
        statusEl.classList.add('bad');
        return;
      }
      statusEl.textContent = t('learn_practice_prompt');
    } finally {
      this.thinking = false;
      this.board.interactive = true;
    }
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
    // sound
    const lSound = document.createElement('label'); lSound.className = 'fld-label'; lSound.textContent = t('sound_setting');
    const segSound = document.createElement('div'); segSound.className = 'seg';
    for (const [v, key] of [['on', 'sound_on'], ['off', 'sound_off']]) {
      const b = document.createElement('button');
      b.textContent = t(key); b.dataset.v = v;
      if ((Sound.enabled ? 'on' : 'off') === v) b.classList.add('on');
      segSound.appendChild(b);
    }
    segInit(segSound, v => Sound.setEnabled(v === 'on'));
    box.append(lSound, segSound);
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
    // legal
    const lLegal = document.createElement('label'); lLegal.className = 'fld-label'; lLegal.textContent = t('legal_section');
    const termsBtn = document.createElement('button'); termsBtn.className = 'btn'; termsBtn.textContent = t('view_terms');
    termsBtn.onclick = () => openLegalModal(LEGAL_TERMS);
    const privacyBtn = document.createElement('button'); privacyBtn.className = 'btn'; privacyBtn.textContent = t('view_privacy');
    privacyBtn.onclick = () => openLegalModal(LEGAL_PRIVACY);
    const legalRow = document.createElement('div'); legalRow.className = 'row wrap';
    legalRow.append(termsBtn, privacyBtn);

    const about = document.createElement('p'); about.className = 'hint'; about.textContent = t('about');
    const ok = document.createElement('button'); ok.className = 'btn primary'; ok.textContent = t('close');
    ok.onclick = () => close(null);
    box.append(l1, seg, l2, seg2, l3, seg3, l4, seg4, lLegal, legalRow, about, ok);
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
  // free
  { id: 'pawn_w' }, { id: 'pawn_b' }, { id: 'knight_w' }, { id: 'knight_b' },
  { id: 'bishop_w' }, { id: 'bishop_b' }, { id: 'rook_w' }, { id: 'rook_b' },
  { id: 'queen_w' }, { id: 'king_w' }, { id: 'king_b' },
  { id: 'wolf' }, { id: 'fox' }, { id: 'lion' }, { id: 'tiger' },
  { id: 'eagle' }, { id: 'owl' }, { id: 'bear' }, { id: 'raven' },
  // member-only
  { id: 'dragon', member: true }, { id: 'phoenix', member: true }, { id: 'griffin', member: true },
  { id: 'kraken', member: true }, { id: 'hydra', member: true }, { id: 'galaxy', member: true },
  { id: 'crystal', member: true }, { id: 'shadow', member: true }, { id: 'storm', member: true },
  { id: 'fire', member: true }, { id: 'ice', member: true }, { id: 'void', member: true },
];

function avatarHtml(avatarId, sizePx = 40) {
  const opt = AVATAR_OPTIONS.find(a => a.id === avatarId) ?? AVATAR_OPTIONS[0];
  return `<div class="avatar-badge" style="width:${sizePx}px;height:${sizePx}px"><img src="avatars/${opt.id}.png" alt="" width="${sizePx}" height="${sizePx}"></div>`;
}

const Avatars = {
  async renderGridInto(container, selectedId, onPick) {
    container.innerHTML = '';
    const { isMember } = await Membership.status();
    for (const opt of AVATAR_OPTIONS) {
      const locked = opt.member && !isMember;
      const cell = document.createElement('div');
      cell.className = 'avatar-pick-cell' + (locked ? ' locked' : '');
      cell.dataset.id = opt.id;
      cell.classList.toggle('selected', opt.id === selectedId);
      cell.innerHTML = avatarHtml(opt.id, 44) + (locked ? '<span class="avatar-lock">🔒</span>' : '');
      cell.onclick = () => { if (locked) Membership.openModal(); else onPick(opt.id); };
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
  return isMember ? `<img class="member-badge" src="icons/member-badge.png" alt="" title="${t('member_badge_title')}">` : '';
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
  // beating the engine, per difficulty level + one for sweeping all of them
  ...LEVELS.map((lv, i) => ({
    id: 'beat_engine_' + i, icon: '🤖',
    label: lang => `${lang === 'en' ? 'Beat' : 'Venció a'} ${t('level_names')[i]}`,
    check: s => !!s.engineLevelsBeaten[i],
  })),
  { id: 'beat_engine_all', icon: '👑', name: { es: 'Venció a todos los niveles del motor', en: 'Beat Every Engine Level' }, check: s => LEVELS.every((lv, i) => !!s.engineLevelsBeaten[i]) },
  // daily missions streak
  { id: 'daily_1', icon: '🎯', name: { es: 'Primera misión diaria', en: 'First Daily Mission' }, check: s => s.bestDailyMissionStreak >= 1 },
  { id: 'daily_7', icon: '🎯', name: { es: 'Misión diaria: 1 semana', en: 'Daily Mission: 1 Week' }, check: s => s.bestDailyMissionStreak >= 7 },
  { id: 'daily_30', icon: '🎯', name: { es: 'Misión diaria: 1 mes', en: 'Daily Mission: 1 Month' }, check: s => s.bestDailyMissionStreak >= 30 },
  { id: 'daily_180', icon: '⚡', name: { es: 'Misión diaria: 6 meses', en: 'Daily Mission: 6 Months' }, check: s => s.bestDailyMissionStreak >= 180 },
  { id: 'daily_365', icon: '👑', name: { es: 'Misión diaria: 1 año', en: 'Daily Mission: 1 Year' }, check: s => s.bestDailyMissionStreak >= 365 },
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
      engineLevelsBeaten: await db.kvGet('engineLevelsBeaten', {}),
      bestDailyMissionStreak: await db.kvGet('bestDailyMissionStreak', 0),
    };
  },

  async checkNew() {
    this.earned = await db.kvGet('earnedBadges', {});
    const state = await this.gatherState();
    let changed = false;
    const newlyEarned = [];
    for (const def of BADGE_DEFS) {
      if (!this.earned[def.id] && def.check(state)) {
        this.earned[def.id] = Date.now();
        changed = true;
        newlyEarned.push(def);
      }
    }
    newlyEarned.forEach((def, i) => {
      setTimeout(() => {
        KaelQuotes.show({
          title: '🏆 ' + t('badge_earned'),
          text: badgeLabel(def),
          image: `icons/badges/${def.id}.png`,
        }, 5000);
      }, i * 5200);
    });
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
      cell.innerHTML = `<div class="badge-icon"><img src="icons/badges/${def.id}.png" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode('${def.icon}'))"></div><div class="badge-name">${esc(label)}</div>`;
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
    $('profile-elo-blindfold-card').onclick = () => openEloHistoryModal('blindfoldEloHistory', 'blindfold_elo');
    $('profile-leaderboard-btn').onclick = () => Leaderboard.open();
    $('profile-member-btn').onclick = () => Membership.openModal();
    $('profile-share-streak').onclick = () => shareStatCard({
      emoji: '🔥',
      title: t('card_streak_title').replace('{n}', Streak.count),
      subtitle: t('card_streak_subtitle'),
    }, 'racha.png');
    Auth.onChange(() => this.renderAccount());
  },

  // Picking an icon here saves immediately (no Save step) — the username
  // is set once at account creation and can't be changed, so avatar is the
  // only thing left to edit.
  openEditModal() {
    return modal((box, close) => {
      box.innerHTML = `<h3>${t('edit_profile_title')}</h3>`;

      const grid = document.createElement('div');
      grid.className = 'trophy-grid';
      box.appendChild(grid);

      const closeBtn = document.createElement('button');
      closeBtn.className = 'btn'; closeBtn.style.marginTop = '14px';
      closeBtn.textContent = t('close');
      closeBtn.onclick = () => close(null);
      box.appendChild(closeBtn);

      (async () => {
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
    await cleanStaleOpenings();
    await this.renderAccount();
    await this.renderMemberCard();
    await Avatars.refresh();
    await DailyMissions.init();
    await Badges.checkNew();
    Badges.renderTrophyCase();
    this.renderStreakTimeline();

    const puzzleElo = await db.kvGet('puzzleElo', 1200);
    const themeElo = await db.kvGet('puzzleThemeElo', {});
    const openingElo = await db.kvGet('openingElo', {});
    const endgameElo = await db.kvGet('endgameElo', {});
    const blindfoldElo = await db.kvGet('blindfoldElo', 1200);

    const openingNames = Object.keys(openingElo);
    const openingAvg = openingNames.length
      ? openingNames.reduce((s, k) => s + openingElo[k], 0) / openingNames.length : 1200;
    const endgameNames = ENDGAME_CATEGORIES.filter(c => endgameElo[c] != null);
    const endgameAvg = endgameNames.length
      ? endgameNames.reduce((s, c) => s + endgameElo[c], 0) / endgameNames.length : 1200;

    $('profile-elo-puzzle').textContent = Math.round(puzzleElo);
    $('profile-elo-opening').textContent = openingNames.length ? Math.round(openingAvg) : '—';
    $('profile-elo-endgame').textContent = endgameNames.length ? Math.round(endgameAvg) : '—';
    $('profile-elo-blindfold').textContent = Math.round(blindfoldElo);

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
    const label = this.field === 'rushBestScore' ? t('rush_title')
      : this.field === 'blindfoldElo' ? t('blindfold_elo') : t('puzzle_elo');
    list.forEach((e, i) => {
      const value = this.field === 'rushBestScore' ? Math.round(e.rushBestScore ?? 0)
        : this.field === 'blindfoldElo' ? Math.round(e.blindfoldElo ?? 1200) : Math.round(e.puzzleElo ?? 1200);
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
    const blindfoldElo = entry.blindfoldElo ?? 1200;

    const openingNames = Object.keys(openingElo);
    const openingAvg = openingNames.length
      ? openingNames.reduce((s, k) => s + openingElo[k], 0) / openingNames.length : 1200;
    const endgameNames = ENDGAME_CATEGORIES.filter(c => endgameElo[c] != null);
    const endgameAvg = endgameNames.length
      ? endgameNames.reduce((s, c) => s + endgameElo[c], 0) / endgameNames.length : 1200;

    $('pubprofile-elo-puzzle').textContent = Math.round(puzzleElo);
    $('pubprofile-elo-opening').textContent = openingNames.length ? Math.round(openingAvg) : '—';
    $('pubprofile-elo-endgame').textContent = endgameNames.length ? Math.round(endgameAvg) : '—';
    $('pubprofile-elo-blindfold').textContent = Math.round(blindfoldElo);

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
  await Sound.init();
  applyStatic();
  Analysis.init();
  Base.init();
  Play.init();
  Trainer.init();
  Puzzles.init();
  Rush.init();
  Blind.init();
  Endgame.init();
  Learning.init();
  KaelQuotes.init();
  Profile.init();
  Leaderboard.init();
  PublicProfile.init();
  Setup.init();
  await Themes.init();
  await Streak.init();
  await DailyMissions.init();
  setTimeout(() => DailyMissions.remindIfIncomplete(), 45000);
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
    if (Blind.loaded) {
      Blind.elo = await db.kvGet('blindfoldElo', 1200);
      Blind.updateEloBadge();
    }
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
  setTimeout(async () => {
    $('splash').classList.add('hide');
    const onboarded = await Onboarding.maybeShow();
    if (!onboarded) setTimeout(() => KaelQuotes.showRandom(), 900);
  }, Math.max(0, 1500 - elapsed));
}

main().catch(e => { window.__mainError = (e && e.stack) || String(e); console.error('MAIN FAILED', e); });
