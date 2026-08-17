# Masterclass — Stage 1 implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Written 2026-08-16. **Nothing here is built yet.** Adrian must approve before any
feature code is written.

**Goal:** A player can create a Masterclass — a shared chess base that lives in
Firestore — fill it with chapters from their local bases, invite friends to it as
viewers, and then drive a live board that every viewer follows in real time.

**Architecture:** A Masterclass is *not* a local base. Local bases stay in
IndexedDB and are untouched; a Masterclass is a small Firestore document tree
(`masterclasses/{mcId}` + `members` + `chapters` + one `live/state` doc) that
requires a network connection, exactly like the existing Friends and Leaderboard
screens. Chapter content is a PGN string, produced and consumed by the existing
`toPgn()` / `parsePgn()` in `js/tree.js`. Membership is a **subcollection with a
`role` string**, never a map on the parent — that is what keeps the stage-2
editor role and link sharing additive instead of a rewrite.

**Tech Stack:** Vanilla ES modules, no build step. Firebase JS SDK 10.14.1 loaded
from `gstatic.com` (already in `js/firebase.js`). Firestore rules tested against
the local emulator via `npm run test:rules`.

---

## Global Constraints

Every task implicitly includes all of these.

- **Mobile-first at 375px.** Judge every screen at 375px width, in **light AND
  dark**, in **both languages**, before calling a task done.
- **Existing design language only** — Kael, navy and gold. Reuse `--panel2`,
  `--gold`, `--gold-bg`, `--muted`, `--accent`, `--radius`. **Do not invent a new
  visual style.** Reuse `list-item`, `.lb-row`, `.btn`, `.btn primary`, `.hint`,
  `.chip`, `.ellipsis` and the existing `toast()`, `modal()`, `sheet()`,
  `askText()`, `askConfirm()` helpers exported from `js/app.js`.
- **Every new string is bilingual** — an `es:` and an `en:` in `js/i18n.js`.
  **"Masterclass" is left untranslated in both languages.** Not *Clase
  magistral*, not *Masterclase*. The word "Masterclass" appears verbatim in the
  Spanish strings too.
- **Never rename a storage key.** No key in this plan collides with an existing
  one; if that changes, stop and ask.
- **Bump `CACHE` in `sw.js` on every commit that changes `index.html`, any
  `js/*.js`, or `css/style.css`.** Currently `chess-training-center-v64`. A
  commit that changes only `firestore.rules`, tests or docs must **not** bump it —
  a bump makes every returning user redownload the app for nothing.
- **Every new `js/*.js` file goes in the `ASSETS` array in `sw.js`.**
- **Commands handed to Adrian must start with the `cd` and use `.cmd`:**
  `cd C:\Users\Adrian\chess-app; npm.cmd run test:rules`. The separator is `;` —
  `&&` is a syntax error in his PowerShell.
- **Timestamps written to Firestore use `serverTimestamp()`**, never
  `Date.now()`, on anything that orders or expires. Phone clocks are wrong often
  enough to matter. (The existing Friends code uses `Date.now()`; that is not
  being changed, but new code does not copy it.)
- **`js/app.js` is 231 KB — never read it whole.** Grep for the symbol, then read
  with offset/limit.

---

## Where this sits, in one paragraph

Bases tab gains a second section above the local base list: **Masterclass**. It
lists the classes you own and the classes you have been added to, from one
collection-group query. Tapping one opens a Masterclass screen: a chapter list, a
member list, and — once commit 6 lands — a live board that viewers follow. The
owner adds chapters from their own local bases and adds members from their
friends list. Everything else on the Bases tab is untouched, including
`shareBase()` and the `base-share` button, which keep exporting a `.pgn` file
exactly as they do today.

---

## The data model

```
masterclasses/{mcId}
  ownerUid    string   the uid that may manage this class. Immutable.
  name        string   <= 60 chars
  createdAt   timestamp (serverTimestamp)
  updatedAt   timestamp (serverTimestamp)
  memberCount number   advisory, owner-maintained, used only to draw "3 members"

masterclasses/{mcId}/members/{uid}
  uid         string   MUST equal the document id
  role        string   'owner' | 'editor' | 'viewer'
  addedBy     string
  addedAt     timestamp

masterclasses/{mcId}/chapters/{chapterId}
  title       string   <= 80 chars
  pgn         string   <= 100000 bytes  (rules-enforced)
  startFen    string   <= 100 chars
  order       number
  updatedAt   timestamp
  updatedBy   string

masterclasses/{mcId}/live/state          ← ONE document, fixed id 'state'
  chapterId   string | null
  fen         string   <= 100 chars
  path        string   <= 512 chars, the move path as SAN joined by ' '
  drivenBy    string   uid of whoever is driving
  updatedAt   timestamp
```

### Why each shape, so nobody "tidies" it later

- **`members` is a subcollection, not a `roles: {uid: role}` map on the parent.**
  Stage 2 link sharing requires a joiner to create their *own* membership
  document; a stranger cannot append to the owner's document. Changing this to a
  map would make link sharing a rewrite.
- **`role` is a string, not `isOwner: true`.** `'editor'` is a legal stored value
  from day one even though stage 1 never writes it. Stage 2 grants it by changing
  three rule clauses, with zero storage change.
- **The document id of a member IS the uid**, and there is a redundant `uid`
  field. The field is what the collection-group query filters on; the id is what
  the recursive read rule checks. Both are needed.
- **`chapters` is one document per chapter holding a PGN string.** This maps
  exactly onto `toPgn()` / `parsePgn()` in `js/tree.js` and needs no new
  serialisation code. Stage 1 has exactly one writer, so blob-level
  last-write-wins is not a problem. See "Stage 2" at the bottom for what this
  costs later and why it is a migration, not a rewrite.
- **`live/state` holds pointers only — never chapter content.** Firestore's
  sustained write limit on a *single document* is about **1 write per second**,
  and this document is written on every move the teacher makes. Keeping it tiny
  and throttling to 1/sec is the entire reason the live board works.

### Caps, and which ones are real

| Cap | Value | Enforced where |
|---|---|---|
| Chapter PGN size | 100,000 bytes | **Firestore rules** — this is the real one |
| Name / title / fen / path length | 60 / 80 / 100 / 512 | **Firestore rules** |
| Chapters per Masterclass | 50 | UI only — advisory |
| Members per Masterclass | 30 | UI only — advisory |
| Masterclasses owned | 5 | UI only — advisory |

The last three cannot be enforced in rules without a server-maintained counter,
and a counter a client can write is not a security control. **Say "advisory" in
the code comment; do not claim they are enforced.**

### Cost, measured not guessed

