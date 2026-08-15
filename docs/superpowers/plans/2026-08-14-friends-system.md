# Friends system — plan

Written 2026-08-14. **Nothing here is built yet.** Adrian must approve before any
feature code is written.

Everything below is designed to be shipped one commit at a time, each one
verifiable in a real browser before the next starts, in the style that worked for
the Game History and app.js-split sessions.

---

## What we are building, in one paragraph

A player can look up another player by their exact username, send a friend
request, and see their incoming and outgoing requests. The other player accepts
or rejects. Accepted friends appear in a Friends list and in a friends-only
leaderboard that uses the same four categories as the global one. A player can
unfriend or block. The friendship itself is stored as a single small document per
pair so that a later feature — a shared "Masterclass" base — can list "my
friends" with one query and no new storage.

---

## The data model

### `friendships/{pairId}`

```
friendships/aaa111_zzz999
  members:   ['aaa111', 'zzz999']    // exactly 2, sorted ascending
  createdAt: 1755000000000           // Date.now()
```

`pairId` is the two uids sorted and joined with `_`. One friendship = one
document. There is no per-user copy to keep in sync and no half-accepted state.

**List my friends:**
`where('members', 'array-contains', myUid)` — one query, no index beyond the
automatic array index. This is the query the Masterclass sharing feature will
reuse verbatim. It is the whole reason for this shape.

Names, avatars and scores are deliberately **not** stored here. They are read
live from `leaderboard/{uid}`, which already publishes `profileName`, `username`,
`avatarId` and all four ELOs for every account (`PUBLIC_ALWAYS_KEYS`,
`js/firebase.js:51`). Denormalising them here would create a second copy that
goes stale and, worse, would let a stranger write text that renders on my screen.

### `friendRequests/{fromUid_toUid}`

```
friendRequests/aaa111_zzz999
  from:      'aaa111'
  to:        'zzz999'
  status:    'pending' | 'rejected'
  createdAt: 1755000000000
```

Deterministic ID. A second request to the same person is the same document, so
one person cannot be spammed with repeat requests.

- **Accept** — delete the request, create the friendship.
- **Reject** — set `status: 'rejected'`, keep the document. Only the recipient
  can do this, and the sender cannot set it back to `pending`. One rejection is a
  permanent, silent no.
- **Cancel** (sender changed their mind) — delete the document.
- **Clear a rejection** — only the recipient may delete a rejected document, from
  the blocked/rejected list. This is the escape hatch for a mis-tap.

No display name or avatar is copied into the request. The incoming list reads
`leaderboard/{from}` for those. **Any string that ever comes from another user
must go through `esc()`** — `js/leaderboard.js:107` is the existing example.

### `blocks/{myUid}/blocked/{theirUid}`

```
blocks/aaa111/blocked/zzz999
  createdAt: 1755000000000
```

Readable and writable only by `myUid`. The security rules consult it when someone
tries to create a request aimed at me, so a blocked person simply gets a
permission error and is never told they were blocked.

### One new published field

`usernameLower` — `username.toLowerCase()`, added to the public leaderboard doc so
search can be case-insensitive. Added inside `updatePublicLeaderboardDoc` in
`js/firebase.js`, derived from `username`, not a new stored local key.

**Backfill note:** existing accounts have no `usernameLower` and will not be
findable until their public doc is rewritten. It rewrites on almost any change
(`PUBLISHED_KEYS`, `js/firebase.js:61`) and on every sign-in via
`pullOrBootstrap`, so this self-heals the next time each user opens the app while
signed in. Nobody needs to do anything; it is just not instant.

---

## Security rules

**These do not exist in a file today.** Per `HANDOVER.md` the current rules live
only in the Firebase console, were never exported, and the write rules have never
been tested. That has been survivable until now because every write in the app is
a user writing their own document.

**This feature ends that property**, and that is why commit 1 is the rules work
and not a nice-to-have:

- A stranger's write (`friendRequests`) creates a document that renders on
  another user's screen.
- A stranger's action creates a `friendships` document that the app then trusts
  to mean "this person is my friend."
- Once Masterclass sharing reads that list, a forged friendship becomes an
  access grant to someone's content.

An untested rule here is not a cosmetic risk. Ship the rules first.

