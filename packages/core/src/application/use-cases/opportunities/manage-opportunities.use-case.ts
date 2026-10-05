/**
 * ManageOpportunitiesUseCase (spec 126)
 *
 * Shapes and decides opportunities: create one with a review estimate and a
 * confidence, re-estimate it, accept it, drop it with a reason, and show it
 * with its signals and score under its space's weights.
 */

import { randomUUID } from 'node:crypto';
import { injectable, inject } from 'tsyringe';
import {
  OpportunitySource,
  OpportunityStatus,
  type Opportunity,
  type Signal,
} from '../../../domain/generated/output.js';
import { defined, optionalText } from '../../../domain/shared/defined.js';
import {
  MAX_REVIEW_HOURS,
  scoreOpportunity,
  type ScoredOpportunity,
} from '../../../domain/shared/opportunity-score.js';
import type { ISpaceRepository } from '../../ports/output/repositories/space-repository.interface.js';
import type { IProductLineRepository } from '../../ports/output/repositories/product-line-repository.interface.js';
import type {
  IOpportunityRepository,
  IOpportunityWeightsRepository,
  ISignalRepository,
} from '../../ports/output/repositories/opportunity-repository.interface.js';
import {
  failure,
  resolveScope,
  weightsFor,
  type OpportunityResult,
  type ScopeRefs,
} from './opportunity-scope.js';

export const DEFAULT_CONFIDENCE = 0.5;

export interface OpportunityEstimate {
  title?: string;
  problem?: string;
  /** Hours of human review to merge it, more than 0. */
  reviewHours?: number;
  /** From 0 to 1. */
  confidence?: number;
  strategic?: boolean;
}

export interface CreateOpportunityInput extends ScopeRefs, OpportunityEstimate {
  title: string;
  reviewHours: number;
  /** How it came to be; Manual when omitted. */
  source?: OpportunitySource;
  /** What a discovery agent suggested building. */
  brief?: string;
}

export interface OpportunityDetail extends ScoredOpportunity {
  signals: Signal[];
}

/** Why an estimate is invalid, or undefined. */
function estimateError(estimate: OpportunityEstimate): string | undefined {
  if (estimate.title !== undefined && !estimate.title.trim()) {
    return 'An opportunity needs a title.';
  }
  const hours = estimate.reviewHours;
  if (hours !== undefined && (!Number.isFinite(hours) || hours <= 0 || hours > MAX_REVIEW_HOURS)) {
    return `Review hours must be more than 0 and at most ${MAX_REVIEW_HOURS}.`;
  }
  const confidence = estimate.confidence;
  if (
    confidence !== undefined &&
    (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)
  ) {
    return 'Confidence must be between 0 and 1.';
  }
  return undefined;
}

@injectable()
export class ManageOpportunitiesUseCase {
  constructor(
    @inject('IOpportunityRepository') private readonly opportunities: IOpportunityRepository,
    @inject('ISignalRepository') private readonly signals: ISignalRepository,
    @inject('IOpportunityWeightsRepository')
    private readonly weights: IOpportunityWeightsRepository,
    @inject('ISpaceRepository') private readonly spaces: ISpaceRepository,
    @inject('IProductLineRepository') private readonly productLines: IProductLineRepository
  ) {}

  async create(
    input: CreateOpportunityInput
  ): Promise<OpportunityResult<{ opportunity: Opportunity }>> {
    const invalid =
      estimateError(input) ?? (input.title.trim() ? undefined : 'An opportunity needs a title.');
    if (invalid) return failure(invalid);
    const scope = await resolveScope(this.spaces, this.productLines, input);
    if (!scope.ok) return scope;
    const now = new Date();
    const opportunity: Opportunity = {
      id: randomUUID(),
      spaceId: scope.space.id,
      title: input.title.trim(),
      status: OpportunityStatus.Proposed,
      reviewHours: input.reviewHours,
      confidence: input.confidence ?? DEFAULT_CONFIDENCE,
      strategic: input.strategic ?? false,
      source: input.source ?? OpportunitySource.Manual,
      ...defined({
        productLineId: scope.productLine?.id,
        problem: optionalText(input.problem),
        brief: optionalText(input.brief),
      }),
      createdAt: now,
      updatedAt: now,
    };
    await this.opportunities.create(opportunity);
    return { ok: true, opportunity };
  }

  async estimate(
    id: string,
    estimate: OpportunityEstimate
  ): Promise<OpportunityResult<{ opportunity: Opportunity }>> {
    const invalid = estimateError(estimate);
    if (invalid) return failure(invalid);
    const found = await this.find(id);
    if (!found.ok) return found;
    const opportunity: Opportunity = {
      ...found.opportunity,
      ...defined({
        title: estimate.title?.trim(),
        problem: estimate.problem?.trim(),
        reviewHours: estimate.reviewHours,
        confidence: estimate.confidence,
        strategic: estimate.strategic,
      }),
      updatedAt: new Date(),
    };
    await this.opportunities.update(opportunity);
    return { ok: true, opportunity };
  }

  async accept(id: string): Promise<OpportunityResult<{ opportunity: Opportunity }>> {
    return this.decide(id, [OpportunityStatus.Proposed, OpportunityStatus.Dropped], {
      status: OpportunityStatus.Accepted,
    });
  }

  async drop(id: string, reason: string): Promise<OpportunityResult<{ opportunity: Opportunity }>> {
    if (!reason.trim()) return failure('Say why the opportunity is dropped.');
    return this.decide(id, [OpportunityStatus.Proposed, OpportunityStatus.Accepted], {
      status: OpportunityStatus.Dropped,
      dropReason: reason.trim(),
    });
  }

  async show(id: string): Promise<OpportunityResult<{ detail: OpportunityDetail }>> {
    const found = await this.find(id);
    if (!found.ok) return found;
    const signals = await this.signals.list({ opportunityId: found.opportunity.id });
    const weights = await weightsFor(this.weights, found.opportunity.spaceId);
    return {
      ok: true,
      detail: { ...scoreOpportunity(found.opportunity, signals, weights), signals },
    };
  }

  private async find(id: string): Promise<OpportunityResult<{ opportunity: Opportunity }>> {
    const opportunity = await this.opportunities.findById(id.trim());
    return opportunity ? { ok: true, opportunity } : failure(`No opportunity "${id}".`);
  }

  private async decide(
    id: string,
    from: readonly OpportunityStatus[],
    change: Pick<Opportunity, 'status'> & Partial<Pick<Opportunity, 'dropReason'>>
  ): Promise<OpportunityResult<{ opportunity: Opportunity }>> {
    const found = await this.find(id);
    if (!found.ok) return found;
    if (!from.includes(found.opportunity.status)) {
      return failure(
        `${found.opportunity.title} is ${found.opportunity.status}; it cannot become ${change.status}.`
      );
    }
    const now = new Date();
    const { dropReason: _previous, ...rest } = found.opportunity;
    const opportunity: Opportunity = { ...rest, ...change, decidedAt: now, updatedAt: now };
    await this.opportunities.update(opportunity);
    return { ok: true, opportunity };
  }
}
