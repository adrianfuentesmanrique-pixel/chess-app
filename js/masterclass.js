// Masterclass — a shared, online database: chapters you publish, members who
// follow along, and a live board. Commit 6 of
// docs/superpowers/plans/2026-08-16-masterclass-stage-1.md.
//
// Commit 2 built these screens inert. Commit 3 made the list, the create and
// the delete real. Commit 4 added chapters: the owner takes one from a local
// base or from the Analysis board, everyone in the class can open one on that
// same board, and the owner can delete one. Commit 5 added members — the owner
// invites friends, everyone sees who is in the class, the owner can remove
// somebody and a member can leave. Commit 6 adds live follow: the owner
// broadcasts the board they are on, and members watch it move. There is still
// deliberately no sample data: every list draws its real empty state, so
// nothing invented can reach the site.
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
  deleteMasterclass, MAX_CHAPTERS, MAX_CHAPTER_BYTES, addChapter, fetchChapters,
  deleteChapter, updateChapter, renameMasterclass,
  MAX_MEMBERS, addMembers, fetchMembers, removeMember,
  leaveMasterclass, setMemberCount, fetchLeaderboardByUids,
  pushLiveState, watchLiveState, stopLiveState,
} from './firebase.js';
import {
  $, esc, toast, modal, sheet, askText, askConfirm, showScreen, activeScreen,
  chooseBase, Analysis,
} from './app.js';
import { avatarHtml } from './avatars.js';
// js/friends.js does NOT import this file, so this is a plain edge and not a
// second cycle — and js/app.js imports friends.js one line before masterclass.js,
// so it has finished evaluating by the time anything here runs. The picker
// reads Friends.friends, the list fetchFriendUids() already fills, rather than
// running a second query of its own.
import { Friends } from './friends.js';
import { parsePgn, lineOf, gotoLine } from './tree.js';
import * as db from './db.js';

// A base can hold thousands of games and this picker is a modal full of
// buttons, so it shows the most recently touched ones and says so. Anything
// older is still reachable — open it from the Bases tab and use
// "From the current board".
const PICK_GAMES = 50;

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

// A live state boiled down to the three fields that decide where a board goes,
// so two snapshots carrying the same position can be told apart from a real
// move. Only used to skip redundant work — never to decide what to draw.
function liveKey(st) {
  return st ? `${st.chapterId}|${st.line}|${st.fen}` : '';
}

