# Chess app — where things stand (updated 2026-08-07)

## Already done and pushed — do NOT redo these

- **Masterclass — commit 3 of 7 is done (2026-08-16, `fa5b0d7`). The list, the
  create and the delete are real Firestore calls.** `sw.js` v65 → **v66**.
  `firestore.rules`, `firestore.indexes.json` and `tests/rules/masterclass.test.js`
  are untouched — **still 122 passing, 0 failing.**
  - `js/firebase.js` gained `MAX_MASTERCLASSES`, `createMasterclass()`,
    `fetchMyMasterclasses()`, `fetchMasterclass()` and `deleteMasterclass()`,
    plus `addDoc, collectionGroup, serverTimestamp, writeBatch, onSnapshot` on
    the firebase-firestore import. **`onSnapshot` and `fetchMasterclass()` are
    deliberately unused** — commit 6 and commit 4 use them, and naming one more
    symbol from an already-downloaded module costs nothing.
  - **TWO bugs in the plan's `deleteMasterclass()` were found and fixed, and
    both were MEASURED against the emulator with a throwaway probe test, not
    reasoned about. Do not copy the plan's version back out.**
    1. **`live/state` cannot be deleted by anybody.** The `live` block has one
       `allow write` and every clause reads `after()`, i.e.
       `request.resource.data`, which is **null on a delete** — so the rule
       errors and denies. The plan had this delete *inside the batch*, and a
       batch is atomic, so **deleting a Masterclass would have failed outright,
       every single time.** It is now a separate quiet call placed *before* the
       parent delete, so it starts working by itself the day **commit 6 adds
       `allow delete: if mcIsOwner(mcId);` to that block** — commit 6 must do
       that, with a test.
    2. **The owner's own membership document cannot be deleted either.**
       Refused while the class exists (test 22 — that would orphan a class
       nobody can read), and refused afterwards too, because `mcOwnerUid()`
       does a `get()` on the parent that is now gone and the null dereference
       denies. **So exactly one document survives a delete: the owner's own
       `{uid, role, addedBy, addedAt}`.** Nobody else can read it (both read
       rules need the deleted parent) and `fetchMyMasterclasses()` skips it, so
       it is not a leak of anyone else's data — but it is real, expected
       leftover, and the Firestore console will show it. Closing it needs one
       more clause in `firestore.rules`. **Every OTHER member's document and
       every chapter are deleted, and they go first** — that is the part that
       matters for privacy.
  - **`MC_LIMIT` is gone.** The cap is `MAX_MASTERCLASSES`, imported from
    `js/firebase.js` — one constant, one place. It is still **advisory,
    UI-side only**, and it counts the classes you **OWN** (`Masterclass.owned()`),
    not the ones you have been added to.
  - **`fetchMyMasterclasses()` returns rows keyed `id`, not `mcId`.** The
    rename happens at the fetch boundary so only one shape exists above it. The
    plan's `mcId` is superseded.
  - **`#mc-new` stays live when signed out and toasts `mc_needs_signin`** —
    Adrian's call. The plan's "signed out → hide `#mc-new`" line is superseded.
    A button that explains itself teaches what the feature needs.
  - The list is **lazy**, exactly like Friends: `Auth.onChange` only
    invalidates it and `Base.showList()` → `openList()` refetches. The four
    list states — signed out / loading / offline / genuinely empty — are drawn
    apart, and the `.mc-role` chip (`mc_role_owner|editor|viewer`) is now on
    the row. An unrecognised role draws no chip rather than an empty pill.
  - Verified over CDP at 375px in light and dark, in **both languages**: all
    four empty states, the role chip in all three roles plus an unknown one, an
    escaped `<b>xss</b>` name, the cap toast at 5 owned and the name prompt at
    4, the owner ⋯ sheet reaching the delete confirm and the member sheet
    showing Leave instead, `scrollWidth` exactly 375 everywhere, and no console
    error but the App Check 403.
  - **Nothing in this commit has ever reached real Firestore** — App Check
    blocks this machine from Firestore entirely. The live-site checklist is in
    the commit-4 handover prompt and is not optional.
  - Committed on local `main`, **not pushed**.

- **Masterclass — commit 2 of 7 is done (2026-08-16, `6236198`). Screens and
  strings only, nothing talks to Firestore.** `sw.js` v64 → **v65**.
  - New `js/masterclass.js` (the `js/friends.js` pattern: one exported object,
    `init()` wiring buttons, `render*()` rebuilding from state), a Masterclass
    section above the base list inside `#base-list-view`, a new
    `#screen-masterclass`, a `.mc-*` CSS block and **27** bilingual `mc_*`
    strings.
  - **"Masterclass" is untranslated in Spanish and must stay that way** — not
    *Clase magistral*, not *Masterclase*. The word appears verbatim in the
    `es:` values.
  - **NO sample data, deliberately.** Friends commit 2 shipped a `SAMPLE` array
    and commit 3 had to delete it; every list here draws its real empty state,
    so nothing invented can reach the site. `Masterclass.classes`, `.chapters`
    and `.members` are all `[]` until commits 3, 4 and 5 fill them.
  - **`askText()` in `js/app.js` is now exported.** One word, no behaviour
    change. The plan's Task 2 "Interfaces" line already listed it as an import
    and it was not exported — commits 3 and 4 need a text prompt too, so it was
    exported rather than duplicated.
  - **`#mc-live-bar` is in the markup and hidden until commit 6**, so the
    screen was laid out with the space it will occupy. Do not delete it.
  - **`MC_LIMIT = 5` is ADVISORY, UI-side only** — the comment in the file says
    so. Same for the 50-chapter and 30-member caps when they land. They cannot
    be enforced in rules without a server counter.
  - **The tab bar stays lit on Bases** while `#screen-masterclass` is open —
    `open()` re-lights it after `showScreen()`, the same trick
    `Analysis.updateBaseNav()` uses for a game opened from a base. `←` calls
    `showScreen('base')`, which runs `Base.refresh()` → `showList()` →
    `Masterclass.openList()`.
  - **`mc_chapters` / `mc_members` are lower case** (*capítulos*, *members*) —
    they are only ever rendered after a number, exactly like `games` in the
    base list directly underneath. They were capitalised in the plan; that was
    changed here after seeing "3 Miembros" next to "0 partidas" at 375px.
  - **The ⋯ menu and the New Masterclass prompt are inert on purpose.** The
    ⋯ sheet picks the right item from the role (delete for an owner, leave for
    a member) and both actions are empty — the writes land in commits 3 and 5.
    `newClass()`'s two guards (signed out → `mc_needs_signin`, offline →
    `mc_needs_network`) are real and permanent; the `askText()` prompt opens
    and the name goes nowhere until commit 3 writes the document.
  - `firestore.rules`, `firestore.indexes.json` and every test are untouched —
    **still 122 passing, 0 failing.**
  - Verified over CDP at 375px in light and dark, in both languages: section
    above an unchanged base list, screen opens and closes, `←` returns with the
    tab lit on Bases, `document.scrollWidth` exactly 375 on both screens,
    singular and plural labels correct, long class name truncates with `←` and
    `⋯` both still on screen, and the only console error is the App Check 403.
  - Committed on local `main`, **not pushed**.

