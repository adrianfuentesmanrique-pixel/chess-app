// The opening library, as the Openings tab reads it: the cards, the search, an
// opening's rows, the name a line has earned at a given move, the lines that
// continue a line and the book of a study game.
//
// Pure: no DOM, no imports, no chess of its own (buildBook is handed the Chess
// class). The data (js/opening-library.js, 323 KB,
// generated) is handed in by the caller, which loads it only when the Library is
// first shown. Runs under plain Node (tests/unit/opening-lib.test.js).
//
// A library name is a label and a search text. It is never a storage key: those
// are the names in js/openings-eco.js, which this file does not read.

// Accent-blind and case-blind: "grunfeld" must find "Grünfeld Defense".
export function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// "e4 c5 Nf3" -> "1.e4 c5 2.Nf3"
export function numbered(moves) {
  const list = Array.isArray(moves) ? moves : String(moves).split(' ').filter(Boolean);
  return list.map((san, i) => (i % 2 ? san : `${i / 2 + 1}.${san}`)).join(' ');
}

// The three first-move chips.
export function firstMoveGroup(moves) {
  const first = String(moves).split(' ')[0];
  return first === 'e4' ? 'e4' : first === 'd4' ? 'd4' : 'other';
}

export function fullName(opening, line) {
  return line[1] ? `${opening.name}: ${line[1]}` : opening.name;
}

// The moves an opening is known by. Its own line (the one with no variation
// name) when it has one, the shortest if it has several move orders. 13 openings
// have none ("King's Gambit Declined" is only ever a named variation): for those,
// the moves that more than half of their lines begin with.
function openingMoves(opening) {
  const own = opening.lines.filter(l => !l[1]).map(l => l[2].split(' '));
  if (own.length) return own.reduce((a, b) => (b.length < a.length ? b : a)).join(' ');
  let left = opening.lines.map(l => l[2].split(' '));
  const shared = [];
  for (;;) {
    const seen = new Map();
    for (const m of left) if (m.length > shared.length) seen.set(m[shared.length], (seen.get(m[shared.length]) || 0) + 1);
    const best = [...seen].reduce((a, b) => (b[1] > a[1] ? b : a), [null, 0]);
    if (best[1] * 2 <= opening.lines.length) break;
    left = left.filter(m => m[shared.length] === best[0]);
    shared.push(best[0]);
  }
  return shared.length ? shared.join(' ') : opening.lines[0][2];
}

// One card per opening, most variations first, then by name.
//   { index, name, side, moves, group, count }
// `index` is the opening's place in the library; `moves` is SAN, space separated.
export function buildCards(library) {
  const cards = library.map((o, index) => {
    const moves = openingMoves(o);
    return { index, name: o.name, side: o.side, moves, group: firstMoveGroup(moves), count: o.lines.length };
  });
  return cards.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'en'));
}

// side: 'both' | 'w' | 'b'.  group: null | 'e4' | 'd4' | 'other'.
export function filterCards(cards, { side = 'both', group = null } = {}) {
  return cards.filter(c => (side === 'both' || c.side === side) && (!group || c.group === group));
}

// Every name of the library, folded once, for the search box.
//   { o, l, text, side, group }   o, l: opening and line index
export function buildSearchIndex(library) {
  const index = [];
  library.forEach((opening, o) => {
    opening.lines.forEach((line, l) => {
      index.push({ o, l, text: fold(fullName(opening, line)), side: opening.side, group: firstMoveGroup(line[2]) });
    });
  });
  return index;
}

function words(query) { return fold(query).split(/[^a-z0-9]+/).filter(Boolean); }

// Lines whose name holds every word of the query, in library order (so an
// opening's lines stay together, in tree order). An empty query matches nothing.
export function searchLines(index, query, { side = 'both', group = null } = {}) {
  const w = words(query);
  if (!w.length) return [];
  return index.filter(e => (side === 'both' || e.side === side) && (!group || e.group === group)
    && w.every(x => e.text.includes(x)));
}

// An opening's lines as list rows, in tree order (the order of the data).
//   { l, name, moves }   name: the variation, or the opening's own name
export function openingRows(opening, filter = '') {
  const w = words(filter);
  const rows = opening.lines.map((line, l) => ({ l, name: line[1] || opening.name, moves: line[2] }));
  if (!w.length) return rows;
  return rows.filter(r => { const text = fold(r.name); return w.every(x => text.includes(x)); });
}

