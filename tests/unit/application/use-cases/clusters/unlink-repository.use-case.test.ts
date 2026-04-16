import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnlinkRepositoryUseCase } from '@/application/use-cases/clusters/unlink-repository.use-case.js';
import type { IClusterRepository } from '@/application/ports/output/repositories/cluster-repository.interface.js';

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

describe('UnlinkRepositoryUseCase', () => {
  let useCase: UnlinkRepositoryUseCase;
  let mockRepo: IClusterRepository;

  beforeEach(() => {
    mockRepo = createMockClusterRepo();
    useCase = new UnlinkRepositoryUseCase(mockRepo);
  });

  it('should unlink repository from cluster', async () => {
    const result = await useCase.execute({ clusterId: 'cluster-1', entityId: 'repo-1' });

    expect(result.ok).toBe(true);
    expect(mockRepo.unlinkRepository).toHaveBeenCalledWith('cluster-1', 'repo-1');
  });
});
