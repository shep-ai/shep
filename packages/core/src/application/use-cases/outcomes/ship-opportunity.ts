/**
 * Marking an opportunity Shipped (spec 130), shared by ship tracking and
 * shipping by hand: the opportunity takes its ship time and gets one Pending
 * outcome, reviewed a window later.
 */

import { randomUUID } from 'node:crypto';
import {
  OpportunityStatus,
  OutcomeVerdict,
  type Opportunity,
  type OpportunityOutcome,
} from '../../../domain/generated/output.js';
import { outcomeReviewAt } from '../../../domain/shared/outcomes.js';
import type { IOpportunityRepository } from '../../ports/output/repositories/opportunity-repository.interface.js';
import type { IOutcomeRepository } from '../../ports/output/repositories/outcome-repository.interface.js';

export interface Shipped {
  opportunity: Opportunity;
  outcome: OpportunityOutcome;
}

export async function shipOpportunity(
  opportunities: IOpportunityRepository,
  outcomes: IOutcomeRepository,
  opportunity: Opportunity,
  at: Date
): Promise<Shipped> {
  const shipped: Opportunity = {
    ...opportunity,
    status: OpportunityStatus.Shipped,
    shippedAt: at,
    updatedAt: at,
  };
  const outcome: OpportunityOutcome = {
    id: randomUUID(),
    opportunityId: opportunity.id,
    spaceId: opportunity.spaceId,
    shippedAt: at,
    reviewAt: outcomeReviewAt(at),
    verdict: OutcomeVerdict.Pending,
    createdAt: at,
    updatedAt: at,
  };
  await outcomes.create(outcome);
  await opportunities.update(shipped);
  return { opportunity: shipped, outcome };
}