One teacher + 20 students, one hour, ~200 throttled live writes: **≈5,600 reads
and ≈210 writes, about $0.004 per lesson** at multi-region prices (reads
$0.06/100k, writes $0.18/100k, storage $0.18/GiB/month; a single-region database
is half). The Spark free tier's 50,000 reads/day covers about 9 such lessons per
day. **Cost is not the constraint — the 1-write-per-second document limit is.**

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `firestore.rules` | modify | Masterclass rules block, after the Friends block |
| `firestore.indexes.json` | modify | one `fieldOverrides` entry for the collection-group query |
| `tests/rules/masterclass.test.js` | **create** | every allow and every deny for the new rules |
| `js/firebase.js` | modify | the Firestore calls, exported — same file as every other network call |
| `js/masterclass.js` | **create** | the Masterclass screens, state and rendering |
| `js/i18n.js` | modify | new bilingual strings |
| `index.html` | modify | `#screen-masterclass`, the Bases-tab section, the invite sheet |
| `css/style.css` | modify | a new `.mc-*` block reusing existing tokens |
| `sw.js` | modify | `js/masterclass.js` into `ASSETS`, `CACHE` bumped |

`js/masterclass.js` follows the `js/friends.js` pattern exactly: it imports
`$`, `toast`, `modal`, `askConfirm`, `askText`, `sheet`, `esc`, `showScreen` from
`js/app.js`, and **never touches an app.js binding at module top level** — that
would throw `Cannot access '...' before initialization`. Inside methods and
handlers is fine.

---

## Commit map

| # | What lands | User-visible? | `sw.js` bump |
|---|---|---|---|
| 1 | Rules + rules tests + index. No feature code. | no | **no** |
| 2 | Screens and strings, all inert | yes | yes |
| 3 | Create and list real Masterclasses | yes | yes |
| 4 | Chapters — add from a base, open read-only | yes | yes |
| 5 | Members — the friend picker, roles, leave/remove | yes | yes |
| — | **← STOP HERE and you have shipped something real:** an asynchronous shared read-only base. Everything above is load-bearing for what follows. | | |
| 6 | Live follow — the `live/state` doc, listeners, throttle | yes | yes |
| 7 | Connection state, presence count, offline copy | yes | yes |

---

## Task 1: Firestore rules and their tests

**Files:**
- Modify: `firestore.rules` (append a Masterclass block after the `blocks` match, before the closing braces)
- Modify: `firestore.indexes.json`
- Test: `tests/rules/masterclass.test.js` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: the collection layout every later task writes to. Rule helper names
  `mcOwnerUid(mcId)`, `mcIsOwner(mcId)`, `mcIsMember(mcId)`, `mcRole(mcId)`.

**No feature code in this commit and `sw.js` is NOT bumped** — nothing the
browser loads changes. This is the same shape Friends commit 1 used, and it is
why Friends has no rules drift.

- [ ] **Step 1: Read the existing test setup so the new suite matches it**

Read `tests/rules/friends.test.js` — the first ~40 lines only. Copy its
`initializeTestEnvironment` / `beforeAll` / `afterEach` scaffolding verbatim into
the new file. Do not invent a different harness.

- [ ] **Step 2: Write the failing tests**

Create `tests/rules/masterclass.test.js`. It must cover, each as its own `it()`,
allow **and** deny:

*Class document*
1. owner can create `masterclasses/x` with `ownerUid == self`
2. cannot create with `ownerUid` set to someone else
3. cannot create with an unlisted field (`hasOnly` allowlist)
4. cannot create with `name` longer than 60 chars
5. a member can `get` the class
6. a non-member cannot `get` the class
7. **nobody can `list` the `masterclasses` collection** (anti-enumeration)
8. owner can update `name`; cannot change `ownerUid`
9. non-owner member cannot update
10. owner can delete; member cannot

*Members*
11. owner can create `members/{friendUid}` with `role: 'viewer'`
12. owner can create their own `members/{self}` with `role: 'owner'` (bootstrap)
13. a viewer cannot create a member document for anybody
14. a viewer **cannot** create a member document for themselves (no self-join in stage 1)
15. `uid` field not matching the document id is denied
16. a role outside `['owner','editor','viewer']` is denied
17. owner cannot add someone who has blocked them (`blocks/{them}/blocked/{owner}` exists)
18. a member can read the other members of a class they belong to
19. a non-member cannot read members
20. a member can **delete their own** member document (leave the class)
21. a member cannot delete somebody else's
22. the owner cannot delete their own member document (would orphan the class)
23. owner can delete any other member document (remove)
24. the collection-group read rule returns only my own membership documents

*Chapters*
25. owner can create a chapter
26. a viewer cannot create, update or delete a chapter
27. a chapter with `pgn` over 100,000 bytes is denied
28. a chapter with a `title` over 80 chars is denied
29. a member can read chapters; a non-member cannot
30. **an `editor` cannot yet write a chapter** — stage 1 grants nothing to that
    role. Mark this test `// STAGE 2 FLIPS THIS` so it is found and inverted.

*Live state*
31. owner can write `live/state`
32. a viewer cannot write `live/state`
33. a member can read `live/state`; a non-member cannot
34. `path` longer than 512 chars is denied
35. a document id other than `state` under `live/` is denied

- [ ] **Step 3: Run the tests and watch them fail**

```bash
cd C:\Users\Adrian\chess-app; npm.cmd run test:rules
```

Expected: the 87 existing tests still pass, and every new test **fails** with
`PERMISSION_DENIED` on the allow cases (there are no rules yet, so everything is
denied). If an allow case *passes* before the rules exist, the test is wrong.

- [ ] **Step 4: Write the rules**

Append to `firestore.rules`, immediately after the `blocks` match block and
before the two closing braces:

