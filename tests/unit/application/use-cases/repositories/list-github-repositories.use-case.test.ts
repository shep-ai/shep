/**
 * ListGitHubRepositoriesUseCase Unit Tests
 *
 * Tests for listing authenticated user's GitHub repositories.
 * Uses mock IGitHubRepositoryService.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListGitHubRepositoriesUseCase } from '@/application/use-cases/repositories/list-github-repositories.use-case.js';
import type {
  IGitHubRepositoryService,
  GitHubRepo,
} from '@/application/ports/output/services/github-repository-service.interface.js';
import {
  GitHubAuthError,
  GitHubRepoListError,
} from '@/application/ports/output/services/github-repository-service.interface.js';

function createMockRepo(overrides?: Partial<GitHubRepo>): GitHubRepo {
  return {
    name: 'my-project',
    nameWithOwner: 'octocat/my-project',
    description: 'A sample project',
    isPrivate: false,
    pushedAt: '2025-01-15T10:30:00Z',
    ...overrides,
  };
}

describe('ListGitHubRepositoriesUseCase', () => {
  let useCase: ListGitHubRepositoriesUseCase;
  let mockGitHubService: IGitHubRepositoryService;

  beforeEach(() => {
    mockGitHubService = {
      checkAuth: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      cloneRepository: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      listUserRepositories: vi
        .fn<() => Promise<GitHubRepo[]>>()
        .mockResolvedValue([createMockRepo()]),
      listOrganizations: vi.fn().mockResolvedValue([]),
      parseGitHubUrl: vi.fn(),
      getViewerPermission: vi.fn().mockResolvedValue('ADMIN'),
      getAuthenticatedUser: vi.fn().mockResolvedValue('octocat'),
      checkPushAccess: vi.fn().mockResolvedValue({ hasPushAccess: true, viewerLogin: 'octocat' }),
      forkRepository: vi
        .fn()
        .mockResolvedValue({ nameWithOwner: 'octocat/my-project', alreadyExisted: false }),
    };

    useCase = new ListGitHubRepositoriesUseCase(mockGitHubService);
  });

  it('should call checkAuth before listing repos', async () => {
    const callOrder: string[] = [];
    vi.mocked(mockGitHubService.checkAuth).mockImplementation(async () => {
      callOrder.push('checkAuth');
    });
    vi.mocked(mockGitHubService.listUserRepositories).mockImplementation(async () => {
      callOrder.push('listUserRepositories');
      return [createMockRepo()];
    });

    await useCase.execute();

    expect(callOrder).toEqual(['checkAuth', 'listUserRepositories']);
  });

  it('should return repos from service', async () => {
    const repos = [
      createMockRepo({ name: 'repo-a', nameWithOwner: 'octocat/repo-a' }),
      createMockRepo({ name: 'repo-b', nameWithOwner: 'octocat/repo-b', isPrivate: true }),
    ];
    vi.mocked(mockGitHubService.listUserRepositories).mockResolvedValue(repos);

    const result = await useCase.execute();

    expect(result).toEqual(repos);
    expect(result).toHaveLength(2);
  });

  it('should pass search and limit options to service', async () => {
    await useCase.execute({ search: 'react', limit: 10 });

    expect(mockGitHubService.listUserRepositories).toHaveBeenCalledWith({
      search: 'react',
      limit: 10,
    });
  });

  it('should call listUserRepositories with undefined when no options provided', async () => {
    await useCase.execute();

    expect(mockGitHubService.listUserRepositories).toHaveBeenCalledWith(undefined);
  });

  it('should propagate GitHubAuthError when not authenticated', async () => {
    vi.mocked(mockGitHubService.checkAuth).mockRejectedValue(
      new GitHubAuthError('GitHub CLI is not authenticated. Run `gh auth login` to sign in.')
    );

    await expect(useCase.execute()).rejects.toThrow(GitHubAuthError);
    expect(mockGitHubService.listUserRepositories).not.toHaveBeenCalled();
  });

  it('should propagate GitHubRepoListError when listing fails', async () => {
    vi.mocked(mockGitHubService.listUserRepositories).mockRejectedValue(
      new GitHubRepoListError('Failed to list repositories')
    );

    await expect(useCase.execute()).rejects.toThrow(GitHubRepoListError);
  });
});
