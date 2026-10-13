// Simul — the invitation and the waiting room (conversation 3 of
// docs/superpowers/specs/2026-10-11-students-simul-design.md; sections 3a, 3b,
// 3e and 3j). Three places on screen:
//   - the Simultáneas screen, the TEACHER's: pick students and a colour,
//     invite, the waiting room, Start, and what Start leads to for now;
//   - a banner on whatever screen the STUDENT is on;
//   - the same thing as a card in Students, where the banner is not shown.
// No board yet: after Start both phones say the simul has started and nothing
// more (conversation 4).
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
import { SIMUL, coloursFor, buildStart, inviteOpen } from './simul.js';
import {
  watchSimulTeacher, watchSimulStudent, sendSimulInvite, joinSimul, declineSimul,
  startSimul, endSimul, syncSimulClock, simulServerNow, pulsoClockOffset,
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
// The banner shows one board: the one that asks for something first.
const ORDER = ['invited', 'live', 'joined', 'late', 'expired'];

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

  init() {
    $('simul-back').onclick = () => showScreen('students');
    $('stu-simul-open').onclick = () => showScreen('simul');
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
    if (activeScreen === 'simul' && !this.tFor) { showScreen('students'); return; }
    this.sync();
  },

  // Called by showScreen() for every screen.
  onScreen(name) {
    if (name !== 'simul') this.closeTeacher();
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

  // What one of my boards as a student has to say, or null for nothing:
  // 'invited', 'joined', 'live', 'late' (it started without me), 'expired'.
  stateOf(g, now = simulServerNow()) {
    if (g.status === 'live') return now - g.startAt < SIMUL.ABANDONED_MS ? 'live' : null;
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
    if (cur.some(g => g.status === 'live' && now - g.startAt < SIMUL.ABANDONED_MS)) return 'started';
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
    const onScreen = activeScreen === 'simul' && !!this.tFor;
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
      late: 'simul_late', expired: 'simul_expired' }[x.state], name);
  },
  // The student plays the colour the teacher does not.
  colourLine(g) { return t(g.tc === 'w' ? 'simul_you_black' : 'simul_you_white'); },

  // [{ key, cls, on }] for a state.
  actions(x) {
    if (x.state === 'invited') {
      return [{ key: 'simul_not_now', cls: 'btn small', on: () => this.answer(x.g, false) },
        { key: 'simul_join', cls: 'btn small primary', on: () => this.answer(x.g, true) }];
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
    const x = activeScreen === 'students' || PulsoUI.busy() ? null : shown[0] || null;
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
        : x.state === 'live' ? `<p class="stu-invite-end">${esc(t('simul_board_soon'))}</p>` : '';
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
    const view = this.view();
    const cur = view === 'setup' || view === 'loading' ? [] : this.current();
    const roster = view === 'setup' ? this.roster() : [];
    const note = !navigator.onLine ? t('stu_needs_network') : '';
    $('simul-note').textContent = note;
    $('simul-note').classList.toggle('hidden', !note);
    const key = JSON.stringify([getLang(), view, this.busy, roster,
      cur.map(g => [g.id, g.status, Students.who(g.s)])]);
    if (key === this.bodyKey) return;
    this.bodyKey = key;
    paintCapCounter('simul-count', view === 'setup' ? this.pick.size : null, SIMUL.MAX_BOARDS);
    const body = $('simul-body');
    if (view === 'loading') { body.innerHTML = `<p class="hint empty-note">${esc(t('loading'))}</p>`; return; }
    if (view === 'setup') { this.renderSetup(body, roster); return; }
    const chip = g => {
      const k = g.status === 'joined' ? 'joined' : g.status === 'invited' ? (view === 'expired' ? 'noanswer' : 'waiting')
        : g.status === 'live' ? 'playing' : g.status === 'done' ? 'over' : view === 'started' ? 'out' : 'declined';
      const on = k === 'joined' || k === 'playing';
      return `<span class="mc-role simul-chip${on ? '' : ' off'}">${esc(t('simul_chip_' + k))}</span>`;
    };
    const rows = `<div class="list">` + cur.map(g =>
      `<div class="fr-row">${Students.nameHtml(Students.who(g.s))}${chip(g)}</div>`).join('') + `</div>`;
    const joined = cur.filter(g => g.status === 'joined').length;
    const off = this.busy ? ' disabled' : '';
    if (view === 'room') {
      body.innerHTML =
        `<p class="simul-lead">${esc(t('simul_room_lead'))}</p>` +
        `<p class="hint">${esc(t('simul_room_left'))} <b class="simul-left" data-simul-left="${cur[0].invitedAt}"></b></p>` +
        rows +
        `<button id="simul-start" class="btn primary btn-wide"${joined && !this.busy ? '' : ' disabled'}>${esc(t('simul_start').replace('{n}', joined))}</button>` +
        `<p class="hint">${esc(t(joined ? 'simul_start_hint' : 'simul_start_nobody'))}</p>`;
      $('simul-start').onclick = () => this.start();
    } else if (view === 'expired') {
      body.innerHTML = `<p class="simul-lead">${esc(t('simul_room_expired'))}</p>` + rows +
        `<button id="simul-again" class="btn primary btn-wide">${esc(t('simul_again'))}</button>`;
      $('simul-again').onclick = () => {
        this.pick = new Set(cur.map(g => g.s));
        this.again = cur[0].invitedAt;
        this.sync();
      };
    } else {
      body.innerHTML = `<p class="simul-lead">${esc(t('simul_started'))}</p>` +
        `<p class="hint">${esc(t('simul_board_soon'))}</p>` + rows +
        `<button id="simul-end" class="btn danger btn-wide"${off}>${esc(t('simul_end'))}</button>`;
      $('simul-end').onclick = () => this.end();
    }
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

  async end() {
    if (!await askConfirm(t('simul_end_confirm'))) return;
    await this.write(() => endSimul());
  },
};
