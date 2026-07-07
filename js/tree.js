// Game tree with variations, comments and NAGs, plus a PGN parser/writer.
// chess.js is used only for move legality and SAN; the tree itself is ours.
import { Chess } from '../vendor/chess.js';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

let seq = 0;

class Node {
  constructor(parent, san, fen, from, to) {
    this.id = ++seq;
    this.parent = parent;
    this.san = san;       // null for the root
    this.fen = fen;       // position AFTER this move
    this.from = from;
    this.to = to;
    this.comment = '';
    this.nags = [];
    this.shapes = { squares: [], arrows: [] }; // board annotations — saved to PGN via [%csl]/[%cal] tags
    this.children = [];   // children[0] = main continuation
  }
}

const NAG_TEXT = { 1: '!', 2: '?', 3: '!!', 4: '??', 5: '!?', 6: '?!', 10: '=', 13: '∞', 14: '⩲', 15: '⩱', 16: '±', 17: '∓', 18: '+-', 19: '-+' };

export class GameTree {
  constructor(startFen = START_FEN) {
    this.headers = {};
    this.startFen = startFen;
    this.root = new Node(null, null, startFen, null, null);
    this.current = this.root;
  }

  // --- navigation -----------------------------------------------------
  fen() { return this.current.fen; }
  atStart() { return this.current === this.root; }
  atEnd() { return this.current.children.length === 0; }
  next() { if (this.current.children[0]) this.current = this.current.children[0]; return this.current; }
  prev() { if (this.current.parent) this.current = this.current.parent; return this.current; }
  toStart() { this.current = this.root; }
  toEnd() { while (this.current.children[0]) this.current = this.current.children[0]; }
  goto(node) { this.current = node; }
  findById(id, node = this.root) {
    if (node.id === id) return node;
    for (const c of node.children) { const r = this.findById(id, c); if (r) return r; }
    return null;
  }

  // Ply number and side for a node (for "12. Nf3" style labels)
  moveNumberFor(node) {
    const fenBefore = node.parent.fen;
    const parts = fenBefore.split(' ');
    return { num: parseInt(parts[5], 10), whiteMoves: parts[1] === 'w' };
  }

  // --- editing --------------------------------------------------------
  // Play a move from the current position. Accepts {from,to,promotion} or SAN.
  // If the move already exists as a child, we just walk into it.
  play(move) {
    const chess = new Chess(this.current.fen);
    let m;
    try { m = chess.move(move); } catch { return null; }
    const existing = this.current.children.find(c => c.san === m.san);
    if (existing) { this.current = existing; return existing; }
    const node = new Node(this.current, m.san, chess.fen(), m.from, m.to);
    this.current.children.push(node);
    this.current = node;
    return node;
  }

  deleteNode(node) {
    if (!node.parent) return;
    const sib = node.parent.children;
    sib.splice(sib.indexOf(node), 1);
    if (this.isDescendant(this.current, node) || this.current === node) this.current = node.parent;
  }

  isDescendant(maybeChild, ancestor) {
    let n = maybeChild;
    while (n) { if (n === ancestor) return true; n = n.parent; }
    return false;
  }

  // Make the variation containing `node` the main line at its branch point.
  promote(node) {
    let n = node;
    while (n.parent) {
      const sib = n.parent.children;
      const i = sib.indexOf(n);
      if (i > 0) { sib.splice(i, 1); sib.unshift(n); return; }
      n = n.parent;
    }
  }

  mainlinePath() {
    const path = [];
    let n = this.root;
    while (n.children[0]) { n = n.children[0]; path.push(n); }
    return path;
  }

  // --- result / headers ----------------------------------------------
  setHeader(k, v) { if (v) this.headers[k] = v; else delete this.headers[k]; }

  // --- PGN output -----------------------------------------------------
  toPgn() {
    const H = this.headers;
    const order = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result'];
    const lines = [];
    for (const k of order) lines.push(`[${k} "${H[k] ?? (k === 'Result' ? '*' : k === 'Date' ? '????.??.??' : '?')}"]`);
    for (const k of Object.keys(H)) if (!order.includes(k)) lines.push(`[${k} "${H[k]}"]`);
    if (this.startFen !== START_FEN) {
      lines.push(`[SetUp "1"]`);
      lines.push(`[FEN "${this.startFen}"]`);
    }
    let body = '';
    const rootComment = commentWithShapes(this.root);
    if (rootComment) body += `{${rootComment}} `;
    body += this.movesText(this.root, true);
    body += (body && !body.endsWith(' ') ? ' ' : '') + (H['Result'] ?? '*');
    return lines.join('\n') + '\n\n' + wrap(body.trim()) + '\n';
  }

