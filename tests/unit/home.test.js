// Unit tests for js/home.js. Run with: npm.cmd run test:tree
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MISSION_KEYS, missionsDone, kaelRule, dayPart, greetName, kaelLine, HOME_OPENINGS, discoverPick, homeBlock } from '../../js/home.js';
import { Chess } from '../../vendor/chess.js';
import { ENDGAMES } from '../../js/endgames-data.js';
import { OPENING_LIBRARY } from '../../js/opening-library.js';
import { fullName } from '../../js/opening-lib.js';

test('missionsDone counts only the three missions, and survives junk', () => {
  assert.equal(missionsDone({ puzzle: false, play: false, opening: false }), 0);
  assert.equal(missionsDone({ puzzle: true, play: false, opening: true }), 2);
  assert.equal(missionsDone({ puzzle: true, play: true, opening: true, other: true }), 3);
  assert.equal(missionsDone(null), 0);
  assert.equal(missionsDone(undefined), 0);
  assert.equal(MISSION_KEYS.length, 3);
});

test('rule 1: someone who never used the app is welcomed', () => {
  assert.equal(kaelRule({ streak: 0, pending: false, bestStreak: 0, done: 0, everMission: false }), 'welcome');
  assert.equal(kaelRule(), 'welcome');
});

test('rule 1 does not fit once anything was ever done', () => {
  assert.equal(kaelRule({ streak: 0, bestStreak: 4, done: 0 }), 'start');
  assert.equal(kaelRule({ streak: 0, bestStreak: 0, done: 0, everMission: true }), 'start');
  assert.equal(kaelRule({ streak: 0, bestStreak: 0, done: 1 }), 'start');
});

test('rule 2: all three missions done wins over both streak rules', () => {
  assert.equal(kaelRule({ streak: 12, pending: true, bestStreak: 12, done: 3 }), 'alldone');
  assert.equal(kaelRule({ streak: 12, pending: false, bestStreak: 12, done: 3 }), 'alldone');
  assert.equal(kaelRule({ streak: 0, bestStreak: 0, done: 3 }), 'alldone');
});

test('rule 3: a live streak not yet counted today is waiting', () => {
  assert.equal(kaelRule({ streak: 12, pending: true, bestStreak: 30, done: 1 }), 'pending');
});

test('rule 4: a streak already counted today', () => {
  assert.equal(kaelRule({ streak: 1, pending: false, bestStreak: 1, done: 0 }), 'counted');
  assert.equal(kaelRule({ streak: 12, pending: false, bestStreak: 12, done: 2 }), 'counted');
});

test('rule 5: no streak, but not new: start one today', () => {
  assert.equal(kaelRule({ streak: 0, pending: false, bestStreak: 9, done: 2 }), 'start');
  // pending without a streak cannot happen; it must not read as a streak
  assert.equal(kaelRule({ streak: 0, pending: true, bestStreak: 9, done: 0 }), 'start');
});

test('every combination gives exactly one of the five rules', () => {
  const rules = new Set(['welcome', 'alldone', 'pending', 'counted', 'start']);
  for (const streak of [0, 1, 12]) for (const pending of [false, true]) for (const bestStreak of [0, 12])
    for (const done of [0, 1, 2, 3]) for (const everMission of [false, true])
      assert.ok(rules.has(kaelRule({ streak, pending, bestStreak, done, everMission })));
});

test('dayPart splits the day in three', () => {
  assert.equal(dayPart(5), 'morning');
  assert.equal(dayPart(11), 'morning');
  assert.equal(dayPart(12), 'afternoon');
  assert.equal(dayPart(18), 'afternoon');
  assert.equal(dayPart(19), 'evening');
  assert.equal(dayPart(23), 'evening');
  assert.equal(dayPart(0), 'evening');
  assert.equal(dayPart(4), 'evening');
});

test('greetName: the profile name, else a first name, never an e-mail', () => {
  assert.equal(greetName('Adrián', 'Someone Else'), 'Adrián');
  assert.equal(greetName('', 'Marta Ruiz'), 'Marta');
  assert.equal(greetName('  ', null), '');
  assert.equal(greetName('', 'marta@example.com'), '');
  assert.equal(greetName(null, undefined), '');
});

test('kaelLine: greets only when there is a name', () => {
  const signedOut = kaelLine({ streak: 3, pending: true, bestStreak: 3, done: 0, name: '', hour: 9 });
  assert.deepEqual(signedOut, { rule: 'pending', n: 3, greet: null });
  const named = kaelLine({ streak: 3, pending: false, bestStreak: 3, done: 1, name: 'Adrián', hour: 15 });
  assert.deepEqual(named, { rule: 'counted', n: 3, greet: { part: 'afternoon', name: 'Adrián' } });
});

// ── the "Descubre" card ──
const E = ENDGAMES.length, O = HOME_OPENINGS.length;