```
    // ═══════════════════════ Masterclass ═══════════════════════
    // A Masterclass is a shared base that lives here rather than in the
    // device's IndexedDB. Unlike /leaderboard, NOTHING here is world-readable:
    // `allow list` is false on the class collection, so the ids cannot even be
    // enumerated, and every read needs a membership document.
    //
    // Membership is a SUBCOLLECTION with a role STRING, deliberately:
    //   - a subcollection (not a roles map on the parent) is what will let a
    //     link-invited stranger create their OWN membership in stage 2 without
    //     writing the owner's document;
    //   - a string (not isOwner: true) means 'editor' is already a legal stored
    //     value, so stage 2 grants it by changing three clauses below and
    //     changes no stored data at all.
    // Do not "simplify" either one.

    function mcPath(mcId) {
      return /databases/$(database)/documents/masterclasses/$(mcId);
    }

    // Admin decisions key off the PARENT document's ownerUid, not off a member
    // document. That dodges a bootstrap problem: the owner has to create their
    // own member document, and a rule asking "are you already an owner-member?"
    // could never let the first one through.
    function mcOwnerUid(mcId) {
      return get(mcPath(mcId)).data.ownerUid;
    }
    function mcIsOwner(mcId) {
      return signedIn() && mcOwnerUid(mcId) == me();
    }
    function mcIsMember(mcId) {
      return signedIn() && exists(/databases/$(database)/documents/masterclasses/$(mcId)/members/$(me()));
    }
    // get() results are cached per request for identical paths, so mcIsOwner()
    // and mcIsMember() together cost ONE document read, not two per call.

    match /masterclasses/{mcId} {
      // get only. `list` stays false so the collection cannot be enumerated —
      // this is the opposite of /leaderboard and it is deliberate.
      allow get: if signedIn()
        && (resource.data.ownerUid == me() || mcIsMember(mcId));
      allow list: if false;

      allow create: if signedIn()
        && after().keys().hasOnly(['ownerUid', 'name', 'createdAt', 'updatedAt', 'memberCount'])
        && after().ownerUid == me()
        && after().name is string && after().name.size() > 0 && after().name.size() <= 60
        && after().createdAt == request.time
        && after().updatedAt == request.time
        && after().memberCount is int;

      // ownerUid is immutable: transferring a class is not a feature, and
      // letting it move would let an owner hand off a class full of somebody
      // else's work.
      allow update: if signedIn()
        && resource.data.ownerUid == me()
        && after().ownerUid == resource.data.ownerUid
        && after().keys().hasOnly(['ownerUid', 'name', 'createdAt', 'updatedAt', 'memberCount'])
        && after().name is string && after().name.size() > 0 && after().name.size() <= 60
        && after().createdAt == resource.data.createdAt
        && after().updatedAt == request.time
        && after().memberCount is int;

      // Firestore does NOT cascade. Deleting this document leaves members and
      // chapters behind forever, so the client deletes them first — see the
      // deleteMasterclass() comment in js/firebase.js.
      allow delete: if signedIn() && resource.data.ownerUid == me();
    }

    match /masterclasses/{mcId}/members/{memberUid} {
      // Anyone in the class can see who else is in it.
      allow read: if mcIsMember(mcId) || mcIsOwner(mcId);

      // Stage 1: only the owner adds people, and only someone who has not
      // blocked them. Stage 2 adds a second create path for link invites —
      // it is an extra `||` branch here, nothing above changes.
      allow create: if mcIsOwner(mcId)
        && after().keys().hasOnly(['uid', 'role', 'addedBy', 'addedAt'])
        && after().uid == memberUid
        && after().role in ['owner', 'editor', 'viewer']
        && after().addedBy == me()
        && after().addedAt == request.time
        && !exists(/databases/$(database)/documents/blocks/$(memberUid)/blocked/$(me()));

      // A role is granted or revoked, never edited in place. Changing somebody
      // from viewer to editor is a delete plus a create, so there is exactly
      // one code path that hands out a role.
      allow update: if false;

      // Either the owner removing someone, or a member leaving on their own.
      // The owner may NOT delete their own membership — that would leave a
      // class nobody can read.
      allow delete: if (mcIsOwner(mcId) && memberUid != me())
        || (signedIn() && memberUid == me() && mcOwnerUid(mcId) != me());
    }

    // Serves the collection-group query fetchMyMasterclasses() runs:
    //   collectionGroup('members').where('uid','==',me)
    // A collection-group query is NOT matched by the path-specific rule above,
    // so it needs its own match. The recursive wildcard is safe ONLY because
    // the document id is the uid and this clause pins it to my own: it can
    // never return anybody else's membership, whatever collection it is in.
    match /{path=**}/members/{memberUid} {
      allow read: if signedIn() && memberUid == me();
    }

    match /masterclasses/{mcId}/chapters/{chapterId} {
      allow read: if mcIsMember(mcId) || mcIsOwner(mcId);

      // STAGE 2: this becomes `mcIsOwner(mcId) || mcRole(mcId) == 'editor'`.
      // That is the whole change — the stored shape does not move.
      allow write: if mcIsOwner(mcId)
        && after().keys().hasOnly(['title', 'pgn', 'startFen', 'order', 'updatedAt', 'updatedBy'])
        && after().title is string && after().title.size() <= 80
        // The real anti-abuse bound. The 50-chapter and 30-member caps in the
        // UI are advisory and cannot be enforced here; this one can.
        && after().pgn is string && after().pgn.size() <= 100000
        && after().startFen is string && after().startFen.size() <= 100
        && after().order is number
        && after().updatedBy == me()
        && after().updatedAt == request.time;

      allow delete: if mcIsOwner(mcId);
    }

    // Exactly one document, id 'state'. Any other id is refused so this cannot
    // quietly become a second content store.
    match /masterclasses/{mcId}/live/{docId} {
      allow read: if mcIsMember(mcId) || mcIsOwner(mcId);

      // STAGE 2: this becomes `mcIsOwner(mcId) || mcRole(mcId) == 'editor'`.
      allow write: if docId == 'state'
        && mcIsOwner(mcId)
        && after().keys().hasOnly(['chapterId', 'fen', 'path', 'drivenBy', 'updatedAt'])
        && (after().chapterId == null || (after().chapterId is string && after().chapterId.size() <= 64))
        && after().fen is string && after().fen.size() <= 100
        && after().path is string && after().path.size() <= 512
        && after().drivenBy == me()
        && after().updatedAt == request.time;
    }
```

- [ ] **Step 5: Add the collection-group index**

`collectionGroup('members').where('uid','==',me)` needs a **collection-group
scoped single-field index**, which is a `fieldOverrides` entry, not an `indexes`
entry. Replace the empty `"fieldOverrides": []` in `firestore.indexes.json` with:

```json
  "fieldOverrides": [
    {
      "collectionGroup": "members",
      "fieldPath": "uid",
      "indexes": [
        { "order": "ASCENDING", "queryScope": "COLLECTION" },
        { "order": "ASCENDING", "queryScope": "COLLECTION_GROUP" }
      ]
    }
  ]
```

- [ ] **Step 6: Run the tests until they all pass**

```bash
cd C:\Users\Adrian\chess-app; npm.cmd run test:rules
```

Expected: **122 passing** (87 existing + 35 new), zero failing. If an existing
Friends or leaderboard test broke, the new block was pasted in the wrong place —
it must be a sibling of the other `match` blocks, not nested inside one.

- [ ] **Step 7: Deploy the rules and the index**

```bash
cd C:\Users\Adrian\chess-app; npm.cmd run rules:deploy
```

Then confirm in the Firebase console that the `members` collection-group index
shows **Enabled** (it can take a few minutes to build). Deploying the rules
without the index means `fetchMyMasterclasses()` in Task 3 fails with
`failed-precondition`.

**Edit the file and deploy — never edit the console.** HANDOVER records the
console rules being diffed against `firestore.rules` character for character on
2026-08-14; keep it that way.

- [ ] **Step 8: Commit**

```bash
git add firestore.rules firestore.indexes.json tests/rules/masterclass.test.js
git commit -m "Masterclass: Firestore rules and 35 rules tests"
```

`sw.js` is deliberately not bumped — nothing the browser loads changed.

---

## Task 2: The screens, inert

