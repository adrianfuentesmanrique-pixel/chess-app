// Coordinates (Learn tab): the rules. The screen is js/coord-ui.js.
//
// Two exercises against the clock. 'find': a name is shown and the player taps
// that square. 'name': a square is lit and the player gives its name on two
// rows of keys, a letter then a number.
//
// A TRAINING TOOL, not a rating: no ELO, no leaderboard, nothing published.
// The only thing kept is the player's own best timed score, one per exercise
// (kv coordBestFind, coordBestName; synced, never public).
//
// Imports nothing, so tests/unit/coord.test.js runs it under plain Node.

const FILES = 'abcdefgh';
const RANKS = '12345678';

export const COORD_SQUARES = [...RANKS].flatMap(r => [...FILES].map(f => f + r));
export const COORD_SECONDS = 30;
// Right answers a timed run needs for the day to count towards the streak.
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

export function coordNewRun({ mode, timed, side, rnd = Math.random }) {
  const orientation = coordSide(side, rnd);
  const asked = coordNext(null, rnd);
  return { mode, timed, orientation, score: 0, wrong: 0, asked, next: coordNext(asked, rnd) };
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

export function coordBestKey(mode) { return mode === 'name' ? 'coordBestName' : 'coordBestFind'; }

export function coordIsBest(run, best) { return !!run.timed && run.score > (best || 0); }

export function coordCountsForStreak(run) { return !!run.timed && run.score >= COORD_STREAK_MIN; }

// "0:24". Rounded up, so 0:00 is only ever shown when the time is gone.
export function coordClock(msLeft) {
  const s = Math.max(0, Math.ceil(msLeft / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
