// Blindfold: which puzzles the next one is drawn from.
//
// This file imports nothing, so the rule can be tested under plain Node
// (tests/unit/blind-pick.test.js).
//
// Without a theme: every puzzle within 300 points of the target, or everything
// loaded when there are none (how Blindfold has always picked).
//
// With a theme: the themed puzzles within 300 points. Under BLIND_PICK_MIN of
// them, the window widens 100 points at a time, up to 600, and whatever is
// there is played. With none at all the pick goes ahead without the theme and
// `fallback` is true, so the screen can say so. Widening is fair: Blindfold
// pays from the rating of the puzzle that actually came up.

export const BLIND_PICK_WINDOW = 300;
export const BLIND_PICK_MAX_WINDOW = 600;
export const BLIND_PICK_MIN = 10;

// puzzles: [{rating, themes[]}], themes: null | Set<themeId>.
// Returns {list, fallback}.
export function blindPick(puzzles, target, themes) {
  const within = (list, w) => list.filter(p => Math.abs(p.rating - target) <= w);
  const anyTheme = () => {
    const near = within(puzzles, BLIND_PICK_WINDOW);
    return near.length ? near : puzzles;
  };
  if (!themes || !themes.size) return { list: anyTheme(), fallback: false };
  const themed = puzzles.filter(p => p.themes.some(th => themes.has(th)));
  let list = [];
  for (let w = BLIND_PICK_WINDOW; w <= BLIND_PICK_MAX_WINDOW; w += 100) {
    list = within(themed, w);
    if (list.length >= BLIND_PICK_MIN) break;
  }
  if (list.length) return { list, fallback: false };
  const rest = anyTheme();
  return { list: rest, fallback: rest.length > 0 };
}
