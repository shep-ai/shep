/**
 * TUI E2E: attach to a feature and steer its agent (spec 147)
 *
 * With the mock executor the feature chat gets a deterministic agent: it
 * calls one tool and quotes the message back, and on "ask me" it asks a
 * two-option question. The console must attach with `o`, show the
 * transcript as it arrives, send what the user types, answer the question
 * with a digit, and detach with esc.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MULTI_STEP_CLI_TIMEOUT_MS,
  MULTI_STEP_TEST_TIMEOUT_MS,
  createCliRunner,
} from '../../helpers/cli/index.js';
import type { PtyScreen } from '../../helpers/tui/pty-screen.js';
import {
  createConsoleFixture,
  isWindows,
  spawnConsole,
  type ConsoleFixture,
} from '../../helpers/tui/console-e2e.js';

const START_TIMEOUT_MS = isWindows ? 60_000 : 30_000;
const STEP_TIMEOUT_MS = 30_000;
const FEATURE_TITLE = 'Chat attach check';
const FEATURE_NAME = /chat attach check/i;

describe('TUI: feature chat', { timeout: MULTI_STEP_TEST_TIMEOUT_MS * 3 }, () => {
  let fixture: ConsoleFixture;
  let screen: PtyScreen | undefined;

  beforeEach(() => {
    fixture = createConsoleFixture();
  });

  afterEach(() => {
    screen?.kill();
    screen = undefined;
    fixture.cleanup();
  });

  const typeText = (text: string) => {
    for (const ch of text) screen!.press(ch);
  };

  it('attaches with o, sends a message, answers a question and detaches with esc', async () => {
    createCliRunner({
      env: { SHEP_HOME: fixture.shepHome, SHEP_TELEMETRY_DISABLED: '1' },
      timeout: MULTI_STEP_CLI_TIMEOUT_MS,
    }).runOrThrow(`feat new "${FEATURE_TITLE}" --repo ${fixture.repo}`);

    screen = spawnConsole(fixture.shepHome);
    await screen.waitFor((text) => FEATURE_NAME.test(text), 'the feature row', START_TIMEOUT_MS);

    screen.press('o');
    await screen.waitFor(
      (text) => /Chat · Chat Attach Check/i.test(text),
      'the chat',
      STEP_TIMEOUT_MS
    );
    await screen.waitForText('No messages yet', STEP_TIMEOUT_MS);

    // q is text here, not quit.
    typeText('Why is the login test flaky? q');
    screen.press('\r');
    await screen.waitForText(
      'Mock agent: you said "Why is the login test flaky? q".',
      STEP_TIMEOUT_MS
    );
    expect(screen.text()).toContain('you › Why is the login test flaky? q');
    expect(screen.text()).toContain('· Read README.md');

    typeText('please ask me something');
    screen.press('\r');
    await screen.waitForText('Mock: Which option?', STEP_TIMEOUT_MS);
    expect(screen.text()).toContain('2. Second');
    screen.press('2');
    await screen.waitForText('Mock agent: you picked "Second".', STEP_TIMEOUT_MS);

    screen.press('\x1b');
    await screen.waitFor(
      (text) => !text.includes('Chat · ') && text.includes('shep · Features'),
      'the roster again',
      STEP_TIMEOUT_MS
    );

    screen.press('q');
    expect((await screen.exited).exitCode).toBe(0);
  });
});
