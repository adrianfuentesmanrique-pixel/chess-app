// Training mode on the Read tab: which words get covered, and where the box goes.
//
// js/read-training.js imports nothing at all, so this runs under plain Node.
// The sample words are real ones from Dvoretsky's Endgame Manual and Hellsten's
// Mastering Endgame Strategy (a figurine book: U+E026 is its rook).
//
// Run: npm run test:tree
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverSpan, findCovers, textChars } from '../../js/read-training.js';

const covered = tok => { const s = coverSpan(tok); return s ? tok.slice(s.start, s.end) : null; };

test('"!" and "!!" moves are covered, the move number is not', () => {
  assert.equal(covered('Kd5!'), 'Kd5!');
  assert.equal(covered('Rxe6!!'), 'Rxe6!!');
  assert.equal(covered('5.e5!'), 'e5!');
  assert.equal(covered('4...Kc6!'), 'Kc6!');
  assert.equal(covered('16…Kc6!'), 'Kc6!');
  assert.equal(covered('(7.Kg6!'), 'Kg6!');
  assert.equal(covered('16.0-0!'), '0-0!');
  assert.equal(covered('O-O-O!'), 'O-O-O!');
  assert.equal(covered('a8=Q!'), 'a8=Q!');
});

test('a figurine piece is covered with its move', () => {
  assert.equal(covered('16...f1!'), 'f1!');
  assert.equal(covered('g3!'), 'g3!');
});

test('glued evaluation signs hide with the move; closing punctuation stays', () => {
  assert.equal(covered('8.h5!+–)'), 'h5!+–');
  assert.equal(covered('10.Rd2!+–'), 'Rd2!+–');
  assert.equal(covered('g5+!='), 'g5+!=');
  assert.equal(covered('Kf4!ʘ'), 'Kf4!ʘ');
  assert.equal(covered('h5!)'), 'h5!');
  assert.equal(covered('Kd6!,'), 'Kd6!');
});

test('"!?", "?!", "?", "??" and unmarked moves are left alone', () => {
  for (const tok of ['Kf4!?', 'Kf4?!', 'Bf4?', 'Rd2??', '1.e4', 'Kd5', '17.fxg5']) {
    assert.equal(coverSpan(tok), null, tok);
  }
});

test('prose with an exclamation mark is left alone', () => {
  for (const tok of ['error!', 'point!', 'first!', 'helpless!”', '!', '1-0!']) {
    assert.equal(coverSpan(tok), null, tok);
  }
});

// A measure that makes every character 1 wide, so positions are easy to read.
const mono = s => s.length;
const vp = { width: 600, height: 800, transform: [1, 0, 0, -1, 0, 800] };
const styles = { f1: { fontFamily: 'serif', ascent: 0.8, descent: -0.2 }, fig: { fontFamily: 'sans-serif', ascent: 0.8, descent: -0.2 } };
const item = (str, x, y, w, font = 'f1', hasEOL = false) =>
  ({ str, transform: [10, 0, 0, 10, x, y], width: w, height: 10, fontName: font, hasEOL });

test('two moves in one chunk get two boxes; the piece in its own chunk joins its move', () => {
  // "6." | figurine | "f4! g5! 7." — as Dvoretsky's page comes back.
  const tc = { styles, items: [
    item('6.', 100, 400, 10),
    item('B', 110, 400, 10, 'fig'),
    item('f4! g5! 7.', 120, 400, 100),
  ] };
  const boxes = findCovers(tc, vp, mono);
  assert.equal(boxes.length, 2);
  const px = b => ({ l: b.l * 600, r: (b.l + b.w) * 600, t: b.t * 800, b: (b.t + b.h) * 800 });
  const [m1, m2] = boxes.map(px);
  // figurine (110..120) + "f4!" (120..150), padded 0.6 each side; "6." is outside
  assert.ok(Math.abs(m1.l - 109.4) < 1e-6 && Math.abs(m1.r - 150.6) < 1e-6, JSON.stringify(m1));
  // "g5!" is characters 4..7 of the chunk → 160..190
  assert.ok(Math.abs(m2.l - 159.4) < 1e-6 && Math.abs(m2.r - 190.6) < 1e-6, JSON.stringify(m2));
  // baseline y=400 in PDF space is 400 from the top; ascent 0.8, descent 0.2 of 10
  assert.ok(Math.abs(m1.t - 392) < 1e-6 && Math.abs(m1.b - 402) < 1e-6, JSON.stringify(m1));
});

test('a line break or a gap ends the word', () => {
  // "Kf4" at the end of one line and "!" starting the next must not join.
  const tc = { styles, items: [
    item('Kf4', 100, 400, 30, 'f1', true),
    item('!', 20, 380, 10),
    item('Kd5', 100, 300, 30),
    item('!', 200, 300, 10),          // far to the right on the same line
  ] };
  assert.equal(findCovers(tc, vp, mono).length, 0);
});

test('rotated text is ignored; a scan has no text', () => {
  const rot = { str: 'Kd5!', transform: [0, 10, -10, 0, 50, 50], width: 40, height: 10, fontName: 'f1', hasEOL: false };
  assert.equal(findCovers({ styles, items: [rot] }, vp, mono).length, 0);
  assert.equal(textChars({ items: [] }), 0);
  assert.equal(textChars({ items: [item('Kd5! wins', 0, 0, 90), { type: 'beginMarkedContent' }] }), 8);
});
