/**
 * Feature state (spec 142).
 *
 * The one place that decides what a feature is doing right now. The web
 * canvas and feature tree (`deriveNodeState`) and the terminal console
 * (`shep tui`) all read it from here, so no two surfaces disagree.
 *
 * Note the import convention for `domain/`: generated types only, no I/O, and
 * relative imports carry no file extension — the web package consumes this
 * directory as raw TypeScript and its bundler cannot resolve a `.js` specifier.
 */

import {
  AgentRunStatus,
  FeatureConsoleAction,
  FeatureState,
  FeatureStateReason,
  SdlcLifecycle,
  TaskState,
} from '../generated/output';
import type { AgentRun, Feature } from '../generated/output';
import { isQueuedForCapacity } from './parallel-feature-limit';
import { lifecycleToNode } from './sdlc-lifecycle-mapping';

/** Marker prefix an agent run writes to `result` while it is inside a graph node. */
const NODE_RESULT_PREFIX = 'node:';

export interface DeriveFeatureStateOptions {
  /**
   * Whether the run's process is still alive. `false` turns an executing run
   * into an Error; leave it undefined when liveness is unknown (callers that
   * reconcile runs first, such as `ListFeaturesUseCase`, need not probe).
   */
  isPidAlive?: boolean;
}

/** A feature's state and the rule that decided it (spec 149). */
export interface FeatureStateExplanation {
  state: FeatureState;
  reason: FeatureStateReason;
}

/**
 * What a feature is doing right now.
 *
 * The state of {@link explainFeatureState}; see there for the priority.
 */
export function deriveFeatureState(
  feature: Feature,
  run?: AgentRun | null,
  options?: DeriveFeatureStateOptions
): FeatureState {
  return explainFeatureState(feature, run, options).state;
}

/**
 * What a feature is doing right now, and why.
 *
 * Priority:
 * 1. Lifecycles that override any run: Deleting, Archived, Pending (or Queued
 *    when it waits on a capacity slot), Blocked.
 * 2. The current run: a gate needs the user; failure, interruption and
 *    cancellation are errors; an executing run with a dead process is an error.
 * 3. No run: Maintain is done, an adopted Review needs the user, otherwise the
 *    plan's tasks decide.
 */
export function explainFeatureState(
  feature: Feature,
  run?: AgentRun | null,
  options?: DeriveFeatureStateOptions
): FeatureStateExplanation {
  switch (feature.lifecycle) {
    case SdlcLifecycle.Deleting:
      return explained(FeatureState.Deleting, FeatureStateReason.Deleting);
    case SdlcLifecycle.Archived:
      return explained(FeatureState.Archived, FeatureStateReason.Archived);
    case SdlcLifecycle.Pending:
      return isQueuedForCapacity(feature)
        ? explained(FeatureState.Queued, FeatureStateReason.QueuedForCapacity)
        : explained(FeatureState.Pending, FeatureStateReason.Deferred);
    case SdlcLifecycle.Blocked:
      return explained(FeatureState.Blocked, FeatureStateReason.WaitingOnParent);
  }

  if (run) {
    switch (run.status) {
      case AgentRunStatus.waitingApproval:
        return explained(FeatureState.ActionRequired, FeatureStateReason.ApprovalGate);
      case AgentRunStatus.failed:
        return explained(FeatureState.Error, FeatureStateReason.RunFailed);
      case AgentRunStatus.interrupted:
        return explained(FeatureState.Error, FeatureStateReason.RunInterrupted);
      case AgentRunStatus.cancelled:
        return explained(FeatureState.Error, FeatureStateReason.RunCancelled);
      case AgentRunStatus.completed:
        return explained(FeatureState.Done, FeatureStateReason.RunCompleted);
      case AgentRunStatus.running:
      case AgentRunStatus.pending:
        return options?.isPidAlive === false
          ? explained(FeatureState.Error, FeatureStateReason.ProcessDied)
          : explained(FeatureState.Running, FeatureStateReason.AgentRunning);
    }
  }

  if (feature.lifecycle === SdlcLifecycle.Maintain) {
    return explained(FeatureState.Done, FeatureStateReason.Maintained);
  }
  if (feature.lifecycle === SdlcLifecycle.Review) {
    return explained(FeatureState.ActionRequired, FeatureStateReason.AwaitingReview);
  }
  return explainFromPlanTasks(feature);
}

