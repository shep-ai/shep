// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Feature, AgentRun } from '@shepai/core/domain/generated/output';
import { SdlcLifecycle, AgentRunStatus, PrStatus } from '@shepai/core/domain/generated/output';

const mockListFeaturesExecute = vi.fn();
const mockListReposExecute = vi.fn();
const mockListAgentRunsExecute = vi.fn();
const mockListApplicationsExecute = vi.fn();
const mockListDeploymentsExecute = vi.fn();

vi.mock('@/lib/server-container', () => ({
  resolve: (token: string) => {
    if (token === 'ListFeaturesUseCase') return { execute: mockListFeaturesExecute };
    if (token === 'ListRepositoriesUseCase') return { execute: mockListReposExecute };
    if (token === 'ListAgentRunsUseCase') return { execute: mockListAgentRunsExecute };
    if (token === 'ListApplicationsUseCase') return { execute: mockListApplicationsExecute };
    if (token === 'ListDeploymentsUseCase') return { execute: mockListDeploymentsExecute };
    throw new Error(`Unknown token: ${token}`);
  },
}));

vi.mock('@/app/actions/get-workflow-defaults', () => ({
  getWorkflowDefaults: vi.fn().mockResolvedValue({
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    push: false,
    openPr: false,
    ciWatchEnabled: true,
    enableEvidence: false,
    commitEvidence: false,
    fast: false,
    injectSkills: false,
  }),
}));

vi.mock('@shepai/core/infrastructure/services/settings.service', () => ({
  getSettings: () => ({
    agent: { type: 'claude-code' },
    models: { default: 'claude-sonnet-4-5-20250929' },
  }),
}));

const { getFeatureTreeData } = await import(
  '../../../../../../src/presentation/web/app/features/get-feature-tree-data.js'
);

