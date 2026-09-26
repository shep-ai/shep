/**
 * Settings Effort Command E2E Tests
 *
 * Exercises `shep settings effort` against an isolated SHEP_HOME: set, show,
 * clear, and rejection of unknown levels, all through the real CLI binary and
 * SQLite database.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createIsolatedCliRunner, type IsolatedCliRunner } from '../../helpers/cli/index.js';

describe('CLI: settings effort', () => {
  let isolated: IsolatedCliRunner;

  const showJson = () => {
    const result = isolated.runner.run('settings show --output json');
    expect(result.exitCode).toBe(0);
    return JSON.parse(result.stdout) as { models: { default: string; effort?: string } };
  };

  beforeEach(() => {
    isolated = createIsolatedCliRunner();
  });

  afterEach(() => {
    isolated.cleanup();
  });

  it('starts with no effort (agent default) on a fresh install', () => {
    const settings = showJson();
    expect(settings.models.default).toBe('claude-opus-5-5');
    expect(settings.models.effort).toBeUndefined();
  }, 30_000);

  it('persists an effort level and shows it', () => {
    const result = isolated.runner.run('settings effort high');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('high');

    expect(showJson().models.effort).toBe('high');

    const table = isolated.runner.run('settings show');
    expect(table.stdout).toContain('Effort');
    expect(table.stdout).toContain('high');
  }, 30_000);

  it('clears the effort back to the agent default', () => {
    expect(isolated.runner.run('settings effort max').exitCode).toBe(0);
    expect(showJson().models.effort).toBe('max');

    expect(isolated.runner.run('settings effort --clear').exitCode).toBe(0);
    expect(showJson().models.effort).toBeUndefined();
  }, 30_000);

  it('rejects an unknown level without changing settings', () => {
    expect(isolated.runner.run('settings effort low').exitCode).toBe(0);

    const result = isolated.runner.run('settings effort ultra');
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('low, medium, high, xhigh, max');

    expect(showJson().models.effort).toBe('low');
  }, 30_000);
});
