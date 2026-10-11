/**
 * RetryFailedFleetFeaturesUseCase
 *
 * Backs `shep fleet retry [--ci | --failed]`: "retry the 3 that failed CI" as one
 * command instead of three.
 *
 * This is deliberately a PROJECTION, not new machinery. It reads the triage feed
 * the operator is already looking at, filters it, and drives each selected
 * feature through the existing `ResumeFeatureUseCase` — the same path the web
 * Resume button and `shep feat resume` take. Inventing a second resume path
 * would mean a second place to keep agent identity, worktree sync and capacity
 * accounting correct, and the last time a spawn path was duplicated it silently
 * ran the wrong agent (`LESSONS.md`).
 *
 * Following Clean Architecture:
 * - Application layer use case
 * - Port dependencies via existing use cases: ListFleetTriageItemsUseCase,
 *   ResumeFeatureUseCase
 */

import { injectable, inject } from 'tsyringe';
import type { FleetTriageItem } from '../../../domain/generated/output.js';
import { FleetTriageCategory } from '../../../domain/generated/output.js';
import { ListFleetTriageItemsUseCase } from './list-fleet-triage-items.use-case.js';
import { ResumeFeatureUseCase } from '../features/resume-feature.use-case.js';

/** Which failures to retry. */
export type FleetRetryScope = 'ci' | 'failed';

/**
 * Triage categories each scope retries.
 *
 * A projection of the feed's own vocabulary, so `fleet triage` and `fleet retry`
 * can never disagree about what "failed CI" means.
 *
 * Deliberately absent, whatever the scope: `gate` and `question` are decisions
 * for a human (approving them is `fleet approve`, and re-running them would
 * bypass the gate entirely), `conflict` needs the branch resolved rather than
 * the agent restarted, and `warning` is advisory.
 */
const RETRY_CATEGORIES: Record<FleetRetryScope, FleetTriageCategory[]> = {
  ci: [FleetTriageCategory.ci_failed],
  failed: [FleetTriageCategory.crash],
};

export interface RetryFailedFleetFeaturesInput {
  scope: FleetRetryScope;
  /** Restrict the batch to one repository, matching `fleet triage --repo`. */
  repositoryPath?: string;
}

export interface FleetRetryFailure {
  featureId: string;
  featureName: string;
  /** The refusal reason, verbatim from the resume path. */
  reason: string;
}

export interface RetryFailedFleetFeaturesResult {
  /** How many distinct features the scope selected. */
  attemptedCount: number;
  /** Features whose agent was restarted, in feed order. */
  retriedFeatureIds: string[];
  failures: FleetRetryFailure[];
}

@injectable()
export class RetryFailedFleetFeaturesUseCase {
  constructor(
    @inject(ListFleetTriageItemsUseCase)
    private readonly triage: ListFleetTriageItemsUseCase,
    @inject(ResumeFeatureUseCase)
    private readonly resumeFeature: ResumeFeatureUseCase
  ) {}

  async execute(input: RetryFailedFleetFeaturesInput): Promise<RetryFailedFleetFeaturesResult> {
    const wanted = RETRY_CATEGORIES[input.scope];
    const items = await this.triage.execute(
      input.repositoryPath === undefined ? {} : { repositoryPath: input.repositoryPath }
    );

    const selected = dedupeByFeature(items.filter((item) => wanted.includes(item.category)));

    const retriedFeatureIds: string[] = [];
    const failures: FleetRetryFailure[] = [];

    for (const item of selected) {
      try {
        await this.resumeFeature.execute(item.featureId);
        retriedFeatureIds.push(item.featureId);
      } catch (error) {
        // Isolate per feature: one refusal must not strand the rest of the
        // batch, exactly as `fleet approve` isolates per-feature failures.
        failures.push({
          featureId: item.featureId,
          featureName: item.featureName,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { attemptedCount: selected.length, retriedFeatureIds, failures };
  }
}

/**
 * One entry per feature, keeping the first (the feed is already priority-ordered).
 *
 * A feature can hold several triage items at once — a crashed run AND a failing
 * CI check on its PR, for instance. Retrying it twice would put two agents in one
 * worktree on one branch, sharing an agent run and a log file, which is the race
 * `claimSlot` exists to prevent.
 */
function dedupeByFeature(items: FleetTriageItem[]): FleetTriageItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.featureId)) return false;
    seen.add(item.featureId);
    return true;
  });
}
