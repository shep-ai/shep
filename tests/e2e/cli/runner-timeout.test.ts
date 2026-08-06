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
 *
 * Isolation: every test gets its OWN SHEP_HOME. The 1ms runs are killed partway
 * through first-run database initialisation, and a dying process can still hold
 * the SQLite lock — sharing a home would let that leak into the next test.
 */

import { describe, it, expect } from 'vitest';
import { createIsolatedCliRunner } from '../../helpers/cli/runner.js';

/** Shorter than process spawn, so the command is always killed. */
const UNMEETABLE_TIMEOUT_MS = 1;

/** Renders a result for an assertion message — never assert blind on a spawn. */
function describeResult(result: {
  exitCode: number;
  timedOut: boolean;
  stdout: string;
  stderr: string;
}): string {
  return `exitCode=${result.exitCode} timedOut=${result.timedOut}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`;
}

describe('CLI runner: timeout reporting', { timeout: 60_000 }, () => {
  it('flags a killed-on-timeout command as timedOut rather than a plain failure', () => {
    const { runner, cleanup } = createIsolatedCliRunner({ timeout: UNMEETABLE_TIMEOUT_MS });
    try {
      const result = runner.run('--version');

      expect(result.timedOut, describeResult(result)).toBe(true);
      expect(result.success, describeResult(result)).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('names the exceeded budget in stderr so CI logs explain themselves', () => {
    const { runner, cleanup } = createIsolatedCliRunner({ timeout: UNMEETABLE_TIMEOUT_MS });
    try {
      const result = runner.run('--version');

      expect(result.stderr, describeResult(result)).toMatch(
        new RegExp(`timed out after ${UNMEETABLE_TIMEOUT_MS}ms`, 'i')
      );
    } finally {
      cleanup();
    }
  });

  it('does NOT flag a command that exits non-zero on its own as timedOut', () => {
    // The exact confusion this flag exists to resolve: an unknown command exits
    // 1 by itself, which must stay distinguishable from a killed process that
    // only *reports* as 1. Uses a command that needs no database, so the
    // assertion cannot be perturbed by first-run initialisation.
    const { runner, cleanup } = createIsolatedCliRunner();
    try {
      const result = runner.run('definitely-not-a-shep-command');

      expect(result.timedOut, describeResult(result)).toBe(false);
      expect(result.exitCode, describeResult(result)).toBe(1);
      expect(result.stderr, describeResult(result)).not.toMatch(/timed out after/i);
    } finally {
      cleanup();
    }
  });
});