Sketch (the real file gets written and tested in commit 1):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // --- existing collections: transcribe from the console verbatim first ---
    match /users/{uid}      { ... }
    match /leaderboard/{uid} { ... }

    match /friendships/{pairId} {
      allow read: if request.auth != null
                  && request.auth.uid in resource.data.members;

      allow create: if request.auth != null
        && request.resource.data.keys().hasOnly(['members','createdAt'])
        && request.resource.data.members.size() == 2
        && request.resource.data.members[0] < request.resource.data.members[1]
        && pairId == request.resource.data.members[0] + '_'
                   + request.resource.data.members[1]
        && request.auth.uid in request.resource.data.members
        // the other person must actually have asked
        && exists(/databases/$(database)/documents/friendRequests/$(
             (request.resource.data.members[0] == request.auth.uid
               ? request.resource.data.members[1]
               : request.resource.data.members[0])
             + '_' + request.auth.uid));

      allow update: if false;   // a friendship is created or deleted, never edited
      allow delete: if request.auth != null
                    && request.auth.uid in resource.data.members;
    }

    match /friendRequests/{reqId} {
      allow read: if request.auth != null
        && request.auth.uid in [resource.data.from, resource.data.to];

      allow create: if request.auth != null
        && request.auth.uid == request.resource.data.from
        && request.resource.data.from != request.resource.data.to
        && reqId == request.resource.data.from + '_' + request.resource.data.to
        && request.resource.data.status == 'pending'
        && request.resource.data.keys().hasOnly(['from','to','status','createdAt'])
        && !exists(/databases/$(database)/documents/blocks/$(
             request.resource.data.to)/blocked/$(request.auth.uid));

      // only the recipient may reject, and only to 'rejected'
      allow update: if request.auth != null
        && request.auth.uid == resource.data.to
        && request.resource.data.status == 'rejected'
        && request.resource.data.from == resource.data.from
        && request.resource.data.to   == resource.data.to;

      allow delete: if request.auth != null
        && request.auth.uid in [resource.data.from, resource.data.to];
    }

    match /blocks/{uid}/blocked/{other} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

Two things worth saying plainly about this:

1. `exists()` calls inside rules each cost a document read, billed on every
   request-create and friendship-create. At this app's scale that is nothing.
2. The friendship `create` rule proves the *other* person asked, but there is
   nothing stopping me from accepting a request I never wanted. That is fine —
   accepting my own incoming request is exactly what accept means.

---

## Search

**Exact username match only.** Queried against `leaderboard`, which is already
world-readable, so search adds no new exposure and needs no new read rule.

```js
query(collection(firestore,'leaderboard'),
      where('usernameLower','==', typed.trim().toLowerCase()),
      limit(5))
```

Prefix search was considered and rejected: typing one letter would return a page
of accounts, and walking the alphabet would dump every user in the app with their
avatar and all four ratings in a couple of hundred queries. Exact match means you
can only find someone whose username you were already given — which is also what
keeps mass request-spam impractical.

**Usernames are not unique.** `signUpWithEmail` (`js/firebase.js:113`) and
`completeProfile` (`js/firebase.js:143`) save whatever was typed with no check, so
two accounts can both be `magnus`. Search therefore returns a short list, not one
result, and each row shows avatar and puzzle ELO so they can be told apart. A
proper uniqueness reservation is listed as an optional later commit.

**Private profiles are findable**, exactly as they already are in the global
leaderboard's own search box. They publish name, username, avatar and ELOs
regardless of the privacy setting. Hiding them from friend search would be
inconsistent, and a "no result" would itself leak that the account is private.

---

## Privacy: what accepting changes

**Nothing.** A friend sees exactly what a stranger sees.

That is a deliberate decision, not an oversight. Privacy in this app is enforced
by *not publishing* data, not by hiding it: `updatePublicLeaderboardDoc` actively
deletes `PUBLIC_DETAIL_KEYS` from the public document when a profile goes private
(`js/firebase.js:250-253`).

Which means the comment at `js/leaderboard.js:117` — "adding a level later
('friends', …) means adding a line here" — **is wrong for a friends level**.
`leaderboard/{uid}` is world-readable, so publishing charts "for friends" would
publish them to everybody, and hiding them in `VISIBILITY_SECTIONS` would hide
nothing at all. A real friends-only visibility level needs the detail keys moved
into a separate `profileDetail/{uid}` document with a read rule gated on a
friendship existing. That is a proper piece of work and is **out of scope here**;
it is recorded at the bottom as a future option. The plan below includes a
one-line comment correction so nobody trusts that note later.

