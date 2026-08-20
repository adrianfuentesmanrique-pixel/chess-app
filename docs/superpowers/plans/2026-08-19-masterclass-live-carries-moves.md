# Masterclass live board: carry the MOVES, not a pointer (BUG A)

Written 2026-08-19, against `fa09d04`. Plan only — no feature code has been
written. Nothing in this file was copied from
`docs/superpowers/plans/2026-08-16-masterclass-stage-1.md`; that plan's Task 7
string block is wrong and its `deleteMasterclass()` has two real bugs.

## The bug, in one paragraph

`masterclasses/{id}/live/state` carries `path` — a list of child indices — into
a PGN both sides are assumed to share. The follower parses its copy from the
chapter stored in Firestore. Moves the owner plays *during* a lesson are never
saved there, so those nodes do not exist in the follower's tree. `gotoPath()`
returns false, `findFen()` fails because it searches the same incomplete tree,
and `applyLive()` deliberately does nothing. The follower's board freezes with
nothing on screen to explain it.

Confirmed twice: production `masterclasses/beQxGO1s4Vfr02yw0VEk` held
`path: "0.0.0.0.0.0"` (six plies) against a chapter PGN stopping at `Bb5` (five),
and a local reproduction produced the identical path and FEN with
`pathResolved: false`.

## The fix, in one paragraph

Send the moves. `GameTree.play(san)` in `js/tree.js:59` already steps onto a
child that has that move and creates the node when it does not — it is what
every move in the app already goes through. Walking a list of SAN moves with it
*extends* the follower's tree wherever the stored PGN runs out, re-parses
nothing, and never touches the engine.

## Decisions taken, and why

| Decision | Taken | Why |
|---|---|---|
| What the document carries | The **whole line, every time** | Self-contained. A student who joins late, reconnects, or toggles Following gets everything with no bookkeeping and no shared assumption to break. A moves-past-the-PGN delta would need both sides to agree where the stored PGN ends, and that agreement dies the moment the chapter is edited. |
| Do demonstrated moves persist to the chapter? | **No** | Once the line is in the live document, persisting is no longer needed for correctness — it becomes a product choice. Automatic saving would make every improvised sideline permanent teaching material with no undo. A deliberate "Save this lesson to the chapter" button is a later, separate feature. |
| A line that cannot be fully replayed | **Land on the deepest move that worked, silently** | Always a real position from the lesson, just possibly behind, and the teacher's next move fixes it. The old "stay put rather than land somewhere approximate" rule existed because a *pointer* could land on a genuinely wrong node; a validated move list cannot. |
| Transitional rules accepting both shapes | **No — clean swap** | Only safe because this feature has never once worked in production, so there is no user to break. **Do not reuse this reasoning later, when it will not be true.** |

## The document

`masterclasses/{id}/live/state`, after:

| Field | Type | Note |
|---|---|---|
| `chapterId` | string or null | unchanged |
| `line` | string | **new.** SAN moves separated by single spaces, from the chapter's start position to the teacher's current node. Empty string is the start position itself. |
| `fen` | string, max 100 | kept, unchanged, but **demoted**: nothing reads it to move a board any more. It stays as a cheap consistency signal and because removing it buys nothing. |
| `drivenBy` | string | unchanged, `== me()` |
| `updatedAt` | timestamp | unchanged, `== request.time` |
| `path` | — | **removed** |

The line is relative to `tree.root`, and `parsePgn()` (`js/tree.js:281`) sets
`root.fen` from the PGN's own `FEN` header, so a chapter that starts from a
set-up position is handled with no extra field.

### Size cap

`line.size() <= 4096` in the rules — roughly 800 half-moves at about 5
characters a move. Against Firestore's 1 MB document limit this is a rounding
error; the cap exists to bound abuse, not size.

The client trims a line that would exceed it **at a space, from the newest end**,
mirroring what `pushLiveState()` does today with the path's dot separator. A
trimmed line therefore always resolves to a real earlier position in the lesson,
never to half a move. Like the 512-character path before it, this is unreachable
in any real lesson and is not expected ever to run.

### The throttle

`LIVE_THROTTLE_MS = 1000` stays exactly as it is. Its comment must be
**corrected**: coalescing is now lossless. Today a dropped intermediate write is
a skipped position; with the whole line in every write, the newest state
contains every move that came before it. A burst of ten moves in one second
collapses to one write carrying all ten. The payload grows through a lesson but
stays at hundreds of bytes, so the growth has no effect on the throttle at all.

## Task 1 — `js/tree.js`: two new exported functions

They go in `js/tree.js` and **not** in `js/masterclass.js`, deliberately:
`tree.js` imports only `../vendor/chess.js`, so it runs under plain Node with no
browser, no Firebase and no App Check. `masterclass.js` imports `i18n`,
`firebase` and `app.js` and can never be unit-tested. This placement is the
whole reason Task 4 is possible.

