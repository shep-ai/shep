import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createProvisionNode } from '@/infrastructure/services/agents/cluster-agent/nodes/provision.js';
import type { ClusterAgentDeps } from '@/infrastructure/services/agents/cluster-agent/cluster-agent-deps.js';
import type { ClusterAgentState } from '@/infrastructure/services/agents/cluster-agent/cluster-agent-state.js';
import { K3dError, K3dErrorCode } from '@/infrastructure/errors/k3d-error.js';

function makeState(overrides?: Partial<ClusterAgentState>): ClusterAgentState {
  return {
    clusterId: 'cluster-1',
    clusterName: 'my-app',
    status: 'Provisioning',
    kubeconfigPath: null,
    argoCdEnabled: false,
    argoCdNamespace: 'argocd',
    currentNode: 'prerequisite-check',
    error: null,
    completedPhases: ['prerequisite-check'],
    messages: [],
    ...overrides,
  };
}

function makeDeps(overrides?: Partial<ClusterAgentDeps>): ClusterAgentDeps {
  return {
    k3dService: {
      createCluster: vi.fn().mockResolvedValue(undefined),
      deleteCluster: vi.fn(),
      startCluster: vi.fn(),
      stopCluster: vi.fn(),
      getClusterStatus: vi.fn(),
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
      isAvailable: vi.fn(),
    },
    clusterRepo: {
      create: vi.fn(),
      findById: vi.fn(),
      findBySlug: vi.fn(),
      list: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
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

describe('createProvisionNode', () => {
  let deps: ClusterAgentDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  it('should call k3d.createCluster with the derived k3d name', async () => {
    const node = createProvisionNode(deps);
    await node(makeState());

    expect(deps.k3dService.createCluster).toHaveBeenCalledWith('shep-my-app', {
      noLb: true,
      wait: true,
      timeoutSeconds: 120,
    });
  });

  it('should update cluster entity with k3d cluster name after creation', async () => {
    const node = createProvisionNode(deps);
    await node(makeState({ clusterId: 'cluster-42' }));

    expect(deps.clusterRepo.update).toHaveBeenCalledWith(
      'cluster-42',
      expect.objectContaining({ k3dClusterName: 'shep-my-app' })
    );
  });

  it('should return success state with completedPhases', async () => {
    const node = createProvisionNode(deps);
    const result = await node(makeState());

    expect(result.error).toBeUndefined();
    expect(result.currentNode).toBe('provision');
    expect(result.completedPhases).toContain('provision');
    expect(result.messages?.[0]).toContain('created successfully');
  });

  it('should return error when k3d createCluster fails', async () => {
    vi.mocked(deps.k3dService.createCluster).mockRejectedValue(
      new K3dError('cluster already exists', K3dErrorCode.CLUSTER_EXISTS)
    );

    const node = createProvisionNode(deps);
    const result = await node(makeState());

    expect(result.error).toContain('Failed to create k3d cluster');
    expect(result.completedPhases).toContain('provision');

    // Should NOT have updated cluster entity on failure
    expect(deps.clusterRepo.update).not.toHaveBeenCalled();
  });

  it('should derive k3d name with shep- prefix from clusterName', async () => {
    const node = createProvisionNode(deps);
    await node(makeState({ clusterName: 'staging-env' }));

    expect(deps.k3dService.createCluster).toHaveBeenCalledWith(
      'shep-staging-env',
      expect.any(Object)
    );
  });
});
