/**
 * SQLiteCodeReviewRepository Integration Tests
 *
 * Tests for the SQLite implementation of ICodeReviewRepository.
 * Uses an in-memory SQLite database with full migrations applied.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase, tableExists } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteCodeReviewRepository } from '@/infrastructure/repositories/sqlite-code-review.repository.js';
import { CodeReviewStatus, CommentSide } from '@/domain/generated/output.js';
import type { CodeReview, ReviewComment } from '@/domain/generated/output.js';

describe('SQLiteCodeReviewRepository', () => {
  let db: Database.Database;
  let repo: SQLiteCodeReviewRepository;

  const NOW = new Date('2026-04-01T10:00:00Z');
  const LATER = new Date('2026-04-01T11:00:00Z');

  function createTestComment(overrides: Partial<ReviewComment> = {}): ReviewComment {
    return {
      path: 'src/index.ts',
      line: 10,
      body: 'Potential null pointer dereference',
      side: CommentSide.Right,
      inDiffRange: true,
      ...overrides,
    };
  }

  function createTestReview(overrides: Partial<CodeReview> = {}): CodeReview {
    return {
      id: 'review-001',
      repositoryPath: '/repos/my-project',
      prNumber: 42,
      status: CodeReviewStatus.Pending,
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    };
  }

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    expect(tableExists(db, 'code_reviews')).toBe(true);
    repo = new SQLiteCodeReviewRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create() and findById()', () => {
    it('creates and retrieves a review by id', async () => {
      const review = createTestReview();
      await repo.create(review);

      const found = await repo.findById('review-001');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('review-001');
      expect(found!.repositoryPath).toBe('/repos/my-project');
      expect(found!.prNumber).toBe(42);
      expect(found!.status).toBe(CodeReviewStatus.Pending);
    });

    it('returns null for nonexistent id', async () => {
      const result = await repo.findById('nonexistent');
      expect(result).toBeNull();
    });

    it('persists all optional fields correctly', async () => {
      const comments: ReviewComment[] = [
        createTestComment(),
        createTestComment({
          path: 'src/utils.ts',
          line: 25,
          suggestion: 'return x ?? 0;',
          startLine: 23,
          inDiffRange: false,
        }),
      ];
      const review = createTestReview({
        featureId: 'feat-001',
        prUrl: 'https://github.com/org/repo/pull/42',
        status: CodeReviewStatus.Completed,
        summary: 'Found 2 issues',
        comments,
        reviewUrl: 'https://github.com/org/repo/pull/42#pullrequestreview-123',
        agentModel: 'claude-sonnet-4-5',
        tokenUsage: { inputTokens: 1000, outputTokens: 500 },
      });
      await repo.create(review);

      const found = await repo.findById('review-001');
      expect(found!.featureId).toBe('feat-001');
      expect(found!.prUrl).toBe('https://github.com/org/repo/pull/42');
      expect(found!.status).toBe(CodeReviewStatus.Completed);
      expect(found!.summary).toBe('Found 2 issues');
      expect(found!.comments).toHaveLength(2);
      expect(found!.comments![0].path).toBe('src/index.ts');
      expect(found!.comments![0].line).toBe(10);
      expect(found!.comments![0].side).toBe(CommentSide.Right);
      expect(found!.comments![0].inDiffRange).toBe(true);
      expect(found!.comments![1].suggestion).toBe('return x ?? 0;');
      expect(found!.comments![1].startLine).toBe(23);
      expect(found!.comments![1].inDiffRange).toBe(false);
      expect(found!.reviewUrl).toBe('https://github.com/org/repo/pull/42#pullrequestreview-123');
      expect(found!.agentModel).toBe('claude-sonnet-4-5');
      expect(found!.tokenUsage).toEqual({ inputTokens: 1000, outputTokens: 500 });
    });

    it('persists review with no optional fields', async () => {
      const review = createTestReview();
      await repo.create(review);

      const found = await repo.findById('review-001');
      expect(found!.featureId).toBeUndefined();
      expect(found!.prUrl).toBeUndefined();
      expect(found!.summary).toBeUndefined();
      expect(found!.comments).toBeUndefined();
      expect(found!.reviewUrl).toBeUndefined();
      expect(found!.agentModel).toBeUndefined();
      expect(found!.tokenUsage).toBeUndefined();
      expect(found!.errorMessage).toBeUndefined();
    });
  });

  describe('update()', () => {
    it('updates mutable fields', async () => {
      await repo.create(createTestReview());

      const comments: ReviewComment[] = [createTestComment()];
      const updated = createTestReview({
        status: CodeReviewStatus.Completed,
        summary: 'Review complete',
        comments,
        agentModel: 'claude-sonnet-4-5',
        tokenUsage: { inputTokens: 2000, outputTokens: 800 },
        updatedAt: LATER,
      });
      await repo.update(updated);

      const found = await repo.findById('review-001');
      expect(found!.status).toBe(CodeReviewStatus.Completed);
      expect(found!.summary).toBe('Review complete');
      expect(found!.comments).toHaveLength(1);
      expect(found!.agentModel).toBe('claude-sonnet-4-5');
      expect(found!.tokenUsage).toEqual({ inputTokens: 2000, outputTokens: 800 });
      expect(found!.updatedAt).toEqual(LATER);
    });

    it('updates status to Failed with error message', async () => {
      await repo.create(createTestReview());

      const updated = createTestReview({
        status: CodeReviewStatus.Failed,
        errorMessage: 'Agent timed out after 120s',
        updatedAt: LATER,
      });
      await repo.update(updated);

      const found = await repo.findById('review-001');
      expect(found!.status).toBe(CodeReviewStatus.Failed);
      expect(found!.errorMessage).toBe('Agent timed out after 120s');
    });
  });

  describe('findByFeatureId()', () => {
    it('returns reviews for a given feature', async () => {
      await repo.create(createTestReview({ id: 'review-001', featureId: 'feat-001' }));
      await repo.create(
        createTestReview({
          id: 'review-002',
          featureId: 'feat-001',
          prNumber: 43,
          createdAt: LATER,
          updatedAt: LATER,
        })
      );
      await repo.create(createTestReview({ id: 'review-003', featureId: 'feat-002' }));

      const results = await repo.findByFeatureId('feat-001');
      expect(results).toHaveLength(2);
      // Newest first
      expect(results[0].id).toBe('review-002');
      expect(results[1].id).toBe('review-001');
    });

    it('returns empty array when no reviews match', async () => {
      const results = await repo.findByFeatureId('nonexistent');
      expect(results).toHaveLength(0);
    });
  });

  describe('findByPrNumber()', () => {
    it('returns reviews for a given repo and PR number', async () => {
      await repo.create(createTestReview({ id: 'review-001' }));
      await repo.create(
        createTestReview({
          id: 'review-002',
          prNumber: 42,
          createdAt: LATER,
          updatedAt: LATER,
        })
      );
      await repo.create(createTestReview({ id: 'review-003', prNumber: 99 }));

      const results = await repo.findByPrNumber('/repos/my-project', 42);
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('review-002');
      expect(results[1].id).toBe('review-001');
    });

    it('scopes to repository path', async () => {
      await repo.create(createTestReview({ id: 'review-001' }));
      await repo.create(
        createTestReview({
          id: 'review-002',
          repositoryPath: '/repos/other-project',
        })
      );

      const results = await repo.findByPrNumber('/repos/my-project', 42);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('review-001');
    });
  });

  describe('list()', () => {
    it('returns reviews ordered by created_at desc', async () => {
      await repo.create(createTestReview({ id: 'review-001', createdAt: NOW, updatedAt: NOW }));
      await repo.create(createTestReview({ id: 'review-002', createdAt: LATER, updatedAt: LATER }));

      const results = await repo.list();
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('review-002');
      expect(results[1].id).toBe('review-001');
    });

    it('filters by repository path', async () => {
      await repo.create(createTestReview({ id: 'review-001' }));
      await repo.create(
        createTestReview({
          id: 'review-002',
          repositoryPath: '/repos/other-project',
        })
      );

      const results = await repo.list('/repos/my-project');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('review-001');
    });

    it('respects limit parameter', async () => {
      await repo.create(createTestReview({ id: 'review-001' }));
      await repo.create(
        createTestReview({
          id: 'review-002',
          createdAt: LATER,
          updatedAt: LATER,
        })
      );
      await repo.create(
        createTestReview({
          id: 'review-003',
          createdAt: new Date('2026-04-01T12:00:00Z'),
          updatedAt: new Date('2026-04-01T12:00:00Z'),
        })
      );

      const results = await repo.list(undefined, { limit: 2 });
      expect(results).toHaveLength(2);
    });

    it('returns all reviews when no repository path specified', async () => {
      await repo.create(createTestReview({ id: 'review-001' }));
      await repo.create(
        createTestReview({
          id: 'review-002',
          repositoryPath: '/repos/other-project',
        })
      );

      const results = await repo.list();
      expect(results).toHaveLength(2);
    });
  });
});
