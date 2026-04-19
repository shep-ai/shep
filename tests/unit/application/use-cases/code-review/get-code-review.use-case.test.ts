/**
 * GetCodeReviewUseCase Unit Tests
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetCodeReviewUseCase } from '@/application/use-cases/code-review/get-code-review.use-case.js';
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

describe('GetCodeReviewUseCase', () => {
  let useCase: GetCodeReviewUseCase;
  let mockRepo: ICodeReviewRepository;

  beforeEach(() => {
    mockRepo = createMockRepo();
    useCase = new GetCodeReviewUseCase(mockRepo);
  });

  it('should return code review for valid ID', async () => {
    const review = createMockReview('review-1');
    vi.mocked(mockRepo.findById).mockResolvedValue(review);

    const result = await useCase.execute('review-1');

    expect(result.id).toBe('review-1');
    expect(result.status).toBe(CodeReviewStatus.Completed);
    expect(mockRepo.findById).toHaveBeenCalledWith('review-1');
  });

  it('should throw descriptive error when review not found', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(null);

    await expect(useCase.execute('non-existent')).rejects.toThrow(
      'Code review not found: "non-existent"'
    );
  });

  it('should include ID in error message', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(null);

    await expect(useCase.execute('abc-123')).rejects.toThrow('abc-123');
  });

  it('should return the full review object from repository', async () => {
    const review = createMockReview('review-2', {
      summary: 'Found issues',
      prNumber: 99,
      status: CodeReviewStatus.Posted,
    });
    vi.mocked(mockRepo.findById).mockResolvedValue(review);

    const result = await useCase.execute('review-2');

    expect(result.summary).toBe('Found issues');
    expect(result.prNumber).toBe(99);
    expect(result.status).toBe(CodeReviewStatus.Posted);
  });
});