- **Masterclass — commit 1 of 7 is done (2026-08-16, `feca228`). Rules and
  tests only, nothing the browser loads changed, `sw.js` stays at v64.** The
  plan is `docs/superpowers/plans/2026-08-16-masterclass-stage-1.md` (committed
  in the same commit; it was untracked before).
  - `firestore.rules` gained the Masterclass block as a **sibling** of the
    Friends blocks: `masterclasses/{mcId}`, its `members`, `chapters` and
    `live/{docId}` subcollections, plus the `mcPath` / `mcOwnerUid` /
    `mcIsOwner` / `mcIsMember` helpers. `signedIn()`, `me()`, `after()` and
    `num()` were reused, not redefined.
  - `tests/rules/masterclass.test.js` — 35 new tests, numbered to match the
    plan's list. **`npm run test:rules` is at 122 passing**, zero failing, on
    two consecutive runs.
  - **Deployed 2026-08-16 — rules AND indexes.** `firebase
    firestore:indexes` read back from the live project shows the `members` /
    `uid` field override with `COLLECTION_GROUP` scope, so the collection-group
    query in commit 3 will not hit `failed-precondition`. Edit the file and
    deploy, never the console.
  - **Two things in the plan's Task 1 are WRONG and were fixed here — do not
    copy them back out of the plan:**
    1. The recursive rule `match /{path=**}/members/{memberUid}` must test
       **`resource.data.uid == me()`**, not `memberUid == me()`. On a
       collection-group *list* the document-id wildcard is not bound, so
       reading it raises `Null value error` and denies the query. This is
       precisely what the redundant `uid` field on every member document is
       for; do not delete it as duplication.
    2. The new test suite runs under its own emulator `projectId`
       (`chess-training-center-mc`). `node --test` runs the test **files** in
       parallel and `clearFirestore()` wipes the whole project, which was
       deleting `friends.test.js`'s seeded documents mid-test and failing two
       existing Friends tests for the wrong reason. `existing.test.js` never
       clears, which is why this never bit before.
  - **The 50-chapter, 30-member and 5-Masterclass caps are advisory, UI-side
    only.** They cannot be enforced in rules without a server-maintained
    counter. The rules-enforced bound is the 100,000-byte chapter PGN limit.
  - Committed on local `main`, **not pushed**.

- **Friends — the two-account run finally happened (2026-08-16). The system
  is verified against production.** Adrian ran it on the live site as
  `Zugzwang` (`hxxaE1n6T1WzxLvIGTMby1RfkZs1`) with `miguelafuentesm`
  (`f3trpsGqDXXXcV9OQsUw0TGlbjh1`). **Every "Owed: the two-account run" note
  below is now settled — read this entry instead of them.**
  - **Proved against live Firestore:** `usernameLower` publishing; the prefix
    search; `sendFriendRequest()` writing exactly four fields;
    `acceptFriendRequest()` creating the friendship and deleting the request;
    `fetchFriendUids()` + `fetchLeaderboardByUids()` filling the Friends list;
    the friends leaderboard with my own row ringed, all four category tabs;
    and `blockUser()`, `unblockUser()`, `fetchBlockedUids()` — block wrote
    `blocks/{me}/blocked/{them}`, removed the friendship and the request I had
    sent, the Blocked screen listed them, and Unblock cleared it.
  - **Still never executed, and do not claim otherwise:** `unfriend()`
    itself (though `blockUser()` runs the identical delete on the identical
    document under the identical rule, and that was watched succeeding),
    `rejectFriendRequest()`, `cancelFriendRequest()`, and the blocked
    sender's side — "the blocked account tries to ask again and no document
    appears" needs a second account Adrian can sign into. He does not have
    one right now.
  - **One real bug was found and fixed — `5326426`, `sw.js` → v63.**
    `renderFind()` in `js/friends.js` decided the search row's button from
    `Friends.sent` alone, i.e. the uids clicked in *this page session*. It
    never checked the friends list or the outgoing requests, which
    `paintAddFriend()` has checked since commit 7 — so **an existing friend
    came back from a search as a live ➕ that really did send another
    request.** It now resolves the same four states from the same three
    lists, and `search()` awaits `loadFriends()` when it has never run.
    Verified at 375px, light and dark, both languages, all four states.
  - **The "createdAt changed on a second send" scare was not a rules bug and
    there is no rules drift.** Accepting deletes the request document, so a
    later ➕ press was a fresh create, not a denied overwrite. Do not
    re-investigate it.
  - **Commit 9 (unique usernames) is NOT DOING**, decided here. Prefix search
    already distinguishes duplicates by avatar, display name, username and
    ELO; commit 9 changes signup, adds a new failure path on a new user's
    first screen, and does not fix existing duplicates — and there are 0
    duplicate usernames live. The plan's commit 9 section carries the full
    reasoning. Do not re-cost it.
  - `Velociraptorblue` and `foTtAx0VzRXgPgkkyRdESxJ0LN02` have no
    `usernameLower` and are correctly unsearchable until their next sign-in.
    That is the documented behaviour, not a bug.

