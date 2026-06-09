/**
 * GitPrService.createGitHubRepo Unit Tests
 *
 * TDD Phase: RED-GREEN
 * Tests for the createGitHubRepo method that creates a GitHub repository
 * via `gh repo create` with --source=. and --push for atomic setup.
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

describe('GitPrService.createGitHubRepo', () => {
  let mockExec: ExecFunction;
  let service: GitPrService;

  beforeEach(() => {
    mockExec = vi.fn();
    service = new GitPrService(mockExec);
  });

  it('should create a private repo with correct gh args', async () => {
    vi.mocked(mockExec).mockResolvedValue({
      stdout: 'https://github.com/user/my-repo\n',
      stderr: '',
    });

    await service.createGitHubRepo('/tmp/repo', 'my-repo', { isPrivate: true });

    expect(mockExec).toHaveBeenCalledWith(
      'gh',
      ['repo', 'create', 'my-repo', '--private', '--source=.', '--remote=origin', '--push'],
      { cwd: '/tmp/repo' }
    );
  });

  it('should create a public repo with --public flag', async () => {
    vi.mocked(mockExec).mockResolvedValue({
      stdout: 'https://github.com/user/my-repo\n',
      stderr: '',
    });

    await service.createGitHubRepo('/tmp/repo', 'my-repo', { isPrivate: false });

    expect(mockExec).toHaveBeenCalledWith(
      'gh',
      ['repo', 'create', 'my-repo', '--public', '--source=.', '--remote=origin', '--push'],
      { cwd: '/tmp/repo' }
    );
  });

  it('should prefix repo name with org when org option is provided', async () => {
    vi.mocked(mockExec).mockResolvedValue({
      stdout: 'https://github.com/myorg/my-repo\n',
      stderr: '',
    });

    await service.createGitHubRepo('/tmp/repo', 'my-repo', { isPrivate: true, org: 'myorg' });

    expect(mockExec).toHaveBeenCalledWith(
      'gh',
      ['repo', 'create', 'myorg/my-repo', '--private', '--source=.', '--remote=origin', '--push'],
      { cwd: '/tmp/repo' }
    );
  });

  it('should return the trimmed stdout as the repo URL', async () => {
    vi.mocked(mockExec).mockResolvedValue({
      stdout: 'https://github.com/user/my-repo\n',
      stderr: '',
    });

    const result = await service.createGitHubRepo('/tmp/repo', 'my-repo', { isPrivate: true });

    expect(result).toBe('https://github.com/user/my-repo');
  });

  it('should throw GitPrError with GH_NOT_FOUND when gh is not installed (ENOENT)', async () => {
    const error = new Error('spawn gh ENOENT');
    (error as NodeJS.ErrnoException).code = 'ENOENT';
    vi.mocked(mockExec).mockRejectedValue(error);

    await expect(
      service.createGitHubRepo('/tmp/repo', 'my-repo', { isPrivate: true })
    ).rejects.toThrow(GitPrError);
    await expect(
      service.createGitHubRepo('/tmp/repo', 'my-repo', { isPrivate: true })
    ).rejects.toMatchObject({
      code: GitPrErrorCode.GH_NOT_FOUND,
    });
  });

  it('should throw GitPrError with AUTH_FAILURE when gh is not authenticated', async () => {
    vi.mocked(mockExec).mockRejectedValue(
      new Error('gh: Authentication required. Run `gh auth login`.')
    );

    await expect(
      service.createGitHubRepo('/tmp/repo', 'my-repo', { isPrivate: true })
    ).rejects.toThrow(GitPrError);
    await expect(
      service.createGitHubRepo('/tmp/repo', 'my-repo', { isPrivate: true })
    ).rejects.toMatchObject({
      code: GitPrErrorCode.AUTH_FAILURE,
    });
  });

  it('should throw GitPrError with REPO_CREATE_FAILED on generic gh failure', async () => {
    vi.mocked(mockExec).mockRejectedValue(
      new Error('GraphQL: Name already exists on this account (createRepository)')
    );

    await expect(
      service.createGitHubRepo('/tmp/repo', 'my-repo', { isPrivate: true })
    ).rejects.toThrow(GitPrError);
    await expect(
      service.createGitHubRepo('/tmp/repo', 'my-repo', { isPrivate: true })
    ).rejects.toMatchObject({
      code: GitPrErrorCode.REPO_CREATE_FAILED,
    });
  });
});
