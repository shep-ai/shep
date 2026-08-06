/**
 * CLI Settings Initialization E2E Tests
 *
 * Tests for automatic settings initialization when CLI starts.
 * Uses SHEP_HOME env var to isolate each test from real ~/.shep/ directory.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCliRunner } from '../../helpers/cli/index.js';

/**
 * Per-CLI-spawn budget, taken from the runner's own platform-aware default
 * (30s on Windows, 15s elsewhere). Tests below must allow this much time for
 * EVERY sequential `run()` they make, or they fail at the vitest boundary
 * while the CLI is still legitimately working.
 */
const CLI_SPAWN_BUDGET_MS = process.platform === 'win32' ? 30_000 : 15_000;

/** Vitest timeout for a test that spawns the CLI `runs` times in sequence. */
const timeoutForRuns = (runs: number): number => runs * CLI_SPAWN_BUDGET_MS + 30_000;

describe('CLI: settings initialization', () => {
  let shepDir: string;
  let dbPath: string;

  beforeEach(() => {
    shepDir = mkdtempSync(join(tmpdir(), 'shep-init-test-'));
    dbPath = join(shepDir, 'data');
  });

  afterEach(() => {
    // Best-effort: on Windows a CLI child that outlived its spawn can still
    // hold the SQLite handle, making unlink throw EBUSY. Cleanup noise must
    // never surface as a test failure and mask the real assertion.
    try {
      rmSync(shepDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  });

  it('should create non-empty database file on first run', () => {
    const runner = createCliRunner({
      env: { SHEP_HOME: shepDir },
    });

    const result = runner.run('version');

    expect(result.success).toBe(true);
    expect(existsSync(dbPath)).toBe(true);
    const stats = statSync(dbPath);
    expect(stats.size).toBeGreaterThan(0);
  });

  it(
    'should load existing settings without re-initializing on second run',
    () => {
      const runner = createCliRunner({
        env: { SHEP_HOME: shepDir },
      });

      const firstResult = runner.run('version');
      expect(firstResult.success).toBe(true);

      const stats1 = statSync(dbPath);
      const firstMtime = stats1.mtimeMs;

      const secondResult = runner.run('version');

      expect(secondResult.success).toBe(true);
      const stats2 = statSync(dbPath);
      const secondMtime = stats2.mtimeMs;

      const mtimeDiff = Math.abs(secondMtime - firstMtime);
      expect(mtimeDiff).toBeLessThan(5000);
    },
    timeoutForRuns(2)
  );

  it('should handle corrupted database gracefully', () => {
    writeFileSync(dbPath, 'CORRUPTED_DATA_NOT_SQLITE');

    const runner = createCliRunner({
      env: { SHEP_HOME: shepDir },
    });

    const result = runner.run('version');

    if (result.success) {
      expect(existsSync(dbPath)).toBe(true);
    } else {
      const output = (result.stderr || result.stdout)
        .split('\n')
        .filter((line) => !line.includes('npm notice'))
        .join('\n');
      expect(output).toMatch(/failed|database|settings|corrupted|initialize/i);
    }
  });

  it('should handle missing database with existing directory', () => {
    expect(existsSync(shepDir)).toBe(true);
    expect(existsSync(dbPath)).toBe(false);

    const runner = createCliRunner({
      env: { SHEP_HOME: shepDir },
    });

    const result = runner.run('version');

    expect(result.success).toBe(true);
    expect(existsSync(dbPath)).toBe(true);
  });

  it(
    'should handle multiple concurrent CLI invocations safely',
    async () => {
      const runner = createCliRunner({
        env: { SHEP_HOME: shepDir },
      });

      const promises = [
        Promise.resolve(runner.run('version')),
        Promise.resolve(runner.run('--version')),
        Promise.resolve(runner.run('--help')),
      ];

      const results = await Promise.all(promises);

      results.forEach((result) => {
        expect(result.success).toBe(true);
      });

      expect(existsSync(dbPath)).toBe(true);
    },
    timeoutForRuns(3)
  );

  it(
    'should use SHEP_HOME environment variable for settings location',
    () => {
      const runner = createCliRunner({
        env: { SHEP_HOME: shepDir },
      });

      const result = runner.run('version');

      expect(result.success).toBe(true);
      expect(existsSync(dbPath)).toBe(true);
    },
    timeoutForRuns(1)
  );
});