```js
// The live board's protocol. The teacher sends the MOVES, not a pointer into a
// PGN: the moves played during a lesson are never saved to the chapter, so a
// pointer names a node the follower does not have. See BUG A.
export function lineOf(tree) {
  const out = [];
  for (let n = tree.current; n && n.parent; n = n.parent) out.push(n.san);
  return out.reverse().join(' ');
}

// Walks a line down, EXTENDING the tree where it runs past what was parsed.
// play() steps onto a child that already has the move and builds the node when
// it does not, so a follower grows its copy of the chapter as the lesson goes
// and the engine is never rebuilt. Only genuinely new moves construct a Chess —
// normally exactly one per snapshot.
//
// An illegal or garbled move stops the walk at the last good node rather than
// throwing: the follower lands on a real position from the lesson, behind
// rather than wrong, and the teacher's next move corrects it.
export function gotoLine(tree, line) {
  let n = tree.root;
  for (const san of String(line || '').split(' ')) {
    if (!san) continue;
    const child = n.children.find(c => c.san === san);
    if (child) { n = child; continue; }
    tree.goto(n);
    if (!tree.play(san)) break;
    n = tree.current;
  }
  tree.goto(n);
}
```

`gotoLine()` returns nothing on purpose. There is no failure a caller can do
anything about: the tree is always left on a legal node.

## Task 2 — `js/masterclass.js` and `js/firebase.js`: switch the protocol

**Delete** `nodePath()` (`js/masterclass.js:77`), `gotoPath()` (`:92`) and
`findFen()` (`:108`). All three exist only to serve the pointer, and `findFen()`
exists only to paper over the pointer failing. Their explanatory comments go
with them; the reasoning that survives — a live update must name a node, not a
position, because a chapter with variations reaches the same FEN twice — moves
onto `lineOf()`. Import `lineOf` and `gotoLine` from `./tree.js` instead.

**`liveKey()` (`js/masterclass.js:121`)** keys on `st.path` today and must key on
`st.line`. Missing this makes every snapshot look unchanged and the board never
moves — a silent failure that looks exactly like the bug being fixed.

**`applyLive()` (`js/masterclass.js:866`)** — everything above the path block is
unchanged, including the "only re-parse when the chapter really changed" rule.
The block

```js
    if (!gotoPath(tree, st.path)) {
      const node = findFen(tree.root, st.fen);
      if (!node) return;
      tree.goto(node);
    }
    Analysis.refresh();
```

becomes

```js
    gotoLine(tree, st.line);
    Analysis.refresh();
```

**`onBoardChange()` (`js/masterclass.js:900`)** sends `line: lineOf(tree)` in
place of `path: nodePath(tree)`.

**`pushLiveState()` (`js/firebase.js:835`)** — the truncation block trims `path`
at a dot; it trims `line` at a space instead, and writes `line` in the payload
in place of `path`. Its comment is rewritten for the new separator and cap.

## Task 3 — `firestore.rules` and its tests

In `match /masterclasses/{mcId}/live/{docId}`, the `allow write` block:

- `hasOnly(['chapterId', 'fen', 'path', 'drivenBy', 'updatedAt'])`
  becomes `hasOnly(['chapterId', 'fen', 'line', 'drivenBy', 'updatedAt'])`
- `after().path is string && after().path.size() <= 512`
  becomes `after().line is string && after().line.size() <= 4096`

`allow read` and `allow delete` are untouched. The `allow delete` clause and the
comment above it stay exactly as they are — that comment is now also the record
of BUG B and must not be tidied away.

In `tests/rules/masterclass.test.js`:

- the shared `live()` fixture (`:100`) swaps `path` for `line`
- **test 34** ("a path over 512 characters is denied") becomes "a line over 4096
  characters is denied"
- **new test 38**: a document still carrying `path` is denied. This is what
  proves the old shape cannot linger, and it is the test that would catch a
  half-finished migration.
- tests 31, 32, 33, 35, 36, 37 are unchanged and must still pass

Expected: **124 to 125 passing, 0 failing.**

## Task 4 — a unit test file, and a `test:tree` script

There is no JavaScript unit test runner in this repo today — `tests/` holds only
the Firestore rules suite. `nodePath()` and `gotoPath()` carry a comment saying
they are "exported only so the round trip can be exercised directly", and
nothing has ever exercised it. That is how BUG A survived to production.

Use **Node's own built-in test runner**. No new dependency:

```json
"test:tree": "node --test tests/unit/"
```

`tests/unit/tree-line.test.js` covers:

1. **Round trip.** Parse `1. e4 e5 2. Nf3 Nc6 3. Bb5`, walk to the end,
   `lineOf()` gives `"e4 e5 Nf3 Nc6 Bb5"`, and `gotoLine()` on a freshly parsed
   copy lands on the same FEN.
