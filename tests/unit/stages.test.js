// Learn tab stages (js/stages.js, js/stages-data.js): the goal checks, the
// stars, the saved progress — and every level of the data, played with its
// own solution, so a position that is illegal or cannot be solved fails here
// before anyone meets it on a phone.
//
//   npm.cmd run test:tree
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../../vendor/chess.js';
import { levelVerdict, punishMove, linePunish, lineDone, material, levelStars, recordLevel, stageStars, sectionSummary, nextStageIdx, firstOpenLevel, cleanProgress } from '../../js/stages.js';
import { STAGE_SECTIONS } from '../../js/stages-data.js';

const play = (fen, uci) => {
  const c = new Chess(fen);
  const move = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  return { move, after: c };
};
const uciOf = m => m.from + m.to + (m.promotion || '');

// A small material search for the 'line' levels: White maximises, Black
// minimises, mate is worth 1000, and when the depth runs out the side to move
// may still capture (or must answer a check), so a piece left hanging at the
// end of a line is seen.
function search(c, depth, alpha = -1e4, beta = 1e4) {
  const moves = c.moves({ verbose: true });
  if (!moves.length) return c.inCheck() ? (c.turn() === 'w' ? -1000 : 1000) : 0;
  const white = c.turn() === 'w';
  let best = -1e4 * (white ? 1 : -1);
  let list = moves;
  if (depth <= 0 && !c.inCheck()) {
    best = material(c);   // standing pat
    if (white ? best >= beta : best <= alpha) return best;
    list = moves.filter(m => m.captured);
  }
  list.sort((a, b) => (b.captured ? 1 : 0) - (a.captured ? 1 : 0));
  for (const m of list) {
    c.move(m);
    const v = search(c, depth - 1, alpha, beta);
    c.undo();
    if (white) { best = Math.max(best, v); alpha = Math.max(alpha, v); }
    else { best = Math.min(best, v); beta = Math.min(beta, v); }
    if (alpha >= beta) break;
  }
  return best;
}
// What White's first move is worth if both sides play on as far as the line
// goes. With a window (alpha, beta) the answer is only exact inside it: below
// it means "less than beta" (fail-soft), which is all the uniqueness check
// needs, and it is several times faster (chess.js is slow at making moves).
const firstMoveWorth = (fen, uci, plies, alpha, beta) => { const c = new Chess(fen); c.move(uci); return search(c, plies - 1, alpha, beta); };