function makeFeature(overrides: Partial<Feature> & { id: string; name: string }): Feature {
  return {
    userQuery: '',
    slug: '',
    description: '',
    repositoryPath: '/home/user/repo',
    branch: 'feat/test',
    lifecycle: SdlcLifecycle.Implementation,
    messages: [],
    relatedArtifacts: [],
    fast: false,
    push: false,
    openPr: false,
    forkAndPr: false,
    commitSpecs: false,
    ciWatchEnabled: true,
    enableEvidence: false,
    injectSkills: false,
    commitEvidence: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Feature;
}

function makeAgentRun(overrides: Partial<AgentRun> & { id: string; featureId: string }): AgentRun {
  return {
    agentType: 'claude-code',
    agentName: 'implement',
    status: AgentRunStatus.running,
    prompt: '',
    threadId: 'thread-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as AgentRun;
}

describe('getFeatureTreeData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListReposExecute.mockResolvedValue([
      { name: 'my-repo', path: '/home/user/repo', remoteUrl: 'https://github.com/user/repo' },
    ]);
    mockListAgentRunsExecute.mockResolvedValue([]);
    mockListApplicationsExecute.mockResolvedValue([]);
    mockListDeploymentsExecute.mockResolvedValue([]);
  });

  it('returns nodeState derived from lifecycle and agent run', async () => {
    const feature = makeFeature({
      id: 'feat-1',
      name: 'Test Feature',
      lifecycle: SdlcLifecycle.Implementation,
    });
    const agentRun = makeAgentRun({
      id: 'run-1',
      featureId: 'feat-1',
      status: AgentRunStatus.running,
    });

    mockListFeaturesExecute.mockResolvedValue([feature]);
    mockListAgentRunsExecute.mockResolvedValue([agentRun]);

    const { features } = await getFeatureTreeData();

    expect(features[0].nodeState).toBe('running');
  });

  it('returns nodeState "archived" for a feature with Archived lifecycle', async () => {
    const feature = makeFeature({
      id: 'feat-1',
      name: 'Archived Feature',
      lifecycle: SdlcLifecycle.Archived,
    });

    mockListFeaturesExecute.mockResolvedValue([feature]);

    const { features } = await getFeatureTreeData();

    expect(features[0].nodeState).toBe('archived');
  });

  it('returns nodeState "deleting" for a feature with Deleting lifecycle', async () => {
    const feature = makeFeature({
      id: 'feat-1',
      name: 'Deleting Feature',
      lifecycle: SdlcLifecycle.Deleting,
    });

    mockListFeaturesExecute.mockResolvedValue([feature]);

    const { features } = await getFeatureTreeData();

    expect(features[0].nodeState).toBe('deleting');
  });

  it('returns nodeState "error" when latest agent run has failed status', async () => {
    const feature = makeFeature({
      id: 'feat-1',
      name: 'Failed Feature',
      lifecycle: SdlcLifecycle.Implementation,
    });
    const agentRun = makeAgentRun({
      id: 'run-1',
      featureId: 'feat-1',
      status: AgentRunStatus.failed,
    });

    mockListFeaturesExecute.mockResolvedValue([feature]);
    mockListAgentRunsExecute.mockResolvedValue([agentRun]);

    const { features } = await getFeatureTreeData();

    expect(features[0].nodeState).toBe('error');
  });

  it('returns nodeState "pending" for a feature with Pending lifecycle', async () => {
    const feature = makeFeature({
      id: 'feat-1',
      name: 'Pending Feature',
      lifecycle: SdlcLifecycle.Pending,
    });

    mockListFeaturesExecute.mockResolvedValue([feature]);

    const { features } = await getFeatureTreeData();

    expect(features[0].nodeState).toBe('pending');
  });

  it('returns hasChildren true when a feature has child features', async () => {
    const parent = makeFeature({ id: 'feat-parent', name: 'Parent' });
    const child = makeFeature({
      id: 'feat-child',
      name: 'Child',
      parentId: 'feat-parent',
    });

    mockListFeaturesExecute.mockResolvedValue([parent, child]);

    const { features } = await getFeatureTreeData();

    const parentRow = features.find((f: { id: string }) => f.id === 'feat-parent')!;
    const childRow = features.find((f: { id: string }) => f.id === 'feat-child')!;

    expect(parentRow.hasChildren).toBe(true);
    expect(childRow.hasChildren).toBe(false);
  });

  it('returns hasOpenPr true for a feature with an open PR', async () => {
    const feature = makeFeature({
      id: 'feat-1',
      name: 'PR Feature',
      pr: {
        url: 'https://github.com/user/repo/pull/1',
        number: 1,
        status: PrStatus.Open,
      },
    });

    mockListFeaturesExecute.mockResolvedValue([feature]);

    const { features } = await getFeatureTreeData();

    expect(features[0].hasOpenPr).toBe(true);
  });

  it('returns hasOpenPr false for a feature with a merged PR', async () => {
    const feature = makeFeature({
      id: 'feat-1',
      name: 'Merged PR Feature',
      pr: {
        url: 'https://github.com/user/repo/pull/1',
        number: 1,
        status: PrStatus.Merged,
      },
    });

    mockListFeaturesExecute.mockResolvedValue([feature]);

    const { features } = await getFeatureTreeData();

    expect(features[0].hasOpenPr).toBe(false);
  });

  it('returns hasOpenPr false for a feature without a PR', async () => {
    const feature = makeFeature({ id: 'feat-1', name: 'No PR Feature' });

    mockListFeaturesExecute.mockResolvedValue([feature]);

    const { features } = await getFeatureTreeData();

    expect(features[0].hasOpenPr).toBe(false);
  });

  it('uses the latest agent run when multiple runs exist for a feature', async () => {
    const feature = makeFeature({
      id: 'feat-1',
      name: 'Multi Run',
      lifecycle: SdlcLifecycle.Implementation,
    });
    // ListAgentRunsUseCase returns runs sorted by createdAt desc (most recent first)
    const latestRun = makeAgentRun({
      id: 'run-2',
      featureId: 'feat-1',
      status: AgentRunStatus.failed,
      createdAt: '2024-02-01T00:00:00Z',
    });
    const olderRun = makeAgentRun({
      id: 'run-1',
      featureId: 'feat-1',
      status: AgentRunStatus.completed,
      createdAt: '2024-01-01T00:00:00Z',
    });

    mockListFeaturesExecute.mockResolvedValue([feature]);
    // Sorted desc — latest first
    mockListAgentRunsExecute.mockResolvedValue([latestRun, olderRun]);

    const { features } = await getFeatureTreeData();

    expect(features[0].nodeState).toBe('error');
  });

  it('preserves existing fields (id, name, status, lifecycle, branch, repositoryName)', async () => {
    const feature = makeFeature({
      id: 'feat-1',
      name: 'Test',
      lifecycle: SdlcLifecycle.Maintain,
    });

    mockListFeaturesExecute.mockResolvedValue([feature]);

    const { features } = await getFeatureTreeData();

    expect(features[0].id).toBe('feat-1');
    expect(features[0].name).toBe('Test');
    expect(features[0].status).toBe('done');
    expect(features[0].lifecycle).toBe(SdlcLifecycle.Maintain);
    expect(features[0].repositoryName).toBe('my-repo');
  });
});
