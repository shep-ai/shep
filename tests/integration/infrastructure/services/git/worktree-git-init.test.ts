/**
 * WorktreeService Git Init Integration Tests
 *
 * Validates ensureGitRepository with real git commands in isolated temp directories.
 * No mocks — exercises actual git operations end-to-end.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { WorktreeService } from '../../../../../packages/core/src/infrastructure/services/git/worktree.service.js';

const execFile = promisify(execFileCb);

describe('WorktreeService.ensureGitRepository (integration)', () => {
  let tempDir: string;
  let service: WorktreeService;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'shep-git-init-test-'));
    service = new WorktreeService(
      (file, args, options) =>
        execFile(file, args, options ?? {}) as Promise<{ stdout: string; stderr: string }>
    );
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should create a non-existent directory recursively and initialize git', async () => {
    const nestedPath = join(tempDir, 'deep', 'nested', 'repo');
    expect(existsSync(nestedPath)).toBe(false);

    await service.ensureGitRepository(nestedPath);

    expect(existsSync(join(nestedPath, '.git'))).toBe(true);
    const { stdout } = await execFile('git', ['log', '--oneline'], { cwd: nestedPath });
    expect(stdout.trim()).toContain('Initial commit');
  });

  it('should initialize a non-git directory with git init and initial commit', async () => {
    await service.ensureGitRepository(tempDir);

    // Verify .git directory was created
    expect(existsSync(join(tempDir, '.git'))).toBe(true);

    // Verify there is at least one commit
    const { stdout } = await execFile('git', ['log', '--oneline'], { cwd: tempDir });
    expect(stdout.trim()).toContain('Initial commit');
  });

  it('should create initial commit for existing git repo with unborn branch (no commits)', async () => {
    // Simulate a user repo that was `git init` but never committed
    await execFile('git', ['init'], { cwd: tempDir });

    // Verify it has no commits (unborn branch)
    await expect(execFile('git', ['rev-parse', 'HEAD'], { cwd: tempDir })).rejects.toThrow();

    await service.ensureGitRepository(tempDir);

    // Now it should have a commit
    const { stdout } = await execFile('git', ['log', '--oneline'], { cwd: tempDir });
    expect(stdout.trim()).toContain('Initial commit');
  });

  it('should allow worktree creation after fixing unborn branch repo', async () => {
    // Simulate a user repo with git init but no commits
    await execFile('git', ['init'], { cwd: tempDir });

    await service.ensureGitRepository(tempDir);

    // Worktree creation should now succeed
    const wtPath = join(tempDir, '.worktrees', 'test-branch');
    const result = await service.create(tempDir, 'test-branch', wtPath);

    expect(result.branch).toBe('test-branch');
    expect(existsSync(wtPath)).toBe(true);

    await execFile('git', ['worktree', 'remove', wtPath], { cwd: tempDir });
  });

  it('should not re-initialize an existing git repository', async () => {
    // Manually init the repo with a custom commit message
    await execFile('git', ['init'], { cwd: tempDir });
    await execFile('git', ['config', 'user.name', 'Test'], { cwd: tempDir });
    await execFile('git', ['config', 'user.email', 'test@test.com'], { cwd: tempDir });
    // Never sign this throwaway commit — must not depend on the developer's /
    // CI runner's global commit-signing setup (gpg/ssh).
    await execFile('git', ['config', 'commit.gpgsign', 'false'], { cwd: tempDir });
    await execFile('git', ['commit', '--allow-empty', '-m', 'Pre-existing commit'], {
      cwd: tempDir,
    });

    // Call ensureGitRepository — should be a no-op
    await service.ensureGitRepository(tempDir);

    // Verify only the original commit exists (no extra "Initial commit")
    const { stdout } = await execFile('git', ['log', '--oneline'], { cwd: tempDir });
    const commits = stdout.trim().split('\n');
    expect(commits).toHaveLength(1);
    expect(commits[0]).toContain('Pre-existing commit');
  });

  it('should create an initial commit with the correct message', async () => {
    await service.ensureGitRepository(tempDir);

    const { stdout } = await execFile('git', ['log', '--format=%s'], { cwd: tempDir });
    expect(stdout.trim()).toBe('Initial commit');
  });

  it('should allow worktree creation after auto-initialization', async () => {
    await service.ensureGitRepository(tempDir);

    // Create a worktree — this requires a valid git repo with at least one commit
    const wtPath = join(tempDir, '.worktrees', 'test-branch');
    const result = await service.create(tempDir, 'test-branch', wtPath);

    expect(result.branch).toBe('test-branch');
    expect(existsSync(wtPath)).toBe(true);

    // Clean up worktree (use execFile directly since service.remove doesn't set cwd)
    await execFile('git', ['worktree', 'remove', wtPath], { cwd: tempDir });
  });

  it('should include existing files in worktree when initializing a non-git directory (#353)', async () => {
    // Place a file in the directory before git init
    const existingFile = join(tempDir, 'existing.txt');
    writeFileSync(existingFile, 'hello from existing file');

    await service.ensureGitRepository(tempDir);

    // Create a worktree from the initial commit
    const wtPath = join(tempDir, '.worktrees', 'test-branch');
    await service.create(tempDir, 'test-branch', wtPath);

    // The worktree should contain the file that existed before git init
    expect(existsSync(join(wtPath, 'existing.txt'))).toBe(true);

    await execFile('git', ['worktree', 'remove', wtPath], { cwd: tempDir });
  });
});
