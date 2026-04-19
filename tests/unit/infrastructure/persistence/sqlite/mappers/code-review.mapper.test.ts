/**
 * CodeReview Database Mapper Unit Tests
 *
 * Tests for toDatabase() and fromDatabase() mapping functions.
 * Covers all field mappings, JSON serialization, and optional field handling.
 */

import { describe, it, expect } from 'vitest';
import {
  toDatabase,
  fromDatabase,
  type CodeReviewRow,
} from '@/infrastructure/persistence/sqlite/mappers/code-review.mapper.js';
import { CodeReviewStatus, CommentSide } from '@/domain/generated/output.js';
import type { CodeReview, ReviewComment } from '@/domain/generated/output.js';

const NOW = new Date('2026-04-01T10:00:00Z');
const NOW_MS = NOW.getTime();

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

function createTestRow(overrides: Partial<CodeReviewRow> = {}): CodeReviewRow {
  return {
    id: 'review-001',
    feature_id: null,
    repository_path: '/repos/my-project',
    pr_number: 42,
    pr_url: null,
    status: 'Pending',
    summary: null,
    comments: null,
    review_url: null,
    agent_model: null,
    token_usage: null,
    error_message: null,
    created_at: NOW_MS,
    updated_at: NOW_MS,
    ...overrides,
  };
}

