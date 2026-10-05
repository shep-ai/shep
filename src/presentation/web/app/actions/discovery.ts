'use server';

/**
 * Server actions for discovery on the Opportunities page (spec 128). Running
 * discovery waits for the agent, within its budget.
 */

import { resolve } from '@/lib/server-container';
import { attemptOutcome } from '@/lib/action-outcome';
import type { RunDiscoveryUseCase } from '@shepai/core/application/use-cases/discovery/run-discovery.use-case';
import type { ManageOpportunityWeightsUseCase } from '@shepai/core/application/use-cases/opportunities/manage-opportunity-weights.use-case';

export async function runDiscovery(space: string) {
  return attemptOutcome(() =>
    resolve<RunDiscoveryUseCase>('RunDiscoveryUseCase').execute({ space })
  );
}

export async function setDiscoverySchedule(space: string, everyHours: number | null) {
  return attemptOutcome(() =>
    resolve<ManageOpportunityWeightsUseCase>('ManageOpportunityWeightsUseCase').setDiscovery(
      space,
      everyHours
    )
  );
}