export const Masterclass = {
  // The classes I own or have been added to, from one collection-group query.
  classes: [],
  // Whether that query has ever come back, and whether the last attempt failed.
  // "Empty" and "not loaded yet" and "offline" are three different screens.
  classesLoaded: false,
  loadFailed: false,
  // The class the Masterclass screen is showing, or null.
  current: null,
  // Its chapters and its members.
  chapters: [],
  // Same three-state rule the class list follows: "empty", "still loading" and
  // "the fetch failed" are three different things to draw.
  chaptersLoaded: false,
  chaptersFailed: false,
  // Members, joined to their public /leaderboard rows for names and avatars.
  // The same three states, drawn apart for the same reason.
  members: [],
  membersLoaded: false,
  membersFailed: false,

  // ── Live follow ────────────────────────────────────────────────────────
  // Am I, the owner, broadcasting? Never on by itself: being watched is
  // something you switch on, not something that happens to you.
  live: false,
  // The teacher's last known position, straight off the listener, or null when
  // nobody is driving. Only a non-owner ever has one — the owner does not watch
  // their own document.
  liveState: null,
  // Should my board chase it? Default on, so opening a class that is live puts
  // you in the lesson; it goes off the moment you choose to browse.
  following: true,
  // The onSnapshot unsubscribe. A listener left running is a document read per
  // teacher move, so this is never dropped on the floor — see closeLive().
  unwatch: null,
  // Did the last snapshot come out of the cache instead of the server? That is
  // the only reliable "I have lost the connection" signal Firestore gives, and
  // it is what draws the Reconnecting bar. Owners never have one: an owner does
  // not watch their own document, so there is no listener to go stale.
  liveStale: false,
  // Which chapter is on the Analysis board for this class. It is what the owner
  // broadcasts and what tells a follower whether the incoming state needs a
  // different chapter loaded or just a move.
  liveChapterId: null,

  init() {
    $('mc-new').onclick = () => this.newClass();
    $('mc-add-chapter').onclick = () => this.addChapterMenu();
    $('mc-add-member').onclick = () => this.invite();
    // Back goes to the Bases tab, which is where the section lives.
    // showScreen('base') calls Base.refresh(), which redraws the list.
    // Leaving the class ends the broadcast and drops the listener — closing a
    // lesson is exactly when a teacher expects to stop being watched.
    $('mc-back').onclick = () => { this.closeLive(); showScreen('base'); };
    $('mc-menu').onclick = () => this.menu();
    // Signing in or out changes whose classes these are, so the list is
    // invalidated — never fetched here. Loading at boot would cost reads for
    // someone who never opens the Bases tab. It reloads when the tab does,
    // which is the js/friends.js pattern.
    Auth.onChange(() => {
      // Signing out ends any broadcast and drops the listener: the reads it
      // would make are no longer allowed, and the document is no longer mine.
      this.closeLive();
      this.classes = [];
      this.classesLoaded = false;
      this.loadFailed = false;
      if (activeScreen === 'base') this.load();
      else this.renderList();
    });
    // The connection coming and going changes what both screens can honestly
    // say, so both are redrawn. Going offline: the section says so and the live
    // bar says Reconnecting without waiting for Firestore to notice. Coming
    // back: the section refetches — but only when the Bases tab is actually
    // open, so a reconnect while somebody is solving puzzles costs no reads.
    // The live listener needs no nudge; it resubscribes and reports fromCache
    // false by itself.
    for (const ev of ['online', 'offline']) {
      window.addEventListener(ev, () => {
        if (ev === 'online' && activeScreen === 'base') this.load();
        else this.renderList();
        this.renderLive();
      });
    }
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
    // Offline, the query cannot answer: a Firestore read with no network never
    // resolves and never rejects, so this would sit on the await forever and the
    // section would be stuck on "Loading…" behind the offline message. The
    // 'online' listener in init() is what retries it.
    if (!navigator.onLine) { this.renderList(); return; }
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
    // Offline replaces the whole section, even when a list is already in memory
    // from before the connection went. Every row leads to a screen that cannot
    // load its chapters or its members, so leaving them tappable would trade one
    // honest message for three broken ones. mc_needs_network is the string that
    // says the LOCAL BASES below still work, which is the whole point of putting
    // it here rather than an "offline" banner over the tab.
    const offline = !navigator.onLine;
    if (offline || !this.classes.length) {
      const p = document.createElement('p');
      p.className = 'mc-empty';
      // Five states, and they are not interchangeable: no connection, signed
      // out, still waiting, the query failed, and genuinely nothing here yet.
      p.textContent = offline ? t('mc_needs_network')
        : !Auth.user ? t('mc_needs_signin')
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
    // Before this.current moves: closeLive() stops a broadcast on the class we
    // are leaving, which is the one it can still write to.
    this.closeLive();
    this.current = this.classes.find(c => c.id === mcId) || null;
    this.chapters = [];
    this.chaptersLoaded = false;
    this.chaptersFailed = false;
    this.members = [];
    this.membersLoaded = false;
    this.membersFailed = false;
    showScreen('masterclass');
    this.lightBasesTab();
    this.render();
    this.loadChapters();
    this.loadMembers();
    this.watch();
  },

  // Coming back from a chapter that was opened in Analysis. The class, its
  // chapters and its members are all still in memory, so this redraws what is
  // already there instead of paying for the reads again. If the page was
  // reloaded while the chapter was open there is nothing to come back to, so
  // it falls back to the Bases tab, which refetches the list.
  // TRUE only when the board in front of you is a chapter of a class YOU own.
  // A follower's board is a chapter too, and a viewer's rewrite would be
  // refused by the rules anyway — so the button is not shown rather than shown
  // and then failing.
  canSaveChapter() {
    const mc = this.current;
    return !!(mc && mc.role === 'owner'
      && Analysis.ctx && Analysis.ctx.fromMasterclass === mc.id
      && Analysis.ctx.mcChapterId);
  },

  // The other half of addFromBoard(). Same tree, same toPgn() — the difference
  // is only whether it lands on a NEW document or the one this board came from.
  //
  // Before this existed, editing a chapter had nowhere to go: openChapter()
  // loads with baseId: null, so 💾 Save to database offers to copy the game
  // into a local base and there was no path back to the class at all. The
  // workaround was "add a second chapter and delete the first", which loses
  // the chapter's place in the order and its id.
  //
  // title and order are read from the STORED row, not from the board: an edit
  // changes the moves, and silently renaming a chapter or moving it up the list
  // because the PGN headers happen to say something else would be a surprise.
  async saveToChapter() {
    const mc = this.current;
    if (!this.canSaveChapter()) return;
    if (!Auth.user) { toast(t('mc_needs_signin')); return; }
    if (!navigator.onLine) { toast(t('mc_needs_network')); return; }
    const tree = Analysis.tree;
    if (!tree) return;
    const chapterId = Analysis.ctx.mcChapterId;
    const row = this.chapters.find(c => c.id === chapterId);
    // The row is gone if somebody deleted the chapter while it was open. Saving
    // would recreate it as a document nobody expects, so this stops instead.
    if (!row) { toast(t('mc_chapter_gone')); return; }
    try {
      await updateChapter(mc.id, chapterId, {
        title: row.title,
        pgn: tree.toPgn(),
        startFen: tree.startFen || row.startFen || '',
        order: row.order ?? 0,
      });
    } catch (e) {
      if (e && e.message === 'chapter-too-big') {
        toast(t('mc_chapter_too_big').replace('{n}', Math.round(MAX_CHAPTER_BYTES / 1000)));
        return;
      }
      console.error('Saving a chapter failed', e);
      toast(t('mc_needs_network'));
      return;
    }
    // Keep the in-memory list honest without a refetch: the class screen reads
    // this array, and a stale pgn here is what would make a saved edit look
    // like it had not saved when you went back and opened it again.
    row.pgn = tree.toPgn();
    row.startFen = tree.startFen || row.startFen || '';
    toast(t('mc_chapter_saved'));
  },

  backFromChapter() {
    if (!this.current) { showScreen('base'); return; }
    showScreen('masterclass');
    this.lightBasesTab();
    this.render();
  },

  // The user came from the Bases tab, so that is the tab that stays lit —
  // same trick Analysis.updateBaseNav() uses for a game opened from a base.
  lightBasesTab() {
    document.querySelectorAll('#tabbar button').forEach(b =>
      b.classList.toggle('on', b.dataset.screen === 'base'));
  },

  // One read per chapter, and the PGN comes with it — which is what makes
  // tapping a row instant and needs no second fetch.
  async loadChapters() {
    const mc = this.current;
    if (!mc) return;
    try {
      const rows = await fetchChapters(mc.id);
      // The screen may have moved on to another class while this was in
      // flight; dropping a stale answer is cheaper than cancelling it.
      if (this.current !== mc) return;
      this.chapters = rows;
      this.chaptersFailed = false;
    } catch (e) {
      if (this.current !== mc) return;
      console.error('Loading chapters failed', e);
      this.chaptersFailed = true;
    }
    this.chaptersLoaded = true;
    this.renderChapters();
    // A live state can arrive before the chapter list does — the listener and
    // this fetch start together. applyLive() gives up quietly while
    // chaptersLoaded is false, so this is the retry.
    this.applyLive();
  },

  render() {
    const mc = this.current;
    $('mc-title').textContent = mc ? (mc.name || '?') : t('mc_section');
    // The ⋯ menu is about the open class, so it is hidden when there is none.
    $('mc-menu').classList.toggle('hidden', !mc);
    // Only the owner adds chapters and invites members. A viewer gets neither
    // button, no ⋯ on a chapter row and no ⋯ on a member row — the rules
    // refuse all three, so there is nothing for them to press.
    const owner = !!mc && mc.role === 'owner';
    $('mc-add-chapter').classList.toggle('hidden', !owner);
    $('mc-add-member').classList.toggle('hidden', !owner);
    this.renderLive();
    this.renderChapters();
    this.renderMembers();
  },

  renderChapters() {
    const n = this.chapters.length;
    // The count is a fact about a list that has arrived. Until then it would
    // read "0 capítulos" for a class that has ten, so it says Loading instead
    // and the empty state below stays quiet.
    $('mc-chapters-label').textContent = this.chaptersLoaded
      ? `${n} ${tn('mc_chapters', n)}` : t('loading');
    const el = $('mc-chapter-list');
    el.innerHTML = '';
    if (!n) {
      if (!this.chaptersLoaded) return;
      const p = document.createElement('p');
      p.className = 'mc-empty';
      // Offline is not the same as empty — saying "No chapters yet" to someone
      // whose connection dropped would be a lie about someone else's class.
      p.textContent = this.chaptersFailed ? t('mc_needs_network') : t('mc_no_chapters');
      el.appendChild(p);
      return;
    }
    const owner = !!this.current && this.current.role === 'owner';
    this.chapters.forEach((ch, i) => {
      // .fr-row is the friends-list row: a three-column grid that truncates
      // the middle with an ellipsis and keeps the ⋯ on screen at 375px. A
      // .list-item would wrap a long title onto a second line instead.
      const row = document.createElement('div');
      row.className = 'fr-row tappable';
      row.innerHTML =
        `<span class="mc-chapter-n">${i + 1}</span>` +
        `<span class="fr-name">${esc(ch.title || '?')}</span>` +
        (owner ? `<button class="fr-more" aria-label="⋯">⋯</button>` : '');
      row.onclick = () => this.openChapter(ch);
      // stopPropagation so the menu does not also open the chapter behind it.
      const more = row.querySelector('.fr-more');
      if (more) more.onclick = ev => { ev.stopPropagation(); this.chapterMenu(ch); };
      el.appendChild(row);
    });
  },

  // A chapter is a game, so it opens in the board the app already has —
  // moves list, engine, annotations and all. `baseId: null` is what keeps
  // Analysis from treating it as a local game: 💾 Save to database then asks
  // which base to copy it into instead of writing one by itself, and nothing
  // in that ⋯ menu writes to IndexedDB on its own.
  openChapter(ch) {
    let tree;
    try {
      tree = parsePgn(ch.pgn || '');
    } catch (e) {
      console.error('Chapter PGN did not parse', e);
      toast(t('import_failed'));
      return;
    }
    // What the owner broadcasts and what a follower compares against. Set
    // BEFORE loadTree(), because loadTree() calls Analysis.refresh(), which is
    // what fires onBoardChange() and pushes the first state of the chapter.
    this.liveChapterId = ch.id;
    // mcChapterId is what makes the chapter EDITABLE: it is the only record of
    // which document the board came from, and it rides in ctx rather than on
    // this object so that loading any other game clears it by itself. A stale
    // copy kept here would let "Save to chapter" overwrite a chapter the board
    // is no longer showing.
    Analysis.loadTree(tree, {
      baseId: null, gameId: null,
      fromMasterclass: this.current && this.current.id,
      mcChapterId: ch.id,
    });
  },

  chapterMenu(ch) {
    sheet([
      { label: t('mc_rename_chapter'), action: () => this.renameChapter(ch) },
      { label: t('mc_delete_chapter'), danger: true, action: () => this.confirmDeleteChapter(ch) },
    ]);
  },

  // The title is the one field an edit could not otherwise reach: saveToChapter()
  // deliberately keeps the stored title, because changing the moves should not
  // rename anything. So a misspelling had no way to be fixed short of deleting
  // the chapter and adding it again.
  //
  // This writes ch.pgn — the STORED moves, not whatever is on the board. A
  // rename started from the class list must not quietly save an unsaved
  // analysis sitting on the board behind it; that is what 💾 Save to chapter
  // is for, and the two stay separate.
  //
  // No askConfirm(). Renaming is visible, reversible by renaming again, and
  // loses nothing — unlike deleting, which is neither.
  async renameChapter(ch) {
    const mc = this.current;
    if (!mc || mc.role !== 'owner') return;
    if (!Auth.user) { toast(t('mc_needs_signin')); return; }
    if (!navigator.onLine) { toast(t('mc_needs_network')); return; }
    const title = await askText(t('mc_chapter_title'), ch.title || '');
    // Cancelled, emptied, or not actually changed — all three are "do nothing"
    // rather than a write that says it saved something it did not.
    if (!title || title === ch.title) return;
    try {
      await updateChapter(mc.id, ch.id, {
        title,
        pgn: ch.pgn,
        startFen: ch.startFen || '',
        order: ch.order ?? 0,
      });
    } catch (e) {
      console.error('Renaming a chapter failed', e);
      toast(t('mc_needs_network'));
      return;
    }
    // updateChapter() slices to 80 characters to match the rule, so the list
    // is updated from the same slice rather than from what was typed.
    ch.title = String(title).slice(0, 80);
    this.renderChapters();
    toast(t('mc_chapter_renamed'));
  },

  // Shared and with no undo, like deleting the class itself, so it goes
  // through askConfirm() too.
  async confirmDeleteChapter(ch) {
    const mc = this.current;
    if (!mc || mc.role !== 'owner') return;
    if (!await askConfirm(t('mc_delete_chapter_confirm'))) return;
    try {
      await deleteChapter(mc.id, ch.id);
    } catch (e) {
      console.error('Deleting a chapter failed', e);
      toast(t('mc_needs_network'));
      return;
    }
    await this.loadChapters();
  },

  // ── Members ─────────────────────────────────────────────────────────────
  // One read per member for the membership, then ONE batch of public
  // /leaderboard documents for the names and avatars. Nothing about a person
  // is ever copied onto a member document, so a name here can never go stale
  // and a stranger cannot store text on a document carrying someone else's uid.
  async loadMembers() {
    const mc = this.current;
    if (!mc) return;
    try {
      const rows = await fetchMembers(mc.id);
      const people = await fetchLeaderboardByUids(rows.map(r => r.uid));
      // The screen may have moved on to another class while this was in
      // flight; dropping a stale answer is cheaper than cancelling it.
      if (this.current !== mc) return;
      // A member with no public document still gets a row, with `?` for a
      // name — dropping it would hide somebody who really is in the class.
      this.members = rows
        .map(r => ({ ...(people[r.uid] || {}), uid: r.uid, role: r.role || 'viewer' }))
        // Owner first, then by name: whose class this is, is the first thing
        // a viewer opening it wants to know.
        .sort((a, b) =>
          (a.role === 'owner' ? 0 : 1) - (b.role === 'owner' ? 0 : 1)
          || String(a.profileName || '').localeCompare(String(b.profileName || '')));
      this.membersFailed = false;
    } catch (e) {
      if (this.current !== mc) return;
      console.error('Loading members failed', e);
      this.membersFailed = true;
    }
    this.membersLoaded = true;
    this.renderMembers();
    // The member list is the truth and the count on the Bases row is advisory,
    // so this is where a count that drifted gets corrected — a member leaving
    // cannot write it themselves. bumpCount() writes only when the two disagree.
    this.bumpCount();
  },

  renderMembers() {
    const n = this.members.length;
    // Same rule as the chapter count: until the fetch lands this is not a
    // fact, so it says Loading rather than "0 miembros" for a class with five.
    $('mc-members-label').textContent = this.membersLoaded
      ? `${n} ${tn('mc_members', n)}` : t('loading');
    const el = $('mc-member-list');
    el.innerHTML = '';
    if (!n) {
      if (!this.membersLoaded) return;
      const p = document.createElement('p');
      p.className = 'mc-empty';
      // Offline is not empty. A class always has at least its owner, so "No
      // members yet" on a dropped connection would be visibly wrong.
      p.textContent = this.membersFailed ? t('mc_needs_network') : t('mc_no_members');
      el.appendChild(p);
      return;
    }
    const mc = this.current;
    const owner = !!mc && mc.role === 'owner';
    const myUid = Auth.user && Auth.user.uid;
    for (const m of this.members) {
      const row = document.createElement('div');
      // The same three-column grid as a chapter row and a friends row: the
      // middle column truncates and the ⋯ stays on screen at 375px.
      row.className = 'fr-row';
      // The owner's own row gets NO ⋯. The delete rule refuses an owner
      // removing themselves — that would leave a class nobody can read — so
      // the button could only ever fail, and a button that always fails is
      // worse than no button.
      const canRemove = owner && m.uid !== myUid;
      // The role chip goes on the sub line, first, so a long username cannot
      // clip it. Everything here came out of Firestore, so it is all escaped.
      row.innerHTML =
        avatarHtml(m.avatarId, 36) +
        `<span class="fr-name">${esc(m.profileName || '?')}` +
        `<span class="fr-sub">${this.roleChip(m.role)}${esc(m.username || '')}</span></span>` +
        (canRemove ? '<button class="fr-more" aria-label="⋯">⋯</button>' : '');
      const more = row.querySelector('.fr-more');
      if (more) more.onclick = () => this.memberMenu(m);
      el.appendChild(row);
    }
  },

  memberMenu(m) {
    sheet([
      { label: t('mc_remove_member'), danger: true, action: () => this.confirmRemoveMember(m) },
    ]);
  },

  // askConfirm() puts its message into innerHTML, so the name is escaped
  // before it is substituted — the same thing Friends.confirmText() does.
  async confirmRemoveMember(m) {
    const mc = this.current;
    if (!mc || mc.role !== 'owner') return;
    const name = m.profileName || '?';
    if (!await askConfirm(t('mc_remove_member_confirm').replace('{n}', esc(name)))) return;
    try {
      await removeMember(mc.id, m.uid);
    } catch (e) {
      console.error('Removing a member failed', e);
      toast(t('mc_needs_network'));
      return;
    }
    await this.loadMembers();
    this.bumpCount();
  },

  // The number the Bases row shows, so the list can say "3 members" without
  // reading the subcollection. Fire and forget: the member list on screen is
  // already right, and only the owner is allowed to write it, so a failure is
  // not worth a toast. See setMemberCount() in js/firebase.js for why the
  // write has to carry updatedAt as well.
  //
  // It writes ONLY when the number is actually wrong, which is what makes it
  // safe to call on every open. A member who LEAVES cannot fix the count —
  // only the owner may write the parent document — so without this the owner's
  // Bases row stayed one too high until they next added or removed somebody.
  // Guarded, the normal case (the count is already right) costs zero writes.
  async bumpCount() {
    const mc = this.current;
    if (!mc || mc.role !== 'owner') return;
    if (!this.membersLoaded || this.membersFailed) return;
    const n = this.members.length;
    if (mc.memberCount === n) return;
    try {
      await setMemberCount(mc.id, n);
      // Keep the cached row in step so the Bases tab is right immediately,
      // not only after its next refetch.
      mc.memberCount = n;
    } catch (e) {
      console.error('Updating the member count failed', e);
    }
  },

  // Owner and member get different items — deleting a class and leaving one
  // are not the same action, and the rules refuse each of them to the other.
  // The owner's menu gets no Leave for exactly the reason their row gets no
  // Remove.
  menu() {
    const mc = this.current;
    if (!mc) return;
    const owner = mc.role === 'owner';
    sheet([
      ...(owner ? [{ label: t('mc_rename'), action: () => this.renameClass() }] : []),
      owner
        ? { label: t('mc_delete'), danger: true, action: () => this.confirmDelete() }
        : { label: t('mc_leave'), danger: true, action: () => this.confirmLeave() },
    ]);
  },

  // The same gap renameChapter() closed, one level up: a class was named once
  // at creation and never again, so a misspelling was permanent unless you
  // deleted the class — which deletes it for every member.
  //
  // No new rule and no new rule surface. `allow update` on the class already
  // lets the owner change `name`, and rules test 8 covers this exact write:
  // updateDoc({ name, updatedAt }), ownerUid untouched and immutable.
  //
  // this.current is the SAME object as the row in this.classes (open() finds
  // it there), so one mutation fixes the class screen and the Bases list
  // together and neither has to be refetched.
  async renameClass() {
    const mc = this.current;
    if (!mc || mc.role !== 'owner') return;
    if (!Auth.user) { toast(t('mc_needs_signin')); return; }
    if (!navigator.onLine) { toast(t('mc_needs_network')); return; }
    const name = await askText(t('mc_name'), mc.name || '');
    if (!name || name === mc.name) return;
    try {
      await renameMasterclass(mc.id, name);
    } catch (e) {
      console.error('Renaming the class failed', e);
      toast(t('mc_needs_network'));
      return;
    }
    // Sliced to the same 60 the rule and renameMasterclass() use, so the screen
    // shows what was actually stored rather than what was typed.
    mc.name = String(name).slice(0, 60);
    this.render();
    this.renderList();
    toast(t('mc_renamed'));
  },

  // Leaving deletes my own membership document, and that is all it can do:
  // memberCount lives on the parent and the update rule only lets the OWNER
  // write the parent. So the count on the owner's Bases row goes stale by one
  // until the owner next OPENS the class, where loadMembers() → bumpCount()
  // corrects it. (Commit 7 made that true: bumpCount() used to run only on an
  // add or a remove, so the stale number could sit there indefinitely.) That is
  // what "advisory" means here — the member list is the truth. Do not try to work
  // around it; the write would simply be denied.
  async confirmLeave() {
    const mc = this.current;
    if (!mc || mc.role === 'owner') return;
    if (!await askConfirm(t('mc_leave_confirm'))) return;
    // Drop the listener before the membership goes: once it is gone the read
    // rule refuses me, and the listener would start erroring instead of ending.
    this.closeLive();
    try {
      await leaveMasterclass(mc.id);
    } catch (e) {
      console.error('Leaving a Masterclass failed', e);
      toast(t('mc_needs_network'));
      return;
    }
    // The screen is showing a class I am no longer in, and I can no longer
    // read it, so it has to go. showScreen('base') runs Base.refresh() →
    // showList() → openList(), which refetches the list without it.
    this.current = null;
    this.chapters = [];
    this.chaptersLoaded = false;
    this.chaptersFailed = false;
    this.members = [];
    this.membersLoaded = false;
    this.membersFailed = false;
    showScreen('base');
  },

  // ── The live board ──────────────────────────────────────────────────────
  // One document, masterclasses/{id}/live/state, holding where the teacher is
  // right now. The owner writes it (throttled to one write a second in
  // js/firebase.js) and every member reads it through one onSnapshot listener.
  //
  // Only the OWNER can drive in stage 1. The rules already say so, but the
  // button is hidden from members as well: a button that can only ever fail is
  // worse than no button. 'editor' is a legal stored role that stage 1 never
  // grants, and it falls on the member side of this line until stage 2 moves it.

  // Members only — the owner never watches their own document. There is no
  // point paying a read to be told what you just wrote.
  watch() {
    const mc = this.current;
    if (!mc || !Auth.user || mc.role === 'owner') return;
    this.unwatch = watchLiveState(mc.id, (state, meta) => this.onLiveSnapshot(mc, state, meta));
  },

  // One snapshot from the listener. It is a named method rather than a closure so
  // it can be driven directly in a test: the real listener cannot run from this
  // machine at all (App Check blocks Firestore from localhost), so a snapshot
  // that arrives from the cache is otherwise unreachable outside production.
  onLiveSnapshot(mc, state, meta) {
    // The screen moved on to another class while this was in flight.
    if (this.current !== mc) return;
    // Self-healing cleanup. Leaving through mc-back or Leave calls
    // closeLive(), but the tab bar can take you off this screen without
    // passing through either — so a listener that finds nobody looking ends
    // itself on the next teacher move rather than reading forever.
    const onBoard = activeScreen === 'analysis'
      && Analysis.ctx && Analysis.ctx.fromMasterclass === mc.id;
    if (activeScreen !== 'masterclass' && !onBoard) { this.closeLive(); return; }
    const stale = !!(meta && meta.fromCache);
    this.liveStale = stale;
    // A cached null means "I cannot see the document", NOT "the document is
    // gone". Believing it would wipe the last known position off a viewer's
    // board and tell them the lesson ended every time their signal dropped —
    // and the error path in watchLiveState() hands us exactly that pair. So a
    // disappearance is only believed when the server said it.
    if (!state && stale) { this.renderLive(); return; }
    const wasLive = !!this.liveState;
    const changed = liveKey(this.liveState) !== liveKey(state);
    this.liveState = state;
    // Said once. Without it a follower's board simply freezes and there is
    // nothing on screen to explain why.
    if (wasLive && !state) toast(t('mc_live_ended'));
    this.renderLive();
    // includeMetadataChanges means the same position can arrive twice — once
    // from the cache and once from the server. Re-applying it would re-run
    // gotoLine() and Analysis.refresh() for nothing, so only a real move moves
    // the board.
    if (changed) this.applyLive();
  },

  // Ends the broadcast AND the listener, and forgets everything about the live
  // session. Safe to call twice and safe to call when nothing was running.
  closeLive() {
    if (this.unwatch) {
      try { this.unwatch(); } catch (e) { console.error('Unsubscribing failed', e); }
      this.unwatch = null;
    }
    // Fire and forget: the local state is already off, so a failed delete
    // cannot mislead ME. It can leave viewers looking at a frozen board, which
    // is why the deliberate Stop button below does report a failure.
    if (this.live && this.current) {
      stopLiveState(this.current.id).catch(e => console.error('Stopping the live board failed', e));
    }
    this.live = false;
    this.liveState = null;
    this.following = true;
    this.liveChapterId = null;
    // There is no listener any more, so there is nothing left to be stale. Left
    // set, it would draw Reconnecting on the next class opened offline before
    // that class's own first snapshot had said anything.
    this.liveStale = false;
    this.renderLive();
  },

  // The bar is drawn in two places from one piece of state: on the Masterclass
  // screen, and again above the Analysis board, because once you are following
  // a lesson that is the screen you are on.
  //
  // Losing the connection REPLACES the live text in this same bar rather than
  // adding a second line, and the action button stays exactly where it was.
  // Adrian's decision: the bar sits directly above the board on Analysis at
  // 375px, so a second line would push the board down and back up on every
  // wobble, and taking the bar over entirely would remove Stop following at the
  // one moment a viewer most wants a way out of a frozen board.
  renderLive() {
    const mc = this.current;
    let text = '', action = '', handler = null;
    // Two independent signals, one expression. The browser's offline event fires
    // the instant the interface drops; Firestore can take several seconds to
    // decide it has lost the server. Neither alone is prompt AND reliable.
    // Owners are excluded: they have no listener, and goLive()/stopLive() already
    // toast mc_needs_network when the connection is gone.
    const stale = !!mc && mc.role !== 'owner' && !!Auth.user
      && (this.liveStale || !navigator.onLine);
    if (mc && mc.role === 'owner') {
      if (!this.live) {
        text = t('mc_live_off');
        action = t('mc_live_start');
        handler = () => this.goLive();
      } else {
        // Live with nothing open yet is a real state — the owner switched it on
        // from the class screen. Claiming the class can see their board there
        // would be a lie.
        text = t(this.liveChapterId ? 'mc_live_on' : 'mc_live_open_chapter');
        action = t('mc_live_stop');
        handler = () => this.stopLive();
      }
    } else if (mc && this.liveState) {
      // Nobody is driving → no bar at all. An empty "not live" line on every
      // class anyone ever opens is noise.
      text = t(this.following ? 'mc_live_following' : 'mc_live_now');
      action = t(this.following ? 'mc_follow_stop' : 'mc_follow_resume');
      handler = () => this.toggleFollow();
    }
    // Disconnected, and nobody was live when we lost the server: there is no
    // button, because Following applies to a broadcast we cannot see. The bar
    // still appears, text only — a hidden bar would be the app quietly claiming
    // the class is not live, which is exactly what it does not know.
    if (stale) text = t('mc_reconnecting');
    if (stale) action = this.liveState ? action : '';
    // The Analysis copy also needs the board to actually belong to this class.
    const inMc = !!(Analysis.ctx && mc && Analysis.ctx.fromMasterclass === mc.id);
    for (const [id, ok] of [['mc-live-bar', !!text], ['ana-mc-live', !!text && inMc]]) {
      const bar = $(id);
      if (!bar) continue;
      bar.classList.toggle('hidden', !ok);
      // Grey, not gold. The live pill is the app telling you something is
      // happening; this is the app telling you it cannot tell.
      bar.classList.toggle('mc-live-stale', ok && stale);
      bar.innerHTML = '';
      if (!ok) continue;
      // textContent, not innerHTML: nothing here comes from Firestore today,
      // and building it out of nodes means it still cannot if that changes.
      const span = document.createElement('span');
      span.className = 'mc-live-text';
      span.textContent = text;
      bar.append(span);
      // An empty label would draw a live-looking button that does nothing.
      if (!action) continue;
      const btn = document.createElement('button');
      btn.className = 'btn small';
      btn.textContent = action;
      btn.onclick = handler;
      bar.append(btn);
    }
  },

  goLive() {
    const mc = this.current;
    if (!mc || mc.role !== 'owner') return;
    if (!Auth.user) { toast(t('mc_needs_signin')); return; }
    if (!navigator.onLine) { toast(t('mc_needs_network')); return; }
    this.live = true;
    this.renderLive();
    // If a chapter is already on the board, start from where it is instead of
    // making the class wait for the next move.
    if (this.liveChapterId && Analysis.tree
        && Analysis.ctx && Analysis.ctx.fromMasterclass === mc.id) {
      this.onBoardChange(mc.id, Analysis.tree);
    }
  },

  // Deleting the document is what tells the class the lesson is over. This is
  // the delete rule commit 6 added: before it, the `allow write` block's
  // after() clauses evaluated against null and denied even the owner.
  async stopLive() {
    const mc = this.current;
    this.live = false;
    this.renderLive();
    if (!mc) return;
    try {
      await stopLiveState(mc.id);
    } catch (e) {
      // Worth reporting, unlike the one in closeLive(): the class is still
      // looking at my last position and I have just been told it stopped.
      console.error('Stopping the live board failed', e);
      toast(t('mc_needs_network'));
    }
  },

  toggleFollow() {
    this.following = !this.following;
    this.renderLive();
    // Resuming snaps to where the teacher is NOW. The moves missed while
    // browsing are deliberately not replayed — this is a lesson, not a video.
    if (this.following) this.applyLive();
  },

  // Put my board where the teacher's is. Called on every snapshot, when the
  // chapter list lands, and when Following is switched back on.
  applyLive() {
    const mc = this.current;
    const st = this.liveState;
    if (!mc || mc.role === 'owner' || !st || !this.following) return;
    // The chapter list is what turns an id into a PGN, so there is nothing to
    // do until it has arrived. loadChapters() calls back here when it does.
    if (!this.chaptersLoaded) return;
    const ch = this.chapters.find(c => c.id === st.chapterId);
    if (!ch) return;
    // Only re-parse when the chapter really changed. Doing it per move would
    // rebuild the whole tree on every ply and throw away the engine.
    const onBoard = activeScreen === 'analysis'
      && Analysis.ctx && Analysis.ctx.fromMasterclass === mc.id;
    if (this.liveChapterId !== ch.id || !onBoard) {
      this.openChapter(ch);
    }
    const tree = Analysis.tree;
    if (!tree) return;
    // Walk the teacher's moves down, growing this tree wherever the stored
    // chapter runs out. st.fen is deliberately NOT consulted: it is a
    // consistency signal, not an instruction. A line that cannot be fully
    // replayed lands on the deepest move that worked, and the teacher's next
    // move corrects it.
    gotoLine(tree, st.line);
    Analysis.refresh();
  },

  // Called from Analysis.refresh() — the one choke point every board change in
  // that screen goes through, so a move, an arrow key, a variation and a jump
  // in the moves list all broadcast without four separate hooks.
  onBoardChange(mcId, tree) {
    const mc = this.current;
    if (!this.live || !mc || mc.id !== mcId || mc.role !== 'owner') return;
    if (!tree) return;
    // Throttled to one write a second inside pushLiveState(); the newest
    // pending state wins. Fire and forget — a dropped frame of a live board is
    // not worth a toast, and the next move sends the position again anyway.
    pushLiveState(mcId, {
      chapterId: this.liveChapterId,
      fen: tree.fen(),
      line: lineOf(tree),
    });
  },

  // ── Inviting ────────────────────────────────────────────────────────────
  // Only friends can be invited, and only by the owner. There is no search
  // box here on purpose: the Find tab on the Friends screen is the one place
  // that turns a username into a uid, and duplicating it would mean two
  // different answers to "who is this".
  async invite() {
    const mc = this.current;
    if (!mc || mc.role !== 'owner') return;
    if (!Auth.user) { toast(t('mc_needs_signin')); return; }
    if (!navigator.onLine) { toast(t('mc_needs_network')); return; }
    // The cap and the "already a member" chips are both facts about a list
    // that has actually arrived. Counting an empty array that simply has not
    // loaded would wave the thirty-first member straight through.
    if (!this.membersLoaded) await this.loadMembers();
    if (this.membersFailed) { toast(t('mc_needs_network')); return; }
    if (this.members.length >= MAX_MEMBERS) {
      toast(t('mc_member_limit').replace('{n}', MAX_MEMBERS));
      return;
    }
    // The friends list is lazy — it may never have been opened this session.
    if (!Friends.friendsLoaded) await Friends.loadFriends();
    let uids = await this.pickFriends();
    if (!uids || !uids.length) return;
    // Advisory, UI-side: trim rather than refuse, so checking six with room
    // for four still adds four instead of doing nothing.
    const room = MAX_MEMBERS - this.members.length;
    if (uids.length > room) {
      toast(t('mc_member_limit').replace('{n}', MAX_MEMBERS));
      uids = uids.slice(0, room);
    }
    let added = 0;
    try {
      added = await addMembers(mc.id, uids);
    } catch (e) {
      console.error('Inviting members failed', e);
      toast(t('mc_needs_network'));
      return;
    }
    // The COUNT and nothing else. addMembers() swallows each refusal on
    // purpose: the rules refuse anyone who has blocked me, and naming them
    // would make a block detectable. Same guarantee as the single neutral
    // toast sendFriendRequest() shows for every outcome.
    toast(tn('mc_member_added', added));
    await this.loadMembers();
    this.bumpCount();
  },

  // Resolves to an array of uids, or null if cancelled. Checkboxes plus one
  // Add button — the plan also wanted a single tap on a row to add that one
  // friend immediately, which was dropped: one tap meaning two different
  // things on the same 44px target is a mis-tap that writes to somebody
  // else's class. Tapping the row still toggles its box, because it is a
  // <label>.
  pickFriends() {
    const inClass = new Set(this.members.map(m => m.uid));
    const list = Friends.friends;
    return modal((box, close) => {
      box.innerHTML = `<h3>${esc(t('mc_invite_title'))}</h3>`;
      if (!list.length) {
        // No friends yet: one line pointing at Profile → Friends rather than
        // an empty dialog. Deliberately NOT a jump — Friends.open() exists and
        // would work, but it calls showScreen('friends'), which would throw
        // away the Masterclass screen being set up.
        const p = document.createElement('p');
        p.className = 'mc-empty';
        p.textContent = t('mc_no_friends');
        box.appendChild(p);
      }
      const boxes = [];
      for (const f of list) {
        const taken = inClass.has(f.uid);
        const row = document.createElement('label');
        row.className = 'mc-pick' + (taken ? ' taken' : '');
        // The empty span holds the checkbox column open on a taken row, so
        // every avatar in the list still lines up.
        row.innerHTML =
          (taken ? '<span></span>' : '<input type="checkbox">') +
          avatarHtml(f.avatarId, 36) +
          `<span class="fr-name">${esc(f.profileName || '?')}` +
          `<span class="fr-sub">${esc(f.username || '')}</span></span>` +
          (taken ? `<span class="mc-role">${esc(t('mc_already_member'))}</span>` : '');
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
        ok.className = 'btn primary'; ok.textContent = t('mc_invite_add');
        ok.onclick = () => close(boxes.filter(([c]) => c.checked).map(([, u]) => u));
        actions.append(ok, ca);
      } else {
        // Nothing to check — no friends, or all of them are already in.
        actions.append(ca);
      }
      box.appendChild(actions);
    });
  },

  // Destructive and shared: this deletes the class for every member, which is
  // what the confirm text says. There is no undo, so it goes through
  // askConfirm() exactly like unfriending does.
  async confirmDelete() {
    const mc = this.current;
    if (!mc || mc.role !== 'owner') return;
    if (!await askConfirm(t('mc_delete_confirm'))) return;
    // Before the delete, not after: stopping the broadcast removes live/state,
    // and mcIsOwner() in that rule does a get() on the parent — once the parent
    // is gone the null dereference denies it and the document would be stranded.
    // deleteMasterclass() also removes it, so this is belt and braces.
    this.closeLive();
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
    this.chaptersLoaded = false;
    this.chaptersFailed = false;
    this.members = [];
    showScreen('base');
  },

  // ── Adding a chapter ────────────────────────────────────────────────────
  // Two ways in, and deliberately no third: there is NO "share the whole
  // base". A base can hold thousands of games, and sharing one would be
  // thousands of writes for the owner and thousands of reads for every
  // student who opens the class. A Masterclass is a curated lesson, and the
  // 50-chapter cap is the shape of that decision.
  async addChapterMenu() {
    const mc = this.current;
    if (!mc || mc.role !== 'owner') return;
    if (!Auth.user) { toast(t('mc_needs_signin')); return; }
    if (!navigator.onLine) { toast(t('mc_needs_network')); return; }
    // The cap is checked against a list that has actually arrived, for the
    // same reason the 5-class cap is: counting an empty array that simply has
    // not loaded would wave the fifty-first chapter straight through.
    if (!this.chaptersLoaded) await this.loadChapters();
    if (this.chaptersFailed) { toast(t('mc_needs_network')); return; }
    if (this.chapters.length >= MAX_CHAPTERS) {
      toast(t('mc_chapter_limit').replace('{n}', MAX_CHAPTERS));
      return;
    }
    sheet([
      { label: t('mc_from_base'), action: () => this.addFromBase() },
      { label: t('mc_from_board'), action: () => this.addFromBoard() },
    ]);
  },

  // chooseBase(false) — a chapter is taken FROM a base, so offering to create
  // an empty one here would only ever lead to "no games yet".
  async addFromBase() {
    const baseId = await chooseBase(false);
    if (!baseId) return;
    const games = await db.listGameSummaries(baseId);
    if (!games.length) { toast(t('no_games')); return; }
    const g = await this.chooseGame(games);
    if (!g) return;
    const full = await db.getGame(g.id);
    if (!full || !full.pgn) { toast(t('import_failed')); return; }
    // The same "White vs Black" the base list shows, so the default title is
    // the name the owner just tapped.
    const startFen = (full.pgn.match(/\[FEN\s+"([^"]*)"\]/) || [])[1] || '';
    await this.saveChapter(`${g.white || '?'} vs ${g.black || '?'}`, full.pgn, startFen);
  },

  // Whatever is on the Analysis board right now, variations and comments
  // included — tree.toPgn() is the same text the ⋯ menu shares and copies.
  async addFromBoard() {
    const tree = Analysis.tree;
    if (!tree) { toast(t('import_failed')); return; }
    const H = tree.headers || {};
    // A game that came from a base or from Game Review has names; a scratch
    // board does not, and prefilling the prompt with its own heading would be
    // noise the owner has to delete before typing.
    const def = (H['White'] || H['Black'])
      ? `${H['White'] || '?'} vs ${H['Black'] || '?'}`
      : '';
    await this.saveChapter(def, tree.toPgn(), tree.startFen || '');
  },

  chooseGame(games) {
    // Most recently touched first, and only the first PICK_GAMES of them: a
    // modal holding one button per game in a 5,000-game base would be
    // unusable and slow to build.
    const rows = games
      .slice()
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, PICK_GAMES);
    const truncated = games.length > rows.length;
    return modal((box, close) => {
      box.innerHTML = `<h3>${t('mc_choose_game')}</h3>`;
      if (truncated) {
        const hint = document.createElement('p');
        hint.className = 'mc-empty';
        hint.textContent = t('mc_pick_recent').replace('{n}', PICK_GAMES);
        box.appendChild(hint);
      }
      for (const g of rows) {
        const btn = document.createElement('button');
        btn.className = 'sheet-btn';
        btn.textContent = `${g.white || '?'} vs ${g.black || '?'}`
          + (g.result && g.result !== '*' ? ` · ${g.result}` : '');
        btn.onclick = () => close(g);
        box.appendChild(btn);
      }
      const ca = document.createElement('button');
      ca.className = 'sheet-btn cancel'; ca.textContent = t('cancel');
      ca.onclick = () => close(null);
      box.appendChild(ca);
    });
  },

  async saveChapter(defaultTitle, pgn, startFen) {
    const mc = this.current;
    if (!mc) return;
    const title = await askText(t('mc_chapter_title'), defaultTitle);
    if (!title) return;
    // New chapters go on the end. `order` is a plain number rather than the
    // array index so a future reorder does not have to rewrite every document.
    const order = this.chapters.reduce((max, c) => Math.max(max, c.order ?? 0), 0) + 1;
    try {
      await addChapter(mc.id, { title, pgn, startFen, order });
    } catch (e) {
      if (e && e.message === 'chapter-too-big') {
        toast(t('mc_chapter_too_big').replace('{n}', Math.round(MAX_CHAPTER_BYTES / 1000)));
        return;
      }
      console.error('Adding a chapter failed', e);
      toast(t('mc_needs_network'));
      return;
    }
    await this.loadChapters();
  },
};