- **The 26 streak icons are animated — CSS only, no new art (2026-08-16,
  `85c45ba`).** `sw.js` v63 → **v64**. The deliberately deferred half of the art
  rebuild is now done.
  - **The art is still 26 flat PNGs and `streaks/` is still 488 KB.** Adrian
    chose CSS over per-frame art: a frame set would have been ~130 more files
    and 2–3 MB, undoing the 2.5 MB → 488 KB rebuild in an offline-first PWA.
    **Do not revisit this as "we should do it properly" — it was costed and
    decided.**
  - Two keyframes in `css/style.css`, in a new **"idle flame motion"** block in
    the streak ladder section: `streak-flicker` (3.1s, `scaleY` off a
    `transform-origin: 50% 100%` base) and `streak-emberglow` (4.7s, brightness
    + `drop-shadow`). **The two periods are unrelated on purpose** so they never
    line up and the loop never reads as a metronome. Changing one to match the
    other is a regression.
  - **Only three of the four slots animate**, by Adrian's choice: the 64px
    `.streak-now-icon`, the 64px `.kael-quote-streak`, and the 34px image on the
    **`.current`** ladder row. **The 20px header badge is untouched** and still
    only moves on tier-up (`@keyframes streak-pop`) — a permanent pulse in the
    always-visible status strip was rejected. Locked tiers never animate; the
    selectors all carry `:not(.locked)` because the animated `filter` would
    otherwise wipe their `grayscale(1)`.
  - **A third animation, `streak-embers`, is the heat haze on the 64px Profile
    slot only** — a blurred copy of the same already-cached PNG drifting up
    behind the icon. It is fed by a `--streak-icon` custom property set inline
    by `renderStreakLadder()` in `js/app.js`, alongside a new `.has-flame`
    class; both are withheld at day 0. At 34px it would be invisible, which is
    why the ladder rows do not get it.
  - **The haze URL must stay absolute (`document.baseURI`).** A relative URL
    inside a custom property is resolved by Chrome against *the stylesheet that
    reads it*, not the document, so `streaks/x.png` became `css/streaks/x.png`
    and 404'd. This was caught in verification, not guessed.
  - **The haze is masked to a circle**, as cheap insurance: the blurred copy
    fills its whole 64px box, so without a mask it could take on a square edge
    at peak opacity. A radial mask has no corners.
  - **There is NO alpha-residue defect in the art — this was measured, after a
    first look at a 4× screenshot suggested otherwise.** Across all 26 PNGs the
    outer 20px ring averages 2–6/255 alpha and the dead corners sit at 2/255;
    composited on white that is a 253/255 grey, i.e. one to two levels. What
    reads as a faint box at high zoom is the ember and bloom field, which is
    intended art per `docs/STREAK-ART-SPEC.md`. **Do not "fix" this by redoing
    the alpha recovery** — there is nothing there to remove.
  - **One `prefers-reduced-motion` guard covers all three**, with selectors
    identical to the animation rules so specificity matches. Verified: reduced
    motion sets `animation: none` on all four elements and the Kael popup falls
    back to its static 8px `drop-shadow`.
  - Verified over CDP at 375px in light and dark, in **both languages**: 6
    distinct transforms, filters and haze opacities sampled over 2.5s (it really
    moves), haze image HTTP 200 at the same URL the `<img>` resolves to (one
    cached file, not two), boxes exactly 20/34/64, `scrollWidth` 375,
    `streak-pop` still fires, zero page errors.
  - Two stale CSS comments corrected on the way — both still claimed the art was
    fixed-height / `width: auto`, which stopped being true when it went square.

- **Streak icons rebuilt from zero — 38 tiers became 26, ending at 5 years
  (2026-08-16).** New art generated by Adrian; spec and the 38→26 prompt brief
  are in `docs/STREAK-ART-SPEC.md`. `sw.js` v61 → **v62**.
  - **Every icon is now square, 256×256, transparent.** The old set was 160px
    tall with widths from 134 to 354 (aspect 0.84–2.21), which is why the three
    CSS rules used `height: Npx; width: auto`. They now set **both** width and
    height: `.streak-icon-img` (20px, 28px on `.tier-up`), `.streak-tier-row img`
    (34px), `.streak-now-icon` and `.kael-quote-streak` (64px).
  - **`streaks/` went from 2.5 MB to 488 KB** — 17 KB average, 23.5 KB largest.
    Still not precached in `sw.js` `ASSETS`, exactly as before; and note
    `CACHE_FIRST` does **not** match `/streaks/`. The version bump is what
    clears the old art, via the `activate` handler's cache sweep.
  - **`STREAK_TIERS` in `js/app.js` was rewritten**: 26 rungs, 1 day → 1800
    days, icons `flame1-6`, `pawn1-6`, `knight1-4`, `bishop1-4`, `rook1-3`,
    `queen1-3`. The 12 retired names (`pawn7-9`, `knight5-8`, `bishop5`,
    `rook4-5`, `queen4-5`) are gone from disk and unreferenced.
  - **No storage key was touched.** The icon name is never persisted — only
    `streakCount`, `streakLastDate` and `bestStreak` are. **`js/badges.js` has
    its own, completely unrelated `STREAK_TIERS`** (7/30/90/180/270/365/730/
    1825/3650 days) whose `streak_<days>` and `daily_<days>` ids **are** storage
    in `earnedBadges`. Two constants, same name, different files. **Do not merge
    them** — rewriting one must never touch the other.
  - This also settles one of the open naming questions below: the year rungs now
    read "1 year / 2 years / … / 5 years" instead of "12 months / 240 months".
  - Verified over CDP at 375px in light and dark: all 26 load, none broken, all
    square at 256×256, boxes exactly 20/34/64, ladder order correct, zero page
    errors — in all three places the art appears (header badge, Profile "Streak
    progress" card, Kael tier-up popup).
  - The source JPEGs live in `C:\Users\Adrian\StreakArt\`, deliberately outside
    the repo. The conversion (black backdrop → alpha, align, 256px, quantise)
    is `docs/STREAK-ART-SPEC.md` §3; if the set is ever extended, the two traps
    are a flood fill leaking through glow that reaches the canvas edge, and a
    dark navy piece linked to the edge by a thin dark channel.

- **Friend search is now a PREFIX search (2026-08-16).** Typing `Zug` finds
  `Zugzwang`. `searchByUsername()` in `js/firebase.js` uses
  `where('usernameLower','>=',needle)` + `where('usernameLower','<',needle +
  '\uf8ff')`, `limit(5)` unchanged, and a new exported `SEARCH_MIN_CHARS = 2`
  refuses one-letter searches. `sw.js` v60 → **v61**.
  - **No composite index was needed and none was added.** Both bounds are on the
    same field, so the automatic single-field index serves it. This was
    **confirmed against production over the Firestore REST API**, not assumed:
    `zug` → HTTP 200, one row (Zugzwang), no index error.
    `firestore.indexes.json` is untouched.
  - **The "exact match is deliberate" note in the plan's Commit 3 section is
    superseded** and now says so at the top. Its anti-enumeration reasoning was
    wrong: `/leaderboard` is world-readable and `fetchLeaderboard()` already
    returns 200 whole rows to anyone, so prefix search leaks nothing new.
  - **Under 2 characters is not a search, so "No player found" does not
    appear** — `Friends.searched` stays false. The standing hint under the box
    (`friends_search_hint`) was rewritten from "You need their exact username."
    to "Type at least 2 letters of their username." **The "2" is hard-coded in
    that string; if `SEARCH_MIN_CHARS` changes, change both languages with it.**
  - **The five results are the alphabetically first five.** Someone with a very
    common prefix has to be typed out further. `limit(5)` was kept deliberately.
  - **The real query still has never run from this machine** — App Check blocks
    the localhost client from Firestore entirely. It was proved over REST
    instead. The gate, the row rendering and the no-match logic were verified in
    the browser at 375px.

- **Friends system — commit 1 of 9 is done (2026-08-15). Rules only, no
  feature code.** The plan is
  `docs/superpowers/plans/2026-08-14-friends-system.md`; read its "What
  actually happened" note before writing any Friends code.
  - `firestore.rules` now covers `friendships`, `friendRequests` and
    `blocks/{uid}/blocked/{other}`, and `usernameLower` was added to the
    `leaderboard` write allowlist so commit 3 needs no second rules change.
  - `tests/rules/friends.test.js` — 56 new tests. **`npm run test:rules` is at
    86 passing**, every allow and every deny.
  - **Deployed 2026-08-15** and checked — the leaderboard still loads. Live
    rules and `firestore.rules` match, so commits 3–7 need no further rules
    work. Edit the file and deploy, never the console.
  - `sw.js` deliberately not bumped — nothing the browser loads changed.

- **Friends system — commit 2 of 9 is done (2026-08-15, `1831639`). Screens
  only, no Firestore.** New `js/friends.js`, `#screen-friends` (Friends /
  Requests / Find), `#screen-friends-leaderboard`, the two-up button row on
  Profile, an inert `➕ Add friend` on the public profile, and 32 new bilingual
  strings. `sw.js` v53 → **v54**.
  - **`js/friends.js` ships with `sample: true` and six invented players.**
    That is how the screens were judged. **Commit 3 deletes `SAMPLE` and the
    flag** and puts the real search behind them.
  - Read the "Commit 2 — DONE" note in the plan before commit 3: rows with
    action buttons stack them on a second line on purpose, and the new
    leaderboard clips its own watermark while `#screen-leaderboard` still
    does not.
  - Committed on local `main`, **not pushed**.

