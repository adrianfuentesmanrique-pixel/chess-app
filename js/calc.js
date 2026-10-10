// Sealed Moves ("calc"): the rules of the mode, with no screen in them.
// Imports only js/tree.js, so it runs under plain Node
// (tests/unit/calc.test.js) as well as in the app. The screen is js/calc-ui.js.
// Spec: docs/superpowers/specs/2026-10-10-calculation-mode-design.md, 3a to 3d.
//
// The rules, in the order a player meets them:
//  - A puzzle's first move is the opponent's. The position after it is what the
//    player sees, and the rest of the puzzle's moves are the MAIN LINE.
//  - The answer is a GameTree that starts at that position. The player writes
//    both sides. One move of their own per position (an answer is one sealed
//    move); any number of opponent replies after it.
//  - The main line is graded against the puzzle, with no engine. A move of the
//    player's is right when it is the puzzle's move, or when it gives mate on
//    the spot. The puzzle's reply is the one that is followed; any other reply
//    starts a side variation, which is never judged here ("unchecked").
//  - Failed: a wrong move of the player's own on the main line.
//    Unfinished: right so far, but the main line stops short.
//    Solved: the whole main line right. Perfect: solved on the first hand-in
//    with no help.
import { GameTree } from './tree.js';

const uciMove = u => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined });

// { fen, turn, lead: {from, to, san}, line: [{san, from, to, fen}] } for a
// puzzle {fen, moves}, or null when its moves do not play. `fen` is the
// position the player answers from; `line` always ends on a move of theirs.
export function calcMainLine(puzzle) {
  let tree;
  try { tree = new GameTree(puzzle.fen); } catch { return null; }
  const nodes = [];
  for (const u of puzzle.moves || []) {
    let node = null;
    try { node = tree.play(uciMove(u)); } catch { }
    if (!node) return null;
    nodes.push(node);
  }
  const [lead, ...rest] = nodes;
  if (rest.length % 2 === 0) rest.pop();
  if (!lead || !rest.length) return null;
  return {
    fen: lead.fen,
    turn: lead.fen.split(' ')[1],
    lead: { from: lead.from, to: lead.to, san: lead.san },
    line: rest.map(n => ({ san: n.san, from: n.from, to: n.to, fen: n.fen })),
  };
}

export function calcNewTree(main) { return new GameTree(main.fen); }

function depthOf(node) {
  let d = 0;
  for (let n = node; n.parent; n = n.parent) d++;
  return d;
}

// A chip is the player's own move when it sits an odd number of moves in.
export function calcIsMine(node) { return depthOf(node) % 2 === 1; }

// Writes `move` ({from, to, promotion} or SAN) after `node`.
// → { node }, { error: 'illegal' } when it cannot be played in the position the
// tree holds there, or { error: 'taken' } when the player already has a
// different move of their own in that position.
export function calcEnter(tree, node, move) {
  tree.goto(node);
  const before = node.children.length;
  const made = tree.play(move);
  if (!made) return { error: 'illegal' };
  if (calcIsMine(made) && node.children.length > 1 && node.children.length > before) {
    tree.deleteNode(made);
    return { error: 'taken' };
  }
  return { node: made };
}

// Grades an answer tree against the puzzle's line.
// → { state: 'failed' | 'unfinished' | 'solved',
//     marks: Map(node id → 'right' | 'wrong' | 'unchecked'),
//     missing: null, or what the main line still owes:
//       { after, reply }: `after` is the last node on the main line; `reply` is
//       the puzzle's reply (SAN) when that is what is not written, and null
//       when the reply is there and the player's own move after it is not,
//     wrong: the node that failed it, or null,
//     side: how many chips are off the main line }
export function calcGrade(tree, line) {
  const marks = new Map();
  let state = 'solved', missing = null, wrong = null;
  let node = tree.root;
  for (let i = 0; i < line.length; i++) {
    const want = line[i].san;
    if (i % 2 === 0) {
      const mine = node.children[0];
      if (!mine) { state = 'unfinished'; missing = { after: node, reply: null }; break; }
      if (mine.san !== want && !mine.san.endsWith('#')) { marks.set(mine.id, 'wrong'); wrong = mine; state = 'failed'; break; }
      marks.set(mine.id, 'right');
      node = mine;
      if (mine.san !== want) break;   // a different mate: nothing is left to answer
    } else {
      const reply = node.children.find(c => c.san === want);
      if (!reply) { state = 'unfinished'; missing = { after: node, reply: want }; break; }
      marks.set(reply.id, 'right');
      node = reply;
    }
  }
  let side = 0;
  const rest = n => {
    for (const c of n.children) {
      if (!marks.has(c.id)) { marks.set(c.id, 'unchecked'); side++; }
      rest(c);
    }
  };
  rest(tree.root);
  return { state, marks, missing, wrong, side };
}

// 'failed' | 'unfinished' | 'solved' | 'perfect'. `handIns` counts this one.
// `helped` is Kael having written a reply in (or, later, a hint); `sideWrong`
// is how many side-variation moves the engine found wrong (conversation 2).
export function calcVerdict(grade, { handIns = 1, helped = false, sideWrong = 0 } = {}) {
  if (grade.state !== 'solved') return grade.state;
  return handIns <= 1 && !helped && !sideWrong ? 'perfect' : 'solved';
}

// Kael writes the puzzle's reply in where it is owed. → the new node, marked
// `kael`, or null when it is the player's own move that is owed.
export function calcAddReply(tree, missing) {
  if (!missing || !missing.reply) return null;
  tree.goto(missing.after);
  const node = tree.play(missing.reply);
  if (node) node.kael = true;
  return node;
}

// The tree as rows for the screen, top to bottom:
//   { depth, reply, own, at }
// The first row is the player's first move alone (reply null). Every other row
// is one opponent reply with the player's answer beside it. `own` is null where
// that answer is not written yet: an empty slot. `at` is the node the slot's
// move would be written after. Replies to a row's `own` follow it, one step in.
export function calcRows(tree) {
  const rows = [];
  const under = (own, depth) => {
    if (!own) return;
    for (const reply of own.children) {
      const next = reply.children[0] || null;
      rows.push({ depth, reply, own: next, at: reply });
      under(next, depth + 1);
    }
  };
  const first = tree.root.children[0] || null;
  rows.push({ depth: 0, reply: null, own: first, at: tree.root });
  under(first, 1);
  return rows;
}
