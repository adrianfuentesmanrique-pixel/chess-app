// The opening library as the Openings tab reads it (js/opening-lib.js): the
// cards, the accent-blind search, an opening's rows, the name at a move.
//
// Run: npm run test:tree
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { OPENING_LIBRARY } from '../../js/opening-library.js';
import { fold, numbered, firstMoveGroup, fullName, buildCards, filterCards, buildSearchIndex, searchLines,
  openingRows, buildNameIndex, nameAt, numberedFrom, continuations, buildBook } from '../../js/opening-lib.js';
import { Chess } from '../../vendor/chess.js';
import { fenKey } from '../../js/explore-index.js';
import { classifyOpening } from '../../js/openings-eco.js';

const cards = buildCards(OPENING_LIBRARY);
const index = buildSearchIndex(OPENING_LIBRARY);
const byMoves = buildNameIndex(OPENING_LIBRARY);
const card = name => cards.find(c => c.name === name);
const opening = name => OPENING_LIBRARY.find(o => o.name === name);

test('opening-lib: small helpers', () => {
  assert.equal(fold('Grünfeld Défense'), 'grunfeld defense');
  assert.equal(numbered('e4 c5 Nf3'), '1.e4 c5 2.Nf3');
  assert.equal(numbered(['d4']), '1.d4');
  assert.equal(numbered(''), '');
  assert.equal(firstMoveGroup('e4 c5'), 'e4');
  assert.equal(firstMoveGroup('d4'), 'd4');
  assert.equal(firstMoveGroup('Nf3 d5'), 'other');
});

test('opening-lib: one card for each of the 150 openings, with what the data knows', () => {
  assert.equal(cards.length, 150);
  assert.equal(new Set(cards.map(c => c.index)).size, 150);
  for (const c of cards) {
    const o = OPENING_LIBRARY[c.index];
    assert.equal(c.name, o.name);
    assert.equal(c.side, o.side);
    assert.equal(c.count, o.lines.length);
    assert.ok(c.moves.length > 0, `${c.name} has first moves`);
    // The card's moves are the opening's own line, or how most of its lines begin.
    const own = o.lines.filter(l => !l[1]).map(l => l[2]);
    if (own.length) assert.ok(own.includes(c.moves) && own.every(m => m.split(' ').length >= c.moves.split(' ').length), c.name);
    else assert.ok(o.lines.filter(l => (l[2] + ' ').startsWith(c.moves + ' ')).length * 2 > o.lines.length, c.name);
  }
  // Several move orders carry the bare name: the shortest is the card's.
  assert.equal(card("Queen's Gambit Declined").moves, 'd4 d5 c4 e6');
  // Never the bare name, only named variations: what most of them share.
  assert.equal(card("King's Gambit Declined").moves, 'e4 e5 f4');
  const sicilian = card('Sicilian Defense');
  assert.deepEqual({ side: sicilian.side, moves: sicilian.moves, group: sicilian.group, count: sicilian.count },
    { side: 'b', moves: 'e4 c5', group: 'e4', count: 400 });
  const ruy = card('Ruy Lopez');
  assert.deepEqual({ side: ruy.side, moves: ruy.moves, count: ruy.count }, { side: 'w', moves: 'e4 e5 Nf3 Nc6 Bb5', count: 235 });
});

test('opening-lib: the cards come most variations first, then by name', () => {
  assert.equal(cards[0].name, 'Sicilian Defense');
  assert.equal(cards[1].name, 'Ruy Lopez');
  for (let i = 1; i < cards.length; i++) {
    const a = cards[i - 1], b = cards[i];
    assert.ok(a.count > b.count || (a.count === b.count && a.name.localeCompare(b.name, 'en') < 0), `${a.name} before ${b.name}`);
  }
  assert.equal(cards.filter(c => c.count === 1).length, 40);
  assert.ok(cards.slice(-40).every(c => c.count === 1), 'the one-line openings sink');
});

test('opening-lib: the colour and first-move filters', () => {
  assert.equal(filterCards(cards).length, 150);
  assert.equal(filterCards(cards, { side: 'w' }).length, 70);
  assert.equal(filterCards(cards, { side: 'b' }).length, 80);
  const groups = ['e4', 'd4', 'other'].map(group => filterCards(cards, { group }).length);
  assert.equal(groups[0] + groups[1] + groups[2], 150);
  // By the moves shown on the card. (Counted by each opening's first line in the
  // data instead, it is 50 / 67 / 33: 29 openings have lines with different first moves.)
  assert.deepEqual(groups, [53, 65, 32]);
  const both = filterCards(cards, { side: 'b', group: 'e4' });
  assert.ok(both.length > 0 && both.every(c => c.side === 'b' && c.group === 'e4'));
  assert.equal(both[0].name, 'Sicilian Defense');
});