test('discoverPick: both kinds come up, half and half', () => {
  assert.equal(discoverPick(0, E).kind, 'endgame');
  assert.equal(discoverPick(0.4999, E).kind, 'endgame');
  assert.equal(discoverPick(0.5, E).kind, 'opening');
  assert.equal(discoverPick(0.9999, E).kind, 'opening');
});

test('discoverPick: every endgame and every opening on the list can come up, and nothing else', () => {
  const seen = { endgame: new Set(), opening: new Set() };
  const steps = 20000;
  for (let i = 0; i < steps; i++) {
    const p = discoverPick(i / steps, E);
    assert.ok(Number.isInteger(p.index) && p.index >= 0 && p.index < (p.kind === 'endgame' ? E : O), JSON.stringify(p));
    seen[p.kind].add(p.index);
  }
  assert.equal(seen.endgame.size, E);
  assert.equal(seen.opening.size, O);
});

test('discoverPick: the same number gives the same pick; the ends and junk are safe', () => {
  for (const r of [0, 0.1234, 0.5, 0.777, 0.999999]) assert.deepEqual(discoverPick(r, E), discoverPick(r, E));
  assert.deepEqual(discoverPick(0, E), { kind: 'endgame', index: 0 });
  assert.deepEqual(discoverPick(1, E), { kind: 'opening', index: O - 1 });
  assert.deepEqual(discoverPick(-3, E), { kind: 'endgame', index: 0 });
  assert.deepEqual(discoverPick(NaN, E), { kind: 'endgame', index: 0 });
  // With none of one kind, always the other, over its whole list.
  assert.deepEqual(discoverPick(0.2, 0), { kind: 'opening', index: Math.floor(0.4 * O) });
  assert.deepEqual(discoverPick(0.9, 5, 0), { kind: 'endgame', index: 4 });
});

test('HOME_OPENINGS: about thirty, no repeats, each a real line of the library under that exact name', () => {
  assert.ok(O >= 25 && O <= 40, String(O));
  assert.equal(new Set(HOME_OPENINGS.map(o => o[0])).size, O);
  assert.equal(new Set(HOME_OPENINGS.map(o => o[1])).size, O);
  const real = new Set(OPENING_LIBRARY.flatMap(o => o.lines.map(l => fullName(o, l) + '|' + l[2])));
  assert.deepEqual(HOME_OPENINGS.filter(([name, moves]) => !real.has(name + '|' + moves)), []);
});

test('HOME_OPENINGS: every line is legal chess, so Home can draw its position', () => {
  for (const [name, moves] of HOME_OPENINGS) {
    const game = new Chess();
    for (const san of moves.split(' ')) assert.ok(game.move(san), name + ' ' + san);
  }
});

test('every endgame has what the card shows: a name in both languages and a position', () => {
  for (const e of ENDGAMES) assert.ok(e.name?.es && e.name?.en && e.fen && e.category, e.id);
});

// ── the block between "Hoy" and "Descubre" ──
const BOOK = { id: 7, name: 'Mi sistema', page: 84, pageCount: 320 };
const GAME = { id: 3, outcome: 'win', level: 3 };
const hw = (id, status, createdAt) => ({ id, status, createdAt, title: 'T' + id });
const types = b => b.rows.map(r => r.type).join();

const ACTIVE = { teacherUid: 't1', status: 'active' }, PENDING = { teacherUid: 't2', status: 'pending' }, DECLINED = { teacherUid: 't3', status: 'declined' };
// What each of the three slots holds: the thing itself, or which invitation.
const slots = b => b.rows.map(r => r.type + ':' + (r.invite || 'real')).join();

test('homeBlock: always three slots, in the order homework, book, game, in every combination', () => {
  for (const signedIn of [false, true]) for (const homework of [[], [hw('a', 'open', 1)], [hw('a', 'done', 1)]])
    for (const links of [[], [ACTIVE], [PENDING]]) for (const teaching of [false, true])
      for (const book of [null, BOOK]) for (const game of [null, GAME]) {
        const b = homeBlock({ homework, seen: [], book, game, signedIn, links, teaching });
        assert.deepEqual(Object.keys(b), ['rows']);
        assert.equal(types(b), 'homework,book,game');
        for (const r of b.rows) assert.ok(!!r.invite !== !!r.item, JSON.stringify(r));
        assert.equal(!b.rows[1].invite, !!book);
        assert.equal(!b.rows[2].invite, !!game);
        assert.equal(!b.rows[0].invite, signedIn && homework[0]?.status === 'open');
      }
});

test('homeBlock: nothing half-way gives three invitations, with a streak or without (the section is never empty)', () => {
  assert.equal(slots(homeBlock()), 'homework:signedout,book:empty,game:empty');
  assert.equal(slots(homeBlock({ signedIn: true })), 'homework:noteacher,book:empty,game:empty');
  assert.equal(slots(homeBlock({ signedIn: true, links: [ACTIVE] })), 'homework:idle,book:empty,game:empty');
  // the old rule read the best streak; it no longer changes anything
  assert.deepEqual(homeBlock({ bestStreak: 3 }), homeBlock({ bestStreak: 0 }));
});

