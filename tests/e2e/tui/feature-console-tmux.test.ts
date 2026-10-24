/**
 * TUI E2E: feature panes in a real tmux (spec 143)
 *
 * Runs the real `shep tui` as the only pane of a private tmux server, presses
 * the pane keys with `tmux send-keys`, and asks tmux itself what opened:
 * `t` splits a shell in the feature's directory beside the console, `f`
 * splits `shep feat logs -f <id>` and leaves focus on the console.
 *
 * Skipped where tmux is not installed; CI installs it.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MULTI_STEP_CLI_TIMEOUT_MS,
  MULTI_STEP_TEST_TIMEOUT_MS,
  createCliRunner,
} from '../../helpers/cli/index.js';
import {
  PROJECT_ROOT,
  createConsoleFixture,
  shepArgv,
  type ConsoleFixture,
} from '../../helpers/tui/console-e2e.js';
import { TmuxServer, hasTmux, waitForTmux } from '../../helpers/tui/tmux-server.js';

const SESSION = 'console';
const START_TIMEOUT_MS = 30_000;
const STEP_TIMEOUT_MS = 20_000;
const FEATURE_TITLE = 'Tmux pane check';
const FEATURE_NAME = /tmux pane check/i;

describe.skipIf(!hasTmux())(
  'TUI: feature panes in tmux',
  { timeout: MULTI_STEP_TEST_TIMEOUT_MS * 3 },
  () => {
    let fixture: ConsoleFixture;
    let tmux: TmuxServer;

    beforeEach(() => {
      fixture = createConsoleFixture();
      tmux = new TmuxServer(`shep-e2e-panes-${process.pid}`);
    });

    afterEach(() => {
      tmux.kill();
      fixture.cleanup();
    });

    const panes = () => tmux.panes(SESSION);
    const waitFor = <T>(read: () => T | undefined, description: string, timeoutMs: number) =>
      waitForTmux(read, description, timeoutMs, () => JSON.stringify(panes(), null, 2));

    it('t splits a shell beside the console and f splits the followed log', async () => {
      const { shepHome, repo } = fixture;
      createCliRunner({
        env: { SHEP_HOME: shepHome, SHEP_TELEMETRY_DISABLED: '1' },
        timeout: MULTI_STEP_CLI_TIMEOUT_MS,
      }).runOrThrow(`feat new "${FEATURE_TITLE}" --repo ${repo}`);

      // The console is the session's only pane. Its environment carries
      // SHEP_HOME; the panes it opens must inherit it from the console.
      tmux.startSession(SESSION, {
        cwd: PROJECT_ROOT,
        env: { SHEP_HOME: shepHome, SHEP_TELEMETRY_DISABLED: '1', SHEP_MOCK_EXECUTOR: '1' },
        command: [process.execPath, ...shepArgv('tui')],
      });
      const [consolePane] = panes();
      await waitFor(
        () => (FEATURE_NAME.test(tmux.capture(consolePane.id)) ? true : undefined),
        'the feature row in the console',
        START_TIMEOUT_MS
      );

      // t: a shell in the feature's directory, focused.
      tmux.run('send-keys', '-t', consolePane.id, 't');
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
      expect(tmux.capture(consolePane.id)).toMatch(/Opened a shell for .* in tmux/);

      // f: the followed log, with focus left on the console.
      tmux.run('select-pane', '-t', consolePane.id);
      tmux.run('send-keys', '-t', consolePane.id, 'f');
      const logPane = await waitFor(
        () => panes().find((p) => p.start.includes('feat logs -f')),
        'the log pane',
        STEP_TIMEOUT_MS
      );
      expect(logPane.active).toBe(false);
      expect(panes().find((p) => p.id === consolePane.id)?.active).toBe(true);
      // The log pane reads the console's SHEP_HOME, so it finds the feature's log.
      await waitFor(
        () => (/\[\d{4}-\d{2}-\d{2}T/.test(tmux.capture(logPane.id)) ? true : undefined),
        'log lines in the log pane',
        STEP_TIMEOUT_MS
      );

      // The console survives both: still drawing, still quits cleanly.
      expect(tmux.capture(consolePane.id)).toContain('shep · Features');
      tmux.run('send-keys', '-t', consolePane.id, 'q');
      await waitFor(
        () => (panes().some((p) => p.id === consolePane.id) ? undefined : true),
        'the console pane to close on q',
        STEP_TIMEOUT_MS
      );
    });
  }
);
