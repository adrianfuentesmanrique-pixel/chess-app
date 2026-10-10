// How a move feels: how long the opponent waits before replying, how long a
// piece takes to slide, and which sound a move makes. Numbers and one rule,
// nothing else — this file imports nothing so it runs under plain Node.
//
// Design: docs/superpowers/specs/2026-10-10-move-feel-and-sounds-design.md
// (measured against lichess: 250 ms slide, puzzle reply 250-375 ms, opening
// move 500 ms, Puzzle Storm with no added wait at all).

// The slide of a piece that lands on a board, in ms. The curve is lichess's
// cubic ease-in-out.
export const SLIDE_MS = 200;
export const SLIDE_EASING = 'cubic-bezier(.65, 0, .35, 1)';

// The wait, in ms, before the other side's move is drawn. One name per place
// a screen waits, so no screen carries a bare number of its own.
export const REPLY_MS = Object.freeze({
  puzzleReply: 250,
  puzzleOpening: 400,     // a new puzzle is on screen -> the move that sets it
  // Rush and Duel share one engine (js/pulso-match.js builds on Rush).
  rushReply: 150,
  rushNext: 250,          // solved -> the next puzzle is put up
  rushOpening: 200,       // …and its opening move
  // Blindfold's replies are heard, not seen: two knocks closer than this blur
  // into one and "my move" can no longer be told from "the reply" by ear.
  blindReply: 400,
  blindOpening: 500,
  trainerBook: 250,       // Openings, while still in the book
  endgameBook: 250,
  endgameOpening: 400,    // a study where the opponent moves first
});

// Thinking time handed to the engine, in ms, where the wait IS the thinking.
export const THINK_MS = Object.freeze({
  endgame: 400,
  lesson: 300,
});

// No wait may be shorter than this, or a reply would be drawn over the slide
// of the move it answers.
export const MIN_REPLY_MS = 150;

// One sound per move. A move can be several things at once (a capture that
// gives check, a promotion that captures); the rarest, most telling one wins.
export function moveSoundKind({ check = false, promotion = false, castle = false, capture = false } = {}) {
  if (check) return 'check';
  if (promotion) return 'promote';
  if (castle) return 'castle';
  if (capture) return 'capture';
  return 'move';
}

// The board's own sounds that have a file. A kind that is not listed here
// sounds as a plain move or capture instead (v182 ran that way, after the
// code-made sounds of v181 were withdrawn). Since v183 all five are CC0
// recordings Adrian chose by ear — sources in docs/sound-sources.md.
export const BOARD_SOUNDS = Object.freeze(['move', 'capture', 'check', 'castle', 'promote']);

// Every file in sounds/, without the .wav. sw.js precaches exactly these and
// js/sound.js loads them at start, so a sound never waits on the network.
export const SOUND_NAMES = Object.freeze([
  'move', 'capture', 'check', 'castle', 'promote',
  'puzzle-correct', 'puzzle-wrong', 'game-win', 'game-lose', 'game-draw', 'kael-pop',
]);

// What a move from `from` to `to` was, read off the two positions' piece
// grids ({ e4: { color, type } }) — the board knows nothing else about it.
// Check is not decided here: it needs the rules of chess, which the caller has.
export function moveTraits(before, after, from, to) {
  const moved = before[from];
  const count = g => Object.keys(g).length;
  const castle = !!moved && moved.type === 'k' && from[1] === to[1]
    && Math.abs(to.charCodeAt(0) - from.charCodeAt(0)) === 2;
  const promotion = !!moved && moved.type === 'p' && !!after[to] && after[to].type !== 'p';
  return { capture: count(after) < count(before), castle, promotion };
}

// Where the rook goes when the king castles from `from` to `to`, so the rook
// can slide too. Null for any other move.
export function castleRookMove(from, to) {
  const rank = from[1];
  if (from[0] !== 'e' || to[1] !== rank) return null;
  if (to[0] === 'g') return { from: 'h' + rank, to: 'f' + rank };
  if (to[0] === 'c') return { from: 'a' + rank, to: 'd' + rank };
  return null;
}
