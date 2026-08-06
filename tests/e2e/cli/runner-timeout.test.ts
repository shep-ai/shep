/**
 * CLI Runner Timeout Reporting
 *
 * A killed-on-timeout child process has no exit status, and execSync reports
 * `status: null`. The runner used to collapse that to `exitCode: 1`, making
 * "the command ran out of time" indistinguishable from "the command failed" —
 * a CI failure then reads only as `expected 1 to be +0`, with no hint that the
 * budget was the problem.
 *
 * These tests pin the runner's timeout reporting so future timeouts are
 * self-diagnosing.
 */

import { describe, it, expect } from 'vitest';
import { createCliRunner } from '../../helpers/cli/runner.js';

describe('CLI runner: timeout reporting', { timeout: 30_000 }, () => {
  it('flags a killed-on-timeout command as timedOut rather than a plain failure', () => {
    // 1ms cannot outlast process spawn, so this always times out.
    const { run } = createCliRunner({ timeout: 1 });

    const result = run('--version');

    expect(result.timedOut).toBe(true);
    expect(result.success).toBe(false);
  });

  it('names the exceeded budget in stderr so CI logs explain themselves', () => {
    const { run } = createCliRunner({ timeout: 1 });

    const result = run('--version');

    expect(result.stderr).toMatch(/timed out after 1ms/i);
  });

  it('does not flag a command that exits on its own as timedOut', () => {
    const { run } = createCliRunner();

    const result = run('--version');

    expect(result.timedOut).toBe(false);
    expect(result.exitCode).toBe(0);
  });
});
