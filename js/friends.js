// Friends — the screens, username search and sending a request, the live
// Requests tab, the live Friends list, the friends leaderboard, and adding,
// removing and blocking a person. Commits 2 to 7 of
// docs/superpowers/plans/2026-08-14-friends-system.md.
//
// Everything that arrives from Firestore is another user's text, so every one
// of those values goes through esc() before it reaches innerHTML.
//
// Imports from js/app.js (cycle) — every app.js binding used here is touched
// inside a function only, never at module top level.
import { t } from './i18n.js';
import { avatarHtml } from './avatars.js';
import { LEADERBOARD_FIELDS, rankTier, PublicProfile } from './leaderboard.js';
import {
  Auth, searchByUsername, sendFriendRequest,
  fetchIncomingRequests, fetchOutgoingRequests, fetchLeaderboardByUids,
  acceptFriendRequest, rejectFriendRequest, cancelFriendRequest,
  fetchFriendUids, unfriend, blockUser, unblockUser, fetchBlockedUids,
} from './firebase.js';
import { $, esc, toast, sheet, askConfirm, segInit, showScreen, activeScreen, monthStr } from './app.js';

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
  // My own public leaderboard row, fetched in the same batch as the friends'.
  // Only the friends leaderboard uses it — I am not a row in my own list.
  me: null,
  // The people I have blocked, joined to their public rows the same way, and
  // whether that list has ever been fetched. Loaded only when the Blocked
  // screen is opened — nothing else in the app needs it.
  blocked: [],
  blockedLoaded: false,

  init() {
    $('friends-back').onclick = () => showScreen('profile');
    // ⋯ in the screen head. One item today; it is the drawer for anything else
    // that belongs to the whole Friends screen rather than to one row.
    $('friends-more').onclick = () => sheet([
      { label: t('friends_blocked_title'), action: () => this.openBlocked() },
    ]);
    $('fbl-back').onclick = () => this.open();
    // The ➕ Add friend button on a public profile is painted from here, because
    // its four states are answers about MY lists, not about the person being
    // looked at. See PublicProfile.onOpen in js/leaderboard.js.
    PublicProfile.onOpen = (entry, isSelf) => this.paintAddFriend(entry, isSelf);
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
      this.me = null;
      this.friendsLoaded = false;
      this.blocked = [];
      this.blockedLoaded = false;
      if (activeScreen === 'friends-blocked') this.loadBlocked();
      if (activeScreen === 'friends' && this.tab === 'list') this.loadFriends();
      if (activeScreen === 'friends-leaderboard') this.loadFriends();
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
      this.me = null;
      this.friendsLoaded = true;
    } else {
      try {
        const uids = await fetchFriendUids();
        // My own uid rides along in the same batch — the friends leaderboard
        // needs my scores and this is one extra document read, not a second
        // round trip. fetchFriendUids never returns me, so nothing is doubled.
        const myUid = Auth.user.uid;
        const people = await fetchLeaderboardByUids(uids.concat(myUid));
        this.me = people[myUid] || null;
        this.friends = uids.map(u => ({ ...(people[u] || {}), uid: u }))
          .sort((a, b) => (a.profileName || '').localeCompare(b.profileName || ''));
        this.friendsLoaded = true;
      } catch (e) {
        console.error('Loading friends failed', e);
      }
    }
    if (activeScreen === 'friends' && this.tab === 'list') this.renderList();
    if (activeScreen === 'friends-leaderboard') this.renderLeaderboard();
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
        `<button class="fr-more" aria-label="⋯">⋯</button>`;
      // Tapping the row opens the public profile, exactly as a leaderboard row
      // does — but ◀ comes back here instead of to the leaderboard.
      row.onclick = () => PublicProfile.open(e, 'friends');
      // stopPropagation so the menu does not also open the profile behind it.
      row.querySelector('.fr-more').onclick = ev => {
        ev.stopPropagation();
        this.rowMenu(e);
      };
      el.appendChild(row);
    }
  },

  // Both items are destructive and both go through askConfirm() — there is no
  // undo for either, and unfriending by mis-tap on a 36px target would be easy.
  rowMenu(e) {
    const name = e.profileName || '?';
    sheet([
      { label: t('friends_remove'), danger: true, action: () => this.confirmRemove(e.uid, name) },
      { label: t('friends_block'), danger: true, action: () => this.confirmBlock(e.uid, name) },
    ]);
  },

  // askConfirm() puts its message into innerHTML, so a name that came out of
  // Firestore is escaped before it is substituted for {n}.
  confirmText(key, name) {
    return t(key).replace('{n}', esc(name));
  },

  async confirmRemove(uid, name) {
    if (!await askConfirm(this.confirmText('friends_remove_confirm', name))) return;
    try {
      await unfriend(uid);
    } catch (e) {
      console.error('Removing a friend failed', e);
    }
    // They can be asked again, so a spent search row from earlier in this
    // session is released.
    this.sent.delete(uid);
    await this.loadFriends();
  },

  // Block is one action with several parts — see blockUser() in js/firebase.js
  // for what it does to a pending request in either direction. Everything the
  // screen shows is rebuilt afterwards: the friends list loses the row, the
  // Requests tab loses anything they had asked, and the blocked list is
  // invalidated so the Blocked screen refetches it.
  async confirmBlock(uid, name) {
    if (!await askConfirm(this.confirmText('friends_block_confirm', name))) return;
    try {
      await blockUser(uid);
    } catch (e) {
      console.error('Blocking failed', e);
    }
    this.sent.delete(uid);
    this.blockedLoaded = false;
    await this.loadFriends();
    await this.loadRequests();
  },

  // ── Blocked list ───────────────────────
  async openBlocked() {
    showScreen('friends-blocked');
    this.renderBlocked();
    await this.loadBlocked();
  },

  async loadBlocked() {
    if (!Auth.user) {
      this.blocked = [];
      this.blockedLoaded = true;
    } else {
      try {
        const uids = await fetchBlockedUids();
        const people = await fetchLeaderboardByUids(uids);
        // Same rule as everywhere else: someone with no public document still
        // gets a row, so a block can always be undone.
        this.blocked = uids.map(u => ({ ...(people[u] || {}), uid: u }));
        this.blockedLoaded = true;
      } catch (e) {
        console.error('Loading the blocked list failed', e);
      }
    }
    if (activeScreen === 'friends-blocked') this.renderBlocked();
  },

  // Blocked rows deliberately do NOT open the public profile — the only thing
  // to do with someone here is let them back in.
  renderBlocked() {
    const el = $('fbl-list');
    el.innerHTML = '';
    // The empty note waits for the list to have actually arrived, so an empty
    // screen mid-fetch does not claim you have blocked nobody.
    $('fbl-empty').classList.toggle('hidden', !this.blockedLoaded || this.blocked.length > 0);
    for (const e of this.blocked) {
      el.appendChild(this.personRow(e, [
        { cls: 'btn small', key: 'friends_unblock', on: b => this.unblock(e.uid, b) },
      ]));
    }
  },

  // Unblocking restores nothing — no friendship, no request. They simply
  // become able to ask again.
  async unblock(uid, btn) {
    this.freezeRow(btn);
    try {
      await unblockUser(uid);
    } catch (e) {
      console.error('Unblocking failed', e);
    }
    this.blockedLoaded = false;
    await this.loadBlocked();
  },

  // ── ➕ Add friend, on a public profile ──
  // Four states, all answered from lists this module already holds, so opening
  // a profile costs no new query once Friends has been used. The friends list
  // is awaited when it has never loaded — that is the one wait, and it is the
  // same query the Friends tab runs.
  //
  // Someone who has asked ME is deliberately left in the plain "Add friend"
  // state: accepting belongs on the Requests tab, and inventing a fifth state
  // here would mean a fifth string.
  async paintAddFriend(entry, isSelf) {
    const btn = $('pubprofile-add-friend');
    const row = btn.parentElement;
    const uid = entry && entry.uid;
    // Hidden on my own profile, and signed out — a live button that could only
    // fail is worse than no button.
    if (isSelf || !uid || !Auth.user) {
      row.classList.add('hidden');
      return;
    }
    if (!this.friendsLoaded) await this.loadFriends();
    const friend = this.friends.some(f => f.uid === uid);
    // `outgoing` carries rejected requests too, and that is the point: a
    // rejection must look exactly like a pending request to whoever sent it.
    const pending = !friend && (this.sent.has(uid) || this.outgoing.some(o => o.uid === uid));
    row.classList.remove('hidden');
    btn.disabled = friend || pending;
    btn.textContent = friend ? t('friends_already')
      : pending ? t('friends_pending') : t('friends_add');
    // Sending from here shows the same neutral toast as the Find tab — a
    // blocked send and a real send must stay indistinguishable.
    btn.onclick = btn.disabled ? null : async () => {
      await this.sendRequest(uid, btn);
      this.paintAddFriend(entry, isSelf);
    };
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
    // The friends list just changed, and the ➕ button on a public profile is
    // answered from it — so it is invalidated rather than left stale. Lazy:
    // it refetches when the Friends tab or a public profile next needs it.
    this.friendsLoaded = false;
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
  // The board is built from the friends list the Friends tab already loaded —
  // the same uids, so there is no second query. It paints immediately (with
  // the loading line if the list has never arrived) and repaints when it does.
  async openLeaderboard() {
    showScreen('friends-leaderboard');
    this.renderLeaderboard();
    if (!this.friendsLoaded) await this.loadFriends();
  },

  renderLeaderboard() {
    const board = LEADERBOARD_FIELDS[this.field];
    // The period switch only appears on boards that actually have seasons —
    // same rule as the global leaderboard.
    $('flb-period').classList.toggle('hidden', !board.season);
    // Leaving a seasonal board drops back to all-time, so the switch has to be
    // moved with it. Without this it stays lit on "This month" while the board
    // underneath is the all-time one. (#leaderboard-period has the same bug —
    // it is left alone here because that screen is not this commit.)
    if (!board.season) {
      this.season = false;
      const per = $('flb-period');
      per.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === 'all'));
    }
    const field = this.season && board.season ? board.season : this.field;

    // What this row scores on the board being shown. A player who set a Rush
    // score and then stopped still carries last month's number, so on a "this
    // month" board that value is not theirs any more and reads as no score.
    // The global leaderboard drops those rows; here the row stays and shows
    // the fallback, because a fixed roster of friends with someone silently
    // missing from it just looks broken.
    const score = e => {
      if (this.season && board.season && e.rushMonthKey !== monthStr()) return board.fallback;
      return e[field] ?? board.fallback;
    };

    // My own row belongs here: a board of four people that leaves me out is
    // not a comparison. It costs the one extra document loadFriends already
    // fetched. Signed out — or before my public document exists — I have no
    // row and the board is just my friends.
    const myUid = Auth.user && Auth.user.uid;
    const list = (this.me ? this.friends.concat(this.me) : this.friends.slice())
      .sort((a, b) => score(b) - score(a));

    $('flb-status').textContent = list.length ? ''
      : (Auth.user && !this.friendsLoaded ? t('loading') : t('friends_lb_empty'));
    const el = $('flb-list');
    el.innerHTML = '';
    list.forEach((e, i) => {
      const rank = i + 1;
      const item = document.createElement('button');
      // Same rank bands and same markup as the global leaderboard — the two
      // boards are the same thing over a different set of people.
      item.className = 'lb-row ' + rankTier(rank) + (e.uid === myUid ? ' lb-me' : '');
      item.innerHTML =
        `<span class="lb-rank">${rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank}</span>` +
        avatarHtml(e.avatarId, 36) +
        `<span class="lb-name">${esc(e.profileName || '?')}</span>` +
        `<span class="lb-value">${Math.round(score(e))}</span>`;
      // Tapping through works exactly as it does on the global leaderboard,
      // except ◀ comes back to this board instead of to that one.
      item.onclick = () => PublicProfile.open(e, 'friends-leaderboard');
      el.appendChild(item);
    });
  },
};
