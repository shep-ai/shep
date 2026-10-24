/**
 * Feature State Derivation
 *
 * Derives UI node state and progress from the Feature domain model
 * and its associated AgentRun status. State rules live in core (spec 142).
 */

import {
  SdlcLifecycle,
  TaskState,
  NotificationEventType,
  FeatureState,
} from '@shepai/core/domain/generated';
import { deriveFeatureState } from '@shepai/core/domain/shared/feature-state';
import type { Feature, AgentRun } from '@shepai/core/domain/generated';
import type { FeatureNodeState, FeatureLifecyclePhase } from './feature-node-state-config';

/**
 * Core feature state → canvas node state. Total, so a new `FeatureState`
 * member is a compile error here until the canvas decides how to show it.
 * The canvas has no separate "queued" look: a queued feature is a pending one.
 */
const FEATURE_STATE_TO_NODE_STATE: Record<FeatureState, FeatureNodeState> = {
  [FeatureState.Running]: 'running',
  [FeatureState.ActionRequired]: 'action-required',
  [FeatureState.Blocked]: 'blocked',
  [FeatureState.Pending]: 'pending',
  [FeatureState.Queued]: 'pending',
  [FeatureState.Done]: 'done',
  [FeatureState.Error]: 'error',
  [FeatureState.Deleting]: 'deleting',
  [FeatureState.Archived]: 'archived',
};

/**
 * Derives the visual node state from a Feature and its optional AgentRun.
 *
 * The rules live in core (`deriveFeatureState`, spec 142) so the canvas, the
 * feature tree and the terminal console agree; this only maps the result.
 */
export function deriveNodeState(
  feature: Feature,
  agentRun?: AgentRun | null,
  options?: { isPidAlive?: boolean }
): FeatureNodeState {
  return FEATURE_STATE_TO_NODE_STATE[deriveFeatureState(feature, agentRun, options)];
}

/**
 * Derives progress percentage from Feature.plan.tasks.
 *
 * Returns the percentage of tasks in Done state.
 * Returns 100 for Maintain lifecycle, 0 if no plan.
 */
export function deriveProgress(feature: Feature): number {
  if (feature.lifecycle === SdlcLifecycle.Maintain) {
    return 100;
  }

  const tasks = feature.plan?.tasks;
  if (!tasks || tasks.length === 0) {
    return 0;
  }

  const doneCount = tasks.filter((t) => t.state === TaskState.Done).length;
  return Math.round((doneCount / tasks.length) * 100);
}

/** Maps a NotificationEventType to the corresponding FeatureNodeState for optimistic UI updates. */
export function mapEventTypeToState(eventType: NotificationEventType): FeatureNodeState {
  switch (eventType) {
    case NotificationEventType.AgentStarted:
    case NotificationEventType.PhaseCompleted:
      return 'running';
    case NotificationEventType.WaitingApproval:
      return 'action-required';
    case NotificationEventType.AgentCompleted:
      return 'done';
    case NotificationEventType.AgentFailed:
    case NotificationEventType.PrChecksFailed:
      return 'error';
    case NotificationEventType.PrMerged:
    case NotificationEventType.PrChecksPassed:
      return 'done';
    case NotificationEventType.PrClosed:
      return 'action-required';
    case NotificationEventType.PrBlocked:
      return 'blocked';
    case NotificationEventType.MergeReviewReady:
      return 'action-required';
    case NotificationEventType.CloudDeploymentUpdated:
    case NotificationEventType.ApplicationUpdated:
    case NotificationEventType.OperationLogAppended:
      // Application-scoped events do not affect the feature node lifecycle
      // state — they are consumed by the application-page hooks (loader
      // patch + logs-drawer append) instead. We return 'running' as a
      // harmless no-op because the callers compare this against feature
      // node state and never match on application events.
      return 'running';
    case NotificationEventType.AgentQuestionPending:
    case NotificationEventType.AgentQuestionBlocking:
    case NotificationEventType.AgentMessageBlocked:
    case NotificationEventType.SupervisorEscalated:
    case NotificationEventType.SupervisorFailed:
      // Collaboration-fabric events (spec 093) surface in the Agent
      // Questions inbox and supervisor "Why?" drawer rather than mutating
      // feature-node state directly.
      return 'running';
    case NotificationEventType.WorkflowStarted:
    case NotificationEventType.WorkflowCompleted:
    case NotificationEventType.WorkflowFailed:
      // Scheduled workflow events do not affect feature node state.
      return 'running';
  }
}

/** Map domain SdlcLifecycle enum values to UI FeatureLifecyclePhase. */
export const sdlcLifecycleMap: Record<string, FeatureLifecyclePhase> = {
  Requirements: 'requirements',
  Research: 'research',
  Implementation: 'implementation',
  Review: 'review',
  'Deploy & QA': 'deploy',
  Maintain: 'maintain',
  Pending: 'pending',
  Exploring: 'exploring',
  Archived: 'maintain',
};

/** Map agent graph node names (from agent_run.result or SSE phaseName) to UI lifecycle phases. */
const phaseNameToLifecycle: Record<string, FeatureLifecyclePhase> = {
  analyze: 'requirements',
  requirements: 'requirements',
  research: 'research',
  plan: 'implementation',
  implement: 'implementation',
  merge: 'review',
  maintain: 'maintain',
  blocked: 'requirements',
  pending: 'pending',
  exploring: 'exploring',
  archived: 'maintain',
};

/**
 * Derives the UI lifecycle phase from a Feature + AgentRun.
 * Shared by build-feature-node-data.ts and build-graph-nodes.ts.
 */
export function deriveLifecycle(feature: Feature, run: AgentRun | null): FeatureLifecyclePhase {
  if (run?.status === 'completed') return 'maintain';
  const agentNode = run?.result?.startsWith('node:') ? run.result.slice(5) : undefined;
  return (
    (agentNode ? phaseNameToLifecycle[agentNode] : undefined) ??
    sdlcLifecycleMap[feature.lifecycle] ??
    'requirements'
  );
}

export interface SseEventUpdate {
  featureId: string;
  state: FeatureNodeState | undefined;
  lifecycle: FeatureLifecyclePhase | undefined;
  eventType: NotificationEventType;
  phaseName?: string;
}

/**
 * Resolves state/lifecycle updates from a batch of SSE events, applying
 * the WaitingApproval batch-suppression rule: when WaitingApproval and
 * PhaseCompleted arrive in the same batch for a feature, PhaseCompleted
 * is fully suppressed to prevent lifecycle regression.
 */
export function resolveSseEventUpdates(
  events: readonly { featureId: string; eventType: NotificationEventType; phaseName?: string }[]
): SseEventUpdate[] {
  const waitingApprovalFeatures = new Set(
    events
      .filter((e) => e.eventType === NotificationEventType.WaitingApproval)
      .map((e) => e.featureId)
  );

  return events.map((event) => {
    const isSuppressed =
      event.eventType === NotificationEventType.PhaseCompleted &&
      waitingApprovalFeatures.has(event.featureId);
    return {
      featureId: event.featureId,
      state: isSuppressed ? undefined : mapEventTypeToState(event.eventType),
      lifecycle: isSuppressed ? undefined : mapPhaseNameToLifecycle(event.phaseName),
      eventType: event.eventType,
      phaseName: event.phaseName,
    };
  });
}

export function mapPhaseNameToLifecycle(
  phaseName: string | undefined
): FeatureLifecyclePhase | undefined {
  if (!phaseName) return undefined;
  return phaseNameToLifecycle[phaseName];
}
