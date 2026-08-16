// Chess Training Center — main application.
import { Chess, validateFen } from '../vendor/chess.js';
import { t, tn, getLang, setLang, applyStatic } from './i18n.js';
import { GameTree, parsePgn, splitPgn, START_FEN, nagText } from './tree.js';
import { Board, parsePlacement, setPieceSet, getPieceSet } from './board.js';
import { Engine, uciToMove, pvWithNumbers, LEVELS } from './engine.js';
import * as db from './db.js';
import { PUZZLES, PUZZLE_THEMES, PUZZLE_PATTERNS, TRACKED_THEMES,
         BANDS as PUZZLE_BANDS, bandOf, loadBand, ensureForRating,
         puzzlesInBand } from './puzzles.js';
import { ENDGAMES, ENDGAME_CATEGORIES } from './endgames-data.js';
import { LEARNING_CATEGORIES } from './learning-data.js';
import { QUOTES, KAEL_LINES, KAEL_PRAISE, KAEL_MISTAKE, KAEL_CHECKIN, KAEL_BLINDFOLD, KAEL_HINT_WARNING, KAEL_GAME_REVIEW, KAEL_ALT_MOVE } from './quotes-data.js';
import { Auth, authErrorMessage, fetchLeaderboard } from './firebase.js';
import { LEGAL_TERMS, LEGAL_PRIVACY } from './legal-data.js';
import { classifyOpening, VALID_OPENING_NAMES } from './openings-eco.js';
import * as History from './history.js';
import { Sound } from './sound.js';
import { Themes, ColorMode } from './appearance.js';
import { AVATAR_OPTIONS, avatarHtml, Avatars } from './avatars.js';
import { BADGE_DEFS, badgeLabel, Badges } from './badges.js';
import { Leaderboard, PublicProfile } from './leaderboard.js';
import { Friends } from './friends.js';
import Tour from './tour.js';

// Free-tier usage limits — not membership-gated yet, but kept as named
// constants so they're easy to loosen for supporting users once that
// feature actually exists again.
// MAX_ENGINE_LINES is capped at 2, not 3: the bundled Stockfish "lite"
// single-threaded WASM build hits a fatal "unreachable" trap and dies
// when asked for MultiPV 3 — a binary-level limitation, not a bug in
// this file. Don't raise this without switching to a build that
// actually supports it.
const MAX_ENGINE_LINES = 2;
const MAX_DATABASES = 10;

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

export const $ = id => document.getElementById(id);
const engine = new Engine();

// The engine is a 7 MB WebAssembly download. When it fails — nearly always a
// dropped connection on mobile — the raw abort text ("Aborted(NetworkError:
// Failed to execute 'send' on 'XMLHttpRequest'...)") tells the player nothing.
function engineErrorText(e) {
  const raw = String(e && (e.message || e.reason || e)) || '';
  return /NetworkError|Aborted|wasm|fetch|Failed to load|504/i.test(raw)
    ? t('engine_download_failed')
    : (raw || t('engine_download_failed'));
}

// ═════════════════════ small UI helpers ═════════════════════

let toastTimer = null;
export function toast(msg, ms = 2200) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

export function modal(contentBuilder) {
  return new Promise(resolve => {
    const root = $('modal-root');
    const back = document.createElement('div');
    back.className = 'modal-back';
    const box = document.createElement('div');
    box.className = 'modal-box';
    back.appendChild(box);
    const close = (v) => { back.remove(); resolve(v); };
    back.addEventListener('click', e => { if (e.target === back) close(null); });
    // Some builders are async (Game Review analyses the whole game before it
    // can draw anything). Nothing awaits them, so a rejection inside one used
    // to escape to window.onunhandledrejection — which the crash guard turns
    // into a full-screen "something went wrong" over an app that is otherwise
    // fine. A broken dialog must never cost the user their session; report it
    // and leave the rest of the app alone.
    try {
      const built = contentBuilder(box, close);
      if (built && typeof built.catch === 'function') {
        built.catch(err => console.error('[modal] content builder failed', err));
      }
    } catch (err) {
      console.error('[modal] content builder failed', err);
    }
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

// Wraps a password input with a reveal button. Typing a password blind on a
// phone keyboard is the single most common cause of a failed sign-in, and it
// is worse on a confirm field where the user cannot tell the two apart.
function withPasswordToggle(input) {
  const wrap = document.createElement('div');
  wrap.className = 'pw-wrap';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pw-toggle';
  const sync = () => {
    const shown = input.type === 'text';
    btn.textContent = shown ? '🙈' : '👁';
    btn.setAttribute('aria-label', t(shown ? 'password_hide' : 'password_show'));
    btn.setAttribute('aria-pressed', String(shown));
  };
  btn.onclick = () => {
    input.type = input.type === 'password' ? 'text' : 'password';
    sync();
    input.focus();
  };
  sync();
  input.replaceWith(wrap);
  wrap.append(input, btn);
  return wrap;
}

// Blocking progress panel for a long import. Shown as a plain overlay rather
// than through modal(), because modal() resolves on close and this needs to
// stay up while the caller keeps working.
function importProgress(filename, onCancel) {
  const wrap = document.createElement('div');
  wrap.className = 'import-overlay';
  wrap.innerHTML =
    `<div class="import-card">
       <h3>${esc(t('importing'))}</h3>
       <p class="hint">${esc(filename)}</p>
       <div class="import-bar"><div class="import-bar-fill"></div></div>
       <p class="import-count"></p>
     </div>`;
  const cancel = document.createElement('button');
  cancel.className = 'btn';
  cancel.textContent = t('cancel');
  cancel.onclick = () => { cancel.disabled = true; onCancel(); };
  wrap.querySelector('.import-card').appendChild(cancel);
  document.body.appendChild(wrap);
  const fill = wrap.querySelector('.import-bar-fill');
  const count = wrap.querySelector('.import-count');
  return {
    update(imported, skipped, frac) {
      fill.style.width = Math.min(100, Math.round(frac * 100)) + '%';
      count.textContent = t('import_count')
        .replace('{n}', imported.toLocaleString())
        .replace('{s}', skipped.toLocaleString());
    },
    close() { wrap.remove(); },
  };
}

function askPassword(title) {
  return modal((box, close) => {
    box.innerHTML = `<h3>${title}</h3>`;
    const inp = document.createElement('input');
    inp.className = 'input'; inp.type = 'password';
    const row = document.createElement('div'); row.className = 'row';
    const ok = document.createElement('button'); ok.className = 'btn primary'; ok.textContent = t('ok');
    const ca = document.createElement('button'); ca.className = 'btn'; ca.textContent = t('cancel');
    ok.onclick = () => close(inp.value || null);
    ca.onclick = () => close(null);
    inp.onkeydown = e => { if (e.key === 'Enter') ok.click(); };
    row.append(ok, ca);
    box.append(inp, row);
    withPasswordToggle(inp);
    setTimeout(() => inp.focus(), 50);
  });
}

export function askConfirm(msg) {
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
export function sheet(items) {
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
      btn.textContent = `${b.name} (${b.count ?? 0} ${tn('games', b.count ?? 0)})`;
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
      if (type === 'password') withPasswordToggle(input);
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
  // The top tier is open-ended on purpose: a hard "-3000" ceiling reads as
  // fiction when the world number one sits around 2830.
  { id: 'master', min: 2301, max: 2700, color: '#eb5757', icon: '♛', openEnded: true },
];

function kaelRecoText(levelId) {
  if (levelId === 'beginner') return t('kael_reco_beginner');
  if (levelId === 'master') return t('kael_reco_master');
  return t('kael_reco_middle');
}

// Everything the tour needs from this file, handed over explicitly so the two
// modules do not import each other.
function tourCtx() {
  return { db, modal, toast, showScreen, activeScreen: () => activeScreen };
}

const Onboarding = {
  async maybeShow() {
    const done = await db.kvGet('onboardingDone', false);
    if (done) return false;
    await this.run();
    // Straight after the level picker, offer the guided tour. Declining is
    // remembered, so this is the only time it ever appears by itself.
    if (await db.kvGet('tourDone', null) === null) await Tour.offer(tourCtx());
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
              <span class="kael-level-range">ELO ${tier.min}-${tier.max}${tier.openEnded ? '+' : ''}</span>
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

export const KaelQuotes = {
  lastIdx: -1,
  timer: null,
  hideTimer: null,
  lastShownAt: 0,

  // Encouragement is decoration, not information. It used to fire on every
  // solved puzzle and every first mistake, which with auto-advance turned into
  // a bubble every few seconds. Chatter now has to clear both a quiet period
  // and a dice roll. Anything that actually tells the player something — a
  // badge, a mission, a hint they asked for — calls show() and always appears.
  MIN_GAP_MS: 90000,
  CHATTER_CHANCE: 0.25,

  // The action the current bubble runs when tapped. Null means "just dismiss",
  // which is what every caller except the daily-mission reminder wants.
  onTap: null,

  init() {
    // Tapping Kael is a toggle: shut him up if he is talking, summon him if he
    // is not. Re-rolling the quote out from under a half-read bubble is what
    // people complained about.
    $('kael-fab').onclick = () => {
      if ($('kael-bubble').classList.contains('show')) this.hide();
      else this.showRandom();
    };
    // The bubble only takes input while it is actually visible (CSS gives it
    // pointer-events only under .show) — see the note on #kael-corner.
    $('kael-bubble').onclick = () => {
      if (!$('kael-bubble').classList.contains('show')) return;
      const act = this.onTap;
      this.hide();
      if (act) act();
    };
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
    const cta = item.cta ? `<span class="kael-quote-cta">${esc(item.cta)}</span>` : '';
    const text = `${title}<p>${esc(item.text)}</p>${item.author ? `<span class="kael-quote-author">— ${esc(item.author)}</span>` : ''}${cta}`;
    // imageClass lets callers opt out of the square badge treatment — streak
    // art has variable widths and must be sized by height only.
    const imgClass = item.imageClass || 'kael-quote-badge';
    bubble.innerHTML = item.image
      ? `<div class="kael-quote-row"><img src="${item.image}" class="${imgClass}" alt=""><div>${text}</div></div>`
      : text;
    this.onTap = item.onTap || null;
    // A gold edge marks the rare bubble that goes somewhere, so it reads
    // differently from the ordinary ones that only dismiss.
    bubble.classList.toggle('actionable', !!this.onTap);
    bubble.classList.add('show');
    $('kael-corner').classList.add('speaking');    // slide in from the edge
    Sound.play('kael-pop');
    this.lastShownAt = Date.now();
    clearTimeout(this.timer);
    clearTimeout(this.hideTimer);
    this.timer = setTimeout(() => this.hide(), duration);
  },

  hide() {
    const bubble = $('kael-bubble');
    bubble.classList.remove('show');
    bubble.classList.remove('actionable');
    this.onTap = null;
    $('kael-corner').classList.remove('speaking');
    // Emptying it matters as much as fading it. The bubble kept its text after
    // hiding, so it went on holding its full ~184x136px of layout at opacity 0
    // — which is what made the corner of the screen dead to touch, and what
    // would otherwise stop Kael parking neatly off the edge.
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => { bubble.innerHTML = ''; }, 400);
  },

  // Optional flavour: skipped unless things have been quiet for a while, and
  // then only sometimes.
  chatter(item, duration = 4500) {
    if (Date.now() - this.lastShownAt < this.MIN_GAP_MS) return;
    if (Math.random() > this.CHATTER_CHANCE) return;
    this.show(item, duration);
  },

  showRandom() { this.show(this.pick()); },
};

// Picks a random line from a { es: [...], en: [...] } dict and wraps it in
// the { text, author } shape KaelQuotes.show() expects.
function pickKael(dict) {
  const lines = dict[getLang()];
  return { text: lines[Math.floor(Math.random() * lines.length)], author: null };
}

export async function sharePgnText(filename, text) {
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
// 26 rungs ending at 5 years. The art drives the ladder: the set is six plain
// flames turning red -> blue, then the pieces in order, and each phase runs as
// long as it has icons. A month is 30 days and a year 360, as everywhere else
// here. Nothing in this table is persisted -- storage holds streakCount and
// bestStreak only -- so rungs can be added or renamed freely. Note js/badges.js
// has its OWN unrelated STREAK_TIERS whose ids ARE storage; do not merge them.
const STREAK_TIERS = [
  { days: 1, icon: 'flame1', label: { es: '1 día', en: '1 day' } },
  { days: 7, icon: 'flame2', label: { es: '7 días', en: '7 days' } },
  { days: 15, icon: 'flame3', label: { es: '15 días', en: '15 days' } },
  { days: 30, icon: 'flame4', label: { es: '1 mes', en: '1 month' } },
  { days: 60, icon: 'flame5', label: { es: '2 meses', en: '2 months' } },
  { days: 120, icon: 'flame6', label: { es: '4 meses', en: '4 months' } },
  { days: 150, icon: 'pawn1', label: { es: '5 meses', en: '5 months' } },
  { days: 210, icon: 'pawn2', label: { es: '7 meses', en: '7 months' } },
  { days: 240, icon: 'pawn3', label: { es: '8 meses', en: '8 months' } },
  { days: 270, icon: 'pawn4', label: { es: '9 meses', en: '9 months' } },
  { days: 300, icon: 'pawn5', label: { es: '10 meses', en: '10 months' } },
  { days: 360, icon: 'pawn6', label: { es: '1 año', en: '1 year' } },
  { days: 420, icon: 'knight1', label: { es: '14 meses', en: '14 months' } },
  { days: 510, icon: 'knight2', label: { es: '17 meses', en: '17 months' } },
  { days: 600, icon: 'knight3', label: { es: '20 meses', en: '20 months' } },
  { days: 720, icon: 'knight4', label: { es: '2 años', en: '2 years' } },
  { days: 840, icon: 'bishop1', label: { es: '28 meses', en: '28 months' } },
  { days: 960, icon: 'bishop2', label: { es: '32 meses', en: '32 months' } },
  { days: 1020, icon: 'bishop3', label: { es: '34 meses', en: '34 months' } },
  { days: 1080, icon: 'bishop4', label: { es: '3 años', en: '3 years' } },
  { days: 1200, icon: 'rook1', label: { es: '40 meses', en: '40 months' } },
  { days: 1320, icon: 'rook2', label: { es: '44 meses', en: '44 months' } },
  { days: 1440, icon: 'rook3', label: { es: '4 años', en: '4 years' } },
  { days: 1560, icon: 'queen1', label: { es: '52 meses', en: '52 months' } },
  { days: 1680, icon: 'queen2', label: { es: '56 meses', en: '56 months' } },
  { days: 1800, icon: 'queen3', label: { es: '5 años', en: '5 years' } },
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
    const today = todayStr();
    // A stored date that is today or later is never a break. "Later" happens
    // exactly once per user: the old UTC day rule could file an evening
    // session under tomorrow, so the first launch after the local-time fix
    // must not read that as a missed day and wipe a live streak.
    if (this.lastDate && this.lastDate < today && !isYesterday(this.lastDate, today)) {
      // Write the 0. It used to live only in memory, so storage kept the old
      // number — and streakCount is one of the fields that syncs to the public
      // profile, which meant other players saw a streak that had already died.
      // bestStreak is deliberately untouched: the record still stands.
      this.count = 0;
      await db.kvSet('streakCount', 0);
    }
    this.render();
  },

  async recordActivity() {
    const today = todayStr();
    if (this.lastDate === today) { this.render(); return; }
    // Snapshot the tier before the count moves, so crossing into a new one is
    // a detectable event rather than a silent re-render. A broken-and-restarted
    // streak reads as a tier-up too (0 -> day 1), which is intentional — coming
    // back deserves the same acknowledgement as continuing.
    const prevTier = streakTierIndex(this.count);
    if (this.lastDate && isYesterday(this.lastDate, today)) this.count += 1;
    else this.count = 1;
    this.lastDate = today;
    await db.kvSet('streakCount', this.count);
    await db.kvSet('streakLastDate', this.lastDate);
    const best = await db.kvGet('bestStreak', 0);
    if (this.count > best) await db.kvSet('bestStreak', this.count);
    const newTier = streakTierIndex(this.count);
    const tierUp = newTier > prevTier;
    this.render({ tierUp });
    if (tierUp) this.celebrateTier(newTier);
    // Badge popups share the one Kael bubble, so hold them back when the tier
    // celebration is already using it.
    Badges.checkNew(tierUp ? 5400 : 0);
  },

  celebrateTier(tierIdx) {
    const tier = STREAK_TIERS[tierIdx];
    if (!tier) return;
    setTimeout(() => {
      KaelQuotes.show({
        title: '🔥 ' + t('streak_tier_up'),
        text: tier.label[getLang()],
        image: `streaks/${tier.icon}.png`,
        imageClass: 'kael-quote-streak',
      }, 5000);
    }, 400);
  },

  // tierUp is deliberately transient: the enlarged/glowing header icon marks
  // the moment it changed, then falls back to the compact status size on the
  // next render or app open.
  render({ tierUp = false } = {}) {
    const el = $('streak-badge');
    if (!el) return;
    el.innerHTML = `<img src="streaks/${streakIcon(this.count)}.png" alt="" class="streak-icon-img"><span>${this.count}</span>`;
    el.classList.toggle('zero', this.count === 0);
    el.classList.toggle('tier-up', tierUp);
  },
};

// ── What counts as "using the app today" ──────────────────
// The flame used to survive on a single tap: one puzzle answered wrong kept
// it alive. A day now needs real work, and the Profile streak card spells the
// whole list out (`streak_how_*` in js/i18n.js) — keep the two in step.
//
// On a board you have to play 10 moves of your own; everywhere else you have
// to actually succeed. `noteStreakMove` is shared by Play, Openings and
// Analysis: it counts one player move and hands off once the tenth lands.
// Deliberately `>=` rather than `===` so a session left open past midnight
// still records the new day — Streak.recordActivity() ignores repeat calls
// on a day it has already banked.
const STREAK_MIN_MOVES = 10;
const STREAK_MIN_RUSH_SOLVED = 3;

function noteStreakMove(obj) {
  obj.streakMoves = (obj.streakMoves || 0) + 1;
  if (obj.streakMoves >= STREAK_MIN_MOVES) Streak.recordActivity();
}

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

// Drawn from one whole rating band, never from "whatever is loaded" — the
// puzzle of the day has to be identical for every player in a tier, and the
// set of loaded bands varies by session.
async function puzzleOfDay(playerElo) {
  let tier = 0;
  for (let i = 1; i < PUZZLE_OF_DAY_BANDS.length - 1; i++) if (playerElo >= PUZZLE_OF_DAY_BANDS[i]) tier = i;
  const band = bandOf(PUZZLE_OF_DAY_BANDS[tier]);
  try { await loadBand(band); } catch { /* fall back to whatever is already loaded */ }
  const pool = puzzlesInBand(band);
  const list = pool.length ? pool : PUZZLES;
  if (!list.length) return null;
  // Sorted so the pick depends only on the band's contents, not on the order
  // bands happened to be appended in.
  const sorted = [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const seed = dailySeed(todayStr() + '_tier' + tier);
  return sorted[seed % sorted.length];
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
  // The three missions and where each one goes. The order is the order the
  // Profile card lists them in, and it is also cheapest-first — which is why
  // the reminder below names the first pending one.
  rows() {
    return [
      { key: 'puzzle', label: t('mission_puzzle'), go: () => this.goPuzzle() },
      { key: 'play', label: t('mission_play'), go: () => showScreen('play') },
      { key: 'opening', label: t('mission_opening'), go: () => showScreen('trainer') },
    ];
  },

  remindIfIncomplete() {
    if (this.reminded) return;
    this.reminded = true;
    const rows = this.rows();
    const next = rows.find(r => !this.done[r.key]);
    if (!next) return;
    const n = rows.filter(r => this.done[r.key]).length;
    const text = (n === 0 ? t('daily_missions_reminder_none') : t('daily_missions_reminder').replace('{n}', n))
      .replace('{task}', next.label);
    // Longer than a normal quote because this one is meant to be tapped, and
    // it always asks first — nobody should lose their screen by accident.
    KaelQuotes.show({
      text,
      author: null,
      cta: t('daily_missions_tap'),
      onTap: async () => {
        if (await askConfirm(`${esc(t('mission_go_confirm'))}<br><b>${esc(next.label)}</b>`)) next.go();
      },
    }, 12000);
  },

  render() {
    const el = $('daily-missions-list');
    if (!el) return;
    const streakEl = $('daily-missions-streak');
    if (streakEl) streakEl.textContent = this.streak > 0 ? `🔥 ${this.streak}` : '';
    const rows = this.rows();
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
    const daily = await puzzleOfDay(elo);
    if (!daily) { toast(t('puzzles_unavailable')); return; }
    Puzzles.loadPuzzle(daily);
    Puzzles.isDailyPuzzle = true;
  },
};

// The player's own calendar day, not UTC. toISOString() rolls over at 19:00 in
// Panama, so an evening session used to be filed under tomorrow — you could
// keep a streak alive on a day you never opened the app, and lose one on a day
// you did. Every dated key in the app goes through this function.
function todayStr() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
// 'YYYY-MM' — the season key for the monthly leaderboards.
export function monthStr() { return new Date().toISOString().slice(0, 7); }
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

const SCREENS = ['analysis', 'base', 'play', 'trainer', 'puzzles', 'setup', 'endgame', 'profile', 'leaderboard', 'public-profile', 'friends', 'friends-leaderboard', 'friends-blocked', 'rush', 'blind'];
export let activeScreen = 'analysis';

export function showScreen(name) {
  const prev = activeScreen;
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
  if (name !== 'blind') Blind.cleanup();
  if (name !== 'puzzles') Puzzles.disarmCheckin();
  // Leaving the Rush screen ends the run. Without this the clock kept ticking
  // on a hidden board and the run "finished" while the player was elsewhere.
  if (name !== 'rush') Rush.stop();
  if (name === 'puzzles' || name === 'blind' || name === 'rush') syncPuzzleModeSeg(name);
  if (name !== prev) pushTabHistory(name);
}

// ── tab history & swipe navigation ─────────────────────────────────────────
// Analysis is home. Every move to a different screen also pushes an entry into
// the browser history, so the Android back gesture arrives here as a popstate
// and walks back through the screens the user actually visited instead of
// closing the app on the first swipe. Once the stack is back down to Analysis
// none of our entries are left, so the next system back exits — the behaviour
// Android users expect from a home screen.
const HOME_SCREEN = 'analysis';
const tabStack = [HOME_SCREEN];
let poppingTab = false;

function pushTabHistory(name) {
  if (poppingTab) return;
  // Only mirror the stack once the history entry really exists, so the two can
  // never drift apart if pushState is refused (file:// and friends).
  try { history.pushState({ tab: name }, ''); } catch { return; }
  tabStack.push(name);
}

window.addEventListener('popstate', () => {
  if (tabStack.length <= 1) return; // nothing of ours left — the system back exits
  tabStack.pop();
  poppingTab = true;
  try { showScreen(tabStack[tabStack.length - 1]); } finally { poppingTab = false; }
});

function goBackTab() {
  if (tabStack.length > 1) history.back(); // the popstate handler above does the work
}

const TAB_ORDER = [...document.querySelectorAll('#tabbar button')].map(b => b.dataset.screen);

function goAdjacentTab(dir) {
  const i = TAB_ORDER.indexOf(activeScreen);
  if (i === -1) return; // a sub-screen (Rush, Blind, a public profile) — no neighbours
  const next = TAB_ORDER[i + dir];
  if (!next) return;
  showScreen(next);
  slideScreenIn(next, dir);
}

// Slides the arriving screen in from the side the swipe came from. Swiping
// left walks forward through the tab bar, so the new screen arrives from the
// right, and the other way round. Called after showScreen so the section is
// already visible when the animation starts.
function slideScreenIn(name, dir) {
  const el = $('screen-' + name);
  if (!el) return;
  el.classList.remove('from-right', 'from-left');
  void el.offsetWidth;   // restarts the animation when the same screen is swiped back to
  el.classList.add(dir > 0 ? 'from-right' : 'from-left');
}

// A gesture must not be stolen from anything that legitimately wants a
// horizontal drag: the board (piece dragging, which also takes pointer
// capture) and the sideways strips. The strips are named explicitly rather
// than detected, because whether they overflow depends on the language and on
// how many buttons the current state shows — a swipe that works on one phone
// and not the next is worse than one that never fires there. The walk below
// then catches any other real horizontal scroller.
const SWIPE_SAFE = '.board, .modal-back, .drag-ghost, input, textarea, select, ' +
  '.seg.scroll, .plog, #puzzle-actions, .nag-bar, .movelist';

function swipeBlocked(el) {
  if (!el || !el.closest) return true;
  if (el.closest(SWIPE_SAFE)) return true;
  // Stop at <main>: it is the page scroller and computes to overflow-x:auto
  // just because overflow-y is set, so any stray pixel of horizontal overflow
  // there would otherwise kill swiping across the whole app.
  for (let n = el; n && n !== document.body && n.tagName !== 'MAIN'; n = n.parentElement) {
    if (n.scrollWidth - n.clientWidth > 4) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
  }
  return false;
}

const SWIPE_EDGE = 28;   // px from a screen edge that counts as an edge swipe
const SWIPE_MIN = 60;    // px of horizontal travel before it counts as a swipe
let swipeStart = null;

// Deliberately pointer events, not touch events. A document-level touchstart /
// touchmove listener changes how the browser routes touch gestures, and that
// killed piece dragging on every board: the board sets `touch-action: none` on
// itself at pointerdown to claim the gesture, and once the page listens for
// touch the browser has already decided the gesture is a scroll and answers
// with pointercancel instead of pointermove. Pointer listeners take no part in
// that decision, and board.js is on pointer events already.
// A non-primary pointer is a second finger — a pinch or a zoom, never a swipe.
document.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'touch' || !e.isPrimary) { swipeStart = null; return; }
  swipeStart = swipeBlocked(e.target) ? null : { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId };
});

// The browser took the gesture over (a scroll started, or the piece drag on the
// board claimed it) — whatever it turned into, it is not a tab swipe.
document.addEventListener('pointercancel', () => { swipeStart = null; });

document.addEventListener('pointerup', e => {
  const start = swipeStart;
  swipeStart = null;
  if (!start || e.pointerId !== start.id) return;
  if (Date.now() - start.t > 700) return; // a slow drag is not a swipe
  const dx = e.clientX - start.x, dy = e.clientY - start.y;
  if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 2) return;
  // An inward swipe that starts at either edge is "back"; the same motion
  // started anywhere else steps to the neighbouring tab.
  const fromEdge = (start.x <= SWIPE_EDGE && dx > 0) ||
                   (start.x >= window.innerWidth - SWIPE_EDGE && dx < 0);
  if (fromEdge) goBackTab();
  else goAdjacentTab(dx < 0 ? 1 : -1);
});

// ── puzzle mode switcher ──
// The same segmented control sits on all three puzzle screens, so any mode can
// reach the others without going back out to the tab bar first.
function syncPuzzleModeSeg(mode) {
  document.querySelectorAll('.puzzle-modes').forEach(seg =>
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === mode)));
}

