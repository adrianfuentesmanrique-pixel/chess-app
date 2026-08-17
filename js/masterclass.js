// Masterclass — a shared, online database: chapters you publish and members
// who follow along, eventually on a live board. Commit 2 of
// docs/superpowers/plans/2026-08-16-masterclass-stage-1.md.
//
// NOTHING HERE TALKS TO FIRESTORE YET. This commit is the screens and the
// strings only, so they can be judged at 375px before any network code makes
// them hard to reason about. `classes`, `chapters` and `members` are empty and
// every list draws its real empty state — deliberately no sample data, because
// Friends commit 2 shipped an invented SAMPLE array and commit 3 had to delete
// it again.
//
// Everything that will arrive from Firestore is another user's text, so every
// one of those values goes through esc() before it reaches innerHTML — the
// same rule js/friends.js follows.
//
// Imports from js/app.js (cycle) — every app.js binding used here is touched
// inside a function only, never at module top level. A top-level read throws
// "Cannot access '...' before initialization".
import { t, tn } from './i18n.js';
import { Auth } from './firebase.js';
import { $, esc, toast, sheet, askText, showScreen } from './app.js';

// ADVISORY, UI-side only. These three caps cannot be enforced in Firestore
// rules without a server-maintained counter, and a counter the client can
// write is not a security control. The rules-enforced bound is the
// 100,000-byte chapter PGN limit. Do not describe these as enforced.
const MC_LIMIT = 5;

export const Masterclass = {
  // The classes I own or have been added to. Filled by one collection-group
  // query in commit 3; empty until then.
  classes: [],
  // The class the Masterclass screen is showing, or null.
  current: null,
  // Its chapters and members. Commits 4 and 5 fill these.
  chapters: [],
  members: [],

  init() {
    $('mc-new').onclick = () => this.newClass();
    // Back goes to the Bases tab, which is where the section lives.
    // showScreen('base') calls Base.refresh(), which redraws the list.
    $('mc-back').onclick = () => showScreen('base');
    $('mc-menu').onclick = () => this.menu();
    // Signing in or out changes whose classes these are. Nothing is fetched
    // here — the list simply empties and the section says which of "sign in"
    // or "create one" applies.
    Auth.onChange(() => {
      this.classes = [];
      this.renderList();
    });
  },

  // Called from Base.showList(), so the section is rebuilt every time the
  // Bases tab is shown. Commit 3 starts a real query here.
  openList() {
    this.renderList();
  },

  renderList() {
    const el = $('mc-list');
    if (!el) return;
    el.innerHTML = '';
    if (!this.classes.length) {
      const p = document.createElement('p');
      p.className = 'mc-empty';
      // Signed out there is nothing to create, so the empty state says so
      // instead of inviting an action that cannot work.
      p.textContent = Auth.user ? t('mc_empty') : t('mc_needs_signin');
      el.appendChild(p);
      return;
    }
    for (const mc of this.classes) {
      const item = document.createElement('button');
      item.className = 'list-item';
      const n = mc.memberCount || 0;
      item.innerHTML =
        `<b>🎓 ${esc(mc.name || '?')}</b>` +
        `<span class="sub">${n} ${tn('mc_members', n)}</span>`;
      item.onclick = () => this.open(mc.id);
      el.appendChild(item);
    }
  },

  // Both guards are real and permanent: a Masterclass is an online object, so
  // it needs an account and a connection. The write itself lands in commit 3.
  async newClass() {
    if (!Auth.user) { toast(t('mc_needs_signin')); return; }
    if (!navigator.onLine) { toast(t('mc_needs_network')); return; }
    if (this.classes.length >= MC_LIMIT) {
      toast(t('mc_limit').replace('{n}', MC_LIMIT));
      return;
    }
    const name = await askText(t('mc_name'));
    if (!name) return;
    // Commit 3 creates the document here and reopens the list. Until then the
    // prompt exists so its flow can be judged, and the name goes nowhere —
    // inventing a local-only class would be exactly the sample data this
    // commit is avoiding.
  },

  open(mcId) {
    this.current = this.classes.find(c => c.id === mcId) || null;
    this.chapters = [];
    this.members = [];
    showScreen('masterclass');
    // The user came from the Bases tab, so that is the tab that stays lit —
    // same trick Analysis.updateBaseNav() uses for a game opened from a base.
    document.querySelectorAll('#tabbar button').forEach(b =>
      b.classList.toggle('on', b.dataset.screen === 'base'));
    this.render();
  },

  render() {
    const mc = this.current;
    $('mc-title').textContent = mc ? (mc.name || '?') : t('mc_section');
    // The ⋯ menu is about the open class, so it is hidden when there is none.
    $('mc-menu').classList.toggle('hidden', !mc);
    // Only the owner adds chapters and members. Commits 4 and 5 unhide these.
    const owner = !!mc && mc.role === 'owner';
    $('mc-add-chapter').classList.toggle('hidden', !owner);
    $('mc-add-member').classList.toggle('hidden', !owner);
    this.renderChapters();
    this.renderMembers();
  },

  renderChapters() {
    const n = this.chapters.length;
    $('mc-chapters-label').textContent = `${n} ${tn('mc_chapters', n)}`;
    const el = $('mc-chapter-list');
    el.innerHTML = '';
    if (!n) {
      const p = document.createElement('p');
      p.className = 'mc-empty';
      p.textContent = t('mc_no_chapters');
      el.appendChild(p);
    }
    // Commit 4 renders the real rows.
  },

  renderMembers() {
    const n = this.members.length;
    $('mc-members-label').textContent = `${n} ${tn('mc_members', n)}`;
    const el = $('mc-member-list');
    el.innerHTML = '';
    if (!n) {
      const p = document.createElement('p');
      p.className = 'mc-empty';
      p.textContent = t('mc_no_members');
      el.appendChild(p);
    }
    // Commit 5 renders the real rows.
  },

  // Owner and member get different items — deleting a class and leaving one
  // are not the same action. Both writes land later (commit 3 deletes,
  // commit 5 leaves), so the items are inert here.
  menu() {
    const mc = this.current;
    if (!mc) return;
    const owner = mc.role === 'owner';
    sheet([
      owner
        ? { label: t('mc_delete'), danger: true, action: () => {} }
        : { label: t('mc_leave'), danger: true, action: () => {} },
    ]);
  },
};