- **Friends system — commit 3 of 9 is done (2026-08-15). Search and send.**
  `SAMPLE` and the `sample` flag are **deleted** — no invented players can
  reach the site. `usernameLower` is now published inside
  `updatePublicLeaderboardDoc`, and `js/firebase.js` gained
  `searchByUsername()` and `sendFriendRequest()`. The Find tab does a
  case-insensitive username match against `/leaderboard` (**exact when this was
  written; a prefix match since 2026-08-16 — see the top entry**) and writes
  `friendRequests/{from_to}` with exactly four fields. `sw.js` v54 → **v55**.
  `firestore.rules` untouched; one new test, **87 passing**.
  - **Every send outcome shows the same `Solicitud enviada ✓` toast** —
    created, already asked, blocked or offline. That is the block-privacy
    guarantee, not an oversight. Do not "fix" it into a real error message.
  - **Nobody is findable until their public doc is rewritten with
    `usernameLower`,** which happens on their next sign-in. Confirmed over the
    REST API: today no `/leaderboard` document has the field, and the query
    itself runs server-side with no index error.
  - ~~**Owed: the two-account run.**~~ **DONE 2026-08-16 — see the top entry.**
    Search and send are verified against production. The line above about no
    `/leaderboard` document having `usernameLower` is also stale: two now do.
- **Friends system — commit 4 of 9 is done (2026-08-15). Requests go live.**
  `js/firebase.js` gained six exports — `fetchIncomingRequests()`,
  `fetchOutgoingRequests()`, `fetchLeaderboardByUids()`,
  `acceptFriendRequest()`, `rejectFriendRequest()`, `cancelFriendRequest()` —
  and the Requests tab now renders real rows with working buttons. The gold
  pill on the Profile Friends button shows the real incoming count.
  `sw.js` v55 → **v56**. `firestore.rules` untouched, nothing deployed, still
  **87 tests passing**.
  - **Two composite indexes must be created before either query can run.** They
    are written out in the "Commit 4" section of the plan. This session could
    not sign in, so the auto-generated console links do not exist yet — create
    them by hand from the table, or open Requests once on the real site and
    click the link Firestore prints.
  - **`fetchLeaderboardByUids()` landed early**, in commit 4 rather than 5,
    because request rows need names and avatars too. Commit 5 must reuse it.
  - **The outgoing list has no status filter on purpose** — a rejected request
    must look exactly like a pending one to whoever sent it.
  - ~~**Owed: the two-account run.**~~ **PARTLY DONE 2026-08-16 — see the top
    entry.** `acceptFriendRequest()` has run against production and the
    friendship document exists. `rejectFriendRequest()` and
    `cancelFriendRequest()` still have never executed.

- **Friends system — commit 5 of 9 is done (2026-08-15). The Friends list.**
  One new export, `fetchFriendUids()`, does
  `where('members','array-contains',me)` on `friendships` and returns the other
  member of each pair. `fetchLeaderboardByUids()` was **reused** from commit 4
  for names, avatars and puzzle ELO. `sw.js` v57 → **v58**. `firestore.rules`
  untouched, nothing deployed, still **87 tests passing**.
  - **No index is needed for this query.** `array-contains` on its own is served
    by the automatic single-field index, and there is deliberately no `orderBy`
    — the list is sorted by name in JavaScript instead.
  - **`PublicProfile.open(entry, backTo = 'leaderboard')`.** A friend row passes
    `'friends'`; the leaderboard's call site was not touched and gets the
    default. `PublicProfile.init` now reads `this.backTo` at click time.
  - **The friends list is lazy** — `Auth.onChange` only invalidates it, it
    refetches when the tab opens. Loading at boot would be up to 100 document
    reads for someone who never opens Friends.
  - **The 100-friend cap awaits the list before deciding.** At the cap the
    button comes back and the uid is not marked spent. The cap toast is about
    *my* list, so it does not break the neutral-toast rule for blocks.
  - ~~**Owed, still: the two-account run.**~~ **DONE 2026-08-16 — see the top
    entry.** The `array-contains` query has run against production and the
    Friends list rendered a real friend. The two composite indexes are
    created and deployed.

