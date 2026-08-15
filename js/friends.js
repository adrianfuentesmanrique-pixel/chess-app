// Friends — the screens only. Commit 2 of
// docs/superpowers/plans/2026-08-14-friends-system.md.
//
// There is deliberately NO Firestore in this file yet. Every list below is
// filled from SAMPLE, a handful of local fake rows, so the screens can be
// looked at with content in them. Flip `Friends.sample = false` in the console
// to see every empty state instead.
//
// Commit 3 replaces SAMPLE with real search + request writes. When it does,
// delete SAMPLE and the `sample` flag — nothing else in here should need to
// move, because the render functions already take a list.
//
// Imports from js/app.js (cycle) — every app.js binding used here is touched
// inside a function only, never at module top level.
import { t } from './i18n.js';
import { avatarHtml } from './avatars.js';
import { LEADERBOARD_FIELDS } from './leaderboard.js';
import { $, esc, segInit, showScreen } from './app.js';

// ── fake data, commit 2 only ─────────────
// Shaped like a /leaderboard document so the render code written here is the
// render code commit 5 keeps.
const SAMPLE = {
  friends: [
    { uid: 'u1', profileName: 'Kael', username: 'kael', avatarId: 'knight_w', puzzleElo: 1840, rushBest180: 24, rushBest300: 38, blindfoldElo: 1510 },
    { uid: 'u2', profileName: 'Ana Sofía', username: 'anasofia', avatarId: 'owl', puzzleElo: 1620, rushBest180: 19, rushBest300: 31, blindfoldElo: 1290 },
    { uid: 'u3', profileName: 'MagnusFan2011', username: 'magnusfan2011', avatarId: 'lion', puzzleElo: 1355, rushBest180: 11, rushBest300: 17, blindfoldElo: 1200 },
  ],
  incoming: [
    { uid: 'u4', profileName: 'Diego', username: 'diego_pty', avatarId: 'bear', puzzleElo: 1490 },
    { uid: 'u5', profileName: 'rook_lover', username: 'rook_lover', avatarId: 'rook_b', puzzleElo: 1710 },
  ],
  outgoing: [
    { uid: 'u6', profileName: 'Valentina', username: 'valen', avatarId: 'raven', puzzleElo: 1580 },
  ],
  results: [
    { uid: 'u7', profileName: 'Magnus', username: 'magnus', avatarId: 'eagle', puzzleElo: 2250 },
  ],
};