function explained(state: FeatureState, reason: FeatureStateReason): FeatureStateExplanation {
  return { state, reason };
}

function explainFromPlanTasks(feature: Feature): FeatureStateExplanation {
  const tasks = feature.plan?.tasks;
  if (!tasks || tasks.length === 0) {
    return explained(FeatureState.Running, FeatureStateReason.InProgress);
  }
  if (tasks.some((t) => t.state === TaskState.Review)) {
    return explained(FeatureState.ActionRequired, FeatureStateReason.PlanTaskInReview);
  }
  if (tasks.every((t) => t.state === TaskState.Done)) {
    return explained(FeatureState.Done, FeatureStateReason.PlanTasksDone);
  }
  return explained(FeatureState.Running, FeatureStateReason.InProgress);
}

/** The agent graph node a run is in (`"node:plan"` → `"plan"`), if it reports one. */
export function agentNodeOf(run: Pick<AgentRun, 'result'> | null | undefined): string | undefined {
  const result = run?.result;
  if (!result?.startsWith(NODE_RESULT_PREFIX)) return undefined;
  return result.slice(NODE_RESULT_PREFIX.length);
}

/** The phase to show for a feature: its run's node, else its lifecycle's node. */
export function featurePhaseOf(feature: Feature, run: AgentRun | null | undefined): string {
  return agentNodeOf(run) ?? lifecycleToNode(feature.lifecycle);
}

const ACTIONS_BY_RUN_STATUS: Record<AgentRunStatus, readonly FeatureConsoleAction[]> = {
  [AgentRunStatus.waitingApproval]: [FeatureConsoleAction.Approve, FeatureConsoleAction.Reject],
  [AgentRunStatus.running]: [FeatureConsoleAction.Stop],
  [AgentRunStatus.pending]: [FeatureConsoleAction.Stop],
  [AgentRunStatus.interrupted]: [FeatureConsoleAction.Resume],
  [AgentRunStatus.failed]: [FeatureConsoleAction.Resume],
  [AgentRunStatus.completed]: [],
  [AgentRunStatus.cancelled]: [],
};

/**
 * The console actions a feature's current run accepts. Mirrors what the
 * delegate use cases allow, so the console never offers a key that would be
 * refused.
 */
export function availableFeatureActions(
  run: Pick<AgentRun, 'status'> | null | undefined
): FeatureConsoleAction[] {
  if (!run) return [];
  return [...(ACTIONS_BY_RUN_STATUS[run.status] ?? [])];
}

/** True when the user is the one holding the feature up. */
export function needsUserAttention(state: FeatureState, pendingQuestions: number): boolean {
  return state === FeatureState.ActionRequired || pendingQuestions > 0;
}

/** Console group order: lower comes first. */
const STATE_RANK: Record<FeatureState, number> = {
  [FeatureState.ActionRequired]: 0,
  [FeatureState.Running]: 1,
  [FeatureState.Queued]: 2,
  [FeatureState.Blocked]: 2,
  [FeatureState.Pending]: 2,
  [FeatureState.Error]: 3,
  [FeatureState.Deleting]: 4,
  [FeatureState.Done]: 4,
  [FeatureState.Archived]: 5,
};

/** Rank given to any row the user must act on, ahead of every state group. */
const NEEDS_ATTENTION_RANK = -1;

export interface ConsoleOrderable {
  state: FeatureState;
  needsAttention: boolean;
  updatedAt: Date | string;
}

/**
 * Console row order: rows needing the user, then running, then waiting
 * (queued, blocked, pending), then failed, then finished, then archived.
 * Newest activity first inside each group.
 */
export function compareConsoleRows(a: ConsoleOrderable, b: ConsoleOrderable): number {
  const rank = (row: ConsoleOrderable) =>
    row.needsAttention ? NEEDS_ATTENTION_RANK : STATE_RANK[row.state];
  const byRank = rank(a) - rank(b);
  if (byRank !== 0) return byRank;
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

/** States that end a feature's work: nothing more will happen without the user. */
const SETTLED_STATES: ReadonlySet<FeatureState> = new Set([
  FeatureState.Done,
  FeatureState.Archived,
  FeatureState.Deleting,
]);

/** True while a feature's state can still change on its own or needs the user (spec 146). */
export function isActiveFeatureState(state: FeatureState): boolean {
  return !SETTLED_STATES.has(state);
}