2. **BUG A itself, made permanent.** Chapter PGN `1. e4 e5`. Apply the line
   `e4 e5 Nf3 Nc6 Bb5 Nb4`. The tree must grow four nodes and land on
   `r1bqkbnr/pppp1ppp/8/1B2p3/1n2P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4` — the FEN
   Firestore was actually holding on 2026-08-19. **That FEN was verified on
   2026-08-19 by running the six moves through `vendor/chess.js`, not copied
   from the incident notes.** Under today's code this test fails; that is the
   point.
3. **Idempotence.** Applying the same line twice creates no second copy of the
   moves — the node count is unchanged on the second pass. This is what proves
   `play()`'s existing-child reuse is doing the work rather than the tree
   growing a duplicate branch every second.
4. **Variations.** A PGN with a sideline, and a line that walks into the
   sideline, lands on the sideline node and not on the mainline node that
   shares its position. This is the property `path` was chosen for over `fen`
   in the first place and it must not be lost in the swap.
5. **An illegal move stops the walk.** The line `e4 e5 Qxq7` lands on the node
   after `e5` and does not throw.
6. **The empty line** lands on the root, for a teacher who has gone live and
   pressed the double-left arrow.

## Task 5 — ship it, in this order

**This order is the lesson from BUG B and it is not optional.** Because the rule
lists its allowed fields exactly, the old app and the new rules refuse each
other in both directions.

1. `cd C:\Users\Adrian\chess-app; npm.cmd run test:tree` — all green
2. `cd C:\Users\Adrian\chess-app; npm.cmd run test:rules` — **125 passing, 0 failing**
3. `cd C:\Users\Adrian\chess-app; npm.cmd run rules:deploy`
4. **Confirm the deploy in the Firebase console the right way.** Read the
   deployed ruleset's *date* and compare it against
   `git log -1 --date=iso -- firestore.rules`. Do **not** confirm by searching
   the rules text for a clause — that is exactly how BUG B was mis-confirmed,
   because the clause being searched for existed twice in the file.
5. Commit and push the app code, and bump `sw.js` (v71 to v72) in the same
   commit. A live-board protocol change shipped behind a stale service worker is
   a follower running yesterday's `applyLive()` against today's document.
6. Verify the deploy actually landed before asking anyone to test — pushed is
   not deployed on this project.

Between steps 3 and 5 an owner on the old build cannot broadcast at all. Do
steps 3 to 5 in one sitting.

## Task 6 — prove it in production

Two desktop browsers, F12 open on both, Firestore console in a third tab, on
`masterclasses/beQxGO1s4Vfr02yw0VEk`. The App Check 403 is normal and appears
every run; ignore it.

1. Owner opens the class and a chapter, presses **Start**. Member's bar reads
   "Following the class".
2. Owner plays a move **that is already in the chapter's stored PGN**. Member
   follows. *(This much worked before; it is the control.)*
3. Owner plays a move **past the end of the stored PGN** — the case that has
   never worked. **Member follows.** Firestore shows `line` holding every move
   including the new one, and no `path` field at all.
4. Owner plays three or four more new moves. Member follows each.
5. Owner presses the left arrow twice, then clicks a move in the moves list.
   Member follows both — this is checklist step 19, which BUG A has been
   blocking.
6. Owner plays into a **variation**. Member lands in the variation, not on the
   mainline move that reaches the same position. This is checklist step 20.
7. **Late join.** Member leaves the class screen and comes back mid-lesson.
   They land on the teacher's current position, not on the chapter's last stored
   move. This case has never worked and nobody has noticed, because Part C never
   reached it.
8. Owner presses **Stop**. Document gone, member's bar clears with the
   lesson-ended message. *(Regression check on BUG B.)*
9. Reload the member's browser and reopen the chapter. The demonstrated moves
   are **gone** — the lesson was not saved to the chapter. That is the decided
   behaviour, not a bug.

Then update the "Ever run live?" table in
`docs/MASTERCLASS-LIVE-CHECKLIST.md` with what was actually proved, and resume
the checklist from step 21.

## Risks recorded, not fixed

- **A chapter edited mid-lesson.** The follower's parsed copy is stale, so an
  early move in the line may not match the child it has. `play()` then builds
  the moves as a new branch: the follower's board shows the correct position, in
  a different place in their tree. Accepted. Worth knowing before it is reported
  as a mystery.
- **SAN agreement between the two clients.** Both parse the same stored `pgn`
  string with the same `parsePgn()`, and SAN is generated by chess.js from the
  position, so they agree by construction. This holds only while both sides run
  the same build — see step 5 on `sw.js`.
- **The offline-Stop ordering hole** recorded under BUG B in the checklist is
  untouched by this plan and remains open.
- **`fetchMasterclass()` stays unused.** Do not add a call for tidiness.

## Explicitly out of scope

Saving a lesson to the chapter. Stage-2 editors driving the board. Replaying
missed moves — a follower who reconnects gets the current position, and for a
lesson that is right. The 1-per-second throttle. The Reconnecting bar. Follow
and Stop following. The lesson-ended message.