export const Friends = {
  sample: true,
  tab: 'list',
  field: 'puzzleElo',
  season: false,

  init() {
    $('friends-back').onclick = () => showScreen('profile');
    segInit($('friends-mode'), v => { this.tab = v; this.render(); });
    $('friends-lb-btn').onclick = () => this.openLeaderboard();
    // Inert until commit 3: the Find tab has nothing to query yet.
    $('friends-search-btn').onclick = () => this.render();
    $('friends-search').addEventListener('keydown', e => {
      if (e.key === 'Enter') this.render();
    });

    $('flb-back').onclick = () => this.open();
    segInit($('flb-mode'), v => { this.field = v; this.renderLeaderboard(); });
    segInit($('flb-period'), v => { this.season = v === 'month'; this.renderLeaderboard(); });

    this.refreshCount();
  },

  open() {
    showScreen('friends');
    this.render();
  },

  // The gold pill on the Profile tab's Friends button. Commit 4 feeds it the
  // real incoming-request count.
  refreshCount() {
    const n = this.sample ? SAMPLE.incoming.length : 0;
    const pill = $('profile-friends-count');
    pill.textContent = n;
    pill.classList.toggle('hidden', n === 0);
  },

  render() {
    for (const pane of ['list', 'requests', 'find']) {
      $('friends-pane-' + pane).classList.toggle('hidden', pane !== this.tab);
    }
    this.refreshCount();
    if (this.tab === 'list') this.renderList();
    if (this.tab === 'requests') this.renderRequests();
    if (this.tab === 'find') this.renderFind();
  },

  // ── Friends tab ────────────────────────
  renderList() {
    const list = this.sample ? SAMPLE.friends : [];
    const el = $('friends-list');
    el.innerHTML = '';
    $('friends-empty').classList.toggle('hidden', list.length > 0);
    for (const e of list) {
      const row = document.createElement('div');
      row.className = 'fr-row';
      row.innerHTML =
        avatarHtml(e.avatarId, 36) +
        `<span class="fr-name">${esc(e.profileName || '?')}` +
        `<span class="fr-sub">${esc(e.username || '')}</span></span>` +
        // ⋯ opens Remove friend / Block in commit 7.
        `<button class="fr-more" aria-label="⋯">⋯</button>`;
      el.appendChild(row);
    }
  },

  // ── Requests tab ───────────────────────
  renderRequests() {
    const incoming = this.sample ? SAMPLE.incoming : [];
    const outgoing = this.sample ? SAMPLE.outgoing : [];

    const inEl = $('friends-incoming');
    inEl.innerHTML = '';
    for (const e of incoming) {
      inEl.appendChild(this.personRow(e, [
        { cls: 'btn small primary', key: 'friends_accept' },
        { cls: 'btn small', key: 'friends_reject' },
      ]));
    }

    const outEl = $('friends-outgoing');
    outEl.innerHTML = '';
    for (const e of outgoing) {
      outEl.appendChild(this.personRow(e, [
        { cls: 'btn small', key: 'friends_cancel_req' },
      ], t('friends_pending')));
    }

    // Each group hides itself when empty; one hint covers both being empty.
    $('friends-incoming-group').classList.toggle('hidden', !incoming.length);
    $('friends-outgoing-group').classList.toggle('hidden', !outgoing.length);
    $('friends-none-pending').classList.toggle('hidden', !!(incoming.length || outgoing.length));
  },

  // ── Find tab ───────────────────────────
  renderFind() {
    const typed = $('friends-search').value.trim();
    // Nothing is queried in this commit — a non-empty box shows the sample
    // result so the row and its button can be judged, an empty one shows the
    // "no player found" state.
    const results = this.sample && typed ? SAMPLE.results : [];
    const el = $('friends-results');
    el.innerHTML = '';
    for (const e of results) {
      el.appendChild(this.personRow(e, [
        { cls: 'btn small primary', key: 'friends_add' },
      ]));
    }
    $('friends-no-match').classList.toggle('hidden', results.length > 0 || !typed);
  },

  // Avatar + name over a row of actions. Stacked rather than side by side:
  // two Spanish action labels beside a username leave nothing for the name.
  personRow(e, actions, note) {
    const row = document.createElement('div');
    row.className = 'fr-row stack';
    const buttons = actions
      .map(a => `<button class="${a.cls}">${esc(t(a.key))}</button>`)
      .join('');
    row.innerHTML =
      avatarHtml(e.avatarId, 36) +
      `<span class="fr-name">${esc(e.profileName || '?')}` +
      `<span class="fr-sub">${esc(e.username || '')}` +
      // Usernames are not unique, so the rating is here to tell two of them
      // apart. "ELO 1490" needs no string of its own — same shape as log_rating.
      (e.puzzleElo != null ? ` · ELO ${Math.round(e.puzzleElo)}` : '') +
      `</span></span>` +
      `<span class="fr-actions">` +
      (note ? `<span class="fr-pending">${esc(note)}</span>` : '') +
      buttons + `</span>`;
    return row;
  },

  // ── Friends leaderboard ────────────────
  openLeaderboard() {
    showScreen('friends-leaderboard');
    this.renderLeaderboard();
  },

  renderLeaderboard() {
    const board = LEADERBOARD_FIELDS[this.field];
    // The period switch only appears on boards that actually have seasons —
    // same rule as the global leaderboard.
    $('flb-period').classList.toggle('hidden', !board.season);
    if (!board.season) this.season = false;
    const field = this.season && board.season ? board.season : this.field;

    const list = (this.sample ? SAMPLE.friends.slice() : [])
      .sort((a, b) => (b[field] ?? board.fallback) - (a[field] ?? board.fallback));

    $('flb-status').textContent = list.length ? '' : t('friends_lb_empty');
    const el = $('flb-list');
    el.innerHTML = '';
    list.forEach((e, i) => {
      const rank = i + 1;
      const value = Math.round(e[field] ?? board.fallback);
      const item = document.createElement('button');
      item.className = 'lb-row ' + (rank <= 3 ? 'tier-podium tier-' + rank : '');
      item.innerHTML =
        `<span class="lb-rank">${rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank}</span>` +
        avatarHtml(e.avatarId, 36) +
        `<span class="lb-name">${esc(e.profileName || '?')}</span>` +
        `<span class="lb-value">${value}</span>`;
      el.appendChild(item);
    });
  },
};
