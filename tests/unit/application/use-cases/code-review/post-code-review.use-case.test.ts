/**
 * PostCodeReviewUseCase Unit Tests
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostCodeReviewUseCase } from '@/application/use-cases/code-review/post-code-review.use-case.js';
import type { ICodeReviewRepository } from '@/application/ports/output/repositories/code-review-repository.interface.js';
import type { IPlatformReviewService } from '@/application/ports/output/services/platform-review-service.interface.js';
import { CodeReviewStatus, CommentSide } from '@/domain/generated/output.js';
import type { CodeReview, ReviewComment } from '@/domain/generated/output.js';

function createMockReview(overrides?: Partial<CodeReview>): CodeReview {
  return {
    id: 'review-1',
    repositoryPath: '/repo',
    prNumber: 42,
    prUrl: 'https://github.com/octocat/hello-world/pull/42',
    status: CodeReviewStatus.Completed,
    summary: 'Found 2 issues',
    comments: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockComment(overrides?: Partial<ReviewComment>): ReviewComment {
  return {
    path: 'src/index.ts',
    line: 10,
    body: 'Potential null pointer',
    side: CommentSide.Right,
    inDiffRange: true,
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

function createMockPlatformService(): IPlatformReviewService {
  return {
    fetchPrMetadata: vi.fn(),
    fetchPrDiff: vi.fn(),
    postReview: vi.fn(),
    fetchExistingComments: vi.fn(),
  };
}

describe('PostCodeReviewUseCase', () => {
  let useCase: PostCodeReviewUseCase;
  let mockRepo: ICodeReviewRepository;
  let mockPlatform: IPlatformReviewService;

  beforeEach(() => {
    mockRepo = createMockRepo();
    mockPlatform = createMockPlatformService();
    useCase = new PostCodeReviewUseCase(mockRepo, mockPlatform);
  });

  it('should post valid comments as inline review comments', async () => {
    const review = createMockReview({
      comments: [
        createMockComment({ path: 'src/a.ts', line: 5, body: 'Bug here', inDiffRange: true }),
        createMockComment({ path: 'src/b.ts', line: 15, body: 'Issue here', inDiffRange: true }),
      ],
    });
    vi.mocked(mockRepo.findById).mockResolvedValue(review);
    vi.mocked(mockPlatform.postReview).mockResolvedValue({
      reviewUrl: 'https://github.com/octocat/hello-world/pull/42#pullrequestreview-123',
    });

    const result = await useCase.execute('review-1');

    expect(result.status).toBe(CodeReviewStatus.Posted);
    expect(result.reviewUrl).toBe(
      'https://github.com/octocat/hello-world/pull/42#pullrequestreview-123'
    );
    expect(mockPlatform.postReview).toHaveBeenCalledWith(
      'octocat',
      'hello-world',
      42,
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ path: 'src/a.ts', line: 5 }),
        expect.objectContaining({ path: 'src/b.ts', line: 15 }),
      ])
    );
    expect(mockRepo.update).toHaveBeenCalled();
  });

  it('should move invalid comments to the review body', async () => {
    const review = createMockReview({
      comments: [
        createMockComment({ path: 'src/a.ts', line: 5, body: 'Valid', inDiffRange: true }),
        createMockComment({
          path: 'src/b.ts',
          line: 999,
          body: 'Outside diff',
          inDiffRange: false,
        }),
      ],
    });
    vi.mocked(mockRepo.findById).mockResolvedValue(review);
    vi.mocked(mockPlatform.postReview).mockResolvedValue({
      reviewUrl: 'https://github.com/octocat/hello-world/pull/42#pullrequestreview-456',
    });

    await useCase.execute('review-1');

    // Should only post the valid comment as inline
    const postCall = vi.mocked(mockPlatform.postReview).mock.calls[0];
    expect(postCall[4]).toHaveLength(1);
    expect(postCall[4][0].path).toBe('src/a.ts');

    // Body should contain the invalid comment
    const body = postCall[3] as string;
    expect(body).toContain('Outside diff');
    expect(body).toContain('src/b.ts:999');
  });

  it('should throw when review status is not Completed', async () => {
    const review = createMockReview({ status: CodeReviewStatus.Pending });
    vi.mocked(mockRepo.findById).mockResolvedValue(review);

    await expect(useCase.execute('review-1')).rejects.toThrow(
      /cannot post review with status "Pending"/i
    );
    expect(mockPlatform.postReview).not.toHaveBeenCalled();
  });

  it('should throw when review is not found', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(null);

    await expect(useCase.execute('non-existent')).rejects.toThrow(/not found/i);
  });

  it('should preserve review data when posting fails', async () => {
    const review = createMockReview({
      comments: [createMockComment({ inDiffRange: true })],
    });
    vi.mocked(mockRepo.findById).mockResolvedValue(review);
    vi.mocked(mockPlatform.postReview).mockRejectedValue(new Error('API Error'));

    await expect(useCase.execute('review-1')).rejects.toThrow(/failed to post/i);

    // Should NOT update the review status to Failed — data is still valid
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it('should format suggestions with GitHub suggestion syntax', async () => {
    const review = createMockReview({
      comments: [
        createMockComment({
          path: 'src/fix.ts',
          line: 20,
          body: 'Use const',
          suggestion: 'const x = 5;',
          inDiffRange: true,
        }),
      ],
    });
    vi.mocked(mockRepo.findById).mockResolvedValue(review);
    vi.mocked(mockPlatform.postReview).mockResolvedValue({
      reviewUrl: 'https://github.com/octocat/hello-world/pull/42#pullrequestreview-789',
    });

    await useCase.execute('review-1');

    const postCall = vi.mocked(mockPlatform.postReview).mock.calls[0];
    const commentBody = postCall[4][0].body;
    expect(commentBody).toContain('```suggestion');
    expect(commentBody).toContain('const x = 5;');
    expect(commentBody).toContain('```');
  });

  it('should post summary-only review when comments array is empty', async () => {
    const review = createMockReview({ comments: [] });
    vi.mocked(mockRepo.findById).mockResolvedValue(review);
    vi.mocked(mockPlatform.postReview).mockResolvedValue({
      reviewUrl: 'https://github.com/octocat/hello-world/pull/42#pullrequestreview-000',
    });

    const result = await useCase.execute('review-1');

    expect(result.status).toBe(CodeReviewStatus.Posted);
    const postCall = vi.mocked(mockPlatform.postReview).mock.calls[0];
    expect(postCall[4]).toHaveLength(0); // No inline comments
    expect(postCall[3]).toBe('Found 2 issues'); // Just the summary
  });

  it('should throw when prUrl is missing', async () => {
    const review = createMockReview({ prUrl: undefined });
    vi.mocked(mockRepo.findById).mockResolvedValue(review);

    await expect(useCase.execute('review-1')).rejects.toThrow(/pr url.*missing/i);
  });

  it('should handle multi-line comments with startLine', async () => {
    const review = createMockReview({
      comments: [
        createMockComment({
          path: 'src/multi.ts',
          line: 25,
          startLine: 20,
          body: 'Multi-line issue',
          inDiffRange: true,
        }),
      ],
    });
    vi.mocked(mockRepo.findById).mockResolvedValue(review);
    vi.mocked(mockPlatform.postReview).mockResolvedValue({
      reviewUrl: 'https://github.com/octocat/hello-world/pull/42#pullrequestreview-multi',
    });

    await useCase.execute('review-1');

    const postCall = vi.mocked(mockPlatform.postReview).mock.calls[0];
    expect(postCall[4][0].startLine).toBe(20);
    expect(postCall[4][0].line).toBe(25);
  });
});
