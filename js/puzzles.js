// The puzzle library, split into ten files by rating.
//
// 30,000 puzzles is ~5 MB — too much to ship as one bundle in an offline-first
// app, and mostly wasted: a 900-rated player will never see a 2400 puzzle.
// Instead each rating band is its own file and only the bands near the
// player's rating are fetched, so a session costs ~0.5 MB rather than 5 MB.
//
// PUZZLES is a single array that is APPENDED to as bands load. Every consumer
// holds the same reference, so nothing needs to re-read it when more arrives.
// It starts empty — call ensureForRating() before relying on its contents.

export const PUZZLES = [];

// Radar-eligible themes. These are motifs a player can meaningfully train and
// be rated on. Order matters: it is the default order of the radar axes.
export const PUZZLE_THEMES = [
  'fork', 'pin', 'discoveredAttack', 'doubleCheck', 'deflection', 'attraction',
  'clearance', 'xRayAttack', 'zugzwang', 'hangingPiece', 'trappedPiece',
  'capturingDefender', 'quietMove',
  'sacrifice', 'defensiveMove', 'advancedPawn', 'backRankMate', 'promotion',
  'skewer', 'discoveredCheck', 'intermezzo', 'smotheredMate', 'interference',
  'mateIn1', 'mateIn2', 'mateIn3', 'mateIn4', 'mateIn5',
];

// Named mating patterns. They earn ELO and can be filtered on, but they are
// shapes rather than skills, so they never become radar axes.
export const PUZZLE_PATTERNS = [
  'operaMate', 'pillsburysMate', 'epauletteMate', 'arabianMate', 'anastasiaMate',
  'hookMate', 'cornerMate', 'bodenMate', 'dovetailMate', 'doubleBishopMate',
  'morphysMate', 'blindSwineMate', 'killBoxMate', 'vukovicMate', 'balestraMate',
  'swallowstailMate', 'triangleMate',
];

// Everything that carries a rating.
export const TRACKED_THEMES = [...PUZZLE_THEMES, ...PUZZLE_PATTERNS];

// Must match the bands the extractor wrote. Index === file number.
export const BANDS = [
  [0, 799], [800, 999], [1000, 1199], [1200, 1399], [1400, 1599],
  [1600, 1799], [1800, 1999], [2000, 2199], [2200, 2399], [2400, 9999],
];

export function bandOf(rating) {
  const i = BANDS.findIndex(([lo, hi]) => rating >= lo && rating <= hi);
  return i < 0 ? BANDS.length - 1 : i;
}

const loading = new Map();   // band index -> in-flight promise
const done = new Set();

export function isBandLoaded(i) { return done.has(i); }

// Loads one band exactly once, even if several callers ask at the same time.
export function loadBand(i) {
  if (done.has(i)) return Promise.resolve();
  if (loading.has(i)) return loading.get(i);
  const p = fetch(`puzzles/puzzles-${i}.json`)
    .then(r => { if (!r.ok) throw new Error(`puzzles-${i}: HTTP ${r.status}`); return r.json(); })
    .then(list => { PUZZLES.push(...list); done.add(i); })
    .catch(err => {
      // A failed band must not poison the cache — let a later attempt retry.
      console.error('Puzzle band failed to load', i, err);
      throw err;
    })
    .finally(() => loading.delete(i));
  loading.set(i, p);
  return p;
}

// Loads the band covering `rating` plus its neighbours, so the player has
// headroom in both directions without waiting again after every rating change.
export async function ensureForRating(rating, spread = 1) {
  const c = bandOf(rating);
  const wanted = [];
  for (let i = c - spread; i <= c + spread; i++) {
    if (i >= 0 && i < BANDS.length) wanted.push(i);
  }
  // The centre band is what the player actually needs; if a neighbour fails
  // (offline, say) that should not block play.
  await loadBand(c);
  await Promise.allSettled(wanted.filter(i => i !== c).map(loadBand));
}

// Puzzle of the day must be the same for everyone at a given rating tier, so
// it is drawn from one whole band rather than "whatever happens to be loaded".
export async function ensureBand(i) { await loadBand(i); }

export function puzzlesInBand(i) {
  const [lo, hi] = BANDS[i];
  return PUZZLES.filter(p => p.rating >= lo && p.rating <= hi);
}
