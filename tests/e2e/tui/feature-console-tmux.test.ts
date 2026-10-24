/**
 * TUI E2E: feature panes in a real tmux (spec 143)
 *
 * Runs the real `shep tui` as the only pane of a private tmux server, presses
 * the pane keys with `tmux send-keys`, and asks tmux itself what opened:
 * `t` splits a shell in the feature's directory beside the console, `f`
 * splits `shep feat logs -f <id>` and leaves focus on the console.
 *
 * The server runs on its own socket (`tmux -L`), so the test never touches a
 * developer's tmux sessions. Skipped where tmux is not installed; CI installs it.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  MULTI_STEP_CLI_TIMEOUT_MS,
  MULTI_STEP_TEST_TIMEOUT_MS,
  createCliRunner,
} from '../../helpers/cli/index.js';
import {
  PROJECT_ROOT,
  createConsoleFixture,
  isWindows,
  shepArgv,
  type ConsoleFixture,
} from '../../helpers/tui/console-e2e.js';

const hasTmux = !isWindows && spawnSync('tmux', ['-V'], { stdio: 'pipe' }).status === 0;

const SOCKET = `shep-e2e-${process.pid}`;
const SESSION = 'console';
const START_TIMEOUT_MS = 30_000;
const STEP_TIMEOUT_MS = 20_000;
const POLL_MS = 100;
/** tmux rewrites control characters in -F output, so fields are split on a printable marker. */
const FIELD = ' ::: ';
const FEATURE_TITLE = 'Tmux pane check';
const FEATURE_NAME = /tmux pane check/i;

interface PaneInfo {
  id: string;
  active: boolean;
  path: string;
  start: string;
}

function tmux(...args: string[]): string {
  const result = spawnSync('tmux', ['-L', SOCKET, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`tmux ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
}

function panes(): PaneInfo[] {
  return tmux(
    'list-panes',
    '-t',
    SESSION,
    '-F',
    ['#{pane_id}', '#{pane_active}', '#{pane_current_path}', '#{pane_start_command}'].join(FIELD)
  )
    .trim()
    .split('\n')
    .map((line) => {
      const [id, active, path, ...start] = line.split(FIELD);
      return { id, active: active === '1', path, start: start.join(FIELD) };
    });
}

const consoleText = (paneId: string) => tmux('capture-pane', '-p', '-t', paneId);

async function waitFor<T>(
  read: () => T | undefined,
  description: string,
  timeoutMs: number
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = read();
    if (value !== undefined) return value;
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for: ${description}\n${JSON.stringify(panes(), null, 2)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

describe.skipIf(!hasTmux)(
  'TUI: feature panes in tmux',
  { timeout: MULTI_STEP_TEST_TIMEOUT_MS * 3 },
  () => {
    let fixture: ConsoleFixture;

    beforeEach(() => {
      fixture = createConsoleFixture();
    });

    afterEach(() => {
      spawnSync('tmux', ['-L', SOCKET, 'kill-server'], { stdio: 'pipe' });
      fixture.cleanup();
    });

    it('t splits a shell beside the console and f splits the followed log', async () => {
      const { shepHome, repo } = fixture;
      createCliRunner({
        env: { SHEP_HOME: shepHome, SHEP_TELEMETRY_DISABLED: '1' },
        timeout: MULTI_STEP_CLI_TIMEOUT_MS,
      }).runOrThrow(`feat new "${FEATURE_TITLE}" --repo ${repo}`);

      // The console is the session's only pane. Its environment carries
      // SHEP_HOME; the panes it opens must inherit it from the console.
      tmux(
        'new-session',
        '-d',
        '-s',
        SESSION,
        '-x',
        '200',
        '-y',
        '45',
        '-c',
        PROJECT_ROOT,
        '-e',
        `SHEP_HOME=${shepHome}`,
        '-e',
        'SHEP_TELEMETRY_DISABLED=1',
        '-e',
        'SHEP_MOCK_EXECUTOR=1',
        '--',
        process.execPath,
        ...shepArgv('tui')
      );
      const [consolePane] = panes();
      await waitFor(
        () => (FEATURE_NAME.test(consoleText(consolePane.id)) ? true : undefined),
        'the feature row in the console',
        START_TIMEOUT_MS
      );

      // t: a shell in the feature's directory, focused.
      tmux('send-keys', '-t', consolePane.id, 't');
      const shell = await waitFor(
        () => panes().find((p) => p.id !== consolePane.id),
        'the shell pane',
        STEP_TIMEOUT_MS
      );
      expect(shell.active).toBe(true);
      expect(shell.start).toBe('');
      // The worktree when the worker has created it, else the repository.
      const shellPath = shell.path.replace(/\\/g, '/');
      expect(
        shellPath.startsWith(shepHome.replace(/\\/g, '/')) || shellPath === repo.replace(/\\/g, '/')
      ).toBe(true);
      expect(consoleText(consolePane.id)).toMatch(/Opened a shell for .* in tmux/);

      // f: the followed log, with focus left on the console.
      tmux('select-pane', '-t', consolePane.id);
      tmux('send-keys', '-t', consolePane.id, 'f');
      const logPane = await waitFor(
        () => panes().find((p) => p.start.includes('feat logs -f')),
        'the log pane',
        STEP_TIMEOUT_MS
      );
      expect(logPane.active).toBe(false);
      expect(panes().find((p) => p.id === consolePane.id)?.active).toBe(true);
      // The log pane reads the console's SHEP_HOME, so it finds the feature's log.
      await waitFor(
        () => (/\[\d{4}-\d{2}-\d{2}T/.test(consoleText(logPane.id)) ? true : undefined),
        'log lines in the log pane',
        STEP_TIMEOUT_MS
      );

      // The console survives both: still drawing, still quits cleanly.
      expect(consoleText(consolePane.id)).toContain('shep · Features');
      tmux('send-keys', '-t', consolePane.id, 'q');
      await waitFor(
        () => (panes().some((p) => p.id === consolePane.id) ? undefined : true),
        'the console pane to close on q',
        STEP_TIMEOUT_MS
      );
    });
  }
);
