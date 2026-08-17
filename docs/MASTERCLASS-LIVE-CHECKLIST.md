# Masterclass — the two-account production run

Written 2026-08-17. Covers **commits 5, 6 and 7 together** (`e2cba06`,
`9be6cb4`, `50d0f43`). Commits 1–4 are already verified against production and
are not re-tested here.

Run it on **https://chesstrainingcenter.app**, not on localhost. App Check
blocks the localhost client from Firestore entirely, so none of this can be
proved from Adrian's machine.

## What has NEVER executed against real Firestore

Everything in this list is being run for the first time. If a step fails, it is
a genuine first-contact failure, not a regression.

| Function / feature | Commit | Ever run live? |
|---|---|---|
| `addMembers()` | 5 | **NEVER** |
| `fetchMembers()` | 5 | **NEVER** |
| `removeMember()` | 5 | **NEVER** |
| `leaveMasterclass()` | 5 | **NEVER** |
| `setMemberCount()` | 5 | **NEVER** |
| The whole live board — `pushLiveState()`, `stopLiveState()`, `watchLiveState()` | 6 | **NEVER** |
| `deleteMasterclass()` | 3 | **NEVER** — and it is known to leave one document behind |
| `{ includeMetadataChanges: true }`, the Reconnecting bar, the offline section | 7 | **NEVER** |

Already proved live in the commit-4 run and **not** re-tested: `createMasterclass()`,
`fetchMyMasterclasses()`, `addChapter()`, `fetchChapters()`, `deleteChapter()`.

## Two accounts

| Name | uid | Role in this run |
|---|---|---|
| `Zugzwang` | `hxxaE1n6T1WzxLvIGTMby1RfkZs1` | the **owner** / teacher |
| `miguelafuentesm` | `f3trpsGqDXXXcV9OQsUw0TGlbjh1` | the **member** / student |

Use two browsers, or one normal window and one incognito window, so both can be
signed in at the same time. **Both accounts have to be signed in at once for
Part C** — the live board is one account watching the other move.

Keep the **Firestore console** open on the `chess-training-center` project in a
third tab: `masterclasses` is the collection to watch, and step C10 and step D3
require actually looking at it.

---

## Step 0 — RE-ADD THE FRIEND. Do not skip this.

`blockUser()` removed the Zugzwang ↔ miguelafuentesm friendship during the
Friends run, and **the invite picker only ever shows friends.** With no
friendship the picker is empty and nothing from step A3 onward can happen.

1. As **Zugzwang**: Profile → **Friends** → **Blocked**. If `miguelafuentesm`
   is listed, tap **Unblock**. A block in place will make the invite silently
   add nobody, and by design the app will not tell you which one failed.
2. As **miguelafuentesm**: Profile → **Friends** → **Blocked**. Same check, same
   fix, in this direction too.
3. As **Zugzwang**: Profile → Friends → **Find** tab → type `migue` → the row
   should show `miguelafuentesm` with a live **➕**. Tap it. Expect the toast
   `Solicitud enviada ✓` / `Request sent ✓`.
   - If the row comes back with something other than ➕, you are already
     friends — skip to step 5.
4. As **miguelafuentesm**: Profile → Friends → **Requests** → **Accept** on the
   Zugzwang row.
5. As **Zugzwang**: Profile → Friends → **Friends** tab. `miguelafuentesm` must
   be in the list. **Do not go on until this row exists.**

---

## Part A — as Zugzwang (the owner): members

6. **Bases** tab. The **Masterclass** section is above the local base list.
   The class from the commit-4 run should be there, with a **Propietario /
   Owner** chip and a member count.
   - If it is not there, tap **New Masterclass** and make one, then add a
     chapter (**➕ Add chapter → 📚 From a database**) so there is something to
     broadcast in Part C.
7. Tap the class row. The class screen opens: `←`, the name, `⋯`, the live bar,
   the chapters list, then the members list.
   - The members count says **Loading…** for a moment, then a real number. It
     must never flash "0 miembros" for a class that has one.
   - **`fetchMembers()` has just run live for the first time.** One row: your
     own, with your avatar, your name, an **Owner** chip, and **no ⋯** on it.
8. Tap **➕ Invite friends**. The picker opens, titled **Invitar amigos /
   Invite friends**, with `miguelafuentesm` as a checkbox row.
   - If the picker instead says "You have no friends yet…", **step 0 did not
     take.** Go back and finish it.
   - Tapping the row toggles the box — the whole row is the label. **One tap
     does NOT add them**; that was deliberately dropped.
9. Tick `miguelafuentesm` and tap **Añadir / Add**.
   - **`addMembers()` and `setMemberCount()` have just run live for the first
     time.** Expect the toast **`1 miembro añadido` / `1 member added`** —
     with no ✓, on purpose.
   - The members list redraws with two rows. `miguelafuentesm` has a
     **Espectador / Viewer** chip and **does** have a ⋯.
   - The count on the row back on the Bases tab is what `setMemberCount()`
     wrote. Check it later, at step A10.