describe('CodeReview Mapper', () => {
  describe('toDatabase()', () => {
    it('maps all fields correctly when fully populated', () => {
      const comments: ReviewComment[] = [
        createTestComment(),
        createTestComment({ path: 'src/utils.ts', line: 25, suggestion: 'return x ?? 0;' }),
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
        errorMessage: undefined,
      });

      const row = toDatabase(review);

      expect(row.id).toBe('review-001');
      expect(row.feature_id).toBe('feat-001');
      expect(row.repository_path).toBe('/repos/my-project');
      expect(row.pr_number).toBe(42);
      expect(row.pr_url).toBe('https://github.com/org/repo/pull/42');
      expect(row.status).toBe('Completed');
      expect(row.summary).toBe('Found 2 issues');
      expect(row.comments).toBe(JSON.stringify(comments));
      expect(row.review_url).toBe('https://github.com/org/repo/pull/42#pullrequestreview-123');
      expect(row.agent_model).toBe('claude-sonnet-4-5');
      expect(row.token_usage).toBe(JSON.stringify({ inputTokens: 1000, outputTokens: 500 }));
      expect(row.error_message).toBeNull();
      expect(row.created_at).toBe(NOW_MS);
      expect(row.updated_at).toBe(NOW_MS);
    });

    it('maps optional fields to null when undefined', () => {
      const review = createTestReview();
      const row = toDatabase(review);

      expect(row.feature_id).toBeNull();
      expect(row.pr_url).toBeNull();
      expect(row.summary).toBeNull();
      expect(row.comments).toBeNull();
      expect(row.review_url).toBeNull();
      expect(row.agent_model).toBeNull();
      expect(row.token_usage).toBeNull();
      expect(row.error_message).toBeNull();
    });

    it('serializes empty comments array as null', () => {
      const review = createTestReview({ comments: [] });
      const row = toDatabase(review);
      expect(row.comments).toBeNull();
    });

    it('handles Date and number timestamps', () => {
      const reviewWithDate = createTestReview({ createdAt: NOW, updatedAt: NOW });
      const rowFromDate = toDatabase(reviewWithDate);
      expect(rowFromDate.created_at).toBe(NOW_MS);
      expect(rowFromDate.updated_at).toBe(NOW_MS);

      const reviewWithNumber = createTestReview({ createdAt: NOW_MS, updatedAt: NOW_MS });
      const rowFromNumber = toDatabase(reviewWithNumber);
      expect(rowFromNumber.created_at).toBe(NOW_MS);
      expect(rowFromNumber.updated_at).toBe(NOW_MS);
    });
  });

  describe('fromDatabase()', () => {
    it('maps all row fields to domain object', () => {
      const comments: ReviewComment[] = [createTestComment()];
      const row = createTestRow({
        feature_id: 'feat-001',
        pr_url: 'https://github.com/org/repo/pull/42',
        status: 'Completed',
        summary: 'Found issues',
        comments: JSON.stringify(comments),
        review_url: 'https://github.com/org/repo/pull/42#pullrequestreview-123',
        agent_model: 'claude-sonnet-4-5',
        token_usage: JSON.stringify({ inputTokens: 1000, outputTokens: 500 }),
        error_message: null,
      });

      const review = fromDatabase(row);

      expect(review.id).toBe('review-001');
      expect(review.featureId).toBe('feat-001');
      expect(review.repositoryPath).toBe('/repos/my-project');
      expect(review.prNumber).toBe(42);
      expect(review.prUrl).toBe('https://github.com/org/repo/pull/42');
      expect(review.status).toBe(CodeReviewStatus.Completed);
      expect(review.summary).toBe('Found issues');
      expect(review.comments).toEqual(comments);
      expect(review.reviewUrl).toBe('https://github.com/org/repo/pull/42#pullrequestreview-123');
      expect(review.agentModel).toBe('claude-sonnet-4-5');
      expect(review.tokenUsage).toEqual({ inputTokens: 1000, outputTokens: 500 });
      expect(review.errorMessage).toBeUndefined();
    });

    it('maps null row fields to undefined', () => {
      const row = createTestRow();
      const review = fromDatabase(row);

      expect(review.featureId).toBeUndefined();
      expect(review.prUrl).toBeUndefined();
      expect(review.summary).toBeUndefined();
      expect(review.comments).toBeUndefined();
      expect(review.reviewUrl).toBeUndefined();
      expect(review.agentModel).toBeUndefined();
      expect(review.tokenUsage).toBeUndefined();
      expect(review.errorMessage).toBeUndefined();
    });

    it('converts timestamps to Date objects', () => {
      const row = createTestRow({ created_at: NOW_MS, updated_at: NOW_MS });
      const review = fromDatabase(row);

      expect(review.createdAt).toEqual(NOW);
      expect(review.updatedAt).toEqual(NOW);
    });
  });

  describe('roundtrip (toDatabase -> fromDatabase)', () => {
    it('preserves all fields through roundtrip', () => {
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
      const original = createTestReview({
        featureId: 'feat-001',
        prUrl: 'https://github.com/org/repo/pull/42',
        status: CodeReviewStatus.Posted,
        summary: 'LGTM with minor suggestions',
        comments,
        reviewUrl: 'https://github.com/org/repo/pull/42#pullrequestreview-123',
        agentModel: 'claude-sonnet-4-5',
        tokenUsage: { inputTokens: 5000, outputTokens: 2000 },
      });

      const row = toDatabase(original);
      const restored = fromDatabase(row);

      expect(restored.id).toBe(original.id);
      expect(restored.featureId).toBe(original.featureId);
      expect(restored.repositoryPath).toBe(original.repositoryPath);
      expect(restored.prNumber).toBe(original.prNumber);
      expect(restored.prUrl).toBe(original.prUrl);
      expect(restored.status).toBe(original.status);
      expect(restored.summary).toBe(original.summary);
      expect(restored.comments).toEqual(original.comments);
      expect(restored.reviewUrl).toBe(original.reviewUrl);
      expect(restored.agentModel).toBe(original.agentModel);
      expect(restored.tokenUsage).toEqual(original.tokenUsage);
      expect(restored.errorMessage).toBeUndefined();
    });

    it('preserves minimal review through roundtrip', () => {
      const original = createTestReview();
      const row = toDatabase(original);
      const restored = fromDatabase(row);

      expect(restored.id).toBe(original.id);
      expect(restored.repositoryPath).toBe(original.repositoryPath);
      expect(restored.prNumber).toBe(original.prNumber);
      expect(restored.status).toBe(original.status);
    });
  });
});
