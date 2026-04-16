import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateClusterUseCase } from '@/application/use-cases/clusters/update-cluster.use-case.js';
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

describe('UpdateClusterUseCase', () => {
  let useCase: UpdateClusterUseCase;
  let mockRepo: IClusterRepository;

  beforeEach(() => {
    mockRepo = createMockClusterRepo();
    useCase = new UpdateClusterUseCase(mockRepo);
  });

  it('should update cluster name and regenerate slug', async () => {
    const updated = { ...sampleCluster, name: 'New Name', slug: 'new-name' };
    vi.mocked(mockRepo.findById)
      .mockResolvedValueOnce(sampleCluster)
      .mockResolvedValueOnce(updated);

    const result = await useCase.execute('cluster-1', { name: 'New Name' });

    expect(result.ok).toBe(true);
    expect(mockRepo.update).toHaveBeenCalledWith('cluster-1', {
      name: 'New Name',
      slug: 'new-name',
    });
  });

  it('should update description', async () => {
    const updated = { ...sampleCluster, description: 'Updated desc' };
    vi.mocked(mockRepo.findById)
      .mockResolvedValueOnce(sampleCluster)
      .mockResolvedValueOnce(updated);

    const result = await useCase.execute('cluster-1', { description: 'Updated desc' });

    expect(result.ok).toBe(true);
    expect(mockRepo.update).toHaveBeenCalledWith('cluster-1', {
      description: 'Updated desc',
    });
  });

  it('should update argoCdEnabled', async () => {
    const updated = { ...sampleCluster, argoCdEnabled: true };
    vi.mocked(mockRepo.findById)
      .mockResolvedValueOnce(sampleCluster)
      .mockResolvedValueOnce(updated);

    const result = await useCase.execute('cluster-1', { argoCdEnabled: true });

    expect(result.ok).toBe(true);
    expect(mockRepo.update).toHaveBeenCalledWith('cluster-1', {
      argoCdEnabled: true,
    });
  });

  it('should return error when cluster not found', async () => {
    const result = await useCase.execute('non-existent', { name: 'New' });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toBe('Cluster not found: "non-existent"');
  });

  it('should reject empty name', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(sampleCluster);

    const result = await useCase.execute('cluster-1', { name: '  ' });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toBe('Cluster name cannot be empty.');
    expect(mockRepo.update).not.toHaveBeenCalled();
  });
});
