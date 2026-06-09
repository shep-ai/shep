import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHealthCheckNode } from '@/infrastructure/services/agents/cluster-agent/nodes/health-check.js';
import type { ClusterAgentDeps } from '@/infrastructure/services/agents/cluster-agent/cluster-agent-deps.js';
import type { ClusterAgentState } from '@/infrastructure/services/agents/cluster-agent/cluster-agent-state.js';
import type { KubePod } from '@/application/ports/output/services/kubectl-service.interface.js';

function makeState(overrides?: Partial<ClusterAgentState>): ClusterAgentState {
  return {
    clusterId: 'cluster-1',
    clusterName: 'test-cluster',
    status: 'Provisioning',
    kubeconfigPath: '/home/user/.shep/clusters/cluster-1/kubeconfig',
    argoCdEnabled: false,
    argoCdNamespace: 'argocd',
    currentNode: 'configure-kubectl',
    error: null,
    completedPhases: ['prerequisite-check', 'provision', 'configure-kubectl'],
    messages: [],
    ...overrides,
  };
}

function makePod(name: string, ready: boolean): KubePod {
  return {
    name,
    namespace: 'kube-system',
    status: ready ? 'Running' : 'Pending',
    ready,
  };
}

function makeDeps(overrides?: Partial<ClusterAgentDeps>): ClusterAgentDeps {
  return {
    k3dService: {
      createCluster: vi.fn(),
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

describe('createHealthCheckNode', () => {
  let deps: ClusterAgentDeps;

  beforeEach(() => {
    vi.useFakeTimers();
    deps = makeDeps();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should succeed immediately when all system pods are ready', async () => {
    vi.mocked(deps.kubectlService.getPods).mockResolvedValue([
      makePod('coredns', true),
      makePod('local-path-provisioner', true),
      makePod('metrics-server', true),
    ]);

    // Use a very short timeout since we expect immediate success
    const node = createHealthCheckNode(deps, 5_000);

    // Run with real timers since we expect immediate resolution
    vi.useRealTimers();
    const result = await node(makeState());

    expect(result.error).toBeUndefined();
    expect(result.currentNode).toBe('health-check');
    expect(result.completedPhases).toContain('health-check');
    expect(result.messages?.[0]).toContain('system pods ready');
  });

  it('should update lastHealthCheckAt on success', async () => {
    vi.mocked(deps.kubectlService.getPods).mockResolvedValue([makePod('coredns', true)]);

    const node = createHealthCheckNode(deps, 5_000);
    vi.useRealTimers();
    await node(makeState());

    expect(deps.clusterRepo.update).toHaveBeenCalledWith(
      'cluster-1',
      expect.objectContaining({ lastHealthCheckAt: expect.any(Date) })
    );
  });

  it('should retry with backoff until pods become ready', async () => {
    // First call: pods not ready. Second call: pods ready.
    vi.mocked(deps.kubectlService.getPods)
      .mockResolvedValueOnce([makePod('coredns', false)])
      .mockResolvedValueOnce([makePod('coredns', true)]);

    const node = createHealthCheckNode(deps, 10_000);
    vi.useRealTimers();
    const result = await node(makeState());

    expect(result.error).toBeUndefined();
    expect(deps.kubectlService.getPods).toHaveBeenCalledTimes(2);
  });

  it('should return error after timeout when pods never become ready', async () => {
    // Always return not-ready pods
    vi.mocked(deps.kubectlService.getPods).mockResolvedValue([makePod('coredns', false)]);

    // Use a very short timeout (100ms) so test runs fast
    const node = createHealthCheckNode(deps, 100);
    vi.useRealTimers();
    const result = await node(makeState());

    expect(result.error).toContain('timed out');
    expect(result.completedPhases).toContain('health-check');
  });

  it('should handle kubectl errors gracefully and retry', async () => {
    // First call throws, second succeeds
    vi.mocked(deps.kubectlService.getPods)
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce([makePod('coredns', true)]);

    const node = createHealthCheckNode(deps, 10_000);
    vi.useRealTimers();
    const result = await node(makeState());

    expect(result.error).toBeUndefined();
    expect(deps.kubectlService.getPods).toHaveBeenCalledTimes(2);
  });

  it('should return error when kubeconfigPath is not set', async () => {
    const node = createHealthCheckNode(deps, 5_000);
    vi.useRealTimers();
    const result = await node(makeState({ kubeconfigPath: null }));

    expect(result.error).toContain('kubeconfig path not set');
  });

  it('should query kube-system namespace for core pods', async () => {
    vi.mocked(deps.kubectlService.getPods).mockResolvedValue([makePod('coredns', true)]);

    const node = createHealthCheckNode(deps, 5_000);
    vi.useRealTimers();
    await node(makeState());

    expect(deps.kubectlService.getPods).toHaveBeenCalledWith(
      '/home/user/.shep/clusters/cluster-1/kubeconfig',
      'kube-system'
    );
  });
});
