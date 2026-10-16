// Learn tab stages — the rules of a level, its stars and the saved progress.
// No DOM, no storage: js/stages-ui.js does those. Plan:
// docs/plans/2026-10-15-learn-stages.md.
//
// Nothing here is rated. The progress lives only on the phone
// (db 'learnProgress'), never in the endgame rating or the profile radar.

// Did the player's move do what the level asks? `move` is chess.js's verbose
// move, `after` the position once it is played. `why` names what was missing,
// for the line the player reads (i18n stage_why_<why>).
export function levelVerdict(level, move, after) {
  switch (level.goal) {
    case 'check':
      return after.inCheck() ? ok() : no('not_check');
    case 'mate':
      return after.isCheckmate() ? ok() : no('not_mate');
    case 'escape': {
      // chess.js only lets legal moves through, so every move is already out
      // of check; the level asks for one way out in particular.
      const way = move.piece === 'k' ? 'king' : move.captured ? 'capture' : 'block';
      return !level.how || way === level.how ? ok() : no('escape_' + level.how);
    }
    default:
      return no('unknown');
  }
}
const ok = () => ({ ok: true, why: null });
const no = why => ({ ok: false, why });

// First try ★★★, one mistake ★★, more ★. A level solved after "Pista" is ★.
export function levelStars(mistakes, hinted) {
  if (hinted) return 1;
  return mistakes === 0 ? 3 : mistakes === 1 ? 2 : 1;
}

// progress = { [stageId]: [stars per level] }, 0 = not done yet. Returns a new
// object; the best result of a level is kept.
export function recordLevel(progress, stageId, levelIdx, stars, levelCount) {
  const row = Array.from({ length: levelCount }, (_, i) => (progress[stageId] || [])[i] || 0);
  row[levelIdx] = Math.max(row[levelIdx], stars);
  return { ...progress, [stageId]: row };
}

export function stageStars(progress, stage) {
  const row = progress[stage.id] || [];
  const stars = stage.levels.map((_, i) => row[i] || 0);
  const done = stars.filter(s => s > 0).length;
  return { got: stars.reduce((a, b) => a + b, 0), max: stage.levels.length * 3, done, complete: done === stage.levels.length };
}

export function sectionSummary(progress, section) {
  let got = 0, max = 0, stagesDone = 0;
  for (const st of section.stages) {
    const s = stageStars(progress, st);
    got += s.got; max += s.max;
    if (s.complete) stagesDone++;
  }
  return { got, max, stagesDone, stages: section.stages.length };
}

// The first stage not finished yet (the gold "next" row), or -1.
export function nextStageIdx(progress, section) {
  return section.stages.findIndex(st => !stageStars(progress, st).complete);
}

// Where opening a stage starts: its first unsolved level; a finished stage
// starts again from the top.
export function firstOpenLevel(progress, stage) {
  const row = progress[stage.id] || [];
  const i = stage.levels.findIndex((_, k) => !row[k]);
  return i < 0 ? 0 : i;
}

// What comes back from storage is trusted only as far as its shape.
export function cleanProgress(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, row] of Object.entries(raw)) {
    if (!Array.isArray(row)) continue;
    out[id] = row.map(s => (Number.isInteger(s) && s >= 0 && s <= 3 ? s : 0));
  }
  return out;
}