**Files:**
- Create: `js/masterclass.js`
- Modify: `index.html`, `css/style.css`, `js/i18n.js`, `js/app.js`, `sw.js`

**Interfaces:**
- Consumes: `$`, `showScreen`, `esc`, `toast`, `modal`, `sheet`, `askText`,
  `askConfirm` from `js/app.js`; `t`, `tn` from `js/i18n.js`.
- Produces: `export const Masterclass = { init(), openList(), open(mcId) }`.

Nothing talks to Firestore yet. This commit exists so the screens can be judged
at 375px before any network code makes them hard to reason about — the same
sequencing Friends commit 2 used. **Unlike Friends commit 2, do not ship invented
sample data**: render the real empty states instead. Friends shipped a `SAMPLE`
array and commit 3 had to delete it; skip that step.

- [ ] **Step 1: Add the strings**

In `js/i18n.js`, alongside the `friends_*` block. **"Masterclass" is untranslated
in both languages** — it appears verbatim inside the Spanish strings:

```js
  mc_section:        { es: 'Masterclass', en: 'Masterclass' },
  mc_new:            { es: 'Nueva Masterclass', en: 'New Masterclass' },
  mc_name:           { es: 'Nombre de la Masterclass', en: 'Masterclass name' },
  mc_empty:          { es: 'Aún no tienes ninguna Masterclass. Crea una para compartir posiciones con tus amigos en vivo.',
                       en: "You don't have a Masterclass yet. Create one to share positions with your friends live." },
  mc_needs_signin:   { es: 'Inicia sesión para usar Masterclass.', en: 'Sign in to use Masterclass.' },
  mc_needs_network:  { es: 'Una Masterclass necesita conexión. Tus bases locales siguen funcionando sin internet.',
                       en: 'A Masterclass needs a connection. Your local databases still work offline.' },
  mc_role_owner:     { es: 'Propietario', en: 'Owner' },
  mc_role_editor:    { es: 'Editor', en: 'Editor' },
  mc_role_viewer:    { es: 'Espectador', en: 'Viewer' },
  mc_chapters:       { es: 'Capítulos', en: 'Chapters' },
  mc_chapters_one:   { es: 'Capítulo', en: 'Chapter' },
  mc_members:        { es: 'Miembros', en: 'Members' },
  mc_members_one:    { es: 'Miembro', en: 'Member' },
  mc_no_chapters:    { es: 'Sin capítulos todavía.', en: 'No chapters yet.' },
  mc_add_chapter:    { es: '➕ Añadir capítulo', en: '➕ Add chapter' },
  mc_add_member:     { es: '➕ Invitar amigos', en: '➕ Invite friends' },
  mc_chapter_title:  { es: 'Título del capítulo', en: 'Chapter title' },
  mc_delete_confirm: { es: '¿Borrar esta Masterclass? Se borra para todos.',
                       en: 'Delete this Masterclass? It is deleted for everyone.' },
  mc_leave:          { es: 'Salir de la Masterclass', en: 'Leave Masterclass' },
  mc_leave_confirm:  { es: '¿Salir de esta Masterclass?', en: 'Leave this Masterclass?' },
  mc_remove_member:  { es: 'Quitar de la Masterclass', en: 'Remove from Masterclass' },
  mc_limit:          { es: 'Puedes tener hasta {n} Masterclass.', en: 'You can have up to {n} Masterclasses.' },
  mc_chapter_limit:  { es: 'Una Masterclass admite hasta {n} capítulos.', en: 'A Masterclass holds up to {n} chapters.' },
  mc_member_limit:   { es: 'Una Masterclass admite hasta {n} miembros.', en: 'A Masterclass holds up to {n} members.' },
```

- [ ] **Step 2: Add the markup**

In `index.html`, above the existing base list inside `#base-list-view`:

```html
<div class="mc-section">
  <div class="mc-section-head">
    <h3 data-i18n="mc_section">Masterclass</h3>
    <button id="mc-new" class="btn small" data-i18n="mc_new">New Masterclass</button>
  </div>
  <div id="mc-list"></div>
</div>
```

And a new screen, as a sibling of `#screen-friends`:

```html
<section id="screen-masterclass" class="screen hidden">
  <div class="screen-head">
    <button id="mc-back" class="icon-btn">←</button>
    <h2 id="mc-title" class="ellipsis"></h2>
    <button id="mc-menu" class="icon-btn">⋯</button>
  </div>
  <div id="mc-live-bar" class="mc-live-bar hidden"></div>
  <div class="mc-block">
    <div class="mc-block-head">
      <span id="mc-chapters-label"></span>
      <button id="mc-add-chapter" class="btn small hidden"></button>
    </div>
    <div id="mc-chapter-list"></div>
  </div>
  <div class="mc-block">
    <div class="mc-block-head">
      <span id="mc-members-label"></span>
      <button id="mc-add-member" class="btn small hidden"></button>
    </div>
    <div id="mc-member-list"></div>
  </div>
</section>
```

`#mc-live-bar` stays hidden until commit 6. It is in the markup now so the layout
is judged with the space it will occupy.

- [ ] **Step 3: Add the CSS**

A new `.mc-*` block in `css/style.css`, near the friends block. **Only existing
tokens** — no new colours:

```css
/* ── Masterclass ─────────────────────────────────────────── */
.mc-section        { margin-bottom: 18px; }
.mc-section-head   { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:6px; }
.mc-section-head h3{ margin:0; font-size:15px; }
.mc-block          { background: var(--panel2); border-radius: var(--radius); padding:10px; margin-bottom:12px; }
.mc-block-head     { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; }
.mc-block-head span{ color: var(--muted); font-size:13px; }
.mc-role           { font-size:11px; padding:1px 6px; border-radius:999px; background: var(--gold-bg); color: var(--gold); }
.mc-empty          { color: var(--muted); font-size:13px; padding:6px 2px; }
.mc-live-bar       { display:flex; align-items:center; gap:8px; padding:8px 10px; margin-bottom:10px;
                     border-radius: var(--radius); background: var(--gold-bg); color: var(--gold); font-size:13px; }
```

- [ ] **Step 4: Write the module skeleton**

Create `js/masterclass.js`. It renders from `Masterclass.classes` (an empty array
for now) and draws the empty states. Structure it exactly like `js/friends.js`:
a single exported object, `init()` wiring the buttons, `render*()` methods that
rebuild from state.

**Do not import anything from `js/app.js` at module top level** — inside methods
only. `js/app.js` and every child form an import cycle and a top-level read
throws `Cannot access '...' before initialization`.

- [ ] **Step 5: Wire it in**

- `js/app.js`: import `Masterclass` and call `Masterclass.init()` where
  `Friends.init()` is called, and `Masterclass.openList()` inside
  `Base.showList()`.
- `sw.js`: add `'js/masterclass.js'` to `ASSETS`, bump `CACHE` to
  `chess-training-center-v65`.

- [ ] **Step 6: Verify in the browser**

