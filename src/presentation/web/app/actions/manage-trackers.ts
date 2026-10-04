'use server';

/**
 * Server actions for the Connections page (spec 122). Each calls one use case
 * and returns its result; a thrown error becomes a failed result. Secrets are
 * passed straight to the use case and never returned.
 */

import { resolve } from '@/lib/server-container';
import {
  attemptOutcome,
  errorMessage,
  runsOutcome,
  type ActionOutcome,
} from '@/lib/action-outcome';
import type {
  CreateConnectionInput,
  ManageConnectionsUseCase,
} from '@shepai/core/application/use-cases/connections/manage-connections.use-case';
import type {
  CreateTrackerSyncRuleInput,
  ManageTrackerSyncRulesUseCase,
} from '@shepai/core/application/use-cases/trackers/manage-tracker-sync-rules.use-case';
import type { RunTrackerSyncUseCase } from '@shepai/core/application/use-cases/trackers/run-tracker-sync.use-case';
import type { SyncTrackerRulesUseCase } from '@shepai/core/application/use-cases/trackers/sync-tracker-rules.use-case';
import type {
  GetTrackerOverviewUseCase,
  TrackerOverview,
} from '@shepai/core/application/use-cases/trackers/get-tracker-overview.use-case';

const connections = () => resolve<ManageConnectionsUseCase>('ManageConnectionsUseCase');
const rules = () => resolve<ManageTrackerSyncRulesUseCase>('ManageTrackerSyncRulesUseCase');

export async function getTrackerOverview(): Promise<{
  overview?: TrackerOverview;
  error?: string;
}> {
  try {
    return {
      overview: await resolve<GetTrackerOverviewUseCase>('GetTrackerOverviewUseCase').execute(),
    };
  } catch (error: unknown) {
    return { error: errorMessage(error) };
  }
}

export async function createConnection(input: CreateConnectionInput) {
  return attemptOutcome(() => connections().create(input));
}

export async function testConnection(ref: string) {
  return attemptOutcome(() => connections().test(ref));
}

export async function removeConnection(ref: string) {
  return attemptOutcome(() => connections().remove(ref));
}

export async function createTrackerSyncRule(input: CreateTrackerSyncRuleInput) {
  return attemptOutcome(() => rules().create(input));
}

export async function setTrackerSyncRuleEnabled(id: string, enabled: boolean) {
  return attemptOutcome(() => rules().setEnabled(id, enabled));
}

export async function removeTrackerSyncRule(id: string) {
  return attemptOutcome(() => rules().remove(id));
}

/** Runs one rule, or every enabled rule; fails with the first run's error, if any. */
export async function runTrackerSync(ruleId?: string): Promise<ActionOutcome> {
  return runsOutcome(async () =>
    ruleId
      ? [await resolve<RunTrackerSyncUseCase>('RunTrackerSyncUseCase').execute(ruleId)]
      : await resolve<SyncTrackerRulesUseCase>('SyncTrackerRulesUseCase').runAll()
  );
}
