import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeleteClusterUseCase } from '@/application/use-cases/clusters/delete-cluster.use-case.js';
import type { IClusterRepository } from '@/application/ports/output/repositories/cluster-repository.interface.js';
import type { IK3dService } from '@/application/ports/output/services/k3d-service.interface.js';
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

function createMockK3dService(): IK3dService {
  return {
    createCluster: vi.fn(),
    deleteCluster: vi.fn(),
    startCluster: vi.fn(),
    stopCluster: vi.fn(),
    getClusterStatus: vi.fn(),
    getKubeconfig: vi.fn(),
  };
}

function makeCluster(overrides: Partial<Cluster> = {}): Cluster {
  return {
    id: 'cluster-1',
    name: 'Test Cluster',
    slug: 'test-cluster',
    status: ClusterStatus.Stopped,
    argoCdEnabled: false,
    argoCdNamespace: 'argocd',
    nodeCount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('DeleteClusterUseCase', () => {
  let useCase: DeleteClusterUseCase;
  let mockRepo: IClusterRepository;
  let mockK3d: IK3dService;

  beforeEach(() => {
    mockRepo = createMockClusterRepo();
    mockK3d = createMockK3dService();
    useCase = new DeleteClusterUseCase(mockRepo, mockK3d);
  });

  it('should soft-delete a Stopped cluster directly', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(makeCluster());

    const result = await useCase.execute('cluster-1');

    expect(result.ok).toBe(true);
    expect(mockRepo.softDelete).toHaveBeenCalledWith('cluster-1');
    expect(mockK3d.deleteCluster).not.toHaveBeenCalled();
  });

  it('should destroy Ready cluster before soft-deleting', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(
      makeCluster({
        status: ClusterStatus.Ready,
        k3dClusterName: 'k3d-test',
      })
    );

    const result = await useCase.execute('cluster-1');

    expect(result.ok).toBe(true);
    expect(mockRepo.update).toHaveBeenCalledWith('cluster-1', {
      status: ClusterStatus.Destroying,
    });
    expect(mockK3d.deleteCluster).toHaveBeenCalledWith('k3d-test');
    expect(mockRepo.softDelete).toHaveBeenCalledWith('cluster-1');
  });

  it('should destroy Error cluster before soft-deleting', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(
      makeCluster({
        status: ClusterStatus.Error,
        k3dClusterName: 'k3d-error',
      })
    );

    const result = await useCase.execute('cluster-1');

    expect(result.ok).toBe(true);
    expect(mockK3d.deleteCluster).toHaveBeenCalledWith('k3d-error');
    expect(mockRepo.softDelete).toHaveBeenCalledWith('cluster-1');
  });

  it('should soft-delete even if k3d destroy fails', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(
      makeCluster({
        status: ClusterStatus.Ready,
        k3dClusterName: 'k3d-failing',
      })
    );
    vi.mocked(mockK3d.deleteCluster).mockRejectedValue(new Error('k3d failed'));

    const result = await useCase.execute('cluster-1');

    expect(result.ok).toBe(true);
    expect(mockRepo.softDelete).toHaveBeenCalledWith('cluster-1');
  });

  it('should return error when cluster not found', async () => {
    const result = await useCase.execute('non-existent');

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toBe('Cluster not found: "non-existent"');
  });
});
