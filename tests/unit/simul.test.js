// Simul: the pure rules of one board of a simultaneous exhibition — start
// position, opening, packed moves, turn, clock, endings, the teacher's next
// board. js/simul.js imports only vendor/chess.js, js/tree.js and js/pulso.js,
// so this runs under plain Node.
//
// The referee will be firestore.rules (the simulGames block, not written yet).
// refereeMove() below is that block's move check as this file promises it: the
// rules are to be written against it, line for line.
//
// Run: npm run test:tree
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SIMUL, MAX_SIMUL_BOARDS, clockOffset, buildStart, startClocks, packMove, unpackMove,
  unpackMoves, tryMove, replayOpening, checkStart, colourToMove, roleOf, sideToMove,
  positionOf, settle, timeLeft, inTime, flagged, mayClaimFlag, moveWrite, boardResult,
  resultOf, resultHolds, mayOfferDraw, waitingBoards, nextBoard, coloursFor, inviteOpen, shownPosition, voidable,
  mayReplace,
} from '../../js/simul.js';
import { clockOffset as pulsoClockOffset } from '../../js/pulso.js';
import { Chess } from '../../vendor/chess.js';
import { START_FEN, GameTree, parsePgn } from '../../js/tree.js';
import { OPENINGS_ECO } from '../../js/openings-eco.js';

const T0 = 1_760_000_000_000;   // a server stamp, in ms

// A live board as it is stored, stamps in ms. 10 + 5, teacher White.
const game = (over = {}) => ({
  t: 'T', s: 'S', cls: ['S'], status: 'live', invitedAt: T0 - 60_000, startAt: T0, at: T0, prevAt: T0,
  fen: START_FEN, op: '', tc: 'w', base: 600, inc: 5, tMs: 600_000, sMs: 600_000,
  mv: '', n: 0, draw: null, tDr: -1, sDr: -1, winner: null, reason: null, by: null, ...over,
});

const pack = (...uci) => uci.map(u => (u.length === 4 ? u + '-' : u)).join('');

// A repeatable stand-in for Math.random.
function seeded(seed = 1) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

// ── Constants ─────────────────────────────────────────────────────────────
test('the numbers Adrian agreed', () => {
  assert.equal(MAX_SIMUL_BOARDS, 10);
  assert.equal(SIMUL.MAX_BOARDS, 10);
  assert.deepEqual(SIMUL.CLOCKS.map(c => `${c.base / 60}+${c.inc}`), ['10+5', '15+10', '30+20', '60+30']);
  assert.deepEqual(SIMUL.NO_CLOCK, { base: 0, inc: 0 });
  assert.equal(SIMUL.INVITE_MS, 10 * 60 * 1000);
  assert.equal(SIMUL.ABANDONED_MS, 3 * 60 * 60 * 1000);
  assert.equal(SIMUL.DRAW_GAP_MOVES, 10);
  assert.equal(SIMUL.OPENING_MAX_MOVES, 20);
});

test('the clock offset is Duel\'s own function, not a second one', () => {
  assert.equal(clockOffset, pulsoClockOffset);
});

