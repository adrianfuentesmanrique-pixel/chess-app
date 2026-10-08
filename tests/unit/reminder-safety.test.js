// The safety conditions of the hourly reminder job (spec section 7), checked by
// reading the finished files. They hold a key that can read every user's data
// and they log to a PUBLIC page, so a careless edit must fail here first.
// Run with: npm.cmd run test:tree
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = p => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
// Code only: comments may name the things the code must not do.
const code = src => src.split('\n').filter(l => !l.trim().startsWith('//')).map(l => l.replace(/\s\/\/.*$/, '')).join('\n');

const send = code(read('tools/reminder/send.mjs'));
const plan = code(read('tools/reminder/plan.mjs'));
const yml = read('.github/workflows/streak-reminder.yml');
const ymlCode = yml.split('\n').filter(l => !l.trim().startsWith('#')).join('\n');

test('send.mjs reads only: no call that writes to Firestore', () => {
  assert.doesNotMatch(send, /\.(set|update|delete|add|create|batch|runTransaction|bulkWriter|recursiveDelete)\s*\(/);
});
test('send.mjs keeps the five-subscriptions-per-user limit and the usable-subscription check', () => {
  assert.match(send, /collection\('pushSubs'\)[^;]*\.limit\(MAX_SUBS\)/);
  assert.match(send, /if \(!usableSub\(d\)\) \{ count\.skipped\+\+; continue; \}/);
});
test('send.mjs downloads four fields per user and nothing else', () => {
  assert.match(send, /\.select\('streakLastDate', 'streakCount', 'timeZone', 'remindHourLocal'\)/);
});
test('logs are public: the job prints counts and fixed words only', () => {
  const allowed = [
    'console.log(JSON.stringify({ dryRun: dry, ...count, errorCodes: codes }));',
    "console.log('could not read the secrets');",
    "console.log('stopped on an unexpected error');",
    "console.log(`hours to handle: ${hours.length}${dry ? ' (dry run)' : ''}`);",
  ];
  for (const src of [send, plan]) {
    const lines = src.split('\n').filter(l => /console\.|process\.std(out|err)/.test(l)).map(l => l.trim());
    for (const l of lines) assert.ok(allowed.some(a => l.endsWith(a)), 'unexpected output line: ' + l);
    assert.doesNotMatch(src, /\.(message|body|stack|headers|endpoint\b.*console)/);
  }
  assert.doesNotMatch(send, /console\.(error|warn|info|debug|dir|trace)/);
  // Counters are only ever numbers; error codes are a status number or 'firestore:<code>'.
  assert.match(send, /codes\[status\] = /);
  assert.match(send, /codes\['firestore:' \+ /);
});
test('send.mjs cannot die with a stack trace in the public log', () => {
  assert.match(send, /process\.on\('uncaughtException'/);
  assert.match(send, /process\.on\('unhandledRejection'/);
});
test('the secrets never touch the disk', () => {
  assert.doesNotMatch(send, /\bfs\b|writeFile|appendFile/);
  assert.doesNotMatch(plan, /GCP_SA_KEY|VAPID_PRIVATE_KEY/);
});

test('workflow: schedule and workflow_dispatch are the only triggers', () => {
  const on = ymlCode.slice(ymlCode.indexOf('\non:'), ymlCode.indexOf('\npermissions:'));
  const keys = [...on.matchAll(/^  ([a-z_]+):/gm)].map(m => m[1]);
  assert.deepEqual(keys, ['schedule', 'workflow_dispatch']);
  assert.doesNotMatch(ymlCode, /pull_request|workflow_run|issue_comment|repository_dispatch/);
});
test('workflow: permissions are contents: read and nothing else', () => {
  assert.match(ymlCode, /\npermissions:\n  contents: read\n\n/);
  assert.equal(ymlCode.match(/permissions:/g).length, 1);
  assert.doesNotMatch(ymlCode, /:\s*write\b/);
});
test('workflow: every action is pinned to a full 40-character commit hash', () => {
  const uses = [...ymlCode.matchAll(/uses:\s*(\S+)/g)].map(m => m[1]);
  assert.equal(uses.length, 4);
  for (const u of uses) assert.match(u, /^actions\/[a-z-]+(\/[a-z]+)?@[0-9a-f]{40}$/, u);
});
test('workflow: installs from the lockfile without running package scripts', () => {
  assert.match(ymlCode, /run: npm ci --ignore-scripts\n/);
  assert.doesNotMatch(ymlCode, /npm (install|i)\b/);
});
test('workflow: the two secrets appear once each, in the Send step only', () => {
  assert.deepEqual(ymlCode.match(/secrets\.[A-Z_]+/g), ['secrets.GCP_SA_KEY', 'secrets.VAPID_PRIVATE_KEY']);
  const sendStep = ymlCode.slice(ymlCode.indexOf('- name: Send'));
  assert.match(sendStep, /secrets\.GCP_SA_KEY/);
  assert.match(sendStep, /secrets\.VAPID_PRIVATE_KEY/);
  assert.doesNotMatch(sendStep.slice(1), /\n      - /);          // Send is the last step
});
test('workflow: the hour is remembered BEFORE the send step, and two runs never overlap', () => {
  assert.ok(ymlCode.indexOf('actions/cache/save@') < ymlCode.indexOf('- name: Send'));
  assert.ok(ymlCode.indexOf('actions/cache/save@') > ymlCode.indexOf('id: plan'));
  assert.match(ymlCode, /concurrency:\n  group: streak-reminder\n  cancel-in-progress: false/);
});
