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
// (`sOpen`) and shows their own game.
// And watching, the link and the first-time explanation (conversation 8;
// sections 3j and 3l): "Others" on a student's row opens the list of the other
// boards of the same simul, and one of them can be put on screen over their
// own, read only (`wOpen`); a ?simul=<teacherUid> link is followed once
// (follow); Kael explains a simul once to a teacher and once to a student, in
// the page. What watching costs is decided here too: the phone listens to the
// whole class only while that list is open, and to the ONE board it shows.
// And how a game ends and is kept (conversation 5; sections 3h and 3i): resign
// and the draw offer on the row under the board, the student told when a game
// ended while they were elsewhere, and every finished game saved ONCE to this
// phone's own History (keep).
// And the clock (conversation 6; section 3d): the control and the teacher's
// extra minutes in the setup, the other player's clock on the line above the
// board and my own under it, the running clock on every tile, and the flag,
// which either phone claims (claimFlags). Every clock is the SERVER's
// (simulServerNow), and one this phone has not measured yet is shown faded.
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
import { Board, getPieceSet } from './board.js';
import { Sound } from './sound.js';
import * as db from './db.js';
import { GameTree, START_FEN } from './tree.js';
import { buildRecord, saveGame } from './history.js';
import { formatClock, controlLabel, LOW_MS } from './play-clock.js';
import { OPENINGS_ECO, classifyOpening } from './openings-eco.js';
import {
  SIMUL, coloursFor, buildStart, inviteOpen, sideToMove, packMove, tryMove, shownPosition, voidable,
  nextBoard, mayOfferDraw, positionOf, timeLeft, flagged,
  replayOpening, replayOpeningOn, openingSans, mirrorSquare, handicapSquares, missingPieces,
} from './simul.js';
import {
  watchSimulTeacher, watchSimulStudent, sendSimulInvite, joinSimul, declineSimul,
  startSimul, endSimul, simulMove, voidSimul, resignSimul, offerSimulDraw, answerSimulDraw, syncSimulClock, simulServerNow, pulsoClockOffset, claimSimulFlag,
  watchSimulClass, watchSimulBoard, fetchLeaderboardByUids, Auth,
} from './firebase.js';
import { $, esc, toast, askConfirm, modal, showScreen, activeScreen, paintCapCounter, KaelQuotes } from './app.js';
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
// The teacher is told once when their own clock on a board that is not on
// screen has less than this, and that tile turns red.
const WARN_MS = 60_000;
// A flag is claimed this long after this phone thinks it fell (its measure of
// the server's clock is a few tenths out, and an early claim is refused), and
// a claim that was refused is tried again after CLAIM_RETRY_MS.
const CLAIM_AFTER_MS = 300;
const CLAIM_RETRY_MS = 3000;
// The teacher's "Tell them" link, as Duel's: the app opens on the invitation.
const LINK = 'https://chesstrainingcenter.app/?simul=';
// What Kael has explained on this phone: { t, s, b } — to the teacher, to the
// student, and his one line where the banner arrives.
const KAEL_KEY = 'simulKael';
// The banner shows one board: the one that asks for something first.
const ORDER = ['invited', 'live', 'joined', 'over', 'late', 'expired'];

const named = (key, name) => t(key).replace('{n}', name);
const otherSide = who => (who === 't' ? 's' : 't');
// The teacher's extra seconds the app suggests for `n` boards: 2 minutes a
// board, to the nearest step.
const suggestExtra = n => Math.min(SIMUL.EXTRA_MAX_S,
  Math.round(n * SIMUL.EXTRA_PER_BOARD_S / SIMUL.EXTRA_STEP_S) * SIMUL.EXTRA_STEP_S);
