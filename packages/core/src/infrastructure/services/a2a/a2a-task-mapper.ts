/**
 * A2A task mapping (spec 148): a feature's activity as an A2A Task.
 *
 * Task id and context id are the feature id. The status carries an agent
 * message saying, in a sentence, what the feature is doing or what it waits
 * on — and, when it is blocked, how to answer. Shep's own fields ride in
 * `metadata.shep`.
 */

import { AgentActivityState, FeatureStateReason } from '../../../domain/generated/output.js';
import type { AgentActivity } from '../../../application/use-cases/agent-activity/agent-activity.types.js';
import {
  RoleName,
  TaskStateName,
  type A2aTask,
  type A2aTaskStatus,
  type A2aTaskStatusUpdateEvent,
} from './a2a.types.js';

const TASK_STATE: Record<AgentActivityState, TaskStateName> = {
  [AgentActivityState.Working]: TaskStateName.Working,
  [AgentActivityState.Blocked]: TaskStateName.InputRequired,
  [AgentActivityState.Waiting]: TaskStateName.Submitted,
  [AgentActivityState.Done]: TaskStateName.Completed,
  [AgentActivityState.Failed]: TaskStateName.Failed,
};

const GATE_REPLY =
  'Reply with a data part {"decision":"approve"} or {"decision":"reject","feedback":"…"}.';

/** One sentence per reason; total over the enum, so a new reason cannot go unexplained. */
const STATUS_TEXT: Record<FeatureStateReason, (a: AgentActivity) => string> = {
  [FeatureStateReason.Deleting]: () => 'The feature is being deleted.',
  [FeatureStateReason.Archived]: () => 'The feature is archived.',
  [FeatureStateReason.QueuedForCapacity]: () =>
    'Queued: it starts when a slot under the parallel-feature limit frees up.',
  [FeatureStateReason.Deferred]: () => 'Deferred: no agent has started yet.',
  [FeatureStateReason.WaitingOnParent]: () => 'Waiting for its parent feature to finish.',
  [FeatureStateReason.ApprovalGate]: (a) =>
    `Waiting for approval of the ${a.phase} phase. ${GATE_REPLY}`,
  [FeatureStateReason.AgentQuestion]: (a) =>
    `The agent asks: ${a.pendingQuestion?.prompt ?? 'a question'} Reply with text to answer.`,
  [FeatureStateReason.RunFailed]: (a) => `The run failed${errorSuffix(a)}`,
  [FeatureStateReason.RunInterrupted]: (a) => `The run was interrupted${errorSuffix(a)}`,
  [FeatureStateReason.RunCancelled]: () => 'The run was cancelled.',
  [FeatureStateReason.RunCompleted]: () => 'Finished.',
  [FeatureStateReason.AgentRunning]: (a) => `Working on the ${a.phase} phase.`,
  [FeatureStateReason.ProcessDied]: () => 'The agent process stopped unexpectedly.',
  [FeatureStateReason.Maintained]: () => 'Finished; in maintenance.',
  [FeatureStateReason.AwaitingReview]: () => 'Its pull request waits for review.',
  [FeatureStateReason.PlanTaskInReview]: () => 'A plan task waits for review.',
  [FeatureStateReason.PlanTasksDone]: () => 'Every plan task is done.',
  [FeatureStateReason.InProgress]: (a) => `In progress: ${a.phase}.`,
};

export function taskOf(activity: AgentActivity): A2aTask {
  return {
    id: activity.featureId,
    contextId: activity.featureId,
    status: statusOf(activity),
    artifacts: [],
    history: [],
    metadata: { shep: shepMetadata(activity) },
  };
}

export function statusUpdateOf(activity: AgentActivity): A2aTaskStatusUpdateEvent {
  return {
    taskId: activity.featureId,
    contextId: activity.featureId,
    status: statusOf(activity),
  };
}

function statusOf(activity: AgentActivity): A2aTaskStatus {
  return {
    state: taskStateOf(activity),
    message: {
      messageId: `${activity.featureId}:${activity.version}`,
      role: RoleName.Agent,
      taskId: activity.featureId,
      contextId: activity.featureId,
      parts: [{ text: STATUS_TEXT[activity.reason](activity) }],
    },
    timestamp: new Date(activity.updatedAt).toISOString(),
  };
}

function taskStateOf(activity: AgentActivity): TaskStateName {
  return activity.reason === FeatureStateReason.RunCancelled
    ? TaskStateName.Canceled
    : TASK_STATE[activity.state];
}

function errorSuffix(activity: AgentActivity): string {
  return activity.error ? `: ${activity.error}` : '.';
}

function shepMetadata(activity: AgentActivity): Record<string, unknown> {
  return {
    name: activity.name,
    repositoryPath: activity.repositoryPath,
    branch: activity.branch,
    activity: activity.state,
    reason: activity.reason,
    featureState: activity.featureState,
    lifecycle: activity.lifecycle,
    phase: activity.phase,
    ...(activity.runStatus ? { runStatus: activity.runStatus } : {}),
    ...(activity.pendingQuestion ? { pendingQuestion: activity.pendingQuestion } : {}),
    ...(activity.error ? { error: activity.error } : {}),
    ...(activity.pr ? { pr: activity.pr } : {}),
    actions: activity.actions,
    version: activity.version,
  };
}
