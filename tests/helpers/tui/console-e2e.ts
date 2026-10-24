/**
 * Shared setup for `shep tui` e2e tests (specs 142, 143): a throwaway
 * SHEP_HOME and git repository, the argv that runs the CLI under test, and
 * cleanup that also kills the detached feature workers holding the home open.
 *
 * NOTE: Uses execSync intentionally for git setup. All inputs are hardcoded
 * test constants, not user input.
 */

import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { removeDirWithRetry } from '../remove-dir.helper.js';
import { PtyScreen } from './pty-screen.js';

export const isWindows = process.platform === 'win32';
export const PROJECT_ROOT = resolve(__dirname, '../../..');
const USE_DIST = !!process.env.SHEP_E2E_USE_DIST;
const CLI_ENTRY = USE_DIST
  ? resolve(PROJECT_ROOT, 'dist/src/presentation/cli/index.js')
  : resolve(PROJECT_ROOT, 'src/presentation/cli/index.ts');
const TSX_CLI = resolve(PROJECT_ROOT, 'node_modules/tsx/dist/cli.mjs');
const CLEANUP_SETTLE_MS = 200;

/** argv (after the node binary) that runs `shep <args>`. */
export function shepArgv(...args: string[]): string[] {
  return USE_DIST ? [CLI_ENTRY, ...args] : [TSX_CLI, CLI_ENTRY, ...args];
}

const CONSOLE_COLS = 140;
const CONSOLE_ROWS = 36;

/** `shep tui` in a pseudo-terminal with the mock executor and this SHEP_HOME. */
export function spawnConsole(shepHome: string, env: Record<string, string> = {}): PtyScreen {
  // From the project root: tsx resolves the `@/` aliases from the cwd's
  // tsconfig. The console itself does not depend on the working directory.
  return PtyScreen.spawn(process.execPath, shepArgv('tui'), {
    cols: CONSOLE_COLS,
    rows: CONSOLE_ROWS,
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      SHEP_HOME: shepHome,
      SHEP_MOCK_EXECUTOR: '1',
      SHEP_TELEMETRY_DISABLED: '1',
      TERM: 'xterm-256color',
      ...env,
    },
  });
}

export interface ConsoleFixture {
  shepHome: string;
  repo: string;
  cleanup(): void;
}

export function createConsoleFixture(): ConsoleFixture {
  const shepHome = mkdtempSync(join(tmpdir(), 'shep-tui-home-'));
  const repo = mkdtempSync(join(tmpdir(), 'shep-tui-repo-'));
  for (const command of [
    'git init -b main',
    'git config user.name "Test User"',
    'git config user.email "test@example.com"',
    'git config commit.gpgsign false',
    'git commit --allow-empty -m "Initial commit"',
  ]) {
    execSync(command, { cwd: repo, stdio: 'pipe' });
  }

  return {
    shepHome,
    repo,
    cleanup() {
      // Kill the detached feature worker that holds our SHEP_HOME open.
      try {
        if (isWindows) {
          spawnSync(
            'wmic',
            [
              'process',
              'where',
              `CommandLine like '%${shepHome.replace(/\\/g, '\\\\')}%'`,
              'delete',
            ],
            { stdio: 'pipe' }
          );
        } else {
          spawnSync('pkill', ['-9', '-f', shepHome], { stdio: 'pipe' });
        }
      } catch {
        // No worker running.
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, CLEANUP_SETTLE_MS);
      for (const dir of [shepHome, repo]) {
        try {
          if (existsSync(dir)) removeDirWithRetry(dir);
        } catch {
          // OS temp cleanup will take it.
        }
      }
    },
  };
}
