'use server';

/**
 * Server actions for outcomes on the Opportunities page (spec 130). Each
 * calls one use case and returns only success or the error.
 */

import { resolve } from '@/lib/server-container';
import { attemptOutcome } from '@/lib/action-outcome';
import type { ManageOutcomesUseCase } from '@shepai/core/application/use-cases/outcomes/manage-outcomes.use-case';
import type { TrackOutcomesUseCase } from '@shepai/core/application/use-cases/outcomes/track-outcomes.use-case';

const outcomes = () => resolve<ManageOutcomesUseCase>('ManageOutcomesUseCase');

export async function checkOutcomes() {
  return attemptOutcome(async () => {
    await resolve<TrackOutcomesUseCase>('TrackOutcomesUseCase').run();
    return { ok: true };
  });
}

export async function shipOpportunity(opportunityId: string) {
  return attemptOutcome(() => outcomes().ship(opportunityId));
}

export async function tellCustomers(opportunityId: string) {
  return attemptOutcome(() => outcomes().tell(opportunityId));
}

export async function recordOutcomeHours(opportunityId: string, hours: number) {
  return attemptOutcome(() => outcomes().recordHours(opportunityId, hours));
}
