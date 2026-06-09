import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPrerequisiteCheckNode } from '@/infrastructure/services/agents/cluster-agent/nodes/prerequisite-check.js';
import type { ClusterAgentDeps } from '@/infrastructure/services/agents/cluster-agent/cluster-agent-deps.js';
import type { ClusterAgentState } from '@/infrastructure/services/agents/cluster-agent/cluster-agent-state.js';
import { K3dError, K3dErrorCode } from '@/infrastructure/errors/k3d-error.js';

function makeState(overrides?: Partial<ClusterAgentState>): ClusterAgentState {
  return {
    clusterId: 'cluster-1',
    clusterName: 'test-cluster',
    status: 'Provisioning',
    kubeconfigPath: null,
    argoCdEnabled: false,
    argoCdNamespace: 'argocd',
    currentNode: '',
    error: null,
    completedPhases: [],
    messages: [],
    ...overrides,
  };
}

function makeDeps(overrides?: Partial<ClusterAgentDeps>): ClusterAgentDeps {
  return {
    k3dService: {
      createCluster: vi.fn(),
      deleteCluster: vi.fn(),
      startCluster: vi.fn(),
      stopCluster: vi.fn(),
      getClusterStatus: vi.fn().mockResolvedValue(null),
      getKubeconfig: vi.fn(),
    },
    kubectlService: {
      apply: vi.fn(),
      applyStdin: vi.fn(),
      getNamespaces: vi.fn(),
      getPods: vi.fn(),
      getServices: vi.fn(),
      waitForReady: vi.fn(),
    },
    argoCdService: {
      install: vi.fn(),
      getStatus: vi.fn(),
      createApp: vi.fn(),
      syncApp: vi.fn(),
    },
    dockerHealthService: {
      isAvailable: vi.fn().mockResolvedValue(true),
    },
    clusterRepo: {
      create: vi.fn(),
      findById: vi.fn(),
      findBySlug: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
      linkRepository: vi.fn(),
      unlinkRepository: vi.fn(),
      getLinkedRepositories: vi.fn(),
      linkApplication: vi.fn(),
      unlinkApplication: vi.fn(),
      getLinkedApplications: vi.fn(),
    },
    ...overrides,
  };
}

describe('createPrerequisiteCheckNode', () => {
  let deps: ClusterAgentDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  it('should return error when Docker is not available', async () => {
    vi.mocked(deps.dockerHealthService.isAvailable).mockResolvedValue(false);

    const node = createPrerequisiteCheckNode(deps);
    const result = await node(makeState());

    expect(result.error).toContain('Docker is not running');
    expect(result.currentNode).toBe('prerequisite-check');
    expect(result.completedPhases).toContain('prerequisite-check');
  });

  it('should return error when k3d binary is not found', async () => {
    vi.mocked(deps.dockerHealthService.isAvailable).mockResolvedValue(true);
    vi.mocked(deps.k3dService.getClusterStatus).mockRejectedValue(
      new K3dError('k3d: command not found', K3dErrorCode.BINARY_NOT_FOUND)
    );

    const node = createPrerequisiteCheckNode(deps);
    const result = await node(makeState());

    expect(result.error).toContain('k3d is not installed');
    expect(result.completedPhases).toContain('prerequisite-check');
  });

  it('should pass when both Docker and k3d are available', async () => {
    vi.mocked(deps.dockerHealthService.isAvailable).mockResolvedValue(true);
    vi.mocked(deps.k3dService.getClusterStatus).mockResolvedValue(null);

    const node = createPrerequisiteCheckNode(deps);
    const result = await node(makeState());

    expect(result.error).toBeUndefined();
    expect(result.currentNode).toBe('prerequisite-check');
    expect(result.completedPhases).toContain('prerequisite-check');
    expect(result.messages?.[0]).toContain('prerequisites verified');
  });

  it('should pass when k3d probe throws a non-BINARY_NOT_FOUND error', async () => {
    vi.mocked(deps.dockerHealthService.isAvailable).mockResolvedValue(true);
    vi.mocked(deps.k3dService.getClusterStatus).mockRejectedValue(
      new K3dError('cluster not found', K3dErrorCode.CLUSTER_NOT_FOUND)
    );

    const node = createPrerequisiteCheckNode(deps);
    const result = await node(makeState());

    // Any error other than BINARY_NOT_FOUND means k3d is installed
    expect(result.error).toBeUndefined();
    expect(result.completedPhases).toContain('prerequisite-check');
  });

  it('should check Docker before k3d', async () => {
    vi.mocked(deps.dockerHealthService.isAvailable).mockResolvedValue(false);

    const node = createPrerequisiteCheckNode(deps);
    await node(makeState());

    // k3d should not be called if Docker is down
    expect(deps.k3dService.getClusterStatus).not.toHaveBeenCalled();
  });
});
