/**
 * InitRemoteRepositoryUseCase Unit Tests
 *
 * Tests for the use case that creates a GitHub repository from a local repo
 * that has no remote yet. Validates guards, option passing, and error handling.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InitRemoteRepositoryUseCase } from '@/application/use-cases/repositories/init-remote-repository.use-case.js';
import {
  GitPrError,
  GitPrErrorCode,
  type IGitPrService,
} from '@/application/ports/output/services/git-pr-service.interface.js';

describe('InitRemoteRepositoryUseCase', () => {
  let useCase: InitRemoteRepositoryUseCase;
  let mockGitPrService: IGitPrService;

  beforeEach(() => {
    mockGitPrService = {
      hasRemote: vi.fn<() => Promise<boolean>>().mockResolvedValue(false),
      getRemoteUrl: vi.fn<() => Promise<string | null>>().mockResolvedValue(null),
      createGitHubRepo: vi
        .fn<() => Promise<string>>()
        .mockResolvedValue('https://github.com/octocat/my-project'),
      addRemote: vi.fn().mockResolvedValue(undefined),
      pull: vi.fn().mockResolvedValue(undefined),
      getDefaultBranch: vi.fn().mockResolvedValue('main'),
      revParse: vi.fn().mockResolvedValue('abc123'),
      hasUncommittedChanges: vi.fn().mockResolvedValue(false),
      commitAll: vi.fn().mockResolvedValue('abc123'),
      push: vi.fn().mockResolvedValue(undefined),
      createPr: vi.fn().mockResolvedValue(undefined),
      mergePr: vi.fn().mockResolvedValue(undefined),
      mergeBranch: vi.fn().mockResolvedValue(undefined),
      getCiStatus: vi.fn().mockResolvedValue({ status: 'success' }),
      watchCi: vi.fn().mockResolvedValue({ status: 'success' }),
      deleteBranch: vi.fn().mockResolvedValue(undefined),
      getPrDiffSummary: vi
        .fn()
        .mockResolvedValue({ filesChanged: 0, additions: 0, deletions: 0, commitCount: 0 }),
      getFileDiffs: vi.fn().mockResolvedValue([]),
      listPrStatuses: vi.fn().mockResolvedValue([]),
      verifyMerge: vi.fn().mockResolvedValue(true),
      localMergeSquash: vi.fn().mockResolvedValue(undefined),
      getMergeableStatus: vi.fn().mockResolvedValue(true),
      getFailureLogs: vi.fn().mockResolvedValue(''),
      syncMain: vi.fn().mockResolvedValue(undefined),
      rebaseOnMain: vi.fn().mockResolvedValue(undefined),
      rebaseOnBranch: vi.fn().mockResolvedValue(undefined),
      getConflictedFiles: vi.fn().mockResolvedValue([]),
      stageFiles: vi.fn().mockResolvedValue(undefined),
      rebaseContinue: vi.fn().mockResolvedValue(undefined),
      rebaseAbort: vi.fn().mockResolvedValue(undefined),
      stash: vi.fn().mockResolvedValue(false),
      stashPop: vi.fn().mockResolvedValue(undefined),
      stashDrop: vi.fn().mockResolvedValue(undefined),
      getBranchSyncStatus: vi.fn().mockResolvedValue({ ahead: 0, behind: 0 }),
    };

    useCase = new InitRemoteRepositoryUseCase(mockGitPrService);
  });

  // ---------------------------------------------------------------------------
  // Successful creation
  // ---------------------------------------------------------------------------

  describe('successful creation', () => {
    it('should create a GitHub repo and return URL and name', async () => {
      const result = await useCase.execute({
        cwd: '/home/user/my-project',
        name: 'my-project',
      });

      expect(result.url).toBe('https://github.com/octocat/my-project');
      expect(result.name).toBe('my-project');
      expect(mockGitPrService.hasRemote).toHaveBeenCalledWith('/home/user/my-project');
      expect(mockGitPrService.createGitHubRepo).toHaveBeenCalledWith(
        '/home/user/my-project',
        'my-project',
        { isPrivate: true, org: undefined }
      );
    });

    it('should use directory basename when name is not provided', async () => {
      const result = await useCase.execute({
        cwd: '/home/user/repos/awesome-lib',
      });

      expect(result.name).toBe('awesome-lib');
      expect(mockGitPrService.createGitHubRepo).toHaveBeenCalledWith(
        '/home/user/repos/awesome-lib',
        'awesome-lib',
        { isPrivate: true, org: undefined }
      );
    });

    it('should default isPrivate to true when not specified', async () => {
      await useCase.execute({ cwd: '/repo' });

      expect(mockGitPrService.createGitHubRepo).toHaveBeenCalledWith(
        '/repo',
        expect.any(String),
        expect.objectContaining({ isPrivate: true })
      );
    });

    it('should pass isPrivate=false when explicitly set', async () => {
      await useCase.execute({
        cwd: '/repo',
        name: 'public-repo',
        isPrivate: false,
      });

      expect(mockGitPrService.createGitHubRepo).toHaveBeenCalledWith(
        '/repo',
        'public-repo',
        expect.objectContaining({ isPrivate: false })
      );
    });

    it('should pass org option when provided', async () => {
      await useCase.execute({
        cwd: '/repo',
        name: 'org-repo',
        org: 'my-org',
      });

      expect(mockGitPrService.createGitHubRepo).toHaveBeenCalledWith(
        '/repo',
        'org-repo',
        expect.objectContaining({ org: 'my-org' })
      );
    });

    it('should pass both isPrivate and org options together', async () => {
      await useCase.execute({
        cwd: '/repo',
        name: 'org-public-repo',
        isPrivate: false,
        org: 'my-org',
      });

      expect(mockGitPrService.createGitHubRepo).toHaveBeenCalledWith('/repo', 'org-public-repo', {
        isPrivate: false,
        org: 'my-org',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Guard: repo already has a remote
  // ---------------------------------------------------------------------------

  describe('remote guard', () => {
    it('should throw when repository already has a remote', async () => {
      vi.mocked(mockGitPrService.hasRemote).mockResolvedValue(true);
      vi.mocked(mockGitPrService.getRemoteUrl).mockResolvedValue('https://github.com/other/repo');

      await expect(useCase.execute({ cwd: '/repo', name: 'my-repo' })).rejects.toThrow(
        'Repository already has a remote configured'
      );
    });

    it('should include existing remote URL in the error message when available', async () => {
      vi.mocked(mockGitPrService.hasRemote).mockResolvedValue(true);
      vi.mocked(mockGitPrService.getRemoteUrl).mockResolvedValue('https://github.com/other/repo');

      await expect(useCase.execute({ cwd: '/repo', name: 'my-repo' })).rejects.toThrow(
        '(https://github.com/other/repo)'
      );
    });

    it('should throw without URL in message when getRemoteUrl returns null', async () => {
      vi.mocked(mockGitPrService.hasRemote).mockResolvedValue(true);
      vi.mocked(mockGitPrService.getRemoteUrl).mockResolvedValue(null);

      await expect(useCase.execute({ cwd: '/repo', name: 'my-repo' })).rejects.toThrow(
        'Repository already has a remote configured.'
      );
    });

    it('should not call createGitHubRepo when remote already exists', async () => {
      vi.mocked(mockGitPrService.hasRemote).mockResolvedValue(true);

      await expect(useCase.execute({ cwd: '/repo' })).rejects.toThrow();

      expect(mockGitPrService.createGitHubRepo).not.toHaveBeenCalled();
    });

    it('should suggest git remote set-url in the error message', async () => {
      vi.mocked(mockGitPrService.hasRemote).mockResolvedValue(true);
      vi.mocked(mockGitPrService.getRemoteUrl).mockResolvedValue(null);

      await expect(useCase.execute({ cwd: '/repo' })).rejects.toThrow(
        'git remote set-url origin <url>'
      );
    });

    it('should throw a GitPrError with REMOTE_ALREADY_EXISTS code', async () => {
      vi.mocked(mockGitPrService.hasRemote).mockResolvedValue(true);
      vi.mocked(mockGitPrService.getRemoteUrl).mockResolvedValue('https://github.com/other/repo');

      try {
        await useCase.execute({ cwd: '/repo', name: 'my-repo' });
        expect.fail('Expected GitPrError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(GitPrError);
        expect((error as GitPrError).code).toBe(GitPrErrorCode.REMOTE_ALREADY_EXISTS);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Name derivation
  // ---------------------------------------------------------------------------

  describe('name derivation', () => {
    it('should prefer explicit name over directory basename', async () => {
      const result = await useCase.execute({
        cwd: '/home/user/some-dir',
        name: 'custom-name',
      });

      expect(result.name).toBe('custom-name');
      expect(mockGitPrService.createGitHubRepo).toHaveBeenCalledWith(
        expect.any(String),
        'custom-name',
        expect.any(Object)
      );
    });

    it('should derive name from nested directory path', async () => {
      const result = await useCase.execute({
        cwd: '/deeply/nested/path/to/project',
      });

      expect(result.name).toBe('project');
    });
  });
});
