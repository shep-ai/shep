import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListRepositoriesUseCase } from '@/application/use-cases/repositories/list-repositories.use-case.js';
import type { IRepositoryRepository } from '@/application/ports/output/repositories/repository-repository.interface.js';
import type { Repository } from '@/domain/generated/output.js';

function createMockRepo(): IRepositoryRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
    findByPath: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    remove: vi.fn(),
    softDelete: vi.fn(),
    findByPathIncludingDeleted: vi.fn().mockResolvedValue(null),
    findByRemoteUrl: vi.fn().mockResolvedValue(null),
    findByUpstreamUrl: vi.fn().mockResolvedValue(null),
    restore: vi.fn(),
    update: vi.fn(),
  };
}

describe('ListRepositoriesUseCase', () => {
  let useCase: ListRepositoriesUseCase;
  let mockRepo: IRepositoryRepository;

  beforeEach(() => {
    mockRepo = createMockRepo();
    useCase = new ListRepositoriesUseCase(mockRepo);
  });

  it('should delegate to repository.list()', async () => {
    const repos: Repository[] = [
      {
        id: '1',
        name: 'repo-a',
        path: '/repos/a',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '2',
        name: 'repo-b',
        path: '/repos/b',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    vi.mocked(mockRepo.list).mockResolvedValue(repos);

    const result = await useCase.execute();

    expect(mockRepo.list).toHaveBeenCalled();
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('repo-a');
  });

  it('should return empty array when no repositories exist', async () => {
    const result = await useCase.execute();

    expect(result).toEqual([]);
  });
});