// A missing piece in words: "dama", "torre de a1"; with its article where a
// sentence needs one ("sin la torre de h1").
const pieceWord = (x, article) => t(`simul_pc_${x.type}${article ? '_the' : ''}`).replace('{sq}', x.square);
const pieceList = list => list.map(x => pieceWord(x)).join(', ');
// "1. e4 e5 2. Nf3"
const movesText = sans => sans.map((s, i) => (i % 2 ? '' : `${i / 2 + 1}. `) + s).join(' ');
// An opening by its name (English, as everywhere in the app), or by its moves
// when the list has no name for it.
const openingLabel = sans => classifyOpening(sans) || movesText(sans);
// The named openings, each once, by the fewest moves that earn the name: the
// teacher plays on from there on the sheet's board.
let ecoList = null;
const ecoNames = () => {
  if (ecoList) return ecoList;
  const by = new Map();
  for (const e of OPENINGS_ECO) {
    const had = by.get(e.name);
    if (!had || e.moves.length < had.moves.length) by.set(e.name, e);
  }
  ecoList = [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
  return ecoList;
};
// The teacher's status line has room for this many pictures of missing pieces.
const LESS_ICONS = 4;
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
  clock: -1,          // the control in the setup: an index into SIMUL.CLOCKS, -1 for no clock
  extra: null,        // the teacher's extra seconds; null: whatever the app suggests
  // Opening and handicap (conversation 7; sections 3f and 3g). Like the colour
  // and the clock they are kept while the app stays open, and no longer.
  opening: [],        // the thematic opening in SAN from the normal start position; [] for none
  handi: new Map(),   // student uid -> the squares the teacher plays without there, as WHITE's (simul.js, "The handicap")
  hBoard: null,       // the handicap sheet's board, and the opening sheet's: made once
  oBoard: null,
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
  claims: new Map(),  // flags this phone has claimed: 'id|startAt|n' -> when (this phone's time)
  warned: new Set(),  // boards the teacher has been told are low on time: 'id|startAt|n'
  // Watching.
  sLoaded: false,     // the student's listener has heard from the server
  mates: {},          // classmates' public rows, read once: uid -> { profileName, avatarId }
  oStop: null,        // the class listener: it runs only while the list of other boards is open
  oBoards: null,      // what it holds; null until the server has answered
  oPaint: null,       // draws the open list
  wOpen: null,        // the classmate's board on screen (its id), over my own
  wStop: null,
  wBoard: null,
  told: '',           // what I was last told my own board wants, while watching
  // The link. `link` is the ?simul= the app was opened with, { host, duel,
  // since, shown, asked, mine }, or null once it has been followed.
  link: null,
  up: false,          // the app has put its first screen up
  notice: '',         // what a link that led nowhere has to say, in Students
  kael: null,         // KAEL_KEY, read once

  init() {
    // The link is read once and taken out of the address, as Duel's is
    // (PulsoUI.init has already taken its own).
    const q = new URLSearchParams(location.search);
    const host = q.get('simul');
    if (host !== null) {
      q.delete('simul');
      const rest = q.toString();
      history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
      if (/^\w{1,128}$/.test(host)) this.link = { host, duel: !!PulsoUI.link, since: Date.now() };
    }
    // Firebase can say who is signed in after the app is up, and "nobody" is
    // told to nobody else here (Students.onAuth has nothing to change).
    Auth.onChange(() => this.follow());
    $('simul-others').onclick = () => this.openOthers();
    $('simul-mine').onclick = () => this.unwatch();
    $('stu-simul-how').onclick = () => this.how('s');
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
    // The opening's name beside the title, and the teacher's missing pieces in
    // the line above the board: a tap says them in full.
    $('simul-theme').onclick = () => {
      const g = this.onBoard();
      if (!g || !g.op) return;
      const sans = openingSans(g.fen, g.op);
      // A line with no name is already said by its moves.
      toast(classifyOpening(sans) ? `${this.openingLine(g)} · ${movesText(sans)}` : this.openingLine(g), 5000);
    };
    $('simul-status').onclick = e => {
      const g = e.target.closest('.simul-less-ico') && this.onBoard();
      if (g) toast(this.handicapLine(g), 4000);
    };
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
      this.sStop = null; this.sBoards = []; this.sFor = want; this.sLoaded = false;
      this.dropWatch(); this.closeOthers();
      if (want) {
        this.sStop = watchSimulStudent((list, meta) => {
          this.sBoards = list;
          if (!meta || !meta.fromCache) this.sLoaded = true;
          this.sync();
          this.follow();
        });
      }
    }
    if (this.tFor && this.tFor !== uid) this.closeTeacher();
    if (activeScreen === 'simul' && !this.tFor && !this.sOpen) { showScreen('students'); return; }
    this.sync();
    this.follow();
  },

  // Called by showScreen() for every screen.
  onScreen(name) {
    if (name !== 'students') this.notice = '';
    if (name !== 'simul') { this.closeTeacher(); this.sOpen = null; this.dropWatch(); this.closeOthers(); }
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
    this.claimFlags();
    this.keep();
    const counting = shown.some(x => x.state === 'invited' || x.state === 'joined')
      || (onScreen && this.view() === 'room')
      || [...this.sBoards, ...this.tBoards].some(g => g.status === 'live' && g.base);
    // Ten minutes, and a clock, are the SERVER's: measured once a session.
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
    if (this.oPaint) this.oPaint();
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
  // The clock of an invitation, and what the teacher gave themselves over it.
  clockLine(g) {
    if (!g.base) return t('simul_no_clock');
    const extra = Math.round((g.tMs - g.sMs) / 60000);
    return t(extra > 0 ? 'simul_clock_extra' : 'simul_clock_is').replace('{n}', controlLabel(g)).replace('{m}', extra);
  },
  // The thematic opening of a board, and what the teacher plays without on it;
  // '' for none. Both are read back from what is stored (fen, op, tc).
  openingLine(g) {
    return g.op ? `${t('simul_op_label')}: ${openingLabel(openingSans(g.fen, g.op))}` : '';
  },
  handicapLine(g) {
    const less = missingPieces(g.fen, g.tc);
    return less.length ? `${t(g.me === 't' ? 'simul_less_me' : 'simul_less_teacher')} ${pieceList(less)}` : '';
  },
  // Everything an invitation says about the game, on one line.
  terms(g) {
    return [this.colourLine(g), this.clockLine(g), this.openingLine(g), this.handicapLine(g)].filter(Boolean).join(' · ');
  },

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
    const sub = x.state === 'invited' ? `<small>${esc(this.terms(x.g))}</small>` : '';
    $('simul-banner-who').innerHTML = avatarHtml(p.avatarId, 32) + `<span>${esc(this.line(x))}${sub}</span>`;
    this.buttons($('simul-banner-acts'), this.actions(x));
    // A student's first invitation ever: Kael says one line where he always
    // speaks (his bubble on Home, his corner elsewhere: the banner is at the
    // top), and a tap on it opens the explanation.
    if (x.state === 'invited' && !this.explained('s') && !this.explained('b')) {
      this.explain('b');
      KaelQuotes.show({ title: t('simul_kael_title'), text: t('simul_kael_s_short'), cta: t('simul_kael_cta'), onTap: () => this.how('s') }, 15000);
    }
  },

  // The cards in Students, under "My teachers".
  paintCards(shown = this.shown()) {
    const el = $('stu-simul-list');
    if (!el) return;
    // A link that led nowhere is answered by the invitation, if one comes.
    if (this.notice && shown.some(x => x.state === 'invited' || x.state === 'live')) this.notice = '';
    // Kael's card waits for the first invitation, and goes with "OK".
    const first = shown.some(x => x.state === 'invited' || x.state === 'joined') && !this.explained('s');
    const key = JSON.stringify([getLang(), this.busy, this.notice, first,
      shown.map(x => [x.g.id, x.g.invitedAt, x.state, Students.who(x.g.t)])]);
    if (key === this.cardsKey && el.childElementCount === shown.length) return;
    this.cardsKey = key;
    $('stu-simul-note').textContent = this.notice;
    $('stu-simul-note').classList.toggle('hidden', !this.notice);
    $('stu-simul').classList.toggle('hidden', !shown.length);
    $('stu-simul-kael').innerHTML = first ? this.kaelCard('s') : '';
    if (first) $('stu-simul-kael').querySelector('.simul-kael-ok').onclick = () => { this.explain('s'); this.sync(); };
    $('stu-simul-how').classList.toggle('hidden', first);
    el.innerHTML = '';
    for (const x of shown) {
      const card = document.createElement('div');
      card.className = 'stu-invite';
      const more = x.state === 'invited'
        ? `<p class="stu-invite-end">${esc(this.terms(x.g))} · ${esc(t('simul_left'))} <span data-simul-left="${x.g.invitedAt}"></span></p>`
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

  // ── the link ───────────────────────────────────────────────────────────

  // Called by js/app.js once its own first screen is up.
  boot() { this.up = true; this.follow(); },

  // Where a ?simul=<teacherUid> link leads, decided once: when the app has
  // started, it is known who is signed in, Students has ASKED THE SERVER who my
  // teachers are (what this phone remembers may be last week's), and my
  // listener has heard from the server.
  //  - Invited: the card in Students, or my board if the game is on. Joining is
  //    never done by the link itself, as with Duel: a preview must not join.
  //  - No invitation, or not that teacher's student: said plainly in Students,
  //    with nothing about whether there is a simul or who is in it. Neither
  //    sentence costs a read: a board I am not on cannot be read at all.
  //  - Signed out: Students says "sign in", and the link is followed after it.
  //  - My own link: my waiting room.
  //  - Opened with a Duel link as well: Duel has the screen. An invitation is
  //    then the banner there, and a link that led nowhere is said in a toast.
  follow() {
    const link = this.link;
    if (!link || !this.up || !Auth.known) return;
    if (!Auth.user) {
      if (!link.shown) { link.shown = true; if (!link.duel) showScreen('students'); }
      return;
    }
    const uid = Students.uid;
    if (!uid) return;
    if (Students.cachedAt < link.since) {
      if (link.asked) return;
      link.asked = true;
      // Opening Students loads its lists. Already there after a sign-in, it is
      // loading them now (Students.onAuth).
      if (link.duel) Students.load();
      else if (activeScreen !== 'students') showScreen('students');
      else if (!link.shown) Students.load();
      return;
    }
    const dead = text => {
      this.link = null;
      if (link.duel) { toast(text, 6000); return; }
      if (activeScreen !== 'students') showScreen('students');
      this.notice = text;
      this.sync();
    };
    if (link.host === uid) {
      this.link = null;
      if (!link.duel && Students.hasStudents()) showScreen('simul');
      toast(t('simul_link_own'), 5000);
      return;
    }
    if (!Students.asStudent.some(l => l.teacherUid === link.host && l.status === 'active')) { dead(t('simul_link_stranger')); return; }
    if (this.sFor !== uid || !this.sLoaded) return;
    const g = this.sBoards.find(x => x.t === link.host);
    const state = g ? this.stateOf(g) : null;
    // 'late' and 'expired' are cards that say what happened themselves.
    if (!state) { dead(named('simul_link_none', Students.who(link.host).profileName)); return; }
    this.link = null;
    if (link.duel) return;
    if (state === 'live') this.openBoard(g.id);
    else if (activeScreen !== 'students') showScreen('students');
  },

  // The teacher says it themselves: there is no notification. The phone's own
  // share sheet, or the text copied where there is none (PulsoUI.tell).
  async tell() {
    const me = await db.kvGet('profileName', '') || t('simul_tell_teacher');
    const text = named('simul_tell_text', me).replace('{u}', LINK + Students.uid);
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(text); toast(t('pulso_tell_copied'), 3000); } catch { toast(text, 6000); }
  },

  // ── Kael's explanation ─────────────────────────────────────────────────

  // Once to a teacher (the first time Simultáneas is opened) and once to a
  // student (their first invitation), as a card IN the page, so it is never
  // over the board or a button. Remembered on this phone.
  explained(k) {
    if (!this.kael) { try { this.kael = JSON.parse(localStorage.getItem(KAEL_KEY)) || {}; } catch { this.kael = {}; } }
    return !!this.kael[k];
  },
  explain(k) {
    if (this.explained(k)) return;
    this.kael[k] = 1;
    try { localStorage.setItem(KAEL_KEY, JSON.stringify(this.kael)); } catch {}
  },
  kaelCard(role) {
    return `<div class="home-kael simul-kael"><img class="home-kael-pic" src="icons/kael/kael-bust.png" alt="Kael">` +
      `<div class="home-kael-bubble"><b class="kael-quote-title">${esc(t('simul_kael_title'))}</b><p>${esc(t('simul_kael_' + role))}</p>` +
      `<button class="btn small simul-kael-ok">${esc(t('simul_ok'))}</button></div></div>`;
  },
  // The same words again, asked for ("How does it work?").
  how(role) {
    this.explain(role);
    this.cardsKey = this.bodyKey = '';
    this.sync();
    modal((box, close) => {
      box.innerHTML = `<h3>${esc(t('simul_kael_title'))}</h3><p>${esc(t('simul_kael_' + role))}</p>` +
        `<button class="btn primary btn-wide">${esc(t('close'))}</button>`;
      box.querySelector('button').onclick = () => close(null);
    });
  },

  // ── watching (a student) ───────────────────────────────────────────────

  // My own board, while it is the one I opened.
  mine() { return this.sOpen ? this.sBoards.find(g => g.id === this.sOpen) || null : null; },

  // The other boards of MY simul: the ones that carry my board's invitation
  // stamp (one batch, one server time) and have a game on them. The class
  // listener also brings the boards of older simuls that still name me.
  others(mine = this.mine()) {
    if (!mine || !this.oBoards) return [];
    return this.oBoards.filter(g => g.t === mine.t && g.invitedAt === mine.invitedAt && g.id !== mine.id && g.startAt)
      .sort((a, b) => mine.cls.indexOf(a.s) - mine.cls.indexOf(b.s));
  },

  // A classmate, as their public profile row shows them (spec 3l). Students
  // knows my teachers and my own students, not my classmates.
  mate(uid) {
    const p = Students.who(uid);
    return p.profileName !== '?' ? p : { ...p, ...this.mates[uid] };
  },
  // One read a classmate, once while the app stays open.
  async names(uids) {
    const need = uids.filter(u => !this.mates[u] && Students.who(u).profileName === '?');
    if (!need.length) return;
    for (const u of need) this.mates[u] = {};
    try {
      const rows = await fetchLeaderboardByUids(need);
      for (const u of need) if (rows[u]) this.mates[u] = { profileName: rows[u].profileName || '?', avatarId: rows[u].avatarId };
    } catch (e) {
      console.error('Reading the names of a simul failed', e);
      for (const u of need) delete this.mates[u];
    }
    this.sync();
  },

  // The list. The class listener is billed for every board it holds when it
  // opens and for every move on any of them after that, so it runs while the
  // list is on screen and not a moment longer.
  openOthers() {
    const mine = this.mine();
    if (!mine || this.oStop) return;
    if (!navigator.onLine) { toast(t('stu_needs_network')); return; }
    this.oBoards = null;
    this.oStop = watchSimulClass((list, meta) => {
      // What this phone remembers is not the class: it waits for the server.
      if (meta && meta.fromCache && !this.oBoards) return;
      this.oBoards = list;
      this.names(this.others().map(g => g.s));
      if (this.oPaint) this.oPaint();
    });
    modal((box, close) => {
      box.classList.add('simul-sheet');
      box.innerHTML = `<h3>${esc(t('simul_others'))}</h3><p class="hint">${esc(t('simul_others_hint'))}</p>` +
        `<div class="list simul-others-list"></div><button class="btn btn-wide">${esc(t('close'))}</button>`;
      const list = box.querySelector('.simul-others-list');
      let key = null;
      this.oPaint = () => {
        const me = this.mine();
        if (!me) { close(null); return; }
        const boards = this.others(me), now = simulServerNow(), sure = pulsoClockOffset() !== null;
        const tName = Students.who(me.t).profileName;
        const rows = boards.map(g => {
          const p = this.mate(g.s), v = this.look(g);
          const isVoid = !v || v.bad || g.reason === 'void', live = g.status === 'live' && !isVoid;
          const turn = live ? sideToMove(g) : null;
          const name = who => (who === 't' ? tName : p.profileName);
          return { g, p, live, turn, sub: live ? named('simul_w_move', name(turn)) : t('simul_w_done'),
            res: live ? '' : isVoid ? t('simul_tile_void') : g.winner === 'draw' ? t('simul_tile_draw')
              : g.winner ? named('simul_w_won', name(g.winner)) : t('simul_tile_open') };
        });
        const k = JSON.stringify([getLang(), this.oBoards === null, navigator.onLine, rows.map(r => [r.g.id, r.p.profileName, r.p.avatarId, r.sub, r.res, !!r.g.base])]);
        if (k !== key) {
          key = k;
          list.innerHTML = this.oBoards === null ? `<p class="hint empty-note">${esc(t(navigator.onLine ? 'loading' : 'stu_needs_network'))}</p>`
            : !rows.length ? `<p class="hint empty-note">${esc(t('simul_others_none'))}</p>`
            : rows.map(r => `<button class="fr-row tappable" data-id="${esc(r.g.id)}">${Students.nameHtml(r.p, r.sub)}` +
              (r.live ? `<span class="simul-clock run${r.g.base ? '' : ' hidden'}"></span>` : `<span class="mc-role simul-chip off">${esc(r.res)}</span>`) + `</button>`).join('');
        }
        // The clock running on each board: text and marks only.
        rows.forEach((r, i) => {
          const el = list.children[i] && list.children[i].querySelector('.simul-clock');
          if (!el || !r.g.base) return;
          const left = timeLeft(r.g, r.turn, now), text = formatClock(left);
          if (el.textContent !== text) el.textContent = text;
          el.classList.toggle('low', sure && left < LOW_MS);
          el.classList.toggle('unsure', !sure);
        });
      };
      list.onclick = e => {
        const b = e.target.closest('[data-id]');
        if (b) close(b.dataset.id);
      };
      box.querySelector('.btn-wide').onclick = () => close(null);
      this.oPaint();
    }).then(id => {
      const g = id ? this.others().find(x => x.id === id) : null;
      this.closeOthers();
      if (g && activeScreen === 'simul' && this.mine()) this.watch(g);
    });
  },

  closeOthers() {
    if (this.oStop) this.oStop();
    this.oStop = null; this.oBoards = null; this.oPaint = null;
  },

  // What my own board wants of me while I look at another: 'move', 'draw'
  // (the teacher offers one), 'over' (it ended and I have not seen how), or ''.
  wants(mine = this.mine()) {
    if (!mine) return '';
    if (mine.status !== 'live') return this.seen()[mine.id] === mine.invitedAt ? '' : 'over';
    const v = this.look(mine);
    if (!v || v.bad) return '';
    return mine.draw === 't' ? 'draw' : sideToMove(mine) === 's' ? 'move' : '';
  },

  // A classmate's board on screen, read only: ONE listener on that board. My
  // own listener goes on underneath, so my game does too.
  watch(g) {
    const id = g.id;
    this.wOpen = id; this.wBoard = g;
    const w = this.wants();
    this.told = w ? `${w}|${this.mine().n}` : '';
    this.wStop = watchSimulBoard(id, b => {
      if (this.wOpen !== id) return;
      const mine = this.mine();
      // It is gone, or the teacher has invited that classmate to another simul.
      if (!b || !mine || b.t !== mine.t || b.invitedAt !== mine.invitedAt) {
        this.unwatch();
        toast(t('simul_w_gone'), 3500);
        return;
      }
      this.wBoard = b;
      this.sync();
    });
    this.sync();
  },

  // Back to my own board.
  unwatch() {
    this.dropWatch();
    this.sync();
  },

  dropWatch() {
    if (this.wStop) this.wStop();
    this.wStop = null; this.wOpen = null; this.wBoard = null; this.told = '';
  },

  // A board I am watching, in words: whose move, or how it ended.
  watchLine(g, isVoid, sName, tName) {
    const name = who => (who === 't' ? tName : sName);
    if (isVoid) return t('simul_res_void');
    if (g.status === 'live') return named('simul_w_move', name(sideToMove(g)));
    const w = g.winner === 't' || g.winner === 's' ? g.winner : null;
    if (w && g.reason === 'mate') return named('simul_res_mate_lost', name(w));
    if (w && g.reason === 'resign') return named('simul_w_resign', name(otherSide(w))).replace('{w}', name(w));
    if (w && g.reason === 'flag') return named('simul_w_flag', name(otherSide(w))).replace('{w}', name(w));
    if (g.reason === 'flag' && g.winner === 'draw') {
      const out = sideToMove(g);
      return named('simul_w_flag_draw', name(out)).replace('{w}', name(otherSide(out)));
    }
    return this.resultLine(g, '');
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
    if (!game) $('simul-theme').classList.add('hidden');
    if (game) {
      if (this.bodyKey !== 'game') {
        this.bodyKey = 'game'; this.stripKey = this.gameKey = ''; this.drawn = null;
        $('simul-body').innerHTML = '';
        paintCapCounter('simul-count', null, SIMUL.MAX_BOARDS);
      }
      // A classmate's board over my own, while I am watching one.
      const seen = mine && this.wOpen ? this.wBoard : null;
      this.renderGame(seen ? [seen] : mine ? [mine] : this.playing(), seen ? mine : null);
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
        `<p class="hint">${esc(t(joined ? 'simul_start_hint' : 'simul_start_nobody'))}</p>` +
        `<button id="simul-tell" class="btn btn-wide">${esc(t('simul_tell'))}</button>` +
        `<p class="hint simul-tell-hint">${esc(t('simul_tell_hint'))}</p>`;
      $('simul-start').onclick = () => this.start();
      $('simul-tell').onclick = () => this.tell();
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

  // Spec 3d: when the side to move has no time left, either phone claims it
  // and the rules check the claim against the stored stamp. Both phones will;
  // the second is refused and nothing is said. A student's phone does it on any
  // screen, the teacher's while its screen is open. Not before this phone has
  // measured the server's clock.
  claimFlags() {
    if (pulsoClockOffset() === null || !navigator.onLine) return;
    const now = simulServerNow();
    for (const g of [...this.sBoards, ...this.tBoards]) {
      if (!g.me || g.pending || !flagged(g, now - CLAIM_AFTER_MS)) continue;
      const key = `${g.id}|${g.startAt}|${g.n}`;
      if (Date.now() - (this.claims.get(key) || 0) < CLAIM_RETRY_MS) continue;
      this.claims.set(key, Date.now());
      claimSimulFlag(g.id).catch(e => console.error('Claiming a simul flag failed', e));
    }
  },

  // The teacher's own clock is nearly gone on a board that is not on screen:
  // said once for that move, and the tile is brought into view.
  warn(g, tile, name) {
    const key = `${g.id}|${g.startAt}|${g.n}`;
    if (this.warned.has(key)) return;
    this.warned.add(key);
    tile.scrollIntoView({ block: 'nearest', inline: 'center' });
    toast(named('simul_low_time', name), 4000);
  },

  // How a game ended, in words. `name` is the other player.
  resultLine(g, name) {
    if (g.reason === 'mate') return g.winner === g.me ? t('simul_res_mate_won') : named('simul_res_mate_lost', name);
    if (g.reason === 'resign') return named(g.winner === g.me ? 'simul_res_resign_won' : 'simul_res_resign_lost', name);
    // A drawn flag: the side to move is the one that ran out.
    if (g.reason === 'flag' && g.winner === 'draw') return named(sideToMove(g) === g.me ? 'simul_res_flag_draw_out' : 'simul_res_flag_draw_kept', name);
    if (g.reason === 'flag') return named(g.winner === g.me ? 'simul_res_flag_won' : 'simul_res_flag_lost', name);
    const key = { agreed: 'simul_res_agreed', stalemate: 'simul_res_stalemate', repetition: 'simul_res_repetition', fifty: 'simul_res_fifty',
      material: 'simul_res_material', void: 'simul_res_void', unfinished: 'simul_res_unfinished' }[g.reason];
    return t(key || 'simul_res_over');
  },
  // The same on a tile, where there is room for one word.
  tileResult(g) {
    if (g.reason === 'resign') return t(g.winner === 't' ? 'simul_tile_resigned' : 'simul_tile_i_resigned');
    if (g.reason === 'flag') return t(g.winner === 't' ? 'simul_tile_flag_won' : g.winner === 'draw' ? 'simul_tile_flag_draw' : 'simul_tile_flag_lost');
    return t(g.winner === 't' ? 'simul_tile_won' : g.winner === 's' ? 'simul_tile_lost' : g.winner === 'draw' ? 'simul_tile_draw'
      : g.reason === 'void' ? 'simul_tile_void' : 'simul_tile_open');
  },

  // `boards`: the student's one board, or the teacher's boards of this simul.
  // `own`: a student is WATCHING boards[0], a classmate's, and this is their
  // own board. A watched board has no `me`: nothing on it is mine to do, and
  // it is shown as its student sees it.
  renderGame(boards, own = null) {
    const teacher = !this.sOpen;
    const watching = !!own;
    let g = boards[0];
    if (teacher) {
      g = boards.find(x => x.s === this.sel) || nextBoard(boards) || boards[0];
      this.sel = g.s;
    }
    const v = this.look(g);
    const them = watching ? this.mate(g.s) : Students.who(teacher ? g.s : g.t);
    const pov = g.me || 's';
    const live = g.status === 'live';
    const isVoid = !v || v.bad || g.reason === 'void';
    const myMove = !watching && live && !isVoid && sideToMove(g) === g.me;
    // The row under the board: resign and offer a draw, or the answer to the
    // other side's offer in their place.
    const canAct = !watching && live && !isVoid;
    const offer = canAct && !!g.draw && g.draw !== g.me;
    const mayOffer = canAct && mayOfferDraw(g, g.me);
    // A student who is looking at how their game ended has been told.
    if (!teacher && !watching && !live && this.seen()[g.id] !== g.invitedAt) this.markSeen(g);
    // "Others" is offered to a student whose simul has more boards than theirs.
    const hasOthers = !teacher && (own || g).cls.length > 1;
    // While I watch, my own game goes on: the move sound once when it wants me,
    // and the way back says what for as long as it does. No toast: at 375 x 667
    // it would lie on that very button and stop the tap.
    const want = watching ? this.wants(own) : '';
    if (watching) {
      const tk = want ? `${want}|${own.n}` : '';
      if (tk !== this.told) {
        this.told = tk;
        if (want) Sound.play('move');
      }
    }
    // A write of mine that is taking its time: said, so that a move made with
    // no signal is not taken for one that arrived.
    const sk = `${g.id}|${g.n}`;
    if (!g.pending) this.slow = null;
    else if (!this.slow || this.slow.key !== sk) this.slow = { key: sk, at: Date.now() };
    const slow = !!this.slow && Date.now() - this.slow.at >= SLOW_MS;
    const anyLive = boards.some(x => x.status === 'live');
    const next = teacher && anyLive ? nextBoard(boards, g.s) : null;
    const now = simulServerNow(), sure = pulsoClockOffset() !== null;

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
        // With a clock a tile shows the one that is running on its board: mine
        // while the gold dot says it is my move there, the student's otherwise.
        const left = x.status === 'live' && x.base ? timeLeft(x, turn ? 't' : 's', now) : null;
        const text = x.status === 'done' ? this.tileResult(x) : left !== null ? (asks ? '½ ' : '') + formatClock(left)
          : asks ? t('simul_tile_offer') : turn ? t('simul_tile_turn') : '';
        const low = left !== null && sure && left < (turn ? WARN_MS : LOW_MS);
        el.classList.toggle('low', low);
        el.classList.toggle('unsure', left !== null && !sure);
        if (low && turn && !on) this.warn(x, el, people[i].profileName);
        el.classList.toggle('offer', asks);
        if (on && !el.classList.contains('on')) el.scrollIntoView({ block: 'nearest', inline: 'center' });
        el.classList.toggle('on', on);
        el.classList.toggle('turn', turn);
        el.classList.toggle('over', x.status === 'done');
        if (el.lastChild.textContent !== text) el.lastChild.textContent = text;
      });
    }

    // The two clocks, outside the keyed block: text and marks only. The other
    // player's is on the line above the board, mine under it.
    const timed = !!g.base && !!g.startAt && !isVoid;
    const run = live && timed ? sideToMove(g) : null;
    for (const [id, who] of [['simul-clock-them', otherSide(pov)], ['simul-clock-me', pov]]) {
      const el = $(id);
      el.classList.toggle('hidden', !timed);
      if (!timed) continue;
      const left = timeLeft(g, who, now), text = formatClock(left);
      if (el.textContent !== text) el.textContent = text;
      el.classList.toggle('run', run === who);
      el.classList.toggle('low', left < LOW_MS && (run === who || !live));
      el.classList.toggle('unsure', live && !sure);
    }
    $('simul-top').classList.toggle('timed', timed);

    const key = JSON.stringify([getLang(), teacher, this.busy, g.id, g.status, g.reason, g.winner, myMove, isVoid, slow,
      them.profileName, anyLive, !!next, g.draw, mayOffer, timed, g.fen, g.op, g.tc, watching, want, hasOthers,
      watching && [sideToMove(g), Students.who(g.t).profileName]]);
    if (key !== this.gameKey) {
      this.gameKey = key;
      // The opening beside the title, on both phones. What the teacher plays
      // without: in words under the student's board, where there is room; as
      // pictures in the teacher's line above the board, which has none to spare.
      const theme = g.op ? openingLabel(openingSans(g.fen, g.op)) : '';
      $('simul-theme').textContent = theme;
      $('simul-theme').classList.toggle('hidden', !theme);
      const less = missingPieces(g.fen, g.tc);
      // Under a board I am watching the same line says so first.
      $('simul-less').textContent = teacher ? ''
        : !watching ? this.handicapLine(g)
        : less.length ? `${t('simul_w_only')} · ${this.handicapLine(g)}` : named('simul_w_note', them.profileName);
      $('simul-less').classList.toggle('hidden', teacher || (!less.length && !watching));
      // The minus (and the count, past four pieces) is drawn by the stylesheet
      // from data-n: the line's text stays what it says.
      const pics = !teacher || !less.length ? ''
        : `<button class="simul-less-ico" aria-label="${esc(this.handicapLine(g))}" data-n="−${less.length > LESS_ICONS ? less.length : ''}">` + (less.length > LESS_ICONS ? ''
          : less.map(x => `<img src="${getPieceSet()}/${g.tc}${x.type.toUpperCase()}.svg" alt="">`).join('')) + `</button>`;
      const turn = t(myMove ? 'simul_your_move' : 'simul_their_move');
      const text = watching ? this.watchLine(g, isVoid, them.profileName, Students.who(g.t).profileName)
        : isVoid ? t('simul_res_void') : !live ? this.resultLine(g, them.profileName)
        : slow ? t('simul_sending') : offer ? t('simul_draw_theirs')
        : g.draw === g.me ? `${t('simul_draw_mine')} · ${turn}` : turn;
      const st = $('simul-status');
      st.innerHTML = `<span><b>${esc(them.profileName)}</b> · ${esc(text)}${pics}</span>`;
      st.classList.toggle('mine', myMove);
      const ctl = $('simul-ctl');
      // A game with a clock keeps the row for as long as it is on screen: my
      // clock is in it.
      ctl.classList.toggle('hidden', (teacher ? !anyLive : !canAct && !hasOthers && !watching) && !timed);
      ctl.classList.toggle('timed', timed);
      // A student's row holds two buttons and has room for their words.
      ctl.classList.toggle('solo', !teacher);
      const hide = (id, off) => { $(id).classList.toggle('hidden', off); $(id).disabled = this.busy; };
      ctl.querySelector('.simul-auto').classList.toggle('hidden', !teacher || offer || !anyLive);
      hide('simul-draw', !canAct || offer);
      hide('simul-resign', !canAct || offer);
      hide('simul-accept', !offer);
      hide('simul-decline', !offer);
      // A student's own: the way back from a classmate's board, which says
      // what their own board wants and then has the row to itself, and the
      // list of the other boards.
      hide('simul-mine', !watching);
      $('simul-mine').textContent = t(want ? 'simul_w_back_' + want : 'simul_w_back');
      $('simul-mine').classList.toggle('primary', !!want);
      hide('simul-others', !hasOthers || !!want);
      $('simul-others').classList.toggle('tight', offer);
      // Not `disabled`: a tap on it says why.
      $('simul-draw').classList.toggle('off', !mayOffer);
      $('simul-skip').classList.toggle('hidden', !teacher || !anyLive);
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
      // A board I am watching is seen from its student's side.
      const side = ((g.me || 's') === 't') === (g.tc === 'w') ? 'w' : 'b';
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

  // The board on screen, as its listener has it. A classmate's board has no
  // `me`: everything below that writes stops there.
  onBoard() {
    if (this.sOpen && this.wOpen) return this.wBoard;
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
    // Out of time is said for what it is: the flag is claimed by the next sync.
    // A refusal by the rules on a clock may BE the clock (a move that waited
    // for a signal and arrived late): the listener's next copy says, so it is
    // given a moment to arrive.
    const failed = async r => {
      if (r && r.reason === 'refused' && g.base) await new Promise(done => setTimeout(done, 1000));
      const b = this.onBoard();
      const now = simulServerNow();
      const late = (r && r.reason === 'time') || flagged(g, now) === g.me
        || (!!b && b.id === g.id && (flagged(b, now) === b.me || (b.reason === 'flag' && b.winner !== b.me)));
      toast(t(late ? 'simul_move_late' : 'simul_move_failed'), 3500);
      this.sync();
    };
    // My write before this one (Start, mostly) has not been answered yet.
    if (!packed || g.pending) { failed(); return; }
    if (!tryMove(v.chess, packed).ok) return;
    const fen = v.chess.fen();
    v.chess.undo();
    this.board.setPosition(fen, { from: mv.from, to: mv.to });
    this.board.interactive = false;
    this.drawn = { id: g.id, startAt: g.startAt, n: v.n + 1, fen };
    simulMove(g.id, packed).then(r => { if (!r.ok) failed(r); },
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
    // Kael explains a simul the first time this screen is opened; after his
    // "OK" the same words are behind "How does it work?".
    const first = !this.explained('t');
    body.innerHTML =
      (first ? this.kaelCard('t') : '') +
      `<p class="hint">${esc(t('simul_setup_hint').replace('{n}', SIMUL.MAX_BOARDS))}</p>` +
      (first ? '' : `<button id="simul-how" class="simul-link">${esc(t('simul_how'))}</button>`) +
      `<div id="simul-pick">` + roster.map(p =>
        `<label class="mc-pick simul-pick"><input type="checkbox" data-uid="${esc(p.uid)}"${this.pick.has(p.uid) ? ' checked' : ''}>` +
        `${Students.nameHtml(p)}<button type="button" class="btn small simul-handi hidden" data-uid="${esc(p.uid)}">${esc(t('simul_handi_btn'))}</button></label>`).join('') + `</div>` +
      `<h3 class="group-head">${esc(t('simul_op_head'))}</h3>` +
      `<button id="simul-op" class="sheet-btn simul-op-row"><span><b id="simul-op-name"></b><span id="simul-op-moves" class="fr-sub"></span></span><span aria-hidden="true">›</span></button>` +
      `<h3 class="group-head">${esc(t('simul_colour'))}</h3>` +
      `<div id="simul-colour" class="seg simul-colour">` + modes.map(([v, k]) =>
        `<button data-v="${v}"${v === this.mode ? ' class="on"' : ''}>${esc(t(k))}</button>`).join('') + `</div>` +
      `<p id="simul-colour-hint" class="hint"></p>` +
      `<h3 class="group-head">${esc(t('simul_clock_head'))}</h3>` +
      `<div id="simul-tc" class="seg simul-tc">` + [-1, ...SIMUL.CLOCKS.keys()].map(i =>
        `<button data-v="${i}"${i === this.clock ? ' class="on"' : ''}>${esc(i < 0 ? t('simul_no_clock') : controlLabel(SIMUL.CLOCKS[i]))}</button>`).join('') + `</div>` +
      `<p id="simul-tc-hint" class="hint"></p>` +
      `<div id="simul-extra">` +
        `<h3 class="group-head">${esc(t('simul_extra_head'))}</h3>` +
        `<div class="simul-extra-row"><button id="simul-extra-less" class="btn small" aria-label="${esc(t('simul_extra_less'))}">−</button>` +
        `<b id="simul-extra-val" aria-live="polite"></b>` +
        `<button id="simul-extra-more" class="btn small" aria-label="${esc(t('simul_extra_more'))}">+</button></div>` +
        `<p id="simul-extra-hint" class="hint"></p></div>` +
      `<p id="simul-op-bad" class="stu-note simul-op-bad hidden" role="alert"></p>` +
      `<button id="simul-invite" class="btn primary btn-wide"></button>`;
    const boxes = [...body.querySelectorAll('#simul-pick input')];
    const paint = () => {
      const n = this.pick.size, full = n >= SIMUL.MAX_BOARDS;
      for (const b of boxes) {
        b.disabled = full && !b.checked;
        b.closest('label').classList.toggle('taken', b.disabled);
      }
      paintCapCounter('simul-count', n, SIMUL.MAX_BOARDS);
      // What each ticked student gets, and whether the opening can be played
      // on every board: Invite stays off until it can.
      const plan = this.plan(roster);
      for (const b of boxes) {
        const row = b.closest('label'), sub = row.querySelector('.fr-sub');
        const mine = plan.find(x => x.s === b.dataset.uid);
        const less = mine ? missingPieces(mine.fen, mine.tc) : [];
        sub.dataset.user ??= sub.textContent;
        sub.textContent = !mine ? sub.dataset.user : less.length ? `${t('simul_less')} ${pieceList(less)}` : t('simul_handi_whole');
        sub.classList.toggle('simul-less-on', less.length > 0);
        row.querySelector('.simul-handi').classList.toggle('hidden', !mine);
      }
      $('simul-op-name').textContent = this.opening.length ? classifyOpening(this.opening) || t('simul_op_own') : t('simul_op_none');
      $('simul-op-moves').textContent = this.opening.length ? movesText(this.opening) : t('simul_op_pick');
      const bad = plan.filter(x => !x.r.ok).map(x => this.problem(x));
      $('simul-op-bad').textContent = bad.join('\n');
      $('simul-op-bad').classList.toggle('hidden', !bad.length);
      $('simul-invite').textContent = t('simul_invite_btn').replace('{n}', n);
      $('simul-invite').disabled = !n || this.busy || bad.length > 0;
      $('simul-colour-hint').textContent = t('simul_colour_' + this.mode);
      const c = this.clock < 0 ? null : SIMUL.CLOCKS[this.clock];
      $('simul-tc-hint').textContent = c
        ? t('simul_clock_hint').replace('{m}', c.base / 60).replace('{s}', c.inc) : t('simul_clock_none');
      $('simul-extra').classList.toggle('hidden', !c);
      if (!c) return;
      // The suggestion follows the ticks until the teacher sets it themselves.
      const sug = suggestExtra(n), extra = this.extra ?? sug;
      $('simul-extra-val').textContent = t('simul_extra_val').replace('{n}', extra / 60);
      $('simul-extra-less').disabled = extra <= 0;
      $('simul-extra-more').disabled = extra >= SIMUL.EXTRA_MAX_S;
      $('simul-extra-hint').textContent = t('simul_extra_hint').replace('{m}', (c.base + extra) / 60)
        .replace('{b}', c.base / 60).replace('{g}', sug / 60);
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
    $('simul-tc').onclick = e => {
      const b = e.target.closest('button');
      if (!b) return;
      this.clock = +b.dataset.v;
      $('simul-tc').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      paint();
    };
    const step = by => {
      const now = this.extra ?? suggestExtra(this.pick.size);
      this.extra = Math.max(0, Math.min(SIMUL.EXTRA_MAX_S, now + by * SIMUL.EXTRA_STEP_S));
      paint();
    };
    $('simul-extra-less').onclick = () => step(-1);
    $('simul-extra-more').onclick = () => step(1);
    $('simul-invite').onclick = () => this.invite(roster);
    if (first) body.querySelector('.simul-kael-ok').onclick = () => { this.explain('t'); this.bodyKey = ''; this.sync(); };
    else $('simul-how').onclick = () => this.how('t');
    // The sheets change what is chosen; the setup is drawn again when one closes.
    const redraw = () => { this.bodyKey = ''; this.sync(); };
    $('simul-pick').onclick = e => {
      const b = e.target.closest('.simul-handi');
      if (!b) return;
      e.preventDefault();
      const mine = this.plan(roster).find(x => x.s === b.dataset.uid);
      if (mine) this.handicapSheet(mine, roster).then(redraw);
    };
    $('simul-op').onclick = () => this.openingSheet().then(redraw);
    paint();
  },

  // ── opening and handicap ───────────────────────────────────────────────

  // The boards an invitation would send, in the order the students are listed
  // (which is what "alternating" counts along): for each ticked student the
  // teacher's colour, the start position with their handicap taken off, and the
  // opening replayed on it. `r` is replayOpeningOn's answer: r.ok, or which
  // move cannot be played there.
  plan(roster) {
    const students = roster.map(p => p.uid).filter(u => this.pick.has(u));
    const cols = coloursFor(this.mode, students);
    const full = replayOpening(START_FEN, this.opening);
    return students.map((s, i) => {
      const squares = handicapSquares(cols[i], this.handi.get(s) || []);
      const fen = buildStart(cols[i], squares).fen;
      return { s, tc: cols[i], squares, fen, full, r: full.ok ? replayOpeningOn(fen, full.op, full.sans) : full };
    });
  },

  // Why a board of the plan does not hold, for the teacher: which student and
  // which move, and the missing piece when giving that ONE back would cure it
  // ("En el tablero de Luis no se puede jugar O-O sin la torre de h1").
  problem(b) {
    const say = key => named(key, Students.who(b.s).profileName).replace('{m}', b.r.san || '');
    if (b.r.reason === 'over') return say('simul_op_bad_over');
    if (b.r.reason !== 'illegal' || !b.r.san) return say('simul_op_bad_any');
    const cure = missingPieces(b.fen, b.tc).filter(x =>
      replayOpeningOn(buildStart(b.tc, b.squares.filter(q => q !== x.square)).fen, b.full.op, b.full.sans).ok);
    return cure.length === 1 ? say('simul_op_bad_piece').replace('{p}', pieceWord(cure[0], true)) : say('simul_op_bad');
  },

  // The handicap of one board: the teacher taps their own pieces off a board
  // (the Setup Position board: editorMode reports raw taps), never the king.
  handicapSheet(b, roster) {
    const who = Students.who(b.s).profileName;
    const mine = sq => (b.tc === 'b' ? mirrorSquare(sq) : sq);   // a square of this board as White's
    return modal((box, close) => {
      box.classList.add('simul-sheet');
      // The box is not in the page yet while this runs.
      const q = id => box.querySelector('#' + id);
      box.innerHTML = `<h3>${esc(named('simul_handi_title', who))}</h3>` +
        `<p class="hint">${esc(t(b.tc === 'w' ? 'simul_handi_hint_w' : 'simul_handi_hint_b'))}</p>` +
        `<div class="simul-sheet-board"></div>` +
        `<p id="simul-handi-list" class="simul-handi-list" aria-live="polite"></p>` +
        `<div class="simul-sheet-row"><button id="simul-handi-clear" class="btn small">${esc(t('simul_handi_whole'))}</button>` +
        `<button id="simul-handi-all" class="btn small">${esc(t('simul_handi_all'))}</button></div>` +
        `<button id="simul-handi-done" class="btn primary btn-wide">${esc(t('simul_sheet_done'))}</button>`;
      if (!this.hBoard) {
        const el = document.createElement('div');
        el.className = 'board-wrap';
        this.hBoard = new Board(el, { interactive: false });
        this.hBoard.editorMode = true;
      }
      const board = this.hBoard;
      box.querySelector('.simul-sheet-board').appendChild(board.el);
      const draw = () => {
        const squares = handicapSquares(b.tc, this.handi.get(b.s) || []);
        const fen = buildStart(b.tc, squares).fen;
        if (board.orientation !== b.tc) board.setOrientation(b.tc);
        board.setPosition(fen);
        const less = missingPieces(fen, b.tc);
        q('simul-handi-list').textContent = less.length ? `${t('simul_less_me')} ${pieceList(less)}` : t('simul_handi_whole');
        q('simul-handi-clear').disabled = !less.length;
        q('simul-handi-all').disabled = this.pick.size < 2;
      };
      board.onEditorTap = sq => {
        const w = mine(sq);
        if (w[1] !== '1' && w[1] !== '2') return;
        if (w === 'e1') { toast(t('simul_handi_king')); return; }
        const set = new Set(this.handi.get(b.s) || []);
        if (!set.delete(w)) set.add(w);
        this.handi.set(b.s, [...set]);
        draw();
      };
      q('simul-handi-clear').onclick = () => { this.handi.delete(b.s); draw(); };
      // "Same for all": every ticked student gets this board's handicap. Kept
      // as White's squares, so it is right on a board where I am Black too.
      q('simul-handi-all').onclick = () => {
        const squares = this.handi.get(b.s) || [];
        for (const p of roster) if (this.pick.has(p.uid)) this.handi.set(p.uid, [...squares]);
        toast(t('simul_handi_copied').replace('{n}', this.pick.size));
        close(true);
      };
      q('simul-handi-done').onclick = () => close(true);
      draw();
    });
  },

  // The opening, one for the whole simul: played on a small board, or loaded
  // onto it from the list of named openings and played on from there.
  openingSheet() {
    const MAX = SIMUL.OPENING_MAX_MOVES * 2;
    return modal((box, close) => {
      box.classList.add('simul-sheet');
      // The box is not in the page yet while this runs.
      const q = id => box.querySelector('#' + id);
      box.innerHTML = `<h3>${esc(t('simul_op_head'))}</h3>` +
        `<div class="simul-sheet-board"></div>` +
        `<p class="simul-op-now"><b id="simul-op-now-name"></b><span id="simul-op-now-moves" class="fr-sub"></span></p>` +
        `<div class="simul-sheet-row"><button id="simul-op-undo" class="btn small">↶ ${esc(t('simul_op_undo'))}</button>` +
        `<button id="simul-op-clear" class="btn small">${esc(t('simul_op_none'))}</button></div>` +
        `<button id="simul-op-done" class="btn primary btn-wide">${esc(t('simul_sheet_done'))}</button>` +
        `<p class="hint">${esc(t('simul_op_list_hint'))}</p>` +
        `<input id="simul-op-search" class="input" type="search" autocomplete="off" placeholder="${esc(t('search'))}" aria-label="${esc(t('search'))}">` +
        `<div id="simul-op-list" class="simul-op-list"></div>`;
      if (!this.oBoard) {
        const el = document.createElement('div');
        el.className = 'board-wrap';
        this.oBoard = new Board(el, {});
      }
      const board = this.oBoard;
      box.querySelector('.simul-sheet-board').appendChild(board.el);
      const draw = last => {
        const r = replayOpening(START_FEN, this.opening);
        const n = this.opening.length;
        board.setPosition(r.ok ? r.fen : START_FEN, last || null);
        board.interactive = n < MAX;
        q('simul-op-now-name').textContent = n ? classifyOpening(this.opening) || t('simul_op_own') : t('simul_op_none');
        q('simul-op-now-moves').textContent = n >= MAX ? `${movesText(this.opening)} · ${t('simul_op_full').replace('{n}', SIMUL.OPENING_MAX_MOVES)}`
          : n ? movesText(this.opening) : t('simul_op_play');
        q('simul-op-undo').disabled = q('simul-op-clear').disabled = !n;
      };
      board.onMove = mv => {
        const now = replayOpening(START_FEN, this.opening);
        const r = now.ok ? replayOpeningOn(START_FEN, now.op + packMove(mv)) : now;
        // A line cannot end the game: there would be nothing left to play.
        if (!r.ok) { if (r.reason === 'over') toast(t('simul_op_over'), 3500); draw(); return; }
        this.opening = r.sans;
        draw({ from: mv.from, to: mv.to });
      };
      q('simul-op-undo').onclick = () => { this.opening = this.opening.slice(0, -1); draw(); };
      q('simul-op-clear').onclick = () => { this.opening = []; draw(); };
      q('simul-op-done').onclick = () => close(true);
      const list = q('simul-op-list'), search = q('simul-op-search');
      const fill = () => {
        const q = search.value.trim().toLowerCase();
        const found = ecoNames().filter(e => !q || e.name.toLowerCase().includes(q));
        list.innerHTML = found.map(e => `<button class="sheet-btn simul-op-item" data-name="${esc(e.name)}">${esc(e.name)}` +
          `<span class="fr-sub">${esc(movesText(e.moves))}</span></button>`).join('') ||
          `<p class="hint empty-note">${esc(t('simul_op_nothing'))}</p>`;
      };
      search.oninput = fill;
      list.onclick = e => {
        const b = e.target.closest('.simul-op-item');
        const pick = b && ecoNames().find(x => x.name === b.dataset.name);
        if (!pick) return;
        this.opening = [...pick.moves];
        draw();
        box.scrollTop = 0;
      };
      fill();
      draw();
    });
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
    const plan = this.plan(roster);
    // The button is off while a board does not hold; this is the same check again.
    const bad = plan.find(x => !x.r.ok);
    if (bad) { toast(this.problem(bad), 5000); return; }
    const students = plan.map(x => x.s);
    const boards = plan.map(x => ({ s: x.s, tc: x.tc, fen: x.fen, op: x.r.op }));
    const clock = this.clock < 0 ? SIMUL.NO_CLOCK : SIMUL.CLOCKS[this.clock];
    const extra = clock.base ? this.extra ?? suggestExtra(students.length) : 0;
    const r = await this.write(() => sendSimulInvite(boards, clock, extra));
    if (!r || r.ok) return;
    toast(r.reason === 'busy' ? named('simul_busy', Students.who(r.s).profileName)
      : r.reason === 'start' ? named('simul_op_bad_any', Students.who(r.s).profileName)
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
    if (!g || !g.me || g.status !== 'live' || this.busy) return;
    const q = g.me === 't' ? named('simul_resign_confirm_t', Students.who(g.s).profileName) : t('simul_resign_confirm');
    if (!await askConfirm(esc(q))) return;
    const r = await this.write(() => resignSimul(g.id));
    if (r && r.reason === 'refused') toast(t('stu_try_again'));
  },

  // One offer per player per 10 moves by each side, and one at a time.
  async offer() {
    const g = this.onBoard();
    if (!g || !g.me || g.status !== 'live' || this.busy) return;
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
    if (!g || !g.me || g.status !== 'live' || this.busy) return;
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
    // No stamp is stored for an ending. A game ended on time (lost or drawn)
    // ended when the flag fell: the last move's stamp and what the side to
    // move had left then.
    const fell = g.reason === 'flag' ? g[sideToMove(g) + 'Ms'] : 0;
    const rec = buildRecord({
      chess: p.chess, startFen: g.fen, playerColor: mine, playedAt: g.startAt, endedAt: Math.max(g.at || 0, g.startAt) + fell, pgn: '',
      source: 'simul', opponent: them, timeControl: g.base ? { base: g.base, inc: g.inc } : null,
      ended: {
        result: won === 'w' ? '1-0' : won === 'b' ? '0-1' : won === 'draw' ? '1/2-1/2' : '*',
        outcome: !g.winner ? 'unfinished' : g.winner === 'draw' ? 'draw' : g.winner === g.me ? 'win' : 'loss',
        endReason: g.reason === 'flag' && g.winner === 'draw' ? 'timeoutDraw' : END[g.reason] || 'abandoned',
      },
    });
    tree.setHeader('White', mine === 'w' ? me : them);
    tree.setHeader('Black', mine === 'b' ? me : them);
    tree.setHeader('Date', `${d.getFullYear()}.${two(d.getMonth() + 1)}.${two(d.getDate())}`);
    tree.setHeader('Event', t('history_simul'));
    if (g.base) tree.setHeader('TimeControl', `${g.base}+${g.inc}`);
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
