/**
 * Feature State Derivation
 *
 * Derives UI node state and progress from the Feature domain model
 * and its associated AgentRun status (mirrors CLI feat ls logic).
 */

import {
  SdlcLifecycle,
  AgentRunStatus,
  TaskState,
  NotificationEventType,
} from '@shepai/core/domain/generated';
import type { Feature, AgentRun } from '@shepai/core/domain/generated';
import type { FeatureNodeState, FeatureLifecyclePhase } from './feature-node-state-config';

/**
 * Derives the visual node state from a Feature and its optional AgentRun.
 *
 * Priority (mirrors CLI formatStatus):
 * 1. Agent waiting_approval → action-required
 * 2. Agent failed → error
 * 3. Agent interrupted/cancelled → error
 * 4. Agent completed + Maintain lifecycle → done
 * 5. Agent running/pending → running
 * 6. No agent run → fall back to plan tasks / lifecycle
 */
export function deriveNodeState(
  feature: Feature,
  agentRun?: AgentRun | null,
  options?: { isPidAlive?: boolean }
): FeatureNodeState {
  // Deleting lifecycle takes top priority — feature is being removed
  if (feature.lifecycle === SdlcLifecycle.Deleting) {
    return 'deleting';
  }

  // Archived lifecycle — feature is hidden/dormant, takes priority over agent run
  if (feature.lifecycle === SdlcLifecycle.Archived) {
    return 'archived';
  }

  // Pending lifecycle — user-deferred, agent not yet spawned
  if (feature.lifecycle === SdlcLifecycle.Pending) {
    return 'pending';
  }

  // Blocked lifecycle takes priority — child waiting on parent regardless of agent run
  if (feature.lifecycle === SdlcLifecycle.Blocked) {
    return 'blocked';
  }

  if (agentRun) {
    switch (agentRun.status) {
      case AgentRunStatus.waitingApproval:
        return 'action-required';
      case AgentRunStatus.failed:
        return 'error';
      case AgentRunStatus.interrupted:
      case AgentRunStatus.cancelled:
        return 'error';
      case AgentRunStatus.completed:
        return 'done';
      case AgentRunStatus.running:
      case AgentRunStatus.pending:
        if (options?.isPidAlive === false) return 'error';
        return 'running';
    }
  }

  // No agent run — fall back to plan tasks
  if (feature.lifecycle === SdlcLifecycle.Maintain) {
    return 'done';
  }

  // Adopted branch with an open PR — needs user review/merge action
  if (feature.lifecycle === SdlcLifecycle.Review && !agentRun) {
    return 'action-required';
  }

  const tasks = feature.plan?.tasks;
  if (!tasks || tasks.length === 0) {
    return 'running';
  }

  if (tasks.some((t) => t.state === TaskState.Review)) {
    return 'action-required';
  }
  if (tasks.some((t) => t.state === TaskState.WIP)) {
    return 'running';
  }
  if (tasks.every((t) => t.state === TaskState.Done)) {
    return 'done';
  }

  return 'running';
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
