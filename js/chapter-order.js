// Where a chapter goes when the owner moves it one step.
//
// This file imports NOTHING. That is the whole point of it existing: the header
// of tests/unit/tree-line.test.js records why — js/masterclass.js imports i18n,
// firebase and app.js, so anything living there can never be unit-tested, and
// BUG A reached production through exactly that gap. The arithmetic of a move
// is the part worth testing, so it lives here, on its own, and masterclass.js
// is left with nothing but the guards, the writes and the redraw.

// Given the chapter list ALREADY SORTED by `order`, the index of the row being
// moved, and dir -1 (up) or +1 (down), return the writes the move needs:
// an array of { id, order }. An empty array means "nothing to do" — the caller
// treats that as a no-op, not as a failure.
//
// Two chapters can share an `order`: a class made before this existed, or two
// chapters added from two devices at once. A plain swap between a tied pair
// changes nothing, and a button that silently does nothing is worse than one
// that is slow, so a tie falls back to renumbering the list 1..n. Only the rows
// whose number actually changes are returned — a renumber of a 50-chapter class
// where two rows moved is still two writes.
export function planMove(chapters, index, dir) {
  const list = Array.isArray(chapters) ? chapters : [];
  const to = index + dir;
  // Off either end, or handed something that is not a row of the list. The menu
  // hides the entry that would do this, so reaching here means the list changed
  // under the open menu — somebody deleted a chapter while it sat there.
  if ((dir !== -1 && dir !== 1) || index < 0 || index >= list.length
      || to < 0 || to >= list.length) return [];

  const a = list[index];
  const b = list[to];
  const oa = Number(a.order) || 0;
  const ob = Number(b.order) || 0;

  // The ordinary case, and the cheap one: two documents trade numbers.
  if (oa !== ob) return [{ id: a.id, order: ob }, { id: b.id, order: oa }];

  // Tied. Renumber from the order the list is ALREADY in, with the two rows
  // exchanged, so every other chapter keeps the position it is showing.
  const moved = list.slice();
  moved[index] = b;
  moved[to] = a;
  const writes = [];
  moved.forEach((ch, i) => {
    const want = i + 1;
    if ((Number(ch.order) || 0) !== want) writes.push({ id: ch.id, order: want });
  });
  return writes;
}