The friends leaderboard needs no new exposure because every sortable field is
already in `PUBLIC_ALWAYS_KEYS`.

---

## Abuse: what stops what

| Attack | What stops it |
|---|---|
| Spamming one person with repeat requests | Deterministic doc ID — the second request is the same document |
| Asking again after being turned down | The rejected doc stays; sender cannot set it back to pending |
| Finding lots of people to bother | Exact-username search only; no enumeration |
| A specific person who won't stop | Block list, checked in the rules, invisible to the blocked person |
| Being stuck with a friend | Either side deletes the single friendship doc; no notification |
| Runaway lists | 100 friends, 50 outgoing pending requests (client-side caps) |

**Honestly not covered:** one account sending a single request each to a thousand
different people. Firestore rules cannot count documents, so genuine rate
limiting needs a Cloud Function, which this project does not use and which
requires the Blaze plan. At this app's scale that is not worth building, and
exact-username search makes it impractical to target strangers at volume anyway.
If the app grows and this becomes a real problem, a Cloud Function is the fix.

---

## The friends leaderboard

`fetchLeaderboard` cannot be reused: it sorts the whole collection and takes the
top 200, which will not contain my friends, so filtering its result would show an
empty board.

New sibling function in `js/firebase.js`:

```js
export async function fetchLeaderboardByUids(uids, orderByField = 'puzzleElo')
```

Firestore's way to say "documents whose id is in this list" is
`where(documentId(), 'in', chunk)`, and **`in` is capped at 30 values per
query**. So the function chunks the uid list by 30, runs the chunks with
`Promise.all`, merges the results, and sorts in JavaScript. With the 100-friend
cap that is at most 4 small queries, and because the sort is client-side no
composite index is needed.

`LEADERBOARD_FIELDS` is reused exactly as it stands — same four categories, same
labels, same fallbacks, same `season` handling, same row markup, same tap-through
to `PublicProfile`. **No new categories are invented.**

The season filter (`rushMonthKey === monthStr()`) applies unchanged. There is no
over-fetch problem here because we are not sorting in the query.

---

# The commits

Nine commits. UI-only work comes first so screens can be judged before any data
is written. Commits 1–7 are the feature; 8–9 are polish.

Every commit: bump the `sw.js` cache version, verify at 375px in light **and**
dark, in **both** languages, before starting the next.

---

## Commit 1 — Export and test the security rules (no feature code)

**Nothing about Friends is in this commit.** This is the prerequisite.

1. Transcribe the current rules out of the Firebase console into `firestore.rules`
   at the repo root, verbatim. Commit that as the baseline before changing a
   character of it.
2. Add `firebase.json` with a `firestore.rules` pointer, and the emulator config.
3. Write rules unit tests (`@firebase/rules-unit-testing`, runs against the
   emulator, no network, no production data touched) covering the **existing**
   collections first: a user can write their own `users/{uid}` and not someone
   else's; the same for `leaderboard/{uid}`; anyone can read `leaderboard`.
   This finally tests the write rules, which is lower-priority item 2 in
   `HANDOVER.md`.
4. Add the three new collection rules from the sketch above, with tests for each
   allow and each deny.
5. Deploy from the file (`firebase deploy --only firestore:rules`) and from then
   on **never edit rules in the console again** — the file is the source of
   truth.

**Verify:** the whole test suite passes against the emulator, and the deployed
rules in the console match the file.

**Risk:** transcribing the console rules by hand can miss something and deploying
the file replaces what is live. Take a screenshot of the console rules before
starting, and check the app still signs in and syncs immediately after deploying.

---

## Commit 2 — Friends screens, UI only, no data

Pure markup, CSS and strings. Every list is empty or shows fake local rows. No
Firestore calls at all. This is the commit where the screens get judged.

**Profile tab entry point.** The screen head at `index.html:579` currently holds
the `<h2>` and one full-width-ish `🏆 Leaderboard` button. At 375px a second
button will not fit beside it. So: the head keeps only the `<h2>`, and directly
below it goes a two-up row of buttons — `🏆 Leaderboard` and `👥 Friends` — each
half width, same `.btn.primary` styling, gold on navy, no new visual language.
The Friends button carries a small gold count badge when there are pending
incoming requests.

