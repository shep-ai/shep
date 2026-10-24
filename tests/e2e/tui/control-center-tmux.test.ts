/**
 * TUI E2E: control center and tmux status in a real tmux (spec 146)
 *
 * Two mock-executor features wait at their gates. Inside a private tmux
 * server the console must publish `@shep_needs_you` / `@shep_status`, open a
 * window per feature on `C` named with its state, rename a window when its
 * feature finishes, open no second window on a second `C`, and
 * `shep tui --status` must print the same summary without a terminal.
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
const GATE_TIMEOUT_MS = 60_000;
const STEP_TIMEOUT_MS = 30_000;
const FEATURES = ['Control center alpha', 'Control center beta'];

describe.skipIf(!hasTmux())(
  'TUI: control center and tmux status',
  { timeout: MULTI_STEP_TEST_TIMEOUT_MS * 4 },
  () => {
    let fixture: ConsoleFixture;
    let tmux: TmuxServer;

    beforeEach(() => {
      fixture = createConsoleFixture();
      tmux = new TmuxServer(`shep-e2e-cc-${process.pid}`);
    });

    afterEach(() => {
      tmux.kill();
      fixture.cleanup();
    });

    const windows = () => tmux.windows(SESSION);
    const waitFor = <T>(read: () => T | undefined, description: string, timeoutMs: number) =>
      waitForTmux(read, description, timeoutMs, () =>
        JSON.stringify({ windows: windows(), status: tmux.option('@shep_status') }, null, 2)
      );

    it('opens a window per feature named with its state, and publishes the status', async () => {
      const { shepHome, repo } = fixture;
      const runner = createCliRunner({
        env: { SHEP_HOME: shepHome, SHEP_TELEMETRY_DISABLED: '1' },
        timeout: MULTI_STEP_CLI_TIMEOUT_MS,
      });
      for (const title of FEATURES) runner.runOrThrow(`feat new "${title}" --repo ${repo}`);

      tmux.startSession(SESSION, {
        cwd: PROJECT_ROOT,
        env: { SHEP_HOME: shepHome, SHEP_TELEMETRY_DISABLED: '1', SHEP_MOCK_EXECUTOR: '1' },
        command: [process.execPath, ...shepArgv('tui')],
      });
      const [consoleWindow] = windows();
      const consolePane = tmux.panes(SESSION)[0].id;

      // Both features reach their gate: the console publishes it to tmux.
      await waitFor(
        () => (tmux.option('@shep_needs_you') === '2' ? true : undefined),
        '@shep_needs_you to read 2',
        GATE_TIMEOUT_MS
      );
      expect(tmux.option('@shep_status')).toContain('◆ 2 needs you');

      // C: one window per feature, named with its state, focus kept on the console.
      tmux.run('send-keys', '-t', consolePane, 'C');
      const featureWindows = await waitFor(
        () => {
          const opened = windows().filter((w) => w.id !== consoleWindow.id);
          return opened.length === 2 ? opened : undefined;
        },
        'two feature windows',
        STEP_TIMEOUT_MS
      );
      for (const w of featureWindows) expect(w.name).toMatch(/^◆ Control Center (Alpha|Beta)$/i);
      expect(tmux.run('display-message', '-p', '-t', SESSION, '#{window_id}').trim()).toBe(
        consoleWindow.id
      );

      // Approve the selected feature: its window is renamed as its state moves on.
      tmux.run('send-keys', '-t', consolePane, 'a');
      await waitFor(
        () => windows().find((w) => /^[●✓] /.test(w.name)),
        'a renamed window',
        STEP_TIMEOUT_MS
      );
      await waitFor(
        () => (tmux.option('@shep_needs_you') === '1' ? true : undefined),
        '@shep_needs_you to read 1',
        STEP_TIMEOUT_MS
      );

      // A second C opens nothing new.
      tmux.run('send-keys', '-t', consolePane, 'C');
      await waitFor(
        () =>
          /Every active feature already has a window/.test(tmux.capture(consolePane))
            ? true
            : undefined,
        'the already-open message',
        STEP_TIMEOUT_MS
      );
      expect(windows()).toHaveLength(3);

      // The one-shot summary agrees, with no terminal at all.
      const status = runner.run('tui --status');
      expect(status.exitCode).toBe(0);
      expect(status.stdout).toContain('◆ 1 needs you');
      expect(runner.run('tui --status tmux').stdout).toContain('#[fg=yellow,bold]◆ 1 needs you');
    });
  }
);