The Browser pane will not composite on this machine — screenshots time out. Use
the CDP driver against headless Chrome (`~/.claude/launch.json` entry
`chess-app46`, port 9159), as every recent session has.

Check, at **375px**, in **light and dark**, in **both languages**:
- Bases tab shows the Masterclass section above the base list, with the empty
  state text, and the existing base list is unchanged below it.
- `#screen-masterclass` opens and closes; `←` returns to the Bases list; the tab
  bar stays lit on Bases.
- `document.scrollWidth` is exactly 375 on both screens.
- Zero new console errors. The only expected error is the `403` from
  `content-firebaseappcheck.googleapis.com` — that is App Check rejecting the
  local origin and it appears on every screen, before and after this change.

- [ ] **Step 7: Commit**

```bash
git add js/masterclass.js index.html css/style.css js/i18n.js js/app.js sw.js
git commit -m "Masterclass: screens and strings, no Firestore yet"
```

---

## Task 3: Create and list real Masterclasses

**Files:**
- Modify: `js/firebase.js`, `js/masterclass.js`, `sw.js`

**Interfaces:**
- Produces, all exported from `js/firebase.js`:
  - `createMasterclass(name) -> Promise<string>` — the new mcId
  - `fetchMyMasterclasses() -> Promise<Array<{ mcId, role, name, ownerUid, memberCount }>>`
  - `fetchMasterclass(mcId) -> Promise<object|null>`
  - `deleteMasterclass(mcId) -> Promise<void>`
  - `MAX_MASTERCLASSES = 5`

- [ ] **Step 1: Add the imports `js/firebase.js` is missing**

The file currently imports `doc, getDoc, setDoc, updateDoc, deleteDoc,
deleteField, collection, query, where, orderBy, limit, getDocs`. Add
`addDoc, collectionGroup, serverTimestamp, writeBatch, onSnapshot` to the same
`firebase-firestore.js` import. `onSnapshot` is not used until commit 6; adding it
now costs **zero extra download** because the whole module is already loaded.

- [ ] **Step 2: Write `createMasterclass()`**

```js
// A Masterclass is created as TWO writes, in this order: the class document
// first, then the owner's own membership. The order is load-bearing — the
// member rule reads the parent's ownerUid to decide who may add members, so
// the parent has to exist first. There is no transaction; if the second write
// fails the owner is left with a class they can read (the get rule also
// accepts resource.data.ownerUid == me()) but which does not appear in their
// list, and creating it again is harmless.
export const MAX_MASTERCLASSES = 5;   // advisory, UI-side — see the plan

export async function createMasterclass(name) {
  const user = auth.currentUser;
  if (!user || !name) return null;
  const ref = await addDoc(collection(firestore, 'masterclasses'), {
    ownerUid: user.uid,
    name: String(name).slice(0, 60),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    memberCount: 1,
  });
  await setDoc(doc(firestore, 'masterclasses', ref.id, 'members', user.uid), {
    uid: user.uid,
    role: 'owner',
    addedBy: user.uid,
    addedAt: serverTimestamp(),
  });
  return ref.id;
}
```

- [ ] **Step 3: Write `fetchMyMasterclasses()`**

```js
// One collection-group query over every membership document whose id is my
// uid, then one read per class for the name. `masterclasses` itself has
// `allow list: if false`, so this membership-first shape is the ONLY way to
// find my classes — and it is also what stops anyone enumerating the
// collection. Needs the COLLECTION_GROUP index on members.uid in
// firestore.indexes.json; without it this throws 'failed-precondition'.
export async function fetchMyMasterclasses() {
  const user = auth.currentUser;
  if (!user) return [];
  const snap = await getDocs(query(
    collectionGroup(firestore, 'members'),
    where('uid', '==', user.uid),
    limit(MAX_MASTERCLASSES * 4)));
  const rows = [];
  snap.forEach(d => rows.push({ mcId: d.ref.parent.parent.id, role: d.data().role }));
  const classes = await Promise.all(rows.map(r => getDoc(doc(firestore, 'masterclasses', r.mcId))));
  const out = [];
  classes.forEach((c, i) => {
    if (c.exists()) out.push({ ...rows[i], ...c.data() });
  });
  return out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
```

The `limit` is `MAX_MASTERCLASSES * 4` and not `MAX_MASTERCLASSES`: the cap is on
classes you **own**, and you can be a viewer in many more.

- [ ] **Step 4: Write `deleteMasterclass()`**

```js
// Firestore does NOT cascade. Deleting the class document alone leaves its
// members and chapters readable forever by anyone still holding a membership
// document, which is a privacy problem, not just untidiness. So subcollections
// go first and the parent goes last — if this is interrupted, the class is
// still there and the owner can try again. A batch caps at 500 operations,
// which the 50-chapter / 30-member caps stay well inside.
export async function deleteMasterclass(mcId) {
  const user = auth.currentUser;
  if (!user || !mcId) return;
  const batch = writeBatch(firestore);
  const [chapters, members] = await Promise.all([
    getDocs(collection(firestore, 'masterclasses', mcId, 'chapters')),
    getDocs(collection(firestore, 'masterclasses', mcId, 'members')),
  ]);
  chapters.forEach(d => batch.delete(d.ref));
  members.forEach(d => { if (d.id !== user.uid) batch.delete(d.ref); });
  batch.delete(doc(firestore, 'masterclasses', mcId, 'live', 'state'));
  await batch.commit();
  // The owner's own membership last: the member delete rule refuses to let an
  // owner remove themselves while the class exists, so this only becomes legal
  // once the parent is gone.
  await deleteDoc(doc(firestore, 'masterclasses', mcId));
  await deleteDoc(doc(firestore, 'masterclasses', mcId, 'members', user.uid))
    .catch(() => {});
}
```

- [ ] **Step 5: Wire the UI**

In `js/masterclass.js`: `#mc-new` asks for a name with `askText(t('mc_name'))`,
refuses past `MAX_MASTERCLASSES` **owned** classes with
`toast(t('mc_limit').replace('{n}', MAX_MASTERCLASSES))`, creates, and reloads
the list. `#mc-menu` opens a `sheet()` whose only entry for now is delete, behind
`askConfirm(t('mc_delete_confirm'))`, and only for the owner.

The list is **lazy**, like the Friends list: `Auth.onChange` only invalidates it;
it refetches when the Bases tab opens. Loading at boot would cost reads for
someone who never opens Bases.

Signed out → render `t('mc_needs_signin')` and hide `#mc-new`. A network failure
→ render `t('mc_needs_network')`.

- [ ] **Step 6: Verify against production, with two accounts if possible**

Bump `sw.js` to v66. Then, on the live site:
- create a Masterclass, reload, it is still there
- it appears with the **Owner** role chip
- the 6th create is refused with the cap toast
- delete removes it, and the Firestore console shows **no orphaned**
  `members` or `chapters` documents left behind

375px, light and dark, both languages.