function openPuzzleMode(mode) {
  if (mode === 'blind') Blind.open();
  else if (mode === 'rush') Rush.openIntro();
  else showScreen('puzzles');
}

document.querySelectorAll('.puzzle-modes').forEach(seg => {
  seg.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) openPuzzleMode(b.dataset.v);
  });
});

document.querySelectorAll('#tabbar button').forEach(b =>
  b.addEventListener('click', () => showScreen(b.dataset.screen)));

// segment control helper
export function segInit(el, onChange) {
  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    el.querySelectorAll('button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    if (onChange) onChange(b.dataset.v);
  });
}
export function segValue(el) { return el.querySelector('button.on')?.dataset.v; }

// `rich` renders the Play tab's card grid — robot badge, name and strength
// range. Without it you get the compact button strip the Trainer tab uses.
function buildLevelSeg(el, def = 2, rich = false) {
  el.innerHTML = '';
  el.classList.toggle('lvgrid', rich);
  el.classList.toggle('seg', !rich);
  const names = t('level_names');
  LEVELS.forEach((lv, i) => {
    const b = document.createElement('button');
    b.dataset.v = i;
    if (rich) {
      b.innerHTML = `<img src="icons/badges/beat_engine_${i}.png" alt="" width="64" height="64">`
        + `<span class="lv-name">${esc(names[i])}</span>`
        + `<span class="lv-elo">${lv.range}</span>`;
    } else {
      b.textContent = (i + 1) + '·' + names[i];
    }
    if (i === def) b.classList.add('on');
    el.appendChild(b);
  });
}

// ═════════════════════ ANALYSIS ═════════════════════

