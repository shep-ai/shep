'use server';

/**
 * Server actions for the Connections page (spec 122). Each calls one use case
 * and returns its result; a thrown error becomes a failed result. Secrets are
 * passed straight to the use case and never returned.
 */

import { resolve } from '@/lib/server-container';
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

type Outcome = { ok: true } | { ok: false; error: string };

const connections = () => resolve<ManageConnectionsUseCase>('ManageConnectionsUseCase');
const rules = () => resolve<ManageTrackerSyncRulesUseCase>('ManageTrackerSyncRulesUseCase');

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Only success or the error: results carry nothing the page needs beyond a refresh. */
async function attempt(body: () => Promise<{ ok: boolean; error?: string }>): Promise<Outcome> {
  try {
    const result = await body();
    return result.ok ? { ok: true } : { ok: false, error: result.error ?? 'Failed' };
  } catch (error: unknown) {
    return { ok: false, error: message(error) };
  }
}

export async function getTrackerOverview(): Promise<{
  overview?: TrackerOverview;
  error?: string;
}> {
  try {
    return {
      overview: await resolve<GetTrackerOverviewUseCase>('GetTrackerOverviewUseCase').execute(),
    };
  } catch (error: unknown) {
    return { error: message(error) };
  }
}

export async function createConnection(input: CreateConnectionInput) {
  return attempt(() => connections().create(input));
}

export async function testConnection(ref: string) {
  return attempt(() => connections().test(ref));
}

export async function removeConnection(ref: string) {
  return attempt(() => connections().remove(ref));
}

export async function createTrackerSyncRule(input: CreateTrackerSyncRuleInput) {
  return attempt(() => rules().create(input));
}

export async function setTrackerSyncRuleEnabled(id: string, enabled: boolean) {
  return attempt(() => rules().setEnabled(id, enabled));
}

export async function removeTrackerSyncRule(id: string) {
  return attempt(() => rules().remove(id));
}

/** Runs one rule, or every enabled rule; fails with the first run's error, if any. */
export async function runTrackerSync(ruleId?: string): Promise<Outcome> {
  try {
    const results = ruleId
      ? [await resolve<RunTrackerSyncUseCase>('RunTrackerSyncUseCase').execute(ruleId)]
      : await resolve<SyncTrackerRulesUseCase>('SyncTrackerRulesUseCase').runAll();
    for (const result of results) {
      if (!result.ok) return { ok: false, error: result.error };
      if (result.error) return { ok: false, error: result.error };
    }
    return { ok: true };
  } catch (error: unknown) {
    return { ok: false, error: message(error) };
  }
}
