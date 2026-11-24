import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addTo, prune, gamesByDay, buildFeed, recordDay } from '../../js/activity-rules.js';

test('addTo counts attempts, wins, misses and keeps the best run', () => {
  let log = {};
  log = addTo(log, '2026-11-24', 'puzzle', { ok: 1 });
  log = addTo(log, '2026-11-24', 'puzzle', { miss: 1 });
  log = addTo(log, '2026-11-24', 'puzzle', { ok: 1 });
  log = addTo(log, '2026-11-24', 'survival', { best: 12 });
  log = addTo(log, '2026-11-24', 'survival', { best: 7 });
  assert.deepEqual(log['2026-11-24'].puzzle, { n: 3, ok: 2, miss: 1, draw: 0 });
  assert.deepEqual(log['2026-11-24'].survival, { n: 2, ok: 0, miss: 0, draw: 0, best: 12 });
});

test('addTo does not change the log it was given', () => {
  const log = { '2026-11-24': { puzzle: { n: 1, ok: 1, miss: 0, draw: 0 } } };
  addTo(log, '2026-11-24', 'puzzle', { ok: 1 });
  assert.equal(log['2026-11-24'].puzzle.n, 1);
});

test('prune keeps the last 60 days, today included', () => {
  const log = { '2026-11-24': {}, '2026-09-26': {}, '2026-09-25': {} };
  assert.deepEqual(Object.keys(prune(log, '2026-11-24')).sort(), ['2026-09-26', '2026-11-24']);
});

test('gamesByDay groups wins, draws and losses by day', () => {
  const dayOf = ms => new Date(ms).toISOString().slice(0, 10);
  const g = gamesByDay([
    { playedAt: Date.UTC(2026, 10, 24, 10), outcome: 'win' },
    { playedAt: Date.UTC(2026, 10, 24, 12), outcome: 'draw' },
    { playedAt: Date.UTC(2026, 10, 24, 13), outcome: 'loss' },
    { playedAt: Date.UTC(2026, 10, 23, 9), outcome: 'unfinished' },
  ], dayOf);
  assert.deepEqual(g['2026-11-24'], { n: 3, ok: 1, miss: 1, draw: 1 });
  assert.deepEqual(g['2026-11-23'], { n: 1, ok: 0, miss: 0, draw: 0 });
});

test('buildFeed: newest day first, rows in the fixed order, ELO moved against the point before', () => {
  const feed = buildFeed({
    today: '2026-11-24',
    log: { '2026-11-24': { opening: { n: 2, ok: 1, miss: 1, draw: 0 }, puzzle: { n: 24, ok: 18, miss: 6, draw: 0 } } },
    hist: {
      puzzle: [{ date: '2026-11-20', value: 1450 }, { date: '2026-11-22', value: 1478 }, { date: '2026-11-24', value: 1512 }],
      endgame: [{ date: '2026-11-23', value: 1340 }],
    },
    games: { '2026-11-23': { n: 4, ok: 2, miss: 1, draw: 1 } },
  });
  assert.deepEqual(feed.map(d => d.day), ['2026-11-24', '2026-11-23', '2026-11-22', '2026-11-20']);
  assert.deepEqual(feed[0].rows.map(r => r.area), ['puzzle', 'opening']);
  assert.equal(feed[0].rows[0].elo, 1512);
  assert.equal(feed[0].rows[0].delta, 34);
  assert.equal(feed[0].rows[0].ok, 18);
  // A day from before the counts existed: the ELO line only, no count.
  assert.equal(feed[2].rows[0].n, null);
  assert.equal(feed[2].rows[0].delta, 28);
  // The first point ever has nothing to move from.
  assert.equal(feed[3].rows[0].delta, null);
  assert.deepEqual(feed[1].rows.map(r => r.area), ['endgame', 'games']);
  assert.equal(feed[1].rows[0].delta, null);
});

test('buildFeed leaves out days older than 60 and unknown areas', () => {
  const feed = buildFeed({
    today: '2026-11-24',
    log: { '2026-09-01': { puzzle: { n: 1, ok: 1, miss: 0, draw: 0 } }, '2026-11-24': { weird: { n: 1 } } },
    hist: { puzzle: [{ date: '2026-08-01', value: 1200 }] },
  });
  assert.deepEqual(feed, []);
});

test('recordDay: the first day the rating stood highest, none while it never climbed', () => {
  assert.equal(recordDay([{ date: 'a', value: 1200 }, { date: 'b', value: 1300 }, { date: 'c', value: 1250 }, { date: 'd', value: 1300 }]), 'b');
  assert.equal(recordDay([{ date: 'a', value: 1200 }, { date: 'b', value: 1150 }]), null);
  assert.equal(recordDay([{ date: 'a', value: 1200 }]), null);
  assert.equal(recordDay(undefined), null);
});

test('buildFeed marks the record day of each rating', () => {
  const feed = buildFeed({ today: '2026-11-24', hist: {
    puzzle: [{ date: '2026-11-20', value: 1400 }, { date: '2026-11-22', value: 1520 }, { date: '2026-11-24', value: 1512 }],
  } });
  assert.deepEqual(feed.map(d => [d.day, d.rows[0].record]), [['2026-11-24', false], ['2026-11-22', true], ['2026-11-20', false]]);
});

test('buildFeed ends with the day the account was made, even past the 60 days', () => {
  const log = { '2026-11-24': { puzzle: { n: 1, ok: 1, miss: 0, draw: 0 } } };
  let feed = buildFeed({ today: '2026-11-24', log, joined: { day: '2026-03-02', kind: 'account' } });
  assert.deepEqual(feed.map(d => d.day), ['2026-11-24', '2026-03-02']);
  assert.deepEqual(feed[1].rows, [{ area: 'joined', kind: 'account' }]);
  // Made today: the last row of today, under what was played.
  feed = buildFeed({ today: '2026-11-24', log, joined: { day: '2026-11-24', kind: 'start' } });
  assert.deepEqual(feed[0].rows.map(r => r.area), ['puzzle', 'joined']);
  // A date in the future (a wrong clock) is left out.
  assert.equal(buildFeed({ today: '2026-11-24', joined: { day: '2026-12-01', kind: 'account' } }).length, 0);
});
