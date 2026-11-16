// Avatar catalogue, rendering, and the picker grid.
// Extracted verbatim from js/app.js.
//
// Imports from js/app.js (cycle) — every app.js binding used here is only
// touched inside a function, never at module top level.
import { t, getLang } from './i18n.js';
import * as db from './db.js';
import { $, toast, modal, showScreen, Profile } from './app.js';
import { Auth } from './firebase.js';
import { streakAvatarOpen, streakRewardsCrossed } from './wall-rules.js';
import { BadgeCard } from './badge-card.js';

// The streak icons, in order: Profile's streak ladder shows them on its rungs.
export const STREAK_AVATARS = () => AVATAR_OPTIONS.filter(o => o.streakDays);

// Called when the best streak grows from `before` to `after`: each streak icon
// just won gets the achievement card. Tapping it opens the icon picker.
function celebrateStreak(before, after) {
  const won = streakRewardsCrossed(AVATAR_OPTIONS, before, after);
  if (!won.length) return;
  BadgeCard.enqueue(won.map(o => ({
    id: 'avatar_' + o.id,
    img: `avatars/${o.id}.png`,
    kicker: () => t('avatar_won_kicker'),
    label: () => t('avatar_won_name').replace('{n}', o.name[getLang()]).replace('{d}', o.label[getLang()]),
    onTap: () => { showScreen('profile'); setTimeout(() => Profile.openEditModal(), 450); },
  })));
}

// Baby Kael is the beta testers' thank-you (Adrian, 2026-10-28): everyone who
// was here before the Play Store launch on 21 October 2026 - an account made
// before that day, or a rating history on this phone that starts before it.
// Once earned it is kept (kv testerAvatar, synced with the account).
const TESTER_CUTOFF = '2026-10-21';
const HISTORY_KEYS = ['puzzleEloHistory', 'openingEloHistory', 'endgameEloHistory', 'blindfoldEloHistory', 'calcEloHistory'];

