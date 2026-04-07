import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeleteRepositoryUseCase } from '@/application/use-cases/repositories/delete-repository.use-case.js';
import { type DeleteFeatureUseCase } from '@/application/use-cases/features/delete-feature.use-case.js';
import type { IRepositoryRepository } from '@/application/ports/output/repositories/repository-repository.interface.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { Repository, Feature } from '@/domain/generated/output.js';
import { SdlcLifecycle } from '@/domain/generated/output.js';

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

function createMockFeatureRepo(): IFeatureRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
    findByIdPrefix: vi.fn().mockResolvedValue(null),
    findBySlug: vi.fn().mockResolvedValue(null),
    findByBranch: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    findByParentId: vi.fn().mockResolvedValue([]),
    delete: vi.fn(),
    softDelete: vi.fn(),
  };
}

const sampleRepo: Repository = {
  id: 'repo-abc-123',
  name: 'my-project',
  path: '/home/user/my-project',
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeFeature(id: string): Feature {
  return {
    id,
    name: `Feature ${id}`,
    slug: `feature-${id}`,
    repositoryPath: sampleRepo.path,
    branch: `feat/${id}`,
    lifecycle: SdlcLifecycle.Requirements,
    push: false,
    openPr: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Feature;
}

describe('DeleteRepositoryUseCase', () => {
  let useCase: DeleteRepositoryUseCase;
  let mockRepo: IRepositoryRepository;
  let mockFeatureRepo: IFeatureRepository;
  let mockDeleteFeature: DeleteFeatureUseCase;

  beforeEach(() => {
    mockRepo = createMockRepo();
    mockFeatureRepo = createMockFeatureRepo();
    mockDeleteFeature = {
      execute: vi.fn().mockResolvedValue({}),
    } as unknown as DeleteFeatureUseCase;
    useCase = new DeleteRepositoryUseCase(mockRepo, mockFeatureRepo, mockDeleteFeature);
  });

  it('should soft-delete an existing repository', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(sampleRepo);

    await useCase.execute('repo-abc-123');

    expect(mockRepo.findById).toHaveBeenCalledWith('repo-abc-123');
    expect(mockRepo.softDelete).toHaveBeenCalledWith('repo-abc-123');
  });

  it('should throw when repository is not found', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(null);

    await expect(useCase.execute('non-existent')).rejects.toThrow(
      'Repository not found: "non-existent"'
    );
    expect(mockRepo.softDelete).not.toHaveBeenCalled();
  });

  it('should not call remove (hard delete)', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(sampleRepo);

    await useCase.execute('repo-abc-123');

    expect(mockRepo.remove).not.toHaveBeenCalled();
  });

  it('should delete all child features before soft-deleting the repository', async () => {
    const features = [makeFeature('feat-1'), makeFeature('feat-2')];
    vi.mocked(mockRepo.findById).mockResolvedValue(sampleRepo);
    vi.mocked(mockFeatureRepo.list).mockResolvedValue(features);

    await useCase.execute('repo-abc-123');

    expect(mockFeatureRepo.list).toHaveBeenCalledWith({
      includeArchived: true,
      repositoryPath: sampleRepo.path,
    });
    expect(mockDeleteFeature.execute).toHaveBeenCalledWith('feat-1');
    expect(mockDeleteFeature.execute).toHaveBeenCalledWith('feat-2');
    expect(mockRepo.softDelete).toHaveBeenCalledWith('repo-abc-123');
  });

  it('should soft-delete the repository even when there are no child features', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(sampleRepo);
    vi.mocked(mockFeatureRepo.list).mockResolvedValue([]);

    await useCase.execute('repo-abc-123');

    expect(mockFeatureRepo.list).toHaveBeenCalledWith({
      includeArchived: true,
      repositoryPath: sampleRepo.path,
    });
    expect(mockDeleteFeature.execute).not.toHaveBeenCalled();
    expect(mockRepo.softDelete).toHaveBeenCalledWith('repo-abc-123');
  });
});
