// Runs the Firestore rules tests.
//
// Why this wrapper exists: the Firestore emulator needs Java 11 or newer, and
// this machine has an old Java 8 first on the PATH. Rather than change a global
// Windows setting (which could affect other programs that still want Java 8),
// this finds a modern JDK and points the emulator at it for this run only.
//
// Usage:  npm run test:rules
import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const MIN_MAJOR = 11;

// Where JDK installers on Windows normally put things. Newest match wins.
const SEARCH_DIRS = [
  'C:\\Program Files\\Eclipse Adoptium',
  'C:\\Program Files\\Java',
  'C:\\Program Files\\Microsoft',
];

function findJdk() {
  if (process.env.JAVA_HOME && existsSync(join(process.env.JAVA_HOME, 'bin', 'java.exe'))) {
    return process.env.JAVA_HOME;
  }
  const found = [];
  for (const dir of SEARCH_DIRS) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      // "jdk-17.0.20.8-hotspot", "jdk-21", "jdk-11.0.2" — a JRE has no compiler
      // but the emulator only needs a runtime, so match on the major version.
      const m = /^jdk-(\d+)/.exec(name);
      if (!m || Number(m[1]) < MIN_MAJOR) continue;
      const home = join(dir, name);
      if (existsSync(join(home, 'bin', 'java.exe'))) found.push([Number(m[1]), home]);
    }
  }
  found.sort((a, b) => b[0] - a[0]);
  return found[0]?.[1] ?? null;
}

const jdk = findJdk();
if (!jdk) {
  console.error(
    `\nNo Java ${MIN_MAJOR}+ found, and the Firestore emulator needs it.\n\n` +
    `Install it with:\n` +
    `  winget install --id EclipseAdoptium.Temurin.17.JDK\n\n` +
    `Then run "npm run test:rules" again.\n`);
  process.exit(1);
}
console.log(`Using Java at: ${jdk}\n`);

// shell:true is required on Windows — Node refuses to spawn a .cmd shim
// (npx.cmd) directly, and silently gives back a null status if you try.
const res = spawnSync(
  'npx',
  ['firebase', 'emulators:exec', '--only', 'firestore',
    '--project', 'chess-training-center',
    '"node --test \\"tests/**/*.test.js\\""'],
  {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, JAVA_HOME: jdk, PATH: `${join(jdk, 'bin')};${process.env.PATH}` },
  });

if (res.error) { console.error(res.error); process.exit(1); }
process.exit(res.status ?? 1);