- [ ] **Step 7: Commit**

```bash
git add js/firebase.js js/masterclass.js sw.js
git commit -m "Masterclass: create, list and delete against Firestore"
```

---

## Task 4: Chapters

**Files:** Modify `js/firebase.js`, `js/masterclass.js`, `js/app.js`, `sw.js`

**Interfaces:**
- `addChapter(mcId, { title, pgn, startFen, order }) -> Promise<string>`
- `fetchChapters(mcId) -> Promise<Array<{ id, title, pgn, startFen, order }>>`
- `deleteChapter(mcId, chapterId) -> Promise<void>`
- `MAX_CHAPTERS = 50`, `MAX_CHAPTER_BYTES = 100000`

- [ ] **Step 1: Write the chapter functions**

```js
export const MAX_CHAPTERS = 50;          // advisory, UI-side
export const MAX_CHAPTER_BYTES = 100000; // enforced in firestore.rules

// The PGN is produced by tree.toPgn() and consumed by parsePgn(), both already
// in js/tree.js — a chapter is exactly a game, so nothing new is serialised.
// The size check runs here too so an oversized chapter fails with a readable
// message instead of a bare permission-denied from the rules.
export async function addChapter(mcId, { title, pgn, startFen, order }) {
  const user = auth.currentUser;
  if (!user || !mcId) return null;
  if (new Blob([pgn]).size > MAX_CHAPTER_BYTES) throw new Error('chapter-too-big');
  const ref = await addDoc(collection(firestore, 'masterclasses', mcId, 'chapters'), {
    title: String(title || '').slice(0, 80),
    pgn,
    startFen: String(startFen || '').slice(0, 100),
    order: Number(order) || 0,
    updatedBy: user.uid,
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function fetchChapters(mcId) {
  const snap = await getDocs(query(
    collection(firestore, 'masterclasses', mcId, 'chapters'),
    limit(MAX_CHAPTERS)));
  const out = [];
  snap.forEach(d => out.push({ id: d.id, ...d.data() }));
  // Sorted here rather than with orderBy so no composite index is needed —
  // the same call the friends list makes.
  return out.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function deleteChapter(mcId, chapterId) {
  await deleteDoc(doc(firestore, 'masterclasses', mcId, 'chapters', chapterId));
}
```

- [ ] **Step 2: Add "Add chapter" from a local base**

`#mc-add-chapter` (owner only) opens a `sheet()` with two entries:

1. **From a database** — reuse the existing `chooseBase()` helper in `js/app.js`
   (defined around line 1591; it is already the base picker for
   `Analysis.saveToBase()`), then list that base's games with
   `db.listGameSummaries(baseId)` and let the owner pick one. Load the full game
   with `db.getGame(id)` and send `g.pgn` up as the chapter. The default title is
   `"White vs Black"` from the summary, editable with `askText()`.
2. **From the current board** — take `Analysis.tree.toPgn()` and
   `Analysis.tree.startFen`.

**Do not add a "share the whole base" entry.** A base can hold thousands of
games; 5,000 games is 5,000 writes and 5,000 reads for every student who opens
it. A Masterclass is a curated lesson, and the 50-chapter cap is the shape of
that decision.

- [ ] **Step 3: Open a chapter read-only**

Tapping a chapter row calls `Analysis.loadTree(parsePgn(chapter.pgn), { baseId:
null, gameId: null, fromMasterclass: mcId })`. Passing `baseId: null` is what
keeps `Analysis` from offering to save it back into a local base — a chapter is
not a local game. **Verify** that the `⋯` menu on Analysis does not offer
anything that would try to write to IndexedDB with a null baseId.

- [ ] **Step 4: Verify**

Bump `sw.js` to v67. On the live site, at 375px, light and dark, both languages:
- add a chapter from a base; it appears in the list with its title
- open it; the board shows the right position and the moves list is walkable
- `←` comes back to the Masterclass screen, tab bar still lit on Bases
- delete a chapter; it goes
- a chapter over 100 KB shows a readable message, not a raw permission error
- a **viewer** account sees the chapter list with no `➕ Add chapter` button and
  no delete entry

- [ ] **Step 5: Commit**

```bash
git add js/firebase.js js/masterclass.js js/app.js sw.js
git commit -m "Masterclass: chapters, added from a base and opened read-only"
```

---

## Task 5: Members and the friend picker

**Files:** Modify `js/firebase.js`, `js/masterclass.js`, `sw.js`

**Interfaces:**
- `addMembers(mcId, uids, role = 'viewer') -> Promise<number>` — how many landed
- `fetchMembers(mcId) -> Promise<Array<{ uid, role }>>`
- `removeMember(mcId, uid) -> Promise<void>`
- `leaveMasterclass(mcId) -> Promise<void>`
- `MAX_MEMBERS = 30`

**Depends on Friends.** The picker reads `Friends.friends` — the list
`fetchFriendUids()` fills, which `js/friends.js` already caches — and draws rows
with `fetchLeaderboardByUids()` and `avatarHtml()`. **Reuse both; do not add a
new query and do not copy any name or avatar into a member document.** Names come
live from `/leaderboard`, exactly as everywhere else, so they cannot go stale and
a stranger cannot store text on somebody else's document.

- [ ] **Step 1: Write the member functions**

```js
export const MAX_MEMBERS = 30;   // advisory, UI-side

// Each add is its own write, and each one can legitimately fail on its own —
// the rules refuse anyone who has blocked the owner. Failures are counted, not
// thrown, so inviting five friends when one has blocked you still adds four.
// The count is what the caller reports; it must NOT name who failed, for the
// same reason sendFriendRequest() shows one neutral toast for every outcome:
// a block must not be detectable.
export async function addMembers(mcId, uids, role = 'viewer') {
  const user = auth.currentUser;
  if (!user || !mcId) return 0;
  let added = 0;
  for (const uid of [...new Set(uids)].filter(u => u && u !== user.uid)) {
    try {
      await setDoc(doc(firestore, 'masterclasses', mcId, 'members', uid), {
        uid, role, addedBy: user.uid, addedAt: serverTimestamp(),
      });
      added++;
    } catch { /* blocked, or already gone — silent by design */ }
  }
  return added;
}

export async function fetchMembers(mcId) {
  const snap = await getDocs(query(
    collection(firestore, 'masterclasses', mcId, 'members'), limit(MAX_MEMBERS + 10)));
  const out = [];
  snap.forEach(d => out.push({ uid: d.id, ...d.data() }));
  return out;
}

export async function removeMember(mcId, uid) {
  await deleteDoc(doc(firestore, 'masterclasses', mcId, 'members', uid));
}

// Leaving is the same delete, done to my own document. The owner cannot: the
// rule refuses it, because a class with no owner-member is unreachable.
export async function leaveMasterclass(mcId) {
  const user = auth.currentUser;
  if (!user) return;
  await deleteDoc(doc(firestore, 'masterclasses', mcId, 'members', user.uid));
}
```