test('check: a checking move passes, a quiet one says why', () => {
  const lv = { fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', goal: 'check' };
  const good = play(lv.fen, 'a1a8');
  assert.deepEqual(levelVerdict(lv, good.move, good.after), { ok: true, why: null });
  const bad = play(lv.fen, 'a1a2');
  assert.deepEqual(levelVerdict(lv, bad.move, bad.after), { ok: false, why: 'not_check' });
});

test('mate: check alone is not enough', () => {
  const lv = { fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', goal: 'mate' };
  const good = play(lv.fen, 'd1d8');
  assert.equal(levelVerdict(lv, good.move, good.after).ok, true);
  const quiet = play(lv.fen, 'd1d2');
  assert.deepEqual(levelVerdict(lv, quiet.move, quiet.after), { ok: false, why: 'not_mate' });
});

test('escape: the way out must be the one the level asks for', () => {
  const lv = { fen: '6k1/8/8/8/7q/8/R7/7K w - - 0 1', goal: 'escape', how: 'king' };
  const king = play(lv.fen, 'h1g1');
  assert.equal(levelVerdict(lv, king.move, king.after).ok, true);
  const block = play(lv.fen, 'a2h2');
  assert.deepEqual(levelVerdict(lv, block.move, block.after), { ok: false, why: 'escape_king' });
  const cap = { fen: '4k3/8/8/4r3/8/2B5/8/4K3 w - - 0 1', goal: 'escape', how: 'capture' };
  const run = play(cap.fen, 'e1d1');
  assert.deepEqual(levelVerdict(cap, run.move, run.after), { ok: false, why: 'escape_capture' });
  const blk = { fen: '4k3/8/8/8/8/8/4B3/r3K3 w - - 0 1', goal: 'escape', how: 'block' };
  const step = play(blk.fen, 'e1d2');
  assert.deepEqual(levelVerdict(blk, step.move, step.after), { ok: false, why: 'escape_block' });
});

test('stalemate: a mate fails with its own why, so does a move that leaves a way out', () => {
  const lv = { fen: '7k/7p/7P/8/8/3Q4/8/K7 w - - 0 1', goal: 'stalemate' };
  const good = play(lv.fen, 'd3g3');
  assert.deepEqual(levelVerdict(lv, good.move, good.after), { ok: true, why: null });
  const mate = play(lv.fen, 'd3d8');
  assert.deepEqual(levelVerdict(lv, mate.move, mate.after), { ok: false, why: 'stalemate_mate' });
  const g6 = play(lv.fen, 'd3g6');   // the h7 pawn can take
  assert.deepEqual(levelVerdict(lv, g6.move, g6.after), { ok: false, why: 'not_stalemate' });
});

test('best: only the most valuable capture passes', () => {
  const lv = { fen: '7k/r7/5n2/8/3B4/8/1p6/6K1 w - - 0 1', goal: 'best' };
  const rook = play(lv.fen, 'd4a7');
  assert.deepEqual(levelVerdict(lv, rook.move, rook.after), { ok: true, why: null });
  const knight = play(lv.fen, 'd4f6');
  assert.deepEqual(levelVerdict(lv, knight.move, knight.after), { ok: false, why: 'not_best' });
  const quiet = play(lv.fen, 'g1f1');
  assert.deepEqual(levelVerdict(lv, quiet.move, quiet.after), { ok: false, why: 'not_capture' });
  // Bishop and knight are both 3: either one is the best.
  const tie = { fen: '7k/8/8/2b1n3/3P4/8/8/7K w - - 0 1', goal: 'best' };
  for (const uci of ['d4c5', 'd4e5']) {
    const r = play(tie.fen, uci);
    assert.equal(levelVerdict(tie, r.move, r.after).ok, true, uci);
  }
});

test('save: moving, guarding with a cheaper piece or blocking keeps the piece; leaving it does not', () => {
  const lv = { fen: '6k1/1b6/8/8/8/8/4PP2/3K3R w - - 0 1', goal: 'save', target: 'h1', punish: 'b7h1' };
  for (const uci of ['h1h4', 'f2f3', 'e2e4']) {   // move away, block, block
    const r = play(lv.fen, uci);
    assert.deepEqual(levelVerdict(lv, r.move, r.after), { ok: true, why: null }, uci);
  }
  const idle = play(lv.fen, 'd1c1');
  assert.deepEqual(levelVerdict(lv, idle.move, idle.after), { ok: false, why: 'not_safe' });
  assert.equal(punishMove(lv, idle.move, idle.after), 'b7h1');   // the scripted reply
  // h8 is check, but the king takes the undefended rook: the reply is found, not scripted.
  const h8 = play(lv.fen, 'h1h8');
  assert.deepEqual(levelVerdict(lv, h8.move, h8.after), { ok: false, why: 'not_safe' });
  assert.equal(punishMove(lv, h8.move, h8.after), 'g8h8');
  // A guard counts only when the attacker is worth at least as much as the piece.
  const rookOnKnight = { fen: '3r2k1/8/8/8/3N4/8/2P5/6K1 w - - 0 1', goal: 'save', target: 'd4', punish: 'd8d4' };
  const guard = play(rookOnKnight.fen, 'c2c3');
  assert.equal(levelVerdict(rookOnKnight, guard.move, guard.after).ok, true);
  const pawnOnKnight = { fen: '6k1/8/8/4p3/3N4/8/2P5/6K1 w - - 0 1', goal: 'save', target: 'd4', punish: 'e5d4' };
  const guard2 = play(pawnOnKnight.fen, 'c2c3');
  assert.deepEqual(levelVerdict(pawnOnKnight, guard2.move, guard2.after), { ok: false, why: 'not_safe' });
});

test('draw: insufficient material or stalemate, nothing else', () => {
  const kk = { fen: '7k/8/8/3r4/4K3/8/8/8 w - - 0 1', goal: 'draw' };
  const take = play(kk.fen, 'e4d5');
  assert.deepEqual(levelVerdict(kk, take.move, take.after), { ok: true, why: null });
  const away = play(kk.fen, 'e4f4');
  assert.deepEqual(levelVerdict(kk, away.move, away.after), { ok: false, why: 'not_draw' });
  const pat = { fen: '8/8/8/8/8/5K2/7p/7k w - - 0 1', goal: 'draw' };
  const f2 = play(pat.fen, 'f3f2');
  assert.equal(levelVerdict(pat, f2.move, f2.after).ok, true);
});

test('line: White plays the scripted moves in order; a listed alternative says so; anything else says why', () => {
  // Knight fork: Nc7+ hits king and rook, the king steps away, Nxa8.
  const lv = { fen: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', goal: 'line', line: ['b5c7', 'e8d7', 'c7a8'], also: [['b5d6', 'e8d7', 'd6b7']] };
  const c = new Chess(lv.fen);
  let r = c.move('b5c7');
  assert.deepEqual(levelVerdict(lv, r, c, 0), { ok: true, why: null });
  assert.equal(lineDone(lv, 0), false);
  c.move('e8d7');
  r = c.move('c7a8');
  assert.deepEqual(levelVerdict(lv, r, c, 2), { ok: true, why: null });
  assert.equal(lineDone(lv, 2), true);
  const alt = play(lv.fen, 'b5d6');
  assert.deepEqual(levelVerdict(lv, alt.move, alt.after, 0), { ok: false, why: 'line_also' });
  const idle = play(lv.fen, 'e1d1');
  assert.deepEqual(levelVerdict(lv, idle.move, idle.after, 0), { ok: false, why: 'line_wrong' });
  // A listed alternative only counts as the first move.
  const c2 = new Chess(lv.fen); c2.move('b5c7'); c2.move('e8d7'); r = c2.move('c7b5');
  assert.deepEqual(levelVerdict(lv, r, c2, 2), { ok: false, why: 'line_wrong' });
});

test('choose: any good move passes; a listed bad move and any other move say which', () => {
  // After 1.e4 e5: develop a knight or a bishop; the early queen is the listed trap.
  const lv = { fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', goal: 'choose',
    good: ['g1f3', 'f1c4'], solution: 'g1f3', bad: { d1h5: { es: 'x', en: 'x' } } };
  for (const uci of lv.good) {
    const r = play(lv.fen, uci);
    assert.deepEqual(levelVerdict(lv, r.move, r.after), { ok: true, why: null }, uci);
  }
  const queen = play(lv.fen, 'd1h5');
  assert.deepEqual(levelVerdict(lv, queen.move, queen.after), { ok: false, why: 'choose_bad' });
  const pawn = play(lv.fen, 'a2a3');
  assert.deepEqual(levelVerdict(lv, pawn.move, pawn.after), { ok: false, why: 'choose_other' });
  // A level without a `bad` list still answers every wrong move.
  const plain = { ...lv, bad: undefined };
  assert.deepEqual(levelVerdict(plain, queen.move, queen.after), { ok: false, why: 'choose_other' });
});

test('line punish: Black takes the most valuable piece left en prise, never a guarded one for free', () => {
  // Wrong move Rd1-d4: the rook hangs to the queen; the knight on a5 is attacked
  // too, but the b4 pawn guards it, so taking it would cost the queen.
  const after = play('3q2k1/8/8/N7/1P6/8/8/3R2K1 w - - 0 1', 'd1d4').after;
  assert.equal(linePunish(after), 'd8d4');
  // Nothing hangs: no punish, the level just resets.
  const quiet = play('6k1/8/8/8/8/8/5PPP/6K1 w - - 0 1', 'g1f1').after;
  assert.equal(linePunish(quiet), null);
});

test('material counts White minus Black, kings left out', () => {
  assert.equal(material(new Chess('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1')), -2);
  assert.equal(material(new Chess('4k3/8/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1')), 39);
});

test('stars: first try 3, one mistake 2, more 1, a hint 1', () => {
  assert.equal(levelStars(0, false), 3);
  assert.equal(levelStars(1, false), 2);
  assert.equal(levelStars(5, false), 1);
  assert.equal(levelStars(0, true), 1);
});

test('progress keeps the best result and never mutates the old one', () => {
  const p0 = {};
  const p1 = recordLevel(p0, 'check', 2, 2, 6);
  assert.deepEqual(p0, {});
  assert.deepEqual(p1, { check: [0, 0, 2, 0, 0, 0] });
  assert.deepEqual(recordLevel(p1, 'check', 2, 1, 6).check[2], 2);
  assert.deepEqual(recordLevel(p1, 'check', 2, 3, 6).check[2], 3);
});

test('stage, section and next-stage summaries', () => {
  const section = { stages: [{ id: 'a', levels: [{}, {}] }, { id: 'b', levels: [{}, {}, {}] }] };
  const p = { a: [3, 2], b: [1, 0, 0] };
  assert.deepEqual(stageStars(p, section.stages[0]), { got: 5, max: 6, done: 2, complete: true });
  assert.deepEqual(stageStars(p, section.stages[1]), { got: 1, max: 9, done: 1, complete: false });
  assert.deepEqual(sectionSummary(p, section), { got: 6, max: 15, stagesDone: 1, stages: 2 });
  assert.equal(nextStageIdx(p, section), 1);
  assert.equal(nextStageIdx({ a: [1, 1], b: [1, 1, 1] }, section), -1);
  assert.equal(firstOpenLevel(p, section.stages[1]), 1);
  assert.equal(firstOpenLevel({ a: [3, 3] }, section.stages[0]), 0);   // all done: start again
});

test('cleanProgress drops whatever is not a list of 0-3 stars', () => {
  assert.deepEqual(cleanProgress(null), {});
  assert.deepEqual(cleanProgress('x'), {});
  assert.deepEqual(cleanProgress({ a: [3, 9, -1, 'x', 2.5, 1], b: 'no' }), { a: [3, 0, 0, 0, 0, 1] });
});

test('every level: legal, White to move, in check only when it must be, solved by its solution', () => {
  const ids = new Set();
  let levels = 0;
  for (const section of STAGE_SECTIONS) {
    assert.ok(section.title.es && section.title.en, section.id);
    for (const stage of section.stages) {
      assert.ok(!ids.has(stage.id), `duplicate stage id ${stage.id}`);
      ids.add(stage.id);
      assert.ok(stage.title.es && stage.title.en && stage.intro.es && stage.intro.en && stage.goalText.es && stage.goalText.en, stage.id);
      assert.ok(stage.levels.length >= 4 && stage.levels.length <= 8, stage.id);
      stage.levels.forEach((lv, i) => {
        const where = `${stage.id} level ${i + 1}`;
        const c = new Chess(lv.fen);   // throws on an illegal FEN
        assert.equal(c.turn(), 'w', where);
        assert.equal(c.inCheck(), lv.goal === 'escape', where);
        // Black, who is not to move, may not be standing in check.
        const parts = lv.fen.split(' ');
        assert.equal(new Chess([parts[0], 'b', '-', '-', '0', '1'].join(' ')).inCheck(), false, `${where}: Black in check`);
        if (lv.goal === 'line') {
          // White's moves at even indexes, Black's scripted replies at odd ones,
          // and the line ends on White's move.
          assert.equal(lv.line.length % 2, 1, `${where}: a line ends on White's move`);
          const end = new Chess(lv.fen);
          lv.line.forEach((uci, k) => {
            const mv = end.move(uci);   // throws on an illegal move
            if (k % 2 === 0) {
              assert.deepEqual(levelVerdict(lv, mv, end, k), { ok: true, why: null }, `${where} move ${k + 1}`);
              assert.equal(lineDone(lv, k), k === lv.line.length - 1, `${where} move ${k + 1}`);
            }
          });
          // White ends up ahead, and stays ahead once Black has taken back what
          // it can: what the line wins is what the search says the first move wins.
          const won = search(end, 0);
          assert.ok(won > material(new Chess(lv.fen)), `${where}: White is not ahead at the end`);
          const worth = firstMoveWorth(lv.fen, lv.line[0], lv.line.length);
          assert.equal(won, worth, `${where}: Black has a better defence than the script (${won} vs ${worth})`);
          // Every listed alternative also wins exactly that much...
          const also = (lv.also || []).map(alt => {
            const c2 = new Chess(lv.fen);
            alt.forEach(u => c2.move(u));
            assert.equal(search(c2, 0), won, `${where}: alternative ${alt[0]} wins a different amount`);
            assert.equal(firstMoveWorth(lv.fen, alt[0], lv.line.length), won, `${where}: alternative ${alt[0]} has a better defence`);
            return alt[0];
          });
          // ...and at every White turn no unlisted move wins as much: a good move
          // is never punished.
          const at = new Chess(lv.fen);
          for (let k = 0; k < lv.line.length; k += 2) {
            const fen = at.fen(), plies = lv.line.length - k;
            const best = firstMoveWorth(fen, lv.line[k], plies);
            for (const m of at.moves({ verbose: true })) {
              const u = uciOf(m);
              if (u === lv.line[k] || (k === 0 && also.includes(u))) continue;
              assert.ok(firstMoveWorth(fen, u, plies, best - 1, best) < best, `${where} move ${k + 1}: ${m.san} wins as much as the line`);
            }
            at.move(lv.line[k]);
            if (k + 1 < lv.line.length) at.move(lv.line[k + 1]);
          }
          assert.ok(lv.say && lv.say.es && lv.say.en, `${where}: Kael names the tactic`);
          levels++;
          return;
        }
        if (lv.goal === 'choose') {
          // Every good move is legal, Pista's `solution` is one of them, and
          // there is a legal move that is not good, so the level is a choice.
          assert.ok(Array.isArray(lv.good) && lv.good.length, `${where}: no good moves`);
          const legal = new Chess(lv.fen).moves({ verbose: true }).map(uciOf);
          for (const u of lv.good) assert.ok(legal.includes(u), `${where}: good move ${u} is illegal`);
          assert.ok(lv.good.includes(lv.solution), `${where}: solution is not in good`);
          assert.ok(legal.some(u => !lv.good.includes(u)), `${where}: every move is good`);
          // A listed bad move is legal, not good, and Kael says why in both languages.
          for (const [u, why] of Object.entries(lv.bad || {})) {
            assert.ok(legal.includes(u), `${where}: bad move ${u} is illegal`);
            assert.ok(!lv.good.includes(u), `${where}: ${u} is both good and bad`);
            assert.ok(why.es && why.en, `${where}: bad move ${u} needs es and en`);
          }
          // Any other wrong move gets the stage's general line.
          assert.ok(stage.wrongText && stage.wrongText.es && stage.wrongText.en, `${where}: stage has no wrongText`);
          assert.ok(lv.say && lv.say.es && lv.say.en, `${where}: Kael explains the principle`);
        }
        const { move, after } = play(lv.fen, lv.solution);
        assert.deepEqual(levelVerdict(lv, move, after), { ok: true, why: null }, where);
        if (lv.goal === 'escape') {
          // The level only teaches something if another way out exists.
          const wrong = new Chess(lv.fen).moves({ verbose: true }).some(m => {
            const c2 = new Chess(lv.fen); const r = c2.move(m);
            return !levelVerdict(lv, r, c2).ok;
          });
          assert.ok(wrong, `${where}: every escape is the right kind`);
        }
        if (lv.goal === 'best') {
          // A choice only teaches if the captures are not all worth the same.
          const worths = new Set(new Chess(lv.fen).moves({ verbose: true }).filter(m => m.captured).map(m => m.captured));
          assert.ok(worths.size >= 2, `${where}: needs captures of different value`);
        }
        if (lv.goal === 'save') {
          // The target is White's and really hangs if White does nothing...
          const piece = new Chess(lv.fen).get(lv.target);
          assert.ok(piece && piece.color === 'w', `${where}: target is not a white piece`);
          const pass = new Chess([parts[0], 'b', '-', '-', '0', '1'].join(' '));
          const r = pass.move(lv.punish);   // throws if the scripted reply is illegal
          assert.equal(r.to, lv.target, `${where}: punish does not take the target`);
          // ...and every wrong move gets a reply that takes it, unless it gave check.
          let wrongs = 0;
          for (const m of new Chess(lv.fen).moves({ verbose: true })) {
            const c2 = new Chess(lv.fen); const mv = c2.move(m);
            if (levelVerdict(lv, mv, c2).ok) continue;
            wrongs++;
            const uci = punishMove(lv, mv, c2);
            if (!uci) { assert.ok(c2.inCheck(), `${where}: ${mv.san} has no punish`); continue; }
            const hit = new Chess(c2.fen()).move(uci);
            assert.equal(hit.to, mv.from === lv.target ? mv.to : lv.target, `${where}: ${mv.san} punish misses`);
          }
          assert.ok(wrongs > 0, `${where}: no wrong move`);
        }
        if (lv.say) assert.ok(lv.say.es && lv.say.en, where);
        levels++;
      });
    }
  }
  assert.ok(levels >= 20);
});
