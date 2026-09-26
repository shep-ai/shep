/**
 * Settings Init Command E2E Tests
 *
 * Tests for the `shep settings init` command with confirmation prompts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createIsolatedCliRunner, type IsolatedCliRunner } from '../../helpers/cli/index.js';

describe('CLI: settings init', () => {
  let isolated: IsolatedCliRunner;

  beforeEach(() => {
    isolated = createIsolatedCliRunner();
  });

  afterEach(() => {
    isolated.cleanup();
  });

  it('should reinitialize settings with --force and display success message', () => {
    const result = isolated.runner.run('settings init --force');

    expect(result.exitCode).toBe(0);
    expect(result.success).toBe(true);
    expect(result.stdout).toContain('Settings initialized');
  });

  it('should reset settings to defaults after init', () => {
    // First, verify settings exist via show
    const showResult = isolated.runner.run('settings show --output json');
    expect(showResult.exitCode).toBe(0);

    // Run init --force
    const initResult = isolated.runner.run('settings init --force');
    expect(initResult.exitCode).toBe(0);

    // Verify settings are reset to defaults
    const afterResult = isolated.runner.run('settings show --output json');
    expect(afterResult.exitCode).toBe(0);

    const settings = JSON.parse(afterResult.stdout);
    expect(settings.models.default).toBe('claude-opus-5-5');
    expect(settings.environment.defaultEditor).toBe('vscode');
    expect(settings.system.autoUpdate).toBe(true);
  }, 30_000);

  it('should not silently modify settings without --force', () => {
    const result = isolated.runner.run('settings init');

    expect(result.stdout + result.stderr).not.toBe('');
  });

  it('should work with -f short flag', () => {
    const result = isolated.runner.run('settings init -f');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Settings initialized');
  });

  it('should display help for init command', () => {
    const result = isolated.runner.run('settings init --help');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('init');
    expect(result.stdout).toContain('--force');
  });
});
