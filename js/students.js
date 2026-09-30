// Students — stages 2–4 of docs/plans/2026-09-29-students.md. One screen, two
// sections: "My teachers" (invites to answer, teachers to end) and "My
// students" (invite a friend, roster cards, withdraw / remove). Also the gold
// dot on the drawer, and WHEN the student's summary is published: on accept
// (acceptTeacher writes it in the same batch), on app open when I have a
// teacher, then at most once per 15 minutes of practice. Stage 4 adds homework:
// my cards with Start / Mark done, the counting behind Puzzles homework mode,
// and on the student page the teacher's list + the Assign sheet.
//
// All the Firestore work is in js/firebase.js (stage 1) and guarded by the
// "Students" block in firestore.rules. Nothing here decides who may see what —
// the rules do. Everything that arrives from Firestore is another user's text,
// so it goes through esc() before it reaches innerHTML, as in js/friends.js.
//
// Imports from js/app.js (cycle) — every app.js binding used here is touched
// inside a function only, never at module top level.
import { t, getLang } from './i18n.js';
import { avatarHtml } from './avatars.js';
import * as db from './db.js';
import {
  Auth, MAX_STUDENTS, MAX_TEACHERS, inviteStudent, withdrawInvite, removeStudent,
  fetchMyStudentLinks, fetchMyTeacherLinks, acceptTeacher, declineTeacher,
  endCoaching, publishStudentReport, fetchStudentReports, fetchLeaderboardByUids,
  previewStudentReport,
  MAX_OPEN_HOMEWORK, HW_COUNTS_KEY, assignHomework, fetchHomeworkFor, fetchMyHomework,
  deleteHomework, saveHomeworkProgress,
} from './firebase.js';
import {
  $, esc, toast, modal, sheet, askConfirm, showScreen, activeScreen,
  paintCapCounter, openAuthModal, openEloHistoryModal, segInit, Puzzles,
} from './app.js';
import { TRACKED_THEMES } from './puzzles.js';
import { Activity, AREAS, sumActive, daysAgo } from './activity.js';
// friends.js does not import this file, and app.js imports it first, so this is
// a plain edge. The invite picker reads Friends.friends — the list the Friends
// tab already fills — rather than running a query of its own.
import { Friends } from './friends.js';

// Local kv key. Holds the last lists fetched, so the screen can draw offline,
// and doubles as the "has a teacher / has students" flag: a user with no
// links costs no reads at boot. It is keyed to the uid, and sign-out wipes the
// whole kv store anyway (Auth.signOut → db.clearSyncedProfileData).
const CACHE_KEY = 'studentsCache';
// Somebody with no links is still asked once in a while whether an invite has
// arrived, so the gold dot can appear without them opening the screen first.
// One query (1 read when empty) per 6 hours, not per boot.
const INVITE_CHECK_MS = 6 * 3600 * 1000;
// Plan: "at most every 15 minutes of practice". A second of practice is one
// js/activity.js counts (on screen, touched in the last 2 minutes, in a
// practice area) — one idle detector for the whole app.
const PUBLISH_EVERY_S = 15 * 60;
const TICK_S = 30;
// Student page: bars for the last 14 days, area totals over the 30 the
// summary carries, the 8 weakest themes before "Show all".
const BAR_DAYS = 14;
const THEMES_SHOWN = 8;
// Homework (stage 4). Progress is saved in bundles (plan 3.2): every 5 counted
// puzzles, when leaving Puzzles or the app, on Exit and on completion.
const HW_SAVE_EVERY = 5;
// Assign sheet: the student's weakest themes shown first, the rest behind
// "More themes".
const HW_THEMES_SHOWN = 12;

// Firestore Timestamps do not survive IndexedDB with their methods, and the
// screen only needs milliseconds. JSON turns them into {seconds, nanoseconds}.
const tsMs = v => typeof v === 'number' ? v
  : (v && typeof v.toMillis === 'function') ? v.toMillis()
  : (v && typeof v.seconds === 'number') ? v.seconds * 1000 : 0;
const plain = v => JSON.parse(JSON.stringify(v ?? null));