**New `#screen-friends`.** Back button, `👥 Friends` heading, and a `.seg` strip
of three — reusing the exact segmented control already used by
`#leaderboard-mode`:

- **Friends** — a list of `.lb-row`-styled rows: avatar (36px), username, and a
  `⋯` button on the right. Empty state: a centred hint, "No friends yet. Search
  for someone by their username to send a request."
- **Requests** — two labelled groups in one scroll. *Incoming*: avatar, username,
  and two small buttons, `✓ Accept` (gold) and `✕ Reject` (plain). *Outgoing*:
  avatar, username, a muted "Pending" label and a `Cancel` button. Each group
  hides itself when empty; if both are empty, one hint.
- **Find** — a single text input, placeholder "Enter a username", and a Search
  button. Results render as rows with an `➕ Add friend` button. Below the input,
  a permanent one-line hint: "You need their exact username." Empty result:
  "No player found with that username."

**New `#screen-friends-leaderboard`** — a near-copy of `#screen-leaderboard`:
same `.seg` for the four categories, same season `.seg`, same list markup, same
watermark. Reached from a `🏆 Friends leaderboard` button at the top of the
Friends list tab. It does **not** get the name-filter input; with at most 100
rows there is nothing to filter.

**Public profile.** One `➕ Add friend` button under the avatar block in
`#screen-public-profile` (`index.html:682`). In this commit it is inert. Its
label is state-driven and has four forms: `➕ Add friend`, `⏳ Request sent`,
`✓ Friends`, and hidden entirely when looking at yourself.

**All new strings** go in `js/i18n.js` with both `es:` and `en:`:

| key | es | en |
|---|---|---|
| `friends_btn` | `👥 Amigos` | `👥 Friends` |
| `friends_title` | `Amigos` | `Friends` |
| `friends_tab_list` | `Amigos` | `Friends` |
| `friends_tab_requests` | `Solicitudes` | `Requests` |
| `friends_tab_find` | `Buscar` | `Find` |
| `friends_empty` | `Todavía no tienes amigos. Busca a alguien por su nombre de usuario para enviarle una solicitud.` | `No friends yet. Search for someone by their username to send a request.` |
| `friends_search_ph` | `Escribe un nombre de usuario` | `Enter a username` |
| `friends_search_hint` | `Necesitas su nombre de usuario exacto.` | `You need their exact username.` |
| `friends_search_btn` | `Buscar` | `Search` |
| `friends_no_match` | `No se encontró ningún jugador con ese nombre de usuario.` | `No player found with that username.` |
| `friends_add` | `➕ Añadir amigo` | `➕ Add friend` |
| `friends_pending` | `⏳ Solicitud enviada` | `⏳ Request sent` |
| `friends_already` | `✓ Amigos` | `✓ Friends` |
| `friends_incoming` | `Recibidas` | `Incoming` |
| `friends_outgoing` | `Enviadas` | `Outgoing` |
| `friends_none_pending` | `No tienes solicitudes pendientes.` | `No pending requests.` |
| `friends_accept` | `✓ Aceptar` | `✓ Accept` |
| `friends_reject` | `✕ Rechazar` | `✕ Reject` |
| `friends_cancel_req` | `Cancelar` | `Cancel` |
| `friends_lb_btn` | `🏆 Clasificación de amigos` | `🏆 Friends leaderboard` |
| `friends_lb_title` | `Clasificación de amigos` | `Friends leaderboard` |
| `friends_lb_empty` | `Añade amigos para ver cómo van.` | `Add friends to see how they're doing.` |
| `friends_remove` | `Eliminar amigo` | `Remove friend` |
| `friends_remove_confirm` | `¿Eliminar a {n} de tus amigos?` | `Remove {n} from your friends?` |
| `friends_block` | `Bloquear` | `Block` |
| `friends_block_confirm` | `¿Bloquear a {n}? No podrá enviarte solicitudes y dejarán de ser amigos.` | `Block {n}? They won't be able to send you requests, and you'll no longer be friends.` |
| `friends_blocked_title` | `Bloqueados` | `Blocked` |
| `friends_unblock` | `Desbloquear` | `Unblock` |
| `friends_sent_toast` | `Solicitud enviada ✓` | `Request sent ✓` |
| `friends_accepted_toast` | `¡Ahora son amigos! 🎉` | `You're now friends! 🎉` |
| `friends_signin_needed` | `Inicia sesión para usar Amigos.` | `Sign in to use Friends.` |
| `friends_max` | `Has alcanzado el máximo de 100 amigos.` | `You've reached the maximum of 100 friends.` |
| `friends_self` | `Ese eres tú.` | `That's you.` |