10. Tap `←`, then the class row again. The count on the row should read
    **2 miembros / 2 members**. That is `setMemberCount()` proved: it had to
    send `updatedAt` as well as `memberCount` or the parent rule would have
    denied the write outright.
11. **In the Firestore console:** `masterclasses / <id> / members` now has two
    documents. Open `miguelafuentesm`'s and confirm it holds **exactly**
    `uid`, `role`, `addedBy`, `addedAt` — **no name, no username, no avatar.**
    If a display name is in there, stop and report it; names must come live
    from `/leaderboard`.

## Part B — as miguelafuentesm (the member): the other side

12. Sign in as `miguelafuentesm`. **Bases** tab.
    - The class is in the Masterclass section with an **Espectador / Viewer**
      chip. This is the collection-group query returning somebody else's class
      for the first time.
13. Open it.
    - **No ➕ Add chapter and no ➕ Invite friends.** A viewer gets neither.
    - Chapter rows have **no ⋯**.
    - The members list shows both people, each with the right chip, and **no ⋯
      on any row** — not even on Zugzwang's.
    - Tap a chapter: it opens on the Analysis board, and **← Masterclass**
      brings you back with the tab bar still lit on **Bases**.
14. Tap `⋯` at the top. The sheet says **Salir de la Masterclass / Leave
    Masterclass** — *not* Delete. **Do not tap it yet**; Part C needs this
    membership. Dismiss the sheet.

## Part C — both accounts at once: the live board

Commit 6 has never run. Everything in this part is first contact.

Have **Zugzwang** in one window and **miguelafuentesm** in the other, both on
the same class.

15. **Zugzwang**, on the class screen: the live bar reads **Tu tablero no se
    está compartiendo. / Your board isn't being shared.** with a **Emitir en
    vivo / Go live** button. Tap it.
    - The bar becomes **🔴 En vivo — abre un capítulo / 🔴 Live — open a
      chapter**, because nothing is on the board yet. That is a real state, not
      a bug.
16. **miguelafuentesm**: still on the class screen, within a second or two the
    bar appears: **🔴 Siguiendo la clase / 🔴 Following the class** with **Dejar
    de seguir / Stop following**. Following is ON by default.
    - **`watchLiveState()` has just delivered its first live snapshot.**
17. **Zugzwang**: tap a chapter. It opens in Analysis. The bar above the board
    is now **🔴 En vivo — la clase ve tu tablero / 🔴 Live — the class sees your
    board** with **Detener / Stop**.
    - **`pushLiveState()` has just written for the first time.** In the
      Firestore console, `masterclasses / <id> / live / state` now exists.
18. **miguelafuentesm**: the board should have jumped to the same chapter and
    the same position, **by itself**, and the student is now on the Analysis
    screen with the bar above the board.
19. **Zugzwang**: play four or five moves, then press the left arrow twice, then
    click a move in the moves list.
    - **miguelafuentesm follows every one of them.** All four kinds of board
      change go through `Analysis.refresh()`, which is the single broadcast
      hook.
    - There may be up to a second of lag on a burst — the write is throttled to
      one per second on purpose, because Firestore's sustained write limit on a
      single document is about one per second.
20. **Zugzwang**: play a move into a **variation** (a sideline, not the main
    line). **miguelafuentesm must land on the same node in the same variation.**
    The position travels as a path of child indices, never a node id.
21. **miguelafuentesm**: tap **Dejar de seguir / Stop following**. The bar
    becomes **🔴 La clase está en vivo / 🔴 The class is live** with **Volver al
    vivo / Back to live**.
    - **Zugzwang plays three more moves. The student's board must NOT move.**
22. **miguelafuentesm**: tap **Volver al vivo / Back to live**. The board snaps
    to where the teacher is **NOW**. The three missed moves are deliberately
    **not** replayed — it is a lesson, not a video.
23. **Zugzwang**: tap **Detener / Stop**.
    - **`stopLiveState()` first live run.** The `live/state` document
      disappears from the console. **This is the delete clause commit 6 added
      and deployed on 2026-08-17** — before it, nobody could remove that
      document at all.
    - **miguelafuentesm** gets the toast **La clase terminó la emisión. / The
      class stopped broadcasting.** and the bar disappears. The last position
      stays on their board.
24. **Zugzwang**: go live again, open a chapter, then use the **tab bar** to
    leave for another tab (Play, say) and come back.
    - The listener on the student's side is self-healing: if the student also
      left the class screen by the tab bar, their subscription ends itself on
      the next teacher move rather than reading forever.
25. **Zugzwang**: tap **Stop**, then `←`. The bar is gone on both sides.

## Part C2 — commit 7: connection state

Do this on **miguelafuentesm** (the member), while **Zugzwang is live with a
chapter open**. Only a member has a listener, so only a member gets this bar.

