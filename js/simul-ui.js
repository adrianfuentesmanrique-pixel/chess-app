// Simul — the invitation and the waiting room (conversation 3 of
// docs/superpowers/specs/2026-10-11-students-simul-design.md; sections 3a, 3b,
// 3e and 3j). Three places on screen:
//   - the Simultáneas screen, the TEACHER's: pick students and a colour,
//     invite, the waiting room, Start, and what Start leads to for now;
//   - a banner on whatever screen the STUDENT is on;
//   - the same thing as a card in Students, where the banner is not shown.
// And the game (conversation 4; sections 3c, 3h and 3k): ONE board on the same
// screen. The teacher's has a strip of tiles above it, one per student, and
// goes from board to board; a student's is opened from the banner or the card
// (`sOpen`) and shows their own game only.
// And how a game ends and is kept (conversation 5; sections 3h and 3i): resign
// and the draw offer on the row under the board, the student told when a game
// ended while they were elsewhere, and every finished game saved ONCE to this
// phone's own History (keep). No clock yet: conversation 6.
//
// The database cannot tell legal chess (spec 3k, "The honest part"), so this
// file does: a board is replayed before it is shown (shownPosition), a move
// that cannot be played is not played, and the phone that received it voids
// the board (referee).
//
// All the reading and writing is the Simul section of js/firebase.js; the
// rules are the referee. What it costs is decided here: the student's
// listener runs only for somebody who has a teacher (Students.hasTeacher(),
// from the lists Students keeps on the phone: no read to find out), and the
// teacher's only while the Simultáneas screen is open.
//
// Imports from js/app.js and js/students.js are cycles: every binding from
// them is touched inside a function only.
import { t, getLang } from './i18n.js';
import { avatarHtml } from './avatars.js';
import { Board } from './board.js';
import { Sound } from './sound.js';
import * as db from './db.js';
import { GameTree, START_FEN } from './tree.js';
import { buildRecord, saveGame } from './history.js';
import {
  SIMUL, coloursFor, buildStart, inviteOpen, sideToMove, packMove, tryMove, shownPosition, voidable,
  nextBoard, mayOfferDraw, positionOf,
} from './simul.js';
import {
  watchSimulTeacher, watchSimulStudent, sendSimulInvite, joinSimul, declineSimul,
  startSimul, endSimul, simulMove, voidSimul, resignSimul, offerSimulDraw, answerSimulDraw, syncSimulClock, simulServerNow, pulsoClockOffset,
} from './firebase.js';
import { $, esc, toast, askConfirm, showScreen, activeScreen, paintCapCounter } from './app.js';
import { Students } from './students.js';
import { PulsoUI } from './pulso-ui.js';

// "It started without you" and "it ran out" are said for this long after the
// invitation, then dropped: a board is kept for ever and nobody wants last
// week's news.
const NOTICE_MS = 3600_000;
const CLOCK_RETRY_MS = 10_000;
// Invitations this phone has answered "not now" or "OK" to: id -> invitedAt.
const SEEN_KEY = 'simulSeen';
// A finished simul the teacher has closed ("New simul"): its startAt.
const CLOSED_KEY = 'simulClosed';
const AUTO_KEY = 'simulAuto';
// Games this phone has put in its History: 'me|id' -> startAt. A board is
// reused for every simul of a pair, so "this game" is the board and its start.
const SAVED_KEY = 'simulSaved';
// When this phone first saw a game over: id -> [startAt, this phone's time].
// No stamp is stored for an ending, so the hour of "your game is over" is the
// phone's own.
const ENDED_KEY = 'simulEnded';
// A simul reason as History names it (history_end_*).
const END = { mate: 'checkmate', stalemate: 'stalemate', repetition: 'repetition', fifty: 'fiftyMove',
  material: 'insufficient', resign: 'resign', agreed: 'agreed', flag: 'timeout', unfinished: 'abandoned' };
// The teacher sees their own move land before the screen jumps to the next board.
const JUMP_MS = 600;
// A move of mine still unconfirmed after this long is said to be on its way.
const SLOW_MS = 2000;
// The banner shows one board: the one that asks for something first.
const ORDER = ['invited', 'live', 'joined', 'over', 'late', 'expired'];

