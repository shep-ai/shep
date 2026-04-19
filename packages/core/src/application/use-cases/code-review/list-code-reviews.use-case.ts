/**
 * List Code Reviews Use Case
 *
 * Lists code reviews with optional filters.
 * Returns results ordered by creation date descending (newest first).
 */

import { injectable, inject } from 'tsyringe';
import type { CodeReview } from '../../../domain/generated/output.js';
import type { ICodeReviewRepository } from '../../ports/output/repositories/code-review-repository.interface.js';

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

    // Otherwise list with optional repositoryPath filter and limit
    return this.codeReviewRepo.list(input?.repositoryPath, {
      limit: input?.limit ?? 50,
    });
  }
}
