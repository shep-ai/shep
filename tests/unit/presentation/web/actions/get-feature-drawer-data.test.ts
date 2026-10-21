// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindById = vi.fn();
const mockFindRunById = vi.fn();
const mockFindByPath = vi.fn();
const mockGetDefaultBranch = vi.fn();
const mockGetRemoteUrl = vi.fn();
const mockGetMergeableStatus = vi.fn();
const mockGetCiStatus = vi.fn();
const mockGetArtifactExecute = vi.fn();
const mockGetResearchExecute = vi.fn();
const mockFeatureUpdate = vi.fn();

vi.mock('@/lib/server-container', () => ({
  resolve: (token: string) => {
    if (token === 'IFeatureRepository')
      return { findById: mockFindById, update: mockFeatureUpdate };
    if (token === 'IAgentRunRepository') return { findById: mockFindRunById };
    if (token === 'IRepositoryRepository') return { findByPath: mockFindByPath };
    if (token === 'IGitPrService')
      return {
        getDefaultBranch: mockGetDefaultBranch,
        getRemoteUrl: mockGetRemoteUrl,
        getMergeableStatus: mockGetMergeableStatus,
        getCiStatus: mockGetCiStatus,
      };
    if (token === 'GetFeatureArtifactUseCase') return { execute: mockGetArtifactExecute };
    if (token === 'GetResearchArtifactUseCase') return { execute: mockGetResearchExecute };
    throw new Error(`Unknown token: ${token}`);
  },
}));

vi.mock('@/app/build-feature-node-data', () => ({
  buildFeatureNodeData: vi.fn(
    (feature: { id: string; name: string }, _run: unknown, options: Record<string, unknown>) => ({
      featureId: feature.id,
      name: feature.name,
      state: 'running',
      lifecycle: 'requirements',
      ...options,
    })
  ),
}));

vi.mock('@shepai/core/infrastructure/services/settings.service', () => ({
  getSettings: () => ({
    workflow: {
      enableEvidence: false,
      commitEvidence: false,
    },
  }),
}));

const { getFeatureDrawerData } = await import(
  '../../../../../src/presentation/web/app/actions/get-feature-drawer-data.js'
);