export const Analysis = {
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
      // Moves accumulate across the whole session here, not per position — the
      // point of this tab is that you set a position up, push a few moves,
      // then set up another one. Ten moves in total is a day's use.
      onMove: (mv) => { if (this.tree.play(mv)) { noteStreakMove(this); this.refresh(); } },
      onShapesChange: (shapes) => { this.pushUndo(); this.tree.current.shapes = shapes; },
      onSound: type => Sound.play(type),
    });
    $('ana-first').onclick = () => { this.tree.toStart(); this.refresh(); };
    $('ana-prev').onclick = () => { this.tree.prev(); this.refresh(); };
    $('ana-next').onclick = () => { this.tree.next(); this.refresh(); };
    $('ana-last').onclick = () => { this.tree.toEnd(); this.refresh(); };
    $('ana-flip').onclick = () => this.board.flip();
    $('ana-engine-toggle').onclick = () => this.toggleEngine();
    $('ana-lines-minus').onclick = () => this.changeLines(-1);
    $('ana-lines-plus').onclick = () => this.changeLines(1);
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
    $('ana-hist-back').onclick = () => this.backToHistory();
    $('ana-hist-prev').onclick = () => this.gotoAdjacentHistory(-1);
    $('ana-hist-next').onclick = () => this.gotoAdjacentHistory(1);
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

    const inHist = !!this.ctx.historyId;
    $('ana-hist-nav').classList.toggle('hidden', !inHist);
    if (inHist) {
      // Keep the player oriented: they came from the Play tab, so that is the
      // tab that stays lit.
      document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.screen === 'play'));
      const idx = History.state.items.findIndex(g => g.id === this.ctx.historyId);
      $('ana-hist-prev').disabled = idx <= 0;
      $('ana-hist-next').disabled = idx === -1 || idx >= History.state.items.length - 1;
      const rec = History.state.items[idx];
      $('ana-hist-head').textContent = rec ? History.headline(rec) : '';
    }
  },

  backToHistory() {
    showScreen('play');
    History.open();
  },

  gotoAdjacentHistory(dir) {
    const idx = History.state.items.findIndex(g => g.id === this.ctx.historyId);
    if (idx === -1) return;
    const next = History.state.items[idx + dir];
    if (!next) return;
    History.openGame(next);
  },

  backToBase() {
    const baseId = this.ctx.baseId;
    showScreen('base');
    Base.openBase(baseId);
  },

  // Leaves the base-linked context without leaving the game on screen —
  // stays on this position, but as a normal, un-linked Analysis session.
  exitBase() {
    this.ctx = { baseId: null, gameId: null, historyId: null };
    showScreen('analysis');
    this.updateBaseNav();
  },

  // Leaves the "just analyzed this played game" context without discarding
  // the position on screen — same idea as exitBase() but for games that
  // arrived here via Game Review's "Analyze the game" button.
  exitGameReview() {
    this.ctx = { baseId: null, gameId: null, historyId: null };
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
          btn.textContent = `${b.name} (${b.count ?? 0} ${tn('games', b.count ?? 0)})`;
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
      if (!res.ok) throw new Error(res.status === 401 ? 'lichess_unavailable' : `Lichess: ${res.status}`);
      const data = await res.json();
      this.renderGameResults(data.topGames || [], 'lichess');
    } catch (e) {
      $('ana-games-status').textContent = '⚠️ ' + (e.message === 'lichess_unavailable' ? t('explore_lichess_unavailable') : (e.message || e));
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
  // linesCount is kept in memory (not re-read from the async db on every
  // click) so rapid +/- clicks can't race each other and silently drop a step.
  async toggleEngine() {
    this.engineOn = !this.engineOn;
    $('ana-engine').classList.toggle('hidden', !this.engineOn);
    $('ana-engine-toggle').classList.toggle('on', this.engineOn);
    if (this.engineOn) {
      $('ana-engine-lines').innerHTML = `<div class="engine-line">${t('loading')}</div>`;
      this.linesCount = Math.min(MAX_ENGINE_LINES, +(await db.kvGet('engineLines', 2)));
      this.updateLinesControl();
      engine.onLine = lines => this.showLines(lines);
      this.restartEngine();
      if (!(await db.kvGet('firstEngineUsed', false))) { await db.kvSet('firstEngineUsed', true); Badges.checkNew(); }
    } else {
      engine.stop();
    }
  },

  setLinesCount(n) {
    this.linesCount = n;
    this.updateLinesControl();
    if (this.engineOn) this.restartEngine();
  },

  changeLines(delta) {
    const next = Math.min(MAX_ENGINE_LINES, Math.max(1, (this.linesCount ?? 2) + delta));
    if (next === this.linesCount) return;
    db.kvSet('engineLines', next);
    this.setLinesCount(next);
  },

  updateLinesControl() {
    const n = this.linesCount ?? 2;
    $('ana-lines-count').textContent = n;
    $('ana-lines-minus').disabled = n <= 1;
    $('ana-lines-plus').disabled = n >= MAX_ENGINE_LINES;
  },

  restartEngine() {
    clearTimeout(this.restartTimer);
    clearTimeout(this._engineWatchdog);
    this._engineGen = (this._engineGen || 0) + 1;
    const gen = this._engineGen;
    const fen = this.tree.fen();
    this.restartTimer = setTimeout(async () => {
      const n = this.linesCount ?? Math.min(MAX_ENGINE_LINES, +(await db.kvGet('engineLines', 2)));
      engine.onLine = lines => this.showLines(lines);
      engine.analyse(fen, n).catch(err => {
        if (gen !== this._engineGen) return;
        $('ana-engine-lines').innerHTML = `<div class="engine-line">⚠️ ${esc(engineErrorText(err))}</div>`;
      });
      // Guards against a worker that spawns fine but never emits a single
      // analysis line — no crash event fires in that case, so without this
      // the "loading" placeholder would sit there forever with no way out.
      this._engineWatchdog = setTimeout(() => {
        if (gen !== this._engineGen || !this.engineOn) return;
        $('ana-engine-lines').innerHTML = `<div class="engine-line">⚠️ ${t('engine_timeout')} <button class="btn small" id="ana-engine-retry">${t('retry_btn')}</button></div>`;
        $('ana-engine-retry').onclick = () => this.restartEngine();
      }, 8000);
    }, 200);
  },

  pauseEngine() { if (this.engineOn) engine.stop(); },

  showLines(lines) {
    if (!this.engineOn || activeScreen !== 'analysis') return;
    clearTimeout(this._engineWatchdog);
    // Real analysis counts on its own, with no move requirement — but only
    // once the engine has actually returned a line, so flipping the toggle on
    // and off is not a free streak. Dated rather than a plain flag, or a
    // session left open overnight would never bank the new day. The engine
    // emits several lines a second, so the guard also keeps this cheap.
    if (this._streakEngineDate !== todayStr()) {
      this._streakEngineDate = todayStr();
      Streak.recordActivity();
    }
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
      { label: t('hist_view_pgn'), action: () => this.viewPgn() },
      { label: '🤖 ' + t('play_from_here'), action: () => Play.startFromFen(this.tree.fen()) },
    ];
    if (this.tree.current.san) {
      items.push({ label: '⬆️ ' + t('promote_var'), action: () => { this.pushUndo(); this.tree.promote(this.tree.current); this.refresh(); } });
      items.push({ label: '🗑 ' + t('delete'), action: () => this.deleteSubmenu(this.tree.current) });
    }
    if (this.ctx.historyId) {
      items.push({ label: t('hist_delete_game'), danger: true, action: async () => {
        if (await askConfirm(t('history_delete_confirm'))) {
          await db.deleteHistoryGame(this.ctx.historyId);
          this.ctx = { baseId: null, gameId: null, historyId: null };
          this.backToHistory();
        }
      } });
    }
    sheet(items);
  },

  // Copy and Export already exist; this is for actually reading the game text.
  viewPgn() {
    const text = this.tree.toPgn();
    modal((box, close) => {
      box.innerHTML = `<h3>PGN</h3>`;
      const pre = document.createElement('pre');
      pre.className = 'pgn-view';
      pre.textContent = text;
      box.appendChild(pre);
      const row = document.createElement('div');
      row.className = 'row';
      const copy = document.createElement('button');
      copy.className = 'btn primary';
      copy.textContent = t('copy_pgn');
      copy.onclick = () => copyText(text);
      const ok = document.createElement('button');
      ok.className = 'btn';
      ok.textContent = t('ok');
      ok.onclick = () => close(null);
      row.append(copy, ok);
      box.appendChild(row);
    });
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
  basesCache: [],
  filter: null,          // structured advanced-search criteria, or null
  filterResults: null,   // summaries matching `filter`, or null when unfiltered
  filterCapped: false,   // true when the result hit the row cap

  init() {
    $('base-new').onclick = async () => {
      const bases = await db.listBases();
      if (bases.length >= MAX_DATABASES) {
        toast(t('database_limit_toast').replace('{n}', MAX_DATABASES));
        return;
      }
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
    // Debounced: re-filtering on every keystroke means a full pass over the
    // base per character, which is imperceptible at 500 games and janky at
    // 60,000. A short pause costs nothing and only runs the filter once.
    $('game-search').addEventListener('input', debounce(() => {
      this.gamesShown = 0;                 // a new query starts from page one
      this.renderGames();
    }, 250));
    $('base-search').addEventListener('input', debounce(() => this.renderBases(), 150));
    $('game-advanced').onclick = () => this.openAdvanced();
  },

  // Structured filter over the fields a PGN header actually gives us. Elo, ECO
  // and material are deliberately absent: they are not stored, and inventing
  // them would mean re-parsing every game on import.
  openAdvanced() {
    modal((box, close) => {
      const f = this.filter ?? {};
      box.innerHTML = `<h3>${t('adv_search')}</h3>`;

      const mkInput = (labelKey, value = '', extra = {}) => {
        const wrap = document.createElement('div');
        const lab = document.createElement('label');
        lab.className = 'hint';
        lab.style.cssText = 'display:block; margin-bottom:2px;';
        lab.textContent = t(labelKey);
        const inp = document.createElement('input');
        inp.className = 'input';
        inp.value = value;
        Object.assign(inp, extra);
        wrap.append(lab, inp);
        return { wrap, inp };
      };

      const white = mkInput('adv_white', f.white ?? '');
      const black = mkInput('adv_black', f.black ?? '');
      box.append(white.wrap, black.wrap);

      const eitherRow = document.createElement('label');
      eitherRow.className = 'theme-pick-row';
      eitherRow.innerHTML = `<input type="checkbox"><span>${esc(t('adv_either'))}</span>`;
      const eitherCb = eitherRow.querySelector('input');
      eitherCb.checked = !!f.either;
      box.appendChild(eitherRow);

      const event = mkInput('adv_event', f.event ?? '');
      box.appendChild(event.wrap);

      const yearsLab = document.createElement('label');
      yearsLab.className = 'hint';
      yearsLab.style.cssText = 'display:block; margin:8px 0 2px;';
      yearsLab.textContent = t('adv_years');
      const grid = document.createElement('div');
      grid.className = 'adv-grid';
      const from = document.createElement('input');
      from.className = 'input'; from.type = 'number'; from.inputMode = 'numeric';
      from.placeholder = t('adv_from'); from.value = f.yearFrom ?? '';
      const to = document.createElement('input');
      to.className = 'input'; to.type = 'number'; to.inputMode = 'numeric';
      to.placeholder = t('adv_to'); to.value = f.yearTo ?? '';
      grid.append(from, to);
      box.append(yearsLab, grid);

      const resLab = document.createElement('label');
      resLab.className = 'hint';
      resLab.style.cssText = 'display:block; margin:10px 0 4px;';
      resLab.textContent = t('adv_result');
      const seg = document.createElement('div');
      seg.className = 'seg scroll';
      for (const [v, label] of [['', t('adv_any')], ['1-0', '1-0'], ['0-1', '0-1'], ['1/2-1/2', '½-½'], ['*', '*']]) {
        const b = document.createElement('button');
        b.dataset.v = v; b.textContent = label;
        if ((f.result ?? '') === v) b.classList.add('on');
        seg.appendChild(b);
      }
      if (!seg.querySelector('button.on')) seg.firstElementChild.classList.add('on');
      segInit(seg);
      box.append(resLab, seg);

      const row = document.createElement('div');
      row.className = 'row';
      row.style.marginTop = '12px';
      const apply = document.createElement('button');
      apply.className = 'btn primary'; apply.textContent = t('adv_apply');
      const clear = document.createElement('button');
      clear.className = 'btn'; clear.textContent = t('adv_clear');
      apply.onclick = () => {
        const next = {
          white: white.inp.value.trim(),
          black: black.inp.value.trim(),
          either: eitherCb.checked,
          event: event.inp.value.trim(),
          yearFrom: from.value.trim(),
          yearTo: to.value.trim(),
          result: segValue(seg) ?? '',
        };
        close(null);
        this.applyFilter(Object.values(next).some(v => v !== '' && v !== false) ? next : null);
      };
      clear.onclick = () => { close(null); this.applyFilter(null); };
      row.append(apply, clear);
      box.appendChild(row);
    });
  },

  // Runs the structured filter and caches the result for renderGames().
  //
  // Only `date` and `result` are served from an index: their semantics are
  // exact, so an index range means the same thing the user asked for. Name and
  // tournament matching is case- and accent-insensitive substring matching,
  // which an IndexedDB key range cannot express — using a prefix range there
  // would silently drop "Magnus" from "Carlsen, Magnus". Those are applied as
  // a predicate instead, either inside the index cursor or over the summaries
  // already in memory.
  async applyFilter(filter) {
    this.filter = filter;
    this.gamesShown = 0;
    if (!filter) {
      this.filterResults = null;
      this.renderFilterChip();
      this.renderGames();
      return;
    }

    const nq = s => normalizeSearch(s);
    const wantWhite = nq(filter.white), wantBlack = nq(filter.black);
    const wantEvent = nq(filter.event);
    const yFrom = filter.yearFrom, yTo = filter.yearTo;

    const match = (g) => {
      if (wantEvent && !nq(g.event).includes(wantEvent)) return false;
      if (filter.either) {
        // Either name may sit on either side of the board.
        for (const want of [wantWhite, wantBlack].filter(Boolean)) {
          if (!nq(g.white).includes(want) && !nq(g.black).includes(want)) return false;
        }
      } else {
        if (wantWhite && !nq(g.white).includes(wantWhite)) return false;
        if (wantBlack && !nq(g.black).includes(wantBlack)) return false;
      }
      // PGN dates are "YYYY.MM.DD"; a missing or "????" year fails a year filter.
      if (yFrom || yTo) {
        const year = parseInt(String(g.date ?? '').slice(0, 4), 10);
        if (!Number.isFinite(year)) return false;
        if (yFrom && year < +yFrom) return false;
        if (yTo && year > +yTo) return false;
      }
      if (filter.result && g.result !== filter.result) return false;
      return true;
    };

    const LIMIT = 2000;
    try {
      if (yFrom && yTo) {
        this.filterResults = await db.findGamesBy(this.currentBaseId, 'date',
          { from: String(yFrom), to: String(yTo) + '￿' }, { limit: LIMIT, match });
      } else if (filter.result) {
        this.filterResults = await db.findGamesBy(this.currentBaseId, 'result',
          { equals: filter.result }, { limit: LIMIT, match });
      } else {
        this.filterResults = this.gamesCache.filter(match).slice(0, LIMIT);
      }
    } catch (e) {
      // An index query can only fail if the upgrade did not run; falling back
      // to the in-memory pass keeps search working rather than showing nothing.
      this.filterResults = this.gamesCache.filter(match).slice(0, LIMIT);
    }
    this.filterResults.sort((a, b) => b.updatedAt - a.updatedAt);
    this.filterCapped = this.filterResults.length >= LIMIT;
    this.renderFilterChip();
    this.renderGames();
  },

  renderFilterChip() {
    const el = $('game-filter-chip');
    el.classList.toggle('hidden', !this.filter);
    if (!this.filter) return;
    const f = this.filter;
    const bits = [];
    if (f.white) bits.push((f.either ? '' : '⚪ ') + f.white);
    if (f.black) bits.push((f.either ? '' : '⚫ ') + f.black);
    if (f.event) bits.push(f.event);
    if (f.yearFrom || f.yearTo) bits.push(`${f.yearFrom || '…'}–${f.yearTo || '…'}`);
    if (f.result) bits.push(f.result);
    const count = tn('adv_matches', this.filterResults?.length ?? 0);
    const label = document.createElement('span');
    label.className = 'ellipsis';
    label.textContent = `${bits.join(' · ')} — ${count}`;
    const btn = document.createElement('button');
    btn.textContent = t('filter_clear');
    btn.onclick = () => this.applyFilter(null);
    el.innerHTML = '';
    el.append(label, btn);
    if (this.filterCapped) toast(t('adv_capped').replace('{n}', this.filterResults.length));
  },

  async refresh() {
    if (this.currentBaseId) return;
    this.showList();
  },

  async showList() {
    this.currentBaseId = null;
    $('base-list-view').classList.remove('hidden');
    $('base-games-view').classList.add('hidden');
    this.basesCache = await db.listBases();
    this.renderBases();
  },

  renderBases() {
    const q = normalizeSearch($('base-search').value);
    const el = $('base-list');
    el.innerHTML = '';
    const bases = this.basesCache.filter(b => !q || normalizeSearch(b.name).includes(q));
    for (const b of bases) {
      const item = document.createElement('button');
      item.className = 'list-item';
      item.innerHTML = `<b>📚 ${esc(b.name)}</b><span class="sub">${b.count} ${tn('games', b.count)}</span>`;
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
    // Summaries only — the PGN text is fetched when a game is actually opened.
    this.gamesCache = await db.listGameSummaries(id);
    this.gamesCache.sort((a, b) => b.updatedAt - a.updatedAt);
    $('game-search').value = '';
    this.gamesShown = 0;
    // A filter belongs to the base it was built against.
    this.filter = null;
    this.filterResults = null;
    this.filterCapped = false;
    this.renderFilterChip();
    this.renderGames();
  },

  renderGames() {
    const q = normalizeSearch($('game-search').value);
    const el = $('game-list');
    el.innerHTML = '';
    // Match only White/Black — the visible name of each entry. Event is
    // excluded: repertoire-style PGNs (one big book, many chapters) tend to
    // repeat the same Event string across every game, which would make
    // search match nearly the whole database instead of narrowing it.
    // The quick search narrows whatever the advanced filter left, so the two
    // combine instead of overriding each other.
    const source = this.filterResults ?? this.gamesCache;
    const games = source.filter(g =>
      !q || normalizeSearch(`${g.white} ${g.black}`).includes(q));
    if (!games.length) {
      el.innerHTML = `<p class="hint">${t('no_games')}</p>`;
      return;
    }
    // Draw a page at a time. One <button> per game meant a large base built
    // tens of thousands of DOM nodes on open, which froze the tab even when
    // the data itself fitted in memory.
    const PAGE = 200;
    this.gamesShown = Math.max(PAGE, Math.min(this.gamesShown || PAGE, games.length));
    const page = games.slice(0, this.gamesShown);
    for (const g of page) {
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
    if (games.length > page.length) {
      const more = document.createElement('button');
      more.className = 'btn';
      more.style.cssText = 'margin-top:8px; width:100%';
      more.textContent = `${t('load_more')} (${t('games_shown')
        .replace('{n}', page.length).replace('{total}', games.length)})`;
      more.onclick = () => { this.gamesShown = page.length + PAGE; this.renderGames(); };
      el.appendChild(more);
    }
  },

  gameMenu(g) {
    sheet([
      { label: '📤 ' + t('share_game'), action: async () => {
          const full = await db.getGame(g.id);          // summaries carry no PGN
          if (full) sharePgnText(gameFilename({ White: g.white, Black: g.black }), full.pgn);
        } },
      { label: '🗑 ' + t('delete'), action: async () => {
          if (await askConfirm(t('delete_game_confirm'))) { await db.deleteGame(g.id); this.openBase(this.currentBaseId); }
        }, danger: true },
    ]);
  },

  async openGame(g) {
    try {
      // The list holds summaries only, so fetch the move text on demand.
      const full = g.pgn ? g : await db.getGame(g.id);
      if (!full || !full.pgn) { toast(t('import_failed')); return; }
      const tree = parsePgn(full.pgn);
      Analysis.loadTree(tree, { baseId: full.baseId, gameId: full.id });
    } catch (e) {
      toast(t('import_failed'));
    }
  },

  // Streams the file instead of reading it whole. The old version held the
  // entire text, an array of every line, and an array of every parsed game in
  // memory at once — about 3x the file size — so a large PGN killed the tab
  // long before IndexedDB was ever the limit. Here memory stays flat: one
  // buffer plus one batch, no matter how big the file is.
  async importFile(file) {
    if (!file) return;
    $('pgn-file').value = '';
    if (/\.cbh$/i.test(file.name)) { await modal((box, close) => { box.innerHTML = `<p>${t('cbh_note')}</p>`; const b = document.createElement('button'); b.className = 'btn primary'; b.textContent = t('ok'); b.onclick = () => close(null); box.appendChild(b); }); return; }

    const BATCH = 500;
    const baseId = this.currentBaseId;
    let imported = 0, skipped = 0, cancelled = false;

    const ui = importProgress(file.name, () => { cancelled = true; });
    try {
      // Read in slices rather than via streams: Blob.slice().text() is
      // supported everywhere the app runs, and a 1 MB window is small enough
      // that decoding never spikes memory.
      const SLICE = 1 << 20;
      let offset = 0, buf = '', batch = [], bytes = 0;
      const readNext = async () => {
        if (offset >= file.size) return null;
        const blob = file.slice(offset, Math.min(offset + SLICE, file.size));
        offset += SLICE;
        return await blob.text();
      };

      const flush = async () => {
        if (!batch.length) return;
        await db.addGamesBatch(batch);
        imported += batch.length;
        batch = [];
        ui.update(imported, skipped, bytes / file.size);
      };
      const take = (chunk) => {
        const H = headersFromPgn(chunk);
        if (!H['White'] && !/\d+\./.test(chunk)) { skipped++; return; }
        batch.push({ baseId, white: H['White'] ?? '?', black: H['Black'] ?? '?',
                     event: H['Event'] ?? '', date: H['Date'] ?? '',
                     result: H['Result'] ?? '*', pgn: chunk.trim(), updatedAt: Date.now() });
      };

      for (;;) {
        const value = await readNext();
        if (value === null || cancelled) break;
        bytes += value.length;
        buf += value;
        // Keep the trailing fragment: the last game in the buffer may be cut
        // mid-way through this chunk, so only games before the final header
        // block are complete.
        const parts = splitPgn(buf);
        if (parts.length > 1) {
          buf = parts.pop();
          for (const p of parts) take(p);
          while (batch.length >= BATCH) {
            const slice = batch.splice(0, BATCH);
            await db.addGamesBatch(slice);
            imported += slice.length;
            ui.update(imported, skipped, bytes / file.size);
          }
        }
        // let the UI paint between chunks
        await new Promise(r => setTimeout(r, 0));
      }
      if (!cancelled && buf.trim()) for (const p of splitPgn(buf)) take(p);
      await flush();

      ui.close();
      if (!imported) { toast(t('import_failed')); return; }
      toast(`${imported} ${tn('imported', imported)}`);
      if (!(await db.kvGet('firstImportDone', false))) { await db.kvSet('firstImportDone', true); Badges.checkNew(); }
      this.openBase(baseId);
    } catch (e) {
      ui.close();
      console.error('import failed', e);
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

// Runs fn once the caller has stopped calling for `wait` ms.
function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function normalizeSearch(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function esc(s) {
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
  playedAt: 0,
  saved: false,

  init() {
    buildLevelSeg($('play-level'), 2, true);
    segInit($('play-color'));
    segInit($('play-level'));
    this.board = new Board($('play-board'), { onMove: mv => this.userMove(mv), onSound: type => Sound.play(type) });
    $('play-start').onclick = () => {
      this.level = +segValue($('play-level'));
      let c = segValue($('play-color'));
      if (c === 'r') c = Math.random() < 0.5 ? 'w' : 'b';
      this.begin(c, START_FEN);
    };
    $('play-history-btn').onclick = () => History.open();
    $('play-resign').onclick = async () => {
      if (this.over) return;
      if (await askConfirm(t('resign') + '?')) this.finish(t('you_resigned'));
    };
    $('play-back').onclick = () => {
      engine.stop();
      if (!this.over) this.saveToHistory({ abandoned: true });
      $('play-game').classList.add('hidden');
      $('play-setup').classList.remove('hidden');
    };
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
    this.playedAt = Date.now();
    this.saved = false;
    this.streakMoves = 0;
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
    // No game started yet means no position to move in. The board is hidden
    // behind the setup panel so this is hard to reach by hand, but reaching it
    // threw a null dereference straight into the global crash overlay.
    if (!this.chess || this.over || this.thinking) return;
    if (this.chess.turn() !== this.playerColor) return;
    let m;
    try { m = this.chess.move(mv); } catch { return; }
    this.board.setPosition(this.chess.fen(), { from: m.from, to: m.to });
    this.renderMoves();
    // Banked on the tenth move, not at the end of the game: a 40-move game you
    // walk away from without resigning is still a day's work.
    noteStreakMove(this);
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
      this.setStatus('⚠️ ' + engineErrorText(e));
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
    this.saveToHistory({ resigned: msg === t('you_resigned') });
  },

  // Saves the finished game to history. `resigned` and `abandoned` are the two
  // things the final position cannot tell us. Guarded by `saved` so a game
  // cannot be recorded twice — leaving the screen after a normal finish must
  // not add a second, "abandoned" copy of the same game.
  async saveToHistory({ resigned = false, abandoned = false } = {}) {
    if (this.saved || !this.chess) return;
    const hist = this.chess.history();
    if (hist.length < History.HISTORY_MIN_PLIES) return;
    this.saved = true;
    try {
      const profileName = await db.kvGet('profileName', '');
      const me = profileName || t('history_you');
      const bot = t('history_bot_name').replace('{lvl}', t('level_names')[this.level]);
      const tree = treeFromHistory(this.startFen, hist);
      tree.setHeader('White', this.playerColor === 'w' ? me : bot);
      tree.setHeader('Black', this.playerColor === 'b' ? me : bot);
      tree.setHeader('Date', new Date().toISOString().slice(0, 10).replace(/-/g, '.'));
      tree.setHeader('Event', t('history_event'));
      const rec = History.buildRecord({
        chess: this.chess,
        startFen: this.startFen,
        playerColor: this.playerColor,
        level: this.level,
        levelElo: LEVELS[this.level].elo,
        playedAt: this.playedAt,
        pgn: '',
        resigned, abandoned,
      });
      tree.setHeader('Result', rec.result);
      rec.pgn = tree.toPgn();
      await History.saveGame(rec);
    } catch (e) {
      console.error('history save failed', e);
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

      // Reviewing a game means one engine evaluation per position, so a long
      // game keeps this loop running for many seconds. Dismissing the modal in
      // the middle of that (a tap on the backdrop) detaches `box`, and every
      // $('gr-…') lookup below it then returns null. Bail out the moment the
      // modal is gone: without this the loop ran on and wrote its results into
      // the detached box, and the resulting TypeError — thrown inside an async
      // builder nobody awaits — reached the page as an unhandled rejection and
      // put the full-screen crash overlay over a perfectly healthy app.
      const evals = [];
      for (let i = 0; i < fens.length; i++) {
        evals.push(await engine.evaluate(fens[i], 220));
        if (!box.isConnected) { engine.stop(); return; }
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
    $('trainer-back').onclick = () => { engine.stop(); $('trainer-game').classList.add('hidden'); $('trainer-setup').classList.remove('hidden'); };
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
    this.applyInteractive();
  },

  updateNavButtons() {
    const atStart = this.viewIdx <= 0;
    const atEnd = this.viewIdx >= this.posHistory.length - 1;
    $('trainer-first').disabled = atStart;
    $('trainer-prev').disabled = atStart;
    $('trainer-next').disabled = atEnd;
    $('trainer-last').disabled = atEnd;
  },

  atLive() { return this.viewIdx === this.posHistory.length - 1; },

  // Whose move it is in the position on screen, which is not necessarily the
  // live one once the player has stepped back through the game.
  viewTurn() {
    const snap = this.posHistory[this.viewIdx];
    return snap ? snap.fen.split(' ')[1] : null;
  },

  // The board is playable at the live position (the normal case) and also at
  // any earlier position where it is the player's move — playing there starts
  // a variation, see rewindTo. It stays locked while the computer thinks.
  applyInteractive() {
    const live = this.atLive();
    const mine = this.viewTurn() === this.playerColor;
    this.board.interactive = mine && !(live && this.over) && (live ? this.liveInteractive : !this.thinking);
  },

  gotoHistory(idx) {
    if (!this.posHistory.length) return;
    idx = Math.max(0, Math.min(idx, this.posHistory.length - 1));
    this.viewIdx = idx;
    const snap = this.posHistory[idx];
    this.board.setPosition(snap.fen, snap.lastMove);
    this.applyInteractive();
    this.updateBadgeForView();
    this.updateNavButtons();
  },

  // Drops everything played after position `idx` so a different move can be
  // tried from there. The game object is rebuilt by replaying the moves that
  // led to that position, which keeps the notation, the opening classifier and
  // the book lookups all working off a real move history rather than a bare
  // FEN. The book is consulted again from the new position on the computer's
  // next turn, so the selected database keeps driving the game.
  rewindTo(idx) {
    const hist = this.chess.history();
    const c = new Chess();
    for (let i = 0; i < idx; i++) {
      try { c.move(hist[i]); } catch { break; }
    }
    this.chess = c;
    this.posHistory = this.posHistory.slice(0, idx + 1);
    this.viewIdx = idx;
    this.over = false;
    this.inBook = this.posHistory[idx].inBook;
    this.announcedOpening = null;
    this.renderMoves();
    this.updateNavButtons();
  },

  updateBadgeForView() {
    const snap = this.posHistory[this.viewIdx];
    if (snap) this.updateBadge(snap.inBook);
  },

  // Works at whatever position is on screen, so the player can ask what the
  // book plays before deciding to branch off there.
  hint() {
    if (this.thinking) return;
    if (this.atLive() && this.over) return;
    if (this.viewTurn() !== this.playerColor) return;
    const fen = this.posHistory[this.viewIdx].fen;
    const key = fenKey(fen);
    const entry = this.book?.get(key);
    if (!entry) { toast(t('no_book_hint')); return; }
    const moves = Object.entries(entry);
    const bestSan = moves.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
    const c = new Chess(fen);
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
      o.value = b.id; o.textContent = `${b.name} (${b.count} ${tn('games', b.count)})`;
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
    this.streakMoves = 0;
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

  // Sets whether the board should be interactive at the live (most recent)
  // position. Earlier positions have their own rule — see applyInteractive.
  setLiveInteractive(v) {
    this.liveInteractive = v;
    this.applyInteractive();
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
    KaelQuotes.chatter({ text: openingFlavorMsg(name), author: null }, 5500);
  },

  async userMove(mv) {
    // Before a game is started `chess` is null, `over`/`thinking` are false and
    // viewIdx (-1) already equals posHistory.length - 1 (-1) — so every guard
    // below used to pass and the next line dereferenced null, throwing the user
    // into the full-screen crash overlay. Play.userMove was fixed for exactly
    // this; its twin here was missed.
    if (!this.chess || this.thinking) return;
    const live = this.atLive();
    if (live && this.over) return;
    if (this.viewTurn() !== this.playerColor) return;
    // Moving from an earlier position is not an undo — it branches the game
    // into a new variation and the trainer carries on from there.
    if (!live) { this.rewindTo(this.viewIdx); toast(t('variation_started')); }
    let m;
    // On a rejected move put the board back in step with the game state — it
    // has already drawn the attempted move optimistically.
    try { m = this.chess.move(mv); } catch { this.gotoHistory(this.viewIdx); return; }
    this.place(this.chess.fen(), { from: m.from, to: m.to }, this.inBook);
    this.renderMoves();
    this.announceOpeningIfNew();
    noteStreakMove(this);
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

// ═════════════════════ PUZZLE SESSION LOG ═════════════════════
// A per-mode record of the puzzles attempted since the app opened, drawn as a
// strip of dots under the board: green solved, red missed. It exists so that
// "next puzzle" is no longer a one-way door — any earlier puzzle can be
// reopened and stepped through. Review happens on its own modal board so the
// puzzle currently in play keeps its state untouched.

const PuzzleLog = {
  logs: { puzzles: [], blind: [], rush: [] },
  containers: { puzzles: 'puzzle-log', blind: 'blind-log', rush: 'rush-log' },

  add(mode, puzzle, solved) {
    if (!puzzle) return;
    this.logs[mode].push({ puzzle, solved });
    this.render(mode);
  },

  reset(mode) { this.logs[mode] = []; this.render(mode); },

  render(mode) {
    const el = $(this.containers[mode]);
    if (!el) return;
    el.innerHTML = '';
    this.logs[mode].forEach((entry, i) => {
      const b = document.createElement('button');
      b.className = 'plog-dot ' + (entry.solved ? 'ok' : 'miss');
      b.textContent = i + 1;
      const label = `${t('log_review_title').replace('{n}', i + 1)} — ${t(entry.solved ? 'log_solved' : 'log_missed')}`;
      b.title = label;
      b.setAttribute('aria-label', label);
      b.onclick = () => this.review(mode, i);
      el.appendChild(b);
    });
  },

  // Read-only replay: the position the player faced, then the solution one
  // move at a time.
  review(mode, i) {
    const entry = this.logs[mode]?.[i];
    if (!entry) return;
    const p = entry.puzzle;
    const chess = new Chess(p.fen);
    const frames = [{ fen: chess.fen(), last: null }];
    for (const u of p.moves) {
      let m = null;
      try { m = chess.move(uciToMove(u)); } catch { break; }
      frames.push({ fen: chess.fen(), last: { from: m.from, to: m.to } });
    }
    // The side to move in a puzzle FEN is the opponent — their move is the
    // first in the list — so the player has the other colour.
    const playerColor = new Chess(p.fen).turn() === 'w' ? 'b' : 'w';

    modal((box, close) => {
      box.innerHTML = `<h3>${esc(t('log_review_title').replace('{n}', i + 1))}</h3>`;
      const meta = document.createElement('p');
      meta.className = 'hint';
      meta.textContent = `${t(entry.solved ? 'log_solved' : 'log_missed')} · ${t('log_rating').replace('{n}', p.rating)}`;
      box.appendChild(meta);

      const holder = document.createElement('div');
      holder.className = 'board-wrap';
      box.appendChild(holder);
      const board = new Board(holder, { interactive: false });
      board.setOrientation(playerColor);

      const nav = document.createElement('div');
      nav.className = 'toolbar';
      const mk = label => {
        const b = document.createElement('button');
        b.className = 'tool-btn'; b.textContent = label;
        nav.appendChild(b); return b;
      };
      const bFirst = mk('⏮'), bPrev = mk('◀'), bNext = mk('▶'), bLast = mk('⏭');
      box.appendChild(nav);

      // Opens on the position the player actually saw — after the opponent's
      // move — rather than the raw FEN, which is one ply earlier.
      let idx = Math.min(1, frames.length - 1);
      const draw = () => {
        const f = frames[idx];
        board.setPosition(f.fen, f.last);
        bFirst.disabled = bPrev.disabled = idx <= 0;
        bNext.disabled = bLast.disabled = idx >= frames.length - 1;
      };
      bFirst.onclick = () => { idx = 0; draw(); };
      bPrev.onclick = () => { idx = Math.max(0, idx - 1); draw(); };
      bNext.onclick = () => { idx = Math.min(frames.length - 1, idx + 1); draw(); };
      bLast.onclick = () => { idx = frames.length - 1; draw(); };
      draw();

      const closeBtn = document.createElement('button');
      closeBtn.className = 'btn primary big';
      closeBtn.style.marginTop = '8px';
      closeBtn.textContent = t('close');
      closeBtn.onclick = () => close(null);
      box.appendChild(closeBtn);
    });
  },
};

// ═════════════════════ PUZZLES ═════════════════════

// How far from the player's own ELO each difficulty aims. A 2000-rated player
// solving 1700s gains ~3 ELO a puzzle, which feels like standing still; this
// lets them ask for puzzles at or above their level instead.
const DIFFICULTY_LEVELS = [
  { v: -500, key: 'diff_easiest' },
  { v: -250, key: 'diff_easy' },
  { v: 0, key: 'diff_normal' },
  { v: 250, key: 'diff_hard' },
  { v: 500, key: 'diff_harder' },
];

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
  difficulty: 0,              // ELO offset applied when picking the next puzzle
  autoNext: false,            // load the next puzzle as soon as this one is solved
  logged: false,              // this puzzle already recorded in the session log
  isDailyPuzzle: false,
  posHistory: [],             // [{fen, lastMove}] snapshots for the nav buttons
  viewIdx: -1,                 // index into posHistory currently shown on the board
  liveInteractive: false,      // whether the board should accept moves at the live position
  timerInterval: null,
  timerStart: 0,

  async init() {
    this.board = new Board($('puzzle-board'), { onMove: mv => this.userMove(mv), onSound: type => Sound.play(type) });
    $('puzzle-theme-btn').onclick = () => this.openThemePicker();
    $('puzzle-options').onclick = () => this.openOptions();
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
      // Motifs first, then the named mating patterns under their own heading.
      // Patterns are trainable and rated, they just never become radar axes.
      for (const th of PUZZLE_THEMES) {
        const row = document.createElement('label');
        row.className = 'theme-pick-row';
        row.innerHTML = `<input type="checkbox" data-th="${th}"><span>${t('theme_' + th)}</span>`;
        box.appendChild(row);
        themeRows.push(row);
      }
      const patternHead = document.createElement('div');
      patternHead.className = 'hint';
      patternHead.style.cssText = 'margin:10px 0 4px; font-weight:600;';
      patternHead.textContent = t('theme_patterns_head');
      box.appendChild(patternHead);
      for (const th of PUZZLE_PATTERNS) {
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

  // Difficulty and auto-advance live together: both change how the flow of a
  // session feels rather than what a single puzzle is.
  openOptions() {
    modal((box, close) => {
      box.innerHTML = `<h3>${t('puzzle_options')}</h3>`;

      const diffLabel = document.createElement('label');
      diffLabel.className = 'hint';
      diffLabel.style.cssText = 'display:block; margin-bottom:6px; font-weight:600;';
      diffLabel.textContent = t('difficulty');
      const seg = document.createElement('div');
      seg.className = 'seg scroll';
      for (const lv of DIFFICULTY_LEVELS) {
        const b = document.createElement('button');
        b.dataset.v = String(lv.v);
        b.textContent = t(lv.key);
        if (lv.v === this.difficulty) b.classList.add('on');
        seg.appendChild(b);
      }
      const target = document.createElement('p');
      target.className = 'hint';
      target.style.marginTop = '6px';
      const showTarget = () => {
        target.textContent = t('difficulty_target').replace('{n}', Math.round(this.targetRating()));
      };
      segInit(seg, v => { this.difficulty = +v; db.kvSet('puzzleDifficulty', this.difficulty); showTarget(); });
      showTarget();

      const diffHint = document.createElement('p');
      diffHint.className = 'hint';
      diffHint.textContent = t('difficulty_hint');

      const autoRow = document.createElement('label');
      autoRow.className = 'theme-pick-row';
      autoRow.style.marginTop = '10px';
      autoRow.innerHTML = `<input type="checkbox"><span>${esc(t('auto_next'))}</span>`;
      const autoCb = autoRow.querySelector('input');
      autoCb.checked = this.autoNext;
      autoCb.onchange = () => { this.autoNext = autoCb.checked; db.kvSet('puzzleAutoNext', this.autoNext); };
      const autoHint = document.createElement('p');
      autoHint.className = 'hint';
      autoHint.textContent = t('auto_next_hint');

      const okBtn = document.createElement('button');
      okBtn.className = 'btn primary big';
      okBtn.textContent = t('close');
      // Applying a new difficulty mid-puzzle would yank the board away, so it
      // takes effect on the next puzzle — which is the very next thing the
      // player does anyway.
      okBtn.onclick = () => close(null);

      box.append(diffLabel, seg, target, diffHint, autoRow, autoHint, okBtn);
    });
  },

  // The rating band the picker aims at. Clamped to the library's real range so
  // "Harder" at the very top still returns puzzles rather than nothing.
  targetRating() {
    return Math.max(600, Math.min(3000, this.elo + this.difficulty));
  },

  async ensureLoaded() {
    if (this.loaded) { return; }
    this.solved = await db.kvGet('puzzlesSolved', {});
    this.elo = await db.kvGet('puzzleElo', 1200);
    this.themeElo = await db.kvGet('puzzleThemeElo', {});
    this.attemptCount = await db.kvGet('puzzleAttemptCount', 0);
    this.difficulty = await db.kvGet('puzzleDifficulty', 0);
    this.autoNext = await db.kvGet('puzzleAutoNext', false);
    $('puzzle-progress').textContent = t('puzzles_loading');
    try {
      await ensureForRating(this.targetRating());
    } catch {
      $('puzzle-progress').textContent = t('puzzles_unavailable');
      return;                                   // stay unloaded so a retry works
    }
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
    // Solved only. A wrong answer used to keep the flame alive, which was the
    // cheapest way to "use the app" in the whole product.
    if (win) Streak.recordActivity();
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

  async nextPuzzle() {
    // Moving on from a puzzle that was attempted and got away still counts as
    // a miss in the strip; skipping one that was never touched does not.
    if (this.current && !this.logged && this.failedThis) this.log(false);
    const target = this.targetRating();
    // Bands used to be fetched once, at the rating the app started with. If the
    // rating then moved — climbing through a session, or arriving from the
    // cloud after sign-in — the pool stayed where it was, and the picker could
    // only serve puzzles hundreds of points below the player. Ask for the band
    // that matches the target every time; loadBand() is a no-op once cached.
    try { await ensureForRating(target); } catch { /* keep playing what we have */ }
    const pool = this.pool();
    if (!pool.length) return;
    const fresh = pool.filter(p => !this.solved[p.id]);
    const list = fresh.length ? fresh : pool;
    let windowSize = 100, candidates = [];
    while (candidates.length === 0 && windowSize <= 1200) {
      candidates = list.filter(p => Math.abs(p.rating - target) <= windowSize);
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
    this.logged = false;
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
        KaelQuotes.chatter(pickKael(KAEL_PRAISE));
        this.setStatus(t('solved'));
        if (!this.failedThis) {
          // Store the themes, not just a flag. The library is split across
          // rating bands now, so a later lookup by id would miss any puzzle
          // whose band isn't loaded — and the theme-mastery badges would
          // quietly under-count. Old records saved as `true` still work.
          this.solved[this.current.id] = this.current.themes ?? true;
          db.kvSet('puzzlesSolved', this.solved);
        }
        this.recordResult(!this.failedThis);
        this.log(!this.failedThis);
        this.updateProgress();
        $('puzzle-analyze').classList.remove('hidden');
        this.setLiveInteractive(false);
        // Long enough to see the final move land and hear the sound, short
        // enough that a session keeps its rhythm. The identity check stops a
        // queued jump from firing after the player already moved on by hand.
        if (this.autoNext) {
          const solvedPuzzle = this.current;
          setTimeout(() => {
            if (activeScreen === 'puzzles' && this.current === solvedPuzzle) this.nextPuzzle();
          }, 1100);
        }
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
      if (firstMistake) KaelQuotes.chatter(pickKael(KAEL_MISTAKE));
      this.board.setPosition(this.chess.fen());
      this.setStatus(t('wrong_try'));
      $('puzzle-board').classList.add('shake');
      setTimeout(() => $('puzzle-board').classList.remove('shake'), 500);
    }
  },

  // Records the puzzle in the session strip exactly once, however it ended
  // (solved, given up on, or revealed with the solution button).
  log(solved) {
    if (this.logged || !this.current) return;
    this.logged = true;
    PuzzleLog.add('puzzles', this.current, solved);
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
    this.log(false);
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
  strikes: 0,
  // A single wrong move ending the whole run makes the mode punishing rather
  // than fast: one slip erases three minutes of work. Three strikes keeps the
  // pressure while letting a good run survive a mistake.
  MAX_STRIKES: 3,
  COUNTDOWN: 5,

  init() {
    this.board = new Board($('rush-board'), { onMove: mv => this.userMove(mv), onSound: type => Sound.play(type) });
    segInit($('rush-duration'), () => this.showBest());
    $('rush-start').onclick = () => this.start();
    $('rush-again').onclick = () => this.openIntro();
    // The result screen was a dead end — "play again" or "share" only, with no
    // way back to the other puzzle modes without using the device back button.
    $('rush-exit').onclick = () => { this.stop(); showScreen('puzzles'); };
    $('rush-share').onclick = () => this.share();
  },

  // 3-minute and 5-minute runs are different events, so each keeps its own
  // best score and its own leaderboard. 'rushBestScore' stays as the best
  // across both, since the achievements are phrased "N in a row" regardless
  // of clock and shouldn't be lost when the boards split.
  bestKey(duration = +segValue($('rush-duration'))) { return 'rushBest' + duration; },

  async showBest() {
    $('rush-best-score').textContent = await db.kvGet(this.bestKey(), 0);
  },

  // Monthly boards give newer players something reachable: an all-time board
  // stops being a target once a few big scores are on it. The season is
  // cleared lazily on the first run of a new month rather than by a scheduled
  // job — there is no server here to run one.
  async recordSeasonScore() {
    const period = monthStr();
    if (await db.kvGet('rushMonthKey', null) !== period) {
      await db.kvSet('rushMonth180', 0);
      await db.kvSet('rushMonth300', 0);
      await db.kvSet('rushMonthKey', period);
    }
    const key = 'rushMonth' + this.duration;
    if (this.score > await db.kvGet(key, 0)) await db.kvSet(key, this.score);
  },

  async openIntro() {
    showScreen('rush');
    $('rush-intro').classList.remove('hidden');
    $('rush-game').classList.add('hidden');
    $('rush-result').classList.add('hidden');
    await this.showBest();
  },

  // Target rating ramps up directly with the current run's score (a rush
  // "streak" is just its score, since one mistake ends the run), rather than
  // walking a fixed sorted list — so difficulty visibly tracks performance.
  pickNext() {
    const target = Math.min(2400, 900 + this.score * 55);
    // A run climbs from ~900 to 2400, crossing most bands. Fetch the next one
    // ahead of time without blocking — the pool already loaded stays playable
    // if it hasn't arrived yet.
    ensureForRating(target).catch(() => {});
    let candidates = PUZZLES.filter(p => !this.usedIds.has(p.id));
    if (!candidates.length) { this.usedIds.clear(); candidates = PUZZLES; }
    candidates = [...candidates].sort((a, b) => Math.abs(a.rating - target) - Math.abs(b.rating - target));
    const top = candidates.slice(0, 5);
    const pick = top[Math.floor(Math.random() * top.length)];
    this.usedIds.add(pick.id);
    return pick;
  },

  async start() {
    $('rush-start').disabled = true;
    try {
      await ensureForRating(1000);            // where every run begins
    } catch {
      toast(t('puzzles_unavailable'));
      $('rush-start').disabled = false;
      return;
    }
    $('rush-start').disabled = false;
    this.usedIds = new Set();
    PuzzleLog.reset('rush');           // the strip shows one run at a time
    this.duration = +segValue($('rush-duration'));
    this.timeLeft = this.duration;
    this.score = 0;
    this.strikes = 0;
    this.running = true;
    $('rush-intro').classList.add('hidden');
    $('rush-result').classList.add('hidden');
    $('rush-game').classList.remove('hidden');
    this.updateHud();
    // Show the first puzzle immediately but frozen, so the count-in is spent
    // reading the position rather than staring at an empty board.
    this.loadNext();
    this.countIn(() => {
      if (!this.running) return;
      $('rush-status').textContent = this.prompt ?? '';
      this.timer = setInterval(() => this.tick(), 1000);
      this.board.interactive = true;
    });
  },

  // Counts 5…1 then "Go!" over the board. The clock does not start until it
  // finishes, so the count-in never costs the player time.
  countIn(done) {
    const el = $('rush-countdown');
    const label = el.firstElementChild;
    let n = this.COUNTDOWN;
    this.countingIn = true;
    el.classList.remove('hidden');
    $('rush-status').textContent = t('rush_get_ready');
    const tick = () => {
      if (!this.running) { el.classList.add('hidden'); return; }
      label.textContent = n > 0 ? n : t('rush_go');
      label.classList.remove('pop');
      void label.offsetWidth;            // restart the animation each step
      label.classList.add('pop');
      if (n-- <= 0) {
        setTimeout(() => {
          el.classList.add('hidden');
          this.countingIn = false;
          done();
        }, 450);
        return;
      }
      setTimeout(tick, 1000);
    };
    tick();
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
    const el = $('rush-strikes');
    el.innerHTML = Array.from({ length: this.MAX_STRIKES }, (_, i) =>
      `<span class="rush-strike${i < this.strikes ? ' used' : ''}">✕</span>`).join('');
    el.classList.toggle('danger', this.strikes >= this.MAX_STRIKES - 1);
  },

  loadNext() {
    this.current = this.pickNext();
    this.chess = new Chess(this.current.fen);
    this.moveIdx = 0;
    const playerColor = this.chess.turn() === 'w' ? 'b' : 'w';
    this.board.setOrientation(playerColor);
    this.board.setPosition(this.chess.fen());
    this.board.interactive = false;
    // Kept so the count-in can put it back — countIn() borrows the status line
    // for "Get ready!" and must not leave the player without the prompt.
    this.prompt = t(playerColor === 'w' ? 'white' : 'black') + ' ' + t('to_move_find');
    if (!this.countingIn) $('rush-status').textContent = this.prompt;
    setTimeout(() => {
      if (!this.running) return;
      const m = this.applyUci(this.current.moves[0]);
      this.moveIdx = 1;
      this.board.setPosition(this.chess.fen(), m ? { from: m.from, to: m.to } : null);
      // Stays frozen while the count-in is on screen; countIn() hands control
      // back once the clock actually starts.
      this.board.interactive = !this.countingIn;
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
        PuzzleLog.add('rush', this.current, true);
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
      this.board.interactive = false;
      this.strikes++;
      PuzzleLog.add('rush', this.current, false);
      this.updateHud();
      Sound.play('puzzle-wrong');
      if (this.strikes >= this.MAX_STRIKES) { this.finish(t('rush_strikes_out')); return; }
      const left = this.MAX_STRIKES - this.strikes;
      $('rush-status').textContent = left === 1
        ? t('rush_strike_last')
        : t('rush_strike_left').replace('{n}', left);
      // Long enough to read how many chances are left, short enough not to
      // feel like a penalty on a timed run.
      setTimeout(() => { if (this.running) this.loadNext(); }, 1200);
    }
  },

  async finish(reason) {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.timer);
    this.board.interactive = false;
    // Score the run against its own clock, not the combined best — a 3-minute
    // record must not be beaten by a 5-minute one.
    const key = this.bestKey(this.duration);
    const best = await db.kvGet(key, 0);
    const isNewBest = this.score > best;
    if (isNewBest) await db.kvSet(key, this.score);
    const overall = await db.kvGet('rushBestScore', 0);
    if (this.score > overall) await db.kvSet('rushBestScore', this.score);
    await this.recordSeasonScore();
    Badges.checkNew();
    // A run that scores 0 or 1 is a run you bailed out of; three solved is a
    // real one. Starting a run and letting the clock die no longer counts.
    if (this.score >= STREAK_MIN_RUSH_SOLVED) Streak.recordActivity();
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
  logged: false,
  elo: 1200,
  hintWarningSeen: false,
  greetedThisOpen: false,

  init() {
    this.board = new Board($('blind-board'), { onMove: mv => this.userMove(mv), onSound: type => Sound.play(type) });
    $('blind-peek').onclick = () => this.peek();
    $('blind-solution').onclick = () => this.showSolution();
    $('blind-next').onclick = () => this.nextPuzzle();
    $('blind-share').onclick = () => this.share();
  },

  async ensureLoaded() {
    if (this.loaded) return;
    this.elo = await db.kvGet('blindfoldElo', 1200);
    this.hintWarningSeen = await db.kvGet('blindfoldHintWarningSeen', false);
    await ensureForRating(this.elo);
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

  // Shares the difficulty offset chosen in the Puzzles options — it is the
  // same player asking for the same kind of challenge, just without sight of
  // the pieces.
  targetRating() {
    return Math.max(600, Math.min(3000, this.elo + Puzzles.difficulty));
  },

  async nextPuzzle() {
    if (this.current && !this.logged && this.failedThis) this.log(false);
    this.cleanup();
    $('blind-share').classList.add('hidden');
    const target = this.targetRating();
    try { await ensureForRating(target); } catch { /* play what is already loaded */ }
    if (!PUZZLES.length) return;
    const candidates = PUZZLES.filter(p => Math.abs(p.rating - target) <= 300);
    const list = candidates.length ? candidates : PUZZLES;
    this.current = list[Math.floor(Math.random() * list.length)];
    this.chess = new Chess(this.current.fen);
    this.moveIdx = 0;
    this.peeksUsed = 0;
    this.peekedThis = false;
    this.failedThis = false;
    this.eloRecorded = false;
    this.logged = false;
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
      setTimeout(() => KaelQuotes.chatter(pickKael(KAEL_BLINDFOLD), 5000), 900);
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
    const btn = $('blind-peek');
    const left = Math.max(0, 2 - this.peeksUsed);
    btn.textContent = `👁 ${t('blind_peek_btn')} (${left})`;
    btn.disabled = left === 0;
  },

  setStatus(msg) { $('blind-status').textContent = msg; },

  async peek() {
    if (!this.current) return;
    if (this.peeksUsed >= 2) {
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
        KaelQuotes.chatter(pickKael(KAEL_PRAISE));
        this.setStatus(t('solved'));
        this.recordResult(true);
        this.log(!this.failedThis);
        $('blind-share').classList.remove('hidden');
        Streak.recordActivity();
        if (Puzzles.autoNext) {
          const solvedPuzzle = this.current;
          setTimeout(() => {
            if (activeScreen === 'blind' && this.current === solvedPuzzle) this.nextPuzzle();
          }, 1400);   // a beat longer than Puzzles: the pieces reappear first
        }
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
      if (firstMistake) KaelQuotes.chatter(pickKael(KAEL_MISTAKE));
      this.setStatus(t('wrong_try'));
      $('blind-board').classList.add('shake');
      setTimeout(() => $('blind-board').classList.remove('shake'), 500);
    }
  },

  log(solved) {
    if (this.logged || !this.current) return;
    this.logged = true;
    PuzzleLog.add('blind', this.current, solved);
  },

  async showSolution() {
    if (!this.current) return;
    clearTimeout(this.peekTimer);
    this.recordResult(false);
    this.log(false);
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

// Which side the player takes in an endgame study.
//
// Normally it is the side to move — they are the one with something to prove.
// The exception is a study marked `result: 'loss'`, which means the side to
// move is LOST: the position exists to show how that mistake gets punished,
// and the technique being taught belongs to the other side. Handing the player
// the losing side there makes the study pointless — they would be practising
// how to lose. So they take the winning side and the book plays the losing
// move for them.
function practiceColor(pos) {
  const toMove = pos.fen.split(' ')[1];
  return pos.result === 'loss' ? (toMove === 'w' ? 'b' : 'w') : toMove;
}

// The six sibling views inside #screen-endgame (the "Learn" tab).
const VIEWS = [
  'endgame-sections-view',
  'learn-lesson-list-view', 'learn-lesson-view',
  'endgame-list-view', 'endgame-positions-view', 'endgame-viewer-view',
];

// ═════════════ GUIDED WALKTHROUGH — shared by two screens ═════════════
// Shows the next move of a scripted line as an arrow, clears it, then asks the
// player to play that same move back. Correct → the opponent's scripted reply
// plays itself and the next move is shown, on to the end of the line.
//
// Used by Basic Checkmates (over `lesson.demo.moves`) and by Endings (over
// `endgame.moves`). It is ONE implementation on purpose: the two screens are
// meant to feel identical, and two copies would drift.
//
// It persists nothing and grades nothing. Endings is a rated domain, so the
// walker must never reach `Endgame.finishPractice` — the only writer of
// `endgameElo`. Its own state machine is entirely separate from `mode`.
//
// Design: docs/superpowers/specs/2026-08-14-learn-walkthrough-design.md
function createWalker(cfg) {
  return {
    cfg,
    active: false,
    idx: 0,
    chess: null,
    tries: 0,
    timer: null,
    // True from a move being played until the next one is shown — the stretch
    // that covers the opponent's reply. The board is dead then, but the nav
    // buttons are not, and letting 👁 Show me fire in that gap would play the
    // opponent's move as if it were the player's and flip the mode onto the
    // wrong side for the rest of the line.
    busy: false,

    // A legal move list always alternates, so whose ply this is follows from
    // who moves first. In most studies that is the player; in a "the side to
    // move is lost" study the book plays the losing move first.
    isMine(i) { return i % 2 === (this.cfg.playerFirst() ? 0 : 1); },

    start() {
      const c = this.cfg;
      clearTimeout(this.timer);
      this.timer = null;
      this.active = true;
      this.idx = 0;
      this.tries = 0;
      this.busy = false;
      this.chess = new Chess(c.fen());
      const b = c.board();
      b.setOrientation(c.orientation());
      b.setPosition(this.chess.fen());
      b.setShapes({ squares: [], arrows: [] });
      b.interactive = false;
      $(c.ids.nav).classList.remove('hidden');
      $(c.ids.status).classList.remove('hidden', 'good', 'bad');
      c.onStart();
      this.step();
    },

    stop() {
      clearTimeout(this.timer);
      this.timer = null;
      this.active = false;
      this.busy = false;
      $(this.cfg.ids.nav).classList.add('hidden');
    },

    renderNav() {
      const c = this.cfg;
      $(c.ids.counter).textContent = `${this.idx} / ${c.line().length}`;
      $(c.ids.back).disabled = this.busy || this.idx < (this.cfg.playerFirst() ? 2 : 3);
      $(c.ids.show).disabled = this.busy;
    },

    // Walk forward over any moves that are not the player's, then show theirs.
    step() {
      const c = this.cfg;
      const line = c.line();
      if (this.idx >= line.length) { this.busy = false; this.renderNav(); this.finish(); return; }
      if (this.isMine(this.idx)) { this.busy = false; this.renderNav(); this.show(); return; }
      this.busy = true;
      this.renderNav();
      this.timer = setTimeout(() => {
        if (!this.active) return;
        const m = this.chess.move(uciToMove(line[this.idx]));
        this.idx++;
        c.board().setPosition(this.chess.fen(), { from: m.from, to: m.to });
        this.step();
      }, 600);
    },

    // Draw the move, hold it, then clear it and hand over. It is cleared on
    // purpose: recalling the move is the point. 👁 Show me is the way out.
    show() {
      const c = this.cfg;
      const b = c.board();
      const mv = uciToMove(c.line()[this.idx]);
      b.interactive = false;
      b.setShapes({ squares: [], arrows: [{ from: mv.from, to: mv.to, color: 'green' }] });
      const status = $(c.ids.status);
      status.classList.remove('good', 'bad');
      status.textContent = t('learn_walk_watch');
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        if (!this.active) return;
        b.setShapes({ squares: [], arrows: [] });
        status.textContent = t('learn_practice_prompt');
        b.interactive = true;
      }, 1400);
    },

    checkMove(mv) {
      const c = this.cfg;
      const expected = c.line()[this.idx];
      const played = mv.from + mv.to + (expected.length > 4 ? (mv.promotion || '') : '');
      if (played === expected) { this.play(true); return; }
      this.tries++;
      Sound.play('puzzle-wrong');
      c.board().setPosition(this.chess.fen());
      const status = $(c.ids.status);
      status.classList.remove('good');
      status.classList.add('bad');
      status.textContent = t('learn_try_again');
      const el = c.board().el;
      el.classList.add('shake');
      setTimeout(() => el.classList.remove('shake'), 500);
      // Second miss on the same move: show it again rather than let them grind.
      if (this.tries >= 2) { this.tries = 0; this.show(); }
    },

    // byPlayer is false when 👁 Show me played it, so the walkthrough never
    // congratulates the player for a move they did not find.
    play(byPlayer) {
      const c = this.cfg;
      this.tries = 0;
      this.busy = true;
      clearTimeout(this.timer);
      const b = c.board();
      b.interactive = false;
      b.setShapes({ squares: [], arrows: [] });
      const m = this.chess.move(uciToMove(c.line()[this.idx]));
      this.idx++;
      b.setPosition(this.chess.fen(), { from: m.from, to: m.to });
      const status = $(c.ids.status);
      status.classList.remove('good', 'bad');
      if (byPlayer) {
        Sound.play('puzzle-correct');
        status.textContent = t('learn_correct');
        status.classList.add('good');
      }
      this.renderNav();
      this.step();
    },

    showMe() {
      if (!this.active || this.busy) return;
      clearTimeout(this.timer);
      this.play(false);
    },

    back() {
      const c = this.cfg;
      const first = c.playerFirst() ? 2 : 3;
      if (!this.active || this.busy || this.idx < first) return;
      clearTimeout(this.timer);
      this.idx -= 2;
      this.tries = 0;
      this.chess = new Chess(c.fen());
      let last = null;
      for (let i = 0; i < this.idx; i++) last = this.chess.move(uciToMove(c.line()[i]));
      c.board().setPosition(this.chess.fen(), last ? { from: last.from, to: last.to } : null);
      this.renderNav();
      this.show();
    },

    finish() {
      const c = this.cfg;
      clearTimeout(this.timer);
      this.timer = null;
      this.active = false;
      this.busy = false;
      c.board().interactive = false;
      c.board().setShapes({ squares: [], arrows: [] });
      const status = $(c.ids.status);
      status.classList.remove('bad');
      status.classList.add('good');
      status.textContent = t('learn_walk_done');
      $(c.ids.nav).classList.add('hidden');
      c.onFinish();
      Streak.recordActivity();
    },
  };
}

const Endgame = {
  board: null,
  category: null,
  current: null,        // endgame position object
  mode: 'study',         // 'study' | 'practice'
  walker: null,          // guided walkthrough; unrated, separate from `mode`
  chess: null,
  playerColor: 'w',
  over: false,
  thinking: false,
  engineOn: false,
  elo: {},               // per-category rating

  init() {
    this.board = new Board($('endgame-board'), { onMove: mv => this.userMove(mv), onSound: type => Sound.play(type) });
    $('endgame-back-sections').onclick = () => this.showSections();
    $('endgame-back-cat').onclick = () => this.showCategories();
    $('endgame-back-pos').onclick = () => this.openCategory(this.category);
    $('endgame-flip').onclick = () => this.board.flip();
    $('endgame-engine-toggle').onclick = () => this.toggleEngine();
    $('endgame-practice-start').onclick = () => this.startPractice();
    // The same guided walkthrough the Basic Checkmates use, over the study's
    // own tablebase line. It never reaches finishPractice, so it can never
    // move `endgameElo` — the study stays unrated until you really play it.
    this.walker = createWalker({
      board: () => this.board,
      fen: () => this.current.fen,
      line: () => this.current.moves,
      orientation: () => practiceColor(this.current),
      // In a "the side to move is lost" study the player takes the winning
      // side, so the book's first move belongs to the opponent.
      playerFirst: () => this.current.fen.split(' ')[1] === practiceColor(this.current),
      ids: {
        nav: 'endgame-walk-nav', back: 'endgame-walk-back',
        show: 'endgame-walk-show', counter: 'endgame-walk-counter',
        status: 'endgame-status',
      },
      onStart: () => {
        engine.stop();
        this.engineOn = false;
        $('endgame-engine').classList.add('hidden');
        $('endgame-engine-toggle').classList.remove('on');
        $('endgame-study-actions').classList.add('hidden');
        $('endgame-walk-row').classList.add('hidden');
      },
      onFinish: () => {
        $('endgame-study-actions').classList.remove('hidden');
        $('endgame-walk-row').classList.remove('hidden');
      },
    });
    $('endgame-walk-btn').onclick = () => this.walker.start();
    $('endgame-walk-back').onclick = () => this.walker.back();
    $('endgame-walk-show').onclick = () => this.walker.showMe();
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
    this.Lessons.init();
    this.showSections();
  },

  async ensureLoaded() {
    this.elo = await db.kvGet('endgameElo', {});
  },

  // The Learn screen holds six sibling views; exactly one is ever visible.
  showView(id) {
    for (const v of VIEWS) $(v).classList.toggle('hidden', v !== id);
  },

  // ── the three sections ──
  // Rules and Basic Checkmates are lessons and persist NOTHING. Only Endings
  // feeds `endgameElo` / the profile radar, so its categories stay in their own
  // list (ENDGAME_CATEGORIES) and never mix with LEARNING_CATEGORIES.
  showSections() {
    this.showView('endgame-sections-view');
    this.renderSections();
  },

  renderSections() {
    const el = $('endgame-section-list');
    el.innerHTML = '';
    for (const cat of LEARNING_CATEGORIES) {
      const item = document.createElement('button');
      item.className = 'list-item';
      item.innerHTML = `<b>${esc(cat.title[getLang()])}</b><span class="sub">${cat.lessons.length} ${tn('lessons_count', cat.lessons.length)}</span>`;
      item.onclick = () => this.Lessons.openCategory(cat);
      el.appendChild(item);
    }
    const endings = document.createElement('button');
    endings.className = 'list-item';
    endings.innerHTML = `<b>${t('sec_endings')}</b><span class="sub">${ENDGAMES.length} ${tn('games', ENDGAMES.length)}</span>`;
    endings.onclick = () => this.showCategories();
    el.appendChild(endings);
  },

  // Re-render whichever list is on screen after a language change or a sign-in
  // that replaced the ratings — without switching views under the user's feet.
  refreshLists() {
    if (!$('endgame-sections-view').classList.contains('hidden')) this.renderSections();
    else if (!$('endgame-list-view').classList.contains('hidden')) this.showCategories();
  },

  showCategories() {
    this.showView('endgame-list-view');
    const el = $('endgame-cat-list');
    el.innerHTML = '';
    for (const cat of ENDGAME_CATEGORIES) {
      const count = ENDGAMES.filter(e => e.category === cat).length;
      const rating = this.elo[cat] ? Math.round(this.elo[cat]) : '—';
      const item = document.createElement('button');
      item.className = 'list-item';
      item.innerHTML = `<b>${t('cat_' + cat)}</b><span class="sub">${count} ${tn('games', count)} · ${t('endgame_elo')}: ${rating}</span>`;
      item.onclick = () => this.openCategory(cat);
      el.appendChild(item);
    }
  },

  openCategory(cat) {
    this.category = cat;
    this.showView('endgame-positions-view');
    $('endgame-cat-title').textContent = t('cat_' + cat);
    const el = $('endgame-pos-list');
    el.innerHTML = '';
    for (const pos of ENDGAMES.filter(e => e.category === cat)) {
      const item = document.createElement('button');
      item.className = 'list-item';
      const sub = pos.subtitle ? `<span class="sub">${esc(pos.subtitle[getLang()])}</span>` : '';
      item.innerHTML = `<b>${esc(pos.name[getLang()])}</b>${sub}`;
      item.onclick = () => this.openPosition(pos);
      el.appendChild(item);
    }
  },

  openPosition(pos) {
    this.current = pos;
    this.mode = 'study';
    this.engineOn = false;
    engine.stop();
    this.walker.stop();
    $('endgame-study-actions').classList.remove('hidden');
    // Only studies with a line to follow can be walked through. Every entry in
    // ENDGAMES has one today; the guard is here so a future one without a line
    // cannot offer a button that would do nothing.
    $('endgame-walk-row').classList.toggle('hidden', !(pos.moves && pos.moves.length));
    this.showView('endgame-viewer-view');
    $('endgame-pos-title').innerHTML = `<span class="ttl">${esc(pos.name[getLang()])}</span>`
      + (pos.subtitle ? `<span class="sub">${esc(pos.subtitle[getLang()])}</span>` : '');
    $('endgame-comment').textContent = pos.comment[getLang()];
    $('endgame-comment').classList.remove('hidden');
    $('endgame-status').classList.add('hidden');
    $('endgame-engine').classList.add('hidden');
    $('endgame-engine-toggle').classList.remove('on');
    $('endgame-practice-actions').style.display = 'none';
    $('endgame-practice-start').classList.remove('hidden');
    this.board.interactive = false;
    // Show the board from the side the player will actually take, so the
    // preview and the practice run never face opposite ways.
    this.board.setOrientation(practiceColor(pos));
    this.board.setPosition(pos.fen);
  },

  toggleEngine() {
    this.engineOn = !this.engineOn;
    $('endgame-engine').classList.toggle('hidden', !this.engineOn);
    $('endgame-engine-toggle').classList.toggle('on', this.engineOn);
    clearTimeout(this._engineWatchdog);
    if (this.engineOn) {
      this._engineGen = (this._engineGen || 0) + 1;
      const gen = this._engineGen;
      $('endgame-engine-lines').innerHTML = `<div class="engine-line">${t('loading')}</div>`;
      engine.onLine = lines => this.showLines(lines);
      engine.analyse(this.board.fen, 2).catch(() => {});
      // See Analysis.restartEngine — guards a worker that spawns but never
      // emits a line (no crash event fires, so nothing else would notice).
      this._engineWatchdog = setTimeout(() => {
        if (gen !== this._engineGen || !this.engineOn) return;
        $('endgame-engine-lines').innerHTML = `<div class="engine-line">⚠️ ${t('engine_timeout')} <button class="btn small" id="endgame-engine-retry">${t('retry_btn')}</button></div>`;
        $('endgame-engine-retry').onclick = () => { this.toggleEngine(); this.toggleEngine(); };
      }, 8000);
    } else {
      engine.stop();
    }
  },

  showLines(lines) {
    if (!this.engineOn) return;
    clearTimeout(this._engineWatchdog);
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
    this.walker.stop();
    $('endgame-walk-row').classList.add('hidden');
    this.engineOn = false;
    $('endgame-engine').classList.add('hidden');
    $('endgame-engine-toggle').classList.remove('on');
    this.mode = 'practice';
    this.chess = new Chess(this.current.fen);
    this.over = false;
    this.thinking = false;
    this.bookMode = true;      // still replaying the book's move sequence
    this.moveIdx = 0;          // index into current.moves
    this.mistakes = 0;
    this.playerColor = practiceColor(this.current);
    $('endgame-comment').classList.add('hidden');
    $('endgame-status').classList.remove('hidden');
    $('endgame-practice-actions').style.display = 'flex';
    $('endgame-share').classList.add('hidden');
    $('endgame-practice-start').classList.add('hidden');
    this.board.setOrientation(this.playerColor);
    this.board.setPosition(this.chess.fen());
    // In a "the side to move is lost" study the player takes the winning side,
    // so the book has to make the losing move first — the same shape as a
    // tactics puzzle, where the opponent moves and you find the answer.
    if (this.chess.turn() !== this.playerColor) {
      this.board.interactive = false;
      this.setStatus(t('practice_opponent_first'));
      setTimeout(() => this.playOpeningBookMove(), 700);
      return;
    }
    this.board.interactive = true;
    this.setStatus(`${t('practice_you_are')} ${t(this.playerColor === 'w' ? 'white' : 'black')}`);
  },

  // Plays the losing side's first move so the player starts from the position
  // where the winning procedure actually has to be found.
  playOpeningBookMove() {
    if (this.mode !== 'practice' || this.over) return;
    let mv = null;
    try { mv = this.chess.move(uciToMove(this.current.moves[0])); } catch { mv = null; }
    if (mv) {
      this.moveIdx = 1;
      this.board.setPosition(this.chess.fen(), { from: mv.from, to: mv.to });
    }
    this.board.interactive = true;
    this.setStatus(`${t('practice_you_are')} ${t(this.playerColor === 'w' ? 'white' : 'black')}`);
  },

  setStatus(msg) { $('endgame-status').textContent = msg; },

  async userMove(mv) {
    // Ahead of the practice check on purpose: the walkthrough runs while
    // `mode` is still 'study', which is what keeps it out of the rated path.
    if (this.walker.active) { this.walker.checkMove(mv); return; }
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
      KaelQuotes.chatter(pickKael(KAEL_ALT_MOVE));
      if (this.checkEnd()) return;
      this.board.interactive = true;
      this.setStatus(`${t('practice_you_are')} ${t(this.playerColor === 'w' ? 'white' : 'black')}`);
    } else {
      this.mistakes++;
      this.chess.undo();
      this.board.setPosition(preFen);
      Sound.play('puzzle-wrong');
      KaelQuotes.chatter(pickKael(KAEL_MISTAKE));
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
    // Running the book line to its end is a completed technique, so check that
    // before the game-over test. Some studies are "the side to move is lost" —
    // the player defends the losing side and the line ends in mate against
    // them. Testing checkEnd() first scored a perfect replay as a failure.
    if (this.moveIdx >= this.current.moves.length) { this.finishPractice(true); return; }
    if (this.checkEnd()) return;
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
    // Converted only — the ELO still moves either way, but a failed practice
    // no longer banks the day.
    if (success) Streak.recordActivity();
    if (success) this.recordConversion(cat);
    Badges.checkNew();
  },

  async recordConversion(cat) {
    const conv = await db.kvGet('endgameConverted', {});
    if (!conv[cat]) { conv[cat] = true; await db.kvSet('endgameConverted', conv); }
  },
};

// ═════════ LEARN TAB — sections 1 & 2 (Rules, Basic Checkmates) ═════════
// Lives on the Endgame object because it shares its screen, but it is a
// separate namespace with separate state. It persists NOTHING: no ELO, no
// history, no badges. That isolation is deliberate — only the Endings section
// may touch `endgameElo`, which is one of the four rated domains.

Endgame.Lessons = {
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
  // Walkthrough mode — see createWalker. Runs off demo.moves with no extra
  // lesson data. All five Basic Checkmates start with White, so the player
  // always moves first here.
  walker: null,

  init() {
    this.board = new Board($('learn-board'), {
      interactive: false,
      onMove: mv => this.checkPracticeMove(mv),
      onSound: type => Sound.play(type),
    });
    $('learn-back-cat').onclick = () => Endgame.showSections();
    $('learn-back-lessons').onclick = () => this.openCategory(this.category);
    $('learn-prev-lesson').onclick = () => this.openLesson(this.lessonIdx - 1);
    $('learn-next-lesson').onclick = () => this.openLesson(this.lessonIdx + 1);
    $('learn-practice-btn').onclick = () => this.startPractice();
    $('learn-demo-prev').onclick = () => this.demoStep(-1);
    $('learn-demo-next').onclick = () => this.demoStep(1);
    $('learn-demo-play').onclick = () => this.demoTogglePlay();
    this.walker = createWalker({
      board: () => this.board,
      fen: () => this.lessons[this.lessonIdx].fen,
      line: () => this.lessons[this.lessonIdx].demo.moves,
      orientation: () => this.lessons[this.lessonIdx].fen.split(' ')[1],
      playerFirst: () => true,
      ids: {
        nav: 'learn-walk-nav', back: 'learn-walk-back',
        show: 'learn-walk-show', counter: 'learn-walk-counter',
        status: 'learn-practice-status',
      },
      onStart: () => {
        this.practicing = false;
        this.vsEngine = false;
        clearInterval(this.demoTimer);
        this.demoTimer = null;
        $('learn-demo-nav').classList.add('hidden');
        $('learn-walk-btn').classList.add('hidden');
        $('learn-practice-btn').classList.add('hidden');
      },
      onFinish: () => {
        const lesson = this.lessons[this.lessonIdx];
        $('learn-walk-btn').classList.remove('hidden');
        $('learn-practice-btn').classList.toggle('hidden', !lesson.practice);
        // Hand the demo scrubber back pointing at the end of the line, so its
        // counter matches the position that is actually on the board.
        this.demoIdx = lesson.demo.moves.length;
        $('learn-demo-counter').textContent = `${this.demoIdx} / ${this.demoIdx}`;
        $('learn-demo-prev').disabled = false;
        $('learn-demo-next').disabled = true;
        $('learn-demo-nav').classList.remove('hidden');
      },
    });
    $('learn-walk-btn').onclick = () => this.walker.start();
    $('learn-walk-back').onclick = () => this.walker.back();
    $('learn-walk-show').onclick = () => this.walker.showMe();
  },

  openCategory(cat) {
    this.category = cat;
    Endgame.showView('learn-lesson-list-view');
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
    Endgame.showView('learn-lesson-view');
    $('learn-lesson-title').textContent = lesson.title[getLang()];
    $('learn-lesson-text').textContent = lesson.text[getLang()];
    this.practicing = false;
    this.vsEngine = false;
    this.walker.stop();
    clearInterval(this.demoTimer);
    this.demoTimer = null;
    $('learn-walk-btn').classList.toggle('hidden', !lesson.demo);
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
    this.walker.stop();
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
    if (this.walker.active) { this.walker.checkMove(mv); return; }
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
      // Lessons never counted for the streak before. Only the ones that carry
      // a practice section can — a demo-only lesson has nothing to finish.
      Streak.recordActivity();
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
      Streak.recordActivity();
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
      // Only hand the board back if we are still in vs-engine practice. The
      // engine can return after the player has left the lesson or switched to
      // the walkthrough, and re-enabling the board there is not ours to do.
      if (this.practicing) this.board.interactive = true;
    }
  },
};

// ═════════════════════ POSITION SETUP ═════════════════════

export const Setup = {
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
    // Two gestures already delete a piece: tap an occupied square with nothing
    // selected in the palette, or tap a square holding the piece you have
    // selected. A dedicated trash button was a third route to the same thing.
    if (!this.palettePiece) {
      delete this.grid[sq];
    } else {
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

  async done(mode) {
    const fen = this.buildFen();
    const pieces = Object.values(this.grid);
    const bothKings = pieces.some(p => p.type === 'k' && p.color === 'w')
                   && pieces.some(p => p.type === 'k' && p.color === 'b');
    const v = validateFen(fen);

    // Without two kings there is no position at all — nothing downstream can
    // work, so this stays a hard stop.
    if (!bothKings) { toast(t('invalid_position') + '♔+♚'); return; }

    // Everything else (a side already in check on the move, too many pawns,
    // impossible castling rights) is unusual but analysable. Studies and
    // composed positions land here routinely, so ask instead of refusing.
    if (!v.ok) {
      // askConfirm renders its argument as HTML, so escape the validator's
      // message rather than passing it through raw.
      const why = v.error ? `<br><span class="hint">${esc(v.error)}</span>` : '';
      const go = await askConfirm(esc(t('illegal_position_confirm')) + why);
      if (!go) return;
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
    const cur = Math.min(MAX_ENGINE_LINES, +(await db.kvGet('engineLines', 2)));
    for (let n = 1; n <= MAX_ENGINE_LINES; n++) {
      const b = document.createElement('button');
      b.textContent = n; b.dataset.v = n;
      if (cur === n) b.classList.add('on');
      seg2.appendChild(b);
    }
    segInit(seg2, async v => {
      await db.kvSet('engineLines', +v);
      Analysis.setLinesCount(+v);
    });
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
    // guided tour — the only way back into it once the first launch is over
    const lTour = document.createElement('label'); lTour.className = 'fld-label'; lTour.textContent = t('tour_prompt_title');
    const tourBtn = document.createElement('button'); tourBtn.className = 'btn'; tourBtn.style.width = '100%';
    tourBtn.textContent = t('tour_replay');
    // Close the settings sheet first: the tour dims the whole screen and the
    // first steps are on the Analysis board behind this modal.
    tourBtn.onclick = () => { close(null); setTimeout(() => Tour.start(tourCtx()), 120); };
    // privacy — what other players see when they open your profile from the
    // leaderboard. Same seg control as every setting above, so the sheet's
    // spacing and its light/dark styling come for free. Applies on tap: the
    // kvSet republishes the public doc immediately, like the rest of this sheet.
    const lPriv = document.createElement('label'); lPriv.className = 'fld-label'; lPriv.textContent = t('privacy_section');
    const segPriv = document.createElement('div'); segPriv.className = 'seg';
    const curVis = await db.kvGet('profileVisibility', 'public');
    for (const [v, key] of [['public', 'privacy_public'], ['private', 'privacy_private']]) {
      const b = document.createElement('button');
      b.textContent = t(key); b.dataset.v = v;
      if (curVis === v) b.classList.add('on');
      segPriv.appendChild(b);
    }
    segInit(segPriv, async v => {
      await db.kvSet('profileVisibility', v);
      toast(t(v === 'private' ? 'privacy_now_private' : 'privacy_now_public'));
    });
    const privHint = document.createElement('p'); privHint.className = 'hint'; privHint.textContent = t('privacy_hint');

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
    box.append(l1, seg, l2, seg2, l3, seg3, l4, seg4, lPriv, segPriv, privHint, lTour, tourBtn, lLegal, legalRow, about, ok);
  });
}

function relabel() {
  applyStatic();
  buildLevelSeg($('play-level'), +(segValue($('play-level')) ?? 2), true);
  buildLevelSeg($('trainer-level'), +(segValue($('trainer-level')) ?? 2));
  Puzzles.updateProgress?.();
  if (activeScreen === 'profile') Profile.refresh();
  if (activeScreen === 'endgame') Endgame.refreshLists();
}

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

export const RADAR_MIN = 800, RADAR_MAX = 2200;

export const Profile = {
  charts: {},

  init() {
    $('radar-pick').onclick = () => openRadarPicker();
    $('profile-edit-btn').onclick = () => this.openEditModal();
    $('profile-auth-btn').onclick = () => openAuthModal();
    $('profile-signout-btn').onclick = () => Auth.signOut();
    $('profile-delete-account-btn').onclick = () => this.deleteAccountFlow();
    $('profile-elo-puzzle-card').onclick = () => openEloHistoryModal('puzzleEloHistory', 'puzzle_elo');
    $('profile-elo-opening-card').onclick = () => openEloHistoryModal('openingEloHistory', 'opening_elo');
    $('profile-elo-endgame-card').onclick = () => openEloHistoryModal('endgameEloHistory', 'endgame_elo');
    $('profile-elo-blindfold-card').onclick = () => openEloHistoryModal('blindfoldEloHistory', 'blindfold_elo');
    $('profile-leaderboard-btn').onclick = () => Leaderboard.open();
    $('profile-friends-btn').onclick = () => Friends.open();
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
    $('profile-delete-account-btn').classList.toggle('hidden', !user);
    const profileName = await db.kvGet('profileName', '');
    $('profile-display-name').textContent = profileName || (user && (user.displayName || user.email)) || t('your_name');
  },

  // Terms §18 promises account + data deletion "anytime from Profile" —
  // this is that promise kept. Reauth is handled inline since Firebase
  // requires a "recent" login for this specific operation and a long-lived
  // session usually isn't recent enough.
  async deleteAccountFlow() {
    if (!await askConfirm(t('delete_account_confirm'))) return;
    try {
      await Auth.deleteAccount();
    } catch (e) {
      if (e.code === 'auth/requires-recent-login') {
        const providerId = Auth.user?.providerData[0]?.providerId;
        try {
          if (providerId !== 'google.com') {
            const password = await askPassword(t('delete_account_reauth_password'));
            if (!password) return;
            await Auth.reauthenticate(password);
          } else {
            await Auth.reauthenticate();
          }
          await Auth.deleteAccount();
        } catch (e2) {
          toast(t('delete_account_failed'));
          return;
        }
      } else {
        toast(t('delete_account_failed'));
        return;
      }
    }
    await db.clearAllLocalData();
    toast(t('delete_account_done'));
    setTimeout(() => location.reload(), 1200);
  },

  // The 37-tier ladder, as a readable list rather than a strip of artwork.
  // Collapsed it shows the tier you are on plus the next five, which is the
  // only part a player can act on; expanded it shows all 37 so the whole path
  // is inspectable. The expanded/collapsed choice lives on Profile so it
  // survives a refresh() within the session but never has to be stored.
  streakLadderOpen: false,

  renderStreakLadder() {
    const el = $('profile-streak-ladder');
    if (!el) return;
    const lang = getLang();
    const days = Streak.count;
    const idx = streakTierIndex(days);         // -1 when there is no streak
    const cur = idx >= 0 ? STREAK_TIERS[idx] : null;
    const next = STREAK_TIERS[idx + 1] || null;

    const dayLine = days > 0 ? t('streak_day_n').replace('{n}', days) : t('streak_none');
    let nextLine, pct;
    if (days === 0) {
      // "1 day to 1 day" is what the generic branch would print here, so the
      // no-streak state gets its own line: an invitation, not a countdown.
      pct = 0;
      nextLine = t('streak_none_hint');
    } else if (next) {
      // Progress runs from the tier you are standing on to the next one, not
      // from zero — otherwise every bar past the early tiers looks nearly full.
      const from = cur ? cur.days : 0;
      pct = Math.max(0, Math.min(100, Math.round(((days - from) / (next.days - from)) * 100)));
      nextLine = tn('streak_next_goal', next.days - days).replace('{tier}', next.label[lang]);
    } else {
      pct = 100;
      nextLine = t('streak_top_tier');
    }

    const open = this.streakLadderOpen;
    const start = open ? 0 : Math.max(0, idx);
    const end = open ? STREAK_TIERS.length : Math.min(STREAK_TIERS.length, Math.max(0, idx) + 6);
    const rows = STREAK_TIERS.slice(start, end).map((tier, i) => {
      const real = start + i;
      const unlocked = real <= idx;
      const state = unlocked
        ? `<span class="streak-tier-check" title="${esc(t('streak_unlocked'))}">✓</span>`
        : `<span class="streak-tier-away">${esc(tn('streak_locked_in', tier.days - days))}</span>`;
      return `<div class="streak-tier-row${unlocked ? ' unlocked' : ' locked'}${real === idx ? ' current' : ''}">
        <img src="streaks/${tier.icon}.png" alt="" loading="lazy">
        <span class="streak-tier-days">${esc(tier.label[lang])}</span>
        ${state}
      </div>`;
    }).join('');

    const toggleLabel = open ? t('streak_show_less') : t('streak_show_all').replace('{n}', STREAK_TIERS.length);
    const showToggle = open || end - start < STREAK_TIERS.length;

    // `--streak-icon` feeds the .streak-now::before heat haze in css/style.css:
    // a blurred copy of this same (already cached) PNG drifting up behind it.
    // Both the class and the property are withheld at day 0 so a locked flame
    // stays completely still. The icon name comes from STREAK_TIERS, never user
    // input, so it is safe inside url().
    // The URL must be ABSOLUTE. A relative one inside a custom property is
    // resolved by Chrome against the stylesheet that reads it, not against this
    // document, so `streaks/x.png` became `css/streaks/x.png` and 404'd.
    // document.baseURI gives the same absolute URL the <img> below resolves to,
    // so the browser reuses the one cached file rather than fetching a second.
    const nowIcon = streakIcon(days);
    const hazeUrl = new URL(`streaks/${nowIcon}.png`, document.baseURI).href;
    el.innerHTML = `<div class="streak-now${days > 0 ? ' has-flame' : ''}"${days > 0 ? ` style="--streak-icon:url(&quot;${hazeUrl}&quot;)"` : ''}>
        <img class="streak-now-icon${days > 0 ? '' : ' locked'}" src="streaks/${nowIcon}.png" alt="">
        <div class="streak-now-text">
          <div class="streak-now-day">${esc(dayLine)}</div>
          <div class="streak-now-next">${esc(nextLine)}</div>
          <div class="streak-now-bar"><span style="width:${pct}%"></span></div>
        </div>
      </div>
      <div class="streak-tier-list">${rows}</div>
      ${showToggle ? `<button class="btn small streak-ladder-more">${esc(toggleLabel)}</button>` : ''}
      ${this.streakHowHtml()}`;

    const btn = el.querySelector('.streak-ladder-more');
    if (btn) btn.onclick = () => { this.streakLadderOpen = !this.streakLadderOpen; this.renderStreakLadder(); };
    const how = el.querySelector('.streak-how-btn');
    if (how) how.onclick = () => { this.streakHowOpen = !this.streakHowOpen; this.renderStreakLadder(); };
  },

  // The rules the flame actually follows, in the one place the flame lives.
  // Every line here mirrors a real check in the code — if a streak trigger
  // changes, this list changes with it (see `noteStreakMove` and the
  // Streak.recordActivity call sites).
  streakHowHtml() {
    const open = this.streakHowOpen;
    const label = (open ? '▾ ' : '▸ ') + t('streak_how_title');
    if (!open) return `<button class="btn small streak-how-btn">${esc(label)}</button>`;
    const items = [
      ['🤖', 'streak_how_play'],
      ['🔍', 'streak_how_analysis'],
      ['📖', 'streak_how_openings'],
      ['🧩', 'streak_how_puzzles'],
      ['⚡', 'streak_how_rush'],
      ['🙈', 'streak_how_blindfold'],
      ['🎓', 'streak_how_endgame'],
      ['🎓', 'streak_how_lesson'],
    ].map(([ico, key]) =>
      `<li><span class="streak-how-ico">${ico}</span><span>${esc(t(key))}</span></li>`).join('');
    return `<button class="btn small streak-how-btn">${esc(label)}</button>
      <div class="streak-how-body">
        <p class="streak-how-lead">${esc(t('streak_how_lead'))}</p>
        <ul class="streak-how-list">${items}</ul>
        <p class="streak-how-foot">${esc(t('streak_how_day'))}</p>
        <p class="streak-how-foot">${esc(t('streak_how_missions'))}</p>
      </div>`;
  },

  async refresh() {
    // Re-read every time: the selection syncs across devices, so it can change
    // underneath us after a sign-in pulls the cloud copy down.
    radarSelection = await db.kvGet('radarThemes', null);
    await cleanStaleOpenings();
    await this.renderAccount();
    await Avatars.refresh();
    await DailyMissions.init();
    await Badges.checkNew();
    Badges.renderTrophyCase();
    this.renderStreakLadder();

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
      radarThemes().map(th => t('theme_' + th)),
      radarThemes().map(th => themeElo[th] ?? 1200));

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

// Every tracked theme earns a rating, but a radar with 28 spokes is unreadable
// on a phone, so the chart shows at most 13 at a time. Defaults to the original
// thirteen; the picker (still to build) writes a different set here.
const MAX_RADAR_THEMES = 13;
let radarSelection = null;
export function radarThemes() {
  const picked = (radarSelection ?? []).filter(th => PUZZLE_THEMES.includes(th));
  return picked.length ? picked.slice(0, MAX_RADAR_THEMES)
                       : PUZZLE_THEMES.slice(0, MAX_RADAR_THEMES);
}

// Lets the player choose which of the 28 radar-eligible themes to plot.
// Mating patterns are deliberately absent: they are shapes, not skills, and
// they would crowd out the motifs the chart exists to compare.
function openRadarPicker() {
  modal((box, close) => {
    const chosen = new Set(radarThemes());
    box.innerHTML = `<h3>${t('radar_pick_title')}</h3>
      <p class="hint">${esc(t('radar_pick_hint'))}</p>`;

    const counter = document.createElement('p');
    counter.className = 'hint';
    box.appendChild(counter);

    const rows = PUZZLE_THEMES.map(th => {
      const row = document.createElement('label');
      row.className = 'theme-pick-row';
      row.innerHTML = `<input type="checkbox" data-th="${th}"><span>${t('theme_' + th)}</span>`;
      box.appendChild(row);
      return row;
    });

    const sync = () => {
      counter.textContent = t('radar_pick_count').replace('{n}', chosen.size);
      const full = chosen.size >= MAX_RADAR_THEMES;
      for (const row of rows) {
        const cb = row.querySelector('input');
        cb.checked = chosen.has(cb.dataset.th);
        // Block the 14th rather than silently dropping it on save.
        cb.disabled = full && !cb.checked;
        row.classList.toggle('disabled', cb.disabled);
      }
    };
    sync();

    for (const row of rows) {
      const cb = row.querySelector('input');
      cb.onchange = () => {
        if (cb.checked) {
          if (chosen.size >= MAX_RADAR_THEMES) { cb.checked = false; toast(t('radar_pick_full')); return; }
          chosen.add(cb.dataset.th);
        } else {
          chosen.delete(cb.dataset.th);
        }
        sync();
      };
    }

    const apply = document.createElement('button');
    apply.className = 'btn primary big';
    apply.textContent = t('apply');
    apply.onclick = async () => {
      // An empty pick means "use the default set", not "plot nothing".
      const list = chosen.size ? PUZZLE_THEMES.filter(th => chosen.has(th)) : null;
      radarSelection = list;
      await db.kvSet('radarThemes', list);
      close(null);
      Profile.refresh();
    };

    const reset = document.createElement('button');
    reset.className = 'btn';
    reset.style.marginTop = '8px';
    reset.textContent = t('radar_reset');
    reset.onclick = () => { chosen.clear(); PUZZLE_THEMES.slice(0, MAX_RADAR_THEMES).forEach(th => chosen.add(th)); sync(); };

    box.append(apply, reset);
  });
}

// ═════════════════════ init ═════════════════════

async function main() {
  const splashStart = Date.now();
  await ColorMode.init();
  await Sound.init();
  applyStatic();
  Analysis.init();
  Base.init();
  Play.init();
  History.init();
  Trainer.init();
  Puzzles.init();
  Rush.init();
  Blind.init();
  Endgame.init();
  KaelQuotes.init();
  Profile.init();
  Leaderboard.init();
  PublicProfile.init();
  Friends.init();
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
      Puzzles.difficulty = await db.kvGet('puzzleDifficulty', 0);
      Puzzles.autoNext = await db.kvGet('puzzleAutoNext', false);
      Puzzles.updateEloBadge();
      Puzzles.updateProgress();
      // Signing in can move the rating by hundreds of points. The band loaded
      // for the pre-sign-in rating is now the wrong one, so pull the right one
      // in — otherwise the next puzzle is drawn from a pool the player has
      // long outgrown.
      ensureForRating(Puzzles.targetRating()).catch(() => {});
    }
    Endgame.elo = await db.kvGet('endgameElo', {});
    if (Blind.loaded) {
      Blind.elo = await db.kvGet('blindfoldElo', 1200);
      Blind.updateEloBadge();
    }
    if (activeScreen === 'endgame') Endgame.refreshLists();
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
