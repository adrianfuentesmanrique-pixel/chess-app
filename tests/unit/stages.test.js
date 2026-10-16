// Learn tab stages (js/stages.js, js/stages-data.js): the goal checks, the
// stars, the saved progress — and every level of the data, played with its
// own solution, so a position that is illegal or cannot be solved fails here
// before anyone meets it on a phone.
//
//   npm.cmd run test:tree
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../../vendor/chess.js';
import { levelVerdict, punishMove, levelStars, recordLevel, stageStars, sectionSummary, nextStageIdx, firstOpenLevel, cleanProgress } from '../../js/stages.js';
import { STAGE_SECTIONS } from '../../js/stages-data.js';

const play = (fen, uci) => {
  const c = new Chess(fen);
  const move = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  return { move, after: c };
};

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
