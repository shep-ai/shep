import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreateRecord = vi.fn();
const mockInitializeAndSpawn = vi
  .fn()
  .mockResolvedValue({ warning: undefined, updatedFeature: {} });

vi.mock('@/lib/server-container', () => ({
  resolve: vi.fn(() => ({
    createRecord: mockCreateRecord,
    initializeAndSpawn: mockInitializeAndSpawn,
  })),
}));

const { createFeatureFromRemote } = await import('@/app/actions/create-feature-from-remote');

// Import error classes after vi.mock (they are real classes, not mocked)
const { GitHubAuthError, GitHubUrlParseError, GitHubCloneError } = await import(
  '@shepai/core/application/ports/output/services/github-repository-service.interface'
);

describe('createFeatureFromRemote server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Validation errors ---

  it('returns error when remoteUrl is empty', async () => {
    const result = await createFeatureFromRemote({
      remoteUrl: '',
      description: 'Some feature',
    });

    expect(result).toEqual({ error: 'GitHub URL is required' });
    expect(mockCreateRecord).not.toHaveBeenCalled();
  });

  it('returns error when remoteUrl is whitespace', async () => {
    const result = await createFeatureFromRemote({
      remoteUrl: '   ',
      description: 'Some feature',
    });

    expect(result).toEqual({ error: 'GitHub URL is required' });
    expect(mockCreateRecord).not.toHaveBeenCalled();
  });

  it('returns error when description is empty', async () => {
    const result = await createFeatureFromRemote({
      remoteUrl: 'owner/repo',
      description: '',
    });

    expect(result).toEqual({ error: 'description is required' });
    expect(mockCreateRecord).not.toHaveBeenCalled();
  });

  it('returns error when description is whitespace-only', async () => {
    const result = await createFeatureFromRemote({
      remoteUrl: 'owner/repo',
      description: '   ',
    });

    expect(result).toEqual({ error: 'description is required' });
    expect(mockCreateRecord).not.toHaveBeenCalled();
  });

  // --- Success paths ---

  it('returns feature on success', async () => {
    const feature = { id: '1', name: 'My Feature', slug: 'my-feature' };
    mockCreateRecord.mockResolvedValue({ feature, shouldSpawn: true });

    const result = await createFeatureFromRemote({
      remoteUrl: 'owner/repo',
      description: 'Add dark mode',
    });

    expect(result).toEqual({ feature });
  });

  it('calls createRecord with remoteUrl and composed userInput', async () => {
    const feature = { id: '1', name: 'Test', slug: 'test' };
    mockCreateRecord.mockResolvedValue({ feature, shouldSpawn: true });

    await createFeatureFromRemote({
      remoteUrl: 'https://github.com/owner/repo',
      description: 'Add dark mode',
    });

    expect(mockCreateRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        remoteUrl: 'https://github.com/owner/repo',
        userInput: 'Add dark mode',
        description: 'Add dark mode',
      })
    );
  });

  it('composes userInput with attachments', async () => {
    const feature = { id: '1', name: 'Test', slug: 'test' };
    mockCreateRecord.mockResolvedValue({ feature, shouldSpawn: true });

    await createFeatureFromRemote({
      remoteUrl: 'owner/repo',
      description: 'See attached',
      attachments: [
        { path: '/src/index.ts', name: 'index.ts' },
        { path: '/src/utils.ts', name: 'utils.ts' },
      ],
    });

    expect(mockCreateRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        userInput: 'See attached\n\n@/src/index.ts @/src/utils.ts',
      })
    );
  });

  it('fires initializeAndSpawn async after createRecord', async () => {
    const feature = { id: '1', name: 'Test', slug: 'test' };
    mockCreateRecord.mockResolvedValue({ feature, shouldSpawn: true });

    await createFeatureFromRemote({
      remoteUrl: 'owner/repo',
      description: 'Add feature',
    });

    expect(mockInitializeAndSpawn).toHaveBeenCalledWith(
      feature,
      expect.objectContaining({
        remoteUrl: 'owner/repo',
        userInput: 'Add feature',
      }),
      true
    );
  });

  it('passes shouldSpawn=false to initializeAndSpawn when pending', async () => {
    const feature = { id: '1', name: 'Test', slug: 'test' };
    mockCreateRecord.mockResolvedValue({ feature, shouldSpawn: false });

    await createFeatureFromRemote({
      remoteUrl: 'owner/repo',
      description: 'Add feature',
      pending: true,
    });

    expect(mockInitializeAndSpawn).toHaveBeenCalledWith(
      feature,
      expect.objectContaining({ pending: true }),
      false
    );
  });

  // --- GitHub-specific error handling ---

  it('returns error string for GitHubAuthError', async () => {
    mockCreateRecord.mockRejectedValue(new GitHubAuthError('Not authenticated'));

    const result = await createFeatureFromRemote({
      remoteUrl: 'owner/repo',
      description: 'Test',
    });

    expect(result).toEqual({
      error: 'GitHub CLI is not authenticated. Run `gh auth login` to sign in.',
    });
  });

  it('returns error string for GitHubUrlParseError', async () => {
    mockCreateRecord.mockRejectedValue(new GitHubUrlParseError('Invalid URL format'));

    const result = await createFeatureFromRemote({
      remoteUrl: 'not-a-url',
      description: 'Test',
    });

    expect(result).toEqual({ error: 'Invalid GitHub URL: Invalid URL format' });
  });

  it('returns error string for GitHubCloneError', async () => {
    mockCreateRecord.mockRejectedValue(new GitHubCloneError('Permission denied'));

    const result = await createFeatureFromRemote({
      remoteUrl: 'owner/repo',
      description: 'Test',
    });

    expect(result).toEqual({ error: 'Clone failed: Permission denied' });
  });

  it('returns generic error for other Error instances', async () => {
    mockCreateRecord.mockRejectedValue(new Error('Something unexpected'));

    const result = await createFeatureFromRemote({
      remoteUrl: 'owner/repo',
      description: 'Test',
    });

    expect(result).toEqual({ error: 'Something unexpected' });
  });

  it('returns fallback error for non-Error throws', async () => {
    mockCreateRecord.mockRejectedValue('unknown failure');

    const result = await createFeatureFromRemote({
      remoteUrl: 'owner/repo',
      description: 'Test',
    });

    expect(result).toEqual({ error: 'Failed to create feature from remote' });
  });

  // --- Optional fields forwarding ---

  it('forwards approvalGates with defaults', async () => {
    mockCreateRecord.mockResolvedValue({ feature: { id: '1' }, shouldSpawn: true });

    await createFeatureFromRemote({
      remoteUrl: 'owner/repo',
      description: 'Test',
      approvalGates: { allowPrd: true, allowPlan: false },
    });

    expect(mockCreateRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalGates: { allowPrd: true, allowPlan: false, allowMerge: false },
      })
    );
  });

  it('defaults approvalGates to all false when omitted', async () => {
    mockCreateRecord.mockResolvedValue({ feature: { id: '1' }, shouldSpawn: true });

    await createFeatureFromRemote({
      remoteUrl: 'owner/repo',
      description: 'Test',
    });

    expect(mockCreateRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
      })
    );
  });

  it('forwards push and openPr options', async () => {
    mockCreateRecord.mockResolvedValue({ feature: { id: '1' }, shouldSpawn: true });

    await createFeatureFromRemote({
      remoteUrl: 'owner/repo',
      description: 'Test',
      push: true,
      openPr: true,
    });

    expect(mockCreateRecord).toHaveBeenCalledWith(
      expect.objectContaining({ push: true, openPr: true })
    );
  });

  it('forwards fast flag when true', async () => {
    mockCreateRecord.mockResolvedValue({ feature: { id: '1' }, shouldSpawn: true });

    await createFeatureFromRemote({
      remoteUrl: 'owner/repo',
      description: 'Test',
      fast: true,
    });

    expect(mockCreateRecord).toHaveBeenCalledWith(expect.objectContaining({ fast: true }));
  });

  it('forwards parentId when provided', async () => {
    mockCreateRecord.mockResolvedValue({ feature: { id: '1' }, shouldSpawn: true });

    await createFeatureFromRemote({
      remoteUrl: 'owner/repo',
      description: 'Test',
      parentId: 'parent-123',
    });

    expect(mockCreateRecord).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 'parent-123' })
    );
  });

  it('forwards agentType and model when provided', async () => {
    mockCreateRecord.mockResolvedValue({ feature: { id: '1' }, shouldSpawn: true });

    await createFeatureFromRemote({
      remoteUrl: 'owner/repo',
      description: 'Test',
      agentType: 'claude-code',
      model: 'claude-sonnet-4-5',
    });

    expect(mockCreateRecord).toHaveBeenCalledWith(
      expect.objectContaining({ agentType: 'claude-code', model: 'claude-sonnet-4-5' })
    );
  });
});