  movesText(fromNode, forceNumber) {
    let out = '';
    let node = fromNode.children[0];
    let needNum = forceNumber;
    let parent = fromNode;
    while (node) {
      const { num, whiteMoves } = this.moveNumberFor(node);
      if (whiteMoves) out += `${num}. `;
      else if (needNum) out += `${num}... `;
      needNum = false;
      out += node.san;
      for (const g of node.nags) out += ` $${g}`;
      out += ' ';
      const nodeComment = commentWithShapes(node);
      if (nodeComment) { out += `{${nodeComment}} `; needNum = true; }
      // siblings of node = variations on this move
      for (let i = 1; i < parent.children.length; i++) {
        out += `( ${this.movesText(new ProxyStart(parent, parent.children[i]), true)}) `;
        needNum = true;
      }
      parent = node;
      node = node.children[0];
    }
    return out;
  }
}

// Helper: lets movesText render a specific variation branch — a fake node
// whose only child is the variation head.
class ProxyStart {
  constructor(realParent, head) { this.children = [head]; this.fen = realParent.fen; }
}
// moveNumberFor uses node.parent.fen, which is still the real parent — fine.

function escComment(s) { return s.replace(/}/g, ')').replace(/\{/g, '('); }

// Board arrows/highlighted squares round-trip through PGN comments using the
// same [%csl]/[%cal] tag convention lichess and chess.com use, so games
// stay readable (and the shapes survive) in other tools too.
const SHAPE_COLOR_CODE = { green: 'G', yellow: 'Y', red: 'R' };
const SHAPE_CODE_COLOR = { G: 'green', Y: 'yellow', R: 'red' };

function commentWithShapes(node) {
  const tags = shapesToTags(node.shapes);
  const comment = node.comment ? escComment(node.comment) : '';
  return (tags + (tags && comment ? ' ' : '') + comment).trim();
}

function shapesToTags(shapes) {
  if (!shapes) return '';
  const sq = (shapes.squares || []).map(s => (SHAPE_COLOR_CODE[s.color] || 'G') + s.sq);
  const ar = (shapes.arrows || []).map(a => (SHAPE_COLOR_CODE[a.color] || 'G') + a.from + a.to);
  let out = '';
  if (sq.length) out += `[%csl ${sq.join(',')}]`;
  if (ar.length) out += `${out ? ' ' : ''}[%cal ${ar.join(',')}]`;
  return out;
}

function extractShapesFromComment(text) {
  const shapes = { squares: [], arrows: [] };
  let clean = text;
  const cslMatch = clean.match(/\[%csl ([^\]]*)\]/);
  if (cslMatch) {
    for (const tok of cslMatch[1].split(',')) {
      const tk = tok.trim();
      if (!tk) continue;
      shapes.squares.push({ sq: tk.slice(1), color: SHAPE_CODE_COLOR[tk[0]] || 'green' });
    }
    clean = clean.replace(cslMatch[0], '');
  }
  const calMatch = clean.match(/\[%cal ([^\]]*)\]/);
  if (calMatch) {
    for (const tok of calMatch[1].split(',')) {
      const tk = tok.trim();
      if (!tk || tk.length < 5) continue;
      shapes.arrows.push({ from: tk.slice(1, 3), to: tk.slice(3, 5), color: SHAPE_CODE_COLOR[tk[0]] || 'green' });
    }
    clean = clean.replace(calMatch[0], '');
  }
  return { shapes, clean: clean.trim() };
}

function wrap(text, width = 80) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (cur && cur.length + w.length + 1 > width) { lines.push(cur); cur = w; }
    else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) lines.push(cur);
  return lines.join('\n');
}

// --- PGN input ---------------------------------------------------------

