/**
 * ListCodeReviewsUseCase Unit Tests
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListCodeReviewsUseCase } from '@/application/use-cases/code-review/list-code-reviews.use-case.js';
import type { ICodeReviewRepository } from '@/application/ports/output/repositories/code-review-repository.interface.js';
import { CodeReviewStatus } from '@/domain/generated/output.js';
import type { CodeReview } from '@/domain/generated/output.js';

function createMockReview(id: string, overrides?: Partial<CodeReview>): CodeReview {
  return {
    id,
    repositoryPath: '/repo',
    prNumber: 42,
    status: CodeReviewStatus.Completed,
    summary: 'All good',
    comments: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockRepo(): ICodeReviewRepository {
  return {
    create: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(),
    findByFeatureId: vi.fn(),
    findByPrNumber: vi.fn(),
    list: vi.fn(),
  };
}

describe('ListCodeReviewsUseCase', () => {
  let useCase: ListCodeReviewsUseCase;
  let mockRepo: ICodeReviewRepository;

  beforeEach(() => {
    mockRepo = createMockRepo();
    useCase = new ListCodeReviewsUseCase(mockRepo);
  });

  it('should list all reviews with default limit', async () => {
    const reviews = [createMockReview('r-1'), createMockReview('r-2')];
    vi.mocked(mockRepo.list).mockResolvedValue(reviews);

    const result = await useCase.execute();

    expect(result).toHaveLength(2);
    expect(mockRepo.list).toHaveBeenCalledWith(undefined, { limit: 50 });
  });

  it('should filter by repositoryPath', async () => {
    vi.mocked(mockRepo.list).mockResolvedValue([]);

    await useCase.execute({ repositoryPath: '/my-repo' });

    expect(mockRepo.list).toHaveBeenCalledWith('/my-repo', { limit: 50 });
  });

  it('should filter by featureId', async () => {
    const reviews = [createMockReview('r-1', { featureId: 'feat-1' })];
    vi.mocked(mockRepo.findByFeatureId).mockResolvedValue(reviews);

    const result = await useCase.execute({ featureId: 'feat-1' });

    expect(result).toHaveLength(1);
    expect(mockRepo.findByFeatureId).toHaveBeenCalledWith('feat-1');
    expect(mockRepo.list).not.toHaveBeenCalled();
  });

  it('should respect custom limit', async () => {
    vi.mocked(mockRepo.list).mockResolvedValue([]);

    await useCase.execute({ limit: 10 });

    expect(mockRepo.list).toHaveBeenCalledWith(undefined, { limit: 10 });
  });

  it('should return empty array when no reviews exist', async () => {
    vi.mocked(mockRepo.list).mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result).toHaveLength(0);
  });

  it('should pass both repositoryPath and limit', async () => {
    vi.mocked(mockRepo.list).mockResolvedValue([]);

    await useCase.execute({ repositoryPath: '/repo', limit: 5 });

    expect(mockRepo.list).toHaveBeenCalledWith('/repo', { limit: 5 });
  });
});
