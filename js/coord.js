// Coordinates (Learn tab): the rules. The screen is js/coord-ui.js.
//
// Two exercises against the clock. 'find': a name is shown and the player taps
// that square. 'name': a square is lit and the player gives its name on two
// rows of keys, a letter then a number.
//
// A TRAINING TOOL, not a rating: no ELO, no leaderboard, nothing published.
// The only thing kept is the player's own best timed score, one per exercise
// and per length of run (kv coordBestFind, coordBestName for 30 seconds, then
// coordBestFind60 ... coordBestName180; synced, never public).
//
// Imports nothing, so tests/unit/coord.test.js runs it under plain Node.

const FILES = 'abcdefgh';
const RANKS = '12345678';

export const COORD_SQUARES = [...RANKS].flatMap(r => [...FILES].map(f => f + r));
// A timed run lasts what the player chose on the setup's slider: from
// COORD_SECONDS (also what a new player gets) to COORD_SECONDS_MAX, in steps.
export const COORD_SECONDS = 30;
export const COORD_SECONDS_MAX = 180;
export const COORD_SECONDS_STEP = 30;
// Every length there is: 30, 60, ... 180.
export const COORD_LENGTHS = Array.from({ length: (COORD_SECONDS_MAX - COORD_SECONDS) / COORD_SECONDS_STEP + 1 }, (_, i) => COORD_SECONDS + i * COORD_SECONDS_STEP);
// Right answers a timed run needs for the day to count towards the streak,
// whatever its length (Adrian, 2026-10-13: a longer run is not asked for more).
export const COORD_STREAK_MIN = 10;

// Any square but `prev`, each as likely as the next.
export function coordNext(prev, rnd = Math.random) {
  const pool = prev ? COORD_SQUARES.filter(s => s !== prev) : COORD_SQUARES;
  return pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))];
}

// The side at the bottom of the board: 'w', 'b', or 'random' for either.
export function coordSide(choice, rnd = Math.random) {
  return choice === 'w' || choice === 'b' ? choice : rnd() < 0.5 ? 'w' : 'b';
}

// A length the slider can stand on. Anything else (a saved value from another
// version, nothing at all) becomes the nearest one, or the shortest.
export function coordSeconds(value) {
  const n = Math.round(+value / COORD_SECONDS_STEP) * COORD_SECONDS_STEP;
  if (n > COORD_SECONDS_MAX) return COORD_SECONDS_MAX;
  return n >= COORD_SECONDS ? n : COORD_SECONDS;
}

// `seconds` is the run's length; 0 when there is no clock.
export function coordNewRun({ mode, timed, side, seconds = COORD_SECONDS, rnd = Math.random }) {
  const orientation = coordSide(side, rnd);
  const asked = coordNext(null, rnd);
  return { mode, timed, seconds: timed ? coordSeconds(seconds) : 0, orientation, score: 0, wrong: 0, asked, next: coordNext(asked, rnd) };
}

// How much of the run's time is left, 0 to 100: the width of the bar.
export function coordBar(run, msLeft) {
  if (!run.seconds) return 0;
  return Math.max(0, Math.min(100, msLeft / (run.seconds * 10)));
}

// Right: one point, and the square that was waiting is asked. Wrong: no point
// is lost and the same square stays asked; the time it costs is the penalty.
export function coordAnswer(run, square, rnd = Math.random) {
  if (square !== run.asked) { run.wrong++; return false; }
  run.score++;
  run.asked = run.next;
  run.next = coordNext(run.asked, rnd);
  return true;
}

// One key of the 'name' exercise. `entry` is '' or the letter already given.
// A letter replaces the letter; a number after a letter completes the name.
export function coordKey(entry, key) {
  if (FILES.includes(key) && key.length === 1) return { entry: key, square: null };
  if (entry && RANKS.includes(key) && key.length === 1) return { entry: '', square: entry + key };
  return { entry, square: null };
}

// A best is only ever compared with runs of the same exercise AND the same
// length: three minutes always outscore thirty seconds. The 30-second keys are
// the ones that existed before the slider, so those bests are kept.
// Each key is also listed by name in SYNCED_KEYS (js/firebase.js).
export function coordBestKey(mode, seconds = COORD_SECONDS) {
  const s = coordSeconds(seconds);
  return (mode === 'name' ? 'coordBestName' : 'coordBestFind') + (s === COORD_SECONDS ? '' : s);
}

export function coordIsBest(run, best) { return !!run.timed && run.score > (best || 0); }

export function coordCountsForStreak(run) { return !!run.timed && run.score >= COORD_STREAK_MIN; }

// "0:24". Rounded up, so 0:00 is only ever shown when the time is gone.
export function coordClock(msLeft) {
  const s = Math.max(0, Math.ceil(msLeft / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
