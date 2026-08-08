// Avatar catalogue, rendering, and the picker grid.
// Extracted verbatim from js/app.js.
//
// Imports from js/app.js (cycle) — every app.js binding used here is only
// touched inside a function, never at module top level.
import { t } from './i18n.js';
import * as db from './db.js';
import { $, toast } from './app.js';

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
  // coming soon — shown locked to everyone as a preview of future content
  { id: 'dragon', locked: true }, { id: 'phoenix', locked: true }, { id: 'griffin', locked: true },
  { id: 'kraken', locked: true }, { id: 'hydra', locked: true }, { id: 'galaxy', locked: true },
  { id: 'crystal', locked: true }, { id: 'shadow', locked: true }, { id: 'storm', locked: true },
  { id: 'fire', locked: true }, { id: 'ice', locked: true }, { id: 'void', locked: true },
];

export function avatarHtml(avatarId, sizePx = 40) {
  const opt = AVATAR_OPTIONS.find(a => a.id === avatarId) ?? AVATAR_OPTIONS[0];
  return `<div class="avatar-badge" style="width:${sizePx}px;height:${sizePx}px"><img src="avatars/${opt.id}.png" alt="" width="${sizePx}" height="${sizePx}"></div>`;
}

export const Avatars = {
  async renderGridInto(container, selectedId, onPick) {
    container.innerHTML = '';
    for (const opt of AVATAR_OPTIONS) {
      const locked = !!opt.locked;
      const cell = document.createElement('div');
      cell.className = 'avatar-pick-cell' + (locked ? ' locked' : '');
      cell.dataset.id = opt.id;
      cell.classList.toggle('selected', opt.id === selectedId);
      cell.innerHTML = avatarHtml(opt.id, 44) + (locked ? '<span class="avatar-lock">🔒</span>' : '');
      cell.onclick = () => { if (locked) toast(t('avatar_locked_toast')); else onPick(opt.id); };
      container.appendChild(cell);
    }
  },

  async refresh() {
    const id = await db.kvGet('avatarId', AVATAR_OPTIONS[0].id);
    $('profile-avatar-wrap').innerHTML = avatarHtml(id, 56);
    return id;
  },
};
