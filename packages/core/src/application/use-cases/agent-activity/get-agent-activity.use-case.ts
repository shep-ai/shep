/**
 * Get Agent Activity Use Case (spec 149)
 *
 * What each feature's agent is doing, for callers outside shep's own UI: the
 * console snapshot's rows (one batched read, crashed runs reconciled), projected
 * into the activity shape every adapter shares, with counts and the overall
 * state. Asking for one feature always returns it, done or archived.
 */

import { inject, injectable } from 'tsyringe';
import { AgentActivityState } from '../../../domain/generated/output.js';
import { compareActivityUrgency, overallActivity } from '../../../domain/shared/agent-activity.js';
import { GetFeatureConsoleSnapshotUseCase } from '../feature-console/get-feature-console-snapshot.use-case.js';
import type {
  FeatureConsoleRow,
  GetFeatureConsoleSnapshotInput,
} from '../feature-console/feature-console.types.js';
import type {
  AgentActivity,
  GetAgentActivityInput,
  GetAgentActivityResult,
} from './agent-activity.types.js';

@injectable()
export class GetAgentActivityUseCase {
  constructor(
    @inject(GetFeatureConsoleSnapshotUseCase)
    private readonly snapshot: GetFeatureConsoleSnapshotUseCase
  ) {}

  async execute(input: GetAgentActivityInput = {}): Promise<GetAgentActivityResult> {
    const { generatedAt, rows } = await this.snapshot.execute(snapshotInput(input));
    const selected = input.featureId
      ? matching(rows, input.featureId)
      : rows.filter(
          (r) => (input.includeSettled ?? false) || r.activity !== AgentActivityState.Done
        );
    // Array.prototype.sort is stable: within a state, the snapshot's order stays.
    const activities = selected
      .map(toActivity)
      .sort((a, b) => compareActivityUrgency(a.state, b.state));
    return {
      generatedAt,
      activities,
      counts: countByState(activities),
      overall: overallActivity(activities.map((a) => a.state)),
      notFound: input.featureId !== undefined && activities.length === 0,
    };
  }
}

function snapshotInput(input: GetAgentActivityInput): GetFeatureConsoleSnapshotInput {
  const snapshot: GetFeatureConsoleSnapshotInput = {};
  if (input.repositoryPath) snapshot.repositoryPath = input.repositoryPath;
  if (input.featureId) snapshot.includeArchived = true;
  return snapshot;
}

/** The feature with this exact id, else every feature whose id starts with it. */
function matching(rows: FeatureConsoleRow[], idOrPrefix: string): FeatureConsoleRow[] {
  const exact = rows.filter((r) => r.featureId === idOrPrefix);
  return exact.length > 0 ? exact : rows.filter((r) => r.featureId.startsWith(idOrPrefix));
}

function toActivity(row: FeatureConsoleRow): AgentActivity {
  return {
    featureId: row.featureId,
    shortId: row.shortId,
    name: row.name,
    repositoryPath: row.repositoryPath,
    branch: row.branch,
    state: row.activity,
    reason: row.activityReason,
    featureState: row.state,
    lifecycle: row.lifecycle,
    phase: row.phase,
    ...(row.runId ? { runId: row.runId } : {}),
    ...(row.runStatus ? { runStatus: row.runStatus } : {}),
    ...(row.agentType ? { agentType: row.agentType } : {}),
    pendingQuestions: row.pendingQuestions,
    ...(row.pendingQuestion ? { pendingQuestion: row.pendingQuestion } : {}),
    ...(row.error ? { error: row.error } : {}),
    ...(row.pr ? { pr: row.pr } : {}),
    actions: row.actions,
    version: row.version,
    updatedAt: row.updatedAt,
  };
}

function countByState(activities: AgentActivity[]): Record<AgentActivityState, number> {
  const counts = Object.fromEntries(
    Object.values(AgentActivityState).map((state) => [state, 0])
  ) as Record<AgentActivityState, number>;
  for (const activity of activities) counts[activity.state] += 1;
  return counts;
}