- [ ] **Step 2: Build the friend picker**

`#mc-add-member` (owner only) opens a `modal()` listing the owner's friends, each
row a `<label>` with a checkbox, avatar, display name and username — the same row
markup `js/friends.js` already uses, so the two lists stay one thing. Friends
already in the class are shown greyed with a "Member" chip and no checkbox.

One tap on a single row adds that one friend; the confirm button adds every
checked row. Both go through `addMembers()`.

Report with `toast(tn('mc_member_added', added))` — **the count only, never who
failed.**

Empty friends list → point at the Friends screen rather than showing an empty
modal.

- [ ] **Step 3: Build the member list**

`#mc-member-list` shows every member with their avatar, name, and a `.mc-role`
chip reading `t('mc_role_owner' | 'mc_role_editor' | 'mc_role_viewer')`. For the
owner, `⋯` on a member row offers **Remove from Masterclass**. For a viewer, the
screen's `⋯` menu offers **Leave Masterclass**, behind `askConfirm`.

After any membership change, update `memberCount` on the parent document so the
list on the Bases tab draws "5 members" without reading the subcollection. It is
advisory — if it drifts, the member screen is the truth.

- [ ] **Step 4: Verify with two accounts**

Bump `sw.js` to v68. This one genuinely needs both accounts —
`Zugzwang` / `hxxaE1n6T1WzxLvIGTMby1RfkZs1` and `miguelafuentesm` /
`f3trpsGqDXXXcV9OQsUw0TGlbjh1` were used for the Friends verification.

- as owner: invite the friend, the toast counts 1, the member list shows them as
  **Viewer**
- as the friend: the Masterclass appears on their Bases tab, they can open it and
  read the chapters, and they have **no** add/delete buttons anywhere
- as the friend: **Leave** removes it from their list
- as owner: **Remove** takes them out
- as owner: the owner's own row has no Remove, and the `⋯` menu has no Leave
- 375px, light and dark, both languages

- [ ] **Step 5: Commit**

```bash
git add js/firebase.js js/masterclass.js sw.js
git commit -m "Masterclass: members, the friend picker, leave and remove"
```

**This is the stop point.** Everything above ships as an asynchronous shared
read-only base and is useful on its own. Commits 6 and 7 add live follow on top
and change nothing that came before.

---

## Task 6: Live follow

**Files:** Modify `js/firebase.js`, `js/masterclass.js`, `js/app.js`, `sw.js`

**Interfaces:**
- `watchLiveState(mcId, cb) -> unsubscribe` — `cb(state, { fromCache })`
- `pushLiveState(mcId, { chapterId, fen, path }) -> Promise<void>`
- `LIVE_THROTTLE_MS = 1000`

- [ ] **Step 1: Write the live functions, with the throttle**

```js
// Firestore's sustained write limit on a SINGLE document is about 1 write per
// second. This document is written on every move the teacher makes, so writes
// are coalesced: at most one per second, and the newest pending state wins.
// Removing this throttle does not fail loudly — it degrades into rejected
// writes and rising latency under exactly the conditions (a busy lesson) where
// it matters most. Do not remove it.
export const LIVE_THROTTLE_MS = 1000;

let livePending = null;
let liveTimer = null;

export function pushLiveState(mcId, next) {
  const user = auth.currentUser;
  if (!user || !mcId) return;
  livePending = { mcId, next };
  if (liveTimer) return;
  const flush = () => {
    liveTimer = null;
    if (!livePending) return;
    const { mcId: id, next: state } = livePending;
    livePending = null;
    liveTimer = setTimeout(flush, LIVE_THROTTLE_MS);
    setDoc(doc(firestore, 'masterclasses', id, 'live', 'state'), {
      chapterId: state.chapterId ?? null,
      fen: String(state.fen || '').slice(0, 100),
      path: String(state.path || '').slice(0, 512),
      drivenBy: user.uid,
      updatedAt: serverTimestamp(),
    }).catch(e => console.error('live push failed', e));
  };
  flush();
}

// metadata.fromCache is the ONLY reliable signal that this client has lost the
// server. It flips true the moment the connection drops and false on
// resubscribe, which is what drives the "Reconnecting…" bar. Note the app does
// NOT enable Firestore disk persistence (js/firebase.js calls plain
// getFirestore), so this cache is in-memory and dies on reload — a viewer who
// reloads while offline sees the offline message, not stale content. That is
// the intended behaviour, not a bug.
export function watchLiveState(mcId, cb) {
  return onSnapshot(doc(firestore, 'masterclasses', mcId, 'live', 'state'),
    snap => cb(snap.exists() ? snap.data() : null, { fromCache: snap.metadata.fromCache }),
    err => { console.error('live watch failed', err); cb(null, { fromCache: true }); });
}
```

- [ ] **Step 2: Drive from the owner's board**

When the owner opens a chapter from a Masterclass, `Analysis` gets a
`ctx.masterclassId` and every navigation calls `pushLiveState()` with the
chapter, the current FEN and the path. The `🔴 Live` pill in `#mc-live-bar` shows
that they are broadcasting, and tapping it stops.

**Only the owner drives in stage 1.** Even though the rules already allow only
the owner to write `live/state`, the button must be hidden for viewers too — a
button that always fails is worse than no button.

- [ ] **Step 3: Follow, as a viewer**

A viewer opening the Masterclass subscribes with `watchLiveState()`. When a state
arrives, load that chapter and jump to that position. A **Following** toggle lets
them stop and browse on their own; tapping **Back to live** resumes and jumps to
wherever the teacher is now.

On reconnect, the listener delivers **the current state, not the steps that were
missed**. The viewer jumps straight to where the teacher is. For a lesson that is
the correct behaviour — do not try to replay the gap.

Unsubscribe on leaving the screen. A live listener left running is a read per
teacher move, forever.

- [ ] **Step 4: Verify with two accounts, live**

Bump `sw.js` to v69.
- owner moves; the viewer's board follows within about a second
- the viewer toggles Following off, browses, toggles back on and snaps to the
  teacher's position
- kill the viewer's network for 30 seconds while the owner keeps moving; on
  reconnect the viewer lands on the **current** position, not a replay
- watch the Firestore usage panel: the write count is roughly one per second of
  active moving, **not** one per move
- 375px, light and dark, both languages

- [ ] **Step 5: Commit**

```bash
git add js/firebase.js js/masterclass.js js/app.js sw.js
git commit -m "Masterclass: live board, owner drives and viewers follow"
```

---

## Task 7: Connection state and polish

**Files:** Modify `js/masterclass.js`, `js/i18n.js`, `css/style.css`, `sw.js`

- [ ] **Step 1: The reconnecting bar**

`#mc-live-bar` shows `t('mc_reconnecting')` whenever the latest snapshot arrived
with `fromCache: true`, and the live pill when it did not. Two new strings:

