'use server';

/**
 * Server actions for the Opportunities page (spec 126). Each calls one use
 * case and returns only success or the error; a thrown error becomes a
 * failed result.
 */

import { resolve } from '@/lib/server-container';
import { attemptOutcome } from '@/lib/action-outcome';
import type {
  ManageSignalsUseCase,
  RecordSignalInput,
} from '@shepai/core/application/use-cases/opportunities/manage-signals.use-case';
import type {
  CreateOpportunityInput,
  ManageOpportunitiesUseCase,
  OpportunityEstimate,
} from '@shepai/core/application/use-cases/opportunities/manage-opportunities.use-case';
import type { BuildOpportunityUseCase } from '@shepai/core/application/use-cases/opportunities/build-opportunity.use-case';
import type {
  ManageOpportunityWeightsUseCase,
  WeightsChange,
} from '@shepai/core/application/use-cases/opportunities/manage-opportunity-weights.use-case';

const signals = () => resolve<ManageSignalsUseCase>('ManageSignalsUseCase');
const opportunities = () => resolve<ManageOpportunitiesUseCase>('ManageOpportunitiesUseCase');

export async function recordSignal(input: RecordSignalInput) {
  return attemptOutcome(() => signals().record(input));
}

export async function linkSignal(signalId: string, opportunityId: string | null) {
  return attemptOutcome(() => signals().link(signalId, opportunityId));
}

export async function removeSignal(signalId: string) {
  return attemptOutcome(() => signals().remove(signalId));
}

export async function createOpportunity(input: CreateOpportunityInput) {
  return attemptOutcome(() => opportunities().create(input));
}

export async function estimateOpportunity(id: string, estimate: OpportunityEstimate) {
  return attemptOutcome(() => opportunities().estimate(id, estimate));
}

export async function acceptOpportunity(id: string) {
  return attemptOutcome(() => opportunities().accept(id));
}

export async function dropOpportunity(id: string, reason: string) {
  return attemptOutcome(() => opportunities().drop(id, reason));
}

export async function buildOpportunity(id: string, project: string) {
  return attemptOutcome(() =>
    resolve<BuildOpportunityUseCase>('BuildOpportunityUseCase').execute(id, project)
  );
}

export async function setOpportunityWeights(space: string, change: WeightsChange) {
  return attemptOutcome(() =>
    resolve<ManageOpportunityWeightsUseCase>('ManageOpportunityWeightsUseCase').set(space, change)
  );
}