test('opening-lib: the search reads every name, blind to accents and capitals', () => {
  assert.equal(index.length, 3865);
  assert.deepEqual(searchLines(index, ''), []);
  assert.deepEqual(searchLines(index, '  '), []);
  const names = q => searchLines(index, q).map(e => fullName(OPENING_LIBRARY[e.o], OPENING_LIBRARY[e.o].lines[e.l]));
  const grunfeld = names('grunfeld');
  assert.ok(grunfeld.includes('Grünfeld Defense'));
  assert.deepEqual(names('GRÜNFELD'), grunfeld);
  // Every word must be there, in any order, across the opening and the variation.
  const najdorf = names('najdorf english attack');
  assert.ok(najdorf.includes('Sicilian Defense: Najdorf Variation, English Attack'));
  assert.ok(najdorf.every(n => /najdorf/i.test(n) && /english/i.test(n) && /attack/i.test(n)));
  assert.deepEqual(names('attack english najdorf'), najdorf);
  assert.deepEqual(names('zzzz'), []);
  // No name is out of reach: each one finds itself.
  for (const o of OPENING_LIBRARY.slice(0, 150)) {
    const line = o.lines[o.lines.length - 1];
    assert.ok(names(fullName(o, line)).includes(fullName(o, line)), fullName(o, line));
  }
  // The filters narrow a search too.
  const white = searchLines(index, 'gambit', { side: 'w' });
  assert.ok(white.length > 0 && white.every(e => OPENING_LIBRARY[e.o].side === 'w'));
  const d4 = searchLines(index, 'gambit', { group: 'd4' });
  assert.ok(d4.length > 0 && d4.every(e => OPENING_LIBRARY[e.o].lines[e.l][2].startsWith('d4')));
});

test('opening-lib: an opening\'s rows, in the order of the data, and its filter', () => {
  const sicilian = opening('Sicilian Defense');
  const rows = openingRows(sicilian);
  assert.equal(rows.length, 400);
  assert.deepEqual(rows.map(r => r.l), sicilian.lines.map((_, i) => i));
  assert.deepEqual(rows[0], { l: 0, name: 'Sicilian Defense', moves: 'e4 c5' });
  assert.ok(rows.every((r, i) => r.moves === sicilian.lines[i][2] && r.name === (sicilian.lines[i][1] || 'Sicilian Defense')));
  const najdorf = openingRows(sicilian, 'NAJDORF');
  assert.ok(najdorf.length > 5 && najdorf.length < 400 && najdorf.every(r => /najdorf/i.test(r.name)));
  assert.deepEqual(openingRows(sicilian, 'zzzz'), []);
  const one = OPENING_LIBRARY.find(o => o.lines.length === 1);
  assert.equal(openingRows(one).length, 1);
  assert.equal(openingRows(one)[0].name, one.lines[0][1] || one.name);
});

test('opening-lib: the name at a move is the deepest one the moves have earned', () => {
  const sicilian = opening('Sicilian Defense');
  const line = sicilian.lines.find(l => l[1] === 'Najdorf Variation, English Attack');
  const moves = line[2].split(' ');
  const at = ply => { const hit = nameAt(byMoves, moves, ply); return hit && { name: fullName(OPENING_LIBRARY[hit.o], OPENING_LIBRARY[hit.o].lines[hit.l]), ply: hit.ply }; };
  assert.equal(nameAt(byMoves, moves, 0), null);
  assert.equal(at(2).name, 'Sicilian Defense');
  assert.equal(at(moves.length).name, 'Sicilian Defense: Najdorf Variation, English Attack');
  assert.equal(at(moves.length).ply, moves.length);
  assert.equal(at(99).name, 'Sicilian Defense: Najdorf Variation, English Attack');
  // A name is kept until the next one is earned, and never looks ahead.
  let last = 0;
  for (let ply = 1; ply <= moves.length; ply++) {
    const hit = at(ply);
    if (!hit) continue;
    assert.ok(hit.ply <= ply && hit.ply >= last, `ply ${ply}`);
    last = hit.ply;
  }
  // Every line of the library is named by its own last move.
  for (const o of OPENING_LIBRARY) for (const l of o.lines) {
    const hit = nameAt(byMoves, l[2], l[2].split(' ').length);
    assert.equal(OPENING_LIBRARY[hit.o].lines[hit.l][2], l[2]);
  }
  assert.deepEqual(nameAt(byMoves, 'e4 c5', 2), { ...byMoves.get('e4 c5'), ply: 2 });
});