Add `js/friends.js` to the `ASSETS` array in `sw.js` in this commit, even though
it is nearly empty, so the offline story is never briefly wrong.

**Verify:** all three tabs render at 375px in light and dark in both languages;
the two Profile buttons fit on one row without wrapping; the segmented control
looks identical to the Leaderboard one; nothing overflows `document.scrollWidth`.

---

## Commit 3 — Search and send a request

First real data. `js/friends.js` gets `usernameLower` published (a small change
in `js/firebase.js`'s `updatePublicLeaderboardDoc`), the exact-match search, and
`sendRequest(toUid)`.

- Search is signed-in-only. Signed out, the Find tab shows `friends_signin_needed`
  and the input is disabled.
- Searching your own username shows your row with a `friends_self` note and no
  button.
- A permission error on create (the sender is blocked) shows the same neutral
  "Request sent ✓" toast as success. **This is deliberate** — the blocked person
  must not be able to detect the block.
- Every string that came out of Firestore renders through `esc()`.

**Verify:** two accounts on two browsers. Search a real username, get one row,
send, and confirm the document exists in the console with exactly the four
expected fields. Then confirm a second send does not create a second document.

**Watch out:** the reCAPTCHA App Check 403 on localhost is pre-existing and
expected (`HANDOVER.md`), and App Check is in Monitor mode so it does not block.
Do not chase it.

---

## Commit 4 — See requests, accept and reject

The Requests tab goes live. Incoming = `where('to','==',me)` and
`where('status','==','pending')`; outgoing = `where('from','==',me)`. Both need a
composite index; Firestore prints the exact creation link in the console error the
first time each query runs — follow it, then note both indexes in this plan file.

Accept = delete the request, then create the friendship, in that order? **No —
create the friendship first, then delete the request**, because the create rule
requires the request to still exist. There is no transaction here; if the delete
fails, the worst case is a stale request row that the UI hides once a friendship
exists.

Reject = update `status` to `'rejected'`. The row disappears from my list and the
sender's outgoing row shows nothing new — from their side the request simply
stays pending forever, which is the kindest and least informative outcome.

Cancel (outgoing) = delete the document.

**Verify:** with two accounts, walk every path — send, accept, see both lists
update; send, reject, confirm the sender's re-send does nothing and creates no
new document; send, cancel, confirm the recipient's incoming row is gone.

---

## Commit 5 — The Friends list

`where('members','array-contains', myUid)` for the uids, then
`fetchLeaderboardByUids` (added here) to fill in name, avatar and puzzle ELO.
Tapping a row opens `PublicProfile` exactly as a leaderboard row does — note
`PublicProfile.init` hardcodes its back button to the leaderboard screen
(`js/leaderboard.js:147`), so that needs to become "back to wherever I came
from". Smallest honest change: `PublicProfile.open(entry, backTo = 'leaderboard')`.

The 100-friend cap is checked here before any request is sent.

**Verify:** friends appear with correct avatars; back from a public profile
returns to Friends, not to the leaderboard; the leaderboard's own tap-through
still returns to the leaderboard.

---

## Commit 6 — Friends leaderboard

Wire `#screen-friends-leaderboard` to `fetchLeaderboardByUids(friendUids, field)`
using `LEADERBOARD_FIELDS` unchanged. Sort client-side, rank locally, reuse
`rankTier` and the `.lb-row` markup.

Decision to make while building: **does my own row appear on the friends
board?** Recommendation: yes, include myself and highlight my row — a board of
four people that doesn't include me is not useful. It costs one extra uid in the
chunk.

**Verify:** all four category tabs; the season toggle on the two Rush boards;
a friend with no score shows the `fallback`, not a blank; the board is correct
with 0, 1 and 30+ friends (30 is the chunk boundary — test it deliberately, with
seeded data if necessary).

---

## Commit 7 — Add friend from a public profile, unfriend, block

The `➕ Add friend` button on `#screen-public-profile` becomes live, with its four
states resolved from the friendship and request documents before render.

`⋯` on a friends-list row opens the existing `sheet()` with **Remove friend** and
**Block**, both behind `askConfirm()`. Block writes `blocks/{me}/blocked/{them}`
and deletes the friendship in the same action. A **Blocked** list lives behind
`⋯` in the Friends screen head, with Unblock.

**Verify:** all four button states on the public profile; block then have the
blocked account try to send a request and confirm it fails silently on their side
and produces no document; unblock and confirm they can ask again.

---

## Commit 8 — Correct the stale privacy comment

One-line documentation fix, no behaviour change. The comment at
`js/leaderboard.js:117` says a `friends` visibility level can be added by adding a
line to `VISIBILITY_SECTIONS`. That is not true, because `leaderboard/{uid}` is
world-readable and privacy is enforced by not publishing. Replace it with an
accurate note pointing at this plan's "future options" section.

---

## Commit 9 (optional) — Unique usernames

Not needed to ship, and it changes signup, so it is deliberately last.

A `usernames/{usernameLower}` collection holding `{ uid }`, created in a
transaction at signup, with a rule allowing create only when the document does not
exist and `uid == request.auth.uid`. Signup then rejects a taken username with a
new `username_taken` string. **Existing duplicates are not resolved** — usernames
are permanent by design (`username_permanent_hint`), so any duplicates already out
there stay, and the reservation collection is backfilled first-come.

---

## Future options — explicitly NOT in this plan

1. **A `friends` visibility level.** Needs `PUBLIC_DETAIL_KEYS` moved into a
   separate `profileDetail/{uid}` document with a read rule gated on a friendship
   existing, plus a third value in `VISIBILITY`, plus a migration for every
   existing account. Real work. Ask for it separately.
2. **Notifications.** No push, no in-app badge beyond the count on the Friends
   button. Requests are found by looking.
3. **Rate limiting outgoing requests server-side.** Needs Cloud Functions and the
   Blaze plan.
4. **A `discoverable: false` opt-out** removing an account from both search and
   the global leaderboard.
5. **Masterclass sharing itself.** This plan only guarantees the friendship query
   it will need.

---

## How big is this, honestly

**Medium-large. Bigger than Game History was**, and Game History took a full
session per commit.

Roughly: commit 1 is a session on its own (emulator setup is fiddly and it is the
first testing infrastructure this project has ever had); commit 2 is a session;
commits 3–7 are one session each, each needing **two accounts in two browsers** to
verify, which is slower and more error-prone than anything done so far here.
Commits 8 and 9 are small. Call it seven or eight working sessions.

`js/friends.js` will land somewhere around 400–500 lines. `js/app.js` grows by
only a few lines (the Profile buttons), which is the right direction given the
split work.

### What could go wrong

- **The rules transcription.** Deploying `firestore.rules` replaces what is live.
  If the transcription misses a clause, sync or sign-in breaks for real users.
  Screenshot the console first; test the app immediately after deploying.
- **Two-account testing.** Every one of commits 3–7 needs two real accounts.
  Getting this wrong produces bugs that only appear for the *other* person, which
  is the hardest kind to notice.
- **The 30-item `in` limit.** Easy to write, easy to forget, and it only breaks
  once someone has 31 friends — which will not be during development. Test the
  chunking with seeded data, not by making friends.
- **Composite indexes.** Two queries in commit 4 need them. Firestore fails the
  query with a link to create the index; it works instantly in dev and then the
  same error appears in production if the index was only created for the wrong
  project. Check both.
- **Text from strangers.** The one genuinely new class of bug in this app.
  Everything rendered from another user must go through `esc()`. The design
  minimises the surface by not denormalising names into request documents, but
  the search results and friend rows still render another person's username.
- **Backfill lag.** Nobody is findable by search until their public document is
  rewritten with `usernameLower`. That happens on next sign-in, so it looks like
  "search is broken" for a while. Expect it; do not debug it.
- **Service worker staleness.** Every commit touches `js/*.js` or `index.html`, so
  every commit bumps the `sw.js` cache version. Missing one makes a returning user
  see a half-updated app, which will look like a friends bug.
- **Blocking must stay silent.** The temptation to show a helpful error when a
  blocked user sends a request is strong and would defeat the whole point.
