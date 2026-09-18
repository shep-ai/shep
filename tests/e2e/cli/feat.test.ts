/**
 * CLI Feature Commands E2E Tests
 *
 * Tests for the `shep feat` command group (new, ls, show).
 * Verifies feature creation with git worktrees, listing, and detail display.
 *
 * Each test uses an isolated SHEP_HOME directory (for settings/database)
 * and a temporary git repository (for worktree creation).
 *
 * Uses SHEP_MOCK_EXECUTOR=1 (set in CLI runner defaults) for deterministic
 * AI responses — slugs, names, and branches are predictable.
 *
 * NOTE: Uses execSync intentionally for git setup in tests. All inputs are
 * controlled by test code (hardcoded constants), not user input.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { removeDirWithRetry } from '@tests/helpers/remove-dir.helper.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execSync, spawnSync } from 'node:child_process';
import { createCliRunner } from '../../helpers/cli/index.js';

const isWindows = process.platform === 'win32';

describe('CLI: feat', () => {
  let shepHome: string;
  let tempRepo: string;

  beforeEach(() => {
    // Create isolated SHEP_HOME directory for settings/database
    shepHome = mkdtempSync(join(tmpdir(), 'shep-feat-test-home-'));

    // Create temporary git repository with an initial commit
    // (git worktree requires at least one commit)
    tempRepo = mkdtempSync(join(tmpdir(), 'shep-feat-test-repo-'));
    // Security: all execSync inputs are hardcoded test constants, not user input
    execSync('git init -b main', { cwd: tempRepo, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: tempRepo, stdio: 'pipe' });
    execSync('git config user.email "test@example.com"', { cwd: tempRepo, stdio: 'pipe' });
    execSync('git commit --allow-empty -m "Initial commit"', { cwd: tempRepo, stdio: 'pipe' });
  });

  afterEach(() => {
    // Kill any spawned agent worker processes that reference our temp SHEP_HOME
    // (feat new forks a detached background worker that holds file handles)
    // Security: shepHome is a controlled mkdtempSync path, not user input
    try {
      if (isWindows) {
        spawnSync(
          'wmic',
          ['process', 'where', `CommandLine like '%${shepHome.replace(/\\/g, '\\\\')}%'`, 'delete'],
          { stdio: 'pipe' }
        );
      } else {
        execSync(`pkill -9 -f "${shepHome}"`, { stdio: 'pipe' });
      }
    } catch {
      // No matching processes — expected when no agent was spawned
    }

    // Brief pause for OS to release file handles after SIGKILL
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);

    // Clean up temporary directories (wrapped in try/catch so test
    // results aren't masked by cleanup failures)
    try {
      if (existsSync(shepHome)) {
        removeDirWithRetry(shepHome);
      }
    } catch {
      // OS will clean /tmp eventually
    }
    try {
      if (existsSync(tempRepo)) {
        removeDirWithRetry(tempRepo);
      }
    } catch {
      // OS will clean /tmp eventually
    }
  });

  /**
   * Extract feature ID (UUID) from `feat new` output.
   * Output format: "  ID:     <uuid>"
   */
  function extractFeatureId(output: string): string {
    const match = output.match(/ID:\s+([0-9a-f-]{36})/);
    if (!match) {
      throw new Error(`Could not extract feature ID from output:\n${output}`);
    }
    return match[1];
  }

  describe('shep feat new', () => {
    it('should create a feature and display its details', () => {
      const runner = createCliRunner({
        env: { SHEP_HOME: shepHome },
        timeout: 30000,
      });

      const result = runner.run(`feat new "Add user authentication" --repo ${tempRepo}`);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('Feature created');
      expect(result.stdout).toMatch(/ID:\s+[0-9a-f-]{36}/);
      expect(result.stdout).toContain('feat/add-user-authentication');
    }, 60_000);

    it('should create a git worktree for the feature branch', () => {
      const runner = createCliRunner({
        env: { SHEP_HOME: shepHome },
        timeout: 30000,
      });

      runner.runOrThrow(`feat new "Worktree check" --repo ${tempRepo}`);

      // Worktrees are stored at $SHEP_HOME/repos/REPO_HASH/wt/FEATURE-SLUG
      const repoHash = createHash('sha256')
        .update(tempRepo.replace(/\\/g, '/'))
        .digest('hex')
        .slice(0, 16);
      const worktreePath = join(shepHome, 'repos', repoHash, 'wt', 'feat-worktree-check');
      expect(existsSync(worktreePath)).toBe(true);
    }, 60_000);

    it('should initialize spec directory with fast-mode YAML files by default', () => {
      const runner = createCliRunner({
        env: { SHEP_HOME: shepHome },
        timeout: 30000,
      });

      runner.runOrThrow(`feat new "Spec init check" --repo ${tempRepo}`);

      const repoHash = createHash('sha256')
        .update(tempRepo.replace(/\\/g, '/'))
        .digest('hex')
        .slice(0, 16);
      const worktreePath = join(shepHome, 'repos', repoHash, 'wt', 'feat-spec-init-check');
      const specDir = join(worktreePath, 'specs', '001-spec-init-check');

      expect(existsSync(specDir)).toBe(true);

      // Fast mode is the default — only feature.yaml and spec.yaml are created
      const files = readdirSync(specDir);
      expect(files).toContain('spec.yaml');
      expect(files).toContain('feature.yaml');
      expect(files).toHaveLength(2);
    }, 60_000);

    it('should initialize spec directory with all YAML files when --no-fast is used', () => {
      const runner = createCliRunner({
        env: { SHEP_HOME: shepHome },
        timeout: 30000,
      });

      runner.runOrThrow(`feat new "Full spec check" --no-fast --repo ${tempRepo}`);

      const repoHash = createHash('sha256')
        .update(tempRepo.replace(/\\/g, '/'))
        .digest('hex')
        .slice(0, 16);
      const worktreePath = join(shepHome, 'repos', repoHash, 'wt', 'feat-full-spec-check');
      const specDir = join(worktreePath, 'specs', '001-full-spec-check');

      expect(existsSync(specDir)).toBe(true);

      const files = readdirSync(specDir);
      expect(files).toContain('spec.yaml');
      expect(files).toContain('research.yaml');
      expect(files).toContain('plan.yaml');
      expect(files).toContain('tasks.yaml');
      expect(files).toContain('feature.yaml');
    }, 60_000);

    it('should auto-resolve duplicate feature slugs with suffix', () => {
      const runner = createCliRunner({
        env: { SHEP_HOME: shepHome },
        timeout: 30000,
      });

      const first = runner.run(`feat new "Duplicate test" --repo ${tempRepo}`);
      expect(first.success).toBe(true);

      const second = runner.run(`feat new "Duplicate test" --repo ${tempRepo}`);
      expect(second.success).toBe(true);
      // Should use a suffixed slug and warn about it
      const output = `${second.stdout} ${second.stderr}`;
      expect(output).toMatch(/already exists.*using/i);
    }, 60_000);

    it('should show error when no description is provided', () => {
      const runner = createCliRunner({
        env: { SHEP_HOME: shepHome },
        timeout: 30000,
      });

      const result = runner.run('feat new');

      expect(result.success).toBe(false);
    });
  });

  describe('shep feat ls', () => {
    it('should show message when no features exist', () => {
      const runner = createCliRunner({
        env: { SHEP_HOME: shepHome },
        timeout: 30000,
      });

      const result = runner.run('feat ls');

      expect(result.success).toBe(true);
      expect(result.stdout).toMatch(/no features/i);
    });

    it('should list created features', () => {
      const runner = createCliRunner({
        env: { SHEP_HOME: shepHome },
        timeout: 30000,
      });

      runner.runOrThrow(`feat new "Listed feature" --repo ${tempRepo}`);

      const result = runner.run('feat ls');

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('Features');
      expect(result.stdout).toContain('Listed Feature');
    }, 60_000);

    it('should filter features by repository path', () => {
      const runner = createCliRunner({
        env: { SHEP_HOME: shepHome },
        timeout: 30000,
      });

      runner.runOrThrow(`feat new "Repo filter test" --repo ${tempRepo}`);

      const result = runner.run(`feat ls --repo ${tempRepo}`);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('Repo Filter Test');
    }, 60_000);
  });

  describe('shep feat show', () => {
    it('should display feature details', () => {
      const runner = createCliRunner({
        env: { SHEP_HOME: shepHome },
        timeout: 30000,
      });

      const createResult = runner.runOrThrow(`feat new "Show detail test" --repo ${tempRepo}`);
      const featureId = extractFeatureId(createResult.stdout);

      const result = runner.run(`feat show ${featureId}`);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain(featureId);
      expect(result.stdout).toContain('Show Detail Test');
      expect(result.stdout).toContain('feat/show-detail-test');
      expect(result.stdout).toContain(tempRepo.replace(/\\/g, '/'));
    }, 60_000);

    it('should show error for nonexistent feature ID', () => {
      const runner = createCliRunner({
        env: { SHEP_HOME: shepHome },
        timeout: 30000,
      });

      const result = runner.run('feat show nonexistent-id');

      expect(result.success).toBe(false);
      const output = `${result.stdout} ${result.stderr}`;
      expect(output).toMatch(/not found|failed/i);
    });
  });
});
