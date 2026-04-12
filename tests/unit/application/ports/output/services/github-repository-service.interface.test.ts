import { describe, it, expect } from 'vitest';

import type {
  IGitHubRepositoryService,
  GitHubRepo,
  ListUserRepositoriesOptions,
  CloneOptions,
  ParsedGitHubUrl,
} from '@/application/ports/output/services/github-repository-service.interface';
import {
  GitHubAuthError,
  GitHubCloneError,
  GitHubUrlParseError,
  GitHubRepoListError,
} from '@/application/ports/output/services/github-repository-service.interface';

describe('GitHubAuthError', () => {
  it('should be an instance of Error', () => {
    const error = new GitHubAuthError('not authenticated');
    expect(error).toBeInstanceOf(Error);
  });

  it('should set name to GitHubAuthError', () => {
    const error = new GitHubAuthError('not authenticated');
    expect(error.name).toBe('GitHubAuthError');
  });

  it('should set the message', () => {
    const error = new GitHubAuthError('GitHub CLI is not authenticated');
    expect(error.message).toBe('GitHub CLI is not authenticated');
  });

  it('should accept an optional cause', () => {
    const cause = new Error('subprocess exited with code 1');
    const error = new GitHubAuthError('not authenticated', cause);
    expect(error.cause).toBe(cause);
  });

  it('should work without a cause', () => {
    const error = new GitHubAuthError('not authenticated');
    expect(error.cause).toBeUndefined();
  });

  it('should maintain instanceof via Object.setPrototypeOf', () => {
    const error = new GitHubAuthError('test');
    expect(error instanceof GitHubAuthError).toBe(true);
  });
});

describe('GitHubCloneError', () => {
  it('should be an instance of Error', () => {
    const error = new GitHubCloneError('clone failed');
    expect(error).toBeInstanceOf(Error);
  });

  it('should set name to GitHubCloneError', () => {
    const error = new GitHubCloneError('clone failed');
    expect(error.name).toBe('GitHubCloneError');
  });

  it('should accept an optional cause for error chaining', () => {
    const cause = new Error('permission denied');
    const error = new GitHubCloneError('clone failed', cause);
    expect(error.cause).toBe(cause);
  });

  it('should maintain instanceof via Object.setPrototypeOf', () => {
    const error = new GitHubCloneError('test');
    expect(error instanceof GitHubCloneError).toBe(true);
  });
});

describe('GitHubUrlParseError', () => {
  it('should be an instance of Error', () => {
    const error = new GitHubUrlParseError('invalid URL');
    expect(error).toBeInstanceOf(Error);
  });

  it('should set name to GitHubUrlParseError', () => {
    const error = new GitHubUrlParseError('invalid URL');
    expect(error.name).toBe('GitHubUrlParseError');
  });

  it('should accept an optional cause', () => {
    const cause = new Error('regex did not match');
    const error = new GitHubUrlParseError('invalid URL format', cause);
    expect(error.cause).toBe(cause);
  });

  it('should maintain instanceof via Object.setPrototypeOf', () => {
    const error = new GitHubUrlParseError('test');
    expect(error instanceof GitHubUrlParseError).toBe(true);
  });
});

describe('GitHubRepoListError', () => {
  it('should be an instance of Error', () => {
    const error = new GitHubRepoListError('list failed');
    expect(error).toBeInstanceOf(Error);
  });

  it('should set name to GitHubRepoListError', () => {
    const error = new GitHubRepoListError('list failed');
    expect(error.name).toBe('GitHubRepoListError');
  });

  it('should accept an optional cause for error chaining', () => {
    const cause = new Error('network timeout');
    const error = new GitHubRepoListError('list failed', cause);
    expect(error.cause).toBe(cause);
  });

  it('should maintain instanceof via Object.setPrototypeOf', () => {
    const error = new GitHubRepoListError('test');
    expect(error instanceof GitHubRepoListError).toBe(true);
  });
});

describe('GitHubRepo type', () => {
  it('should accept all required fields', () => {
    const repo: GitHubRepo = {
      name: 'my-project',
      nameWithOwner: 'octocat/my-project',
      description: 'A sample project',
      isPrivate: false,
      pushedAt: '2025-01-15T10:30:00Z',
    };
    expect(repo.name).toBe('my-project');
    expect(repo.nameWithOwner).toBe('octocat/my-project');
    expect(repo.description).toBe('A sample project');
    expect(repo.isPrivate).toBe(false);
    expect(repo.pushedAt).toBe('2025-01-15T10:30:00Z');
  });

  it('should accept private repos', () => {
    const repo: GitHubRepo = {
      name: 'secret-project',
      nameWithOwner: 'octocat/secret-project',
      description: '',
      isPrivate: true,
      pushedAt: '2025-03-01T00:00:00Z',
    };
    expect(repo.isPrivate).toBe(true);
  });
});

describe('ParsedGitHubUrl type', () => {
  it('should hold owner, repo, and nameWithOwner', () => {
    const parsed: ParsedGitHubUrl = {
      owner: 'octocat',
      repo: 'my-project',
      nameWithOwner: 'octocat/my-project',
    };
    expect(parsed.owner).toBe('octocat');
    expect(parsed.repo).toBe('my-project');
    expect(parsed.nameWithOwner).toBe('octocat/my-project');
  });
});

describe('ListUserRepositoriesOptions type', () => {
  it('should accept limit and search', () => {
    const options: ListUserRepositoriesOptions = {
      limit: 30,
      search: 'react',
    };
    expect(options.limit).toBe(30);
    expect(options.search).toBe('react');
  });

  it('should allow all fields to be omitted', () => {
    const options: ListUserRepositoriesOptions = {};
    expect(options.limit).toBeUndefined();
    expect(options.search).toBeUndefined();
  });
});

describe('CloneOptions type', () => {
  it('should accept an onProgress callback', () => {
    const chunks: string[] = [];
    const options: CloneOptions = {
      onProgress: (data) => chunks.push(data),
    };
    options.onProgress!('Receiving objects: 50%');
    expect(chunks).toEqual(['Receiving objects: 50%']);
  });

  it('should allow onProgress to be omitted', () => {
    const options: CloneOptions = {};
    expect(options.onProgress).toBeUndefined();
  });
});

describe('IGitHubRepositoryService', () => {
  it('should be implementable with all methods', () => {
    const mock: IGitHubRepositoryService = {
      checkAuth: async () => {
        /* noop */
      },
      cloneRepository: async () => {
        /* noop */
      },
      listUserRepositories: async () => [],
      listOrganizations: async () => [],
      parseGitHubUrl: () => ({
        owner: 'octocat',
        repo: 'my-project',
        nameWithOwner: 'octocat/my-project',
      }),
      getViewerPermission: async () => 'ADMIN',
      getAuthenticatedUser: async () => 'octocat',
      checkPushAccess: async () => ({ hasPushAccess: true, viewerLogin: 'octocat' }),
      forkRepository: async () => ({ nameWithOwner: 'octocat/my-project', alreadyExisted: false }),
    };

    const methodNames: (keyof IGitHubRepositoryService)[] = [
      'checkAuth',
      'cloneRepository',
      'listUserRepositories',
      'listOrganizations',
      'parseGitHubUrl',
    ];

    expect(methodNames).toHaveLength(5);
    for (const name of methodNames) {
      expect(typeof mock[name]).toBe('function');
    }
  });
});
