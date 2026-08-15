// Friends — the screens, username search and sending a request, the live
// Requests tab and the live Friends list. Commits 2 to 5 of
// docs/superpowers/plans/2026-08-14-friends-system.md.
//
// The friends leaderboard is still empty: that is commit 6.
//
// Everything that arrives from Firestore is another user's text, so every one
// of those values goes through esc() before it reaches innerHTML.
//
// Imports from js/app.js (cycle) — every app.js binding used here is touched
// inside a function only, never at module top level.
import { t } from './i18n.js';
import { avatarHtml } from './avatars.js';
import { LEADERBOARD_FIELDS, PublicProfile } from './leaderboard.js';
import {
  Auth, searchByUsername, sendFriendRequest,
  fetchIncomingRequests, fetchOutgoingRequests, fetchLeaderboardByUids,
  acceptFriendRequest, rejectFriendRequest, cancelFriendRequest,
  fetchFriendUids,
} from './firebase.js';
import { $, esc, toast, segInit, showScreen, activeScreen } from './app.js';

// The client-side cap from the plan. fetchFriendUids() reads at most this many
// documents, so a list already at the cap cannot hide a 101st friend from it.
const FRIEND_LIMIT = 100;

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
  // The two request lists, already joined to their public leaderboard rows.
  incoming: [],
  outgoing: [],
  // The friends list, joined the same way, and whether it has ever been loaded
  // — the cap check must not read an empty array that simply has not arrived.
  friends: [],
  friendsLoaded: false,

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

    // Signing in or out changes whose requests these are, so the lists and the
    // Profile pill are rebuilt from scratch each time. The friends list is
    // only invalidated here, not refetched — up to 100 document reads on every
    // boot for someone who never opens the tab. It reloads when the tab does.
    Auth.onChange(() => {
      this.loadRequests();
      this.friends = [];
      this.friendsLoaded = false;
      if (activeScreen === 'friends' && this.tab === 'list') this.loadFriends();
    });
    this.loadRequests();
  },

  open() {
    showScreen('friends');
    this.render();
  },

  // The gold pill on the Profile tab's Friends button — the number of requests
  // waiting on me. It is painted from the list that was last loaded, never
  // counted with a second query.
  paintCount() {
    const n = this.incoming.length;
    const pill = $('profile-friends-count');
    pill.textContent = n;
    pill.classList.toggle('hidden', n === 0);
  },

  // Both queries, then one batch of public profiles for every uid in either
  // list. Signed out, everything empties — including the pill.
  async loadRequests() {
    if (!Auth.user) {
      this.incoming = [];
      this.outgoing = [];
    } else {
      try {
        const [inc, out] = await Promise.all([fetchIncomingRequests(), fetchOutgoingRequests()]);
        const people = await fetchLeaderboardByUids(
          inc.map(r => r.from).concat(out.map(r => r.to)));
        // A request whose sender has no public document still gets a row, so it
        // can be accepted or rejected instead of silently disappearing.
        this.incoming = inc.map(r => ({ ...(people[r.from] || {}), uid: r.from }));
        this.outgoing = out.map(r => ({ ...(people[r.to] || {}), uid: r.to }));
      } catch (e) {
        console.error('Loading friend requests failed', e);
      }
    }
    this.paintCount();
    if (activeScreen === 'friends' && this.tab === 'requests') this.renderRequests();
  },

  render() {
    for (const pane of ['list', 'requests', 'find']) {
      $('friends-pane-' + pane).classList.toggle('hidden', pane !== this.tab);
    }
    this.paintCount();
    if (this.tab === 'list') { this.renderList(); this.loadFriends(); }
    if (this.tab === 'requests') { this.renderRequests(); this.loadRequests(); }
    if (this.tab === 'find') this.renderFind();
  },

  // ── Friends tab ────────────────────────

  // One array-contains query for the uids, then the same batch of public
  // profiles the Requests tab uses. Names, avatars and ratings live only on
  // /leaderboard, so nothing here can go stale.
  //
  // A friend with no public document still gets a row, with `?` for a name:
  // dropping it would hide a friendship that really exists.
  async loadFriends() {
    if (!Auth.user) {
      this.friends = [];
      this.friendsLoaded = true;
    } else {
      try {
        const uids = await fetchFriendUids();
        const people = await fetchLeaderboardByUids(uids);
        this.friends = uids.map(u => ({ ...(people[u] || {}), uid: u }))
          .sort((a, b) => (a.profileName || '').localeCompare(b.profileName || ''));
        this.friendsLoaded = true;
      } catch (e) {
        console.error('Loading friends failed', e);
      }
    }
    if (activeScreen === 'friends' && this.tab === 'list') this.renderList();
  },

  renderList() {
    const list = this.friends;
    const el = $('friends-list');
    el.innerHTML = '';
    $('friends-empty').classList.toggle('hidden', list.length > 0);
    for (const e of list) {
      const row = document.createElement('div');
      row.className = 'fr-row tappable';
      row.innerHTML =
        avatarHtml(e.avatarId, 36) +
        `<span class="fr-name">${esc(e.profileName || '?')}` +
        `<span class="fr-sub">${esc(e.username || '')}` +
        (e.puzzleElo != null ? ` · ELO ${Math.round(e.puzzleElo)}` : '') +
        `</span></span>` +
        // ⋯ opens Remove friend / Block in commit 7.
        `<button class="fr-more" aria-label="⋯">⋯</button>`;
      // Tapping the row opens the public profile, exactly as a leaderboard row
      // does — but ◀ comes back here instead of to the leaderboard.
      row.onclick = () => PublicProfile.open(e, 'friends');
      // ⋯ is inert until commit 7; it must not open the profile in the meantime.
      row.querySelector('.fr-more').onclick = ev => ev.stopPropagation();
      el.appendChild(row);
    }
  },

  // ── Requests tab ───────────────────────
  renderRequests() {
    const incoming = this.incoming;
    const outgoing = this.outgoing;

    const inEl = $('friends-incoming');
    inEl.innerHTML = '';
    for (const e of incoming) {
      inEl.appendChild(this.personRow(e, [
        { cls: 'btn small primary', key: 'friends_accept', on: b => this.accept(e.uid, b) },
        { cls: 'btn small', key: 'friends_reject', on: b => this.reject(e.uid, b) },
      ]));
    }

    const outEl = $('friends-outgoing');
    outEl.innerHTML = '';
    for (const e of outgoing) {
      outEl.appendChild(this.personRow(e, [
        { cls: 'btn small', key: 'friends_cancel_req', on: b => this.cancel(e.uid, b) },
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
    // The cap is about my own list, not about them, so saying so out loud
    // leaks nothing — and it is checked against a list that has actually been
    // fetched, never against an empty one that simply has not arrived yet.
    if (!this.friendsLoaded) await this.loadFriends();
    if (this.friends.length >= FRIEND_LIMIT) {
      toast(t('friends_max'));
      if (btn) btn.disabled = false;
      return;
    }
    try {
      await sendFriendRequest(toUid);
    } catch (e) {
      console.error('Friend request failed', e);
    }
    this.sent.add(toUid);
    toast(t('friends_sent_toast'));
    this.renderFind();
  },

  // Both buttons of a row go dead the moment either is pressed, so a double tap
  // cannot fire accept and reject at the same request.
  freezeRow(btn) {
    const row = btn && btn.closest('.fr-row');
    if (row) row.querySelectorAll('.btn').forEach(b => { b.disabled = true; });
  },

  // Create the friendship, then delete the request — that order is required by
  // the rules, see acceptFriendRequest in js/firebase.js.
  async accept(uid, btn) {
    this.freezeRow(btn);
    try {
      await acceptFriendRequest(uid);
      toast(t('friends_accepted_toast'));
    } catch (e) {
      console.error('Accepting a friend request failed', e);
    }
    await this.loadRequests();
  },

  // The row leaves my list and nothing happens on the sender's side at all.
  async reject(uid, btn) {
    this.freezeRow(btn);
    try {
      await rejectFriendRequest(uid);
    } catch (e) {
      console.error('Rejecting a friend request failed', e);
    }
    await this.loadRequests();
  },

  async cancel(uid, btn) {
    this.freezeRow(btn);
    try {
      await cancelFriendRequest(uid);
    } catch (e) {
      console.error('Cancelling a friend request failed', e);
    }
    // A cancelled uid can be asked again, so the spent search row is released.
    this.sent.delete(uid);
    await this.loadRequests();
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
