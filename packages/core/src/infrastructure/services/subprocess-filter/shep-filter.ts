/**
 * shep-filter — tiny CLI entry point for subprocess output filtering.
 *
 * Invoked by PATH-shadow wrapper scripts inside the Claude Code
 * subprocess:
 *
 *   shep-filter git status --porcelain
 *   shep-filter npm test
 *
 * Flow:
 * 1. Parse args to extract the real command name and its arguments
 * 2. Spawn the real command (resolved from PATH, skipping our shim dir)
 * 3. Capture stdout + stderr
 * 4. Pipe stdout through the appropriate filter
 * 5. Print filtered stdout, pass stderr through, exit with the child's code
 *
 * On any filter error: emit raw stdout unchanged (fail-open).
 */

import { execFileSync } from 'node:child_process';
import { filterGit } from './filters/git-filter.js';
import { filterNpm } from './filters/npm-filter.js';
import { filterGeneric } from './filters/generic-filter.js';

/** Dispatch table: command name → filter function(subcommand, output). */
const FILTERS: Record<string, (sub: string, out: string) => string> = {
  git: filterGit,
  npm: filterNpm,
  pnpm: filterNpm,
  yarn: filterNpm,
};

/**
 * Run the filter pipeline. Exported for testing; the CLI entry point
 * at the bottom of this file calls this with `process.argv`.
 */
export function runFilter(
  argv: string[],
  env: NodeJS.ProcessEnv
): { stdout: string; exitCode: number } {
  // argv: [node, shep-filter.js, <command>, <subcommand?>, ...args]
  const command = argv[2];
  const subcommand = argv[3] ?? '';
  const childArgs = argv.slice(3);

  if (!command) {
    return { stdout: '', exitCode: 1 };
  }

  // Resolve the REAL binary by stripping our shim dir from PATH.
  // The shim dir is passed via SHEP_FILTER_SHIM_DIR env var so we
  // know which PATH entry to skip.
  const shimDir = env.SHEP_FILTER_SHIM_DIR ?? '';
  const realPath = (env.PATH ?? '')
    .split(':')
    .filter((p) => p !== shimDir)
    .join(':');

  let rawStdout: string;
  let exitCode: number;

  try {
    rawStdout = execFileSync(command, childArgs, {
      encoding: 'utf-8',
      env: { ...env, PATH: realPath },
      stdio: ['inherit', 'pipe', 'inherit'],
      maxBuffer: 10 * 1024 * 1024,
    });
    exitCode = 0;
  } catch (err: unknown) {
    // execFileSync throws on non-zero exit. Extract output + code.
    const execErr = err as { stdout?: string; status?: number };
    rawStdout = typeof execErr.stdout === 'string' ? execErr.stdout : '';
    exitCode = typeof execErr.status === 'number' ? execErr.status : 1;

    // On error, preserve full output — errors must never be filtered.
    return { stdout: rawStdout, exitCode };
  }

  // Apply the filter (fail-open: if the filter crashes, emit raw).
  try {
    const filterFn = FILTERS[command];
    const filtered = filterFn ? filterFn(subcommand, rawStdout) : filterGeneric(rawStdout);
    return { stdout: filtered, exitCode };
  } catch {
    return { stdout: rawStdout, exitCode };
  }
}

// --- CLI entry point ---
// Only runs when this file is the main module (not when imported for testing).
const isMainModule =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('shep-filter.js') || process.argv[1].endsWith('shep-filter.ts'));

if (isMainModule) {
  const { stdout, exitCode } = runFilter(process.argv, process.env);
  if (stdout) process.stdout.write(stdout);
  process.exit(exitCode);
}