// "a6 Be3" after 10 half-moves -> "6.Be3"-style numbering that carries on from
// there: numberedFrom('a6 Be3', 9) is "5...a6 6.Be3".
export function numberedFrom(moves, ply) {
  const list = Array.isArray(moves) ? moves : String(moves).split(' ').filter(Boolean);
  return list.map((san, i) => {
    const at = ply + i;
    return at % 2 === 0 ? `${at / 2 + 1}.${san}` : i === 0 ? `${(at + 1) / 2}...${san}` : san;
  }).join(' ');
}

// The lines that begin with these moves and go on: every one of them, in
// library order. The moves themselves are not among them.
function linesBeyond(library, moves) {
  const head = moves ? moves + ' ' : '';
  const found = [];
  library.forEach((opening, o) => {
    opening.lines.forEach((line, l) => { if (line[2].length > head.length && line[2].startsWith(head)) found.push({ o, l, moves: line[2] }); });
  });
  return found;
}

// "Continues with": the NEXT named lines after these moves, in library order.
// A line is next when no other named line lies between it and these moves, so
// a tap walks one name further and the list stays short (the Sicilian after
// 1.e4 c5 is a few dozen rows, not 399).
//   { o, l, more }   more: how many named lines go on beyond that one
// By moves, not by position: a transposition is not followed.
export function continuations(library, moves) {
  const base = Array.isArray(moves) ? moves.join(' ') : String(moves).trim();
  const from = base ? base.split(' ').length : 0;
  const beyond = linesBeyond(library, base);
  const named = new Set(beyond.map(e => e.moves));
  const next = [], seen = new Set();
  for (const e of beyond) {
    if (seen.has(e.moves)) continue;   // the same moves under a second name
    const list = e.moves.split(' ');
    let between = false;
    for (let n = from + 1; n < list.length && !between; n++) between = named.has(list.slice(0, n).join(' '));
    if (between) continue;
    seen.add(e.moves);
    next.push({ o: e.o, l: e.l, more: 0, moves: e.moves });
  }
  for (const c of next) {
    const head = c.moves + ' ';
    for (const e of beyond) if (e.moves.startsWith(head)) c.more++;
  }
  return next.map(({ o, l, more }) => ({ o, l, more }));
}

// The book of a study game: these moves and every library line that continues
// them, as a Map from fenKey(fen) to { san: count }, the exact shape
// Trainer.buildBook makes from a database. By POSITION, so a game that reaches
// a book position by another move order is still in its book.
//
// A count is the number of named lines that pass through that move. It is not
// how often the move is played by anyone: the library does not know that.
//
// The Chess class and fenKey are handed in (vendor/chess.js and
// js/explore-index.js), because this file imports nothing. The lines are
// merged into a tree first, so a move shared by 400 lines is played once.
//   { book, lines }   lines: how many named lines the book was made from
export function buildBook(library, moves, { Chess, fenKey }) {
  const base = Array.isArray(moves) ? moves.join(' ') : String(moves).trim();
  const all = linesBeyond(library, base).map(e => e.moves);
  // The line on screen itself, once for each name it carries (at least once).
  let own = 0;
  for (const opening of library) for (const line of opening.lines) if (line[2] === base) own++;
  if (base) for (let i = Math.max(own, 1); i > 0; i--) all.push(base);
  const root = { n: 0, next: new Map() };
  for (const text of all) {
    let node = root;
    for (const san of text.split(' ')) {
      let child = node.next.get(san);
      if (!child) { child = { n: 0, next: new Map() }; node.next.set(san, child); }
      child.n++;
      node = child;
    }
  }
  const book = new Map();
  const chess = new Chess();
  const walk = node => {
    if (!node.next.size) return;
    const key = fenKey(chess.fen());
    let entry = book.get(key);
    if (!entry) { entry = {}; book.set(key, entry); }
    for (const [san, child] of node.next) {
      entry[san] = (entry[san] ?? 0) + child.n;
      chess.move(san);
      walk(child);
      chess.undo();
    }
  };
  walk(root);
  return { book, lines: all.length };
}

// Every line of the library by its moves, for nameAt().
export function buildNameIndex(library) {
  const byMoves = new Map();
  library.forEach((opening, o) => {
    opening.lines.forEach((line, l) => { if (!byMoves.has(line[2])) byMoves.set(line[2], { o, l }); });
  });
  return byMoves;
}

// The deepest library name reached after `ply` moves of `moves`: the longest
// named line that these moves begin with. So the name changes on the move that
// earns it. null before any named move.
//   { o, l, ply }   ply: the move that earned it
export function nameAt(byMoves, moves, ply) {
  const list = Array.isArray(moves) ? moves : String(moves).split(' ').filter(Boolean);
  for (let n = Math.min(ply, list.length); n > 0; n--) {
    const hit = byMoves.get(list.slice(0, n).join(' '));
    if (hit) return { ...hit, ply: n };
  }
  return null;
}
