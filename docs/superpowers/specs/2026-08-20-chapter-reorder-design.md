# Reordering the chapters of a Masterclass

2026-08-20. Approved before implementation.

## The gap

Every chapter document stores a numeric `order`, `addChapter()` puts new ones
on the end, and `fetchChapters()` sorts by it. Nothing in the UI moves a
chapter. The only way to change the running order was to delete a chapter and
add it again, which loses its id and its place.

`order` is a plain number rather than an array index precisely so a move need
not rewrite every document.

## What the owner sees

Open a class you own, tap the ⋯ on a chapter row:

    ⬆️ Move up
    ⬇️ Move down
    ✏️ Rename chapter
    🗑️ Delete chapter

"Move up" is absent on the first chapter and "Move down" on the last, so no
entry in the menu can do nothing. One tap moves one step: the row swaps with
its neighbour, the 1-2-3 numbers redraw, and a toast confirms it.

Same three guards as `renameChapter()`: owner, signed in, online. Offline gets
the "needs network" toast rather than a queued write that lands later and
surprises somebody — the same reasoning that keeps BUG B's offline-Stop hole
documented rather than quietly patched.

## The five pieces

1. `setChapterOrder(mcId, chapterId, order)` — new, in js/firebase.js beside
   `updateChapter()`. An `updateDoc` carrying only `order`, `updatedBy` and
   `updatedAt`. The PGN never leaves the phone.

   This is legal without a rules change because the chapter rule checks
   `after()` — the WHOLE resulting document — so a partial update still leaves
   exactly the six permitted keys. `updateChapter()` uses `setDoc` with all six
   for a different reason: it changes `pgn`, so it has to send `pgn`.

2. `planMove(chapters, index, dir)` — a pure function. Given the sorted list,
   the row's index and -1 or +1, it returns the `{ id, order }` writes needed.

   - Normal case: swap the two `order` values. Two writes.
   - Tied, or a swap that would not change the sort: renumber the whole list
     1..n and return only the rows whose number actually changed.

   Pure, so it is unit-tested with no Firestore, like tests/unit/tree-line.test.js.

3. `moveChapter(ch, dir)` — in js/masterclass.js, modelled on `renameChapter()`.
   Guards, `planMove`, writes in parallel, apply the new orders to
   `this.chapters`, re-sort, `renderChapters()`, toast. On any failure nothing
   local changes and the network toast appears, so the list on screen never
   claims an order that was not stored.

4. i18n: `mc_move_up`, `mc_move_down`, `mc_chapter_moved`, Spanish and English,
   in the emoji style of the menu entries already there.

5. sw.js to v76, because js/ changed.

## How it is proved

Unit tests on `planMove`: a normal swap; moving the first chapter up and the
last one down (both refused); a tied pair falling back to a renumber; a
renumber returning only the rows that moved.

Rules tests:
- 44. the owner can write `order` by itself and it is allowed
- 45. a member who is not the owner is denied
- 46. an order write carrying a client-clock `updatedAt` is denied — the trap
      test 42 covers for edits

There is NO rules change, so there is no `rules:deploy`. `npm run test:rules`
here proves the already-deployed rule permits this. If test 44 fails, the rule
does need a change, and that is a decision to take back to Adrian rather than
to write.

## Deliberately out of scope

- No live push of a new order to members mid-lesson. Chapter lists have never
  been live-synced; members see the new order next time they open the class.
  Adding that is a separate feature.
- No undo beyond moving the chapter back.
- No drag-to-reorder. Hand-rolled touch drag on a scrolling list fights the
  page scroll, and App Check blocks localhost so it could not be driven here —
  every wrinkle would land on Adrian to tap through by hand.
