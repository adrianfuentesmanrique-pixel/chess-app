// Blindfold rating maths. Imports nothing, so it runs under plain Node
// (tests/unit/blind-elo.test.js) as well as in the app.
//
// The rules, in the order a player meets them:
//  - The first 10 blindfold puzzles calibrate fast, exactly like Puzzles.
//  - 10 seconds is the reference look: it pays the NORMAL points and no extra.
//  - Under 10 s a clean win pays EXTRA on top: normal × (10 − s) ÷ 8, so a
//    2-second look doubles it. The extra is always sized off the normal K,
//    never the fast-start K, so calibration cannot be multiplied.
//  - Over 10 s a win pays less (75% at 15 s, 50% at 20 s) — otherwise a long
//    look would be an easier mode at full pay.
//  - A peek cancels ONLY the extra. The normal points are paid in full.
//  - A loss is the same size whatever the time chosen and whether or not the
//    player peeked.
//  - List mode is scored as a 2-second look (BLIND_LIST_PAY_SECONDS).

export const BLIND_SECONDS_MIN = 1;
export const BLIND_SECONDS_MAX = 20;
export const BLIND_SECONDS_DEFAULT = 10;

// List mode (the position is read as a written list, never seen) always pays
// like this many seconds of look, however long the list was read: the normal
// points in full plus an equal extra, and a peek cancels the extra.
export const BLIND_LIST_PAY_SECONDS = 2;
export const BLIND_LIST_READ_SECONDS = 60;   // the list closes itself after this
export const BLIND_LIST_PEEK_SECONDS = 30;   // a peek brings the list back for this

const NORMAL_K = 32;
const FAST_K = 192;
const FAST_START_ATTEMPTS = 10;
const ELO_FLOOR = 600;

export function clampBlindSeconds(s) {
  const n = Math.round(Number(s));
  if (!Number.isFinite(n)) return BLIND_SECONDS_DEFAULT;
  return Math.max(BLIND_SECONDS_MIN, Math.min(BLIND_SECONDS_MAX, n));
}

// Share of the normal points paid as extra for a short look. 0 at 10 s or more.
export function blindExtraFactor(seconds) {
  const s = clampBlindSeconds(seconds);
  return s < BLIND_SECONDS_DEFAULT ? (BLIND_SECONDS_DEFAULT - s) / 8 : 0;
}

// Share of the normal points a win keeps after a long look. 1 at 10 s or less.
export function blindLongLookFactor(seconds) {
  const s = clampBlindSeconds(seconds);
  return s > BLIND_SECONDS_DEFAULT ? 1 - (s - BLIND_SECONDS_DEFAULT) / 20 : 1;
}

const expectedScore = (elo, rating) => 1 / (1 + Math.pow(10, (rating - elo) / 400));

// The extra a clean solve of this puzzle stands to earn, for showing the
// player before they solve.
export function blindExtraPreview({ elo, rating, seconds }) {
  return NORMAL_K * (1 - expectedScore(elo, rating)) * blindExtraFactor(seconds);
}

// One finished puzzle. Returns the new rating plus the two parts it moved by:
// `normal` (signed) and `extra` (0 unless a clean win at under 10 s).
export function blindEloResult({ elo, rating, win, seconds = BLIND_SECONDS_DEFAULT, peeked = false, attemptCount = FAST_START_ATTEMPTS }) {
  const expected = expectedScore(elo, rating);
  const K = attemptCount < FAST_START_ATTEMPTS ? FAST_K : NORMAL_K;
  let normal, extra = 0;
  if (win) {
    normal = K * (1 - expected) * blindLongLookFactor(seconds);
    if (!peeked) extra = blindExtraPreview({ elo, rating, seconds });
  } else {
    normal = -K * expected;
  }
  return { elo: Math.max(ELO_FLOOR, elo + normal + extra), normal, extra };
}
