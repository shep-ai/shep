import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClusterAgentGraph } from '@/infrastructure/services/agents/cluster-agent/cluster-agent-graph.js';
import type { ClusterAgentDeps } from '@/infrastructure/services/agents/cluster-agent/cluster-agent-deps.js';
import { ClusterStatus } from '@/domain/generated/output.js';

/**
 * Creates a fully-mocked deps object for graph tests.
 * Each mock is set to succeed by default — individual tests override as needed.
 */
function makeDeps(): ClusterAgentDeps {
  return {
    k3dService: {
      createCluster: vi.fn().mockResolvedValue(undefined),
      deleteCluster: vi.fn().mockResolvedValue(undefined),
      startCluster: vi.fn().mockResolvedValue(undefined),
      stopCluster: vi.fn().mockResolvedValue(undefined),
      getClusterStatus: vi.fn().mockResolvedValue(null),
      getKubeconfig: vi.fn().mockResolvedValue('apiVersion: v1\nclusters: []'),
    },
    kubectlService: {
      apply: vi.fn().mockResolvedValue(undefined),
      applyStdin: vi.fn().mockResolvedValue(undefined),
      getNamespaces: vi.fn().mockResolvedValue(['default', 'kube-system']),
      getPods: vi
        .fn()
        .mockResolvedValue([
          { name: 'coredns', namespace: 'kube-system', status: 'Running', ready: true },
        ]),
      getServices: vi.fn().mockResolvedValue([]),
      waitForReady: vi.fn().mockResolvedValue(undefined),
    },
    argoCdService: {
      install: vi.fn().mockResolvedValue(undefined),
      getStatus: vi.fn().mockResolvedValue({ installed: true, podCount: 3, serverReady: true }),
      createApp: vi.fn().mockResolvedValue(undefined),
      syncApp: vi.fn().mockResolvedValue(undefined),
    },
    dockerHealthService: {
      isAvailable: vi.fn().mockResolvedValue(true),
    },
    clusterRepo: {
      create: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn().mockResolvedValue(null),
      findBySlug: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(undefined),
      softDelete: vi.fn().mockResolvedValue(undefined),
      linkRepository: vi.fn().mockResolvedValue(undefined),
      unlinkRepository: vi.fn().mockResolvedValue(undefined),
      getLinkedRepositories: vi.fn().mockResolvedValue([]),
      linkApplication: vi.fn().mockResolvedValue(undefined),
      unlinkApplication: vi.fn().mockResolvedValue(undefined),
      getLinkedApplications: vi.fn().mockResolvedValue([]),
    },
  };
}

describe('createClusterAgentGraph', () => {
  let deps: ClusterAgentDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  const baseInput = {
    clusterId: 'cluster-1',
    clusterName: 'test-cluster',
    status: 'Provisioning',
    argoCdEnabled: false,
    argoCdNamespace: 'argocd',
  };

  it('should execute full path without ArgoCD: prerequisite-check -> provision -> configure-kubectl -> health-check -> ready', async () => {
    const graph = createClusterAgentGraph(deps);
    const result = await graph.invoke(baseInput);

    // Verify all operational nodes ran
    expect(result.completedPhases).toContain('prerequisite-check');
    expect(result.completedPhases).toContain('provision');
    expect(result.completedPhases).toContain('configure-kubectl');
    expect(result.completedPhases).toContain('health-check');
    expect(result.completedPhases).toContain('ready');

    // ArgoCD should not have been installed
    expect(result.completedPhases).not.toContain('install-argocd');
    expect(deps.argoCdService.install).not.toHaveBeenCalled();

    // Final status should be Ready
    expect(result.status).toBe(ClusterStatus.Ready);
    expect(result.error).toBeNull();
  });

  it('should include install-argocd when argoCdEnabled is true', async () => {
    const graph = createClusterAgentGraph(deps);
    const result = await graph.invoke({
      ...baseInput,
      argoCdEnabled: true,
      argoCdNamespace: 'custom-argocd',
    });

    // ArgoCD should have been installed
    expect(result.completedPhases).toContain('install-argocd');
    expect(deps.argoCdService.install).toHaveBeenCalled();

    // All other nodes should also have run
    expect(result.completedPhases).toContain('prerequisite-check');
    expect(result.completedPhases).toContain('provision');
    expect(result.completedPhases).toContain('configure-kubectl');
    expect(result.completedPhases).toContain('health-check');
    expect(result.completedPhases).toContain('ready');
    expect(result.status).toBe(ClusterStatus.Ready);
  });

  it('should route to error node when prerequisite-check fails (Docker not running)', async () => {
    vi.mocked(deps.dockerHealthService.isAvailable).mockResolvedValue(false);

    const graph = createClusterAgentGraph(deps);
    const result = await graph.invoke(baseInput);

    // Should hit error node
    expect(result.completedPhases).toContain('prerequisite-check');
    expect(result.completedPhases).toContain('handle-error');
    expect(result.status).toBe(ClusterStatus.Error);
    expect(result.error).toContain('Docker');

    // Provision should NOT have been called
    expect(deps.k3dService.createCluster).not.toHaveBeenCalled();
  });

  it('should route to error node when provision fails', async () => {
    vi.mocked(deps.k3dService.createCluster).mockRejectedValue(
      new Error('k3d cluster create failed')
    );

    const graph = createClusterAgentGraph(deps);
    const result = await graph.invoke(baseInput);

    expect(result.completedPhases).toContain('provision');
    expect(result.completedPhases).toContain('handle-error');
    expect(result.status).toBe(ClusterStatus.Error);
    expect(result.error).toContain('Failed to create k3d cluster');
  });

  it('should update cluster repo status to Ready on successful provisioning', async () => {
    const graph = createClusterAgentGraph(deps);
    await graph.invoke(baseInput);

    // The ready node should have updated status to Ready
    expect(deps.clusterRepo.update).toHaveBeenCalledWith(
      'cluster-1',
      expect.objectContaining({ status: ClusterStatus.Ready })
    );
  });

  it('should update cluster repo status to Error on failure', async () => {
    vi.mocked(deps.dockerHealthService.isAvailable).mockResolvedValue(false);

    const graph = createClusterAgentGraph(deps);
    await graph.invoke(baseInput);

    // The error node should have updated status to Error
    expect(deps.clusterRepo.update).toHaveBeenCalledWith(
      'cluster-1',
      expect.objectContaining({ status: ClusterStatus.Error })
    );
  });
});
