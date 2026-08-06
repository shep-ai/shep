/**
 * SyncFeatureBranchUseCase Integration Tests (real git)
 *
 * Reproduces the reported failure against a real git repository: rebasing a
 * feature branch whose worktree holds uncommitted work used to abort with
 * "Cannot rebase: working directory has uncommitted changes" — in particular
 * for untracked files, which `git stash push` silently ignores.
 *
 * The workflow must now commit that work and rebase, losing nothing.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitPrService } from '@/infrastructure/services/git/git-pr.service.js';
import { SyncFeatureBranchUseCase } from '@/application/use-cases/features/sync-feature-branch.use-case.js';
import type { IWorktreeService } from '@/application/ports/output/services/worktree-service.interface.js';
import type { IConflictResolutionService } from '@/application/ports/output/services/conflict-resolution.interface.js';
import type { ExecFunction } from '@/infrastructure/services/git/worktree.service.js';

const execFileRaw = promisify(execFileCb);

const FEATURE_BRANCH = 'feat/sync-me';
const BASE_BRANCH = 'main';

describe('SyncFeatureBranchUseCase (real git)', () => {
  let tempRoot: string;
  let originPath: string;
  let repoPath: string;
  let useCase: SyncFeatureBranchUseCase;
  let conflictResolution: IConflictResolutionService;

  const realExec: ExecFunction = (file, args, options) =>
    execFileRaw(file, args, options ?? {}) as Promise<{ stdout: string; stderr: string }>;

  const git = (cwd: string, args: string[]) => realExec('git', args, { cwd });

  const commitFile = async (cwd: string, name: string, content: string, message: string) => {
    writeFileSync(join(cwd, name), content);
    await git(cwd, ['add', '-A']);
    await git(cwd, ['commit', '-m', message]);
  };

  beforeEach(async () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'shep-sync-branch-'));
    originPath = join(tempRoot, 'origin.git');
    repoPath = join(tempRoot, 'work');

    await realExec('git', ['init', '--bare', '-b', BASE_BRANCH, originPath], { cwd: tempRoot });
    await realExec('git', ['clone', originPath, repoPath], { cwd: tempRoot });
    await git(repoPath, ['config', 'user.email', 'test@example.com']);
    await git(repoPath, ['config', 'user.name', 'Test']);
    await git(repoPath, ['config', 'core.autocrlf', 'false']);
    await git(repoPath, ['config', 'commit.gpgsign', 'false']);

    // Seed the base branch and publish it
    await commitFile(repoPath, 'README.md', 'base\n', 'chore: seed');
    await git(repoPath, ['push', '-u', 'origin', BASE_BRANCH]);

    // Feature branch with one commit of its own
    await git(repoPath, ['checkout', '-b', FEATURE_BRANCH]);
    await commitFile(repoPath, 'feature.txt', 'feature work\n', 'feat: feature work');

    // Base branch moves ahead on the remote while the feature branch is behind
    await git(repoPath, ['checkout', BASE_BRANCH]);
    await commitFile(repoPath, 'upstream.txt', 'upstream work\n', 'feat: upstream work');
    await git(repoPath, ['push', 'origin', BASE_BRANCH]);
    await git(repoPath, ['checkout', FEATURE_BRANCH]);

    const worktreeService = {
      exists: vi.fn().mockResolvedValue(false),
      getWorktreePath: vi.fn().mockReturnValue(repoPath),
    } as unknown as IWorktreeService;

    conflictResolution = {
      resolve: vi.fn().mockResolvedValue(undefined),
      resolveStashPop: vi.fn().mockResolvedValue(undefined),
    } as unknown as IConflictResolutionService;

    useCase = new SyncFeatureBranchUseCase(
      new GitPrService(realExec),
      worktreeService,
      conflictResolution
    );
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  const isAncestor = async (ancestor: string, descendant: string): Promise<boolean> => {
    try {
      await git(repoPath, ['merge-base', '--is-ancestor', ancestor, descendant]);
      return true;
    } catch {
      return false;
    }
  };

  it('should commit untracked work and rebase onto the remote base branch', async () => {
    // The exact case `git stash push` skips: a brand-new, untracked file
    writeFileSync(join(repoPath, 'wip.txt'), 'work in progress\n');

    const result = await useCase.execute({ repositoryPath: repoPath, branch: FEATURE_BRANCH });

    expect(result.committed).toBe(true);
    expect(result.baseBranch).toBe(BASE_BRANCH);
    expect(result.conflictsResolved).toBe(false);

    // Nothing left behind: clean tree, no stash entries, work preserved
    const { stdout: status } = await git(repoPath, ['status', '--porcelain']);
    expect(status.trim()).toBe('');
    const { stdout: stashList } = await git(repoPath, ['stash', 'list']);
    expect(stashList.trim()).toBe('');
    expect(readFileSync(join(repoPath, 'wip.txt'), 'utf-8')).toBe('work in progress\n');

    // Rebased: upstream commit is now an ancestor of the feature branch
    expect(await isAncestor(`origin/${BASE_BRANCH}`, 'HEAD')).toBe(true);
    expect(existsSync(join(repoPath, 'upstream.txt'))).toBe(true);
    expect(existsSync(join(repoPath, 'feature.txt'))).toBe(true);
  });

  it('should commit modified tracked files before rebasing', async () => {
    writeFileSync(join(repoPath, 'feature.txt'), 'feature work, edited\n');

    const result = await useCase.execute({ repositoryPath: repoPath, branch: FEATURE_BRANCH });

    expect(result.committed).toBe(true);
    const { stdout: status } = await git(repoPath, ['status', '--porcelain']);
    expect(status.trim()).toBe('');
    expect(readFileSync(join(repoPath, 'feature.txt'), 'utf-8')).toBe('feature work, edited\n');
    expect(await isAncestor(`origin/${BASE_BRANCH}`, 'HEAD')).toBe(true);
  });

  it('should rebase without creating a commit when the worktree is clean', async () => {
    const { stdout: before } = await git(repoPath, ['rev-list', '--count', 'HEAD']);

    const result = await useCase.execute({ repositoryPath: repoPath, branch: FEATURE_BRANCH });

    expect(result.committed).toBe(false);
    expect(await isAncestor(`origin/${BASE_BRANCH}`, 'HEAD')).toBe(true);

    // One feature commit replayed on top of the two base commits
    const { stdout: after } = await git(repoPath, ['rev-list', '--count', 'HEAD']);
    expect(parseInt(after.trim(), 10)).toBe(parseInt(before.trim(), 10) + 1);
  });

  it('should skip the repository commit hooks', async () => {
    const hookPath = join(repoPath, '.git', 'hooks', 'pre-commit');
    writeFileSync(hookPath, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    writeFileSync(join(repoPath, 'wip.txt'), 'work in progress\n');

    const result = await useCase.execute({ repositoryPath: repoPath, branch: FEATURE_BRANCH });

    expect(result.committed).toBe(true);
    const { stdout: status } = await git(repoPath, ['status', '--porcelain']);
    expect(status.trim()).toBe('');
  });
});
