/**
 * ManageOpportunityWeightsUseCase (spec 126): a space's weights and weekly
 * review capacity — the defaults until the space sets its own — and its
 * discovery schedule (spec 128).
 */

import { injectable, inject } from 'tsyringe';
import type { OpportunityWeights } from '../../../domain/generated/output.js';
import type { ISpaceRepository } from '../../ports/output/repositories/space-repository.interface.js';
import type { IProductLineRepository } from '../../ports/output/repositories/product-line-repository.interface.js';
import type { IOpportunityWeightsRepository } from '../../ports/output/repositories/opportunity-repository.interface.js';
import {
  MAX_DISCOVERY_EVERY_HOURS,
  MIN_DISCOVERY_EVERY_HOURS,
} from '../../../domain/shared/discovery-proposals.js';
import { failure, resolveScope, weightsFor, type OpportunityResult } from './opportunity-scope.js';

export type WeightsChange = Partial<Omit<OpportunityWeights, 'spaceId' | 'discoveryEveryHours'>>;

const WEIGHT_FIELDS = ['reach', 'revenue', 'urgency', 'strategic'] as const;

@injectable()
export class ManageOpportunityWeightsUseCase {
  constructor(
    @inject('IOpportunityWeightsRepository')
    private readonly weights: IOpportunityWeightsRepository,
    @inject('ISpaceRepository') private readonly spaces: ISpaceRepository,
    @inject('IProductLineRepository') private readonly productLines: IProductLineRepository
  ) {}

  async get(
    space?: string
  ): Promise<OpportunityResult<{ weights: OpportunityWeights; isDefault: boolean }>> {
    const scope = await resolveScope(this.spaces, this.productLines, space ? { space } : {});
    if (!scope.ok) return scope;
    const own = await this.weights.find(scope.space.id);
    return {
      ok: true,
      weights: own ?? (await weightsFor(this.weights, scope.space.id)),
      isDefault: own === null,
    };
  }

  async set(
    space: string | undefined,
    change: WeightsChange
  ): Promise<OpportunityResult<{ weights: OpportunityWeights }>> {
    for (const field of WEIGHT_FIELDS) {
      const value = change[field];
      if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
        return failure(`The ${field} weight must be zero or more.`);
      }
    }
    const capacity = change.weeklyReviewHours;
    if (capacity !== undefined && (!Number.isFinite(capacity) || capacity <= 0)) {
      return failure('Weekly review hours must be more than 0.');
    }
    const current = await this.get(space);
    if (!current.ok) return current;
    const weights: OpportunityWeights = { ...current.weights };
    for (const [field, value] of Object.entries(change)) {
      if (value !== undefined) weights[field as keyof WeightsChange] = value;
    }
    await this.weights.save(weights);
    return { ok: true, weights };
  }

  /** Runs discovery in the space every `everyHours` hours (spec 128), or never when null. */
  async setDiscovery(
    space: string | undefined,
    everyHours: number | null
  ): Promise<OpportunityResult<{ weights: OpportunityWeights }>> {
    if (
      everyHours !== null &&
      (!Number.isFinite(everyHours) ||
        everyHours < MIN_DISCOVERY_EVERY_HOURS ||
        everyHours > MAX_DISCOVERY_EVERY_HOURS)
    ) {
      return failure(
        `Discovery runs every ${MIN_DISCOVERY_EVERY_HOURS} to ${MAX_DISCOVERY_EVERY_HOURS} hours.`
      );
    }
    const current = await this.get(space);
    if (!current.ok) return current;
    const { discoveryEveryHours: _previous, ...rest } = current.weights;
    const weights: OpportunityWeights =
      everyHours === null ? rest : { ...rest, discoveryEveryHours: everyHours };
    await this.weights.save(weights);
    return { ok: true, weights };
  }
}
