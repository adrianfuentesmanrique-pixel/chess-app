// The move list: one move pair per row, variations and comments underneath.
//
// Shared by the Analysis, Play and Opening screens. Imports only js/tree.js, so
// moveListItems() — the part that decides what goes on which row — runs under
// plain Node (tests/unit/movelist.test.js).
import { nagText } from './tree.js';

// Colors a move in the notation when it carries a Game-Review-assigned
// quality NAG ($3 brilliant, $2 mistake, $4 blunder) — a plain " mv-xxx"
// suffix (or '') so it can be appended straight into a className string.
function nagMoveClass(nags) {
  if (nags.includes(4)) return ' mv-blunder';
  if (nags.includes(2)) return ' mv-mistake';
  if (nags.includes(3)) return ' mv-brilliant';
  return '';
}

// One line of play as a list of items, in reading order:
//   { type: 'pair', num, white, black }   white or black is null when the pair
//                                         was cut by a comment or a variation
//   { type: 'comment', node, text }
//   { type: 'var', depth, items }         a variation, same shape one level down
function lineItems(tree, fromNode, depth) {
  const items = [];
  let parent = fromNode;
  let node = fromNode.children[0];
  let open = null;                 // a pair still waiting for Black's move
  while (node) {
    const { num, whiteMoves } = tree.moveNumberFor(node);
    if (whiteMoves) {
      open = { type: 'pair', num, white: node, black: null };
      items.push(open);
    } else {
      if (open) open.black = node;
      else items.push({ type: 'pair', num, white: null, black: node });
      open = null;
    }
    if (node.comment) {
      items.push({ type: 'comment', node, text: node.comment });
      open = null;
    }
    for (let i = 1; i < parent.children.length; i++) {
      items.push({
        type: 'var', depth: depth + 1,
        items: lineItems(tree, { children: [parent.children[i]] }, depth + 1),
      });
      open = null;
    }
    parent = node;
    node = node.children[0];
  }
  return items;
}

export function moveListItems(tree) {
  const items = lineItems(tree, tree.root, 0);
  if (tree.root.comment) items.unshift({ type: 'comment', node: tree.root, text: tree.root.comment });
  return items;
}

function moveSpan(node, current) {
  const span = document.createElement('span');
  span.className = 'mv' + (node === current ? ' current' : '') + nagMoveClass(node.nags);
  span.dataset.node = node.id;
  span.textContent = node.san + node.nags.map(nagText).join('');
  return span;
}

function commentEl(item) {
  const c = document.createElement('div');
  c.className = 'mv-comment';
  c.dataset.node = item.node.id;
  c.textContent = item.text;
  return c;
}

// A variation flows horizontally and wraps, but only BETWEEN units: each unit is
// "number + White + Black" and never breaks inside (white-space: nowrap in the
// CSS). "(" lives inside the first unit and ")" inside the last, so a line can
// never end on a bracket, a number, or a White move that has a Black reply.
function variationEl(item, current) {
  const el = document.createElement('div');
  el.className = 'variation d' + Math.min(item.depth, 3);
  const units = [];
  for (const it of item.items) {
    if (it.type === 'comment') { el.appendChild(commentEl(it)); continue; }
    if (it.type === 'var') { el.appendChild(variationEl(it, current)); continue; }
    const unit = document.createElement('span');
    unit.className = 'mv-unit';
    unit.append(it.num + (it.white ? '. ' : '… '));
    if (it.white) unit.appendChild(moveSpan(it.white, current));
    if (it.white && it.black) unit.append(' ');
    if (it.black) unit.appendChild(moveSpan(it.black, current));
    el.appendChild(unit);
    el.append(' ');
    units.push(unit);
  }
  if (units.length) {
    units[0].prepend('(');
    units[units.length - 1].append(')');
  }
  return el;
}

// Fills `el` with the tree's moves. `current` is the node to highlight (or null).
export function renderMoveList(el, tree, current = null) {
  el.innerHTML = '';
  for (const it of moveListItems(tree)) {
    if (it.type === 'comment') { el.appendChild(commentEl(it)); continue; }
    if (it.type === 'var') { el.appendChild(variationEl(it, current)); continue; }
    const row = document.createElement('div');
    row.className = 'mv-row';
    const num = document.createElement('span');
    num.className = 'mv-num';
    num.textContent = it.num + (it.white ? '.' : '…');
    row.appendChild(num);
    row.appendChild(it.white ? moveSpan(it.white, current) : document.createElement('span'));
    if (it.black) row.appendChild(moveSpan(it.black, current));
    el.appendChild(row);
  }
}
