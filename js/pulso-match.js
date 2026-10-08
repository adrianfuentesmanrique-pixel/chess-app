// Pulso — the match itself: the countdown both phones share, the bar and its
// flame, a solve and a mistake, the friend's moves arriving, the clock, leaving,
// and one plain line saying how it ended. The result screen proper is not here.
// Spec: docs/superpowers/plans/2026-10-pulso.md, sections 3, 4, 5 and 7.4, 7.5.
//
// THE BOARD IS RUSH'S. `game` below is Rush's own engine (js/app.js) run over
// the pulso-* elements: it is given a different prefix and its own three hooks
// — where the next puzzle comes from, what a solve does, what a mistake does —
// and everything about moving pieces stays in Rush.userMove()/loadNext().
// Rush counts its own clock down; here the clock is the SERVER's, shared with
// the friend's phone, so the countdown and the timer are painted from
// pulsoServerNow() instead of being counted.
//
// NOTHING HERE LISTENS. The match document comes from PulsoUI.matches (the
// app's one listener, js/pulso-ui.js), and every number on the screen is read
// from it — the bar is drawn from the two pulls the server holds, never from a
// tally kept on this phone.
//
// In its own file for the same reason as js/pulso-ui.js: js/app.js is already
// too big to read in one go.
//
// Imports from js/app.js and js/pulso-ui.js (cycles) — every binding from them
// is touched inside a function only, never at module top level.
import { t } from './i18n.js';
import { avatarHtml } from './avatars.js';
import { Board } from './board.js';
import { Sound } from './sound.js';
import { PUZZLES } from './puzzles.js';
import { PULSO, resolveList, markerPos } from './pulso.js';
import { pulsoMove, finishPulso, pulsoServerNow } from './firebase.js';
import { $, askConfirm, showScreen, Rush, KaelQuotes } from './app.js';
import { PulsoUI } from './pulso-ui.js';

const QUIET_MS = 20_000;   // the friend's numbers have not moved for this long: "no signal"
const GO_MS = 450;         // "Go!" stays over the board this long, as in Rush
const NEXT_MS = 350;       // the pause after a solve, as in Rush
const MISTAKE_MS = 1200;   // and after a mistake, as in Rush

