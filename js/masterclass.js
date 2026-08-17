// Masterclass — a shared, online database: chapters you publish and members
// who follow along, eventually on a live board. Commit 3 of
// docs/superpowers/plans/2026-08-16-masterclass-stage-1.md.
//
// Commit 2 built these screens inert. Commit 3 fills in the network calls:
// the list is a real collection-group query, ➕ really creates a class and the
// ⋯ menu really deletes one. Chapters and members are still empty — those are
// commits 4 and 5. There is still deliberately no sample data: every list
// draws its real empty state, so nothing invented can reach the site.
//
// Everything that arrives from Firestore is another user's text, so every one
// of those values goes through esc() before it reaches innerHTML — the same
// rule js/friends.js follows.
//
// Imports from js/app.js (cycle) — every app.js binding used here is touched
// inside a function only, never at module top level. A top-level read throws
// "Cannot access '...' before initialization".
import { t, tn } from './i18n.js';
import {
  Auth, MAX_MASTERCLASSES, createMasterclass, fetchMyMasterclasses,
  deleteMasterclass,
} from './firebase.js';
import { $, esc, toast, sheet, askText, askConfirm, showScreen, activeScreen } from './app.js';

// The 5-class cap is MAX_MASTERCLASSES, imported from js/firebase.js next to
// the query that uses it. It is ADVISORY and UI-side only: it cannot be
// enforced in Firestore rules without a server-maintained counter, and a
// counter the client can write is not a security control. Same for the
// 50-chapter and 30-member caps in commits 4 and 5. The rules-enforced bound
// is the 100,000-byte chapter PGN limit.
//
// There is deliberately no second copy of the number here. Two constants for
// one cap is the js/badges.js STREAK_TIERS trap in reverse — that name exists
// twice on purpose, in two files, meaning two different things; this one must
// exist once.

export const Masterclass = {
  // The classes I own or have been added to, from one collection-group query.
  classes: [],
  // Whether that query has ever come back, and whether the last attempt failed.
  // "Empty" and "not loaded yet" and "offline" are three different screens.
  classesLoaded: false,
  loadFailed: false,
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
    // Signing in or out changes whose classes these are, so the list is
    // invalidated — never fetched here. Loading at boot would cost reads for
    // someone who never opens the Bases tab. It reloads when the tab does,
    // which is the js/friends.js pattern.
    Auth.onChange(() => {
      this.classes = [];
      this.classesLoaded = false;
      this.loadFailed = false;
      if (activeScreen === 'base') this.load();
      else this.renderList();
    });
  },

  // Called from Base.showList(), so the section is rebuilt every time the
  // Bases tab is shown. It refetches each time rather than trusting a cache:
  // a class somebody else added me to has to be able to appear, and the query
  // is one collection-group read plus one read per class.
  openList() {
    this.renderList();
    this.load();
  },

  // The one query. `classes` is left alone until it comes back, so reopening
  // the tab redraws the list that is already there instead of blanking it.
  async load() {
    if (!Auth.user) {
      this.classes = [];
      this.classesLoaded = true;
      this.loadFailed = false;
      this.renderList();
      return;
    }
    try {
      this.classes = await fetchMyMasterclasses();
      this.loadFailed = false;
    } catch (e) {
      // Offline, or the collection-group index missing. Either way the section
      // says so rather than claiming the list is empty.
      console.error('Loading Masterclasses failed', e);
      this.loadFailed = true;
    }
    this.classesLoaded = true;
    this.renderList();
  },

  renderList() {
    const el = $('mc-list');
    if (!el) return;
    el.innerHTML = '';
    if (!this.classes.length) {
      const p = document.createElement('p');
      p.className = 'mc-empty';
      // Four states, and they are not interchangeable: signed out, still
      // waiting, the query failed, and genuinely nothing here yet.
      p.textContent = !Auth.user ? t('mc_needs_signin')
        : !this.classesLoaded ? t('loading')
          : this.loadFailed ? t('mc_needs_network')
            : t('mc_empty');
      el.appendChild(p);
      return;
    }
    for (const mc of this.classes) {
      const item = document.createElement('button');
      item.className = 'list-item';
      const n = mc.memberCount || 0;
      item.innerHTML =
        `<b>🎓 ${esc(mc.name || '?')}</b>` +
        `<span class="sub">${this.roleChip(mc.role)}${n} ${tn('mc_members', n)}</span>`;
      item.onclick = () => this.open(mc.id);
      el.appendChild(item);
    }
  },

  // The gold pill that says what I am in this class. An unrecognised role
  // draws nothing rather than an empty pill — 'editor' is a legal stored value
  // that stage 1 never writes, so this has to survive meeting one.
  roleChip(role) {
    const key = `mc_role_${role}`;
    const label = t(key);
    if (!label || label === key) return '';
    return `<span class="mc-role">${esc(label)}</span> `;
  },

  // Both guards are real and permanent: a Masterclass is an online object, so
  // it needs an account and a connection.
  //
  // Signed out, the button STAYS LIVE and explains itself — Adrian's call, and
  // the plan's "hide #mc-new" line is superseded. A button that toasts
  // "Sign in to use Masterclass" teaches what the feature needs; a missing
  // button just looks like the feature does not exist.
  async newClass() {
    if (!Auth.user) { toast(t('mc_needs_signin')); return; }
    if (!navigator.onLine) { toast(t('mc_needs_network')); return; }
    // The cap counts the classes I OWN. Being a viewer in someone else's class
    // costs me nothing and must not block me from making my own.
    //
    // The list is awaited when it has never arrived: counting an empty array
    // that simply has not loaded would wave the sixth class straight through.
    if (!this.classesLoaded) await this.load();
    if (this.owned().length >= MAX_MASTERCLASSES) {
      toast(t('mc_limit').replace('{n}', MAX_MASTERCLASSES));
      return;
    }
    const name = await askText(t('mc_name'));
    if (!name) return;
    try {
      await createMasterclass(name);
    } catch (e) {
      console.error('Creating a Masterclass failed', e);
      toast(t('mc_needs_network'));
      return;
    }
    await this.load();
  },

  owned() {
    const uid = Auth.user && Auth.user.uid;
    return this.classes.filter(c => c.ownerUid === uid);
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
  // are not the same action. Delete is live from this commit; leaving is
  // commit 5's write and is still inert.
  menu() {
    const mc = this.current;
    if (!mc) return;
    const owner = mc.role === 'owner';
    sheet([
      owner
        ? { label: t('mc_delete'), danger: true, action: () => this.confirmDelete() }
        : { label: t('mc_leave'), danger: true, action: () => {} },
    ]);
  },

  // Destructive and shared: this deletes the class for every member, which is
  // what the confirm text says. There is no undo, so it goes through
  // askConfirm() exactly like unfriending does.
  async confirmDelete() {
    const mc = this.current;
    if (!mc || mc.role !== 'owner') return;
    if (!await askConfirm(t('mc_delete_confirm'))) return;
    try {
      await deleteMasterclass(mc.id);
    } catch (e) {
      console.error('Deleting a Masterclass failed', e);
      toast(t('mc_needs_network'));
      return;
    }
    // The screen showing a class that no longer exists has to go. showScreen
    // ('base') runs Base.refresh() → showList() → openList(), which refetches
    // the list, so nothing else has to be invalidated by hand.
    this.current = null;
    this.chapters = [];
    this.members = [];
    showScreen('base');
  },
};
