import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DestroyClusterUseCase } from '@/application/use-cases/clusters/destroy-cluster.use-case.js';
import type { IClusterRepository } from '@/application/ports/output/repositories/cluster-repository.interface.js';
import type { IK3dService } from '@/application/ports/output/services/k3d-service.interface.js';
import type { IFileSystemService } from '@/application/ports/output/services/file-system-service.interface.js';
import type { Cluster, Repository, Application } from '@/domain/generated/output.js';
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

function createMockFileSystem(): IFileSystemService {
  return {
    removeDirectory: vi.fn(),
    pathExists: vi.fn().mockReturnValue(true),
  };
}

function makeCluster(overrides: Partial<Cluster> = {}): Cluster {
  return {
    id: 'cluster-1',
    name: 'Test Cluster',
    slug: 'test-cluster',
    status: ClusterStatus.Ready,
    k3dClusterName: 'k3d-test',
    kubeconfigPath: '/home/user/.shep/clusters/cluster-1/kubeconfig',
    argoCdEnabled: false,
    argoCdNamespace: 'argocd',
    nodeCount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('DestroyClusterUseCase', () => {
  let useCase: DestroyClusterUseCase;
  let mockRepo: IClusterRepository;
  let mockK3d: IK3dService;
  let mockFs: IFileSystemService;

  beforeEach(() => {
    mockRepo = createMockClusterRepo();
    mockK3d = createMockK3dService();
    mockFs = createMockFileSystem();
    useCase = new DestroyClusterUseCase(mockRepo, mockK3d, mockFs);
  });

  it('should destroy a Ready cluster', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(makeCluster());

    const result = await useCase.execute('cluster-1');

    expect(result.ok).toBe(true);
    expect(mockRepo.update).toHaveBeenCalledWith('cluster-1', {
      status: ClusterStatus.Destroying,
    });
    expect(mockK3d.deleteCluster).toHaveBeenCalledWith('k3d-test');
    expect(mockRepo.update).toHaveBeenCalledWith('cluster-1', {
      status: ClusterStatus.Stopped,
      errorMessage: undefined,
    });
  });

  it('should be a no-op for Stopped cluster', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(makeCluster({ status: ClusterStatus.Stopped }));

    const result = await useCase.execute('cluster-1');

    expect(result.ok).toBe(true);
    expect(mockK3d.deleteCluster).not.toHaveBeenCalled();
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it('should transition to Error when k3d delete fails', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(makeCluster());
    vi.mocked(mockK3d.deleteCluster).mockRejectedValue(new Error('k3d timeout'));

    const result = await useCase.execute('cluster-1');

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toContain('Destroy failed');
    expect(mockRepo.update).toHaveBeenCalledWith('cluster-1', {
      status: ClusterStatus.Error,
      errorMessage: 'Destroy failed: k3d timeout',
    });
  });

  it('should clean up kubeconfig file', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(makeCluster());

    await useCase.execute('cluster-1');

    expect(mockFs.removeDirectory).toHaveBeenCalledWith(
      '/home/user/.shep/clusters/cluster-1/kubeconfig'
    );
  });

  it('should unlink all repositories and applications', async () => {
    const repos: Repository[] = [
      { id: 'repo-1', name: 'r1', path: '/r1', createdAt: new Date(), updatedAt: new Date() },
      { id: 'repo-2', name: 'r2', path: '/r2', createdAt: new Date(), updatedAt: new Date() },
    ];
    const apps: Application[] = [
      {
        id: 'app-1',
        name: 'a1',
        slug: 'a1',
        description: 'Test app',
        repositoryPath: '/a1',
        additionalPaths: [],
        status: 'Active' as any,
        setupComplete: true,
        bedrockEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    vi.mocked(mockRepo.findById).mockResolvedValue(makeCluster());
    vi.mocked(mockRepo.getLinkedRepositories).mockResolvedValue(repos);
    vi.mocked(mockRepo.getLinkedApplications).mockResolvedValue(apps);

    await useCase.execute('cluster-1');

    expect(mockRepo.unlinkRepository).toHaveBeenCalledWith('cluster-1', 'repo-1');
    expect(mockRepo.unlinkRepository).toHaveBeenCalledWith('cluster-1', 'repo-2');
    expect(mockRepo.unlinkApplication).toHaveBeenCalledWith('cluster-1', 'app-1');
  });

  it('should return error when cluster not found', async () => {
    const result = await useCase.execute('non-existent');

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toBe('Cluster not found: "non-existent"');
  });
});
