// Game history: every game played against the engine, stored locally.
//
// The PGN is the source of truth and every other field is derived from it.
// That is what keeps future work cheap: a cloud backup uploads these records
// as they stand, imported or human games are the same record with a different
// `source`, and favorites/notes/analysis are new optional fields. None of
// those need a migration.
import * as db from './db.js';
import { classifyOpening } from './openings-eco.js';

export const HISTORY_VERSION = 1;

// A game shorter than this was a misclick, not a game.
export const HISTORY_MIN_PLIES = 4;

function newUid() {
  return `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// Why the game stopped. Order matters: checkmate outranks everything, and a
// resignation is a player decision that no position check can detect.
export function endReasonOf(chess, { resigned = false, abandoned = false } = {}) {
  if (chess.isCheckmate()) return 'checkmate';
  if (resigned) return 'resign';
  if (chess.isStalemate()) return 'stalemate';
  if (chess.isThreefoldRepetition()) return 'repetition';
  if (chess.isInsufficientMaterial()) return 'insufficient';
  if (chess.isDrawByFiftyMoves()) return 'fiftyMove';
  if (chess.isDraw()) return 'draw';
  if (abandoned) return 'abandoned';
  return 'abandoned';
}

// `result` is the PGN-standard string; `outcome` is the same fact from the
// player's point of view, which is what the filters use.
export function resultOf(chess, playerColor, { resigned = false } = {}) {
  if (chess.isCheckmate()) {
    const winner = chess.turn() === 'w' ? 'b' : 'w';
    return { result: winner === 'w' ? '1-0' : '0-1',
             outcome: winner === playerColor ? 'win' : 'loss' };
  }
  if (resigned) {
    return { result: playerColor === 'w' ? '0-1' : '1-0', outcome: 'loss' };
  }
  if (chess.isDraw() || chess.isStalemate()) {
    return { result: '1/2-1/2', outcome: 'draw' };
  }
  return { result: '*', outcome: 'unfinished' };
}

export function buildRecord({ chess, startFen, playerColor, level, levelElo,
                              playedAt, pgn, resigned = false, abandoned = false }) {
  const history = chess.history();
  const { result, outcome } = resultOf(chess, playerColor, { resigned });
  return {
    uid: newUid(),
    version: HISTORY_VERSION,
    source: 'stockfish',
    playedAt,
    endedAt: Date.now(),
    playerColor,
    level,
    levelElo,
    result,
    outcome,
    endReason: endReasonOf(chess, { resigned, abandoned }),
    moveCount: Math.ceil(history.length / 2),
    opening: classifyOpening(history) || '',
    startFen,
    finalFen: chess.fen(),
    pgn,
  };
}

export function saveGame(rec) {
  return db.addHistoryGame(rec);
}