- **Friends system — commit 6 of 9 is done (2026-08-15). The friends
  leaderboard.** `#screen-friends-leaderboard` now builds real rows from
  `Friends.friends` — **no new query and no new export in `js/firebase.js`**.
  `rankTier` was exported from `js/leaderboard.js` and reused, along with the
  `.lb-row` markup, so the two boards stay one thing. `sw.js` v58 → **v59**.
  `firestore.rules` untouched, nothing deployed.
  - **My own row is on the board, ringed** (`.lb-me`, a 2px `--accent` inset
    ring that beats `.tier-podium`'s gold one). `loadFriends()` fetches my own
    public document in the same batch as the friends' and parks it on
    `Friends.me`. **`me` is not in `Friends.friends`** — the Friends list is
    unchanged.
  - **A stale month reads as no score, it does not remove the row.** The global
    board drops rows whose `rushMonthKey` is not this month; this one shows the
    fallback instead, because a friend vanishing from a five-person board looks
    broken. Deliberate difference — do not "align" it without asking.
  - **`#leaderboard-period` has a bug this commit only fixed on its own
    screen**: leaving a Rush board for an ELO board resets `season` but leaves
    the switch lit on "This month". `#flb-period` now moves back with it;
    `#leaderboard-period` still does not.
  - ~~**Owed, still: the two-account run.**~~ **DONE 2026-08-16 — see the top
    entry.** The board was opened on the live site with a real friend: two
    rows, my own ringed, all four category tabs. **Not covered:** the 30+
    friend chunk boundary — Adrian has one friend.

- **Friends system — commit 7 of 9 is done (2026-08-15). Add, unfriend,
  block.** `js/firebase.js` gained four exports — `unfriend()`, `blockUser()`,
  `unblockUser()`, `fetchBlockedUids()`. `➕ Add friend` on a public profile is
  live in all four states, `⋯` on a friends row opens Remove friend / Block, and
  a new `#screen-friends-blocked` lists the people you have blocked with
  Unblock. `sw.js` v59 → **v60**. `firestore.rules` untouched, nothing
  deployed, still **87 tests passing**.
  - **No "are we friends" query was added.** The ➕ button's four states are
    facts about *my* lists, so they are read from `Friends.friends`,
    `Friends.outgoing` and `Friends.sent` — opening a public profile costs no
    new document read. A `get()` on a `friendships` document that does not
    exist is itself a permission error, so the obvious implementation would
    have thrown on every stranger.
  - **Blocking rejects their pending request instead of deleting it.** Deleting
    would make their outgoing row vanish, which they could correlate with being
    blocked; `'rejected'` leaves it reading "Request sent" forever. A request I
    sent *them* is deleted — that is just cancelling my own. The block document
    is written **first** and is the only step whose failure is reported.
  - **`PublicProfile.onOpen` is a hook, not an import** — `js/friends.js`
    already imports `js/leaderboard.js`, and it is awaited before
    `showScreen()`, which is what "resolved before the screen renders" means.
  - **One new string**, `friends_blocked_empty`. Everything else existed.
  - ~~**Owed, still: the two-account run.**~~ **MOSTLY DONE 2026-08-16 — see
    the top entry.** `blockUser()`, `unblockUser()` and `fetchBlockedUids()`
    have all executed against production, in a **one-account** run: blocking
    is a write by my own account, so it needed nobody else signed in.
    **`unfriend()` itself still has never been called** — but `blockUser()`
    runs the identical delete on the identical friendship document under the
    identical rule, and that delete was watched succeeding. **The blocked
    sender's side is still untested** and needs a second account.
- **Friends system — commit 8 of 9 is done (2026-08-15, `c3b1e4f`). Comment
  only.** The note above `VISIBILITY_SECTIONS` in `js/leaderboard.js` used to
  claim a `friends` level could be added by adding a line to that table. It
  cannot — `/leaderboard/{uid}` is world-readable, so the table only decides
  what the screen draws and the real boundary is `updatePublicLeaderboardDoc()`
  in `js/firebase.js`, which always publishes `PUBLIC_ALWAYS_KEYS` and
  **deletes** `PUBLIC_DETAIL_KEYS` while the profile is private. The new
  comment points at "Future options" item 1 in the plan.
  - **No code line changed and `sw.js` stays at v60** — nothing a user can see
    is different, and a bump would make every returning user redownload the
    app for nothing. Same reasoning commit 1 used.
  - ~~**Owed, still: the two-account run.**~~ **Settled 2026-08-16 — see the
    top entry.** The two composite indexes are created and deployed.
  - ~~**Next task: commit 9 — unique usernames.**~~ **NOT DOING**, decided
    2026-08-16. The reasoning is in the top entry and in full in the plan's
    commit 9 section. Do not re-cost it.


- **👣 Walk through is now on the Endings studies too (2026-08-15).** Adrian
  asked for it after saying he did not like the existing rated practice either.
  Same mode, all 265 studies, over each study's own `moves` line with its
  `comment` as the legend. **No endgame data changed.**
  - **It is now ONE implementation — `createWalker(cfg)` in `js/app.js`.** Basic
    Checkmates was rewritten onto it and re-verified against the same tests it
    passed the day before, with identical output. **Do not fork it again**: the
    two screens are supposed to feel the same, and two copies would drift. A
    screen supplies element ids plus `onStart` / `onFinish`.
  - **The player does not always move first.** In a `result: 'loss'` study the
    player takes the winning side, so the book plays the losing move first (19
    of 265). `playerFirst()` decides whether the player's plies are the even or
    the odd indices; `step()` auto-plays anything that is not theirs.
  - **It cannot move `endgameElo`.** It runs while `Endgame.mode` is still
    `'study'`, and its branch in `userMove` sits **above** the
    `mode !== 'practice'` guard, so `finishPractice` — the only writer of the
    rating — is unreachable. Asserted byte-identical with a seeded rating.
  - **It does credit the streak**, like the Checkmates one. That is looser than
    the documented endgame trigger ("an endgame must be converted"), because
    👁 Show me can walk the whole line for you. Deliberate, for consistency
    with the mode Adrian already approved — **say so if you want it removed**;
    it is one line in `createWalker.finish()`.
  - `sw.js` → **v57** (v56 was taken by Friends commit 4 mid-session).

- **Learn tab — 👣 Walk through, a guided move-by-move mode (2026-08-14).**
  Shows the next move of the lesson's line as an arrow, clears it, then asks the
  player to play that same move. Correct → the opponent's scripted reply plays
  itself and the next move is shown. On to the end of the line.
  - **Live on all five Basic Checkmates.** The Rules lessons have no `demo`, so
    the button never appears there, and their code path is unchanged.
  - **No new lesson data.** It runs off `demo.moves`, which already existed. A
    legal move list always alternates and all five mates start with White, so
    "is this my move?" is just `walkIdx % 2 === 0`. `js/learning-data.js` was
    not touched.
  - **Legend, not per-move text — Adrian's call.** `lesson.text` stays under the
    board the whole way as the standing plan. The honest limitation: a fixed
    legend cannot explain move 12. Per-move notes were costed at 270 bilingual
    strings of generated chess commentary and deliberately not written. **The
    upgrade path needs no rework** — add an optional
    `lesson.walk = { notes: [...] }` indexed against `demo.moves`.
  - Wrong move: unlimited retries, no lockout; the arrow comes back by itself on
    the second miss. `👁 Show me` plays the move for you, `◀` steps back one of
    your moves and re-shows it. Reuses `learn-practice-status`, the existing
    correct/wrong sounds and `.shake` — nothing new was invented.
  - **`walkBusy` is load-bearing.** Both nav buttons are dead from a move being
    played until the next is shown. Without it, pressing 👁 Show me inside the
    600 ms reply gap plays the opponent's move as yours and flips the mode onto
    the wrong side for the rest of the line. The invariant: **when the mode is
    waiting on you, `walkIdx` is even.**
  - **Writes no rating** — not `puzzleElo`, `endgameElo`, `openingElo`,
    `blindfoldElo`, nor the radar; asserted byte-identical in the browser. It
    **does** credit the streak on finishing a line (`Streak.recordActivity()`),
    approved by Adrian. That is a new streak trigger — if the rules list on
    Profile is revised, revise it with this.
  - One pre-existing bug fixed on the way: `engineReply()` handed the board back
    unconditionally in its `finally`, so a late engine move could re-enable it
    after the player had left the lesson. Now guarded on `this.practicing`.
  - Design: `docs/superpowers/specs/2026-08-14-learn-walkthrough-design.md`.
    `sw.js` v52 → **v53**. **Committed on local `main`, not pushed.**

- **Streak rules rewritten — what counts as "using the app today" (2026-08-14).**
  Adrian picked "any one activity, but the bar goes up" over tying the flame to
  the daily missions. **The two counters stay separate on purpose**: 🔥 = you
  turned up, 🎯 = you did the full workout. Do not merge them without asking.
  - **Boards need 10 moves of your own** (`STREAK_MIN_MOVES`, shared helper
    `noteStreakMove`): Play, Openings, Analysis. It fires **on the tenth move,
    not at `finish()`** — a long game you walk away from used to bank nothing.
  - **Everywhere else you have to succeed**: solve the puzzle (a wrong answer
    used to count), Puzzle Rush needs 3+ solved, an endgame must be converted.
    Blindfold already required a solve.
  - **Two new triggers**: Analysis (any engine line, or 10 moves) and Learn
    lessons that have a practice section. Databases and Profile never count.
  - **Both streak bugs fixed.** `todayStr()` is now the local calendar day, not
    `toISOString()` — the day used to roll over at 7pm in Panama. And a broken
    streak now writes its 0 to `streakCount`; it used to live in memory only,
    so the stale number kept syncing to the public profile. `bestStreak` is
    deliberately untouched by both. `monthStr()` is **still UTC** — it is the
    leaderboard season key and changing it would move season boundaries.
  - The rules are explained in the app, under the streak ladder on Profile
    (`Profile.streakHowHtml`, `streak_how_*` in `js/i18n.js`, `.streak-how-*`
    in `css/style.css`). **If a trigger changes, that list changes with it.**
  - Verified over CDP at 375px in light and dark, both languages: 9 moves bank
    nothing and the 10th banks the day; a dead streak writes 0 while
    `bestStreak` survives; and at 21:30 Panama on the 14th (UTC already the
    15th) a streak from the 13th still reads 7 instead of being wiped.

- **Game History (Stockfish games) — COMPLETE, all 4 tasks.** Every game you
  play against the engine is saved automatically and can be browsed, filtered
  and replayed. Reach it from **Play → 📜 Game History**.
  - New module **`js/history.js`** — record building, the history screen, and
    replay. New IndexedDB store `playHistory` (DB v2 → **v3**).
  - Replay opens the normal Analysis board with a `historyId` context, so the
    tab bar stays lit on Play and there is a back / prev / next bar plus a
    one-line headline. `⋯ → 👁 View PGN` shows the game text; games can be
    exported or deleted from the card long-press or from `⋯`.
  - Plan: `docs/superpowers/plans/2026-08-07-stockfish-game-history.md`.
    Commits `a8705f7`, `9a90522`, `d302722`, `a86947e`.
  - **`js/app.js` now exports things.** It used to export nothing. `toast`,
    `modal`, `askConfirm`, `sheet`, `segInit`, `segValue`, `sharePgnText` and
    `Analysis` are exported so `js/history.js` can import them instead of
    copying them. app.js and history.js import each other — the cycle is
    deliberate and safe, but `js/history.js` must never touch an app.js
    binding at module top level. See "The module boundary" in the plan.
  - Deliberately left out: resuming an unfinished game, board thumbnails,
    clocks, cloud sync. The record shape already supports all four.

- **Play tab level picker — robot cards.** The eight engine levels are now a
  2-column grid of cards on the Play tab: the existing
  `icons/badges/beat_engine_N.png` robot, the level name, and the strength
  range it covers (Beginner 1300-1450 … Maximum 2800+).
  - `LEVELS` in `js/engine.js` gained a **display-only `range`** field. `elo`,
    `movetime` and the persisted level index are untouched.
  - `buildLevelSeg(el, def, rich)` — only the two Play call sites pass `rich`,
    so **the Trainer tab keeps the compact `3·Casual` strip**. If you ever
    make Trainer rich too, its setup screen gets much taller.
  - New `.lvgrid` block in `css/style.css`, reusing `--panel2`, `--gold`,
    `--gold-bg`, `--muted`, `--radius`. No new strings were needed: the names
    already come from `level_names`, and the ranges are just numbers.
  - Honest caveat Adrian accepted: **1320 is Stockfish's `UCI_Elo` floor**, so
    the level labelled "Beginner" cannot actually be made weaker than a decent
    club player. The ranges are presented as-is anyway.
  - Commit `ca9e87a`.

- **`sw.js` is at `chess-training-center-v30`.** The `v11` written here
  earlier was stale for a long time — trust the file, not this note, and bump
  it whenever `index.html`, any `js/*.js` or `css/style.css` changes, or
  returning users get served stale files.
  - `icons/badges/beat_engine_0..7.png` are now precached in `ASSETS`, because
    they render on a core screen. The rest of `icons/badges/` is not — it is
    only cached after first fetch by the `CACHE_FIRST` handler.

**`refactor/split-app-js` is merged into `main` and deployed** (merge
`0e46dff`). Both the module split and the robot cards are live.

- **Work order #1 — both Sentry errors.** One was a real null-dereference:
  tapping the Openings board before pressing Start crashed the app. The other
  (`myUndefinedFunction`) came from a browser extension, not this codebase; the
  crash guard and Sentry now ignore extension-attributed errors.
- **#4 — trash button removed** from Board Setup (13 → 12 buttons).
- **#5 — board scrolling fixed.** `.board` had `touch-action: none`, so the
  board swallowed every gesture. Now `pan-y`.
- **#9 — "Jaques mate" → "Jaque mates"** in the Spanish Learn tab.
- **Kael's corner no longer swallows taps** (commit `242dc7f`) — he is quieter,
  hides off-screen when silent, and the bubble is see-through. This was the
  urgent touchscreen bug; it is FIXED.
- Endgame tab: 265 endgames, bilingual, live.

## Still to do

### English copy review — COMPLETE (2026-08-08). All ten batches done.

Every English string in the app now reads like a native speaker who knows chess.
`docs/STYLE-EN.md` is the rulebook and `docs/EN-REVIEW-PLAN.md` is the full
record — every batch, every decision Adrian made, and everything deliberately
left alone. **Read both before touching any English text again.**

**Nothing has been pushed.** 24 commits sit on local `main`, from the style guide
through batch 10 and its follow-up, plus one unrelated crash fix (`58e8e09`).
`sw.js` is at **v49**. Push straight to `main` — the commits are already linear
there, individually revertable, and every batch was verified in a real browser at
375px before it landed. Check the live site after the *deploy* finishes, not
after the push.

#### What the review left behind — four items, all deliberate

These are recorded, not pending. None of them is a copy problem, which is why no
batch fixed them.

1. ~~**The plural bug — "1 games".**~~ **FIXED 2026-08-08, `sw.js` v47 → v48.**
   `tn(key, n)` in `js/i18n.js` picks between `key` (plural) and a new `key_one`
   (singular) and does the `{n}` substitution, so `adv_matches` no longer needs
   `.replace('{n}', …)` at its call site. Two forms only — English and Spanish
   split at exactly one for these nouns, so `Intl.PluralRules` was not needed.
   Five new keys (`games_one` *partida*, `imported_one` *partida importada ✓*,
   `history_moves_one` *jugada*, `adv_matches_one` *{n} partida encontrada*,
   `lessons_count_one` *lección*); no key was renamed. Ten call sites converted:
   `js/app.js` 254, 1519, 2097, 2130, 2298, 2886, 4332, 4338, 4359 and
   `js/history.js:247`. **`history_moves_one` and `lessons_count_one` are
   defensive and cannot be reached at 1** — `HISTORY_MIN_PLIES` rejects games
   that short, and both lesson categories have many lessons. Verified over CDP
   at 375px in light and dark, in both languages: the import toast, the
   advanced-search chip, the Databases list, the save-to-database sheet, the
   Openings book select and the Learn counts, each at n=1 and n=2+.
2. ~~**The Spanish repair list — 20 items.**~~ **DONE 2026-08-08 in its own
   session, `sw.js` v48 → v49.** 18 of 20 fixed across four commits (`14b33c0`
   factual, `6fc00a8` the *motor* sweep, `850d7cd` the Puzzles naming decision,
   `3a6b28d` the rest). The three factual errors are gone — h1 is now *clara*,
   p6 says *se defienden solos*, and r10/r11/r12 say *Torre contra dos peones* —
   each verified against the entry's own FEN first. Adrian's two calls: the
   Puzzles feature is **Puzzles** in Spanish everywhere (six sites, including
   `tab_puzzles`, which the list had missed), and `log_rating` is **`ELO {n}`**.
   No `en:` value was touched, the DICT key count is 530 before and after, and
   `history_bot_name` stayed frozen. **Two items were deliberately left alone**,
   with the reason recorded in place in `docs/EN-REVIEW-PLAN.md`: item 8 (badge
   voice — the English has the identical mixed voice, so fixing only Spanish
   would create a new mismatch) and one bullet of item 17 (the `…` → `...`
   sweep — `…` is correct Spanish typography and STYLE-EN §3 governs English
   only). Both are one-liners if Adrian ever wants them.
3. **Three layout bugs no copy edit can fix.** Worst: the endgame study title bar
   has about **206px** of room and **173 of the 265 names are longer**, so they
   truncate — even `An Example from New York, 1924` gets cut. Also: the puzzle
   radar clips its longest theme labels ("Discovered atta"), and the Leaderboard's
   decorative watermark pushes `document.scrollWidth` to 405. **Shortening the
   words would not fix any of the three** — it would only move the cut.
4. **Four naming questions and six dead strings.** The naming calls are Adrian's:
   the `Opening Explorer` badge sharing a name with the Analysis panel;
   `Daily Mission` vs `Daily Missions`; `STREAK_TIERS` counting to `240 months`
   where English says 20 years; and "icon" vs "avatar", where the two buttons say
   icon and everything else says avatar. The dead strings (`no_bases_yet`,
   `rush_open`, `rush_result_title`, `rush_wrong_end`, `game_review_move`,
   `game_review_accuracy`) are defined but never rendered — removing a key is a
   code change, and they cost nothing. **Leave all of these as they are** unless
   Adrian raises one.

**`HANDOFFS.md` is stale — tasks A–D in it are all done.** Ignore the table
below and the prompts in that file until someone rewrites them.

One conversation each:

| | Task | Work order items |
|---|---|---|
| **A** | Artwork integration | #2 — *blocked on 2 questions* |
| **B** | Learn reorganisation + tab reorder | #8 + #12 — must ship together |
| **C** | Swipe nav + Opening Explorer variations | #10 + #11 |
| **D** | Button work | #3, #6, #7 |

Lower priority, not in the work order:
1. ~~Export Firestore security rules to `firestore.rules`~~ — **was already
   done and this note was stale.** `firestore.rules` has been committed and
   maintained since `aaa51b0`. Verify a claim like this with `git ls-files`
   before acting on it.
2. ~~Test the Firestore WRITE rules.~~ **DONE 2026-08-14.** 30 rules tests now
   run against the local Firestore emulator — `npm run test:rules`, no network,
   no production data touched. They cover both existing collections: who may
   read/write `/users`, and for the world-readable `/leaderboard`, the field
   allowlist (real name, email and date of birth are all rejected), the
   private-profile guarantee, forged and out-of-range scores, and oversized
   text. Tests live in `tests/rules/`. `package.json` is dev tooling only —
   **the app still has no build step and loads nothing from `node_modules`.**
   Needs Java 11+; `npm run test:rules` finds the JDK itself.
   - **The deployed console rules were diffed against `firestore.rules` on
     2026-08-14: identical, character for character.** No drift. The file is
     the truth, the tests test what is actually running, and
     `npm run rules:deploy` is currently a no-op. Re-diff after any console
     edit — and from now on edit the file and deploy, never the console.
   - The suspected discrepancy turned out to be a **stale comment, not a rules
     problem**: `js/firebase.js` claimed leaderboard deletes were
     permission-denied, which stopped being true when the delete rule landed in
     `fa39468`. Comment corrected; the tolerant error handling around it was
     left alone on purpose.
3. Restrict the Firebase web API key by HTTP referrer in Google Cloud Console.
4. ~~Puzzle difficulty does not scale with ELO~~ — **NOT A BUG ANY MORE. Fixed
   on 31 Jul in `7bfc92e`; verified empirically 7 Aug, no code changed.** The
   old cause was that puzzle bands were fetched once at startup, so a rating
   that climbed during a session kept drawing from the band it started in.
   `nextPuzzle()` now calls `ensureForRating(target)` every puzzle
   (`js/app.js:3514`). Measured by seeding `puzzleElo` 2050 with the
   calibration window spent, then reading the rating the status line prints:
   Normal served avg **2065** (1999–2122), Harder (+500) served avg **2494**
   (2457–2549). Theme filters cannot starve it either — the rarest motif
   (`doubleBishopMate`) still has 17 puzzles within ±100 of 2050, so the
   ±100→±1200 widening never fires. If this is ever reported again, suspect a
   **stale service-worker cache** first: the number in parentheses under the
   board is the puzzle's own rating, so it is checkable on the device in two
   seconds. Do not "fix" the picker, the K-factor or `DIFFICULTY_LEVELS` —
   fast calibration (K=192 for the first 10 attempts, `js/app.js:3409`) is
   already there too.
5. **Dead write: `userLevel`.** Kael's onboarding asks the player's strength
   and shows real ELO ranges on the cards (Expert is labelled "ELO 1901-2300"),
   then saves the answer as `userLevel` (`js/app.js:498`) — and nothing in
   `js/` ever reads it. So a strong new player tells the app they are 2000 and
   still starts at `puzzleElo` 1200. The fix is to seed `puzzleElo` from the
   chosen tier at first run only. Adrian was told and chose to leave it for
   now; it does nothing for him (he is past onboarding and already rated
   correctly), it only helps new strong users. **Must stay first-run only —
   never rewrite an existing user's stored `puzzleElo`.**
6. History dates older than yesterday show the month in the *device's*
   language, not the app's — `formatWhen()` in `js/history.js` calls
   `toLocaleDateString(undefined, …)`. In Spanish on an English phone you get
   "Aug 5 13:16". Passing `getLang()` instead of `undefined` fixes it. Cosmetic
   and pre-existing to Task 2; not fixed because it was outside Task 4.
7. New "Read" tab — PDF reader, brief in `READ-TAB-PROMPT.md`. Later.
8. **Repo is 137 MB, and 138 MB of the working tree is
   `avatars/CTC new arts/`** — the full-size source PNGs, several over 3 MB
   (`frame-obsidian.png` 3.6 MB, `flamegold.png` 3.2 MB). Nothing loads them at
   runtime, but GitHub Pages serves this repo, so every one is publicly
   downloadable at the site root, and git history is permanent. This is the
   opposite of the `.gitignore` policy that keeps `icons/Streak Flames/` out.
   Deciding what to do needs Adrian: leaving it is harmless day to day, and the
   only real fix (history rewrite, or moving the sources out of the repo) is
   disruptive. **Ask before touching this — do not rewrite history unprompted.**

## Token rules — paste these into every new chess session

```
Working on C:\Users\Adrian\chess-app. Read HANDOVER.md first.
- js/app.js is 235 KB (~57,000 tokens). NEVER read it whole. Grep for the
  symbol, then read with offset/limit. Check the small modules first —
  Sound, Themes, ColorMode, Avatars, Badges, Leaderboard and PublicProfile
  are no longer in app.js.
- Never read puzzles/*.json (5.1 MB) or graphify-out/graph.json (292 KB).
  Read graphify-out/GRAPH_REPORT.md instead — it is 8 KB.
- js/endgames-data.js (212 KB) is data. Grep only.
- One task per conversation. Tell me to /clear when this one is finished.
```

## Structural debt — splitting js/app.js (IN PROGRESS)

The dedicated session happened on 2026-08-07. **`js/app.js` went from 255 KB to
235 KB (~8%).** Five modules are out, each its own commit, each verified in a
real browser before the next one started. Branch `refactor/split-app-js`.

This was a **pure refactor**: every block was moved verbatim. No behaviour, no
visuals, no storage keys changed.

### New file layout

| File | Holds | Size |
|---|---|---|
| `js/sound.js` | `Sound` | 0.7 KB |
| `js/appearance.js` | `Themes`, `ColorMode` | 2.0 KB |
| `js/avatars.js` | `AVATAR_OPTIONS`, `avatarHtml()`, `Avatars` | 2.6 KB |
| `js/badges.js` | `BADGE_DEFS`, `badgeLabel()`, `Badges` | 7.9 KB |
| `js/leaderboard.js` | `LEADERBOARD_FIELDS`, `rankTier()`, `Leaderboard`, `VISIBILITY_SECTIONS`, `canSee()`, `withLocalDetail()`, `PublicProfile` | 9.0 KB |
| `js/engine.js` | gained `LEVELS` (was in app.js) | — |

### How the split works — read this before extracting the next one

`js/app.js` is still the entry module and now exports 18 things: `$`, `toast`,
`modal`, `askConfirm`, `sheet`, `esc`, `segInit`, `segValue`, `showScreen`,
`monthStr`, `radarThemes`, `sharePgnText`, `activeScreen`, `RADAR_MIN`,
`KaelQuotes`, `Analysis`, `Setup`, `Profile`.

Child modules import those back from app.js, so app.js and every child form an
import cycle. **The cycle is safe only while the child never touches an app.js
binding at module top level** — inside methods and event handlers is fine,
because both modules have finished evaluating by then. A
`Cannot access '...' before initialization` error means exactly that mistake.

`LEVELS` moving to `js/engine.js` is the worked example. `BADGE_DEFS` is built
at module top level and maps over `LEVELS`, so reading it from app.js across
the cycle would have crashed the app. Anything a child needs **at top level**
must live in a module that does not import app.js back.

`activeScreen` is an exported `let`. ES module bindings are live, so children
see `showScreen()` reassign it. Do not copy it into a local variable.

### Still in js/app.js — 18 of the 23 objects

`Onboarding 439`, `KaelQuotes 513`, `Streak 814`, `DailyMissions 912`,
`Analysis 1212`, `Base 1852`, `Play 2310`, `GameReview 2593`, `Trainer 2702`,
`PuzzleLog 3092`, `Puzzles 3198`, `Rush 3681`, `Blind 3948`, `Endgame 4240`,
`Setup 4888`, `Profile 5212`. (Line numbers as of this commit.)

Next best candidates, in order: `PuzzleLog` and `GameReview` (both fairly
self-contained), then `Streak` + `DailyMissions` together, then `Onboarding`.
`Analysis`, `Play`, `Puzzles` and `Endgame` are the big ones and are heavily
cross-wired — leave those until last.

### The rules that made this safe (keep following them)

1. One module per commit. Verify before starting the next.
2. Move code **verbatim**. Do not tidy it on the way out.
3. Every new `js/*.js` goes in the `ASSETS` array in `sw.js` **and** the cache
   version gets bumped. `sw.js` is now at **`chess-training-center-v30`**.
4. Never rename a storage key: `'endgame'`, `puzzleElo`, `endgameElo`,
   `openingElo`, `blindfoldElo`, `earnedBadges`, avatar ids, badge ids, and
   the `LEVELS` index (persisted in `engineLevelsBeaten`).

### How this was verified

There is no test framework, so verification means driving the real app. The
Claude browser pane still will not composite, so a small CDP driver against
headless Chrome was used instead (scripts in the session scratchpad;
`~/.claude/launch.json` entry `chess-app46`, port 9159). After each extraction:
boot with zero new console errors, all 7 tabs open, Play → start → 64 squares
and 32 pieces, Game History → card renders → replay opens Analysis with the
tab bar still lit on Play, Profile radar + 64 trophy cells, 375px in light and
dark, and an offline reload with the network cut.

**Observed, not fixed** (out of scope for a pure refactor):
- `js/learning-data.js`, `js/quotes-data.js`, `js/legal-data.js` and
  `js/openings-eco.js` are imported by app.js but are **not** in the `sw.js`
  `ASSETS` array. Offline still works because the network-first handler caches
  them after the first load, but a user whose very first launch goes offline
  mid-install would not have them precached. Pre-existing, unrelated to the
  split.
- The only console error during every run is a `403` from
  `content-firebaseappcheck.googleapis.com`. It is App Check rejecting an
  unregistered origin (`127.0.0.1:9159`) and appears identically before and
  after the refactor.

## Housekeeping

Nothing outstanding. `avatars/CTC new arts/` and `tools/` **are** committed —
the old note here claimed otherwise and was wrong for a long time. Verify a
claim like that with `git ls-files <path>` before repeating it.
