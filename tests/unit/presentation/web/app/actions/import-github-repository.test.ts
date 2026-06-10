import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecute = vi.fn();

vi.mock('@/lib/server-container', () => ({
  resolve: vi.fn(() => ({
    execute: mockExecute,
  })),
}));

const { importGitHubRepository } = await import('@/app/actions/import-github-repository');

// Import error classes after vi.mock (they are real classes, not mocked)
const { GitHubAuthError, GitHubUrlParseError, GitHubCloneError, GitHubForkError } = await import(
  '@shepai/core/application/ports/output/services/github-repository-service.interface'
);

describe('importGitHubRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when url is empty', async () => {
    const result = await importGitHubRepository({ url: '' });
    expect(result).toEqual({ error: 'GitHub URL is required' });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('returns error when url is whitespace', async () => {
    const result = await importGitHubRepository({ url: '   ' });
    expect(result).toEqual({ error: 'GitHub URL is required' });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('returns repository on successful import', async () => {
    const repo = {
      id: 'repo-1',
      name: 'my-repo',
      path: '/repos/my-repo',
      remoteUrl: 'https://github.com/owner/my-repo',
    };
    mockExecute.mockResolvedValue(repo);

    const result = await importGitHubRepository({ url: 'https://github.com/owner/my-repo' });

    expect(result).toEqual({ repository: repo, forked: false });
    expect(mockExecute).toHaveBeenCalledWith({
      url: 'https://github.com/owner/my-repo',
      dest: undefined,
    });
  });

  it('returns forked true when repository is a fork', async () => {
    const repo = {
      id: 'repo-1',
      name: 'my-repo',
      path: '/repos/my-repo',
      remoteUrl: 'https://github.com/myuser/my-repo',
      isFork: true,
      upstreamUrl: 'https://github.com/owner/my-repo',
    };
    mockExecute.mockResolvedValue(repo);

    const result = await importGitHubRepository({ url: 'https://github.com/owner/my-repo' });

    expect(result.forked).toBe(true);
    expect(result.repository).toEqual(repo);
  });

  it('passes dest option to use case', async () => {
    const repo = {
      id: 'repo-1',
      name: 'my-repo',
      path: '/custom/dest',
      remoteUrl: 'https://github.com/owner/my-repo',
    };
    mockExecute.mockResolvedValue(repo);

    await importGitHubRepository({ url: 'owner/my-repo', dest: '/custom/dest' });

    expect(mockExecute).toHaveBeenCalledWith({ url: 'owner/my-repo', dest: '/custom/dest' });
  });

  it('returns error string on GitHubAuthError', async () => {
    mockExecute.mockRejectedValue(new GitHubAuthError('Not authenticated'));

    const result = await importGitHubRepository({ url: 'owner/repo' });

    expect(result).toEqual({
      error: 'GitHub CLI is not authenticated. Run `gh auth login` to sign in.',
    });
  });

  it('returns error string on GitHubUrlParseError', async () => {
    mockExecute.mockRejectedValue(new GitHubUrlParseError('Invalid URL format'));

    const result = await importGitHubRepository({ url: 'not-a-url' });

    expect(result).toEqual({ error: 'Invalid GitHub URL: Invalid URL format' });
  });

  it('returns error string on GitHubCloneError', async () => {
    mockExecute.mockRejectedValue(new GitHubCloneError('Permission denied'));

    const result = await importGitHubRepository({ url: 'owner/repo' });

    expect(result).toEqual({ error: 'Clone failed: Permission denied' });
  });

  it('returns error string on GitHubForkError', async () => {
    mockExecute.mockRejectedValue(new GitHubForkError('Fork failed'));

    const result = await importGitHubRepository({ url: 'owner/repo' });

    expect(result).toEqual({ error: 'Fork failed: Fork failed' });
  });

  it('returns generic error for other Error instances', async () => {
    mockExecute.mockRejectedValue(new Error('Something unexpected'));

    const result = await importGitHubRepository({ url: 'owner/repo' });

    expect(result).toEqual({ error: 'Something unexpected' });
  });

  it('returns fallback error for non-Error throws', async () => {
    mockExecute.mockRejectedValue('unknown failure');

    const result = await importGitHubRepository({ url: 'owner/repo' });

    expect(result).toEqual({ error: 'Failed to import repository' });
  });
});