// ── the book of a study game and "Continues with" ──

const chessDeps = { Chess, fenKey };
const keyAfter = moves => {
  const c = new Chess();
  for (const san of moves.split(' ').filter(Boolean)) c.move(san);
  return fenKey(c.fen());
};
const linesThrough = moves => OPENING_LIBRARY.flatMap(o => o.lines).filter(l => l[2] === moves || l[2].startsWith(moves + ' '));

test('opening-lib: numbering that carries on from a move', () => {
  assert.equal(numberedFrom('a6 Be3', 9), '5...a6 6.Be3');
  assert.equal(numberedFrom('Be3 e5', 10), '6.Be3 e5');
  assert.equal(numberedFrom('e4', 0), '1.e4');
  assert.equal(numberedFrom(['c5'], 1), '1...c5');
});

test('opening-lib: the book has the shape Trainer.buildBook makes, and counts named lines', () => {
  const { book, lines } = buildBook(OPENING_LIBRARY, 'e4 c5', chessDeps);
  assert.ok(book instanceof Map);
  const through = linesThrough('e4 c5');
  assert.equal(lines, through.length);
  for (const [key, entry] of book) {
    assert.equal(key.split(' ').length, 4, 'a fenKey: placement, turn, castling, en passant');
    assert.ok(Object.keys(entry).length > 0);
    for (const n of Object.values(entry)) assert.ok(Number.isInteger(n) && n > 0);
  }
  // The line on screen: one move at each of its positions, counted once for every line.
  assert.deepEqual(book.get(keyAfter('')), { e4: through.length });
  assert.deepEqual(book.get(keyAfter('e4')), { c5: through.length });
  // After it, the count of a move is the number of named lines through it.
  const after = book.get(keyAfter('e4 c5'));
  const firsts = {};
  for (const l of through) { const san = l[2].split(' ')[2]; if (san) firsts[san] = (firsts[san] ?? 0) + 1; }
  assert.deepEqual(after, firsts);
  assert.ok(after.Nf3 > after.c3 && after.c3 > 1);
  // Every move of every line is in the book, once: the counts add up to the moves.
  let total = 0;
  for (const entry of book.values()) for (const n of Object.values(entry)) total += n;
  assert.equal(total, through.reduce((s, l) => s + l[2].split(' ').length, 0));
  // Nothing from another opening.
  assert.equal(book.get(keyAfter('e4'))?.e5, undefined);
  assert.equal(book.get(keyAfter('d4')), undefined);
});

test('opening-lib: the book goes by position, so another move order is still in it', () => {
  const lib = [{ name: 'Test Gambit', side: 'w', lines: [
    ['D00', '', 'd4 d5 c4 e6', null],
    ['D00', 'First Order', 'd4 d5 c4 e6 Nc3 Nf6 Nf3 Be7', null],
    ['D00', 'Second Order', 'd4 d5 c4 e6 Nf3 Nf6 Nc3 c6', null],
    ['D00', 'Elsewhere', 'd4 Nf6 c4', null],
  ] }];
  const { book, lines } = buildBook(lib, 'd4 d5 c4 e6', chessDeps);
  assert.equal(lines, 3);
  assert.equal(keyAfter('d4 d5 c4 e6 Nc3 Nf6 Nf3'), keyAfter('d4 d5 c4 e6 Nf3 Nf6 Nc3'));
  assert.deepEqual(book.get(keyAfter('d4 d5 c4 e6 Nc3 Nf6 Nf3')), { Be7: 1, c6: 1 });
  assert.deepEqual(book.get(keyAfter('d4 d5 c4 e6')), { Nc3: 1, Nf3: 1 });
  assert.deepEqual(book.get(keyAfter('d4')), { d5: 3 });
  // The same in the real library: the Queen's Gambit Declined meets itself.
  const qgd = buildBook(OPENING_LIBRARY, 'd4 d5 c4 e6', chessDeps).book;
  const met = qgd.get(keyAfter('d4 d5 c4 e6 Nc3 Nf6 Nf3'));
  assert.ok(met && qgd.get(keyAfter('d4 d5 c4 e6 Nf3 Nf6 Nc3')) === met);
});

