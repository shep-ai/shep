/**
 * List Code Reviews Use Case
 *
 * Lists code reviews with optional filters.
 * Returns results ordered by creation date descending (newest first).
 */

import { injectable, inject } from 'tsyringe';
import type { CodeReview } from '../../../domain/generated/output.js';
import { finiteOrFallback } from '../../../domain/shared/cursor-number.js';
import type { ICodeReviewRepository } from '../../ports/output/repositories/code-review-repository.interface.js';

/** Page size applied when the caller names none. */
const DEFAULT_LIMIT = 50;

export interface ListCodeReviewsInput {
  /** Filter by repository path */
  repositoryPath?: string;
  /** Filter by feature ID */
  featureId?: string;
  /** Maximum number of results (default: 50) */
  limit?: number;
}

@injectable()
export class ListCodeReviewsUseCase {
  constructor(
    @inject('ICodeReviewRepository')
    private readonly codeReviewRepo: ICodeReviewRepository
  ) {}

  async execute(input?: ListCodeReviewsInput): Promise<CodeReview[]> {
    // If filtering by featureId, use that method directly
    if (input?.featureId) {
      return this.codeReviewRepo.findByFeatureId(input.featureId);
    }

    // A non-numeric `?limit=abc` arrives as NaN. Neither this use case's
    // `?? DEFAULT` nor the repository's own `?? 50` can catch it — NaN is not
    // nullish — so it would be bound into `LIMIT ?`, where SQLite raises a
    // datatype mismatch instead of returning a page of rows.
    return this.codeReviewRepo.list(input?.repositoryPath, {
      limit: finiteOrFallback(input?.limit, DEFAULT_LIMIT),
    });
  }
}
