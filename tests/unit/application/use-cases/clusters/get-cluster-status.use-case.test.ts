import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetClusterStatusUseCase } from '@/application/use-cases/clusters/get-cluster-status.use-case.js';
import type { IClusterRepository } from '@/application/ports/output/repositories/cluster-repository.interface.js';
import type {
  IKubectlService,
  KubePod,
  KubeService,
} from '@/application/ports/output/services/kubectl-service.interface.js';
import type { IArgoCDService } from '@/application/ports/output/services/argocd-service.interface.js';
import type { Cluster } from '@/domain/generated/output.js';
import { ClusterStatus } from '@/domain/generated/output.js';

function createMockClusterRepo(): IClusterRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
    findBySlug: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    softDelete: vi.fn(),
    linkRepository: vi.fn(),
    unlinkRepository: vi.fn(),
    getLinkedRepositories: vi.fn().mockResolvedValue([]),
    linkApplication: vi.fn(),
    unlinkApplication: vi.fn(),
    getLinkedApplications: vi.fn().mockResolvedValue([]),
  };
}

function createMockKubectl(): IKubectlService {
  return {
    apply: vi.fn(),
    applyStdin: vi.fn(),
    getNamespaces: vi.fn().mockResolvedValue([]),
    getPods: vi.fn().mockResolvedValue([]),
    getServices: vi.fn().mockResolvedValue([]),
    waitForReady: vi.fn(),
  };
}

function createMockArgoCD(): IArgoCDService {
  return {
    install: vi.fn(),
    getStatus: vi.fn().mockResolvedValue({ installed: false, podCount: 0, serverReady: false }),
    createApp: vi.fn(),
    syncApp: vi.fn(),
  };
}

function makeCluster(overrides: Partial<Cluster> = {}): Cluster {
  return {
    id: 'cluster-1',
    name: 'Test Cluster',
    slug: 'test-cluster',
    status: ClusterStatus.Ready,
    kubeconfigPath: '/home/user/.shep/clusters/cluster-1/kubeconfig',
    argoCdEnabled: false,
    argoCdNamespace: 'argocd',
    nodeCount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('GetClusterStatusUseCase', () => {
  let useCase: GetClusterStatusUseCase;
  let mockRepo: IClusterRepository;
  let mockKubectl: IKubectlService;
  let mockArgoCD: IArgoCDService;

  beforeEach(() => {
    mockRepo = createMockClusterRepo();
    mockKubectl = createMockKubectl();
    mockArgoCD = createMockArgoCD();
    useCase = new GetClusterStatusUseCase(mockRepo, mockKubectl, mockArgoCD);
  });

  it('should return status with live pod/service counts for Ready cluster', async () => {
    const pods: KubePod[] = [
      { name: 'pod-1', namespace: 'default', status: 'Running', ready: true },
    ];
    const services: KubeService[] = [
      {
        name: 'svc-1',
        namespace: 'default',
        type: 'ClusterIP',
        clusterIp: '10.0.0.1',
        ports: '80/TCP',
      },
    ];
    vi.mocked(mockRepo.findById).mockResolvedValue(makeCluster());
    vi.mocked(mockKubectl.getPods).mockResolvedValue(pods);
    vi.mocked(mockKubectl.getServices).mockResolvedValue(services);

    const result = await useCase.execute('cluster-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.status.cluster.id).toBe('cluster-1');
    expect(result.status.live?.podCount).toBe(1);
    expect(result.status.live?.serviceCount).toBe(1);
    expect(result.status.live?.pods).toEqual(pods);
    expect(result.status.live?.services).toEqual(services);
  });

  it('should include ArgoCD status when enabled', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(makeCluster({ argoCdEnabled: true }));
    vi.mocked(mockKubectl.getPods).mockResolvedValue([]);
    vi.mocked(mockKubectl.getServices).mockResolvedValue([]);
    vi.mocked(mockArgoCD.getStatus).mockResolvedValue({
      installed: true,
      podCount: 3,
      serverReady: true,
    });

    const result = await useCase.execute('cluster-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.status.live?.argocd).toBeDefined();
    expect(mockArgoCD.getStatus).toHaveBeenCalledWith(
      '/home/user/.shep/clusters/cluster-1/kubeconfig',
      'argocd'
    );
  });

  it('should not query live data for Stopped cluster', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(makeCluster({ status: ClusterStatus.Stopped }));

    const result = await useCase.execute('cluster-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.status.live).toBeUndefined();
    expect(mockKubectl.getPods).not.toHaveBeenCalled();
  });

  it('should return error message when kubectl fails', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(makeCluster());
    vi.mocked(mockKubectl.getPods).mockRejectedValue(new Error('connection refused'));

    const result = await useCase.execute('cluster-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.status.error).toContain('Failed to query live cluster data');
    expect(result.status.live).toBeUndefined();
  });

  it('should return error when cluster not found', async () => {
    const result = await useCase.execute('non-existent');

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toBe('Cluster not found: "non-existent"');
  });
});