export const Students = {
  asTeacher: [],      // coaching links where I am the teacher
  asStudent: [],      // coaching links where I am the student
  reports: {},        // studentUid → summary (only students who accepted me)
  people: {},         // uid → public leaderboard row, for names without a summary
  loaded: false,      // lists have arrived at least once (fetched or cached)
  failed: false,      // the last fetch failed
  cachedAt: 0,        // when the lists on screen were fetched
  uid: null,          // whose lists these are
  bootChecked: null,  // uid the boot check already ran for
  practiceS: 0,
  publishing: false,
  homework: [],       // homework assigned to me (student side), all teachers
  hwSeen: [],         // ids of open homework I have already seen (the gold dot)
  doneSeen: {},       // studentUid → hwDone the last time I opened their page
  hwGiven: {},        // studentUid → the homework I gave them, as last fetched
  hwRun: null,        // {id, addDone, addSec, counted:Set, timer} while one runs

  init() {
    $('stu-invite').onclick = () => this.invite();
    // The Masterclass list lives on the Bases tab; Base.refresh() redraws it.
    $('stu-mc').onclick = () => showScreen('base');
    $('stu-signin').onclick = () => openAuthModal();
    $('stu-refresh').onclick = () => this.load();
    Auth.onChange(() => this.onAuth());
    for (const ev of ['online', 'offline']) {
      window.addEventListener(ev, () => {
        if (ev === 'online') this.bootCheck();
        if (activeScreen !== 'students') return;
        if (ev === 'online') this.load(); else this.render();
      });
    }
    setInterval(() => this.tick(), TICK_S * 1000);
    // A swipe-away must not lose the running homework's last bundle.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.hwSave();
    });
    window.addEventListener('pagehide', () => this.hwSave());
  },

  // Called by showScreen('students').
  onEnter() {
    this.render();
    this.load();
  },

  // A different account (or none) means none of the lists in memory are ours.
  async onAuth() {
    const uid = Auth.user ? Auth.user.uid : null;
    if (uid === this.uid) return;
    this.uid = uid;
    this.asTeacher = []; this.asStudent = []; this.reports = {}; this.people = {};
    this.homework = []; this.hwSeen = []; this.doneSeen = {}; this.hwGiven = {};
    if (this.hwRun) this.hwDrop();
    this.loaded = false; this.failed = false; this.cachedAt = 0; this.practiceS = 0;
    if (uid) await this.readCache();
    this.paintDot();
    if (activeScreen === 'students') { this.render(); this.load(); }
    this.bootCheck();
  },

  async readCache() {
    const c = await db.kvGet(CACHE_KEY, null);
    if (!c || c.uid !== this.uid) return null;
    this.asTeacher = c.asTeacher || [];
    this.asStudent = c.asStudent || [];
    this.reports = c.reports || {};
    this.people = c.people || {};
    this.homework = c.homework || [];
    this.hwSeen = c.hwSeen || [];
    this.doneSeen = c.doneSeen || {};
    this.hwGiven = c.hwGiven || {};
    this.cachedAt = c.at || 0;
    this.loaded = true;
    return c;
  },

  async writeCache(extra = {}) {
    if (!this.uid) return;
    const prev = await db.kvGet(CACHE_KEY, null);
    await db.kvSet(CACHE_KEY, plain({
      uid: this.uid, at: this.cachedAt,
      asTeacher: this.asTeacher, asStudent: this.asStudent,
      reports: this.reports, people: this.people,
      homework: this.homework, hwSeen: this.hwSeen, doneSeen: this.doneSeen,
      hwGiven: this.hwGiven,
      inviteCheckAt: (prev && prev.uid === this.uid && prev.inviteCheckAt) || 0,
      ...extra,
    }));
  },

  hasTeacher() { return this.asStudent.some(l => l.status === 'active'); },

  // App open. With a teacher: fetch my links (the dot needs them anyway) and
  // publish from those same links. Without: one cheap check every 6 hours for
  // a new invite. Teachers need nothing at boot — the roster loads on open.
  async bootCheck() {
    const uid = this.uid;
    if (!uid || !navigator.onLine || this.bootChecked === uid) return;
    const c = await db.kvGet(CACHE_KEY, null);
    const mine = c && c.uid === uid;
    const due = !mine || Date.now() - (c.inviteCheckAt || 0) > INVITE_CHECK_MS;
    if (!this.hasTeacher() && !due) return;
    this.bootChecked = uid;
    let links;
    try {
      links = await fetchMyTeacherLinks();
    } catch (e) {
      console.error('Checking for teacher invites failed', e);
      this.bootChecked = null;
      return;
    }
    if (this.uid !== uid) return;
    this.asStudent = plain(links);
    // New homework is how a student finds out at all (no notifications on the
    // free plan) — about one read per homework, only with a teacher.
    if (this.hasTeacher()) await this.loadMyHomework();
    await this.fillPeople(links.map(l => l.teacherUid));
    await this.writeCache({ inviteCheckAt: Date.now() });
    this.paintDot();
    if (activeScreen === 'students') this.render();
    // Also prunes a teacher who removed me, and deletes the summary when none is
    // left — that is the plan's "on app open when the user has a teacher".
    if (this.hasTeacher() || (mine && (c.asStudent || []).some(l => l.status === 'active'))) {
      this.publish(links);
    }
  },

  async publish(links = null) {
    if (this.publishing || !Auth.user || !navigator.onLine) return;
    this.publishing = true;
    this.practiceS = 0;
    try {
      // The summary reads activeTime from kv; write the last minute first.
      await Activity.flush(true);
      await publishStudentReport(links);
    } catch (e) {
      console.error('Publishing the training summary failed', e);
    } finally {
      this.publishing = false;
    }
  },

  // Samples js/activity.js every 30 s; publishes after 15 minutes of practice.
  tick() {
    if (!Activity.current()) return;
    this.practiceS += TICK_S;
    if (this.practiceS >= PUBLISH_EVERY_S && this.hasTeacher()) this.publish();
  },

  // Names for uids that have no summary (pending/declined links, and every
  // teacher). Friends.friends first — it is free when already loaded.
  async fillPeople(uids) {
    const missing = [...new Set(uids)].filter(u => u && !this.people[u] && !this.reports[u]);
    for (const u of missing) {
      const f = Friends.friends.find(x => x.uid === u);
      if (f) this.people[u] = { uid: u, profileName: f.profileName, username: f.username, avatarId: f.avatarId, puzzleElo: f.puzzleElo };
    }
    const still = missing.filter(u => !this.people[u]);
    if (!still.length) return;
    try {
      const rows = await fetchLeaderboardByUids(still);
      for (const u of still) if (rows[u]) this.people[u] = plain(rows[u]);
    } catch (e) {
      console.error('Loading names failed', e);
    }
  },

  // Screen open / refresh. Offline, a Firestore read never settles, so the
  // saved lists are drawn instead and the 'online' event retries.
  async load() {
    const uid = this.uid;
    if (!uid) { this.render(); return; }
    if (!navigator.onLine) { this.render(); return; }
    try {
      const [asTeacher, asStudent] = await Promise.all([fetchMyStudentLinks(), fetchMyTeacherLinks()]);
      // Summaries only when somebody has accepted me — 0 reads otherwise.
      const reports = asTeacher.some(l => l.status === 'active') ? await fetchStudentReports() : {};
      if (this.uid !== uid) return;
      this.asTeacher = plain(asTeacher);
      this.asStudent = plain(asStudent);
      if (this.hasTeacher()) await this.loadMyHomework();
      else this.homework = [];
      if (this.uid !== uid) return;
      // The running homework is gone (deleted by the teacher, or I ended
      // that teacher): stop, rather than keep writing to a missing document.
      if (this.hwRun && !this.homework.some(h => h.id === this.hwRun.id)) this.hwDrop();
      this.reports = plain(reports);
      this.people = {};
      await this.fillPeople([...asTeacher.map(l => l.studentUid), ...asStudent.map(l => l.teacherUid)]);
      this.cachedAt = Date.now();
      this.loaded = true;
      this.failed = false;
      await this.writeCache({ inviteCheckAt: Date.now() });
    } catch (e) {
      console.error('Loading Students failed', e);
      this.failed = true;
    }
    this.paintDot();
    this.render();
  },

  // Mine, from every teacher. Keeps the local copy of a homework that is
  // running (its unsaved puzzles are not on the server yet), and writes the
  // open/done counts the summary sends as hwOpen/hwDone.
  async loadMyHomework() {
    let list;
    try {
      list = plain(await fetchMyHomework());
    } catch (e) {
      console.error('Loading my homework failed', e);
      return;
    }
    const run = this.hwRun;
    if (run) {
      const here = list.find(h => h.id === run.id);
      if (here) here.done = Math.min(this.hwTarget(here), (here.done || 0) + run.addDone);
    }
    this.homework = list;
    await this.saveHwCounts();
  },

  async saveHwCounts() {
    const open = this.homework.filter(h => h.status === 'open').length;
    await db.kvSet(HW_COUNTS_KEY, { open, done: this.homework.length - open });
  },

  hwTarget(h) { return h.kind === 'puzzles' ? (h.params && h.params.count) || 1 : 1; },

  // The gold dot, on the drawer entry AND on ☰ (the drawer is closed most of
  // the time): an invite waits for my answer, OR a homework I have not seen
  // yet, OR (teacher) a student finished homework since I last opened their
  // page. The teacher part uses the cached summaries — teachers still cost no
  // reads at boot, so it lights after a Students visit, not by itself.
  paintDot() {
    const seen = new Set(this.hwSeen);
    const on = this.asStudent.some(l => l.status === 'pending')
      || this.homework.some(h => h.status === 'open' && !seen.has(h.id))
      || this.newDone().length > 0;
    document.querySelector('#tabbar button[data-screen="students"]')?.classList.toggle('has-dot', on);
    $('tabmenu-btn')?.classList.toggle('has-dot', on);
  },

  // Students with homework finished since I last opened their page.
  newDone() {
    return this.asTeacher.filter(l => l.status === 'active')
      .map(l => l.studentUid)
      .filter(u => ((this.reports[u] && this.reports[u].hwDone) || 0) > (this.doneSeen[u] || 0));
  },

  // ── rendering ─────────────────────────
  who(uid) {
    const r = this.reports[uid] || this.people[uid] || Friends.friends.find(f => f.uid === uid) || {};
    return { uid, profileName: r.profileName || '?', username: r.username || '', avatarId: r.avatarId };
  },

  nameHtml(p, sub) {
    return avatarHtml(p.avatarId, 36) +
      `<span class="fr-name">${esc(p.profileName)}` +
      `<span class="fr-sub">${esc(sub != null ? sub : p.username)}</span></span>`;
  },

  render() {
    if (!$('screen-students')) return;
    const signedIn = !!this.uid;
    $('stu-signedout').classList.toggle('hidden', signedIn);
    $('stu-body').classList.toggle('hidden', !signedIn);
    const note = $('stu-note');
    const offline = !navigator.onLine;
    const noteText = !signedIn ? ''
      : offline ? (this.loaded ? t('stu_offline_saved') : t('stu_offline_none'))
        : this.failed ? t('stu_failed')
          : !this.loaded ? t('loading') : '';
    note.textContent = noteText;
    note.classList.toggle('hidden', !noteText);
    if (!signedIn) { paintCapCounter('stu-count', null, MAX_STUDENTS); return; }
    this.renderTeachers();
    this.renderHomework();
    this.renderStudents();
  },

  // ── My teachers (I am the student) ──
  renderTeachers() {
    const el = $('stu-teacher-list');
    el.innerHTML = '';
    const order = { pending: 0, active: 1, declined: 2 };
    const links = [...this.asStudent].sort((a, b) => order[a.status] - order[b.status]);
    $('stu-teachers').classList.toggle('hidden', !links.length);
    $('stu-foot').classList.toggle('hidden', links.length > 0 || !this.loaded);
    if (this.hasTeacher()) el.appendChild(this.myPracticeRow());
    for (const l of links) {
      const p = this.who(l.teacherUid);
      if (l.status === 'pending') el.appendChild(this.inviteCard(p));
      else if (l.status === 'active') {
        el.appendChild(this.row(p, t('stu_your_teacher'), [
          { cls: 'btn small danger', key: 'stu_end', on: b => this.end(p, b) },
        ]));
      } else {
        el.appendChild(this.row(p, t('stu_you_declined'), [
          { cls: 'btn small', key: 'stu_clear', on: b => this.clearDecline(p, b) },
        ]));
      }
    }
  },

  // My own minutes this week, from the live counter. Tapping opens the same
  // student page my teachers get, built locally from the summary I would send.
  myPracticeRow() {
    const row = document.createElement('button');
    row.className = 'fr-row stack tappable stu-mine';
    const week = sumActive(Activity.data, 7).total;
    row.innerHTML = `<span class="stu-mine-ico" aria-hidden="true">⏱</span>` +
      `<span class="fr-name">${esc(t('stu_my_practice').replace('{m}', this.fmtMin(week)))}` +
      `<span class="fr-sub">${esc(t('stu_my_practice_sub'))}</span></span>`;
    row.onclick = async () => {
      await Activity.flush(true);
      const r = plain(await previewStudentReport());
      const me = { uid: this.uid, profileName: r.profileName || '?', username: r.username || '', avatarId: r.avatarId };
      this.openPage(me, r, { self: true });
    };
    return row;
  },

  // The consent screen, inline: exactly what the teacher will see, item by
  // item, before Accept. Minutes (stage 3) and homework (stage 4) are listed
  // now because accepting covers the whole life of the link.
  inviteCard(p) {
    const card = document.createElement('div');
    card.className = 'stu-invite';
    const shares = ['stu_share_profile', 'stu_share_ratings', 'stu_share_themes',
      'stu_share_counts', 'stu_share_minutes', 'stu_share_homework'];
    card.innerHTML =
      `<div class="stu-invite-head">${this.nameHtml(p)}</div>` +
      `<p class="stu-invite-lead">${esc(t('stu_invite_lead').replace('{n}', p.profileName))}</p>` +
      `<ul class="stu-share">${shares.map(k => `<li>${esc(t(k))}</li>`).join('')}</ul>` +
      `<p class="stu-never">${esc(t('stu_share_never'))}</p>` +
      `<p class="stu-invite-end">${esc(t('stu_share_end'))}</p>` +
      `<div class="fr-actions"><button class="btn small primary">${esc(t('stu_accept'))}</button>` +
      `<button class="btn small">${esc(t('stu_decline'))}</button></div>`;
    const [ok, no] = card.querySelectorAll('.fr-actions .btn');
    ok.onclick = () => this.accept(p, ok);
    no.onclick = () => this.decline(p, no);
    return card;
  },

  // ── My students (I am the teacher) ──
  renderStudents() {
    const el = $('stu-list');
    el.innerHTML = '';
    const live = this.asTeacher.filter(l => l.status !== 'declined');
    paintCapCounter('stu-count', this.loaded ? live.length : null, MAX_STUDENTS);
    const active = this.asTeacher.filter(l => l.status === 'active')
      .map(l => this.who(l.studentUid))
      .sort((a, b) => a.profileName.localeCompare(b.profileName));
    for (const p of active) el.appendChild(this.studentCard(p));
    for (const l of this.asTeacher.filter(x => x.status === 'pending')) {
      const p = this.who(l.studentUid);
      el.appendChild(this.row(p, null, [
        { cls: 'btn small', key: 'stu_withdraw', on: b => this.withdraw(p, b) },
      ], t('stu_invite_sent_note')));
    }
    // A decline stays until the student clears it; the rules refuse the
    // teacher deleting it, so there is no button — only the fact.
    for (const l of this.asTeacher.filter(x => x.status === 'declined')) {
      el.appendChild(this.row(this.who(l.studentUid), null, [], t('stu_declined_note')));
    }
    $('stu-empty').classList.toggle('hidden', !this.loaded || this.asTeacher.length > 0);
  },

  // Ratings, minutes this week; homework joins in stage 4. Tapping the card
  // opens the student page; ⋯ keeps Remove.
  studentCard(p) {
    const r = this.reports[p.uid];
    const card = document.createElement('div');
    card.className = 'fr-row stu-card';
    const num = v => (typeof v === 'number' ? String(Math.round(v)) : '—');
    let body;
    if (!r) {
      body = `<p class="stu-card-foot">${esc(t('stu_no_summary'))}</p>`;
    } else {
      const d = this.weekChange(r.puzzleEloHistory, r.puzzleElo);
      const delta = d == null || d === 0 ? ''
        : `<span class="stu-delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</span>`;
      const cell = (key, v, extra = '') =>
        `<div class="stu-stat"><span>${esc(t(key))}</span><b>${num(v)}${extra}</b></div>`;
      body =
        `<div class="stu-stats">` +
        cell('stu_r_puzzles', r.puzzleElo, delta) +
        cell('stu_r_openings', r.openingEloAvg) +
        cell('stu_r_endgames', r.endgameEloAvg) +
        cell('stu_r_blind', r.blindfoldElo) +
        `</div>` +
        `<p class="stu-card-foot">${esc(t('stu_card_foot')
          .replace('{s}', r.streakCount || 0)
          .replace('{p}', (r.puzzlesSolvedCount || 0).toLocaleString())
          .replace('{u}', this.ago(tsMs(r.updatedAt))))}</p>` +
        `<p class="stu-card-foot stu-card-min">⏱ ${esc(t('stu_min_week').replace('{m}', this.fmtMin(sumActive(r.activeTime, 7).total)))}</p>`;
      // hwOpen/hwDone count homework from ALL the student's teachers — the
      // summary is one document for all of them. "new" = finished since I
      // last opened this student's page.
      if (r.hwOpen || r.hwDone) {
        const fresh = this.newDone().includes(p.uid)
          ? ` <span class="hw-new">${esc(t('hw_card_new'))}</span>` : '';
        body += `<p class="stu-card-foot stu-card-min">${esc(t('hw_card')
          .replace('{o}', r.hwOpen || 0).replace('{d}', r.hwDone || 0))}${fresh}</p>`;
      }
    }
    card.innerHTML = this.nameHtml(p) + `<button class="fr-more" aria-label="⋯">⋯</button>` + body;
    card.querySelector('.fr-more').onclick = e => {
      e.stopPropagation();
      sheet([{ label: t('stu_remove'), danger: true, action: () => this.remove(p) }]);
    };
    if (r) {
      card.classList.add('tappable');
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.onclick = () => this.openPage(p, r);
      card.onkeydown = e => { if (e.key === 'Enter' && e.target === card) this.openPage(p, r); };
    }
    return card;
  },

  // "42 min" / "1 h 05 min".
  fmtMin(sec) {
    const m = Math.round((sec || 0) / 60);
    if (m < 60) return t('stu_min').replace('{n}', m);
    return t('stu_h_min').replace('{h}', Math.floor(m / 60)).replace('{m}', String(m % 60).padStart(2, '0'));
  },

  // ── the student page ─────────────────
  // One scrolling modal: ratings (each opens the Profile chart with the
  // student's history), practice time (14-day bars + 30-day areas), puzzle
  // themes weakest first. `self` = the student looking at their own summary.
  openPage(p, r, { self = false } = {}) {
    const num = v => (typeof v === 'number' ? String(Math.round(v)) : '—');
    return modal((box, close) => {
      box.classList.add('stu-page');
      const head = document.createElement('div');
      head.className = 'stu-page-head';
      head.innerHTML = this.nameHtml(p) +
        `<p class="stu-card-foot">${esc(self ? t('stu_self_note')
          : t('stu_updated').replace('{u}', this.ago(tsMs(r.updatedAt))))}</p>`;
      box.appendChild(head);

      // Ratings — the same four tiles as the card, each opening a chart.
      const tiles = document.createElement('div');
      tiles.className = 'stu-stats stu-page-tiles';
      const charts = [
        ['stu_r_puzzles', r.puzzleElo, 'puzzleEloHistory', 'puzzle_elo'],
        ['stu_r_openings', r.openingEloAvg, 'openingEloHistory', 'opening_elo'],
        ['stu_r_endgames', r.endgameEloAvg, 'endgameEloHistory', 'endgame_elo'],
        ['stu_r_blind', r.blindfoldElo, 'blindfoldEloHistory', 'blindfold_elo'],
      ];
      for (const [key, v, hk, tk] of charts) {
        const b = document.createElement('button');
        b.className = 'stu-stat';
        b.innerHTML = `<span>${esc(t(key))}</span><b>${num(v)}</b><i aria-hidden="true">📈</i>`;
        b.onclick = () => openEloHistoryModal(r[hk], tk, { share: false });
        tiles.appendChild(b);
      }
      box.append(this.pageHead('stu_ratings', 'stu_ratings_hint'), tiles);
      const counts = document.createElement('p');
      counts.className = 'stu-card-foot stu-page-counts';
      counts.textContent = t('stu_counts')
        .replace('{s}', r.streakCount || 0).replace('{b}', r.bestStreak || 0)
        .replace('{p}', (r.puzzlesSolvedCount || 0).toLocaleString())
        .replace('{a}', (r.puzzleAttemptCount || 0).toLocaleString());
      box.appendChild(counts);

      box.append(this.pageHead('stu_time'), this.minutesBlock(r.activeTime));
      box.append(this.pageHead('stu_themes', 'stu_themes_hint'), this.themesBlock(r.puzzleThemeElo));

      // Teacher only: what I gave this student, and Assign. Opening the page
      // also clears the "finished since last time" dot for this student.
      if (!self) {
        box.append(this.pageHead('hw_title', 'hw_title_hint'), this.teacherHwBlock(p, r));
        if ((r.hwDone || 0) !== (this.doneSeen[p.uid] || 0)) {
          this.doneSeen[p.uid] = r.hwDone || 0;
          this.writeCache();
          this.paintDot();
          if (activeScreen === 'students') this.renderStudents();
        }
      }

      const actions = document.createElement('div');
      actions.className = 'stu-page-actions';
      if (!self) {
        const rm = document.createElement('button');
        rm.className = 'btn danger';
        rm.textContent = t('stu_remove');
        rm.onclick = () => { close(null); this.remove(p); };
        actions.appendChild(rm);
      }
      const ok = document.createElement('button');
      ok.className = 'btn primary';
      ok.textContent = t('close');
      ok.onclick = () => close(null);
      actions.appendChild(ok);
      box.appendChild(actions);
    });
  },

  // ── homework: shared pieces ─────────────
  themeName(id) {
    const k = 'theme_' + id;
    return t(k) !== k ? t(k) : id;
  },

  // "10 puzzles · Fork, Pin · rated 1200–1500" / "Task — …".
  hwWhat(h, forTeacher = false) {
    if (h.kind !== 'puzzles') return t(forTeacher ? 'hw_what_text_t' : 'hw_what_text');
    const p = h.params || {};
    const themes = Array.isArray(p.themes) && p.themes.length
      ? p.themes.map(x => this.themeName(x)).join(', ') : t('hw_any_theme');
    return t('hw_what_puzzles').replace('{n}', p.count).replace('{t}', themes)
      .replace('{a}', p.minRating).replace('{b}', p.maxRating);
  },

  // 'YYYY-MM-DD' or milliseconds → "7 Oct", in the app's language.
  fmtDay(v) {
    const d = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
      ? new Date(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10)) : new Date(tsMs(v));
    if (isNaN(d)) return '';
    return d.toLocaleDateString(getLang() === 'es' ? 'es' : 'en', { day: 'numeric', month: 'short' });
  },

  // Bar + "3/10 · ⏱ 12 min". A text task shows Open/Done instead of 0/1.
  hwProgressHtml(h) {
    const target = this.hwTarget(h);
    const done = Math.min(target, h.done || 0);
    const pct = h.status === 'done' ? 100 : Math.round(done / target * 100);
    const left = h.kind === 'puzzles' ? t('hw_progress').replace('{d}', done).replace('{n}', target)
      : t(h.status === 'done' ? 'hw_status_done' : 'hw_status_open');
    return `<div class="hw-prog"><i><b style="width:${pct}%"></b></i>` +
      `<em>${esc(left)} · ${esc(t('hw_time').replace('{m}', this.fmtMin(h.seconds)))}</em></div>`;
  },

  hwSub(h, who) {
    const bits = [];
    if (who) bits.push(t('hw_from').replace('{n}', who.profileName));
    if (h.status === 'done') { if (h.completedAt) bits.push(t('hw_done_on').replace('{d}', this.fmtDay(h.completedAt))); }
    else if (h.dueDate) bits.push(t('hw_due').replace('{d}', this.fmtDay(h.dueDate)));
    return bits.join(' · ');
  },

  hwRowHtml(h, who, forTeacher) {
    return `<span class="hw-ico" aria-hidden="true">${h.kind === 'puzzles' ? '🧩' : '📝'}</span>` +
      `<span class="fr-name">${esc(h.title)}<span class="fr-sub">${esc(this.hwSub(h, who))}</span></span>` +
      `<p class="hw-what">${esc(this.hwWhat(h, forTeacher))}</p>` +
      (h.note ? `<p class="hw-note">${esc(h.note)}</p>` : '') +
      this.hwProgressHtml(h);
  },

  // ── homework: the student's side ────────
  // Open cards (due soonest first) with Start / Mark done; finished ones
  // folded underneath. Shown while I have a teacher or any homework.
  renderHomework() {
    const el = $('stu-hw-list');
    el.innerHTML = '';
    const show = this.hasTeacher() || this.homework.length > 0;
    $('stu-hw').classList.toggle('hidden', !show);
    if (!show) return;
    const key = h => `${h.dueDate || '9999'}|${String(tsMs(h.createdAt)).padStart(15, '0')}`;
    const open = this.homework.filter(h => h.status === 'open').sort((a, b) => key(a).localeCompare(key(b)));
    const done = this.homework.filter(h => h.status !== 'open')
      .sort((a, b) => tsMs(b.completedAt) - tsMs(a.completedAt));
    if (!open.length) {
      const p = document.createElement('p');
      p.className = 'hint empty-note';
      p.textContent = t('hw_none_open');
      el.appendChild(p);
    }
    for (const h of open) el.appendChild(this.hwCard(h));
    if (done.length) {
      const det = document.createElement('details');
      det.className = 'hw-done-list';
      det.innerHTML = `<summary>${esc(t('hw_done_n').replace('{n}', done.length))}</summary>`;
      for (const h of done) {
        const row = document.createElement('div');
        row.className = 'fr-row stack hw-card done';
        row.innerHTML = this.hwRowHtml(h, this.who(h.teacherUid), false);
        det.appendChild(row);
      }
      el.appendChild(det);
    }
    // Seen = on screen. Clears the gold dot for these.
    if (activeScreen === 'students' && open.some(h => !this.hwSeen.includes(h.id))) {
      this.hwSeen = open.map(h => h.id);
      this.writeCache();
      this.paintDot();
    }
  },

  hwCard(h) {
    const card = document.createElement('div');
    card.className = 'fr-row stack hw-card' + (this.hwRun && this.hwRun.id === h.id ? ' running' : '');
    card.innerHTML = this.hwRowHtml(h, this.who(h.teacherUid), false) +
      `<span class="fr-actions"><button class="btn small primary"></button></span>`;
    const btn = card.querySelector('.fr-actions .btn');
    if (h.kind === 'puzzles') {
      btn.textContent = t(h.done > 0 ? 'hw_continue' : 'hw_start');
      btn.onclick = () => this.hwStart(h);
    } else {
      btn.textContent = t('hw_mark_done');
      btn.onclick = () => this.markTextDone(h, btn);
    }
    return card;
  },

  // Start = Puzzles in homework mode (the player's own theme filter and
  // Difficulty are left alone). Seconds are counted here, once a second, while
  // Puzzles is on screen in homework mode and js/activity.js says the player
  // is practising — the same idle rule as the minutes, no second detector.
  hwStart(h) {
    if (this.hwRun && this.hwRun.id !== h.id) Puzzles.exitHomework();
    if (!this.hwRun) {
      this.hwRun = { id: h.id, addDone: 0, addSec: 0, counted: new Set(),
        timer: setInterval(() => this.hwTick(), 1000) };
    }
    const p = h.params || {};
    Puzzles.startHomework({
      id: h.id, title: h.title,
      themes: Array.isArray(p.themes) ? p.themes.filter(x => typeof x === 'string') : [],
      minRating: typeof p.minRating === 'number' ? p.minRating : 0,
      maxRating: typeof p.maxRating === 'number' ? p.maxRating : 4000,
      count: this.hwTarget(h), done: h.done || 0,
    });
  },

  hwTick() {
    const run = this.hwRun;
    if (!run) return;
    if (activeScreen === 'puzzles') {
      if (Puzzles.homework && Activity.current() === 'puzzles') run.addSec++;
    } else if (run.addDone || run.addSec) {
      this.hwSave();                      // left Puzzles: save the bundle
    }
  },

  // Called from the Puzzles first-try-solve branch (js/app.js) when the puzzle
  // matches the running homework. Counted at the moment of solving (plan 3.2).
  hwSolved(puzzleId) {
    const run = this.hwRun;
    const h = run && this.homework.find(x => x.id === run.id);
    if (!h || h.status !== 'open' || run.counted.has(puzzleId)) return;
    run.counted.add(puzzleId);
    const target = this.hwTarget(h);
    if ((h.done || 0) >= target) return;
    h.done = (h.done || 0) + 1;
    run.addDone++;
    if (Puzzles.homework) { Puzzles.homework.done = h.done; Puzzles.paintHomework(); }
    if (h.done >= target) { this.hwFinish(h); return; }
    if (run.addDone >= HW_SAVE_EVERY) this.hwSave();
    else this.writeCache();
  },

  // One bundled write. Not awaited: offline, Firestore holds the write and
  // sends it when the connection is back. The counters use increment(), so a
  // bundle can never overwrite another phone's.
  hwSave({ finish = false } = {}) {
    const run = this.hwRun;
    if (!run) return;
    const addDone = run.addDone, addSeconds = run.addSec;
    run.addDone = 0; run.addSec = 0;
    const h = this.homework.find(x => x.id === run.id);
    if (h) h.seconds = Math.min(360000, (h.seconds || 0) + addSeconds);
    if (!addDone && !addSeconds && !finish) return;
    saveHomeworkProgress(run.id, { addDone, addSeconds, finish })
      .catch(e => console.error('Saving homework progress failed', e));
    this.writeCache();
  },

  hwFinish(h) {
    h.status = 'done';
    h.completedAt = Date.now();
    this.hwSave({ finish: true });
    toast(t('hw_finished').replace('{n}', h.title), 3200);
    // The teacher's roster reads hwDone from the summary: publish now.
    this.saveHwCounts().then(() => { if (this.hasTeacher()) this.publish(); });
    Puzzles.exitHomework();
  },

  // Puzzles.exitHomework() calls this: save what is pending, stop the clock.
  hwStop() {
    const run = this.hwRun;
    if (!run) return;
    this.hwSave();
    clearInterval(run.timer);
    this.hwRun = null;
    if (activeScreen === 'students') this.render();
  },

  // Account changed: nothing pending belongs to the new account.
  hwDrop() {
    if (this.hwRun) clearInterval(this.hwRun.timer);
    this.hwRun = null;
    Puzzles.exitHomework();
  },

  // A text task has no proof — the student ticks it, and the confirm says so.
  async markTextDone(h, btn) {
    if (!this.online()) return;
    if (!await askConfirm(t('hw_mark_done_confirm').replace('{n}', esc(h.title)))) return;
    this.freeze(btn);
    try {
      await saveHomeworkProgress(h.id, { addDone: 1, finish: true });
      h.done = 1; h.status = 'done'; h.completedAt = Date.now();
      await this.saveHwCounts();
      await this.writeCache();
      toast(t('hw_finished').replace('{n}', h.title));
      if (this.hasTeacher()) this.publish();
    } catch (e) {
      console.error('Marking homework done failed', e);
      toast(t('stu_try_again'));
    }
    this.render();
  },

  // ── homework: the teacher's side (on the student page) ──
  // Fetched when the page opens (≤ 1 read per homework), not with the roster.
  // The last list fetched is kept (kv cache), so offline shows it instead of
  // nothing.
  teacherHwBlock(p, r) {
    const wrap = document.createElement('div');
    wrap.className = 'hw-teacher';
    const add = document.createElement('button');
    add.className = 'btn primary btn-wide';
    add.textContent = t('hw_assign');
    const list = document.createElement('div');
    list.className = 'list';
    wrap.append(add, list);
    let items = this.hwGiven[p.uid] || null;
    const note = key => {
      list.innerHTML = `<p class="hint">${esc(t(key))}</p>`;
    };
    const draw = () => {
      if (!items) { note(navigator.onLine ? 'hw_loading_list' : 'hw_offline_list'); return; }
      if (!items.length) { note('hw_none_given'); return; }
      list.innerHTML = navigator.onLine ? ''
        : `<p class="hint">${esc(t('stu_offline_saved'))}</p>`;
      const sorted = [...items].sort((a, b) =>
        (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || tsMs(b.createdAt) - tsMs(a.createdAt));
      for (const h of sorted) {
        const row = document.createElement('div');
        row.className = 'fr-row stack hw-card' + (h.status === 'open' ? '' : ' done');
        row.innerHTML = this.hwRowHtml(h, null, true) +
          `<span class="fr-actions"><button class="btn small danger">${esc(t('hw_delete'))}</button></span>`;
        row.querySelector('.fr-actions .btn').onclick = () => this.deleteHw(h, refresh);
        list.appendChild(row);
      }
    };
    const refresh = async () => {
      if (!navigator.onLine || !Auth.user) { draw(); return; }
      try {
        items = plain(await fetchHomeworkFor(p.uid));
        this.hwGiven[p.uid] = items;
        this.writeCache();
      } catch (e) {
        console.error('Loading homework failed', e);
        if (items) draw(); else note('stu_failed');
        return;
      }
      draw();
    };
    add.onclick = async () => {
      if (!this.online()) return;
      // Advisory cap (plan 3.1) — no rule can count.
      if (items && items.filter(h => h.status === 'open').length >= MAX_OPEN_HOMEWORK) {
        toast(t('hw_cap').replace('{n}', MAX_OPEN_HOMEWORK));
        return;
      }
      const spec = await this.assignSheet(p, r);
      if (!spec) return;
      try {
        await assignHomework(p.uid, spec);
        toast(t('hw_sent'));
      } catch (e) {
        console.error('Assigning homework failed', e);
        toast(t('stu_try_again'));
      }
      refresh();
    };
    draw();
    refresh();
    return wrap;
  },

  async deleteHw(h, refresh) {
    if (!this.online()) return;
    if (!await askConfirm(t('hw_delete_confirm').replace('{n}', esc(h.title)))) return;
    try {
      await deleteHomework(h.id);
    } catch (e) {
      console.error('Deleting homework failed', e);
      toast(t('stu_try_again'));
    }
    refresh();
  },

  // The assign sheet. Resolves to {kind, title, note, params, dueDate} or
  // null. Bounds match the homework rule exactly (count 1–100, band 0–4000
  // with from ≤ to, ≤ 5 themes, title ≤ 80, note ≤ 500).
  assignSheet(p, r) {
    const base = typeof r.puzzleElo === 'number' ? r.puzzleElo : 1200;
    const lo0 = Math.max(400, Math.min(2700, Math.round((base - 150) / 50) * 50));
    // Themes the app names; the student's weakest first, then the rest.
    const rated = r.puzzleThemeElo && typeof r.puzzleThemeElo === 'object' ? r.puzzleThemeElo : {};
    const themes = TRACKED_THEMES.filter(x => t('theme_' + x) !== 'theme_' + x);
    const weak = themes.filter(x => typeof rated[x] === 'number').sort((a, b) => rated[a] - rated[b]);
    const ordered = [...weak, ...themes.filter(x => !weak.includes(x))];
    return modal((box, close) => {
      box.classList.add('hw-sheet');
      box.innerHTML =
        `<h3>${esc(t('hw_assign_to').replace('{n}', p.profileName))}</h3>` +
        `<div class="seg hw-kind"><button data-v="puzzles" class="on">${esc(t('hw_kind_puzzles'))}</button>` +
        `<button data-v="text">${esc(t('hw_kind_text'))}</button></div>` +
        `<div class="hw-pz">` +
        `<label class="hw-label">${esc(t('hw_f_count'))}<input class="input hw-count" type="number" inputmode="numeric" min="1" max="100" value="10"></label>` +
        `<div class="hw-label">${esc(t('hw_f_band'))}<div class="hw-band">` +
        `<label>${esc(t('hw_f_from'))}<input class="input hw-min" type="number" inputmode="numeric" min="0" max="4000" step="50" value="${lo0}"></label>` +
        `<label>${esc(t('hw_f_to'))}<input class="input hw-max" type="number" inputmode="numeric" min="0" max="4000" step="50" value="${lo0 + 300}"></label>` +
        `</div></div>` +
        `<div class="hw-label">${esc(t('hw_f_themes'))}<span class="hw-sub">${esc(t('hw_f_themes_hint'))}</span>` +
        `<div class="hw-chips"></div></div>` +
        `</div>` +
        `<label class="hw-label"><span class="hw-title-lab">${esc(t('hw_f_title_auto'))}</span><input class="input hw-title" maxlength="80"></label>` +
        `<label class="hw-label">${esc(t('hw_f_note'))}<textarea class="input hw-note-in" maxlength="500" rows="2"></textarea></label>` +
        `<label class="hw-label">${esc(t('hw_f_due'))}<input class="input hw-due" type="date"></label>`;
      const $$ = sel => box.querySelector(sel);
      let kind = 'puzzles';
      segInit($$('.hw-kind'), v => {
        kind = v;
        $$('.hw-pz').classList.toggle('hidden', v !== 'puzzles');
        $$('.hw-title-lab').textContent = t(v === 'puzzles' ? 'hw_f_title_auto' : 'hw_f_task');
      });

      const picked = new Set();
      const chips = $$('.hw-chips');
      const drawChips = n => {
        chips.innerHTML = '';
        for (const x of ordered.slice(0, n)) {
          const c = document.createElement('button');
          c.type = 'button';
          c.className = 'hw-chip' + (picked.has(x) ? ' on' : '');
          c.setAttribute('aria-pressed', String(picked.has(x)));
          c.innerHTML = esc(this.themeName(x)) +
            (typeof rated[x] === 'number' ? ` <small>${Math.round(rated[x])}</small>` : '');
          c.onclick = () => {
            if (picked.has(x)) picked.delete(x);
            else if (picked.size >= 5) { toast(t('hw_max_themes')); return; }
            else picked.add(x);
            c.classList.toggle('on', picked.has(x));
            c.setAttribute('aria-pressed', String(picked.has(x)));
          };
          chips.appendChild(c);
        }
      };
      drawChips(HW_THEMES_SHOWN);
      if (ordered.length > HW_THEMES_SHOWN) {
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'btn small stu-more';
        more.textContent = t('hw_f_more_themes');
        more.onclick = () => { drawChips(ordered.length); more.remove(); };
        chips.after(more);
      }

      const actions = document.createElement('div');
      actions.className = 'row';
      const ok = document.createElement('button');
      ok.className = 'btn primary'; ok.textContent = t('hw_send');
      const ca = document.createElement('button');
      ca.className = 'btn'; ca.textContent = t('cancel');
      ca.onclick = () => close(null);
      ok.onclick = () => {
        let title = $$('.hw-title').value.trim().slice(0, 80);
        const note = $$('.hw-note-in').value.trim().slice(0, 500);
        const due = $$('.hw-due').value;
        const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : '';
        if (kind === 'text') {
          if (!title) { toast(t('hw_need_title')); return; }
          close({ kind, title, note, params: {}, dueDate });
          return;
        }
        const count = Number($$('.hw-count').value);
        const minRating = Number($$('.hw-min').value);
        const maxRating = Number($$('.hw-max').value);
        if (!Number.isInteger(count) || count < 1 || count > 100) { toast(t('hw_bad_count')); return; }
        if (![minRating, maxRating].every(v => Number.isInteger(v) && v >= 0 && v <= 4000) || minRating > maxRating) {
          toast(t('hw_bad_band'));
          return;
        }
        const list = ordered.filter(x => picked.has(x));
        if (!title) {
          title = (list.length
            ? t('hw_auto_title').replace('{n}', count).replace('{t}', list.map(x => this.themeName(x)).join(', '))
            : t('hw_auto_title_any').replace('{n}', count).replace('{a}', minRating).replace('{b}', maxRating)
          ).slice(0, 80);
        }
        close({ kind, title, note, params: { themes: list, minRating, maxRating, count }, dueDate });
      };
      actions.append(ok, ca);
      box.appendChild(actions);
    });
  },

  pageHead(key, hintKey) {
    const h = document.createElement('div');
    h.className = 'stu-page-sec';
    h.innerHTML = `<h4>${esc(t(key))}</h4>` + (hintKey ? `<span>${esc(t(hintKey))}</span>` : '');
    return h;
  },

  // Minutes per day as bars (the student's own dates), then each area's share
  // of the 30 days the summary carries.
  minutesBlock(map) {
    const wrap = document.createElement('div');
    wrap.className = 'stu-time';
    const week = sumActive(map, 7);
    const month = sumActive(map, 30);
    const days = [];
    for (let i = BAR_DAYS - 1; i >= 0; i--) {
      const d = daysAgo(i);
      const row = (map && map[d]) || {};
      days.push([d, Object.values(row).reduce((a, s) => a + (typeof s === 'number' && s > 0 ? s : 0), 0)]);
    }
    const peak = Math.max(...days.map(([, s]) => s), 60);
    wrap.innerHTML =
      `<div class="stu-time-sum"><div><span>${esc(t('stu_week'))}</span><b>${esc(this.fmtMin(week.total))}</b></div>` +
      `<div><span>${esc(t('stu_30d'))}</span><b>${esc(this.fmtMin(month.total))}</b></div></div>` +
      `<div class="stu-bars" role="img" aria-label="${esc(t('stu_bars_aria').replace('{n}', BAR_DAYS))}">` +
      days.map(([d, s]) => {
        const m = Math.round(s / 60);
        return `<div class="stu-bar" title="${esc(d)} · ${esc(this.fmtMin(s))}">` +
          `<em>${m || ''}</em><i style="height:${s ? Math.max(3, Math.round(s / peak * 80)) : 0}px"></i>` +
          `<span>${+d.slice(8)}</span></div>`;
      }).join('') + `</div>`;
    const areas = AREAS.filter(a => month.byArea[a] > 0);
    if (!areas.length) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = t('stu_no_time');
      wrap.appendChild(p);
      return wrap;
    }
    const top = Math.max(...areas.map(a => month.byArea[a]));
    const list = document.createElement('div');
    list.className = 'stu-areas';
    list.innerHTML = areas.sort((a, b) => month.byArea[b] - month.byArea[a]).map(a =>
      `<div class="stu-area"><span>${esc(t('act_' + a))}</span>` +
      `<i><b style="width:${Math.max(2, Math.round(month.byArea[a] / top * 100))}%"></b></i>` +
      `<em>${esc(this.fmtMin(month.byArea[a]))}</em></div>`).join('');
    wrap.appendChild(list);
    return wrap;
  },

  // Per-theme puzzle ratings, weakest first — what a teacher would assign.
  // puzzleThemeElo also rates the puzzle set's meta-tags (endgame, short,
  // crushing…), which the app never offers as a theme; only named themes show.
  themesBlock(themes) {
    const wrap = document.createElement('div');
    const rows = Object.entries(themes && typeof themes === 'object' ? themes : {})
      .filter(([k, v]) => typeof v === 'number' && Number.isFinite(v) && t('theme_' + k) !== 'theme_' + k)
      .map(([k, v]) => [t('theme_' + k), Math.round(v)])
      .sort((a, b) => a[1] - b[1]);
    if (!rows.length) {
      wrap.innerHTML = `<p class="hint">${esc(t('stu_no_themes'))}</p>`;
      return wrap;
    }
    const grid = document.createElement('div');
    grid.className = 'stu-themes';
    const draw = n => {
      grid.innerHTML = rows.slice(0, n).map(([label, v]) =>
        `<div class="stu-theme"><span>${esc(label)}</span><b>${v}</b></div>`).join('');
    };
    draw(THEMES_SHOWN);
    wrap.appendChild(grid);
    if (rows.length > THEMES_SHOWN) {
      const more = document.createElement('button');
      more.className = 'btn small stu-more';
      more.textContent = t('stu_show_all').replace('{n}', rows.length);
      more.onclick = () => { draw(rows.length); more.remove(); };
      wrap.appendChild(more);
    }
    return wrap;
  },

  // Puzzle rating now minus the rating a week ago, from the history the
  // summary carries ({date: 'YYYY-MM-DD', value}). With less than a week of
  // history, the change since its first day.
  weekChange(hist, now) {
    if (!Array.isArray(hist) || !hist.length || typeof now !== 'number') return null;
    const cut = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    let base = hist[0];
    for (const h of hist) if (h && h.date <= cut) base = h;
    return typeof base?.value === 'number' ? Math.round(now - base.value) : null;
  },

  ago(ms) {
    if (!ms) return '—';
    const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
    if (m < 60) return t('stu_ago_min').replace('{n}', m);
    const h = Math.round(m / 60);
    if (h < 48) return t('stu_ago_h').replace('{n}', h);
    return t('stu_ago_d').replace('{n}', Math.round(h / 24));
  },

  // Same shape as Friends.personRow(): name over a line of actions.
  row(p, sub, actions, note) {
    const row = document.createElement('div');
    row.className = 'fr-row stack';
    row.innerHTML = this.nameHtml(p, sub) +
      `<span class="fr-actions">` +
      (note ? `<span class="fr-pending">${esc(note)}</span>` : '') +
      actions.map(a => `<button class="${a.cls}">${esc(t(a.key))}</button>`).join('') +
      `</span>`;
    const els = row.querySelectorAll('.fr-actions .btn');
    actions.forEach((a, i) => { els[i].onclick = () => a.on(els[i]); });
    return row;
  },

  freeze(btn) {
    const box = btn && btn.closest('.fr-row, .stu-invite');
    if (box) box.querySelectorAll('.btn').forEach(b => { b.disabled = true; });
  },

  // Every consent change needs the network NOW. Firestore would otherwise
  // queue it and apply it later without the person seeing that happen.
  online() {
    if (navigator.onLine) return true;
    toast(t('stu_needs_network'));
    return false;
  },

  // askConfirm() puts its message into innerHTML, so the remote name is escaped.
  confirmText(key, p) { return t(key).replace('{n}', esc(p.profileName)); },

  // ── actions ───────────────────────────
  async invite() {
    if (!this.uid || !this.online()) return;
    if (!this.loaded || this.failed) await this.load();
    if (this.failed) { toast(t('stu_failed')); return; }
    const taken = new Map(this.asTeacher.map(l => [l.studentUid, l.status]));
    const used = this.asTeacher.filter(l => l.status !== 'declined').length;
    if (used >= MAX_STUDENTS) { toast(t('stu_max_students').replace('{n}', MAX_STUDENTS)); return; }
    if (!Friends.friendsLoaded) await Friends.loadFriends();
    let uids = await this.pickFriends(taken);
    if (!uids || !uids.length) return;
    // Advisory cap: trim rather than refuse, as Masterclass does.
    const room = MAX_STUDENTS - used;
    if (uids.length > room) {
      toast(t('stu_max_students').replace('{n}', MAX_STUDENTS));
      uids = uids.slice(0, room);
    }
    // A permission error means not-friends OR they blocked me. Both look
    // exactly like success — a block must never be revealed. Do not add an
    // error message here.
    for (const u of uids) {
      try { await inviteStudent(u); } catch (e) { console.warn('Invite not written', e.code || e); }
    }
    toast(t('stu_invite_sent'));
    await this.load();
  },

  // Checkboxes + one Invite button, the Masterclass picker's shape. Friends
  // who already have a link show why they cannot be picked.
  pickFriends(taken) {
    const list = Friends.friends;
    const chip = { active: 'stu_chip_student', pending: 'stu_chip_invited', declined: 'stu_chip_declined' };
    return modal((box, close) => {
      box.innerHTML = `<h3>${esc(t('stu_invite_title'))}</h3>` +
        `<p class="hint">${esc(t('stu_invite_hint'))}</p>`;
      if (!list.length) {
        const p = document.createElement('p');
        p.className = 'mc-empty';
        p.textContent = t('stu_no_friends');
        box.appendChild(p);
      }
      const boxes = [];
      for (const f of list) {
        const st = taken.get(f.uid);
        const row = document.createElement('label');
        row.className = 'mc-pick' + (st ? ' taken' : '');
        row.innerHTML =
          (st ? '<span></span>' : '<input type="checkbox">') +
          avatarHtml(f.avatarId, 36) +
          `<span class="fr-name">${esc(f.profileName || '?')}` +
          `<span class="fr-sub">${esc(f.username || '')}</span></span>` +
          (st ? `<span class="mc-role">${esc(t(chip[st]))}</span>` : '');
        const cb = row.querySelector('input');
        if (cb) boxes.push([cb, f.uid]);
        box.appendChild(row);
      }
      const actions = document.createElement('div');
      actions.className = 'row';
      const ca = document.createElement('button');
      ca.className = 'btn'; ca.textContent = t('cancel');
      ca.onclick = () => close(null);
      if (boxes.length) {
        const ok = document.createElement('button');
        ok.className = 'btn primary'; ok.textContent = t('stu_invite_btn');
        ok.onclick = () => close(boxes.filter(([c]) => c.checked).map(([, u]) => u));
        actions.append(ok, ca);
      } else actions.append(ca);
      box.appendChild(actions);
    });
  },

  async withdraw(p, btn) {
    if (!this.online()) return;
    if (!await askConfirm(this.confirmText('stu_withdraw_confirm', p))) return;
    this.freeze(btn);
    await this.run(() => withdrawInvite(p.uid));
  },

  async remove(p) {
    if (!this.online()) return;
    if (!await askConfirm(this.confirmText('stu_remove_confirm', p))) return;
    await this.run(() => removeStudent(p.uid));
  },

  // acceptTeacher() is the ONE batch: link → active + summary naming this
  // teacher. Never split it — the rules check the summary with getAfter().
  async accept(p, btn) {
    if (!this.online()) return;
    this.freeze(btn);
    try {
      await Activity.flush(true);
      await acceptTeacher(p.uid);
      this.practiceS = 0;
      toast(t('stu_accepted').replace('{n}', p.profileName));
    } catch (e) {
      console.error('Accepting a teacher failed', e);
      toast(e && e.code === 'max-teachers'
        ? t('stu_max_teachers').replace('{n}', MAX_TEACHERS) : t('stu_try_again'));
    }
    await this.load();
  },

  async decline(p, btn) {
    if (!this.online()) return;
    if (!await askConfirm(this.confirmText('stu_decline_confirm', p))) return;
    this.freeze(btn);
    await this.run(() => declineTeacher(p.uid));
  },

  // End = delete the link and prune/delete the summary, in one batch.
  async end(p, btn) {
    if (!this.online()) return;
    if (!await askConfirm(this.confirmText('stu_end_confirm', p))) return;
    this.freeze(btn);
    await this.run(() => endCoaching(p.uid));
  },

  // Clearing an old decline is the same delete as End.
  async clearDecline(p, btn) {
    if (!this.online()) return;
    this.freeze(btn);
    await this.run(() => endCoaching(p.uid));
  },

  async run(fn) {
    try {
      await fn();
    } catch (e) {
      console.error('Students action failed', e);
      toast(t('stu_try_again'));
    }
    await this.load();
  },
};
