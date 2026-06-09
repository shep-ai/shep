/**
 * ListGitHubOrganizationsUseCase Unit Tests
 *
 * Tests for listing the authenticated user's GitHub organizations.
 * Uses mock IGitHubRepositoryService.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListGitHubOrganizationsUseCase } from '@/application/use-cases/repositories/list-github-organizations.use-case.js';
import type {
  IGitHubRepositoryService,
  GitHubOrganization,
} from '@/application/ports/output/services/github-repository-service.interface.js';
import {
  GitHubAuthError,
  GitHubRepoListError,
} from '@/application/ports/output/services/github-repository-service.interface.js';

function createMockOrg(overrides?: Partial<GitHubOrganization>): GitHubOrganization {
  return {
    login: 'my-org',
    description: 'An organization',
    ...overrides,
  };
}

describe('ListGitHubOrganizationsUseCase', () => {
  let useCase: ListGitHubOrganizationsUseCase;
  let mockGitHubService: IGitHubRepositoryService;

  beforeEach(() => {
    mockGitHubService = {
      checkAuth: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      cloneRepository: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      listUserRepositories: vi.fn().mockResolvedValue([]),
      listOrganizations: vi
        .fn<() => Promise<GitHubOrganization[]>>()
        .mockResolvedValue([createMockOrg()]),
      parseGitHubUrl: vi.fn(),
      getViewerPermission: vi.fn().mockResolvedValue('ADMIN'),
      getAuthenticatedUser: vi.fn().mockResolvedValue('octocat'),
      checkPushAccess: vi.fn().mockResolvedValue({ hasPushAccess: true, viewerLogin: 'octocat' }),
      forkRepository: vi
        .fn()
        .mockResolvedValue({ nameWithOwner: 'octocat/my-project', alreadyExisted: false }),
      auditRepositoryGovernance: vi.fn().mockResolvedValue([]),
    };

    useCase = new ListGitHubOrganizationsUseCase(mockGitHubService);
  });

  it('should call checkAuth before listing orgs', async () => {
    const callOrder: string[] = [];
    vi.mocked(mockGitHubService.checkAuth).mockImplementation(async () => {
      callOrder.push('checkAuth');
    });
    vi.mocked(mockGitHubService.listOrganizations).mockImplementation(async () => {
      callOrder.push('listOrganizations');
      return [createMockOrg()];
    });

    await useCase.execute();

    expect(callOrder).toEqual(['checkAuth', 'listOrganizations']);
  });

  it('should return orgs from service', async () => {
    const orgs = [
      createMockOrg({ login: 'org-a', description: 'Organization A' }),
      createMockOrg({ login: 'org-b', description: '' }),
    ];
    vi.mocked(mockGitHubService.listOrganizations).mockResolvedValue(orgs);

    const result = await useCase.execute();

    expect(result).toEqual(orgs);
    expect(result).toHaveLength(2);
  });

  it('should propagate GitHubAuthError when not authenticated', async () => {
    vi.mocked(mockGitHubService.checkAuth).mockRejectedValue(
      new GitHubAuthError('GitHub CLI is not authenticated. Run `gh auth login` to sign in.')
    );

    await expect(useCase.execute()).rejects.toThrow(GitHubAuthError);
    expect(mockGitHubService.listOrganizations).not.toHaveBeenCalled();
  });

  it('should propagate GitHubRepoListError when listing fails', async () => {
    vi.mocked(mockGitHubService.listOrganizations).mockRejectedValue(
      new GitHubRepoListError('Failed to list organizations')
    );

    await expect(useCase.execute()).rejects.toThrow(GitHubRepoListError);
  });
});
