// Students — stage 2 of docs/plans/2026-09-29-students.md. One screen, two
// sections: "My teachers" (invites to answer, teachers to end) and "My
// students" (invite a friend, roster cards, withdraw / remove). Also the gold
// dot on the drawer, and WHEN the student's summary is published: on accept
// (acceptTeacher writes it in the same batch), on app open when I have a
// teacher, then at most once per 15 minutes of practice.
//
// All the Firestore work is in js/firebase.js (stage 1) and guarded by the
// "Students" block in firestore.rules. Nothing here decides who may see what —
// the rules do. Everything that arrives from Firestore is another user's text,
// so it goes through esc() before it reaches innerHTML, as in js/friends.js.
//
// Imports from js/app.js (cycle) — every app.js binding used here is touched
// inside a function only, never at module top level.
import { t } from './i18n.js';
import { avatarHtml } from './avatars.js';
import * as db from './db.js';
import {
  Auth, MAX_STUDENTS, MAX_TEACHERS, inviteStudent, withdrawInvite, removeStudent,
  fetchMyStudentLinks, fetchMyTeacherLinks, acceptTeacher, declineTeacher,
  endCoaching, publishStudentReport, fetchStudentReports, fetchLeaderboardByUids,
} from './firebase.js';
import {
  $, esc, toast, modal, sheet, askConfirm, showScreen, activeScreen,
  paintCapCounter, openAuthModal,
} from './app.js';
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
// Plan: "at most every 15 minutes of practice". A second of practice is a
// second the app is on screen and was touched in the last 2 minutes — the same
// definition stage 3's js/activity.js will use per area; this counter is
// deliberately area-blind and only times the publish.
const PUBLISH_EVERY_S = 15 * 60;
const IDLE_MS = 120 * 1000;
const TICK_S = 30;

// Firestore Timestamps do not survive IndexedDB with their methods, and the
// screen only needs milliseconds. JSON turns them into {seconds, nanoseconds}.
const tsMs = v => (v && typeof v.toMillis === 'function') ? v.toMillis()
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
  lastInput: 0,
  publishing: false,

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
    for (const ev of ['pointerdown', 'keydown']) {
      window.addEventListener(ev, () => { this.lastInput = Date.now(); }, { passive: true, capture: true });
    }
    setInterval(() => this.tick(), TICK_S * 1000);
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
      await publishStudentReport(links);
    } catch (e) {
      console.error('Publishing the training summary failed', e);
    } finally {
      this.publishing = false;
    }
  },

  // Counts practice seconds; publishes after 15 minutes of them. Area-blind
  // until stage 3 brings js/activity.js.
  tick() {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - this.lastInput > IDLE_MS) return;
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

  // The gold dot: an invite is waiting for my answer. Painted on the drawer
  // entry AND on ☰, because the drawer is closed most of the time. Stage 4 adds
  // new homework (student) and newly finished homework (teacher).
  paintDot() {
    const on = this.asStudent.some(l => l.status === 'pending');
    document.querySelector('#tabbar button[data-screen="students"]')?.classList.toggle('has-dot', on);
    $('tabmenu-btn')?.classList.toggle('has-dot', on);
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

  // Ratings only in stage 2; minutes and homework join the card in stages 3/4.
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
          .replace('{u}', this.ago(tsMs(r.updatedAt))))}</p>`;
    }
    card.innerHTML = this.nameHtml(p) + `<button class="fr-more" aria-label="⋯">⋯</button>` + body;
    card.querySelector('.fr-more').onclick = () => sheet([
      { label: t('stu_remove'), danger: true, action: () => this.remove(p) },
    ]);
    return card;
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
