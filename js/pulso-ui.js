// Pulso — everything around the match: the lobby (my friends, each with a
// Challenge button and our tally), the waiting screen after I challenge, and
// the banner an incoming challenge puts on whatever screen I am on. The match
// itself is js/pulso-match.js; this file hands it the screen and records the
// result.
// Spec: docs/superpowers/plans/2026-10-pulso.md, sections 4, 6 and 7.1 to 7.3.
//
// In its own file because js/app.js is already too big to read in one go.
// The arithmetic is js/pulso.js; the reads and writes are the Pulso section of
// js/firebase.js. This file only decides what is on the screen.
//
// THE LISTENER. watchPulso() is the app's one always-on Firestore listener.
// It is started in exactly one place, onAuth(), when somebody signs in, and
// stopped there when they sign out. No screen opens another.
//
// A friend's name comes out of Firestore, so it only ever reaches the page
// through textContent or esc().
//
// Imports from js/app.js (cycle) — every app.js binding used here is touched
// inside a function only, never at module top level.
import { t, getLang } from './i18n.js';
import { avatarHtml } from './avatars.js';
import { PUZZLES, ensureBand } from './puzzles.js';
import { PULSO, bandsNeeded, buildList, packIds, resolveList } from './pulso.js';
import {
  Auth, watchPulso, sendPulsoChallenge, cancelPulso, declinePulso, acceptPulso,
  pulsoServerNow, pulsoClockOffset, syncPulsoClock, finishPulso, fetchLeaderboardByUids,
} from './firebase.js';
import { PulsoMatch } from './pulso-match.js';
import { Friends } from './friends.js';
import { Masterclass } from './masterclass.js';
import { $, esc, toast, modal, showScreen, activeScreen, Rush, Play } from './app.js';

// The host's phone calls a challenge run out a moment after the server would,
// so "Challenge again" is never sent while the rules still count the old one.
const HOST_MARGIN_MS = 1000;
// How often the clock alone has another go at recording a result, and at
// measuring the server's time when the last try failed.
const CLOSE_EVERY_MS = 3000;
const CLOCK_RETRY_MS = 10000;

const named = (key, name) => t(key).replace('{n}', name);

