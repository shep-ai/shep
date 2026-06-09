import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListClustersUseCase } from '@/application/use-cases/clusters/list-clusters.use-case.js';
import type { IClusterRepository } from '@/application/ports/output/repositories/cluster-repository.interface.js';
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

const sampleClusters: Cluster[] = [
  {
    id: 'cluster-1',
    name: 'Cluster A',
    slug: 'cluster-a',
    status: ClusterStatus.Ready,
    argoCdEnabled: false,
    argoCdNamespace: 'argocd',
    nodeCount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'cluster-2',
    name: 'Cluster B',
    slug: 'cluster-b',
    status: ClusterStatus.Stopped,
    argoCdEnabled: true,
    argoCdNamespace: 'argocd',
    nodeCount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

describe('ListClustersUseCase', () => {
  let useCase: ListClustersUseCase;
  let mockRepo: IClusterRepository;

  beforeEach(() => {
    mockRepo = createMockClusterRepo();
    useCase = new ListClustersUseCase(mockRepo);
  });

  it('should return all clusters', async () => {
    vi.mocked(mockRepo.list).mockResolvedValue(sampleClusters);

    const result = await useCase.execute();

    expect(result).toHaveLength(2);
    expect(mockRepo.list).toHaveBeenCalledWith(undefined);
  });

  it('should filter clusters by status', async () => {
    vi.mocked(mockRepo.list).mockResolvedValue([sampleClusters[0]]);

    const result = await useCase.execute({ status: ClusterStatus.Ready });

    expect(mockRepo.list).toHaveBeenCalledWith(ClusterStatus.Ready);
    expect(result).toHaveLength(1);
  });

  it('should return empty array when no clusters exist', async () => {
    const result = await useCase.execute();

    expect(result).toEqual([]);
  });
});