async function isTester() {
  if (await db.kvGet('testerAvatar', false) === true) return true;
  let early = false;
  const made = Auth.user?.metadata?.creationTime;
  if (made) {
    const d = new Date(made), p = n => String(n).padStart(2, '0');
    early = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` < TESTER_CUTOFF;
  }
  for (const k of HISTORY_KEYS) {
    if (early) break;
    const h = await db.kvGet(k, []);
    early = Array.isArray(h) && h.some(e => typeof e?.date === 'string' && e.date < TESTER_CUTOFF);
  }
  if (early) await db.kvSet('testerAvatar', true);
  return early;
}

// The thank-you card (Adrian, 2026-10-28): once per tester, on whichever device
// first sees them (kv testerThanksShown, synced). Never over another dialog -
// the onboarding, a sign-in sheet - it waits for the next chance instead.
let thanking = false;
async function thankTester() {
  if (thanking || !(await isTester()) || await db.kvGet('testerThanksShown', false) === true) return;
  if ($('modal-root')?.children.length) return;
  thanking = true;
  await db.kvSet('testerThanksShown', true);
  const use = await modal((box, close) => {
    box.classList.add('tester-thanks');
    box.innerHTML = `<div class="tester-thanks-pic"><img src="avatars/kael_baby.png" alt="" width="150" height="150"></div>`
      + `<h3 class="stage-sheet-title">${t('tester_thanks_title')}</h3>`
      + `<p class="stage-sheet-text">${t('tester_thanks_text')}</p>`
      + `<p class="tester-thanks-name">${t('tester_thanks_name')}</p>`
      + `<p class="hint stage-sheet-hint">${t('tester_thanks_only')}</p>`;
    const go = document.createElement('button');
    go.className = 'btn big stage-gold'; go.textContent = t('tester_thanks_use'); go.onclick = () => close(true);
    const later = document.createElement('button');
    later.className = 'btn stage-again'; later.textContent = t('tester_thanks_later'); later.onclick = () => close(false);
    box.append(go, later);
  });
  thanking = false;
  if (use) {
    await db.kvSet('avatarId', 'kael_baby');
    await Avatars.refresh();
    toast(t('tester_thanks_done'));
  }
}

// ═════════════════════ AVATARS ═════════════════════
// The pictures come from tools/build_avatars.py; this table is only the
// catalogue, so new art drops in without touching the storage or selection
// logic. Ids are permanent -- they are what a player's choice is saved as.

export const AVATAR_OPTIONS = [
  // free
  { id: 'pawn_w' }, { id: 'pawn_b' }, { id: 'knight_w' }, { id: 'knight_b' },
  { id: 'bishop_w' }, { id: 'bishop_b' }, { id: 'rook_w' }, { id: 'rook_b' },
  { id: 'queen_w' }, { id: 'queen_b' }, { id: 'king_w' }, { id: 'king_b' },
  { id: 'wolf' }, { id: 'lion' }, { id: 'tiger' },
  { id: 'eagle' }, { id: 'owl' }, { id: 'bear' }, { id: 'raven' },
  // the beta testers' own (isTester above); locked for everyone else
  { id: 'kael_baby', tester: true },
  // earned with the streak (Adrian, 2026-11-11): unlocked by the BEST streak
  // ever (kv bestStreak), so a lost streak never takes one back.
  // `label` is the streak it needs, `name` the icon's own name.
  { id: 'fire', streakDays: 7, label: { es: '7 días', en: '7 days' }, name: { es: 'Fuego', en: 'Fire' } },
  { id: 'ice', streakDays: 30, label: { es: '1 mes', en: '1 month' }, name: { es: 'Hielo', en: 'Ice' } },
  { id: 'storm', streakDays: 90, label: { es: '3 meses', en: '3 months' }, name: { es: 'Tormenta', en: 'Storm' } },
  { id: 'crystal', streakDays: 180, label: { es: '6 meses', en: '6 months' }, name: { es: 'Cristal', en: 'Crystal' } },
  { id: 'shadow', streakDays: 360, label: { es: '1 año', en: '1 year' }, name: { es: 'Sombra', en: 'Shadow' } },
  // coming soon — shown locked to everyone as a preview of future content
  { id: 'dragon', locked: true }, { id: 'phoenix', locked: true }, { id: 'griffin', locked: true },
  { id: 'kraken', locked: true }, { id: 'hydra', locked: true }, { id: 'galaxy', locked: true },
  { id: 'void', locked: true },
];

export function avatarHtml(avatarId, sizePx = 40) {
  const opt = AVATAR_OPTIONS.find(a => a.id === avatarId) ?? AVATAR_OPTIONS[0];
  return `<div class="avatar-badge" style="width:${sizePx}px;height:${sizePx}px"><img src="avatars/${opt.id}.png" alt="" width="${sizePx}" height="${sizePx}"></div>`;
}

export const Avatars = {
  thankTester,
  celebrateStreak,

  async renderGridInto(container, selectedId, onPick) {
    container.innerHTML = '';
    const tester = await isTester();
    const best = await db.kvGet('bestStreak', 0);
    const lang = getLang();
    for (const opt of AVATAR_OPTIONS) {
      const locked = !!opt.locked || (opt.tester && !tester) || !streakAvatarOpen(opt, best);
      const cell = document.createElement('div');
      cell.className = 'avatar-pick-cell' + (locked ? ' locked' : '') + (opt.tester ? ' tester' : '')
        + (opt.streakDays ? ' streak' : '');
      cell.dataset.id = opt.id;
      cell.classList.toggle('selected', opt.id === selectedId);
      // A streak icon still to earn says how long a streak it needs.
      const days = opt.streakDays && locked ? `<span class="avatar-days">🔥 ${opt.label[lang]}</span>` : '';
      cell.innerHTML = avatarHtml(opt.id, 44) + (locked ? '<span class="avatar-lock">🔒</span>' : '') + days;
      cell.onclick = () => {
        if (!locked) onPick(opt.id);
        else if (opt.streakDays) toast(t('avatar_streak_toast').replace('{d}', opt.label[lang]));
        else toast(t(opt.tester ? 'avatar_tester_toast' : 'avatar_locked_toast'));
      };
      container.appendChild(cell);
    }
  },

  async refresh() {
    const id = await db.kvGet('avatarId', AVATAR_OPTIONS[0].id);
    $('profile-avatar-wrap').innerHTML = avatarHtml(id, 56);
    this.paintTopbar(id);
    return id;
  },

  // The top bar's shortcut to Profile (#btn-profile) wears the same picture.
  async paintTopbar(id) {
    id ??= await db.kvGet('avatarId', AVATAR_OPTIONS[0].id);
    const pic = $('btn-profile-pic');
    if (pic) pic.innerHTML = avatarHtml(id, 32);
  },
};