export const PulsoMatch = {
  game: null,       // Rush's engine over the pulso-* elements
  id: null,         // the match on the board (a pairId), or null
  list: null,       // its 60 puzzles, once this phone has them all
  sent: 0,          // attempts made on this phone, for the moment before the listener echoes one
  theirMoves: 0,    // the friend's solved + mistakes when last looked at
  theirAt: 0,       // and when that last changed, on this phone's clock
  pulls: null,      // [mine, theirs] last painted, to tell who has just pulled
  ticker: null,
  asking: false,    // the "Leave?" question is on screen

  init() {
    const g = this.game = Object.assign(Object.create(Rush), {
      prefix: 'pulso',
      // Its own copy of everything the engine keeps, so nothing is ever read
      // from (or cleared on) Rush through the prototype.
      board: null, chess: null, current: null, moveIdx: 0, prompt: '',
      running: false, run: null, countingIn: false, timer: null,
      pickNext: () => this.list[this.at()],
      onSolve: run => this.attempt(true, run),
      onMistake: run => this.attempt(false, run),
    });
    g.board = new Board(g.el('board'), { onMove: mv => g.userMove(mv), onSound: type => Sound.play(type), premove: true });
    const back = () => { this.stop(); PulsoUI.sync(); };
    // Once a match is past saving (nobody closed it and no result ever came)
    // there is nothing left to forfeit: Leave is just the way out.
    g.el('leave').onclick = () => (this.holds() ? this.leave(null) : back());
    g.el('end-back').onclick = back;
  },

  match() { return (this.id && PulsoUI.matches.find(m => m.id === this.id)) || null; },
  // A match that is still being played: walking away from it is a forfeit.
  holds() {
    const m = this.match();
    return !!m && m.status === 'live' && PulsoUI.inPlay(m);
  },

  // Called by PulsoUI.render() while the Pulso screen is up. True when the
  // match pane is the one to show: a match in play, or the one just played,
  // until Back is tapped.
  show() {
    let m = this.match();
    // Not inPlay(): a phone cut off when the clock ran out keeps its stopped
    // board until it hears the result, however long that takes. A new
    // challenge over the same document ('invited') is what moves it on.
    if (this.id && !(m && (m.status === 'live' || m.status === 'done'))) this.stop();
    if (!this.id) {
      m = PulsoUI.matches.find(x => PulsoUI.inPlay(x));
      if (!m) return false;
      this.begin(m);
    }
    this.paint();
    return true;
  },

  // Also how a phone that reloaded the app joins a match already running: the
  // puzzle it is on is solved + mistakes, both in the document.
  begin(m) {
    const them = m.me === 'a' ? 'b' : 'a';
    this.id = m.id;
    this.list = null;
    this.sent = m[m.me + 'S'] + m[m.me + 'M'];
    this.theirMoves = m[them + 'S'] + m[them + 'M'];
    this.theirAt = Date.now();
    this.pulls = null;
    // Kael keeps quiet for as long as `id` is set (KaelQuotes.show in
    // js/app.js); anything he was already saying goes now.
    KaelQuotes.hide();
    this.ticker = setInterval(() => this.paint(), 200);
  },

  // showScreen() calls this for every screen that is not Pulso, the way it
  // calls Rush.stop().
  stop() {
    clearInterval(this.ticker);
    this.ticker = null;
    this.id = null;
    this.list = null;
    const g = this.game;
    if (!g) return;
    g.stop();
    g.current = null;
    g.board.interactive = false;
    g.el('countdown').classList.add('hidden');
  },

  // ── the puzzles ────────────────────────────────────────────────────────

  // Which of the 60 I am on.
  at() {
    const m = this.match();
    return Math.max(this.sent, m ? m[m.me + 'S'] + m[m.me + 'M'] : 0);
  },

  next() {
    const g = this.game;
    if (this.at() < PULSO.COUNT) { g.loadNext(); return; }
    // All 60 done: the board stops and the clock decides.
    g.current = null;
    g.board.clearPremove();
    g.board.interactive = false;
    g.el('status').textContent = t('pulso_none_left');
  },

  // A solve or a mistake. The write is NOT awaited (see pulsoMove in
  // js/firebase.js): with no signal it waits in Firestore's queue and the
  // board carries on. One that arrives after the clock is refused there, which
  // is the rule working, not an error.
  attempt(solved, run) {
    const g = this.game;
    this.sent = this.at() + 1;
    pulsoMove(this.id, solved).catch(e => console.warn('A Pulso move was not taken', e));
    if (!solved) Sound.play('puzzle-wrong');
    setTimeout(() => { if (g.live(run)) this.next(); }, solved ? NEXT_MS : MISTAKE_MS);
  },

  // ── the screen ─────────────────────────────────────────────────────────

  // Everything on the match pane, from the document and the server's clock.
  // Five times a second while a match is up; each line only touches the page
  // when what it shows has changed.
  paint() {
    const m = this.match(), g = this.game;
    if (!m) return;
    const me = m.me, them = me === 'a' ? 'b' : 'a';
    const name = PulsoUI.nameOf(m.friend);
    const set = (id, text) => { const el = g.el(id); if (el.textContent !== text) el.textContent = text; };

    const now = pulsoServerNow();
    // A start I have just stamped reads null until the server answers.
    const playAt = m.startAt === null ? Infinity : m.startAt + PULSO.COUNTDOWN_MS;
    const endAt = playAt + PULSO.PLAY_MS;
    const done = m.status === 'done';
    const phase = done ? 'done' : now < playAt + GO_MS ? 'count' : now < endAt ? 'play' : 'over';

    // The puzzles. The friend's phone loaded them before accepting and the
    // host's before challenging; a phone that reloaded the app has to fetch
    // them again before it can join.
    if (!this.list && !done) {
      this.list = resolveList(m.pz, PUZZLES);
      if (this.list) {
        g.running = true;
        g.run = {};
        // Flagged before the first puzzle is dealt, so it does not arm a
        // pre-move under the countdown.
        g.countingIn = phase === 'count';
        this.next();
      } else {
        PulsoUI.loadBands();
        set('status', t('pulso_loading'));
      }
    }

    // The countdown: Rush's big gold numbers, but read off the shared clock,
    // so both phones reach "Go!" at the same moment and a phone that arrives
    // late joins at the right number.
    const cd = g.el('countdown'), label = cd.firstElementChild;
    const counting = phase === 'count' && !!this.list;
    if (counting) {
      const n = Math.ceil((playAt - now) / 1000);
      const text = n > 0 ? String(Math.min(n, 5)) : t('rush_go');
      if (label.textContent !== text || cd.classList.contains('hidden')) {
        label.textContent = text;
        label.classList.remove('pop');
        void label.offsetWidth;            // restart the animation each step
        label.classList.add('pop');
      }
      set('status', t('rush_get_ready'));
    }
    cd.classList.toggle('hidden', !counting);
    if (this.list && g.countingIn && phase !== 'count') {
      g.countingIn = false;
      if (phase === 'play' && g.current) {
        set('status', g.prompt);
        // The opening move is played 300 ms after a puzzle is dealt; if that
        // is still to come it hands the board over itself.
        if (g.moveIdx >= 1) g.board.interactive = true;
      }
      this.theirAt = Date.now();
    }
    // Time is up, or it is over: the board stops. Moves already sent have the
    // 3 seconds of grace to arrive; PulsoUI.sync() records the result.
    if ((phase === 'over' || done) && g.running) {
      g.stop();
      g.board.interactive = false;
    }
    if (phase === 'over') set('status', t('rush_time_up'));

    // The clock: 3:00 of play, ending at startAt + 186 s on the server.
    if (!done) {
      const s = Math.ceil(Math.max(0, Math.min(PULSO.PLAY_MS, endAt - now)) / 1000);
      set('timer', `⏱ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
      g.el('timer').classList.toggle('danger', phase === 'play' && s <= 10);
    }

    // The friend.
    const av = avatarHtml(PulsoUI.person(m.friend)?.avatarId, 36);
    if (g.el('their-av').innerHTML !== av) g.el('their-av').innerHTML = av;
    set('their-name', name);
    set('their-score', `${name} · ${m[them + 'S']} ✓`);
    set('my-score', `${t('history_you')} · ${m[me + 'S']} ✓`);
    const moves = m[them + 'S'] + m[them + 'M'];
    if (moves !== this.theirMoves) { this.theirMoves = moves; this.theirAt = Date.now(); }
    const quiet = phase === 'play' && Date.now() - this.theirAt >= QUIET_MS;
    if (quiet) set('quiet', t('pulso_no_signal').replace('{n}', name));
    g.el('quiet').classList.toggle('hidden', !quiet);

    // The bar: my end is the right one. The flame grows, leaning to the side
    // whose streak pull is on.
    const bar = g.el('bar');
    const pulls = [m[me + 'P'], m[them + 'P']];
    const pos = markerPos(pulls[0], pulls[1]);
    bar.style.setProperty('--p', String((pos + PULSO.WIN) / (2 * PULSO.WIN)));
    bar.setAttribute('aria-label', `${name} ${Math.max(0, -pos)} · ${t('history_you')} ${Math.max(0, pos)}`);
    bar.classList.toggle('hot-me', !done && m[me + 'K'] >= 2);
    bar.classList.toggle('hot-them', !done && m[them + 'K'] >= 2);
    // A pull is felt, not just seen: the bar flashes the puller's colour.
    if (this.pulls) {
      const hit = pulls[1] > this.pulls[1] ? 'hit-them' : pulls[0] > this.pulls[0] ? 'hit-me' : null;
      if (hit) {
        bar.classList.add(hit);
        setTimeout(() => bar.classList.remove(hit), 150);
      }
    }
    this.pulls = pulls;
    g.el('streak').classList.toggle('hidden', !(phase === 'play' && m[me + 'K'] >= 2));

    // How it ended. Only once the server has said so — a result this phone has
    // only claimed can still be refused — except my own decision to leave.
    const ended = done && (!m.pending || (m.reason === 'left' && m.winner !== PulsoUI.uid));
    if (ended) set('end-line', this.endLine(m, name));
    g.el('end').classList.toggle('hidden', !ended);
    g.el('leave').classList.toggle('hidden', ended);
    g.el('status').classList.toggle('hidden', ended);
  },

  endLine(m, name) {
    if (m.winner === 'draw') return t('pulso_draw');
    const mine = m.winner === PulsoUI.uid;
    const key = m.reason === 'left' ? (mine ? 'pulso_friend_left' : 'pulso_you_left')
      // On the clock with the flame dead centre, fewer mistakes decided it.
      : (mine ? 'pulso_won_' : 'pulso_lost_') + (m.reason === 'pull' ? 'pull' : m.aP === m.bP ? 'errors' : 'time');
    return t(key).replace('{n}', name);
  },

  // ── leaving ────────────────────────────────────────────────────────────

  // The Leave button (then = null), and — through leaving() — the back
  // gesture, the menu and a swipe (then = the screen that was asked for).
  // Yes is a forfeit: the friend wins at once.
  async leave(then) {
    if (this.asking) return;
    this.asking = true;
    const yes = await askConfirm(t('pulso_leave_confirm'));
    this.asking = false;
    if (!yes) return;
    // Not awaited: with no signal the write waits in the queue.
    if (this.holds()) finishPulso(this.id, { left: true }).catch(e => console.warn('Leaving the Pulso was not recorded', e));
    if (then) { this.stop(); showScreen(then); } else PulsoUI.sync();
  },

  // showScreen() asks this before it leaves the Pulso screen. True means "not
  // yet": the question is on screen and the answer decides.
  leaving(then) {
    if (!this.holds()) return false;
    this.leave(then);
    return true;
  },
};
