/**
 * Get Code Review Use Case
 *
 * Retrieves a single code review by its ID.
 * Supports ID prefix matching (like ShowFeatureUseCase).
 */

import { injectable, inject } from 'tsyringe';
import type { CodeReview } from '../../../domain/generated/output.js';
import type { ICodeReviewRepository } from '../../ports/output/repositories/code-review-repository.interface.js';

@injectable()
export class GetCodeReviewUseCase {
  constructor(
    @inject('ICodeReviewRepository')
    private readonly codeReviewRepo: ICodeReviewRepository
  ) {}

  async execute(id: string): Promise<CodeReview> {
    const review = await this.codeReviewRepo.findById(id);
    if (!review) {
      throw new Error(`Code review not found: "${id}"`);
    }
    return review;
  }
}