describe('getFeatureDrawerData server action', () => {
  const baseFeature = {
    id: 'feat-123',
    name: 'Test Feature',
    repositoryPath: '/home/user/repo',
    branch: 'feat/test',
    agentRunId: 'run-1',
    pr: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFindById.mockResolvedValue(baseFeature);
    mockFindRunById.mockResolvedValue({ id: 'run-1', status: 'running' });
    mockFindByPath.mockResolvedValue({ name: 'my-repo' });
    mockGetDefaultBranch.mockResolvedValue('main');
    mockGetArtifactExecute.mockResolvedValue({ oneLiner: 'A test feature', openQuestions: [] });
    mockGetResearchExecute.mockResolvedValue({ decisions: [] });
    mockGetRemoteUrl.mockResolvedValue('https://github.com/user/repo');
    mockGetMergeableStatus.mockResolvedValue(undefined);
    mockGetCiStatus.mockResolvedValue(undefined);
  });

  it('returns null when feature not found', async () => {
    mockFindById.mockResolvedValue(null);

    const result = await getFeatureDrawerData('nonexistent');

    expect(result).toBeNull();
  });

  it('returns FeatureNodeData for a valid feature', async () => {
    const result = await getFeatureDrawerData('feat-123');

    expect(result).toMatchObject({
      featureId: 'feat-123',
      name: 'Test Feature',
    });
    expect(mockFindById).toHaveBeenCalledWith('feat-123');
    expect(mockFindRunById).toHaveBeenCalledWith('run-1');
  });

  it('resolves the coordination peer name for the drawer (spec 141)', async () => {
    const withDecision = {
      ...baseFeature,
      coordination: {
        action: 'defer',
        peerFeatureId: 'feat-a',
        rationale: 'r',
        overlappingPaths: [],
      },
    };
    mockFindById.mockImplementation(async (id: string) =>
      id === 'feat-a' ? { id: 'feat-a', name: 'Rotate refresh tokens' } : withDecision
    );

    const result = await getFeatureDrawerData('feat-123');

    expect(mockFindById).toHaveBeenCalledWith('feat-a');
    expect(result).toMatchObject({ coordinationPeerName: 'Rotate refresh tokens' });
  });

  it('handles feature without agentRunId', async () => {
    mockFindById.mockResolvedValue({ ...baseFeature, agentRunId: null });

    const result = await getFeatureDrawerData('feat-123');

    expect(result).not.toBeNull();
    expect(mockFindRunById).not.toHaveBeenCalled();
  });

  it('fetches repository, branch, artifact, and remote URL in parallel', async () => {
    await getFeatureDrawerData('feat-123');

    expect(mockFindByPath).toHaveBeenCalledWith('/home/user/repo');
    expect(mockGetDefaultBranch).toHaveBeenCalledWith('/home/user/repo');
    expect(mockGetArtifactExecute).toHaveBeenCalledWith('feat-123');
    expect(mockGetRemoteUrl).toHaveBeenCalledWith('/home/user/repo');
  });

  it('does not call getCiStatus or getMergeableStatus (reads from DB instead)', async () => {
    mockFindById.mockResolvedValue({
      ...baseFeature,
      pr: {
        url: 'https://github.com/org/repo/pull/1',
        number: 1,
        status: 'Open',
        ciStatus: 'Success',
        mergeable: true,
      },
    });

    await getFeatureDrawerData('feat-123');

    expect(mockGetCiStatus).not.toHaveBeenCalled();
    expect(mockGetMergeableStatus).not.toHaveBeenCalled();
    expect(mockFeatureUpdate).not.toHaveBeenCalled();
  });

  it('returns null on unexpected errors', async () => {
    mockFindById.mockRejectedValue(new Error('DB connection failed'));

    const result = await getFeatureDrawerData('feat-123');

    expect(result).toBeNull();
  });

  it('handles graceful failures in parallel fetches', async () => {
    mockFindByPath.mockRejectedValue(new Error('not found'));
    mockGetDefaultBranch.mockRejectedValue(new Error('no remote'));
    mockGetArtifactExecute.mockRejectedValue(new Error('no artifact'));
    mockGetRemoteUrl.mockRejectedValue(new Error('no remote'));

    const result = await getFeatureDrawerData('feat-123');

    expect(result).not.toBeNull();
  });
  it('tells the drawer which decision tabs have content (research + spec artifacts)', async () => {
    const { buildFeatureNodeData } = await import('@/app/build-feature-node-data');
    mockGetResearchExecute.mockResolvedValue({
      decisions: [{ title: 'Bundler', chosen: 'Vite', rejected: [], rationale: 'fast' }],
    });
    mockGetArtifactExecute.mockResolvedValue({
      oneLiner: 'A test feature',
      openQuestions: [{ question: 'Auth?', resolved: false }],
    });

    await getFeatureDrawerData('feat-123');

    expect(mockGetResearchExecute).toHaveBeenCalledWith('feat-123');
    expect(buildFeatureNodeData).toHaveBeenCalledWith(
      baseFeature,
      expect.anything(),
      expect.objectContaining({
        decisionTabs: { hasTechDecisions: true, hasProductDecisions: false },
      })
    );
  });

  it('reports no decisions when the artifacts cannot be read', async () => {
    const { buildFeatureNodeData } = await import('@/app/build-feature-node-data');
    mockGetResearchExecute.mockRejectedValue(new Error('ENOENT research.yaml'));
    mockGetArtifactExecute.mockRejectedValue(new Error('ENOENT spec.yaml'));

    const result = await getFeatureDrawerData('feat-123');

    expect(result).not.toBeNull();
    expect(buildFeatureNodeData).toHaveBeenCalledWith(
      baseFeature,
      expect.anything(),
      expect.objectContaining({
        decisionTabs: { hasTechDecisions: false, hasProductDecisions: false },
      })
    );
  });
});