```js
  mc_reconnecting: { es: 'Reconectando…', en: 'Reconnecting…' },
  mc_live:         { es: '🔴 En vivo', en: '🔴 Live' },
  mc_following:    { es: 'Siguiendo', en: 'Following' },
  mc_back_to_live: { es: 'Volver a en vivo', en: 'Back to live' },
  mc_member_added:     { es: '{n} miembros añadidos ✓', en: '{n} members added ✓' },
  mc_member_added_one: { es: '1 miembro añadido ✓', en: '1 member added ✓' },
```

`mc_member_added` / `mc_member_added_one` go through `tn()`, the existing
singular/plural helper in `js/i18n.js` — English and Spanish both split at
exactly one here, so `Intl.PluralRules` is not needed.

- [ ] **Step 2: The offline screen**

`window.addEventListener('offline'|'online')` swaps the Masterclass section on
the Bases tab for `t('mc_needs_network')`. The wording must say the **local bases
still work** — that is the difference between "the app is broken" and "this one
feature needs signal".

- [ ] **Step 3: Verify offline behaviour honestly**

- cut the network on the Bases tab: the Masterclass section says it needs a
  connection, the **local base list below it still works fully**
- cut the network inside a Masterclass: the last position stays on screen and the
  Reconnecting bar appears
- **reload** while offline: the app shell loads from the service worker and the
  Masterclass screen shows the offline message. It does **not** show stale
  content, because Firestore disk persistence is not enabled. Confirm this rather
  than assuming it.
- 375px, light and dark, both languages

- [ ] **Step 4: Commit**

```bash
git add js/masterclass.js js/i18n.js css/style.css sw.js
git commit -m "Masterclass: connection state, offline copy, live pill"
```

---

## Stage 2 — sketched, not detailed

**Do not build any of this without a plan of its own.** It is here so stage 1
does not paint us into a corner, and every note below is a thing stage 1 has
already made cheap.

### 2a. The editor role

Three rule clauses change from `mcIsOwner(mcId)` to
`mcIsOwner(mcId) || mcRole(mcId) == 'editor'` — on `chapters`, on `live/state`,
and nowhere else. A new `mcRole()` helper reads the member document. `'editor'`
is already a legal stored value and already tested, so **no stored data moves.**
The test marked `// STAGE 2 FLIPS THIS` in `tests/rules/masterclass.test.js` gets
inverted.

Then the fork, and it is Adrian's call at the time, not now:

- **(a) Keep chapters as PGN blobs, add a soft lock.** One editor per chapter at a
  time; a second sees "Miguel is editing this chapter". No migration, small job.
  Honest limit: two people cannot edit the *same* chapter simultaneously — they
  work in different chapters of the same class.
- **(b) Migrate chapters to `chapters/{cid}/nodes/{nodeId}`.** True per-move
  concurrency: annotating move 12 and move 20 are writes to different documents
  and both survive. This is a **migration, not a rewrite** — read each chapter's
  `pgn`, run the existing `parsePgn()`, write the nodes, drop the field. Every
  screen, every rule, every membership record survives. The new code is a
  bidirectional `GameTree` ↔ Firestore mapping with tombstones for deletions,
  and it is the largest single chunk of work in the whole feature.

Whichever is picked, **Firestore has no conflict resolution.** It is
last-write-wins per field with no error and no event. The three failure modes to
design against: silent clobber with no cross-user undo; offline writes replaying
on reconnect and overwriting an hour of newer work with zero conflict detection;
and rules being evaluated at *replay* time, so a write that was legal when made
can be denied later and dropped silently. The mitigation that actually works is
**refusing an editor's writes while offline** rather than queueing them.

### 2b. Link sharing

```
masterclassInvites/{token}          ← the token IS the document id, 20+ random chars
  mcId, role: 'viewer', createdAt, expiresAt, revoked
```

`allow get: if true; allow list: if false` — readable only by someone who already
knows the id, never enumerable. The joiner creates their own member document with
the token as a field and the rule validates it server-side against the invite
document. **This works only because stage 1 made members a subcollection** — a
stranger cannot append to the owner's document. The alternative is a Cloud
Function, which is a real server and contradicts the house rule.

- **URL shape: `https://chesstrainingcenter.app/?mc=<id>&k=<token>`.** A path like
  `/m/ABC` **404s** — GitHub Pages has no server-side routing. A query string on
  the root needs zero server config.
- **`sw.js:117` must gain `{ ignoreSearch: true }`** on its offline
  `caches.match(e.request)` fallback, or `/?mc=...` misses the cache offline and
  the app shell fails to load at all.
- **The TWA already opens these links.** `.well-known/assetlinks.json` declares
  `com.chesstrainingcenter.app` with its fingerprint and
  `manifest.webmanifest` has `"scope": "."`, so Digital Asset Links is verified
  and the link opens the installed app with no disambiguation dialog. **No new
  intent filter, no rebuild.**
- **Without the app**, the same URL opens the PWA in the browser and must handle a
  signed-out stranger: an invite landing card, sign in or create an account, and
  an install prompt. iOS and desktop always land here.
- **The sign-in trap:** `signInWithPopup` loses the query string. Stash the token
  in `sessionStorage` *before* sign-in and re-read it after `onAuthStateChanged`,
  or every link invite from a signed-out user dies at the sign-in step.
- **Revocation:** set `revoked: true` or delete the invite document. Anyone who
  already joined **keeps their membership** — revoking closes the door, it does
  not eject. Ejecting is `removeMember()`. The UI must say which is which or the
  owner will think they kicked someone when they only closed the door.
- **The link grants `viewer` by default.** The role lives in the invite document,
  so an editor link is possible later with no rules change; the button creates
  viewer links only.

### 2c. Play Store, before link sharing ships

User-to-user sharing with strangers usually flips the content-rating
questionnaire's "users can interact / share content" answers, and Google then
expects a **report abuse** path. Block already exists. The Data Safety form also
needs updating — the app now stores user-generated content shared with other
users. Neither blocks stage 1, both are needed before public link sharing.

---

## Self-review notes

- **Stale docs called out:** the task brief said the Firestore rules "were never
  exported to `firestore.rules` and the write rules were never tested". **That is
  stale.** `firestore.rules` is 193 lines, committed and maintained since
  `aaa51b0`, and `tests/rules/` has 87 passing tests against the emulator; both
  items are struck through in HANDOVER. This plan builds on a working, tested
  rules file.
- **Friends dependency:** only Task 5 needs Friends, and only for the picker's
  source list. **Tasks 1–4 and 6–7 do not depend on Friends at all** and could
  land first if Friends were ever delayed. Friends is in fact complete (commits
  1–8 of 9 done, commit 9 cancelled), so this is theoretical.
- **`shareBase()` and `#base-share` are not touched by any task.** File export
  stays exactly as it is.
- **The 100 KB chapter bound is the only size cap that is really enforced.** The
  50/30/5 caps are UI-side; the code comments say so.