export const PulsoUI = {
  uid: null,          // whose listener is running, or null
  stop: null,         // its unsubscribe
  matches: [],        // what the listener last delivered
  prev: new Map(),    // pairId -> the status in the delivery before that
  people: {},         // uid -> public row, for a name the friends list has not loaded
  asked: new Set(),   // uids already asked for
  bands: 'idle',      // the six puzzle files: 'idle' | 'loading' | 'ready' | 'failed'
  friendsBusy: false,
  sending: false,
  // My challenge that is out: { uid, seen, ended }. `seen` turns true once the
  // listener has shown it as sent; `ended` is null, 'no_answer' or 'declined'.
  wait: null,
  accepting: null,    // the pairId being prepared after I tapped Accept
  dropped: null,      // the pairId I have just cancelled, until the listener agrees
  timer: null,
  closedAt: 0,        // when the clock last tried to record a result
  clockAt: 0,         // when the server's time was last asked for
  lobbyKey: '',
  bannerKey: '',

  init() {
    PulsoMatch.init();
    $('pulso-how').onclick = () => this.how();
    $('pulso-tell').onclick = () => this.tell();
    $('pulso-cancel').onclick = () => this.cancel();
    $('pulso-again').onclick = () => { const w = this.wait; if (w) this.challenge(w.uid); };
    $('pulso-wait-back').onclick = () => { this.wait = null; this.sync(); };
    $('pulso-accept').onclick = () => this.accept();
    $('pulso-decline').onclick = () => this.decline();
    for (const ev of ['online', 'offline']) {
      addEventListener(ev, () => { if (activeScreen === 'pulso') this.onEnter(); else this.sync(); });
    }
    Auth.onChange(() => this.onAuth());
    this.onAuth();
  },

  // The one place the listener starts and stops. Auth.onChange also fires when
  // nothing about WHO is signed in has changed, so the uid is compared first —
  // restarting would read every match document again.
  onAuth() {
    const uid = Auth.user ? Auth.user.uid : null;
    if (uid !== this.uid) {
      if (this.stop) this.stop();
      this.stop = null;
      this.uid = uid;
      this.matches = [];
      this.prev = new Map();
      this.people = {};
      this.asked = new Set();
      this.wait = null;
      this.accepting = null;
      this.dropped = null;
      this.sending = false;
      if (uid) this.stop = watchPulso(list => this.onMatches(list));
    }
    if (activeScreen === 'pulso') this.onEnter(); else this.sync();
  },

  // ── what the listener says ─────────────────────────────────────────────

  now() { return pulsoServerNow(); },
  // A stamp I have just written reads null until the server answers; until
  // then the challenge is as fresh as it can be.
  inviteOpen(m, margin = 0) {
    return m.status === 'invited' && (m.invitedAt === null || this.now() - m.invitedAt < PULSO.INVITE_MS + margin);
  },
  // Live, and not yet a match nobody closed (which the rules let either of us
  // challenge over).
  inPlay(m) {
    return m.status === 'live' && (m.startAt === null || this.now() - m.startAt < PULSO.ABANDONED_MS);
  },
  withFriend(uid) { return this.matches.find(m => m.friend === uid) || null; },
  incoming() {
    return this.matches.filter(m => m.host !== this.uid && this.inviteOpen(m))
      .sort((a, b) => a.invitedAt - b.invitedAt)[0] || null;
  },

  onMatches(list) {
    const prev = this.prev;
    this.prev = new Map(list.map(m => [m.id, m.status]));
    this.matches = list;
    if (!list.some(m => m.id === this.dropped && m.status === 'invited')) this.dropped = null;
    const w = this.wait;
    if (w && !w.ended) {
      const m = this.withFriend(w.uid);
      if (m && m.status === 'invited') w.seen = true;
      // It went back to idle and I did not cancel it: the friend said no.
      else if (m && m.status === 'idle' && w.seen) w.ended = 'declined';
    }
    // A challenge has just been accepted — by me, or by the friend I was
    // waiting for. Both phones go to the Pulso screen.
    if (list.some(m => this.inPlay(m) && prev.get(m.id) === 'invited')) {
      this.wait = null;
      if (activeScreen !== 'pulso') { this.close(); showScreen('pulso'); return; }
    }
    this.close();
    this.sync();
  },

  // Record the result of any match that has one. finishPulso() works out for
  // itself whether there is anything to record: a full pull the server has
  // confirmed, or the clock (plus grace) having run out. It runs on every
  // delivery and, through sync(), on the clock — on whatever screen I am, so
  // a match is closed even by a phone that never opened the board. Both
  // phones do this; the second is refused and that is fine.
  //
  // Not without a connection: the claim would sit in the queue, built on
  // numbers that may be missing the friend's last moves.
  close() {
    if (!navigator.onLine) return;
    this.closedAt = Date.now();
    for (const m of this.matches) {
      if (m.status === 'live' && m.startAt !== null) {
        finishPulso(m.id).catch(e => console.warn('A Pulso result was not recorded', e));
      }
    }
  },

  // Everything on screen follows from the state above. Called after every
  // change, and once a second while a challenge or a match is open — for the
  // countdown, a challenge running out, and the banner coming back when a Rush
  // run or a game ends. Each painter leaves the page alone when nothing it
  // shows has changed, so a tick never rebuilds a button under a finger.
  sync() {
    // My challenge has run out. Checked here, before the ticker is stopped for
    // having nothing left to count — and not while a challenge is on its way
    // out, when the document still holds the one before it.
    const w = this.wait;
    if (w && !w.ended && !this.sending) {
      const m = this.withFriend(w.uid);
      if (m && m.status === 'invited' && !this.inviteOpen(m, HOST_MARGIN_MS)) w.ended = 'no_answer';
    }
    const open = this.matches.some(m => this.inviteOpen(m, HOST_MARGIN_MS) || this.inPlay(m));
    if (open && Date.now() - this.closedAt >= CLOSE_EVERY_MS) this.close();
    // Every time on these screens is the SERVER's. A phone that has not sent
    // or accepted a challenge in this session has not measured it yet — the
    // friend's phone when the banner arrives, any phone that reloaded the app
    // in the middle of a match — so it is measured here, once.
    if (open && navigator.onLine && pulsoClockOffset() === null && Date.now() - this.clockAt >= CLOCK_RETRY_MS) {
      this.clockAt = Date.now();
      syncPulsoClock().then(ok => { if (ok) this.sync(); });
    }
    if (open && !this.timer) this.timer = setInterval(() => this.sync(), 1000);
    if (!open && this.timer) { clearInterval(this.timer); this.timer = null; }
    this.paintBanner();
    if (activeScreen === 'pulso') this.render();
  },

  // ── people ─────────────────────────────────────────────────────────────

  // Names and avatars live only on /leaderboard. The friends list has them
  // once it is loaded; a banner can arrive before that, so one row is fetched
  // for it — one document, once.
  person(uid) {
    const known = Friends.friends.find(f => f.uid === uid) || (uid === this.uid && Friends.me) || this.people[uid];
    if (known) return known;
    if (uid && !this.asked.has(uid) && navigator.onLine) {
      this.asked.add(uid);
      fetchLeaderboardByUids([uid])
        .then(got => { if (got[uid]) { this.people[uid] = got[uid]; this.sync(); } })
        .catch(e => { this.asked.delete(uid); console.error('Loading a Pulso name failed', e); });
    }
    return null;
  },
  nameOf(uid) { return this.person(uid)?.profileName || '?'; },
  // "Pulso: Tú 3 · Ana 2" — on the result screen and on that friend's public
  // profile (spec D4, option A). Read from my own match document with them,
  // which only the two of us can read, so nobody else is ever shown it. ''
  // when we have never finished a match, unless `always`.
  tallyLine(friendUid, always = false) {
    const m = this.uid ? this.withFriend(friendUid) : null;
    const mine = m ? m[m.me + 'W'] : 0, theirs = m ? m[(m.me === 'a' ? 'b' : 'a') + 'W'] : 0;
    if (!always && !(mine + theirs)) return '';
    return t('pulso_tally').replace('{a}', mine).replace('{b}', theirs).replace('{n}', this.nameOf(friendUid));
  },
  vsHtml(friendUid) {
    return avatarHtml(this.person(this.uid)?.avatarId, 56) +
      '<span class="pulso-vs-mark" aria-hidden="true">⚔</span>' +
      avatarHtml(this.person(friendUid)?.avatarId, 56);
  },

  // ── the screen ─────────────────────────────────────────────────────────

  open() { showScreen('pulso'); },

  // showScreen('pulso') lands here, however the screen was reached.
  onEnter() {
    // A waiting screen that has already said how it ended is not shown twice.
    if (this.wait && this.wait.ended) this.wait = null;
    if (this.uid && navigator.onLine) {
      this.loadBands();
      if (!Friends.friendsLoaded && !this.friendsBusy) {
        this.friendsBusy = true;
        Friends.loadFriends().finally(() => { this.friendsBusy = false; this.sync(); });
      }
    }
    this.sync();
    // Pulso is the fourth chip and does not fit beside the other three on a
    // phone: bring the lit one into view, once the screen has been laid out.
    requestAnimationFrame(() => {
      const seg = document.querySelector('#screen-pulso .puzzle-modes'), on = seg.querySelector('[data-v="pulso"]');
      seg.scrollLeft += on.getBoundingClientRect().right - seg.getBoundingClientRect().right;
    });
  },

  // The six files a match draws from (spec section 4, "Before the clock
  // starts"). True when all of them are in.
  async loadBands() {
    if (this.bands === 'ready') return true;
    if (this.bands !== 'loading') {
      this.bands = 'loading';
      this.loading = (async () => {
        try {
          for (const b of bandsNeeded()) await ensureBand(b);
          this.bands = 'ready';
        } catch {
          this.bands = 'failed';
        }
        this.sync();
        return this.bands === 'ready';
      })();
    }
    return this.loading;
  },

  render() {
    // My own challenge still out — after a reload, or after looking elsewhere.
    if (!this.wait) {
      const mine = this.matches.find(m => m.host === this.uid && m.id !== this.dropped && this.inviteOpen(m, HOST_MARGIN_MS));
      if (mine) this.wait = { uid: mine.friend, seen: true, ended: null };
    }
    // The match in play — or the one just played, until Back is tapped.
    const pane = PulsoMatch.show() ? 'game' : this.wait ? 'waiting' : 'lobby';
    for (const p of ['lobby', 'waiting', 'game']) $('pulso-' + p).classList.toggle('hidden', p !== pane);
    if (pane === 'lobby') this.renderLobby();
    if (pane === 'waiting') this.renderWaiting();
  },

  renderLobby() {
    const offline = !navigator.onLine;
    const friends = this.uid ? Friends.friends : [];
    const key = JSON.stringify([getLang(), this.uid, offline, this.bands, this.sending, Friends.friendsLoaded,
      friends.map(f => [f.uid, f.profileName, f.username, f.avatarId]),
      this.matches.map(m => [m.id, m.status, this.inviteOpen(m, HOST_MARGIN_MS), this.inPlay(m), m.aW, m.bW])]);
    if (key === this.lobbyKey) return;
    this.lobbyKey = key;

    // One plain line saying why nothing can be challenged, and at most one
    // button that does something about it.
    let note = '', btn = null;
    if (!this.uid) btn = [t('pulso_signin'), () => showScreen('profile')];
    else if (offline) note = t('pulso_offline');
    else if (!Friends.friendsLoaded) note = t('pulso_loading');
    else if (!friends.length) { note = t('pulso_no_friends'); btn = [t('friends_btn'), () => Friends.open()]; }
    else if (this.bands === 'failed') note = t('puzzles_unavailable');
    else if (this.bands !== 'ready') note = t('pulso_loading');
    $('pulso-note').textContent = note;
    $('pulso-note').classList.toggle('hidden', !note);
    const nb = $('pulso-note-btn');
    nb.classList.toggle('hidden', !btn);
    if (btn) { nb.textContent = btn[0]; nb.onclick = btn[1]; }

    const el = $('pulso-list');
    el.innerHTML = '';
    for (const f of friends) {
      const m = this.withFriend(f.uid);
      const mine = m ? m[m.me + 'W'] : 0, theirs = m ? m[(m.me === 'a' ? 'b' : 'a') + 'W'] : 0;
      const tally = mine + theirs ? t('pulso_row_tally').replace('{a}', mine).replace('{b}', theirs) : '—';
      const busy = m && (this.inviteOpen(m, HOST_MARGIN_MS) || this.inPlay(m));
      const row = document.createElement('div');
      row.className = 'fr-row';
      row.innerHTML =
        avatarHtml(f.avatarId, 36) +
        `<span class="fr-name">${esc(f.profileName || '?')}` +
        `<span class="fr-sub">${esc(f.username || '')}</span></span>` +
        `<span class="pulso-row-end"><span class="pulso-tally">${esc(tally)}</span>` +
        `<button class="btn small primary">${esc(t('pulso_challenge'))}</button></span>`;
      const b = row.querySelector('button');
      b.disabled = offline || this.bands !== 'ready' || this.sending || !!busy;
      b.onclick = () => this.challenge(f.uid);
      el.appendChild(row);
    }
  },

  renderWaiting() {
    const w = this.wait;
    const name = this.nameOf(w.uid);
    const m = this.withFriend(w.uid);
    $('pulso-wait-vs').innerHTML = this.vsHtml(w.uid);
    $('pulso-wait-title').textContent = named(
      w.ended === 'declined' ? 'pulso_declined' : w.ended ? 'pulso_no_answer' : 'pulso_waiting', name);
    // Until the listener has my challenge with the server's stamp on it, the
    // whole 5 minutes are left.
    const stamped = m && m.status === 'invited' && m.invitedAt !== null;
    const left = Math.max(0, stamped ? PULSO.INVITE_MS - (this.now() - m.invitedAt) : PULSO.INVITE_MS);
    const s = Math.ceil(left / 1000);
    $('pulso-wait-clock').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    $('pulso-wait-hint').textContent = named('pulso_must_be_open', name);
    for (const id of ['pulso-wait-clock', 'pulso-wait-hint', 'pulso-tell', 'pulso-cancel']) $(id).classList.toggle('hidden', !!w.ended);
    for (const id of ['pulso-again', 'pulso-wait-back']) $(id).classList.toggle('hidden', !w.ended);
    $('pulso-again').disabled = this.sending || !navigator.onLine;
  },

  // ── what the buttons do ────────────────────────────────────────────────

  async challenge(friendUid) {
    if (!navigator.onLine) { toast(t('pulso_offline')); return; }
    if (this.sending || this.bands !== 'ready') return;
    const pz = packIds(buildList(PUZZLES));
    if (!pz) { toast(t('puzzles_unavailable')); return; }
    this.sending = true;
    const wait = this.wait = { uid: friendUid, seen: false, ended: null };
    this.sync();
    try {
      await sendPulsoChallenge(friendUid, pz);
    } catch (e) {
      // The rules said no: not friends any more, or they challenged me in the
      // same moment (then their banner is already on my screen).
      console.error('Pulso challenge was not sent', e);
      if (this.wait === wait) this.wait = null;
      toast(t('pulso_failed'), 3500);
    }
    this.sending = false;
    this.sync();
  },

  async cancel() {
    const w = this.wait;
    if (!w) return;
    const m = this.withFriend(w.uid);
    this.wait = null;
    if (m) this.dropped = m.id;
    this.sync();
    if (m && m.status === 'invited') {
      try { await cancelPulso(m.id); } catch (e) { console.error('Cancelling the Pulso challenge failed', e); }
    }
  },

  // There is no notification, so the challenger says it themselves: the
  // phone's own share sheet, text only. Where there is no share sheet (a
  // desktop browser) the text is copied instead.
  async tell() {
    const text = t('pulso_tell_text');
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(text); toast(t('pulso_tell_copied'), 3000); } catch { toast(text, 6000); }
  },

  how() {
    modal((box, close) => {
      const h = document.createElement('h3');
      h.textContent = t('pulso_how');
      const ul = document.createElement('ul');
      ul.className = 'pulso-how-list';
      for (let i = 1; i <= 5; i++) {
        const li = document.createElement('li');
        li.textContent = t('pulso_how_' + i);
        ul.appendChild(li);
      }
      const ok = document.createElement('button');
      ok.className = 'btn primary btn-wide';
      ok.textContent = t('close');
      ok.onclick = () => close(null);
      box.append(h, ul, ok);
    });
  },

  // ── the incoming banner ────────────────────────────────────────────────

  // A challenge never interrupts a Pulso match, a Rush run, a game against the
  // engine or a live Masterclass. There the banner waits as a gold dot on ☰ and on the
  // Puzzles entry, and comes back when they finish.
  busy() {
    return Rush.running || PulsoMatch.holds()
      || (activeScreen === 'play' && !!Play.chess && !Play.over && Play.chess.history().length > 0)
      || (activeScreen === 'masterclass' && !!(Masterclass.live || Masterclass.liveState));
  },

  paintBanner() {
    const m = this.uid ? this.incoming() : null;
    // A rematch asked for while I am still on that match's result screen is
    // the gold button there (spec 7.7), not a banner as well. Once I leave
    // that screen it is an ordinary challenge and the banner shows.
    const onResult = !!m && activeScreen === 'pulso' && !!PulsoMatch.result && PulsoMatch.id === m.id;
    const show = !!m && !onResult && !this.busy();
    const name = m ? this.nameOf(m.host) : '';
    const preparing = !!m && this.accepting === m.id;
    const key = JSON.stringify([getLang(), m && m.id, show, onResult, name, m && this.person(m.host)?.avatarId, preparing]);
    if (key === this.bannerKey) return;
    this.bannerKey = key;
    const dot = !!m && !show && !onResult;
    $('tabmenu-btn')?.classList.toggle('pulso-dot', dot);
    document.querySelector('#tabbar button[data-screen="puzzles"]')?.classList.toggle('pulso-dot', dot);
    $('pulso-banner').classList.toggle('hidden', !show);
    if (!show) return;
    $('pulso-banner-who').innerHTML = avatarHtml(this.person(m.host)?.avatarId, 32) +
      `<span>${esc(named('pulso_invite', name))}</span>`;
    $('pulso-accept').textContent = t(preparing ? 'pulso_preparing' : 'pulso_accept');
    $('pulso-accept').disabled = preparing;
    $('pulso-decline').disabled = preparing;
  },

  // Accept: the puzzle files first, then the check that all 60 are on this
  // phone, and only then the write — the clock runs from that write. The
  // banner accepts the challenge it shows; the result screen's gold button
  // passes the rematch it is offering.
  async accept(m = this.incoming()) {
    if (!m || this.accepting) return;
    if (!navigator.onLine) { toast(t('pulso_offline')); return; }
    this.accepting = m.id;
    this.paintBanner();
    try {
      if (!await this.loadBands()) {
        toast(t('puzzles_unavailable'));
      } else if (!resolveList(m.pz, PUZZLES)) {
        toast(t('pulso_update_needed'), 4500);
        await declinePulso(m.id);
      } else {
        await acceptPulso(m.id);
      }
    } catch (e) {
      // Cancelled, or the 5 minutes ran out, while this phone was preparing.
      console.error('Accepting the Pulso challenge failed', e);
      toast(t(e && e.code === 'permission-denied' ? 'pulso_gone' : 'pulso_failed'), 3500);
    }
    this.accepting = null;
    this.sync();
  },

  async decline() {
    const m = this.incoming();
    if (!m || this.accepting) return;
    try { await declinePulso(m.id); } catch (e) { console.error('Declining the Pulso challenge failed', e); }
  },
};
