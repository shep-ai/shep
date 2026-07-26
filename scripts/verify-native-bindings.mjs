#!/usr/bin/env node
/**
 * Post-install native-binding guard.
 *
 * `better-sqlite3` is a native addon shep needs at startup. When it's installed
 * globally (`npm i -g @shepai/cli`) its compiled binary can end up missing —
 * install scripts skipped, no prebuilt for the running Node ABI, or a stale
 * binary after a Node upgrade — and the CLI then crashes on first run with a
 * raw "Could not locate the bindings file" error.
 *
 * This script runs after install, probes whether the addon actually loads, and
 * if not makes ONE attempt to rebuild it, then prints clear guidance. It is
 * intentionally best-effort: it NEVER fails the install (always exits 0) so a
 * probe hiccup can't brick `npm i`. The runtime error in connection.ts is the
 * backstop if this can't recover.
 */

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const NATIVE_MODULE = 'better-sqlite3';

/**
 * Try to load better-sqlite3 and open an in-memory database.
 * @returns {{ ok: true } | { ok: false, resolvable: boolean, error: Error }}
 */
function probe() {
  let Database;
  try {
    Database = require(NATIVE_MODULE);
  } catch (error) {
    // MODULE_NOT_FOUND means the package itself isn't here — nothing to rebuild.
    const resolvable = !(error && error.code === 'MODULE_NOT_FOUND');
    return { ok: false, resolvable, error };
  }
  try {
    const db = new Database(':memory:');
    db.close();
    return { ok: true };
  } catch (error) {
    return { ok: false, resolvable: true, error };
  }
}

function attemptRebuild() {
  try {
    console.log(
      `[shep] Rebuilding the ${NATIVE_MODULE} native module for Node ${process.version}...`
    );
    execFileSync('npm', ['rebuild', NATIVE_MODULE], {
      stdio: 'inherit',
      timeout: 5 * 60 * 1000,
    });
    return true;
  } catch {
    return false;
  }
}

function printManualGuidance() {
  const lines = [
    '',
    `[shep] Could not load the ${NATIVE_MODULE} native module for Node ${process.version}.`,
    '[shep] shep needs it to run. Try, in order:',
    `[shep]   1. npm rebuild -g ${NATIVE_MODULE}`,
    '[shep]   2. npm install -g @shepai/cli --foreground-scripts',
    '[shep]   3. Install a compiler toolchain, then retry step 2:',
    '[shep]        macOS:   xcode-select --install',
    '[shep]        Linux:   build-essential + python3',
    '[shep]        Windows: Visual Studio Build Tools',
    '',
  ];
  console.warn(lines.join('\n'));
}

function main() {
  const first = probe();
  if (first.ok) return;

  // Package not present (e.g. --ignore-scripts stripped it, or a partial
  // install): a rebuild can't help, so just point the user at the fix.
  if (!first.resolvable) {
    printManualGuidance();
    return;
  }

  if (attemptRebuild() && probe().ok) {
    console.log(`[shep] ${NATIVE_MODULE} rebuilt successfully.`);
    return;
  }

  printManualGuidance();
}

try {
  main();
} catch {
  // Never let this guard fail the install — the runtime error handles the
  // missing-binding case with the same guidance.
}
process.exit(0);