test('opening-lib: the book of a one-line opening and of a line nothing continues', () => {
  const one = OPENING_LIBRARY.find(o => o.lines.length === 1 && linesThrough(o.lines[0][2]).length === 1);
  const moves = one.lines[0][2].split(' ');
  const { book, lines } = buildBook(OPENING_LIBRARY, one.lines[0][2], chessDeps);
  assert.equal(lines, 1);
  assert.equal(book.size, moves.length);
  moves.forEach((san, i) => assert.deepEqual(book.get(keyAfter(moves.slice(0, i).join(' '))), { [san]: 1 }));
  assert.equal(book.get(keyAfter(one.lines[0][2])), undefined, 'after its last move the game is out of book');
  assert.deepEqual(continuations(OPENING_LIBRARY, one.lines[0][2]), []);
});

test('opening-lib: a keyless line (1.a3 ...) has a book like any other and no rating name', () => {
  const keyless = OPENING_LIBRARY.flatMap(o => o.lines).filter(l => l[3] === -1);
  assert.equal(keyless.length, 49);
  const line = keyless.find(l => l[2].startsWith('a3 '));
  assert.ok(line, 'a line that begins 1.a3 and goes on');
  assert.equal(classifyOpening(line[2].split(' ')), null);
  const { book, lines } = buildBook(OPENING_LIBRARY, line[2], chessDeps);
  assert.ok(lines >= 1);
  assert.equal(Object.keys(book.get(keyAfter(''))).join(), 'a3');
  assert.ok(book.size >= line[2].split(' ').length);
});

test('opening-lib: "Continues with" is the next named lines, by moves', () => {
  const at = moves => continuations(OPENING_LIBRARY, moves).map(c => ({ ...c, line: OPENING_LIBRARY[c.o].lines[c.l] }));
  const sicilian = at('e4 c5');
  const through = linesThrough('e4 c5');
  assert.ok(sicilian.length > 5 && sicilian.length < 80, `${sicilian.length} rows after 1.e4 c5`);
  const named = new Set(through.map(l => l[2]));
  for (const c of sicilian) {
    const list = c.line[2].split(' ');
    assert.ok(c.line[2].startsWith('e4 c5 '));
    // No other named line between: a tap walks ONE name further.
    for (let n = 3; n < list.length; n++) assert.ok(!named.has(list.slice(0, n).join(' ')), c.line[2]);
    assert.equal(c.more, through.filter(l => l[2].startsWith(c.line[2] + ' ')).length);
  }
  // Walking the rows reaches every line under these moves, and no row twice.
  assert.equal(new Set(sicilian.map(c => c.line[2])).size, sicilian.length);
  const reach = new Set();
  const walk = moves => { for (const c of at(moves)) { reach.add(c.line[2]); walk(c.line[2]); } };
  walk('e4 c5 Nf3 d6');
  assert.deepEqual([...reach].sort(), [...new Set(linesThrough('e4 c5 Nf3 d6').map(l => l[2]))].filter(m => m !== 'e4 c5 Nf3 d6').sort());
  // From the start: the openings of a single move.
  const first = at('');
  assert.ok(first.some(c => c.line[2] === 'e4') && first.some(c => c.line[2] === 'd4'));
  assert.ok(first.every(c => c.more >= 0));
  // An array of moves is read like the text.
  assert.deepEqual(continuations(OPENING_LIBRARY, ['e4', 'c5']), continuations(OPENING_LIBRARY, 'e4 c5'));
});

// The Library | My databases view is remembered on the device only. A synced
// key would carry one phone's last view to every other device of the account.
test('opening-lib: the remembered view is saved under a key that is not synced', () => {
  const ui = fs.readFileSync(new URL('../../js/opening-lib-ui.js', import.meta.url), 'utf8');
  const keys = [...ui.matchAll(/kv(?:Get|Set)\('([^']+)'/g)].map(m => m[1]);
  // ... and so is a study game left half-way ('libStudy'): nothing new is synced.
  assert.deepEqual([...new Set(keys)].sort(), ['libStudy', 'trainerView']);
  const fb = fs.readFileSync(new URL('../../js/firebase.js', import.meta.url), 'utf8');
  const synced = fb.slice(fb.indexOf('const SYNCED_KEYS = ['), fb.indexOf('];', fb.indexOf('const SYNCED_KEYS = [')));
  assert.ok(synced.includes("'openingElo'"), 'the SYNCED_KEYS list was found');
  assert.ok(!synced.includes('trainerView') && !synced.includes('libStudy'));
});

test('opening-lib: the module is pure - it imports nothing', () => {
  const src = fs.readFileSync(new URL('../../js/opening-lib.js', import.meta.url), 'utf8');
  assert.ok(!/^\s*import\s/m.test(src) && !/\bimport\(/.test(src) && !/\bdocument\b|\bwindow\b/.test(src));
});
