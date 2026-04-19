/**
 * CodeReview Database Mapper
 *
 * Maps between CodeReview domain objects and SQLite database rows.
 * Handles JSON serialization for comments array and tokenUsage object.
 */

import type {
  CodeReview,
  CodeReviewStatus,
  ReviewComment,
  TokenUsage,
} from '../../../../domain/generated/output.js';

export interface CodeReviewRow {
  id: string;
  feature_id: string | null;
  repository_path: string;
  pr_number: number;
  pr_url: string | null;
  status: string;
  summary: string | null;
  comments: string | null;
  review_url: string | null;
  agent_model: string | null;
  token_usage: string | null;
  error_message: string | null;
  created_at: number;
  updated_at: number;
}

export function toDatabase(review: CodeReview): CodeReviewRow {
  return {
    id: review.id,
    feature_id: review.featureId ?? null,
    repository_path: review.repositoryPath,
    pr_number: review.prNumber,
    pr_url: review.prUrl ?? null,
    status: review.status,
    summary: review.summary ?? null,
    comments: review.comments?.length ? JSON.stringify(review.comments) : null,
    review_url: review.reviewUrl ?? null,
    agent_model: review.agentModel ?? null,
    token_usage: review.tokenUsage ? JSON.stringify(review.tokenUsage) : null,
    error_message: review.errorMessage ?? null,
    created_at: review.createdAt instanceof Date ? review.createdAt.getTime() : review.createdAt,
    updated_at: review.updatedAt instanceof Date ? review.updatedAt.getTime() : review.updatedAt,
  };
}

export function fromDatabase(row: CodeReviewRow): CodeReview {
  return {
    id: row.id,
    featureId: row.feature_id ?? undefined,
    repositoryPath: row.repository_path,
    prNumber: row.pr_number,
    prUrl: row.pr_url ?? undefined,
    status: row.status as CodeReviewStatus,
    summary: row.summary ?? undefined,
    comments: row.comments ? (JSON.parse(row.comments) as ReviewComment[]) : undefined,
    reviewUrl: row.review_url ?? undefined,
    agentModel: row.agent_model ?? undefined,
    tokenUsage: row.token_usage ? (JSON.parse(row.token_usage) as TokenUsage) : undefined,
    errorMessage: row.error_message ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
