// The Wall of Flames (Muro de Fuego): every player's streak, as a podium and a
// list. Opened from the button in Profile's "Streak progress" card.
//
// It reads the public /leaderboard docs, which carry streakCount, streakLastDate
// and bestStreak only while a profile is public (PUBLIC_DETAIL_KEYS in
// js/firebase.js) — so a private player is simply not on the wall.
//
// Imports from js/app.js (cycle) are only touched inside methods.
import { t, tn } from './i18n.js';
import * as db from './db.js';
import { Auth, fetchLeaderboard } from './firebase.js';
import { avatarHtml } from './avatars.js';
import { rankTier, PublicProfile } from './leaderboard.js';
import { wallRows, streakAlive } from './wall-rules.js';
import { $, esc, segInit, showScreen, streakIcon, Streak } from './app.js';

// Over-fetched, then filtered: "Now" drops the broken streaks that players who
// stopped coming still carry (the same pattern as the Rush "this month" board).
const FETCH = { now: { n: 500, field: 'streakCount' }, record: { n: 200, field: 'bestStreak' } };
// A fetch is reused for a few minutes, so going back and forth costs no reads.
const KEEP_MS = 5 * 60 * 1000;

export const Wall = {
  mode: 'now',
  cache: {},          // mode -> { at, rows }
  myRank: null,       // { rank, of } from the last "Now" list, for the button

  init() {
    $('wall-back').onclick = () => showScreen('profile');
    $('profile-wall-btn').onclick = () => this.open();
    segInit($('wall-mode'), v => { this.mode = v; this.load(); });
  },

  open() {
    showScreen('wall');
    this.load();
  },

  async load() {
    const mode = this.mode;
    $('wall-sub').textContent = t(mode === 'record' ? 'wall_sub_record' : 'wall_sub_now');
    let hit = this.cache[mode];
    if (!hit || Date.now() - hit.at > KEEP_MS) {
      $('wall-podium').innerHTML = ''; $('wall-me').innerHTML = ''; $('wall-list').innerHTML = '';
      $('wall-status').textContent = t('loading');
      try {
        const { n, field } = FETCH[mode];
        hit = this.cache[mode] = { at: Date.now(), rows: wallRows(await fetchLeaderboard(n, field), mode) };
      } catch (e) {
        $('wall-status').textContent = '⚠️ ' + (e.message || e);
        return;
      }
    }
    if (mode !== this.mode) return;   // switched while loading
    await this.render(hit.rows, mode);
  },

  async render(rows, mode) {
    const uid = Auth.user?.uid;
    const at = uid ? rows.findIndex(r => r.uid === uid) : -1;
    if (mode === 'now') { this.myRank = at >= 0 ? { rank: at + 1, of: rows.length } : null; this.paintButton(); }
    $('wall-status').textContent = rows.length ? '' : t('wall_empty');

    const days = n => esc(tn('wall_days', n));
    const icon = n => `streaks/${streakIcon(n)}.png`;
    const pod = (r, place) => !r ? '<div></div>' : `
      <button class="pod p${place}" data-i="${place - 1}">
        <span class="pod-av">${place === 1 ? '<span class="pod-crown" aria-hidden="true">👑</span>' : ''}
          ${avatarHtml(r.avatarId, place === 1 ? 72 : 58)}<img class="pod-tier" src="${icon(r.days)}" alt=""></span>
        <span class="pod-name">${esc(r.profileName || r.username || '?')}</span>
        <span class="pod-days">${days(r.days)}</span>
        <span class="pod-step">${place}</span>
      </button>`;
    $('wall-podium').innerHTML = rows.length ? pod(rows[1], 2) + pod(rows[0], 1) + pod(rows[2], 3) : '';

    const row = (r, rank, me) => `
      <button class="lb-row ${me ? 'wall-me-row' : rankTier(rank)}${uid && r.uid === uid ? ' lb-me' : ''}" data-i="${rank - 1}">
        <span class="lb-rank">${rank || '—'}</span>${avatarHtml(r.avatarId, 36)}
        <span class="lb-name">${esc(r.profileName || r.username || '?')}${me ? ` <small>(${esc(t('wall_you'))})</small>` : ''}</span>
        <span class="wall-val"><img src="${icon(r.days)}" alt="">${r.days}</span>
      </button>`;
    $('wall-list').innerHTML = rows.slice(3).map((r, i) => row(r, i + 4)).join('');
    $('wall-me').innerHTML = await this.mineHtml(rows, at, mode, row);

    const open = el => { const r = rows[+el.dataset.i]; if (r) PublicProfile.open(r, 'wall'); };
    document.querySelectorAll('#wall-podium .pod, #wall-list .lb-row, #wall-me .lb-row[data-i]')
      .forEach(el => { el.onclick = () => open(el); });
  },

  // "Your place": my row from the list, or my own number with no rank when I
  // am not on it (no streak, private profile, or below the fetched rows).
  async mineHtml(rows, at, mode, row) {
    const label = `<div class="wall-me-label">${esc(t('wall_mine'))}</div>`;
    if (!Auth.user) return label + `<p class="hint wall-me-hint">${esc(t('wall_signin'))}</p>`;
    if (at >= 0) return label + row(rows[at], at + 1, true).replace(/data-i="\d+"/, `data-i="${at}"`);
    const [count, last, best, avatarId, profileName, vis] = await Promise.all([
      db.kvGet('streakCount', 0), db.kvGet('streakLastDate', null), db.kvGet('bestStreak', 0),
      db.kvGet('avatarId', null), db.kvGet('profileName', ''), db.kvGet('profileVisibility', 'public')]);
    const n = mode === 'record' ? (+best || 0) : (streakAlive(last) ? (+count || 0) : 0);
    const mine = row({ avatarId, profileName, days: n }, 0, true).replace(/ data-i="[^"]*"/, '');
    const note = vis === 'private' ? `<p class="hint wall-me-hint">${esc(t('wall_private'))}</p>` : '';
    return label + mine + note;
  },

  // The button in the Streak progress card: my current flame, and my place on
  // "Now" once the wall has been opened (no read is made just for the button).
  paintButton() {
    const img = $('profile-wall-icon'), sub = $('profile-wall-sub');
    if (!img || !sub) return;
    img.src = `streaks/${streakIcon(Streak.count)}.png`;
    sub.textContent = this.myRank
      ? t('wall_rank').replace('{r}', this.myRank.rank).replace('{n}', this.myRank.of)
      : t('wall_btn_sub');
  },
};
