import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetClusterUseCase } from '@/application/use-cases/clusters/get-cluster.use-case.js';
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

describe('GetClusterUseCase', () => {
  let useCase: GetClusterUseCase;
  let mockRepo: IClusterRepository;

  beforeEach(() => {
    mockRepo = createMockClusterRepo();
    useCase = new GetClusterUseCase(mockRepo);
  });

  it('should return cluster by ID', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(sampleCluster);

    const result = await useCase.execute('cluster-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.cluster).toEqual(sampleCluster);
    expect(mockRepo.findById).toHaveBeenCalledWith('cluster-1');
  });

  it('should return error when cluster not found', async () => {
    const result = await useCase.execute('non-existent');

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toBe('Cluster not found: "non-existent"');
  });
});
