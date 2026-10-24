/**
 * TUI E2E: the terminal feature console (spec 142)
 *
 * Drives the real `shep tui` in a pseudo-terminal and reads the screen
 * through a headless xterm, exactly as a user's terminal would show it.
 *
 * A feature is created with the deterministic mock executor; its background
 * worker runs until the first approval gate. The console must show it in the
 * needs-you strip, approve it from the keyboard, and on `q` leave the
 * alternate screen and exit 0.
 *
 * NOTE: Uses execSync intentionally for git setup. All inputs are hardcoded
 * test constants, not user input.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { removeDirWithRetry } from '@tests/helpers/remove-dir.helper.js';
import {
  MULTI_STEP_CLI_TIMEOUT_MS,
  MULTI_STEP_TEST_TIMEOUT_MS,
  createCliRunner,
} from '../../helpers/cli/index.js';
import { PtyScreen } from '../../helpers/tui/pty-screen.js';

const isWindows = process.platform === 'win32';
const PROJECT_ROOT = resolve(__dirname, '../../..');
const USE_DIST = !!process.env.SHEP_E2E_USE_DIST;
const CLI_ENTRY = USE_DIST
  ? resolve(PROJECT_ROOT, 'dist/src/presentation/cli/index.js')
  : resolve(PROJECT_ROOT, 'src/presentation/cli/index.ts');
const TSX_CLI = resolve(PROJECT_ROOT, 'node_modules/tsx/dist/cli.mjs');

const COLS = 140;
const ROWS = 36;
/** The mock worker reaches its first gate in seconds; Windows CI is several times slower. */
const GATE_TIMEOUT_MS = isWindows ? 120_000 : 60_000;
/** Opening the console boots the CLI (DB, migrations, DI) once. */
const START_TIMEOUT_MS = isWindows ? 60_000 : 30_000;
const STEP_TIMEOUT_MS = 20_000;
const FEATURE_TITLE = 'Console approval check';
/** The mock executor title-cases the name it derives from the prompt. */
const FEATURE_NAME = /console approval check/i;

function spawnTui(shepHome: string, args: string[] = []): PtyScreen {
  const argv = USE_DIST ? [CLI_ENTRY, 'tui', ...args] : [TSX_CLI, CLI_ENTRY, 'tui', ...args];
  // From the project root: tsx resolves the `@/` aliases from the cwd's
  // tsconfig. The console itself does not depend on the working directory.
  return PtyScreen.spawn(process.execPath, argv, {
    cols: COLS,
    rows: ROWS,
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      SHEP_HOME: shepHome,
      SHEP_MOCK_EXECUTOR: '1',
      SHEP_TELEMETRY_DISABLED: '1',
      TERM: 'xterm-256color',
    },
  });
}

describe('TUI: feature console', { timeout: MULTI_STEP_TEST_TIMEOUT_MS * 3 }, () => {
  let shepHome: string;
  let tempRepo: string;
  let screen: PtyScreen | undefined;

  beforeEach(() => {
    shepHome = mkdtempSync(join(tmpdir(), 'shep-tui-home-'));
    tempRepo = mkdtempSync(join(tmpdir(), 'shep-tui-repo-'));
    execSync('git init -b main', { cwd: tempRepo, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: tempRepo, stdio: 'pipe' });
    execSync('git config user.email "test@example.com"', { cwd: tempRepo, stdio: 'pipe' });
    execSync('git config commit.gpgsign false', { cwd: tempRepo, stdio: 'pipe' });
    execSync('git commit --allow-empty -m "Initial commit"', { cwd: tempRepo, stdio: 'pipe' });
  });

  afterEach(() => {
    screen?.kill();
    screen = undefined;
    // Kill the detached feature worker that holds our SHEP_HOME open.
    try {
      if (isWindows) {
        spawnSync(
          'wmic',
          ['process', 'where', `CommandLine like '%${shepHome.replace(/\\/g, '\\\\')}%'`, 'delete'],
          { stdio: 'pipe' }
        );
      } else {
        spawnSync('pkill', ['-9', '-f', shepHome], { stdio: 'pipe' });
      }
    } catch {
      // No worker running.
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
    for (const dir of [shepHome, tempRepo]) {
      try {
        if (existsSync(dir)) removeDirWithRetry(dir);
      } catch {
        // OS temp cleanup will take it.
      }
    }
  });

  it('shows a feature waiting at its gate, approves it with a, and exits cleanly on q', async () => {
    const runner = createCliRunner({
      env: { SHEP_HOME: shepHome, SHEP_TELEMETRY_DISABLED: '1' },
      timeout: MULTI_STEP_CLI_TIMEOUT_MS,
    });
    runner.runOrThrow(`feat new "${FEATURE_TITLE}" --repo ${tempRepo}`);

    screen = spawnTui(shepHome);
    await screen.waitForText('shep · Features', START_TIMEOUT_MS);
    expect(screen.onAlternateScreen).toBe(true);
    await screen.waitFor((text) => FEATURE_NAME.test(text), 'the feature row', STEP_TIMEOUT_MS);

    // The mock worker parks at the first approval gate; the console must
    // surface it in the strip and offer approve in the key bar.
    await screen.waitFor(
      (text) => {
        const [, strip = ''] = text.split('\n');
        return strip.includes('NEEDS YOU') && FEATURE_NAME.test(strip);
      },
      'the feature in the needs-you strip',
      GATE_TIMEOUT_MS
    );
    expect(screen.lines().at(-1)).toContain('approve');

    screen.press('a');
    await screen.waitForText('Approved', STEP_TIMEOUT_MS);
    // Approval moves the feature past its gate: it leaves the strip.
    await screen.waitFor(
      (text) => !FEATURE_NAME.test(text.split('\n')[1] ?? ''),
      'the feature to leave the needs-you strip',
      GATE_TIMEOUT_MS
    );

    // The surroundings survive the action: still the console, still the row.
    expect(screen.onAlternateScreen).toBe(true);
    expect(screen.text()).toContain('shep · Features');
    expect(screen.text()).toMatch(FEATURE_NAME);

    screen.press('q');
    const exit = await screen.exited;
    expect(exit.exitCode).toBe(0);
    expect(screen.onAlternateScreen).toBe(false);
  });

  it('opens on an empty install and explains how to start', async () => {
    screen = spawnTui(shepHome);
    await screen.waitForText('No features yet', START_TIMEOUT_MS);
    expect(screen.text()).toContain('shep feat new');

    screen.press('q');
    expect((await screen.exited).exitCode).toBe(0);
  });

  it('refuses to run without an interactive terminal', () => {
    const runner = createCliRunner({
      env: { SHEP_HOME: shepHome, SHEP_TELEMETRY_DISABLED: '1' },
    });
    const result = runner.run('tui');

    expect(result.exitCode).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain('shep feat ls');
  });
});