// ── The start position ────────────────────────────────────────────────────
const HANDICAPS = [
  ['no a1 rook', 'w', ['a1'], 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/1NBQKBNR w Kkq - 0 1', 'e4'],
  ['no h1 rook', 'w', ['h1'], 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBN1 w Qkq - 0 1', 'e4'],
  ['no a8 rook as Black', 'b', ['a8'], '1nbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQk - 0 1', 'e4'],
  ['no queen, a-rook or f-pawn', 'w', ['d1', 'a1', 'f2'], 'rnbqkbnr/pppppppp/8/8/8/8/PPPPP1PP/1NB1KBNR w Kkq - 0 1', 'e4'],
  ['king and pawns only', 'w', ['a1', 'b1', 'c1', 'd1', 'f1', 'g1', 'h1'], 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/4K3 w kq - 0 1', 'e4'],
  ['a bare king', 'w', ['a1', 'b1', 'c1', 'd1', 'f1', 'g1', 'h1', 'a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2'],
    'rnbqkbnr/pppppppp/8/8/8/8/8/4K3 w kq - 0 1', 'Kd2'],
];

for (const [name, tc, squares, fen, first] of HANDICAPS) {
  test(`handicap: ${name} — the FEN, accepted by the library, and out to PGN and back`, () => {
    const r = buildStart(tc, squares);
    assert.equal(r.ok, true);
    assert.equal(r.fen, fen);
    assert.deepEqual(r.removed.map(x => x.square), squares);
    assert.deepEqual(checkStart(r.fen), { ok: true, fen, sans: [] });
    assert.ok(new Chess(r.fen).moves().length > 0);
    const tree = new GameTree(r.fen);
    assert.ok(tree.play(first));
    const back = parsePgn(tree.toPgn());
    assert.equal(back.startFen, fen);
    assert.equal(back.root.children[0].san, first);
  });
}

test('no handicap is the ordinary start position', () => {
  assert.equal(buildStart('w').fen, START_FEN);
  assert.equal(buildStart('b', []).fen, START_FEN);
});

test('both rooks gone: neither castling right for the teacher, the student keeps both', () => {
  assert.equal(buildStart('w', ['a1', 'h1']).fen.split(' ')[2], 'kq');
  assert.equal(buildStart('b', ['a8', 'h8']).fen.split(' ')[2], 'KQ');
  assert.equal(buildStart('b', ['h8']).fen.split(' ')[2], 'KQq');
});

test('a square named twice is taken once', () => {
  assert.deepEqual(buildStart('w', ['a1', 'a1']).removed, [{ square: 'a1', type: 'r' }]);
});

test('the king is never given', () => {
  assert.deepEqual(buildStart('w', ['a1', 'e1']), { ok: false, reason: 'king', square: 'e1' });
  assert.deepEqual(buildStart('b', ['e8']), { ok: false, reason: 'king', square: 'e8' });
});

test('only the teacher\'s own pieces: not the student\'s, not an empty square, not a made-up one', () => {
  assert.deepEqual(buildStart('w', ['a8']), { ok: false, reason: 'piece', square: 'a8' });
  assert.deepEqual(buildStart('b', ['d1']), { ok: false, reason: 'piece', square: 'd1' });
  assert.deepEqual(buildStart('w', ['e4']), { ok: false, reason: 'piece', square: 'e4' });
  assert.deepEqual(buildStart('w', ['z9']), { ok: false, reason: 'square', square: 'z9' });
  assert.deepEqual(buildStart('w', [null]), { ok: false, reason: 'square', square: null });
  assert.equal(buildStart('x', []).reason, 'colour');
});

test('the trap: the library takes a castling right whose rook is missing, and keeps it', () => {
  const wrong = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/1NBQKBNR w KQkq - 0 1';
  const chess = new Chess(wrong);
  assert.equal(chess.fen(), wrong);                                // the wrong right travels
  assert.ok(!chess.moves().includes('O-O-O'));                     // not offered here: the b1 knight is in the way
  // This file never builds it, and a phone that is sent it refuses.
  assert.deepEqual(checkStart(wrong), { ok: false, reason: 'castling' });
});

// Found 2026-10-12, and worse than the spec's section 2 says ("it never offers
// the impossible castling move"): once the squares between are empty the
// library DOES castle towards a corner with no rook on it. The king jumps two
// squares and no rook moves. So the right has to be gone from the FEN, and a
// FEN that still carries it is refused.
test('the trap, in full: with the way clear the library castles with a rook that is not there', () => {
  const wrong = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/4K2R w KQkq - 0 1';
  const chess = new Chess(wrong);
  assert.ok(chess.moves().includes('O-O-O'));
  chess.move('O-O-O');
  assert.equal(chess.fen().split(' ')[0], 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/2K4R');
  assert.deepEqual(checkStart(wrong), { ok: false, reason: 'castling' });
  // The same board as this file builds it: no right, no move.
  const right = buildStart('w', ['a1', 'b1', 'c1', 'd1', 'f1', 'g1']).fen;
  assert.equal(right, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/4K2R w Kkq - 0 1');
  const fixed = new Chess(right);
  assert.ok(fixed.moves().includes('O-O'));
  assert.ok(!fixed.moves().includes('O-O-O'));
  // A right whose KING has left home is refused too.
  assert.deepEqual(checkStart('rnbqkbnr/pppppppp/8/8/8/4K3/PPPPPPPP/RNBQ1BNR b KQkq - 1 1'), { ok: false, reason: 'castling' });
});

test('start clocks: both sides the control, the teacher the extra minutes on top', () => {
  assert.deepEqual(startClocks(SIMUL.CLOCKS[0]), { base: 600, inc: 5, tMs: 600_000, sMs: 600_000 });
  assert.deepEqual(startClocks(SIMUL.CLOCKS[3], 20 * 60), { base: 3600, inc: 30, tMs: 4_800_000, sMs: 3_600_000 });
  assert.deepEqual(startClocks(SIMUL.NO_CLOCK, 600), { base: 0, inc: 0, tMs: 0, sMs: 0 });
});

// ── The opening ───────────────────────────────────────────────────────────
test('opening: the Italian without the b1 knight plays through', () => {
  const start = buildStart('w', ['b1']).fen;
  const r = replayOpening(start, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']);
  assert.equal(r.ok, true);
  assert.equal(r.op, 'e2e4-e7e5-g1f3-b8c6-f1c4-');
  assert.deepEqual(r.sans, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']);
  assert.equal(r.fen.split(' ')[1], 'b');
  // What the student's phone gets from the stored fen and op is the same place.
  assert.deepEqual(checkStart(start, r.op), { ok: true, fen: r.fen, sans: r.sans });
});

test('opening: the Ruy Lopez without the h1 rook stops at O-O', () => {
  const r = replayOpening(buildStart('w', ['h1']).fen, ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O']);
  assert.deepEqual(r, { ok: false, reason: 'illegal', index: 8, san: 'O-O' });
});

test('opening: a line with Nf3 without the g1 knight stops at Nf3', () => {
  const r = replayOpening(buildStart('w', ['g1']).fen, ['e4', 'e5', 'Nf3', 'Nc6']);
  assert.deepEqual(r, { ok: false, reason: 'illegal', index: 2, san: 'Nf3' });
});

test('opening: Black\'s missing piece stops Black\'s move', () => {
  const r = replayOpening(buildStart('b', ['b8']).fen, ['e4', 'e5', 'Nf3', 'Nc6']);
  assert.deepEqual(r, { ok: false, reason: 'illegal', index: 3, san: 'Nc6' });
});

test('opening: none is allowed and changes nothing', () => {
  assert.deepEqual(replayOpening(START_FEN, []), { ok: true, fen: START_FEN, op: '', sans: [] });
});

test('opening: 20 moves a side is the most', () => {
  const shuffle = n => Array.from({ length: n }, (_, i) => ['Nf3', 'Nf6', 'Ng1', 'Ng8'][i % 4]);
  // 40 single moves of knights out and back would be a repetition; use a real line.
  const long = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6', 'c3', 'O-O',
    'h3', 'Nb8', 'd4', 'Nbd7', 'Nbd2', 'Bb7', 'Bc2', 'Re8', 'Nf1', 'Bf8', 'Ng3', 'g6', 'a4', 'c5', 'd5', 'c4',
    'Bg5', 'h6', 'Be3', 'Nc5', 'Qd2', 'h5', 'Bg5', 'Be7'];
  assert.equal(long.length, 40);
  const ok = replayOpening(START_FEN, long);
  assert.equal(ok.ok, true);
  assert.equal(ok.op.length, 200);
  assert.equal(checkStart(START_FEN, ok.op).ok, true);
  assert.deepEqual(replayOpening(START_FEN, [...long, 'Bh6']), { ok: false, reason: 'long', index: 40, san: 'Bh6' });
  assert.equal(replayOpening(START_FEN, shuffle(41)).reason, 'long');
});

test('opening: a line that ends the game is refused', () => {
  assert.deepEqual(replayOpening(START_FEN, ['f3', 'e5', 'g4', 'Qh4#']), { ok: false, reason: 'over', index: 3, san: 'Qh4#' });
});

test('opening: a start position the library refuses', () => {
  assert.deepEqual(replayOpening('not a position', ['e4']), { ok: false, reason: 'fen', index: -1, san: null });
});

test('opening: every named opening in the app plays on the ordinary start position', () => {
  for (const o of OPENINGS_ECO) {
    const r = replayOpening(START_FEN, o.moves);
    assert.equal(r.ok, true, `${o.name}: ${JSON.stringify(r)}`);
    assert.equal(checkStart(START_FEN, r.op).fen, r.fen, o.name);
  }
});

// ── The student's check ───────────────────────────────────────────────────
test('start check: exactly one king each', () => {
  assert.equal(checkStart('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQ1BNR w kq - 0 1').ok, false);
  assert.equal(checkStart('rnbq1bnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1').ok, false);
  assert.equal(checkStart('rnbqkbnr/pppppppp/8/8/4K3/8/PPPPPPPP/RNBQKBNR w kq - 0 1').ok, false);
  assert.equal(checkStart('rnbqkbnr/pppppppp/8/4k3/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1').ok, false);
});

test('start check: not a position at all', () => {
  for (const fen of ['', 'hello', null, undefined, 42, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0',
    'rnbqkbnr/pppppppp/9/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1']) {
    assert.deepEqual(checkStart(fen), { ok: false, reason: 'fen' }, String(fen));
  }
});

test('start check: the side to move is not already mated or stalemated', () => {
  assert.deepEqual(checkStart('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'), { ok: false, reason: 'over' });
  assert.deepEqual(checkStart('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'), { ok: false, reason: 'over' });
});

test('start check: the side that is not to move cannot be in check', () => {
  assert.deepEqual(checkStart('4k3/8/8/8/8/8/4R3/4K3 w - - 0 1'), { ok: false, reason: 'check' });
  assert.equal(checkStart('4k3/8/8/8/8/8/4R3/4K3 b - - 0 1').ok, true);
});

test('start check: an opening that is malformed, too long, or does not play', () => {
  assert.deepEqual(checkStart(START_FEN, 'e2e4'), { ok: false, reason: 'opening' });
  assert.deepEqual(checkStart(START_FEN, 'e2e5-'), { ok: false, reason: 'opening' });
  assert.deepEqual(checkStart(START_FEN, 42), { ok: false, reason: 'opening' });
  assert.deepEqual(checkStart(START_FEN, 'g1f3-g8f6-f3g1-f6g8-'.repeat(11)), { ok: false, reason: 'opening' });
  assert.deepEqual(checkStart(START_FEN, pack('f2f3', 'e7e5', 'g2g4', 'd8h4')), { ok: false, reason: 'over' });
});

// ── Moves ─────────────────────────────────────────────────────────────────
test('a move is five characters: from, to, and the promotion piece or a dash', () => {
  assert.equal(packMove({ from: 'e2', to: 'e4' }), 'e2e4-');
  assert.equal(packMove({ from: 'e7', to: 'e8', promotion: 'q' }), 'e7e8q');
  assert.equal(packMove({ from: 'a2', to: 'a1', promotion: 'n' }), 'a2a1n');
  assert.equal(packMove({ from: 'e1', to: 'g1', promotion: undefined }), 'e1g1-');
  assert.deepEqual(unpackMove('e2e4-'), { from: 'e2', to: 'e4' });
  assert.deepEqual(unpackMove('e7e8q'), { from: 'e7', to: 'e8', promotion: 'q' });
});

test('what is not a move packs and unpacks to null', () => {
  for (const m of [null, {}, { from: 'e2' }, { from: 'i2', to: 'e4' }, { from: 'e2', to: 'e9' },
    { from: 'e7', to: 'e8', promotion: 'k' }, { from: 'e7', to: 'e8', promotion: 'Q' }, { from: 'e7', to: 'e8', promotion: 'qq' }]) {
    assert.equal(packMove(m), null, JSON.stringify(m));
  }
  for (const s of ['', 'e2e4', 'e2e4--', 'e2e4 ', 'E2E4-', 'e2e4k', 'e2e4Q', 'i2e4-', 'e0e4-', null, 5]) {
    assert.equal(unpackMove(s), null, String(s));
  }
});

test('the whole string: no separators, any break in the width is refused', () => {
  assert.deepEqual(unpackMoves(''), []);
  assert.deepEqual(unpackMoves('e2e4-e7e5-g7g8q'), [
    { from: 'e2', to: 'e4' }, { from: 'e7', to: 'e5' }, { from: 'g7', to: 'g8', promotion: 'q' }]);
  for (const s of ['e2e4-e7e5', 'e2e4-,e7e5-', 'e2e4- e7e5-', 'e2e4-x7e5-', null]) assert.equal(unpackMoves(s), null, String(s));
});

test('the pattern handed to the rules matches exactly what packMove makes', () => {
  const whole = new RegExp(`^(${SIMUL.MOVE_PATTERN}){3}$`);
  assert.ok(whole.test('e2e4-e7e5-g7g8q'));
  assert.ok(!whole.test('e2e4-e7e5-g7g8k'));
  assert.ok(!whole.test('e2e4-e7e5-'));
  // every legal move of a busy position, promotions included
  const chess = new Chess('r3k2r/1P4P1/8/8/8/8/1p4p1/R3K2R w KQkq - 0 1');
  for (const m of chess.moves({ verbose: true })) {
    const p = packMove(m);
    assert.match(p, new RegExp(`^${SIMUL.MOVE_PATTERN}$`));
    assert.equal(tryMove(new Chess(chess.fen()), p).san, m.san);
  }
});

test('an illegal move is reported and leaves the board alone', () => {
  const chess = new Chess();
  assert.deepEqual(tryMove(chess, 'e2e4-'), { ok: true, san: 'e4' });
  const before = chess.fen();
  assert.deepEqual(tryMove(chess, 'e4e5-'), { ok: false });     // White's pawn, Black's turn
  assert.deepEqual(tryMove(chess, 'e8e6-'), { ok: false });
  assert.deepEqual(tryMove(chess, 'e7e5q'), { ok: false });     // a promotion that is not one
  assert.deepEqual(tryMove(chess, 'rubbish'), { ok: false });
  assert.equal(chess.fen(), before);
});

// ── Whose turn ────────────────────────────────────────────────────────────
test('turn: from the move count, for the teacher as White and as Black', () => {
  assert.equal(sideToMove(game({ tc: 'w', n: 0 })), 't');
  assert.equal(sideToMove(game({ tc: 'w', n: 1 })), 's');
  assert.equal(sideToMove(game({ tc: 'w', n: 40 })), 't');
  assert.equal(sideToMove(game({ tc: 'b', n: 0 })), 's');
  assert.equal(sideToMove(game({ tc: 'b', n: 1 })), 't');
  assert.equal(colourToMove(game({ n: 7 })), 'b');
  assert.equal(roleOf(game({ tc: 'b' }), 'w'), 's');
});

test('turn: after an opening with an odd number of moves, Black moves first', () => {
  const op = pack('e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4');
  assert.equal(colourToMove(game({ op, n: 0 })), 'b');
  assert.equal(sideToMove(game({ op, tc: 'w', n: 0 })), 's');
  assert.equal(sideToMove(game({ op, tc: 'b', n: 0 })), 't');
  assert.equal(sideToMove(game({ op, tc: 'b', n: 1 })), 's');
});

test('turn agrees with the board at every move of a game', () => {
  const op = pack('e2e4', 'e7e5', 'g1f3');
  const moves = ['b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6', 'e1g1'];
  for (let n = 0; n <= moves.length; n++) {
    const g = game({ op, mv: pack(...moves.slice(0, n)), n });
    const p = positionOf(g);
    assert.equal(p.ok, true);
    assert.equal(colourToMove(g), p.chess.turn());
  }
});

// ── The position ──────────────────────────────────────────────────────────
test('position: start, opening and moves on one board', () => {
  const p = positionOf(game({ op: pack('e2e4', 'e7e5'), mv: pack('g1f3', 'b8c6'), n: 2 }));
  assert.equal(p.ok, true);
  assert.deepEqual(p.opening, ['e4', 'e5']);
  assert.deepEqual(p.sans, ['Nf3', 'Nc6']);
  assert.equal(p.chess.fen(), 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3');
});

test('position: the other side\'s impossible move is named — this is what voids a board', () => {
  assert.deepEqual(positionOf(game({ mv: pack('e2e4', 'e7e5', 'e1g1'), n: 3 })),
    { ok: false, where: 'mv', index: 2, move: 'e1g1-' });
  // castling without the rook, on a handicap board
  const fen = buildStart('w', ['h1']).fen;
  assert.deepEqual(positionOf(game({ fen, mv: pack('g1f3', 'e7e5', 'e2e4', 'b8c6', 'f1c4', 'g8f6', 'e1g1'), n: 7 })),
    { ok: false, where: 'mv', index: 6, move: 'e1g1-' });
});

test('position: a move string that is malformed or does not match the count', () => {
  assert.deepEqual(positionOf(game({ mv: 'e2e4', n: 1 })), { ok: false, where: 'mv', index: -1, move: null });
  assert.deepEqual(positionOf(game({ mv: 'e2e4-', n: 2 })), { ok: false, where: 'mv', index: -1, move: null });
  assert.deepEqual(positionOf(game({ fen: 'nonsense' })), { ok: false, where: 'start', reason: 'fen' });
});

// ── The clock ─────────────────────────────────────────────────────────────
// The move check the rules will make, on stored numbers and the server's time
// of the write only. `d` is the document after the write.
function refereeMove(old, d, now) {
  const who = sideToMove(old);
  const mine = who === 't' ? 'tMs' : 'sMs';
  const theirs = who === 't' ? 'sMs' : 'tMs';
  return old.status === 'live'
    && d.n === old.n + 1
    && d.mv.length === old.mv.length + 5 && d.mv.startsWith(old.mv)
    && new RegExp(`^(${SIMUL.MOVE_PATTERN})*$`).test(d.mv)
    && d.at === now && d.prevAt === old.at
    && d[mine] === old[mine]
    && (old.base === 0
      ? d[theirs] === old[theirs]
      : now - old.at < old[mine]
        && d[theirs] === (old.n === 0 ? old[theirs] : old[theirs] - (old.at - old.prevAt) + old.inc * 1000));
}

// One move by whoever is to move, written at server time `now`.
function play(g, now, packed = 'a1a1-') {
  const who = sideToMove(g);
  const d = { ...g, ...moveWrite(g, who, packed), at: now };
  return d;
}

test('clock: the first move of a game settles nothing, however long it took', () => {
  const g = game();
  assert.deepEqual(settle(g, 't'), { tMs: 600_000, sMs: 600_000 });
  const d = play(g, T0 + 30_000);
  assert.equal(d.tMs, 600_000);
  assert.equal(d.sMs, 600_000);
  assert.equal(d.prevAt, T0);
  assert.ok(refereeMove(g, d, T0 + 30_000));
  // ...but the screen already shows it: 30 s gone, 5 s added.
  assert.equal(timeLeft(d, 't', T0 + 30_000), 575_000);
  assert.equal(timeLeft(d, 's', T0 + 30_000), 600_000);
});

test('clock: the second move settles the first, from the two stored stamps', () => {
  const d1 = play(game(), T0 + 30_000);
  const d2 = play(d1, T0 + 42_000);
  assert.equal(d2.tMs, 575_000);            // 600 s - 30 s + 5 s
  assert.equal(d2.sMs, 600_000);            // the student's own 12 s wait for the next move
  assert.equal(d2.prevAt, T0 + 30_000);
  assert.ok(refereeMove(d1, d2, T0 + 42_000));
  const d3 = play(d2, T0 + 50_000);
  assert.equal(d3.sMs, 593_000);            // 600 s - 12 s + 5 s
  assert.equal(d3.tMs, 575_000);
  assert.ok(refereeMove(d2, d3, T0 + 50_000));
});

test('clock: the teacher as Black — the student moves first and is settled by the teacher', () => {
  const g = game({ tc: 'b' });
  assert.equal(sideToMove(g), 's');
  const d1 = play(g, T0 + 8_000);
  assert.deepEqual([d1.tMs, d1.sMs], [600_000, 600_000]);
  const d2 = play(d1, T0 + 20_000);
  assert.deepEqual([d2.tMs, d2.sMs], [600_000, 597_000]);
  const d3 = play(d2, T0 + 21_000);
  assert.deepEqual([d3.tMs, d3.sMs], [593_000, 597_000]);
  assert.ok(refereeMove(g, d1, T0 + 8_000) && refereeMove(d1, d2, T0 + 20_000) && refereeMove(d2, d3, T0 + 21_000));
});

test('clock: the teacher\'s extra minutes are on the teacher\'s clock only', () => {
  const g = game({ ...startClocks(SIMUL.CLOCKS[0], 20 * 60) });
  assert.equal(timeLeft(g, 't', T0), 1_800_000);
  assert.equal(timeLeft(g, 's', T0), 600_000);
  const d2 = play(play(g, T0 + 700_000), T0 + 701_000);   // 700 s: more than the student's whole clock
  assert.equal(d2.tMs, 1_105_000);
  assert.equal(d2.sMs, 600_000);
});

test('clock: a move that uses exactly the time left is too late, by one millisecond it is not', () => {
  const g = game({ sMs: 10_000, n: 1, mv: 'e2e4-', at: T0 + 5_000, prevAt: T0 });
  const flagAt = T0 + 15_000;
  assert.equal(inTime(g, 's', flagAt - 1), true);
  assert.equal(inTime(g, 's', flagAt), false);
  assert.equal(flagged(g, flagAt - 1), null);
  assert.equal(flagged(g, flagAt), 's');
  assert.equal(timeLeft(g, 's', flagAt - 1), 1);
  assert.equal(timeLeft(g, 's', flagAt), 0);
  assert.equal(refereeMove(g, play(g, flagAt - 1), flagAt - 1), true);
  assert.equal(refereeMove(g, play(g, flagAt), flagAt), false);
});

test('clock: a move after time ran out is refused, and the clock shows zero, never less', () => {
  const g = game({ sMs: 10_000, n: 1, mv: 'e2e4-', at: T0 + 5_000, prevAt: T0 });
  const late = T0 + 95_000;
  assert.equal(inTime(g, 's', late), false);
  assert.equal(refereeMove(g, play(g, late), late), false);
  assert.equal(timeLeft(g, 's', late), 0);
  assert.equal(flagged(g, late), 's');
  // the teacher's clock is not running there
  assert.equal(timeLeft(g, 't', late), 600_000);
  assert.equal(timeLeft(g, 't', late + 60_000), 600_000);
});

test('clock: the flag belongs to the side to move, and either player may claim it', () => {
  const sTurn = game({ sMs: 10_000, n: 1, mv: 'e2e4-', at: T0 + 5_000, prevAt: T0 });
  const late = T0 + 20_000;
  assert.equal(mayClaimFlag(sTurn, 't', late), true);
  assert.equal(mayClaimFlag(sTurn, 's', late), true);     // the loser's own phone may say so
  assert.equal(mayClaimFlag(sTurn, 'someone', late), false);
  assert.equal(mayClaimFlag(sTurn, 't', late - 6_000), false);
  // The teacher has very little, but it is the student's turn: no flag.
  const tLow = game({ tMs: 1_000, n: 1, mv: 'e2e4-', at: T0 + 5_000, prevAt: T0 });
  assert.equal(flagged(tLow, T0 + 60_000), null);
  // The teacher to move with 3 s stored.
  const tTurn = game({ tMs: 3_000, n: 2, mv: 'e2e4-e7e5-', at: T0 + 9_000, prevAt: T0 + 5_000 });
  assert.equal(flagged(tTurn, T0 + 11_999), null);
  assert.equal(flagged(tTurn, T0 + 12_000), 't');
});

test('clock: no flag before Start or after the end', () => {
  const late = T0 + 9_999_999;
  for (const status of ['invited', 'joined', 'done', 'out']) assert.equal(flagged(game({ status }), late), null, status);
});

test('clock: before Start both clocks show what is stored', () => {
  const g = game({ status: 'joined', startAt: null, at: null, prevAt: null, ...startClocks(SIMUL.CLOCKS[1], 300) });
  assert.equal(timeLeft(g, 't', T0), 1_200_000);
  assert.equal(timeLeft(g, 's', T0), 900_000);
});

test('clock: a finished game stands still; the flagged side shows zero', () => {
  const end = { status: 'done', n: 2, mv: 'e2e4-e7e5-', at: T0 + 9_000, prevAt: T0 + 5_000 };
  const resigned = game({ ...end, winner: 's', reason: 'resign' });
  assert.equal(timeLeft(resigned, 't', T0 + 500_000), 600_000);
  assert.equal(timeLeft(resigned, 's', T0 + 500_000), 601_000);   // their last move: 4 s, + 5 s
  const flag = game({ ...end, winner: 's', reason: 'flag' });
  assert.equal(timeLeft(flag, 't', T0 + 500_000), 0);
});

test('no clock: nothing counts, nothing flags, the stored zeros never change', () => {
  let g = game({ ...startClocks(SIMUL.NO_CLOCK) });
  assert.equal(timeLeft(g, 't', T0 + 86_400_000), null);
  assert.equal(timeLeft(g, 's', T0 + 86_400_000), null);
  assert.equal(inTime(g, 't', T0 + 86_400_000), true);
  assert.equal(flagged(g, T0 + 86_400_000), null);
  let now = T0;
  for (let i = 0; i < 6; i++) {
    now += 3_600_000;
    const d = play(g, now);
    assert.ok(refereeMove(g, d, now));
    assert.deepEqual([d.tMs, d.sMs], [0, 0]);
    assert.equal(d.at, now);            // the stamps still move: the teacher's next board needs them
    g = d;
  }
});

test('clock: whatever is played, the screen agrees to the millisecond with a clock that charges each move as it is made', () => {
  const rnd = seeded(7);
  for (let run = 0; run < 300; run++) {
    const clock = SIMUL.CLOCKS[Math.floor(rnd() * 4)];
    const extra = Math.floor(rnd() * 13) * 300;
    let g = game({ tc: rnd() < 0.5 ? 'w' : 'b', ...startClocks(clock, extra) });
    // The plain clock: each side's time, charged the moment it moves.
    const truth = { t: g.tMs, s: g.sMs };
    let now = T0;
    for (let i = 0; i < 120; i++) {
      const who = sideToMove(g);
      const think = Math.floor(rnd() * rnd() * 90_000);
      // while thinking: the mover's clock is running, the other's is not
      const mid = now + Math.floor(think / 2);
      assert.equal(timeLeft(g, who, mid), Math.max(0, truth[who] - (mid - now)));
      assert.equal(timeLeft(g, who === 't' ? 's' : 't', mid), truth[who === 't' ? 's' : 't']);
      const at = now + think;
      const d = play(g, at);
      if (think >= truth[who]) {
        // out of time: the move is refused and the flag is theirs
        assert.equal(inTime(g, who, at), false);
        assert.equal(refereeMove(g, d, at), false);
        assert.equal(flagged(g, at), who);
        break;
      }
      assert.equal(inTime(g, who, at), true);
      assert.equal(flagged(g, at), null);
      assert.ok(refereeMove(g, d, at), `run ${run} move ${i}`);
      truth[who] += clock.inc * 1000 - think;
      g = d; now = at;
      assert.equal(timeLeft(g, 't', now), truth.t, `run ${run} move ${i} teacher`);
      assert.equal(timeLeft(g, 's', now), truth.s, `run ${run} move ${i} student`);
      assert.ok(g.tMs > 0 && g.sMs > 0);     // a stored time never reaches zero
      assert.ok(Number.isInteger(g.tMs) && Number.isInteger(g.sMs));
    }
  }
});

test('clock: a writer who shaves their own time or pads the other\'s is not what the referee accepts', () => {
  const d1 = play(game(), T0 + 30_000);
  const d2 = play(d1, T0 + 42_000);
  assert.ok(refereeMove(d1, d2, T0 + 42_000));
  assert.ok(!refereeMove(d1, { ...d2, sMs: d2.sMs + 1 }, T0 + 42_000));     // own clock
  assert.ok(!refereeMove(d1, { ...d2, tMs: d2.tMs - 1 }, T0 + 42_000));     // the teacher's, robbed
  assert.ok(!refereeMove(d1, { ...d2, tMs: d2.tMs + 1 }, T0 + 42_000));
  assert.ok(!refereeMove(d1, { ...d2, prevAt: d1.prevAt }, T0 + 42_000));
  assert.ok(!refereeMove(d1, { ...d2, at: T0 + 41_000 }, T0 + 42_000));     // not the server's stamp
});

// ── The move write ────────────────────────────────────────────────────────
test('move write: only the side to move, only in a live game, only a well-formed move', () => {
  const g = game();
  assert.equal(moveWrite(g, 's', 'e7e5-'), null);
  assert.equal(moveWrite(g, 't', 'e2e4'), null);
  assert.equal(moveWrite(game({ status: 'joined' }), 't', 'e2e4-'), null);
  assert.equal(moveWrite(game({ status: 'done' }), 't', 'e2e4-'), null);
  assert.deepEqual(moveWrite(g, 't', 'e2e4-'), { mv: 'e2e4-', n: 1, tMs: 600_000, sMs: 600_000, prevAt: T0, draw: null });
});

test('move write: the moves are only ever added to', () => {
  let g = game();
  for (const m of ['e2e4-', 'e7e5-', 'g1f3-']) {
    const d = play(g, g.at + 1000, m);
    assert.ok(d.mv.startsWith(g.mv));
    assert.equal(d.mv, g.mv + m);
    assert.equal(d.n, g.n + 1);
    g = d;
  }
  assert.equal(positionOf(g).ok, true);
});

test('move write: a draw offer stands until the OTHER side moves', () => {
  // The student offered; the teacher moves instead of answering: gone.
  assert.equal(moveWrite(game({ draw: 's' }), 't', 'e2e4-').draw, null);
  // The teacher offered on their own turn and then moved: it still stands.
  assert.equal(moveWrite(game({ draw: 't' }), 't', 'e2e4-').draw, 't');
});

// ── Endings ───────────────────────────────────────────────────────────────
test('ending: mate — the winner is the side that gave it, as teacher or student', () => {
  const mv = pack('f2f3', 'e7e5', 'g2g4', 'd8h4');
  for (const [tc, winner] of [['w', 's'], ['b', 't']]) {
    const g = game({ tc, mv, n: 4 });
    const p = positionOf(g);
    assert.deepEqual(boardResult(p.chess), { winner: 'b', reason: 'mate' });
    assert.deepEqual(resultOf(g, p.chess), { winner, reason: 'mate', by: null });
  }
});

test('ending: stalemate', () => {
  const g = game({ fen: '7k/8/6K1/8/8/8/5Q2/8 w - - 0 1', mv: 'f2f7-', n: 1 });
  assert.deepEqual(resultOf(g, positionOf(g).chess), { winner: 'draw', reason: 'stalemate', by: null });
});

test('ending: the same position three times, the opening counted', () => {
  const lap = pack('g1f3', 'g8f6', 'f3g1', 'f6g8');
  const twice = game({ mv: lap + pack('g1f3', 'g8f6', 'f3g1'), n: 7 });
  assert.equal(resultOf(twice, positionOf(twice).chess), null);
  const thrice = game({ mv: lap + lap, n: 8 });
  assert.deepEqual(resultOf(thrice, positionOf(thrice).chess), { winner: 'draw', reason: 'repetition', by: null });
  // One lap was the "opening": the board still has to see it.
  const split = game({ op: lap, mv: lap, n: 4 });
  assert.deepEqual(resultOf(split, positionOf(split).chess), { winner: 'draw', reason: 'repetition', by: null });
});

test('ending: fifty moves without a capture or a pawn move', () => {
  const g = game({ fen: '4k3/8/8/8/8/8/R7/4K3 w - - 99 80', mv: 'a2a3-', n: 1 });
  assert.deepEqual(resultOf(g, positionOf(g).chess), { winner: 'draw', reason: 'fifty', by: null });
  const before = game({ fen: '4k3/8/8/8/8/8/R7/4K3 w - - 97 80', mv: 'a2a3-', n: 1 });
  assert.equal(resultOf(before, positionOf(before).chess), null);
});

test('ending: not enough pieces to mate', () => {
  const g = game({ fen: 'k7/8/8/8/8/8/1p6/K7 w - - 0 1', mv: 'a1b2-', n: 1 });
  assert.deepEqual(resultOf(g, positionOf(g).chess), { winner: 'draw', reason: 'material', by: null });
});

test('ending: resign, draw agreed, flag, void and "not finished" are what is stored', () => {
  const chess = new Chess();
  const done = (winner, reason, by = null) => resultOf(game({ status: 'done', winner, reason, by }), chess);
  assert.deepEqual(done('s', 'resign'), { winner: 's', reason: 'resign', by: null });
  assert.deepEqual(done('draw', 'agreed'), { winner: 'draw', reason: 'agreed', by: null });
  assert.deepEqual(done('t', 'flag'), { winner: 't', reason: 'flag', by: null });
  assert.deepEqual(done(null, 'void', 's'), { winner: null, reason: 'void', by: 's' });
  assert.deepEqual(done(null, 'unfinished'), { winner: null, reason: 'unfinished', by: null });
});

test('ending: a game still being played, or not started, has no result', () => {
  const g = game({ mv: 'e2e4-', n: 1 });
  assert.equal(resultOf(g, positionOf(g).chess), null);
  assert.equal(boardResult(new Chess()), null);
  for (const status of ['invited', 'joined', 'out']) assert.equal(resultOf(game({ status }), new Chess()), null);
});

test('ending: a stored mate or draw the board does not show does not hold', () => {
  const mated = positionOf(game({ mv: pack('f2f3', 'e7e5', 'g2g4', 'd8h4'), n: 4 })).chess;
  const open = new Chess();
  const done = (winner, reason) => game({ status: 'done', winner, reason });
  assert.equal(resultHolds(done('s', 'mate'), mated), true);
  assert.equal(resultHolds(done('t', 'mate'), mated), false);       // mate, but the wrong winner
  assert.equal(resultHolds(done('s', 'mate'), open), false);        // a false checkmate
  assert.equal(resultHolds(done('draw', 'stalemate'), open), false);
  assert.equal(resultHolds(done('draw', 'stalemate'), mated), false);
  const dead = new Chess('k7/8/8/8/8/8/8/K7 w - - 0 1');
  assert.equal(resultHolds(done('draw', 'material'), dead), true);
  assert.equal(resultHolds(done('t', 'material'), dead), false);
  // Nothing on the board to check for these.
  for (const reason of ['resign', 'agreed', 'flag', 'void', 'unfinished']) assert.equal(resultHolds(done('t', reason), open), true);
  assert.equal(resultHolds(game(), open), true);
});

// ── Draw offers ───────────────────────────────────────────────────────────
test('draw offer: either side, once, then not again for 10 moves', () => {
  assert.equal(mayOfferDraw(game(), 't'), true);
  assert.equal(mayOfferDraw(game(), 's'), true);
  assert.equal(mayOfferDraw(game({ n: 12, sDr: 12 }), 's'), false);
  assert.equal(mayOfferDraw(game({ n: 31, sDr: 12 }), 's'), false);
  assert.equal(mayOfferDraw(game({ n: 32, sDr: 12 }), 's'), true);
  assert.equal(mayOfferDraw(game({ n: 13, sDr: 12 }), 't'), true);      // the limit is each player's own
  assert.equal(mayOfferDraw(game({ n: 0, tDr: 0 }), 't'), false);
});

test('draw offer: not while one is standing, and not outside a live game', () => {
  assert.equal(mayOfferDraw(game({ draw: 's' }), 't'), false);    // answer it instead
  assert.equal(mayOfferDraw(game({ draw: 's' }), 's'), false);
  for (const status of ['invited', 'joined', 'done', 'out']) assert.equal(mayOfferDraw(game({ status }), 't'), false, status);
});

// ── The teacher's boards ──────────────────────────────────────────────────
const board = (s, over) => game({ s, ...over });
const tTurn = { n: 2, mv: 'e2e4-e7e5-' };
const sTurn = { n: 1, mv: 'e2e4-' };

test('next board: where it is the teacher\'s turn, the one waiting longest', () => {
  const games = [
    board('ana', { ...tTurn, at: T0 + 50_000 }),
    board('luis', { ...sTurn, at: T0 + 1_000 }),          // oldest stamp, but not the teacher's turn
    board('eva', { ...tTurn, at: T0 + 20_000 }),
    board('leo', { ...tTurn, at: T0 + 30_000 }),
    board('sol', { ...tTurn, at: T0 + 5_000, status: 'done', winner: 't', reason: 'resign' }),
  ];
  assert.equal(nextBoard(games).s, 'eva');
  assert.deepEqual(waitingBoards(games).map(g => g.s), ['eva', 'leo', 'ana']);
});

test('next board: none when no board is waiting', () => {
  assert.equal(nextBoard([board('ana', sTurn), board('eva', { ...tTurn, status: 'done' })]), null);
  assert.equal(nextBoard([]), null);
  assert.equal(nextBoard(null), null);
});

test('next board: a board just started with the teacher to move is waiting; as Black it is not', () => {
  assert.equal(nextBoard([board('ana', { tc: 'w' })]).s, 'ana');
  assert.equal(nextBoard([board('ana', { tc: 'b' })]), null);
});

test('next board: equal stamps (all boards at Start) come in a fixed order', () => {
  const games = [board('leo'), board('ana'), board('eva')];
  assert.deepEqual(waitingBoards(games).map(g => g.s), ['ana', 'eva', 'leo']);
  assert.deepEqual(waitingBoards([...games].reverse()).map(g => g.s), ['ana', 'eva', 'leo']);
});

test('skip: the next waiting board after this one, round and round; none if this is the only one', () => {
  const games = [
    board('ana', { ...tTurn, at: T0 + 50_000 }),
    board('eva', { ...tTurn, at: T0 + 20_000 }),
    board('leo', { ...tTurn, at: T0 + 30_000 }),
    board('luis', sTurn),
  ];
  assert.equal(nextBoard(games, 'eva').s, 'leo');
  assert.equal(nextBoard(games, 'leo').s, 'ana');
  assert.equal(nextBoard(games, 'ana').s, 'eva');
  assert.equal(nextBoard(games, 'luis').s, 'eva');       // from a board that is not waiting: the oldest
  assert.equal(nextBoard([games[0], games[3]], 'ana'), null);
});

test('colours: all White, all Black, or alternating from White in the order listed', () => {
  const five = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(coloursFor('white', five), ['w', 'w', 'w', 'w', 'w']);
  assert.deepEqual(coloursFor('black', five), ['b', 'b', 'b', 'b', 'b']);
  assert.deepEqual(coloursFor('alt', five), ['w', 'b', 'w', 'b', 'w']);
  assert.deepEqual(coloursFor('alt', []), []);
});

// ── Invitations ───────────────────────────────────────────────────────────
test('an invitation is open for 10 minutes of server time, joined or not', () => {
  const inv = game({ status: 'invited', invitedAt: T0, startAt: null });
  assert.equal(inviteOpen(inv, T0 + 600_000), true);
  assert.equal(inviteOpen(inv, T0 + 600_001), false);
  assert.equal(inviteOpen({ ...inv, status: 'joined' }, T0 + 599_000), true);
  assert.equal(inviteOpen({ ...inv, status: 'joined' }, T0 + 600_001), false);
  for (const status of ['live', 'done', 'out']) assert.equal(inviteOpen({ ...inv, status }, T0 + 1), false);
});

test('replace: over nothing, a finished game, a declined or left-out invitation', () => {
  assert.equal(mayReplace(null, T0), true);
  assert.equal(mayReplace(undefined, T0), true);
  assert.equal(mayReplace(game({ status: 'done' }), T0), true);
  assert.equal(mayReplace(game({ status: 'out' }), T0), true);
});

test('replace: an invitation only once it is older than 10 minutes', () => {
  for (const status of ['invited', 'joined']) {
    const inv = game({ status, invitedAt: T0, startAt: null });
    assert.equal(mayReplace(inv, T0 + 1), false, status);
    assert.equal(mayReplace(inv, T0 + 600_000), false, status);
    assert.equal(mayReplace(inv, T0 + 600_001), true, status);
  }
});

test('replace: a game in play only once it started more than 3 hours ago', () => {
  const live = game({ startAt: T0, invitedAt: T0 - 500_000 });
  assert.equal(mayReplace(live, T0 + 700_000), false);              // the invitation's 10 minutes do not count
  assert.equal(mayReplace(live, T0 + 10_800_000), false);
  assert.equal(mayReplace(live, T0 + 10_800_001), true);
});

// ── What a phone shows, and when it voids (conversation 4) ────────────────

test('shown: a playable game is shown whole, with its last move', () => {
  const v = shownPosition(game({ mv: pack('e2e4', 'e7e5', 'g1f3'), n: 3 }));
  assert.equal(v.bad, false);
  assert.equal(v.n, 3);
  assert.deepEqual(v.last, { from: 'g1', to: 'f3' });
  assert.equal(v.fen.split(' ')[0], 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R');
  const start = shownPosition(game());
  assert.deepEqual([start.bad, start.n, start.last], [false, 0, null]);
  // The opening is on the board but is not "the last move" of the game.
  const op = shownPosition(game({ op: pack('e2e4', 'e7e5') }));
  assert.deepEqual([op.bad, op.n, op.last], [false, 0, null]);
});

test('shown: an impossible move is not played; the board stands as it was before it', () => {
  const v = shownPosition(game({ mv: pack('e2e4', 'e7e5', 'e4e6'), n: 3 }));
  assert.equal(v.bad, true);
  assert.equal(v.n, 2);
  assert.deepEqual(v.last, { from: 'e7', to: 'e5' });
  assert.equal(v.fen.split(' ')[0], 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR');
  // The very first move, and a string that is not moves at all.
  assert.deepEqual([shownPosition(game({ mv: 'e2e5-', n: 1 })).bad, shownPosition(game({ mv: 'e2e5-', n: 1 })).n], [true, 0]);
  assert.deepEqual([shownPosition(game({ mv: 'e2e4', n: 1 })).bad, shownPosition(game({ mv: 'e2e4', n: 1 })).n], [true, 0]);
  assert.equal(shownPosition(game({ fen: 'nonsense' })), null);
});

test('shown: a stored mate the board does not show is bad; a true one is not', () => {
  const mv = pack('f2f3', 'e7e5', 'g2g4', 'd8h4');
  assert.equal(shownPosition(game({ mv, n: 4, status: 'done', winner: 's', reason: 'mate' })).bad, false);
  assert.equal(shownPosition(game({ mv, n: 4, status: 'done', winner: 't', reason: 'mate' })).bad, true);
  const not = pack('e2e4', 'e7e5');
  assert.equal(shownPosition(game({ mv: not, n: 2, status: 'done', winner: 's', reason: 'mate' })).bad, true);
  assert.equal(shownPosition(game({ mv: not, n: 2, status: 'done', winner: 'draw', reason: 'stalemate' })).bad, true);
  // Endings that are a choice are nothing a board can contradict.
  assert.equal(shownPosition(game({ mv: not, n: 2, status: 'done', winner: 's', reason: 'resign' })).bad, false);
  assert.equal(shownPosition(game({ mv: not, n: 2, status: 'done', winner: null, reason: 'void', by: 's' })).bad, false);
});

test('voidable: a game in play, or one a move ended; nothing else', () => {
  assert.equal(voidable(game()), true);
  for (const reason of ['mate', 'stalemate', 'repetition', 'fifty', 'material']) assert.equal(voidable(game({ status: 'done', reason })), true, reason);
  for (const reason of ['resign', 'agreed', 'flag', 'void', 'unfinished']) assert.equal(voidable(game({ status: 'done', reason })), false, reason);
  for (const status of ['invited', 'joined', 'out']) assert.equal(voidable(game({ status })), false, status);
});
