/**
 * CodeReview Repository Interface (Output Port)
 *
 * Defines the contract for CodeReview entity persistence operations.
 * Implementations handle database-specific logic (SQLite, etc.).
 */

import type { CodeReview } from '../../../../domain/generated/output.js';

export interface ICodeReviewRepository {
  create(review: CodeReview): Promise<void>;
  update(review: CodeReview): Promise<void>;
  findById(id: string): Promise<CodeReview | null>;
  findByFeatureId(featureId: string): Promise<CodeReview[]>;
  findByPrNumber(repositoryPath: string, prNumber: number): Promise<CodeReview[]>;
  list(repositoryPath?: string, options?: { limit?: number }): Promise<CodeReview[]>;
}
