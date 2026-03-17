import { describe, it, expect, vi, beforeEach } from 'vitest';

// All vi.mock() calls MUST be at the top — Vitest hoists them before imports
const mockFindById = vi.fn();
const mockExecute = vi.fn();

vi.mock('@/lib/server-container', () => ({
  resolve: vi.fn((token: string) => {
    if (token === 'IRepositoryRepository') return { findById: mockFindById };
    if (token === 'InitRemoteRepositoryUseCase') return { execute: mockExecute };
    throw new Error(`Unknown token: ${token}`);
  }),
}));

vi.mock('@/app/(dashboard)/get-graph-data', () => ({
  invalidateRepoGitCache: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Dynamic imports AFTER all vi.mock() declarations
const { initRemoteRepository } = await import('@/app/actions/init-remote-repository');
const { invalidateRepoGitCache } = await import('@/app/(dashboard)/get-graph-data');
const { GitPrError, GitPrErrorCode } = await import(
  '@shepai/core/application/ports/output/services/git-pr-service.interface'
);

describe('initRemoteRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when repositoryId is missing', async () => {
    const result = await initRemoteRepository({
      repositoryId: '',
      name: 'my-repo',
      isPrivate: true,
    });
    expect(result).toEqual({ error: 'Repository id is required' });
  });

  it('returns error when repository is not found', async () => {
    mockFindById.mockResolvedValue(null);
    const result = await initRemoteRepository({
      repositoryId: 'repo-1',
      name: 'my-repo',
      isPrivate: true,
    });
    expect(result).toEqual({ error: 'Repository not found.' });
  });

  it('calls use case with isPublic: false when isPrivate: true', async () => {
    mockFindById.mockResolvedValue({ id: 'repo-1', path: '/my/repo' });
    mockExecute.mockResolvedValue({
      repoUrl: 'https://github.com/user/my-repo',
      repoName: 'my-repo',
      isPrivate: true,
    });
    await initRemoteRepository({ repositoryId: 'repo-1', name: 'my-repo', isPrivate: true });
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: '/my/repo', isPublic: false })
    );
  });

  it('calls use case with isPublic: true when isPrivate: false', async () => {
    mockFindById.mockResolvedValue({ id: 'repo-1', path: '/my/repo' });
    mockExecute.mockResolvedValue({
      repoUrl: 'https://github.com/user/my-repo',
      repoName: 'my-repo',
      isPrivate: false,
    });
    await initRemoteRepository({ repositoryId: 'repo-1', name: 'my-repo', isPrivate: false });
    expect(mockExecute).toHaveBeenCalledWith(expect.objectContaining({ isPublic: true }));
  });

  it('returns repoUrl on success and invalidates cache', async () => {
    mockFindById.mockResolvedValue({ id: 'repo-1', path: '/my/repo' });
    mockExecute.mockResolvedValue({
      repoUrl: 'https://github.com/user/my-repo',
      repoName: 'my-repo',
      isPrivate: true,
    });
    const result = await initRemoteRepository({
      repositoryId: 'repo-1',
      name: 'my-repo',
      isPrivate: true,
    });
    expect(result).toEqual({ repoUrl: 'https://github.com/user/my-repo' });
    expect(invalidateRepoGitCache).toHaveBeenCalledWith('/my/repo');
  });

  it('maps GH_NOT_FOUND to actionable error message', async () => {
    mockFindById.mockResolvedValue({ id: 'repo-1', path: '/my/repo' });
    mockExecute.mockRejectedValue(new GitPrError('not found', GitPrErrorCode.GH_NOT_FOUND));
    const result = await initRemoteRepository({
      repositoryId: 'repo-1',
      name: 'my-repo',
      isPrivate: true,
    });
    expect(result).toEqual({ error: 'gh CLI not found. Install with: brew install gh' });
  });

  it('maps AUTH_FAILURE to actionable error message', async () => {
    mockFindById.mockResolvedValue({ id: 'repo-1', path: '/my/repo' });
    mockExecute.mockRejectedValue(new GitPrError('auth fail', GitPrErrorCode.AUTH_FAILURE));
    const result = await initRemoteRepository({
      repositoryId: 'repo-1',
      name: 'my-repo',
      isPrivate: true,
    });
    expect(result).toEqual({ error: 'gh CLI not authenticated. Run: gh auth login' });
  });

  it('maps REMOTE_ALREADY_EXISTS to actionable error message', async () => {
    mockFindById.mockResolvedValue({ id: 'repo-1', path: '/my/repo' });
    mockExecute.mockRejectedValue(new GitPrError('exists', GitPrErrorCode.REMOTE_ALREADY_EXISTS));
    const result = await initRemoteRepository({
      repositoryId: 'repo-1',
      name: 'my-repo',
      isPrivate: true,
    });
    expect(result).toEqual({ error: 'This repository already has a remote configured.' });
  });

  it('returns raw error.message for unknown errors', async () => {
    mockFindById.mockResolvedValue({ id: 'repo-1', path: '/my/repo' });
    mockExecute.mockRejectedValue(new Error('network timeout'));
    const result = await initRemoteRepository({
      repositoryId: 'repo-1',
      name: 'my-repo',
      isPrivate: true,
    });
    expect(result).toEqual({ error: 'network timeout' });
  });

  it('passes org to use case when provided', async () => {
    mockFindById.mockResolvedValue({ id: 'repo-1', path: '/my/repo' });
    mockExecute.mockResolvedValue({
      repoUrl: 'https://github.com/myorg/my-repo',
      repoName: 'my-repo',
      isPrivate: true,
    });
    await initRemoteRepository({
      repositoryId: 'repo-1',
      name: 'my-repo',
      isPrivate: true,
      org: 'myorg',
    });
    expect(mockExecute).toHaveBeenCalledWith(expect.objectContaining({ org: 'myorg' }));
  });
});
