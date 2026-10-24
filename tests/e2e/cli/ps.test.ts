/**
 * CLI E2E: shep ps (spec 144)
 *
 * Runs the real CLI against an isolated SHEP_HOME. A feature created with the
 * deterministic mock executor starts a detached worker; `shep ps` must list
 * it as a feature agent, as a table and as JSON. CPU and memory are not
 * asserted: they are absent on Windows by design.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MULTI_STEP_CLI_TIMEOUT_MS,
  MULTI_STEP_TEST_TIMEOUT_MS,
  createCliRunner,
  type CliRunner,
} from '../../helpers/cli/index.js';
import { createConsoleFixture, type ConsoleFixture } from '../../helpers/tui/console-e2e.js';

const FEATURE_TITLE = 'Process monitor check';
const FEATURE_NAME = /process monitor check/i;
const POLL_MS = 500;
/** The worker records its PID within seconds; Windows CI is several times slower. */
const WORKER_TIMEOUT_MS = process.platform === 'win32' ? 90_000 : 45_000;

interface PsJson {
  processes: { kind: string; pid: number; state: string; featureName?: string; runId?: string }[];
  summary: { running: number; crashed: number; exited: number };
}

describe('CLI: ps', { timeout: MULTI_STEP_TEST_TIMEOUT_MS * 2 }, () => {
  let fixture: ConsoleFixture;
  let runner: CliRunner;

  beforeEach(() => {
    fixture = createConsoleFixture();
    runner = createCliRunner({
      env: { SHEP_HOME: fixture.shepHome, SHEP_TELEMETRY_DISABLED: '1' },
      timeout: MULTI_STEP_CLI_TIMEOUT_MS,
    });
  });

  afterEach(() => {
    fixture.cleanup();
  });

  const psJson = (): PsJson => JSON.parse(runner.runOrThrow('ps --json --all').stdout) as PsJson;

  it('says nothing is running on a fresh install, as text and as JSON', () => {
    const text = runner.runOrThrow('ps');
    expect(text.stdout).toContain('No Shep processes are running');

    expect(psJson()).toEqual({
      generatedAt: expect.any(String),
      processes: [],
      summary: { running: 0, crashed: 0, exited: 0 },
    });
  });

  it("lists a feature's agent worker as a feature agent", async () => {
    runner.runOrThrow(`feat new "${FEATURE_TITLE}" --repo ${fixture.repo}`);

    // The worker records its PID when it claims the run; with --all it stays
    // listed after it parks at the first gate and exits.
    const deadline = Date.now() + WORKER_TIMEOUT_MS;
    let row: PsJson['processes'][number] | undefined;
    while (!row && Date.now() < deadline) {
      row = psJson().processes.find((p) => p.kind === 'feature-agent');
      if (!row) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }

    expect(row, 'a feature-agent row').toBeDefined();
    expect(row?.featureName).toMatch(FEATURE_NAME);
    expect(row?.pid).toBeGreaterThan(0);
    expect(['running', 'exited']).toContain(row?.state);

    const table = runner.runOrThrow('ps --all').stdout;
    expect(table).toContain('Shep processes');
    expect(table).toMatch(FEATURE_NAME);
    expect(table).toContain('feature agent');
  });

  it('refuses to stop something that is not an agent run', () => {
    const unknown = runner.run('ps stop does-not-exist');
    expect(unknown.exitCode).toBe(1);
    expect(`${unknown.stdout}${unknown.stderr}`).toContain('No agent run or feature matches');

    const daemon = runner.run('ps stop daemon');
    expect(daemon.exitCode).toBe(1);
    expect(`${daemon.stdout}${daemon.stderr}`).toContain('shep stop');
  });

  it('refuses --watch without an interactive terminal', () => {
    const result = runner.run('ps --watch');
    expect(result.exitCode).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain('shep ps --json');
  });
});
