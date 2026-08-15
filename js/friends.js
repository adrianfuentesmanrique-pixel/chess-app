// Friends — the screens, plus username search and sending a request.
// Commits 2 and 3 of docs/superpowers/plans/2026-08-14-friends-system.md.
//
// The Friends and Requests tabs still render empty lists: reading friendships
// and requests is commit 4/5. Only the Find tab talks to Firestore so far.
//
// Everything that arrives from Firestore is another user's text, so every one
// of those values goes through esc() before it reaches innerHTML.
//
// Imports from js/app.js (cycle) — every app.js binding used here is touched
// inside a function only, never at module top level.
import { t } from './i18n.js';
import { avatarHtml } from './avatars.js';
import { LEADERBOARD_FIELDS } from './leaderboard.js';
import { Auth, searchByUsername, sendFriendRequest } from './firebase.js';
import { $, esc, toast, segInit, showScreen } from './app.js';

export const Friends = {
  tab: 'list',
  field: 'puzzleElo',
  season: false,
  // Rows from the last search, and whether a search has actually been run —
  // an empty box must not show "no player found".
  results: [],
  searched: false,
  // uids already asked in this session, so the row's button stays spent even
  // if the same search is run again.
  sent: new Set(),

  init() {
    $('friends-back').onclick = () => showScreen('profile');
    segInit($('friends-mode'), v => { this.tab = v; this.render(); });
    $('friends-lb-btn').onclick = () => this.openLeaderboard();
    $('friends-search-btn').onclick = () => this.search();
    $('friends-search').addEventListener('keydown', e => {
      if (e.key === 'Enter') this.search();
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
    const n = 0;
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
    const list = [];   // commit 5 reads friendships here
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
    const incoming = [];   // commit 4 reads friendRequests here
    const outgoing = [];

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
    const signedIn = !!Auth.user;
    $('friends-search').disabled = !signedIn;
    $('friends-search-btn').disabled = !signedIn;
    $('friends-signin').classList.toggle('hidden', signedIn);

    const el = $('friends-results');
    el.innerHTML = '';
    for (const e of this.results) {
      // Your own account can be found by its username like anyone else's. It
      // gets a note instead of a button rather than being filtered out — a
      // missing row would just look like search is broken.
      const self = signedIn && e.uid === Auth.user.uid;
      const done = this.sent.has(e.uid);
      const actions = (self || done) ? [] : [
        { cls: 'btn small primary', key: 'friends_add', on: btn => this.sendRequest(e.uid, btn) },
      ];
      const note = self ? t('friends_self') : (done ? t('friends_pending') : '');
      el.appendChild(this.personRow(e, actions, note));
    }
    $('friends-no-match').classList.toggle('hidden',
      !signedIn || this.results.length > 0 || !this.searched);
  },

  async search() {
    if (!Auth.user) return;
    const typed = $('friends-search').value.trim();
    this.results = [];
    this.searched = !!typed;
    if (typed) {
      const btn = $('friends-search-btn');
      btn.disabled = true;
      try {
        this.results = await searchByUsername(typed);
      } catch (e) {
        console.error('Friend search failed', e);
      }
    }
    this.renderFind();
  },

  // Every outcome looks identical from here: sent, already sent, or blocked by
  // the person being asked. A permission error means one of the last two, and
  // telling them apart is exactly what a block must never allow. Do not turn
  // this into a helpful error message.
  async sendRequest(toUid, btn) {
    if (btn) btn.disabled = true;
    try {
      await sendFriendRequest(toUid);
    } catch (e) {
      console.error('Friend request failed', e);
    }
    this.sent.add(toUid);
    toast(t('friends_sent_toast'));
    this.renderFind();
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
    // Handlers are attached after the markup exists, so nothing user-supplied
    // is ever interpolated into an inline attribute.
    const els = row.querySelectorAll('.fr-actions .btn');
    actions.forEach((a, i) => { if (a.on) els[i].onclick = () => a.on(els[i]); });
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

    const list = []   // commit 6 fetches the friends' leaderboard rows here
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