26. With the student following, **turn the phone's wifi and mobile data off**
    (or, on a laptop, disconnect the network).
    - Within a second or two the bar turns **grey** and reads
      **Reconectando… tu tablero no se está actualizando. /
      Reconnecting… your board isn't updating.**
    - **The last position stays on the board.** It must not clear.
    - **Dejar de seguir / Stop following stays exactly where it was** — same
      position, same size. The bar must not grow a second line and the board
      must not shift down.
    - **You must NOT see "La clase terminó la emisión."** That toast was the
      bug commit 7 fixed: a cached null used to read as the teacher stopping.
27. While still offline, tap the **Bases** tab.
    - The **Masterclass section** says **Una Masterclass necesita conexión. Tus
      bases locales siguen funcionando sin internet. / A Masterclass needs a
      connection. Your local databases still work offline.**
    - **The local base list underneath still works fully** — the games are
      there, they open, you can play through them. That is the whole point of
      the wording.
28. Still offline, **reload the page.**
    - The app shell loads from the service worker.
    - The Masterclass section shows the offline message. It must **not** show a
      stale list of classes — Firestore has no on-disk cache.
29. Turn the network back on.
    - On the Bases tab, the Masterclass section refills with the real list by
      itself.
    - Open the class again while Zugzwang is still live: the bar goes back to
      gold **🔴 Siguiendo la clase / 🔴 Following the class** and the board
      catches up to where the teacher is now.
30. Repeat steps 26–29 once in **dark mode** and once in the **other language**
    (Profile → the language switch). The grey bar must be legible in both
    themes and the wording correct in both languages.

## Part D — removal, leaving, and delete

31. **Zugzwang**, on the class screen: tap `⋯` on `miguelafuentesm`'s member
    row → **Quitar de la Masterclass / Remove from Masterclass** → confirm
    **¿Quitar a … de la Masterclass?**
    - **`removeMember()` first live run.** The row goes. The count drops to 1.
32. Re-invite `miguelafuentesm` (steps 8–9 again) so the next step has something
    to leave.
33. **miguelafuentesm**: open the class → `⋯` → **Salir de la Masterclass /
    Leave Masterclass** → confirm.
    - **`leaveMasterclass()` first live run.** You are returned to the Bases tab
      and the class is **gone from your Masterclass section.**
    - **Known and NOT a bug:** the member count on **Zugzwang's** row stays at
      2 for now. Only the owner may write the parent document, so a member
      leaving cannot fix it. The member list is the truth; the number is
      advisory.
34. **Zugzwang**: the Bases row still says **2 miembros / 2 members** — that is
    the stale number. Open the class. The member list has one row, and going
    back to Bases the row now says **1**.
    - **This is `loadMembers()` → `bumpCount()`, and commit 7 is what made it
      true.** Before commit 7, `bumpCount()` only ran on an add or a remove, so
      the stale count could sit there indefinitely. It now writes **only when
      the two numbers disagree**, so opening a class whose count is already
      right costs zero writes.
35. **Zugzwang**: `⋯` → **Borrar la Masterclass / Delete Masterclass** →
    confirm **¿Borrar esta Masterclass? Se borra para todos.**
    - **`deleteMasterclass()` first live run ever.** You land back on the Bases
      tab and the class is gone from the list.
36. **In the Firestore console, look at `masterclasses / <the deleted id>`.**
    - The parent document is gone, every **chapter** is gone, and every **other
      member's** document is gone.
    - **Exactly ONE document survives: the owner's own membership** —
      `members/hxxaE1n6T1WzxLvIGTMby1RfkZs1`, holding `{uid, role, addedBy,
      addedAt}`. This is **expected, reasoned from the emulator, and being
      confirmed here for the first time.** It cannot be deleted: while the class
      exists the rule refuses it (that would orphan a class nobody can read),
      and afterwards `mcOwnerUid()` does a `get()` on a parent that is gone and
      the null dereference denies.
    - Nobody else can read it — both read rules need the deleted parent — and
      `fetchMyMasterclasses()` skips it, so it leaks nothing. **Closing it needs
      one more clause in `firestore.rules` and is not stage 1's job.**
    - **If MORE than that one document survives, stop and report it.** A
      leftover chapter or somebody else's membership record would be a real
      privacy problem, not a tidy-up.

---

## Still never executed after this run, and that is accepted

None of these are worth engineering a run for:

- the **>100 KB** oversize chapter message (`mc_chapter_too_big`) — needs a PGN
  bigger than any real game
- the **50-chapter** cap toast
- the picker's **"showing the 50 most recent games"** hint — needs a base with
  51+ games
- the **30-member** cap toast — needs 30 friends
- `unfriend()`, `rejectFriendRequest()`, `cancelFriendRequest()` (Friends, not
  Masterclass)

## If anything fails

Note **which step**, what was on screen, and anything in the browser console.
A permission-denied on a write is a rules problem: fix `firestore.rules`, add a
test, and run

```
cd C:\Users\Adrian\chess-app; npm.cmd run test:rules
cd C:\Users\Adrian\chess-app; npm.cmd run rules:deploy
```

**Never edit rules in the Firebase console.** The file is the source of truth
and the console would be silently overwritten by the next deploy.
