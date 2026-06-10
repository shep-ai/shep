/**
 * ImportGitHubRepositoryUseCase Unit Tests
 *
 * Tests for the GitHub repository import use case.
 * Uses mock services for IGitHubRepositoryService, IRepositoryRepository,
 * and AddRepositoryUseCase.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImportGitHubRepositoryUseCase } from '@/application/use-cases/repositories/import-github-repository.use-case.js';
import type { IGitHubRepositoryService } from '@/application/ports/output/services/github-repository-service.interface.js';
import {
  GitHubAuthError,
  GitHubUrlParseError,
} from '@/application/ports/output/services/github-repository-service.interface.js';
import type { IGitPrService } from '@/application/ports/output/services/git-pr-service.interface.js';
import type { IRepositoryRepository } from '@/application/ports/output/repositories/repository-repository.interface.js';
import type { AddRepositoryUseCase } from '@/application/use-cases/repositories/add-repository.use-case.js';
import type { Repository } from '@/domain/generated/output.js';

vi.mock('node:fs', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, existsSync: vi.fn().mockReturnValue(false) };
});

import { existsSync } from 'node:fs';

function createMockRepository(overrides?: Partial<Repository>): Repository {
  return {
    id: 'repo-1',
    name: 'my-project',
    path: '/home/user/repos/my-project',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

describe('ImportGitHubRepositoryUseCase', () => {
  let useCase: ImportGitHubRepositoryUseCase;
  let mockGitHubService: IGitHubRepositoryService;
  let mockRepoRepository: IRepositoryRepository;
  let mockAddRepoUseCase: AddRepositoryUseCase;
  let mockGitPrService: IGitPrService;

  beforeEach(() => {
    mockGitHubService = {
      checkAuth: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      cloneRepository: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      listUserRepositories: vi.fn().mockResolvedValue([]),
      listOrganizations: vi.fn().mockResolvedValue([]),
      parseGitHubUrl: vi.fn().mockReturnValue({
        owner: 'octocat',
        repo: 'my-project',
        nameWithOwner: 'octocat/my-project',
      }),
      getViewerPermission: vi.fn().mockResolvedValue('ADMIN'),
      getAuthenticatedUser: vi.fn().mockResolvedValue('octocat'),
      checkPushAccess: vi.fn().mockResolvedValue({ hasPushAccess: true, viewerLogin: 'octocat' }),
      forkRepository: vi
        .fn()
        .mockResolvedValue({ nameWithOwner: 'octocat/my-project', alreadyExisted: false }),
      auditRepositoryGovernance: vi.fn().mockResolvedValue([]),
    };

    mockRepoRepository = {
      create: vi.fn(),
      findById: vi.fn(),
      findByPath: vi.fn(),
      findByPathIncludingDeleted: vi.fn(),
      findByRemoteUrl: vi.fn<() => Promise<Repository | null>>().mockResolvedValue(null),
      findByUpstreamUrl: vi.fn<() => Promise<Repository | null>>().mockResolvedValue(null),
      list: vi.fn(),
      remove: vi.fn(),
      softDelete: vi.fn(),
      restore: vi.fn(),
      update: vi
        .fn<(id: string, fields: Partial<Repository>) => Promise<Repository>>()
        .mockImplementation(async (id, fields) => {
          return createMockRepository({ id, ...fields });
        }),
    };

    mockAddRepoUseCase = {
      execute: vi.fn<() => Promise<Repository>>().mockResolvedValue(createMockRepository()),
    } as unknown as AddRepositoryUseCase;

    mockGitPrService = {
      addRemote: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      getRemoteUrl: vi.fn<() => Promise<string | null>>().mockResolvedValue(null),
      pull: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    } as unknown as IGitPrService;

    useCase = new ImportGitHubRepositoryUseCase(
      mockGitHubService,
      mockRepoRepository,
      mockAddRepoUseCase,
      mockGitPrService
    );
  });

  describe('successful import', () => {
    it('should clone and register a repository with a valid URL', async () => {
      const result = await useCase.execute({
        url: 'https://github.com/octocat/my-project',
      });

      expect(mockGitHubService.parseGitHubUrl).toHaveBeenCalledWith(
        'https://github.com/octocat/my-project'
      );
      expect(mockGitHubService.checkAuth).toHaveBeenCalled();
      expect(mockGitHubService.cloneRepository).toHaveBeenCalled();
      expect(mockAddRepoUseCase.execute).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.id).toBe('repo-1');
    });

    it('should use dest when provided', async () => {
      await useCase.execute({
        url: 'https://github.com/octocat/my-project',
        dest: '/custom/path',
      });

      expect(mockGitHubService.cloneRepository).toHaveBeenCalledWith(
        'octocat/my-project',
        '/custom/path',
        undefined
      );
      expect(mockAddRepoUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/custom/path' })
      );
    });

    it('should use defaultCloneDir/repoName when dest is not provided', async () => {
      await useCase.execute({
        url: 'https://github.com/octocat/my-project',
        defaultCloneDir: '/home/user/repos',
      });

      // Destination is normalised to forward slashes for cross-platform
      // consistency — see Fix #15. `join()` on Windows would produce backslashes,
      // so we assert the normalised form directly instead.
      expect(mockGitHubService.cloneRepository).toHaveBeenCalledWith(
        'octocat/my-project',
        '/home/user/repos/my-project',
        undefined
      );
    });

    it('should fall back to ~/repos/repoName when no dest or defaultCloneDir', async () => {
      await useCase.execute({
        url: 'https://github.com/octocat/my-project',
      });

      // The clone destination should end with the repo name (platform-agnostic separator)
      const cloneCall = vi.mocked(mockGitHubService.cloneRepository).mock.calls[0];
      expect(cloneCall[1]).toMatch(/[/\\]my-project$/);
    });

    it('should call AddRepositoryUseCase with the cloned path', async () => {
      await useCase.execute({
        url: 'https://github.com/octocat/my-project',
        dest: '/repos/my-project',
      });

      expect(mockAddRepoUseCase.execute).toHaveBeenCalledWith({
        path: '/repos/my-project',
        name: 'my-project',
      });
    });

    it('should update repository with normalized remoteUrl after registration', async () => {
      vi.mocked(mockAddRepoUseCase.execute).mockResolvedValue(
        createMockRepository({ id: 'new-repo-id' })
      );

      await useCase.execute({
        url: 'https://github.com/octocat/my-project',
      });

      expect(mockRepoRepository.update).toHaveBeenCalledWith('new-repo-id', {
        remoteUrl: 'https://github.com/octocat/my-project',
      });
    });
  });

  describe('URL normalization', () => {
    it('should normalize remoteUrl to lowercase and strip .git suffix', async () => {
      vi.mocked(mockGitHubService.parseGitHubUrl).mockReturnValue({
        owner: 'Octocat',
        repo: 'My-Project',
        nameWithOwner: 'Octocat/My-Project',
      });
      vi.mocked(mockAddRepoUseCase.execute).mockResolvedValue(
        createMockRepository({ id: 'new-id' })
      );

      await useCase.execute({
        url: 'https://github.com/Octocat/My-Project.git',
      });

      expect(mockRepoRepository.update).toHaveBeenCalledWith('new-id', {
        remoteUrl: 'https://github.com/octocat/my-project',
      });
    });
  });

  describe('duplicate detection', () => {
    it('should return existing repo when remoteUrl is already tracked', async () => {
      const existingRepo = createMockRepository({
        id: 'existing-id',
        remoteUrl: 'https://github.com/octocat/my-project',
      });
      vi.mocked(mockRepoRepository.findByRemoteUrl).mockResolvedValue(existingRepo);

      const result = await useCase.execute({
        url: 'https://github.com/octocat/my-project',
      });

      expect(result).toBe(existingRepo);
      expect(mockGitHubService.cloneRepository).not.toHaveBeenCalled();
      expect(mockAddRepoUseCase.execute).not.toHaveBeenCalled();
    });

    it('should return existing fork when upstream URL matches', async () => {
      const existingFork = createMockRepository({
        id: 'fork-id',
        isFork: true,
        upstreamUrl: 'https://github.com/octocat/my-project',
        remoteUrl: 'https://github.com/myuser/my-project',
      });
      vi.mocked(mockRepoRepository.findByUpstreamUrl).mockResolvedValue(existingFork);

      const result = await useCase.execute({
        url: 'https://github.com/octocat/my-project',
      });

      expect(result).toBe(existingFork);
      expect(mockGitHubService.cloneRepository).not.toHaveBeenCalled();
    });
  });

  describe('auto-fork', () => {
    beforeEach(() => {
      vi.mocked(mockGitHubService.checkPushAccess).mockResolvedValue({
        hasPushAccess: false,
        viewerLogin: 'myuser',
      });
    });

    it('should fork and clone when user lacks push access', async () => {
      vi.mocked(mockGitHubService.forkRepository).mockResolvedValue({
        nameWithOwner: 'myuser/my-project',
        alreadyExisted: false,
      });
      vi.mocked(mockAddRepoUseCase.execute).mockResolvedValue(
        createMockRepository({ id: 'fork-repo-id' })
      );

      const result = await useCase.execute({
        url: 'https://github.com/octocat/my-project',
        dest: '/repos/my-project',
      });

      // Should fork the repo
      expect(mockGitHubService.forkRepository).toHaveBeenCalledWith(
        'octocat/my-project',
        undefined
      );

      // Should clone the fork, not the original
      expect(mockGitHubService.cloneRepository).toHaveBeenCalledWith(
        'myuser/my-project',
        '/repos/my-project',
        undefined
      );

      // Should set upstream remote
      expect(mockGitPrService.addRemote).toHaveBeenCalledWith(
        '/repos/my-project',
        'upstream',
        'https://github.com/octocat/my-project'
      );

      // Should update with fork metadata
      expect(mockRepoRepository.update).toHaveBeenCalledWith('fork-repo-id', {
        remoteUrl: 'https://github.com/myuser/my-project',
        isFork: true,
        upstreamUrl: 'https://github.com/octocat/my-project',
      });

      expect(result.isFork).toBe(true);
      expect(result.upstreamUrl).toBe('https://github.com/octocat/my-project');
    });

    it('should not fork when user has push access', async () => {
      vi.mocked(mockGitHubService.checkPushAccess).mockResolvedValue({
        hasPushAccess: true,
        viewerLogin: 'octocat',
      });

      await useCase.execute({
        url: 'https://github.com/octocat/my-project',
        dest: '/repos/my-project',
      });

      expect(mockGitHubService.forkRepository).not.toHaveBeenCalled();
      expect(mockGitHubService.cloneRepository).toHaveBeenCalledWith(
        'octocat/my-project',
        '/repos/my-project',
        undefined
      );
    });

    it('should handle already-existing fork gracefully', async () => {
      vi.mocked(mockGitHubService.forkRepository).mockResolvedValue({
        nameWithOwner: 'myuser/my-project',
        alreadyExisted: true,
      });
      vi.mocked(mockAddRepoUseCase.execute).mockResolvedValue(
        createMockRepository({ id: 'fork-repo-id' })
      );

      const result = await useCase.execute({
        url: 'https://github.com/octocat/my-project',
        dest: '/repos/my-project',
      });

      expect(result.isFork).toBe(true);
    });

    it('should skip clone if fork is already imported by remoteUrl', async () => {
      const existingFork = createMockRepository({
        id: 'existing-fork',
        isFork: true,
        remoteUrl: 'https://github.com/myuser/my-project',
      });

      // First findByRemoteUrl returns null (original URL), findByUpstreamUrl returns null
      // After fork, findByRemoteUrl for fork URL returns existing
      vi.mocked(mockRepoRepository.findByRemoteUrl)
        .mockResolvedValueOnce(null) // for original URL
        .mockResolvedValueOnce(existingFork); // for fork URL

      const result = await useCase.execute({
        url: 'https://github.com/octocat/my-project',
      });

      expect(result).toBe(existingFork);
      expect(mockGitHubService.cloneRepository).not.toHaveBeenCalled();
    });

    it('should pass forkOptions to forkRepository', async () => {
      const onProgress = vi.fn();
      vi.mocked(mockAddRepoUseCase.execute).mockResolvedValue(
        createMockRepository({ id: 'fork-repo-id' })
      );

      await useCase.execute({
        url: 'https://github.com/octocat/my-project',
        dest: '/repos/my-project',
        forkOptions: { onProgress },
      });

      expect(mockGitHubService.forkRepository).toHaveBeenCalledWith('octocat/my-project', {
        onProgress,
      });
    });
  });

  describe('error handling', () => {
    it('should throw GitHubUrlParseError for invalid URL', async () => {
      vi.mocked(mockGitHubService.parseGitHubUrl).mockImplementation(() => {
        throw new GitHubUrlParseError('Invalid GitHub URL: not-a-url');
      });

      await expect(useCase.execute({ url: 'not-a-url' })).rejects.toThrow(GitHubUrlParseError);
    });

    it('should throw GitHubAuthError when not authenticated', async () => {
      vi.mocked(mockGitHubService.checkAuth).mockRejectedValue(
        new GitHubAuthError('GitHub CLI is not authenticated')
      );

      await expect(
        useCase.execute({ url: 'https://github.com/octocat/my-project' })
      ).rejects.toThrow(GitHubAuthError);
      expect(mockGitHubService.cloneRepository).not.toHaveBeenCalled();
    });

    it('should call checkAuth before cloning', async () => {
      const callOrder: string[] = [];
      vi.mocked(mockGitHubService.checkAuth).mockImplementation(async () => {
        callOrder.push('checkAuth');
      });
      vi.mocked(mockGitHubService.cloneRepository).mockImplementation(async () => {
        callOrder.push('cloneRepository');
      });

      await useCase.execute({ url: 'https://github.com/octocat/my-project' });

      expect(callOrder.indexOf('checkAuth')).toBeLessThan(callOrder.indexOf('cloneRepository'));
    });
  });

  describe('clone options', () => {
    it('should pass cloneOptions through to cloneRepository', async () => {
      const onProgress = vi.fn();

      await useCase.execute({
        url: 'https://github.com/octocat/my-project',
        dest: '/repos/my-project',
        cloneOptions: { onProgress },
      });

      expect(mockGitHubService.cloneRepository).toHaveBeenCalledWith(
        'octocat/my-project',
        '/repos/my-project',
        { onProgress }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Push access check and direct clone path
  // ---------------------------------------------------------------------------

  describe('push access — direct clone', () => {
    it('should clone directly when user has push access', async () => {
      vi.mocked(mockGitHubService.checkPushAccess).mockResolvedValue({
        hasPushAccess: true,
        viewerLogin: 'octocat',
      });

      const result = await useCase.execute({
        url: 'https://github.com/octocat/my-project',
        dest: '/repos/my-project',
      });

      expect(mockGitHubService.checkPushAccess).toHaveBeenCalledWith('octocat/my-project');
      expect(mockGitHubService.cloneRepository).toHaveBeenCalledWith(
        'octocat/my-project',
        '/repos/my-project',
        undefined
      );
      expect(mockGitHubService.forkRepository).not.toHaveBeenCalled();
      expect(result.id).toBe('repo-1');
    });

    it('should update remoteUrl on the repository after direct clone', async () => {
      vi.mocked(mockGitHubService.checkPushAccess).mockResolvedValue({
        hasPushAccess: true,
        viewerLogin: 'octocat',
      });
      vi.mocked(mockAddRepoUseCase.execute).mockResolvedValue(
        createMockRepository({ id: 'direct-repo-id' })
      );

      const result = await useCase.execute({
        url: 'https://github.com/octocat/my-project',
      });

      expect(mockRepoRepository.update).toHaveBeenCalledWith('direct-repo-id', {
        remoteUrl: 'https://github.com/octocat/my-project',
      });
      expect(result.remoteUrl).toBe('https://github.com/octocat/my-project');
    });

    it('should NOT configure an upstream remote on direct clone', async () => {
      vi.mocked(mockGitHubService.checkPushAccess).mockResolvedValue({
        hasPushAccess: true,
        viewerLogin: 'octocat',
      });

      await useCase.execute({
        url: 'https://github.com/octocat/my-project',
        dest: '/repos/my-project',
      });

      expect(mockGitPrService.addRemote).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Fork path — user lacks push access
  // ---------------------------------------------------------------------------

  describe('push access — fork and clone', () => {
    beforeEach(() => {
      vi.mocked(mockGitHubService.checkPushAccess).mockResolvedValue({
        hasPushAccess: false,
        viewerLogin: 'contributor',
      });
      vi.mocked(mockGitHubService.forkRepository).mockResolvedValue({
        nameWithOwner: 'contributor/my-project',
        alreadyExisted: false,
      });
    });

    it('should fork then clone when user lacks push access', async () => {
      const result = await useCase.execute({
        url: 'https://github.com/octocat/my-project',
        dest: '/repos/my-project',
      });

      expect(mockGitHubService.forkRepository).toHaveBeenCalledWith(
        'octocat/my-project',
        undefined
      );
      expect(mockGitHubService.cloneRepository).toHaveBeenCalledWith(
        'contributor/my-project',
        '/repos/my-project',
        undefined
      );
      expect(result).toBeDefined();
    });

    it('should update repository with fork metadata (remoteUrl, isFork, upstreamUrl)', async () => {
      vi.mocked(mockAddRepoUseCase.execute).mockResolvedValue(
        createMockRepository({ id: 'fork-repo-id' })
      );

      const result = await useCase.execute({
        url: 'https://github.com/octocat/my-project',
      });

      expect(mockRepoRepository.update).toHaveBeenCalledWith('fork-repo-id', {
        remoteUrl: 'https://github.com/contributor/my-project',
        isFork: true,
        upstreamUrl: 'https://github.com/octocat/my-project',
      });
      expect(result.isFork).toBe(true);
      expect(result.upstreamUrl).toBe('https://github.com/octocat/my-project');
      expect(result.remoteUrl).toBe('https://github.com/contributor/my-project');
    });

    it('should configure upstream remote pointing at the original repo', async () => {
      await useCase.execute({
        url: 'https://github.com/octocat/my-project',
        dest: '/repos/my-project',
      });

      expect(mockGitPrService.addRemote).toHaveBeenCalledWith(
        '/repos/my-project',
        'upstream',
        'https://github.com/octocat/my-project'
      );
    });

    it('should configure upstream remote after cloning the fork, not before', async () => {
      const callOrder: string[] = [];
      vi.mocked(mockGitHubService.cloneRepository).mockImplementation(async () => {
        callOrder.push('cloneRepository');
      });
      vi.mocked(mockGitPrService.addRemote).mockImplementation(async () => {
        callOrder.push('addRemote');
      });

      await useCase.execute({
        url: 'https://github.com/octocat/my-project',
        dest: '/repos/my-project',
      });

      expect(callOrder.indexOf('cloneRepository')).toBeLessThan(callOrder.indexOf('addRemote'));
    });

    it('should NOT configure upstream remote when the fork is already tracked', async () => {
      const existingFork = createMockRepository({
        id: 'existing-fork-id',
        remoteUrl: 'https://github.com/contributor/my-project',
        isFork: true,
        upstreamUrl: 'https://github.com/octocat/my-project',
      });
      vi.mocked(mockRepoRepository.findByRemoteUrl)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingFork);

      await useCase.execute({
        url: 'https://github.com/octocat/my-project',
      });

      expect(mockGitPrService.addRemote).not.toHaveBeenCalled();
    });

    it('should pass forkOptions through to forkRepository', async () => {
      const onProgress = vi.fn();

      await useCase.execute({
        url: 'https://github.com/octocat/my-project',
        forkOptions: { onProgress },
      });

      expect(mockGitHubService.forkRepository).toHaveBeenCalledWith('octocat/my-project', {
        onProgress,
      });
    });

    it('should pass cloneOptions through when cloning the fork', async () => {
      const onProgress = vi.fn();

      await useCase.execute({
        url: 'https://github.com/octocat/my-project',
        dest: '/repos/my-project',
        cloneOptions: { onProgress },
      });

      expect(mockGitHubService.cloneRepository).toHaveBeenCalledWith(
        'contributor/my-project',
        '/repos/my-project',
        { onProgress }
      );
    });

    it('should return existing repo when fork remoteUrl is already tracked', async () => {
      const existingFork = createMockRepository({
        id: 'existing-fork-id',
        remoteUrl: 'https://github.com/contributor/my-project',
        isFork: true,
        upstreamUrl: 'https://github.com/octocat/my-project',
      });
      // The fork already has its remoteUrl tracked in the database
      vi.mocked(mockRepoRepository.findByRemoteUrl)
        .mockResolvedValueOnce(null) // First call: original URL not tracked
        .mockResolvedValueOnce(existingFork); // Second call: fork URL already tracked

      const result = await useCase.execute({
        url: 'https://github.com/octocat/my-project',
      });

      expect(result).toBe(existingFork);
      // Should have forked (to get the fork nameWithOwner) but not cloned
      expect(mockGitHubService.forkRepository).toHaveBeenCalled();
      expect(mockGitHubService.cloneRepository).not.toHaveBeenCalled();
      expect(mockAddRepoUseCase.execute).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Duplicate detection via upstreamUrl (fork already imported)
  // ---------------------------------------------------------------------------

  describe('duplicate detection — upstreamUrl', () => {
    it('should return existing repo when upstreamUrl matches (fork of this repo already imported)', async () => {
      const existingFork = createMockRepository({
        id: 'existing-fork-via-upstream',
        remoteUrl: 'https://github.com/contributor/my-project',
        isFork: true,
        upstreamUrl: 'https://github.com/octocat/my-project',
      });
      // findByRemoteUrl returns null (original URL not tracked as remoteUrl)
      vi.mocked(mockRepoRepository.findByRemoteUrl).mockResolvedValue(null);
      // findByUpstreamUrl returns existing fork
      vi.mocked(mockRepoRepository.findByUpstreamUrl).mockResolvedValue(existingFork);

      const result = await useCase.execute({
        url: 'https://github.com/octocat/my-project',
      });

      expect(result).toBe(existingFork);
      // Should not proceed to checkAuth or clone
      expect(mockGitHubService.checkAuth).not.toHaveBeenCalled();
      expect(mockGitHubService.cloneRepository).not.toHaveBeenCalled();
      expect(mockGitHubService.forkRepository).not.toHaveBeenCalled();
    });

    it('should check findByUpstreamUrl only after findByRemoteUrl returns null', async () => {
      const callOrder: string[] = [];
      vi.mocked(mockRepoRepository.findByRemoteUrl).mockImplementation(async () => {
        callOrder.push('findByRemoteUrl');
        return null;
      });
      vi.mocked(mockRepoRepository.findByUpstreamUrl).mockImplementation(async () => {
        callOrder.push('findByUpstreamUrl');
        return null;
      });

      await useCase.execute({ url: 'https://github.com/octocat/my-project' });

      expect(callOrder.indexOf('findByRemoteUrl')).toBeLessThan(
        callOrder.indexOf('findByUpstreamUrl')
      );
    });

    it('should skip upstreamUrl check when findByRemoteUrl returns a match', async () => {
      const existing = createMockRepository({ id: 'direct-match' });
      vi.mocked(mockRepoRepository.findByRemoteUrl).mockResolvedValue(existing);

      await useCase.execute({ url: 'https://github.com/octocat/my-project' });

      expect(mockRepoRepository.findByUpstreamUrl).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Tilde expansion in defaultCloneDir
  // ---------------------------------------------------------------------------

  describe('tilde expansion', () => {
    it('should expand ~/path to homedir-based path', async () => {
      await useCase.execute({
        url: 'https://github.com/octocat/my-project',
        defaultCloneDir: '~/my-repos',
      });

      const cloneCall = vi.mocked(mockGitHubService.cloneRepository).mock.calls[0];
      // Should not start with ~
      expect(cloneCall[1]).not.toMatch(/^~/);
      // Should end with my-repos/my-project
      expect(cloneCall[1]).toMatch(/[/\\]my-repos[/\\]my-project$/);
    });
  });

  // ---------------------------------------------------------------------------
  // Existing directory handling
  // ---------------------------------------------------------------------------

  describe('existing directory handling', () => {
    it('should pull instead of clone when destination exists with same remote', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(mockGitPrService.getRemoteUrl).mockResolvedValue(
        'https://github.com/octocat/my-project'
      );

      await useCase.execute({
        url: 'https://github.com/octocat/my-project',
        dest: '/repos/my-project',
      });

      expect(mockGitPrService.getRemoteUrl).toHaveBeenCalledWith('/repos/my-project');
      expect(mockGitPrService.pull).toHaveBeenCalledWith('/repos/my-project');
      expect(mockGitHubService.cloneRepository).not.toHaveBeenCalled();
    });

    it('should clone to suffixed directory when destination exists with different remote', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(mockGitPrService.getRemoteUrl).mockResolvedValue(
        'https://github.com/other-org/different-repo'
      );

      await useCase.execute({
        url: 'https://github.com/octocat/my-project',
        dest: '/repos/my-project',
      });

      // Should have cloned to a different directory (with hash suffix)
      const cloneCall = vi.mocked(mockGitHubService.cloneRepository).mock.calls[0];
      expect(cloneCall[1]).toMatch(/^\/repos\/my-project-[a-f0-9]{6}$/);
      expect(mockGitPrService.pull).not.toHaveBeenCalled();
    });

    it('should clone to suffixed directory when destination exists but is not a git repo', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(mockGitPrService.getRemoteUrl).mockResolvedValue(null);

      await useCase.execute({
        url: 'https://github.com/octocat/my-project',
        dest: '/repos/my-project',
      });

      const cloneCall = vi.mocked(mockGitHubService.cloneRepository).mock.calls[0];
      expect(cloneCall[1]).toMatch(/^\/repos\/my-project-[a-f0-9]{6}$/);
      expect(mockGitPrService.pull).not.toHaveBeenCalled();
    });

    it('should treat remotes as same regardless of .git suffix and case', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(mockGitPrService.getRemoteUrl).mockResolvedValue(
        'https://github.com/Octocat/My-Project.git'
      );

      await useCase.execute({
        url: 'https://github.com/octocat/my-project',
        dest: '/repos/my-project',
      });

      expect(mockGitPrService.pull).toHaveBeenCalled();
      expect(mockGitHubService.cloneRepository).not.toHaveBeenCalled();
    });

    it('should clone normally when destination does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      await useCase.execute({
        url: 'https://github.com/octocat/my-project',
        dest: '/repos/my-project',
      });

      expect(mockGitHubService.cloneRepository).toHaveBeenCalledWith(
        'octocat/my-project',
        '/repos/my-project',
        undefined
      );
      expect(mockGitPrService.getRemoteUrl).not.toHaveBeenCalled();
      expect(mockGitPrService.pull).not.toHaveBeenCalled();
    });
  });
});
