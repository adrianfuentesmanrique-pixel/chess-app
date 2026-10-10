// The rating arithmetic of a rated puzzle, in one place. Imports nothing, so it
// runs under plain Node (tests/unit/elo.test.js) as well as in the app.
//
// Used by Puzzles (js/app.js recordResult, for the rating and for each theme's)
// and by Sealed Moves (js/calc.js calcPay). Blindfold has its own in
// js/blind-elo.js: its normal K is 32 and it pays by the seconds of the look.
//
//  - The first 10 rated attempts calibrate fast (K 192), so a strong player
//    starting low is not ground slowly through puzzles far below their level;
//    after that K is 24.
//  - The rating never goes under 600.

export const ELO_FLOOR = 600;
export const ELO_K = 24;
export const ELO_FAST_K = 192;
export const ELO_FAST_ATTEMPTS = 10;

// `attemptCount` is how many rated attempts came BEFORE this one.
export const eloK = attemptCount => (attemptCount < ELO_FAST_ATTEMPTS ? ELO_FAST_K : ELO_K);

// The share of the point a player rated `elo` is expected to take from a
// puzzle rated `rating`.
export const eloExpected = (elo, rating) => 1 / (1 + Math.pow(10, (rating - elo) / 400));

// The rating after one attempt. `factor` scales what the attempt moves (Sealed
// Moves: 1.25 for a perfect solve, 0.5 for a solve with a hint); 1 is Puzzles.
export function eloAfter({ elo, rating, win, attemptCount, factor = 1 }) {
  return Math.max(ELO_FLOOR, elo + eloK(attemptCount) * factor * ((win ? 1 : 0) - eloExpected(elo, rating)));
}