test('homeBlock: only a book, only a game, only homework, each pair, and all three', () => {
  const H = [hw('a', 'open', 1)], me = { signedIn: true, links: [ACTIVE] };
  assert.equal(slots(homeBlock({ ...me, book: BOOK })), 'homework:idle,book:real,game:empty');
  assert.equal(slots(homeBlock({ ...me, game: GAME })), 'homework:idle,book:empty,game:real');
  assert.equal(slots(homeBlock({ ...me, homework: H })), 'homework:real,book:empty,game:empty');
  assert.equal(slots(homeBlock({ ...me, book: BOOK, game: GAME })), 'homework:idle,book:real,game:real');
  assert.equal(slots(homeBlock({ ...me, homework: H, game: GAME })), 'homework:real,book:empty,game:real');
  assert.equal(slots(homeBlock({ ...me, homework: H, book: BOOK })), 'homework:real,book:real,game:empty');
  const all = homeBlock({ ...me, homework: H, book: BOOK, game: GAME });
  assert.equal(slots(all), 'homework:real,book:real,game:real');
  assert.equal(all.rows[1].item, BOOK);
  assert.equal(all.rows[2].item, GAME);
});

test('homeBlock: the empty homework slot says why, the first reason that fits', () => {
  const why = o => homeBlock(o).rows[0].invite;
  assert.equal(why({ signedIn: false }), 'signedout');
  assert.equal(why({ signedIn: true }), 'noteacher');
  assert.equal(why({ signedIn: true, links: [DECLINED] }), 'noteacher');
  assert.equal(why({ signedIn: true, links: [ACTIVE] }), 'idle');
  assert.equal(why({ signedIn: true, links: [ACTIVE], homework: [hw('a', 'done', 5)] }), 'idle');
  assert.equal(why({ signedIn: true, teaching: true }), 'teaching');
  // a teacher of my own comes before my students; an invitation before both
  assert.equal(why({ signedIn: true, links: [ACTIVE], teaching: true }), 'idle');
  assert.equal(why({ signedIn: true, links: [ACTIVE, PENDING], teaching: true }), 'pending');
  assert.equal(homeBlock({ signedIn: true, links: [DECLINED, PENDING] }).rows[0].link, PENDING);
});

test('homeBlock: an open homework comes before every invitation, a waiting one included', () => {
  const r = homeBlock({ signedIn: true, links: [ACTIVE, PENDING], homework: [hw('a', 'open', 5)] }).rows[0];
  assert.deepEqual([r.item.id, r.invite], ['a', undefined]);
});

test('homeBlock: signed out, lists left over from an account are not read', () => {
  const b = homeBlock({ signedIn: false, homework: [hw('a', 'open', 5)], links: [ACTIVE, PENDING], teaching: true, book: BOOK, game: GAME });
  assert.equal(slots(b), 'homework:signedout,book:real,game:real');
});

const mine = o => homeBlock({ signedIn: true, links: [ACTIVE], ...o });

test('homeBlock: one open homework not seen yet is new; seen, it is not', () => {
  let r = mine({ homework: [hw('a', 'open', 5)], seen: [] }).rows[0];
  assert.deepEqual([r.item.id, r.isNew, r.count], ['a', true, 1]);
  r = mine({ homework: [hw('a', 'open', 5)], seen: ['a'] }).rows[0];
  assert.deepEqual([r.item.id, r.isNew, r.count], ['a', false, 1]);
});

test('homeBlock: several open: the newest one not seen yet, and how many are open', () => {
  const list = [hw('old', 'open', 10), hw('seen', 'open', 40), hw('mid', 'open', 20), hw('new', 'open', 30), hw('done', 'done', 99)];
  const r = mine({ homework: list, seen: ['seen'] }).rows[0];
  assert.deepEqual([r.item.id, r.isNew, r.count], ['new', true, 4]);
});

test('homeBlock: several open and all seen: the newest open one, not new', () => {
  const list = [hw('a', 'open', 10), hw('b', 'open', 40), hw('c', 'open', 20)];
  const r = mine({ homework: list, seen: ['a', 'b', 'c'] }).rows[0];
  assert.deepEqual([r.item.id, r.isNew, r.count], ['b', false, 3]);
});

test('homeBlock: a server time kept as { seconds } is read as a date too', () => {
  const list = [hw('a', 'open', { seconds: 100, nanoseconds: 0 }), hw('b', 'open', { seconds: 200, nanoseconds: 0 }), hw('c', 'open', undefined)];
  assert.equal(mine({ homework: list }).rows[0].item.id, 'b');
});

test('homeBlock survives junk', () => {
  assert.equal(slots(homeBlock({ homework: null, seen: null, links: null, signedIn: true })), 'homework:noteacher,book:empty,game:empty');
  assert.equal(slots(homeBlock({ signedIn: true, links: [null, undefined, ACTIVE] })), 'homework:idle,book:empty,game:empty');
  assert.equal(mine({ homework: [null, hw('a', 'open', 1)], seen: null }).rows[0].item.id, 'a');
});
