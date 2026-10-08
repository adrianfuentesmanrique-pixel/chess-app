// Step 1 of the job: decide which hours to handle and REMEMBER the new hour
// before anything is sent. The workflow saves the state file to the Actions
// cache between this step and the sender, so a run that dies while sending
// loses reminders and never repeats them.
//
//   node plan.mjs <stateFile>      env DRY_RUN=true -> current hour, state untouched
import fs from 'node:fs';
import path from 'node:path';
import { hoursToHandle, hourIso } from './due.mjs';

const file = process.argv[2];
const dry = process.env.DRY_RUN === 'true';
const now = new Date();
let last = null;
try { last = fs.readFileSync(file, 'utf8').trim(); } catch (_) {}

const hours = dry ? [hourIso(now)] : hoursToHandle(last, now);
if (!dry) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, hourIso(now) + '\n');
}
console.log(`hours to handle: ${hours.length}${dry ? ' (dry run)' : ''}`);
fs.appendFileSync(process.env.GITHUB_OUTPUT, `hours=${hours.join(',')}\n`);
