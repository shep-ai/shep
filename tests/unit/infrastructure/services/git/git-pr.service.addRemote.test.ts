/**
 * GitPrService.addRemote Unit Tests
 *
 * TDD Phase: RED-GREEN
 * Tests for the addRemote method that adds a git remote
 * via `git remote add <name> <url>`.
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

describe('GitPrService.addRemote', () => {
  let mockExec: ExecFunction;
  let service: GitPrService;

  beforeEach(() => {
    mockExec = vi.fn();
    service = new GitPrService(mockExec);
  });

  it('should call git remote add with correct arguments', async () => {
    vi.mocked(mockExec).mockResolvedValue({ stdout: '', stderr: '' });

    await service.addRemote('/tmp/repo', 'origin', 'https://github.com/user/repo.git');

    expect(mockExec).toHaveBeenCalledWith(
      'git',
      ['remote', 'add', 'origin', 'https://github.com/user/repo.git'],
      { cwd: '/tmp/repo' }
    );
  });

  it('should resolve without returning a value on success', async () => {
    vi.mocked(mockExec).mockResolvedValue({ stdout: '', stderr: '' });

    const result = await service.addRemote(
      '/tmp/repo',
      'upstream',
      'https://github.com/org/repo.git'
    );

    expect(result).toBeUndefined();
  });

  it('should throw GitPrError with GIT_ERROR code when git remote add fails', async () => {
    vi.mocked(mockExec).mockRejectedValue(new Error('fatal: remote origin already exists.'));

    await expect(
      service.addRemote('/tmp/repo', 'origin', 'https://github.com/user/repo.git')
    ).rejects.toThrow(GitPrError);
    await expect(
      service.addRemote('/tmp/repo', 'origin', 'https://github.com/user/repo.git')
    ).rejects.toMatchObject({
      code: GitPrErrorCode.GIT_ERROR,
    });
  });
});
