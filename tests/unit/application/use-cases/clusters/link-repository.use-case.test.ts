import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LinkRepositoryUseCase } from '@/application/use-cases/clusters/link-repository.use-case.js';
import type { IClusterRepository } from '@/application/ports/output/repositories/cluster-repository.interface.js';
import type { IRepositoryRepository } from '@/application/ports/output/repositories/repository-repository.interface.js';
import type { Cluster, Repository, ClusterRepository } from '@/domain/generated/output.js';
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

function createMockRepoRepo(): IRepositoryRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
    findByPath: vi.fn().mockResolvedValue(null),
    findByPathIncludingDeleted: vi.fn().mockResolvedValue(null),
    findByRemoteUrl: vi.fn().mockResolvedValue(null),
    findByUpstreamUrl: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    remove: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
    update: vi.fn(),
  };
}

const sampleCluster: Cluster = {
  id: 'cluster-1',
  name: 'Test Cluster',
  slug: 'test-cluster',
  status: ClusterStatus.Stopped,
  argoCdEnabled: false,
  argoCdNamespace: 'argocd',
  nodeCount: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const sampleRepo: Repository = {
  id: 'repo-1',
  name: 'my-repo',
  path: '/repos/my-repo',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('LinkRepositoryUseCase', () => {
  let useCase: LinkRepositoryUseCase;
  let mockClusterRepo: IClusterRepository;
  let mockRepoRepo: IRepositoryRepository;

  beforeEach(() => {
    mockClusterRepo = createMockClusterRepo();
    mockRepoRepo = createMockRepoRepo();
    useCase = new LinkRepositoryUseCase(mockClusterRepo, mockRepoRepo);
  });

  it('should link repository to cluster', async () => {
    vi.mocked(mockClusterRepo.findById).mockResolvedValue(sampleCluster);
    vi.mocked(mockRepoRepo.findById).mockResolvedValue(sampleRepo);
    const mockLink: ClusterRepository = {
      id: 'link-1',
      clusterId: 'cluster-1',
      repositoryId: 'repo-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(mockClusterRepo.linkRepository).mockResolvedValue(mockLink);

    const result = await useCase.execute({ clusterId: 'cluster-1', entityId: 'repo-1' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.link).toEqual(mockLink);
    expect(mockClusterRepo.linkRepository).toHaveBeenCalledWith('cluster-1', 'repo-1');
  });

  it('should return error when cluster not found', async () => {
    vi.mocked(mockRepoRepo.findById).mockResolvedValue(sampleRepo);

    const result = await useCase.execute({ clusterId: 'non-existent', entityId: 'repo-1' });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toBe('Cluster not found: "non-existent"');
  });

  it('should return error when repository not found', async () => {
    vi.mocked(mockClusterRepo.findById).mockResolvedValue(sampleCluster);

    const result = await useCase.execute({ clusterId: 'cluster-1', entityId: 'non-existent' });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toBe('Repository not found: "non-existent"');
  });
});