// Split a PGN file (may contain many games) into individual game strings.
export function splitPgn(text) {
  text = text.replace(/\r\n/g, '\n').replace(/^﻿/, '');
  const games = [];
  const lines = text.split('\n');
  let cur = [];
  let seenMoves = false;
  for (const line of lines) {
    const isHeader = /^\s*\[\w+\s+"/.test(line);
    if (isHeader && seenMoves) { games.push(cur.join('\n')); cur = []; seenMoves = false; }
    if (!isHeader && line.trim() !== '' && cur.length) seenMoves = true;
    cur.push(line);
  }
  if (cur.join('').trim()) games.push(cur.join('\n'));
  return games.filter(g => g.trim());
}

const SUFFIX_NAG = { '!': 1, '?': 2, '!!': 3, '??': 4, '!?': 5, '?!': 6 };

export function parsePgn(text) {
  const tree = new GameTree();
  // headers
  const headerRe = /^\s*\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]\s*$/gm;
  let m;
  let lastHeaderEnd = 0;
  while ((m = headerRe.exec(text)) !== null) {
    tree.headers[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    lastHeaderEnd = headerRe.lastIndex;
  }
  if (tree.headers['FEN']) {
    tree.startFen = tree.headers['FEN'];
    tree.root.fen = tree.startFen;
    delete tree.headers['FEN'];
    delete tree.headers['SetUp'];
  }
  let body = text.slice(lastHeaderEnd);
  // strip line comments (;...) — rare
  body = body.replace(/;[^\n]*/g, '');

  // tokenizer
  const tokens = [];
  const re = /\{([^}]*)\}|\(|\)|\$(\d+)|(1-0|0-1|1\/2-1\/2|\*)|([^\s(){}]+)/g;
  let tk;
  while ((tk = re.exec(body)) !== null) {
    if (tk[1] !== undefined) tokens.push({ t: 'comment', v: tk[1].trim() });
    else if (tk[0] === '(') tokens.push({ t: 'open' });
    else if (tk[0] === ')') tokens.push({ t: 'close' });
    else if (tk[2] !== undefined) tokens.push({ t: 'nag', v: +tk[2] });
    else if (tk[3] !== undefined) tokens.push({ t: 'result', v: tk[3] });
    else tokens.push({ t: 'san', v: tk[4] });
  }

  const stack = [];           // saved cursor positions for variations
  let cursor = tree.root;     // node after whose move we are
  let lastMoveNode = tree.root;

  for (const tok of tokens) {
    if (tok.t === 'san') {
      let san = tok.v.replace(/^\d+\.+/, '').replace(/^\.+/, '');
      if (!san) continue;
      // suffix like Nf3!? → NAG
      const sfx = san.match(/([!?]{1,2})$/);
      let nag = null;
      if (sfx) { nag = SUFFIX_NAG[sfx[1]]; san = san.slice(0, -sfx[1].length); }
      if (!san || /^\d/.test(san)) continue;
      const chess = new Chess(cursor.fen);
      let mv;
      try { mv = chess.move(san); } catch { continue; } // skip junk tokens
      const existing = cursor.children.find(c => c.san === mv.san);
      let node;
      if (existing) node = existing;
      else {
        node = new Node(cursor, mv.san, chess.fen(), mv.from, mv.to);
        cursor.children.push(node);
      }
      if (nag && !node.nags.includes(nag)) node.nags.push(nag);
      cursor = node;
      lastMoveNode = node;
    } else if (tok.t === 'comment') {
      const { shapes, clean } = extractShapesFromComment(tok.v);
      if (shapes.squares.length || shapes.arrows.length) {
        lastMoveNode.shapes = {
          squares: [...lastMoveNode.shapes.squares, ...shapes.squares],
          arrows: [...lastMoveNode.shapes.arrows, ...shapes.arrows],
        };
      }
      if (clean) {
        if (lastMoveNode.comment) lastMoveNode.comment += ' ' + clean;
        else lastMoveNode.comment = clean;
      }
    } else if (tok.t === 'nag') {
      if (lastMoveNode.san && !lastMoveNode.nags.includes(tok.v)) lastMoveNode.nags.push(tok.v);
    } else if (tok.t === 'open') {
      stack.push(cursor);
      cursor = cursor.parent ?? cursor; // variation replaces the LAST move
      lastMoveNode = cursor;
    } else if (tok.t === 'close') {
      cursor = stack.pop() ?? tree.root;
      lastMoveNode = cursor;
    } else if (tok.t === 'result') {
      if (!tree.headers['Result'] || tree.headers['Result'] === '*') tree.headers['Result'] = tok.v;
    }
  }
  tree.current = tree.root;
  return tree;
}

export function nagText(n) { return NAG_TEXT[n] ?? `$${n}`; }
