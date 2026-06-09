/**
 * GitPrService rebaseOnBranch Unit Tests
 *
 * TDD Phase: RED → GREEN
 * Tests for rebaseOnBranch which rebases a feature branch onto an arbitrary
 * target branch (not just the default branch). Follows rebaseOnMain pattern
 * but adds an explicit fetch of the target branch before rebasing.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitPrService } from '@/infrastructure/services/git/git-pr.service';
import {
  GitPrError,
  GitPrErrorCode,
} from '@/application/ports/output/services/git-pr-service.interface';
import type { ExecFunction } from '@/infrastructure/services/git/worktree.service';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<object>('node:fs');
  return { ...actual, readFileSync: vi.fn() };
});

describe('GitPrService — rebaseOnBranch', () => {
  let mockExec: ExecFunction;
  let service: GitPrService;

  beforeEach(() => {
    mockExec = vi.fn();
    service = new GitPrService(mockExec);
  });

  it('should throw GIT_ERROR when worktree is dirty', async () => {
    // hasUncommittedChanges → git status --porcelain returns non-empty
    vi.mocked(mockExec).mockResolvedValueOnce({
      stdout: 'M src/file.ts\n',
      stderr: '',
    });

    const error = await service
      .rebaseOnBranch('/repo', 'feat/child', 'feat/parent')
      .catch((e) => e);
    expect(error).toBeInstanceOf(GitPrError);
    expect(error.code).toBe(GitPrErrorCode.GIT_ERROR);
    expect(error.message).toContain('uncommitted changes');
  });

  it('should fetch the target branch before rebasing', async () => {
    vi.mocked(mockExec)
      // hasUncommittedChanges → clean
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      // git fetch origin feat/parent
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      // git checkout feat/child
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      // git rebase origin/feat/parent → success
      .mockResolvedValueOnce({ stdout: 'Successfully rebased\n', stderr: '' });

    await service.rebaseOnBranch('/repo', 'feat/child', 'feat/parent');

    expect(mockExec).toHaveBeenCalledWith('git', ['fetch', 'origin', 'feat/parent'], {
      cwd: '/repo',
    });
  });

  it('should checkout the feature branch before rebasing', async () => {
    vi.mocked(mockExec)
      // hasUncommittedChanges → clean
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      // git fetch origin feat/parent
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      // git checkout feat/child
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      // git rebase origin/feat/parent → success
      .mockResolvedValueOnce({ stdout: '', stderr: '' });

    await service.rebaseOnBranch('/repo', 'feat/child', 'feat/parent');

    expect(mockExec).toHaveBeenCalledWith('git', ['checkout', 'feat/child'], {
      cwd: '/repo',
    });
  });

  it('should call git rebase with origin/<targetBranch> as target', async () => {
    vi.mocked(mockExec)
      // hasUncommittedChanges → clean
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      // git fetch origin feat/parent
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      // git checkout feat/child
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      // git rebase origin/feat/parent → success
      .mockResolvedValueOnce({ stdout: '', stderr: '' });

    await service.rebaseOnBranch('/repo', 'feat/child', 'feat/parent');

    expect(mockExec).toHaveBeenCalledWith('git', ['rebase', 'origin/feat/parent'], {
      cwd: '/repo',
    });
  });

  it('should succeed on clean rebase (no conflicts)', async () => {
    vi.mocked(mockExec)
      // hasUncommittedChanges → clean
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      // git fetch origin feat/parent
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      // git checkout feat/child
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      // git rebase origin/feat/parent → success
      .mockResolvedValueOnce({ stdout: 'Successfully rebased\n', stderr: '' });

    await expect(
      service.rebaseOnBranch('/repo', 'feat/child', 'feat/parent')
    ).resolves.toBeUndefined();
  });

  it('should throw REBASE_CONFLICT when rebase encounters conflicts', async () => {
    vi.mocked(mockExec)
      // hasUncommittedChanges → clean
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      // git fetch origin feat/parent
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      // git checkout feat/child
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      // git rebase → conflict
      .mockRejectedValueOnce(new Error('CONFLICT (content): Merge conflict in src/file.ts'))
      // getConflictedFiles → git diff --name-only --diff-filter=U
      .mockResolvedValueOnce({ stdout: 'src/file.ts\n', stderr: '' });

    const error = await service
      .rebaseOnBranch('/repo', 'feat/child', 'feat/parent')
      .catch((e) => e);
    expect(error).toBeInstanceOf(GitPrError);
    expect(error.code).toBe(GitPrErrorCode.REBASE_CONFLICT);
  });

  it('should include conflicted file list in REBASE_CONFLICT error message', async () => {
    vi.mocked(mockExec)
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockRejectedValueOnce(new Error('CONFLICT (content): Merge conflict in src/a.ts'))
      .mockResolvedValueOnce({ stdout: 'src/a.ts\nsrc/b.ts\n', stderr: '' });

    try {
      await service.rebaseOnBranch('/repo', 'feat/child', 'feat/parent');
    } catch (error) {
      expect((error as GitPrError).message).toContain('src/a.ts');
      expect((error as GitPrError).message).toContain('src/b.ts');
    }
  });

  it('should detect "could not apply" as rebase conflict', async () => {
    vi.mocked(mockExec)
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockRejectedValueOnce(new Error('error: could not apply abc1234... some commit'))
      .mockResolvedValueOnce({ stdout: '', stderr: '' });

    await expect(
      service.rebaseOnBranch('/repo', 'feat/child', 'feat/parent')
    ).rejects.toMatchObject({
      code: GitPrErrorCode.REBASE_CONFLICT,
    });
  });

  it('should throw BRANCH_NOT_FOUND when feature branch does not exist', async () => {
    vi.mocked(mockExec)
      // hasUncommittedChanges → clean
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      // git fetch origin feat/parent → success
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      // git checkout → pathspec error
      .mockRejectedValueOnce(
        new Error("error: pathspec 'feat/nonexistent' did not match any file(s)")
      );

    const error = await service
      .rebaseOnBranch('/repo', 'feat/nonexistent', 'feat/parent')
      .catch((e) => e);
    expect(error).toBeInstanceOf(GitPrError);
    expect(error.code).toBe(GitPrErrorCode.BRANCH_NOT_FOUND);
  });

  it('should throw descriptive error when fetch of target branch fails', async () => {
    vi.mocked(mockExec)
      // hasUncommittedChanges → clean
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      // git fetch origin feat/parent → fails
      .mockRejectedValueOnce(new Error("fatal: couldn't find remote ref feat/parent"));

    const error = await service
      .rebaseOnBranch('/repo', 'feat/child', 'feat/parent')
      .catch((e) => e);
    expect(error).toBeInstanceOf(GitPrError);
    expect(error.message).toContain('feat/parent');
    expect(error.message).toContain('fetch');
  });

  it('should throw generic GIT_ERROR on non-conflict rebase failure', async () => {
    vi.mocked(mockExec)
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      // git rebase fails with non-conflict error
      .mockRejectedValueOnce(new Error('fatal: some random git error'));

    const error = await service
      .rebaseOnBranch('/repo', 'feat/child', 'feat/parent')
      .catch((e) => e);
    expect(error).toBeInstanceOf(GitPrError);
    expect(error.code).toBe(GitPrErrorCode.GIT_ERROR);
  });

  it('should still throw REBASE_CONFLICT even if getConflictedFiles fails', async () => {
    vi.mocked(mockExec)
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockRejectedValueOnce(new Error('CONFLICT (content): Merge conflict in src/file.ts'))
      // getConflictedFiles also fails
      .mockRejectedValueOnce(new Error('git diff failed'));

    await expect(
      service.rebaseOnBranch('/repo', 'feat/child', 'feat/parent')
    ).rejects.toMatchObject({
      code: GitPrErrorCode.REBASE_CONFLICT,
    });
  });

  it('should execute steps in correct order: dirty check → fetch → checkout → rebase', async () => {
    const callOrder: string[] = [];
    vi.mocked(mockExec).mockImplementation(async (_cmd, args) => {
      const argStr = (args as string[]).join(' ');
      if (argStr.includes('status --porcelain')) callOrder.push('dirty-check');
      else if (argStr.includes('fetch origin')) callOrder.push('fetch');
      else if (argStr.includes('checkout')) callOrder.push('checkout');
      else if (argStr.includes('rebase')) callOrder.push('rebase');
      return { stdout: '', stderr: '' };
    });

    await service.rebaseOnBranch('/repo', 'feat/child', 'feat/parent');

    expect(callOrder).toEqual(['dirty-check', 'fetch', 'checkout', 'rebase']);
  });
});
