/**
 * List Features Use Case
 *
 * Retrieves features with optional filtering by repository path or lifecycle.
 *
 * Business Rules:
 * - Returns all features when no filters are provided
 * - Filters are passed through to the repository
 */

import { injectable, inject } from 'tsyringe';
import type { Feature } from '../../../domain/generated/output.js';
import type {
  IFeatureRepository,
  FeatureListFilters,
} from '../../ports/output/repositories/feature-repository.interface.js';
import { ReconcileAgentRunLivenessUseCase } from '../agents/reconcile-agent-run-liveness.use-case.js';

@injectable()
export class ListFeaturesUseCase {
  constructor(
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository,
    @inject(ReconcileAgentRunLivenessUseCase)
    private readonly reconcileRunLiveness: ReconcileAgentRunLivenessUseCase
  ) {}

  async execute(filters?: FeatureListFilters): Promise<Feature[]> {
    // Settle crashed, hung and never-started runs first, so what every surface
    // shows reflects them. Never throws.
    await this.reconcileRunLiveness.execute();
    return this.featureRepo.list(filters);
  }
}
