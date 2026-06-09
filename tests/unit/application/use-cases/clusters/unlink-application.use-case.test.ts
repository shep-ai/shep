import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnlinkApplicationUseCase } from '@/application/use-cases/clusters/unlink-application.use-case.js';
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

describe('UnlinkApplicationUseCase', () => {
  let useCase: UnlinkApplicationUseCase;
  let mockRepo: IClusterRepository;

  beforeEach(() => {
    mockRepo = createMockClusterRepo();
    useCase = new UnlinkApplicationUseCase(mockRepo);
  });

  it('should unlink application from cluster', async () => {
    const result = await useCase.execute({ clusterId: 'cluster-1', entityId: 'app-1' });

    expect(result.ok).toBe(true);
    expect(mockRepo.unlinkApplication).toHaveBeenCalledWith('cluster-1', 'app-1');
  });
});
