/**
 * TUI E2E: the terminal feature console (specs 142, 143, 145)
 *
 * Drives the real `shep tui` in a pseudo-terminal and reads the screen
 * through a headless xterm, exactly as a user's terminal would show it.
 *
 * A feature is created with the deterministic mock executor; its background
 * worker runs until the first approval gate. The console must show it in the
 * needs-you strip, approve it from the keyboard, and on `q` leave the
 * alternate screen and exit 0. Without a terminal multiplexer, `t` lends the
 * terminal to a shell and the console comes back when it exits.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MULTI_STEP_CLI_TIMEOUT_MS,
  MULTI_STEP_TEST_TIMEOUT_MS,
  createCliRunner,
} from '../../helpers/cli/index.js';
import { type PtyScreen } from '../../helpers/tui/pty-screen.js';
import {
  createConsoleFixture,
  isWindows,
  spawnConsole,
  type ConsoleFixture,
} from '../../helpers/tui/console-e2e.js';

const GATE_TIMEOUT_MS = isWindows ? 120_000 : 60_000;
/** Opening the console boots the CLI (DB, migrations, DI) once. */
const START_TIMEOUT_MS = isWindows ? 60_000 : 30_000;
const STEP_TIMEOUT_MS = 20_000;
const FEATURE_TITLE = 'Console approval check';
/** The mock executor title-cases the name it derives from the prompt. */
const FEATURE_NAME = /console approval check/i;

const spawnTui = spawnConsole;

describe('TUI: feature console', { timeout: MULTI_STEP_TEST_TIMEOUT_MS * 3 }, () => {
  let fixture: ConsoleFixture;
  let shepHome: string;
  let tempRepo: string;
  let screen: PtyScreen | undefined;

  beforeEach(() => {
    fixture = createConsoleFixture();
    ({ shepHome, repo: tempRepo } = fixture);
  });

  afterEach(() => {
    screen?.kill();
    screen = undefined;
    fixture.cleanup();
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

  it.skipIf(isWindows)(
    'without a multiplexer, t runs a shell in this terminal and the console returns when it exits',
    async () => {
      createCliRunner({
        env: { SHEP_HOME: shepHome, SHEP_TELEMETRY_DISABLED: '1' },
        timeout: MULTI_STEP_CLI_TIMEOUT_MS,
      }).runOrThrow(`feat new "${FEATURE_TITLE}" --repo ${tempRepo}`);
      screen = spawnTui(shepHome, { SHEP_MULTIPLEXER: 'none', SHELL: '/bin/sh' });
      await screen.waitFor((text) => FEATURE_NAME.test(text), 'the feature row', START_TIMEOUT_MS);

      screen.press('t');
      await screen.waitForText('Type exit to return to shep tui', STEP_TIMEOUT_MS);
      expect(screen.onAlternateScreen).toBe(false);

      // A real shell owns the terminal: it evaluates what we type.
      screen.press('echo inline-$((40 + 2))\r');
      await screen.waitForText('inline-42', STEP_TIMEOUT_MS);
      screen.press('exit\r');

      await screen.waitForText('shep · Features', STEP_TIMEOUT_MS);
      expect(screen.onAlternateScreen).toBe(true);
      await screen.waitFor((text) => FEATURE_NAME.test(text), 'the row again', STEP_TIMEOUT_MS);

      screen.press('q');
      expect((await screen.exited).exitCode).toBe(0);
    }
  );

  it('filters the roster with /, and esc brings every feature back', async () => {
    createCliRunner({
      env: { SHEP_HOME: shepHome, SHEP_TELEMETRY_DISABLED: '1' },
      timeout: MULTI_STEP_CLI_TIMEOUT_MS,
    }).runOrThrow(`feat new "${FEATURE_TITLE}" --repo ${tempRepo}`);
    screen = spawnTui(shepHome);
    await screen.waitFor((text) => FEATURE_NAME.test(text), 'the feature row', START_TIMEOUT_MS);

    screen.press('/');
    for (const ch of 'zzz') screen.press(ch);
    await screen.waitForText('No feature matches', STEP_TIMEOUT_MS);
    // q is filter text here, not quit.
    screen.press('q');
    await screen.waitForText('zzzq', STEP_TIMEOUT_MS);

    screen.press('\x1b');
    await screen.waitFor(
      (text) =>
        !text.includes('No feature matches') &&
        FEATURE_NAME.test(text.split('\n').slice(2).join('\n')),
      'the roster back',
      STEP_TIMEOUT_MS
    );
    screen.press('q');
    expect((await screen.exited).exitCode).toBe(0);
  });

  it('opens the command palette with ctrl+p and runs a command from it (spec 145)', async () => {
    screen = spawnTui(shepHome);
    await screen.waitForText('No features yet', START_TIMEOUT_MS);

    screen.press('\x10');
    await screen.waitForText('Commands', STEP_TIMEOUT_MS);
    for (const ch of 'keys') screen.press(ch);
    await screen.waitForText('Show keys', STEP_TIMEOUT_MS);
    screen.press('\r');
    await screen.waitForText('reject the gate with feedback', STEP_TIMEOUT_MS);

    screen.press('\x1b');
    await screen.waitFor(
      (text) => !text.includes('reject the gate with feedback'),
      'help to close',
      STEP_TIMEOUT_MS
    );
    screen.press('q');
    expect((await screen.exited).exitCode).toBe(0);
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