const named = (key, name) => t(key).replace('{n}', name);
const fmtLeft = ms => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const SimulUI = {
  sFor: null,         // the uid the student's listener runs for, or null
  sStop: null,
  sBoards: [],        // my boards as a student, one per teacher
  tFor: null,         // the same for the teacher's, which runs on its screen only
  tStop: null,
  tBoards: [],
  tLoaded: false,     // the teacher's listener has heard from the server
  pick: new Set(),    // students ticked in the setup
  mode: 'white',      // 'white' | 'black' | 'alt': the teacher's colour
  again: 0,           // invitedAt of the expired invitation "Invite again" left behind
  busy: false,        // a write of mine is on its way
  timer: null,
  clockAt: 0,
  bannerKey: '', cardsKey: '', bodyKey: '',
  // The game.
  sOpen: null,        // the board on screen as a STUDENT (its id); null: the teacher's screen
  sel: null,          // the student whose board the teacher has on screen
  auto: true,         // after a move of mine, jump to the board waiting longest
  jump: null,         // the timer of that jump
  closed: 0,          // startAt of the finished simul the teacher closed
  board: null,        // the one Board, made the first time a game is shown
  drawn: null,        // what it shows: { id, startAt, n, fen }
  stripKey: '', gameKey: '',
  memo: new Map(),    // id -> { key, v }: a board is replayed when it changes, not once a second
  voided: new Set(),  // boards this phone has asked to void: it asks once
  slow: null,         // { key, at }: since when the write on the board on screen is unconfirmed
  saved: null,        // SAVED_KEY, read once
  keeping: new Set(), // games on their way into History
  ended: null,        // ENDED_KEY, read once

  init() {
    $('simul-back').onclick = () => showScreen('students');
    $('stu-simul-open').onclick = () => showScreen('simul');
    try {
      this.auto = localStorage.getItem(AUTO_KEY) !== '0';
      this.closed = +localStorage.getItem(CLOSED_KEY) || 0;
    } catch {}
    $('simul-auto').checked = this.auto;
    $('simul-auto').onchange = e => {
      this.auto = e.target.checked;
      try { localStorage.setItem(AUTO_KEY, this.auto ? '1' : '0'); } catch {}
    };
    $('simul-strip').onclick = e => {
      const b = e.target.closest('.simul-tile');
      if (b) this.show(b.dataset.s);
    };
    $('simul-skip').onclick = () => {
      const next = nextBoard(this.playing(), this.sel);
      if (next) this.show(next.s);
    };
    $('simul-resign').onclick = () => this.resign();
    $('simul-draw').onclick = () => this.offer();
    $('simul-accept').onclick = () => this.answerDraw(true);
    $('simul-decline').onclick = () => this.answerDraw(false);
    $('simul-end').onclick = () => this.end();
    $('simul-new').onclick = () => this.close();
    for (const ev of ['online', 'offline']) addEventListener(ev, () => this.sync());
  },

  // ── the listeners ──────────────────────────────────────────────────────

  // Called by Students whenever its lists may have changed (Students.paintDot),
  // which is also every sign-in and sign-out.
  links() {
    const uid = Students.uid;
    const want = uid && Students.hasTeacher() ? uid : null;
    if (want !== this.sFor) {
      if (this.sStop) this.sStop();
      this.sStop = null; this.sBoards = []; this.sFor = want;
      if (want) this.sStop = watchSimulStudent(list => { this.sBoards = list; this.sync(); });
    }
    if (this.tFor && this.tFor !== uid) this.closeTeacher();
    if (activeScreen === 'simul' && !this.tFor && !this.sOpen) { showScreen('students'); return; }
    this.sync();
  },

  // Called by showScreen() for every screen.
  onScreen(name) {
    if (name !== 'simul') { this.closeTeacher(); this.sOpen = null; }
    // A student's own board: their listener is already running.
    else if (this.sOpen) this.closeTeacher();
    else if (!Students.hasStudents()) { showScreen('students'); return; }
    else if (!this.tFor) {
      this.tFor = Students.uid;
      this.tStop = watchSimulTeacher((list, meta) => {
        this.tBoards = list;
        if (!meta || !meta.fromCache) this.tLoaded = true;
        this.sync();
      });
    }
    this.sync();
  },

  closeTeacher() {
    if (this.tStop) this.tStop();
    this.tStop = null; this.tFor = null; this.tBoards = []; this.tLoaded = false;
    this.again = 0; this.busy = false; this.bodyKey = '';
    this.stopJump();
  },

  // ── what the boards say ────────────────────────────────────────────────

  seen() {
    try { return JSON.parse(localStorage.getItem(SEEN_KEY)) || {}; } catch { return {}; }
  },
  markSeen(g) {
    const all = this.seen();
    all[g.id] = g.invitedAt;
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(all)); } catch {}
  },

  // This phone's time when it first saw this game over.
  endedAt(g) {
    if (!this.ended) { try { this.ended = JSON.parse(localStorage.getItem(ENDED_KEY)) || {}; } catch { this.ended = {}; } }
    const e = this.ended[g.id];
    if (e && e[0] === g.startAt) return e[1];
    this.ended[g.id] = [g.startAt, Date.now()];
    try { localStorage.setItem(ENDED_KEY, JSON.stringify(this.ended)); } catch {}
    return this.ended[g.id][1];
  },

  // What one of my boards as a student has to say, or null for nothing:
  // 'invited', 'joined', 'live', 'late' (it started without me), 'expired',
  // 'over' (my game ended and I have not seen how).
  stateOf(g, now = simulServerNow()) {
    if (g.status === 'live') return now - g.startAt < SIMUL.ABANDONED_MS ? 'live' : null;
    if (g.status === 'done') {
      if (!g.startAt || this.seen()[g.id] === g.invitedAt) return null;
      return Date.now() - this.endedAt(g) < NOTICE_MS ? 'over' : null;
    }
    if (g.status !== 'invited' && g.status !== 'joined' && g.status !== 'out') return null;
    if (g.status !== 'out' && inviteOpen(g, now)) return g.status;
    if (now - g.invitedAt > NOTICE_MS || this.seen()[g.id] === g.invitedAt) return null;
    return g.status === 'out' ? 'late' : 'expired';
  },

  shown() {
    const now = simulServerNow();
    return this.sBoards.map(g => ({ g, state: this.stateOf(g, now) })).filter(x => x.state)
      .sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state) || a.g.invitedAt - b.g.invitedAt);
  },

  // The teacher's boards that share the newest invitation: this simul. A board
  // of mine not yet confirmed carries this phone's guess at the stamp.
  current() {
    const last = Math.max(0, ...this.tBoards.map(g => g.invitedAt || 0));
    return this.tBoards.filter(g => g.invitedAt === last || (g.pending && last - g.invitedAt < 5000))
      .sort((a, b) => a.cls.indexOf(a.s) - b.cls.indexOf(b.s));
  },

  // 'loading' | 'setup' | 'room' | 'expired' | 'started'
  view() {
    if (!this.tLoaded) return 'loading';
    const cur = this.current(), now = simulServerNow();
    // A simul in play, or one that has finished and the teacher has not closed:
    // the last mate must not throw them back to the picker.
    const played = cur.filter(g => g.startAt && now - g.startAt < SIMUL.ABANDONED_MS);
    if (played.some(g => g.status === 'live') || (played.length && played[0].startAt !== this.closed)) return 'started';
    if (cur.some(g => inviteOpen(g, now))) return 'room';
    const waiting = cur.find(g => g.status === 'invited' || g.status === 'joined');
    if (waiting && now - waiting.invitedAt < NOTICE_MS && this.again !== waiting.invitedAt) return 'expired';
    return 'setup';
  },

  // Everything on screen follows from the state above. Called after every
  // change and once a second while there is something to count down or to
  // show. Each painter leaves the page alone when nothing it shows has
  // changed, so a tick never rebuilds a button under a finger.
  sync() {
    const shown = this.shown();
    const onScreen = activeScreen === 'simul' && (!!this.tFor || !!this.sOpen);
    this.referee();
    this.keep();
    const counting = shown.some(x => x.state === 'invited' || x.state === 'joined')
      || (onScreen && this.view() === 'room');
    // Ten minutes are the SERVER's ten minutes: measured once a session.
    if (counting && navigator.onLine && pulsoClockOffset() === null && Date.now() - this.clockAt >= CLOCK_RETRY_MS) {
      this.clockAt = Date.now();
      syncSimulClock().then(ok => { if (ok) this.sync(); });
    }
    const tick = shown.length > 0 || onScreen;
    if (tick && !this.timer) this.timer = setInterval(() => this.sync(), 1000);
    if (!tick && this.timer) { clearInterval(this.timer); this.timer = null; }
    this.paintBanner(shown);
    if (activeScreen === 'students') this.paintCards(shown);
    if (onScreen) this.render();
    const now = simulServerNow();
    document.querySelectorAll('[data-simul-left]').forEach(el => {
      el.textContent = fmtLeft(+el.dataset.simulLeft + SIMUL.INVITE_MS - now);
    });
  },

  // ── the student ────────────────────────────────────────────────────────

  line(x) {
    const name = Students.who(x.g.t).profileName;
    return named({ invited: 'simul_invite', joined: 'simul_waiting_for', live: 'simul_started_with',
      over: 'simul_over_with', late: 'simul_late', expired: 'simul_expired' }[x.state], name);
  },
  // The student plays the colour the teacher does not.
  colourLine(g) { return t(g.tc === 'w' ? 'simul_you_black' : 'simul_you_white'); },

  // [{ key, cls, on }] for a state.
  actions(x) {
    if (x.state === 'invited') {
      return [{ key: 'simul_not_now', cls: 'btn small', on: () => this.answer(x.g, false) },
        { key: 'simul_join', cls: 'btn small primary', on: () => this.answer(x.g, true) }];
    }
    if (x.state === 'live') {
      return [{ key: 'simul_to_board', cls: 'btn small primary', on: () => this.openBoard(x.g.id) }];
    }
    if (x.state === 'over') {
      return [{ key: 'simul_ok', cls: 'btn small', on: () => { this.markSeen(x.g); this.sync(); } },
        { key: 'simul_see_board', cls: 'btn small primary', on: () => this.openBoard(x.g.id) }];
    }
    if (x.state === 'late' || x.state === 'expired') {
      return [{ key: 'simul_ok', cls: 'btn small', on: () => { this.markSeen(x.g); this.sync(); } }];
    }
    return [];
  },

  buttons(el, acts) {
    el.innerHTML = acts.map(a => `<button class="${a.cls}"${this.busy ? ' disabled' : ''}>${esc(t(a.key))}</button>`).join('');
    el.querySelectorAll('button').forEach((b, i) => { b.onclick = acts[i].on; });
  },

  paintBanner(shown) {
    // The card in Students says the same thing, so no banner there; and none
    // over a Rush run, a Duel or a game in play (PulsoUI.busy), as for Duel.
    // Nor for the board that is on screen.
    const x = activeScreen === 'students' || PulsoUI.busy() ? null : shown.find(y => y.g.id !== this.sOpen) || null;
    const p = x && Students.who(x.g.t);
    const key = JSON.stringify([getLang(), x && [x.g.id, x.g.invitedAt, x.state, p.profileName, p.avatarId], this.busy]);
    if (key === this.bannerKey) return;
    this.bannerKey = key;
    $('simul-banner').classList.toggle('hidden', !x);
    if (!x) return;
    const sub = x.state === 'invited' ? `<small>${esc(this.colourLine(x.g))}</small>` : '';
    $('simul-banner-who').innerHTML = avatarHtml(p.avatarId, 32) + `<span>${esc(this.line(x))}${sub}</span>`;
    this.buttons($('simul-banner-acts'), this.actions(x));
  },

  // The cards in Students, under "My teachers".
  paintCards(shown = this.shown()) {
    const el = $('stu-simul-list');
    if (!el) return;
    const key = JSON.stringify([getLang(), this.busy,
      shown.map(x => [x.g.id, x.g.invitedAt, x.state, Students.who(x.g.t)])]);
    if (key === this.cardsKey && el.childElementCount === shown.length) return;
    this.cardsKey = key;
    $('stu-simul').classList.toggle('hidden', !shown.length);
    el.innerHTML = '';
    for (const x of shown) {
      const card = document.createElement('div');
      card.className = 'stu-invite';
      const more = x.state === 'invited'
        ? `<p class="stu-invite-end">${esc(this.colourLine(x.g))} · ${esc(t('simul_left'))} <span data-simul-left="${x.g.invitedAt}"></span></p>`
        : '';
      card.innerHTML = `<div class="stu-invite-head">${Students.nameHtml(Students.who(x.g.t))}</div>` +
        `<p class="stu-invite-lead">${esc(this.line(x))}</p>${more}<div class="fr-actions"></div>`;
      this.buttons(card.querySelector('.fr-actions'), this.actions(x));
      el.appendChild(card);
    }
  },

  async answer(g, join) {
    if (this.busy) return;
    if (!navigator.onLine) { toast(t('stu_needs_network')); return; }
    this.busy = true;
    this.sync();
    try {
      if (!join) this.markSeen(g);
      const r = await (join ? joinSimul(g.id) : declineSimul(g.id));
      if (!r.ok) toast(t(r.reason === 'expired' ? 'simul_too_late' : r.reason === 'start' ? 'simul_bad_start' : 'simul_gone'), 3500);
    } catch (e) {
      console.error('Answering a simul invitation failed', e);
      toast(t('stu_try_again'));
    }
    this.busy = false;
    this.sync();
  },

  // ── the teacher's screen ───────────────────────────────────────────────

  roster() {
    return Students.asTeacher.filter(l => l.status === 'active').map(l => Students.who(l.studentUid))
      .sort((a, b) => a.profileName.localeCompare(b.profileName));
  },

  render() {
    const mine = this.sOpen ? this.sBoards.find(g => g.id === this.sOpen) : null;
    // The board I was on is no longer mine to see (the link ended, I signed out).
    // Or it holds no game any more: the teacher has invited me again over the
    // one I was looking at, and the card in Students is where that is answered.
    if (this.sOpen && (!mine || !mine.startAt)) { showScreen('students'); return; }
    const view = this.sOpen ? 'game' : this.view();
    const game = view === 'game' || view === 'started';
    const cur = view === 'setup' || view === 'loading' || game ? [] : this.current();
    const roster = view === 'setup' ? this.roster() : [];
    const note = navigator.onLine ? '' : t(game ? 'simul_offline' : 'stu_needs_network');
    $('simul-note').textContent = note;
    $('simul-note').classList.toggle('hidden', !note);
    $('simul-game').classList.toggle('hidden', !game);
    $('simul-body').classList.toggle('hidden', game);
    if (game) {
      if (this.bodyKey !== 'game') {
        this.bodyKey = 'game'; this.stripKey = this.gameKey = ''; this.drawn = null;
        $('simul-body').innerHTML = '';
        paintCapCounter('simul-count', null, SIMUL.MAX_BOARDS);
      }
      this.renderGame(mine ? [mine] : this.playing());
      return;
    }
    const key = JSON.stringify([getLang(), view, this.busy, roster,
      cur.map(g => [g.id, g.status, Students.who(g.s)])]);
    if (key === this.bodyKey) return;
    this.bodyKey = key;
    paintCapCounter('simul-count', view === 'setup' ? this.pick.size : null, SIMUL.MAX_BOARDS);
    const body = $('simul-body');
    if (view === 'loading') { body.innerHTML = `<p class="hint empty-note">${esc(t('loading'))}</p>`; return; }
    if (view === 'setup') { this.renderSetup(body, roster); return; }
    const chip = g => {
      const k = g.status === 'joined' ? 'joined' : g.status === 'invited' ? (view === 'expired' ? 'noanswer' : 'waiting') : 'declined';
      const on = k === 'joined';
      return `<span class="mc-role simul-chip${on ? '' : ' off'}">${esc(t('simul_chip_' + k))}</span>`;
    };
    const rows = `<div class="list">` + cur.map(g =>
      `<div class="fr-row">${Students.nameHtml(Students.who(g.s))}${chip(g)}</div>`).join('') + `</div>`;
    const joined = cur.filter(g => g.status === 'joined').length;
    if (view === 'room') {
      body.innerHTML =
        `<p class="simul-lead">${esc(t('simul_room_lead'))}</p>` +
        `<p class="hint">${esc(t('simul_room_left'))} <b class="simul-left" data-simul-left="${cur[0].invitedAt}"></b></p>` +
        rows +
        `<button id="simul-start" class="btn primary btn-wide"${joined && !this.busy ? '' : ' disabled'}>${esc(t('simul_start').replace('{n}', joined))}</button>` +
        `<p class="hint">${esc(t(joined ? 'simul_start_hint' : 'simul_start_nobody'))}</p>`;
      $('simul-start').onclick = () => this.start();
    } else {
      body.innerHTML = `<p class="simul-lead">${esc(t('simul_room_expired'))}</p>` + rows +
        `<button id="simul-again" class="btn primary btn-wide">${esc(t('simul_again'))}</button>`;
      $('simul-again').onclick = () => {
        this.pick = new Set(cur.map(g => g.s));
        this.again = cur[0].invitedAt;
        this.sync();
      };
    }
  },

  // ── the game ───────────────────────────────────────────────────────────

  // The boards of this simul that have a game on them, in the order invited.
  playing() { return this.current().filter(g => g.startAt); },

  // A game in play is on this screen: no banner over it (PulsoUI.busy).
  inGame() {
    if (activeScreen !== 'simul') return false;
    if (this.sOpen) return this.sBoards.some(g => g.id === this.sOpen && g.status === 'live');
    return !!this.tFor && this.playing().some(g => g.status === 'live');
  },

  // The student's way in, from the banner and the card.
  openBoard(id) {
    this.sOpen = id;
    showScreen('simul');
  },

  stopJump() { clearTimeout(this.jump); this.jump = null; },

  // The teacher puts a student's board on screen.
  show(s) {
    this.stopJump();
    this.sel = s;
    this.sync();
  },

  // The teacher closes a simul whose games are all over.
  close(at = this.playing()[0]?.startAt) {
    if (!at) return;
    this.closed = at;
    try { localStorage.setItem(CLOSED_KEY, String(at)); } catch {}
    this.sync();
  },

  // A board as far as it can be played (shownPosition), replayed once a change.
  look(g) {
    const key = [g.startAt, g.fen, g.op, g.mv, g.n, g.status, g.reason, g.winner].join('|');
    const m = this.memo.get(g.id);
    if (m && m.key === key) return m.v;
    const v = shownPosition(g);
    this.memo.set(g.id, { key, v });
    return v;
  },

  // Spec 3k: the other side's move that cannot be played, or a mate that is
  // not one, voids the board. The phone that RECEIVED the move does it (it is
  // the side to move), so the record names who refused it; a student's phone
  // does it on any screen, the teacher's while its screen is open.
  referee() {
    for (const g of [...this.sBoards, ...this.tBoards]) {
      if (!g.me || g.pending || !voidable(g) || sideToMove(g) !== g.me) continue;
      const v = this.look(g);
      if (v && !v.bad) continue;
      const key = `${g.id}|${g.startAt}|${g.n}`;
      if (this.voided.has(key)) continue;
      this.voided.add(key);
      voidSimul(g.id).catch(e => console.error('Voiding a simul board failed', e));
    }
  },

  // How a game ended, in words. `name` is the other player.
  resultLine(g, name) {
    if (g.reason === 'mate') return g.winner === g.me ? t('simul_res_mate_won') : named('simul_res_mate_lost', name);
    if (g.reason === 'resign') return named(g.winner === g.me ? 'simul_res_resign_won' : 'simul_res_resign_lost', name);
    const key = { agreed: 'simul_res_agreed', stalemate: 'simul_res_stalemate', repetition: 'simul_res_repetition', fifty: 'simul_res_fifty',
      material: 'simul_res_material', void: 'simul_res_void', unfinished: 'simul_res_unfinished' }[g.reason];
    return t(key || 'simul_res_over');
  },
  // The same on a tile, where there is room for one word.
  tileResult(g) {
    if (g.reason === 'resign') return t(g.winner === 't' ? 'simul_tile_resigned' : 'simul_tile_i_resigned');
    return t(g.winner === 't' ? 'simul_tile_won' : g.winner === 's' ? 'simul_tile_lost' : g.winner === 'draw' ? 'simul_tile_draw'
      : g.reason === 'void' ? 'simul_tile_void' : 'simul_tile_open');
  },

  // `boards`: the student's one board, or the teacher's boards of this simul.
  renderGame(boards) {
    const teacher = !this.sOpen;
    let g = boards[0];
    if (teacher) {
      g = boards.find(x => x.s === this.sel) || nextBoard(boards) || boards[0];
      this.sel = g.s;
    }
    const v = this.look(g);
    const them = Students.who(teacher ? g.s : g.t);
    const live = g.status === 'live';
    const isVoid = !v || v.bad || g.reason === 'void';
    const myMove = live && !isVoid && sideToMove(g) === g.me;
    // The row under the board: resign and offer a draw, or the answer to the
    // other side's offer in their place.
    const canAct = live && !isVoid;
    const offer = canAct && !!g.draw && g.draw !== g.me;
    const mayOffer = canAct && mayOfferDraw(g, g.me);
    // A student who is looking at how their game ended has been told.
    if (!teacher && !live && this.seen()[g.id] !== g.invitedAt) this.markSeen(g);
    // A write of mine that is taking its time: said, so that a move made with
    // no signal is not taken for one that arrived.
    const sk = `${g.id}|${g.n}`;
    if (!g.pending) this.slow = null;
    else if (!this.slow || this.slow.key !== sk) this.slow = { key: sk, at: Date.now() };
    const slow = !!this.slow && Date.now() - this.slow.at >= SLOW_MS;
    const anyLive = boards.some(x => x.status === 'live');
    const next = teacher && anyLive ? nextBoard(boards, g.s) : null;

    // The strip: built when the boards or the people change and only marked
    // after that, so a tile is never replaced under a finger.
    const strip = $('simul-strip');
    strip.classList.toggle('hidden', !teacher);
    if (teacher) {
      const people = boards.map(x => Students.who(x.s));
      const sKey = JSON.stringify([getLang(), boards.map(x => x.id), people.map(p => [p.profileName, p.avatarId])]);
      if (sKey !== this.stripKey) {
        this.stripKey = sKey;
        strip.innerHTML = boards.map((x, i) =>
          `<button class="simul-tile" data-s="${esc(x.s)}">${avatarHtml(people[i].avatarId, 28)}` +
          `<span class="simul-tile-name">${esc(people[i].profileName)}</span><small></small></button>`).join('');
      }
      [...strip.children].forEach((el, i) => {
        const x = boards[i], turn = x.status === 'live' && sideToMove(x) === 't';
        const on = x.id === g.id;
        const asks = x.status === 'live' && x.draw === 's';
        const text = x.status === 'done' ? this.tileResult(x) : asks ? t('simul_tile_offer') : turn ? t('simul_tile_turn') : '';
        el.classList.toggle('offer', asks);
        if (on && !el.classList.contains('on')) el.scrollIntoView({ block: 'nearest', inline: 'center' });
        el.classList.toggle('on', on);
        el.classList.toggle('turn', turn);
        el.classList.toggle('over', x.status === 'done');
        if (el.lastChild.textContent !== text) el.lastChild.textContent = text;
      });
    }

    const key = JSON.stringify([getLang(), teacher, this.busy, g.id, g.status, g.reason, g.winner, myMove, isVoid, slow,
      them.profileName, anyLive, !!next, g.draw, mayOffer]);
    if (key !== this.gameKey) {
      this.gameKey = key;
      const turn = t(myMove ? 'simul_your_move' : 'simul_their_move');
      const text = isVoid ? t('simul_res_void') : !live ? this.resultLine(g, them.profileName)
        : slow ? t('simul_sending') : offer ? t('simul_draw_theirs')
        : g.draw === g.me ? `${t('simul_draw_mine')} · ${turn}` : turn;
      const st = $('simul-status');
      st.innerHTML = `<b>${esc(them.profileName)}</b> · ${esc(text)}`;
      st.classList.toggle('mine', myMove);
      const ctl = $('simul-ctl');
      ctl.classList.toggle('hidden', teacher ? !anyLive : !canAct);
      // A student's row holds two buttons and has room for their words.
      ctl.classList.toggle('solo', !teacher);
      const hide = (id, off) => { $(id).classList.toggle('hidden', off); $(id).disabled = this.busy; };
      ctl.querySelector('.simul-auto').classList.toggle('hidden', !teacher || offer);
      hide('simul-draw', !canAct || offer);
      hide('simul-resign', !canAct || offer);
      hide('simul-accept', !offer);
      hide('simul-decline', !offer);
      // Not `disabled`: a tap on it says why.
      $('simul-draw').classList.toggle('off', !mayOffer);
      $('simul-skip').classList.toggle('hidden', !teacher);
      $('simul-skip').disabled = !next;
      $('simul-end').classList.toggle('hidden', !teacher || !anyLive);
      $('simul-end').disabled = this.busy;
      $('simul-new').classList.toggle('hidden', !teacher || anyLive);
    }
    this.drawBoard(g, v, myMove);
  },

  // One Board for every game. A move that follows the one on screen slides
  // and sounds; anything else (another board, a reload, a move the server
  // would not take) is simply put there.
  drawBoard(g, v, myMove) {
    if (!this.board) {
      this.board = new Board($('simul-board'), { onMove: mv => this.userMove(mv), onSound: type => Sound.play(type) });
    }
    const b = this.board;
    if (v) {
      const side = (g.me === 't') === (g.tc === 'w') ? 'w' : 'b';
      if (b.orientation !== side) b.setOrientation(side);
      const d = this.drawn;
      const same = !!d && d.id === g.id && d.startAt === g.startAt;
      if (!same || d.n !== v.n || d.fen !== v.fen) {
        if (same && v.n === d.n + 1) b.setPosition(v.fen, v.last);
        else { b.setPosition(v.fen); b.lastMove = v.last; b.render(); }
        this.drawn = { id: g.id, startAt: g.startAt, n: v.n, fen: v.fen };
      }
    }
    if (b.interactive !== myMove) b.interactive = myMove;
  },

  // The board on screen, as its listener has it.
  onBoard() {
    return this.sOpen ? this.sBoards.find(g => g.id === this.sOpen) : this.playing().find(g => g.s === this.sel);
  },

  // My move, from the board. Shown at once and sent without waiting: the
  // write settles only when the server answers, and with no signal it waits
  // in the phone until there is one. If the server will not take it, the
  // listener puts the stored game back and the board follows.
  userMove(mv) {
    const g = this.onBoard(), v = g && this.look(g);
    if (!g || g.status !== 'live' || !v || v.bad || sideToMove(g) !== g.me) return;
    const packed = packMove(mv);
    const failed = () => { toast(t('simul_move_failed'), 3500); this.sync(); };
    // My write before this one (Start, mostly) has not been answered yet.
    if (!packed || g.pending) { failed(); return; }
    if (!tryMove(v.chess, packed).ok) return;
    const fen = v.chess.fen();
    v.chess.undo();
    this.board.setPosition(fen, { from: mv.from, to: mv.to });
    this.board.interactive = false;
    this.drawn = { id: g.id, startAt: g.startAt, n: v.n + 1, fen };
    simulMove(g.id, packed).then(r => { if (!r.ok) failed(); },
      e => { console.error('A simul move failed', e); failed(); });
    if (g.me === 't' && this.auto) {
      this.stopJump();
      this.jump = setTimeout(() => {
        this.jump = null;
        // Not the board just moved on, whatever this phone has heard of it.
        const next = nextBoard(this.playing().filter(x => x.id !== g.id));
        if (next) this.show(next.s);
      }, JUMP_MS);
    }
    this.sync();
  },

  renderSetup(body, roster) {
    const ids = new Set(roster.map(p => p.uid));
    this.pick = new Set([...this.pick].filter(u => ids.has(u)));
    const modes = [['white', 'white'], ['black', 'black'], ['alt', 'simul_alt']];
    body.innerHTML =
      `<p class="hint">${esc(t('simul_setup_hint').replace('{n}', SIMUL.MAX_BOARDS))}</p>` +
      `<div id="simul-pick">` + roster.map(p =>
        `<label class="mc-pick simul-pick"><input type="checkbox" data-uid="${esc(p.uid)}"${this.pick.has(p.uid) ? ' checked' : ''}>` +
        `${Students.nameHtml(p)}</label>`).join('') + `</div>` +
      `<h3 class="group-head">${esc(t('simul_colour'))}</h3>` +
      `<div id="simul-colour" class="seg simul-colour">` + modes.map(([v, k]) =>
        `<button data-v="${v}"${v === this.mode ? ' class="on"' : ''}>${esc(t(k))}</button>`).join('') + `</div>` +
      `<p id="simul-colour-hint" class="hint"></p>` +
      `<button id="simul-invite" class="btn primary btn-wide"></button>`;
    const boxes = [...body.querySelectorAll('#simul-pick input')];
    const paint = () => {
      const n = this.pick.size, full = n >= SIMUL.MAX_BOARDS;
      for (const b of boxes) {
        b.disabled = full && !b.checked;
        b.closest('label').classList.toggle('taken', b.disabled);
      }
      paintCapCounter('simul-count', n, SIMUL.MAX_BOARDS);
      $('simul-invite').textContent = t('simul_invite_btn').replace('{n}', n);
      $('simul-invite').disabled = !n || this.busy;
      $('simul-colour-hint').textContent = t('simul_colour_' + this.mode);
    };
    for (const b of boxes) {
      b.onchange = () => {
        if (b.checked && this.pick.size >= SIMUL.MAX_BOARDS) b.checked = false;
        else if (b.checked) this.pick.add(b.dataset.uid); else this.pick.delete(b.dataset.uid);
        paint();
      };
    }
    $('simul-colour').onclick = e => {
      const b = e.target.closest('button');
      if (!b) return;
      this.mode = b.dataset.v;
      $('simul-colour').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      paint();
    };
    $('simul-invite').onclick = () => this.invite(roster);
    paint();
  },

  // One write at a time, with the buttons off while it travels.
  async write(fn) {
    if (this.busy) return null;
    if (!navigator.onLine) { toast(t('stu_needs_network')); return null; }
    this.busy = true;
    this.sync();
    let r = null;
    try { r = await fn(); } catch (e) { console.error('A simul write failed', e); toast(t('stu_try_again')); }
    this.busy = false;
    this.sync();
    return r;
  },

  // Boards in the order the students are listed, which is what "alternating"
  // counts along.
  async invite(roster) {
    const students = roster.map(p => p.uid).filter(u => this.pick.has(u));
    const cols = coloursFor(this.mode, students);
    const boards = students.map((s, i) => ({ s, tc: cols[i], fen: buildStart(cols[i]).fen, op: '' }));
    const r = await this.write(() => sendSimulInvite(boards, SIMUL.NO_CLOCK, 0));
    if (!r || r.ok) return;
    toast(r.reason === 'busy' ? named('simul_busy', Students.who(r.s).profileName)
      : t(r.reason === 'refused' ? 'simul_invite_refused' : 'stu_try_again'), 4000);
  },

  async start() {
    const r = await this.write(() => startSimul());
    if (!r || r.ok) return;
    toast(t(r.reason === 'nobody' ? 'simul_start_nobody' : 'simul_start_again'), 3500);
  },

  // My own board only, and only after a question. The board is fixed before
  // the question: the teacher's screen may have jumped by the time it is answered.
  async resign() {
    const g = this.onBoard();
    if (!g || g.status !== 'live' || this.busy) return;
    const q = g.me === 't' ? named('simul_resign_confirm_t', Students.who(g.s).profileName) : t('simul_resign_confirm');
    if (!await askConfirm(esc(q))) return;
    const r = await this.write(() => resignSimul(g.id));
    if (r && r.reason === 'refused') toast(t('stu_try_again'));
  },

  // One offer per player per 10 moves by each side, and one at a time.
  async offer() {
    const g = this.onBoard();
    if (!g || g.status !== 'live' || this.busy) return;
    if (!mayOfferDraw(g, g.me)) {
      const last = g.me === 't' ? g.tDr : g.sDr;
      const left = Math.ceil((SIMUL.DRAW_GAP_MOVES * 2 - (g.n - last)) / 2);
      toast(g.draw === g.me ? t('simul_draw_wait') : t('simul_draw_later').replace('{n}', left), 3500);
      return;
    }
    const r = await this.write(() => offerSimulDraw(g.id));
    if (r && r.reason === 'refused') toast(t('stu_try_again'));
  },

  async answerDraw(accept) {
    const g = this.onBoard();
    if (!g || g.status !== 'live' || this.busy) return;
    const r = await this.write(() => answerSimulDraw(g.id, accept));
    if (r && r.reason === 'refused') toast(t('stu_try_again'));
  },

  // ── keeping the games ──────────────────────────────────────────────────

  // Spec 3i: each phone keeps its own games in the History it already has.
  // Every finished game with a move on it, once: a board is stored until the
  // pair's next simul, so the listener shows the same ending again after every
  // reload. A void board is not a game and is not kept; "not finished" is.
  // The student's phone does this on any screen; the teacher's only while its
  // screen is open, so a game that ended while they were elsewhere is kept
  // when they come back, and never if that student is invited again first.
  keep() {
    if (!this.saved) { try { this.saved = JSON.parse(localStorage.getItem(SAVED_KEY)) || {}; } catch { this.saved = {}; } }
    for (const g of [...this.sBoards, ...this.tBoards]) {
      if (!g.me || g.pending || g.status !== 'done' || !g.startAt || !g.n || g.reason === 'void') continue;
      const key = `${g.me}|${g.id}`, once = `${key}|${g.startAt}`;
      if (this.saved[key] === g.startAt || this.keeping.has(once)) continue;
      // A mate that is not one is about to be voided (referee).
      const v = this.look(g);
      if (!v || v.bad) continue;
      this.keeping.add(once);
      this.record(g).then(() => {
        this.saved[key] = g.startAt;
        try { localStorage.setItem(SAVED_KEY, JSON.stringify(this.saved)); } catch {}
      }, e => console.error('Saving a simul game failed', e));
    }
  },

  // The game as History keeps one: from the board's own start position, the
  // opening moves first, then the game's.
  async record(g) {
    const p = positionOf(g);
    if (!p.ok) return;
    const mine = (g.me === 't') === (g.tc === 'w') ? 'w' : 'b';
    const them = Students.who(g.me === 't' ? g.s : g.t).profileName;
    const me = await db.kvGet('profileName', '') || t('history_you');
    const tree = new GameTree(g.fen === START_FEN ? undefined : g.fen);
    for (const san of [...p.opening, ...p.sans]) tree.play(san);
    const won = g.winner === 't' ? g.tc : g.winner === 's' ? (g.tc === 'w' ? 'b' : 'w') : g.winner;
    const d = new Date(g.startAt), two = n => String(n).padStart(2, '0');
    const rec = buildRecord({
      chess: p.chess, startFen: g.fen, playerColor: mine, playedAt: g.startAt, endedAt: Math.max(g.at || 0, g.startAt), pgn: '',
      source: 'simul', opponent: them,
      ended: {
        result: won === 'w' ? '1-0' : won === 'b' ? '0-1' : won === 'draw' ? '1/2-1/2' : '*',
        outcome: !g.winner ? 'unfinished' : g.winner === 'draw' ? 'draw' : g.winner === g.me ? 'win' : 'loss',
        endReason: END[g.reason] || 'abandoned',
      },
    });
    tree.setHeader('White', mine === 'w' ? me : them);
    tree.setHeader('Black', mine === 'b' ? me : them);
    tree.setHeader('Date', `${d.getFullYear()}.${two(d.getMonth() + 1)}.${two(d.getDate())}`);
    tree.setHeader('Event', t('history_simul'));
    tree.setHeader('Result', rec.result);
    rec.pgn = tree.toPgn();
    await saveGame(rec);
  },

  // Ended by the teacher, it is closed too: the picker comes back.
  async end() {
    if (!await askConfirm(t('simul_end_confirm'))) return;
    const at = this.playing()[0]?.startAt;
    const r = await this.write(() => endSimul());
    if (r && r.ok) this.close(at);
  },
};
