/**
 * Shared types for the StreamAgentEventsUseCase and its pure helper modules.
 *
 * Extracted from the monolithic use case as part of the clean-arch cleanup
 * (spec 089, file size violation #30). These types are consumed by the
 * orchestrator use case AND by the per-delta helper functions that live
 * next to it.
 */

import type {
  ApplicationStatus,
  CloudDeploymentProvider,
  NotificationEvent,
} from '../../../../domain/generated/output.js';
import { AgentRunStatus, InteractiveSessionStatus } from '../../../../domain/generated/output.js';
import {
  InteractiveSessionEventType,
  NotificationEventType,
  NotificationSeverity,
} from '../../../../domain/generated/output.js';

/**
 * Payload shape for an interactive-session lifecycle transition. Mirrors the
 * historical `InteractiveSessionEvent` type emitted by the SSE route so the
 * client contract is preserved byte-for-byte.
 */
export interface InteractiveSessionStreamEvent {
  kind: 'interactive-session';
  type: InteractiveSessionEventType;
  sessionId: string;
  featureId: string;
}

/**
 * Envelope for a `NotificationEvent`. The optional `cloudDeployment` field is
 * preserved for cloud deploy broadcasts which historically piggy-back on the
 * notification channel with an extra `cloudDeployment` property.
 */
export interface NotificationStreamEvent {
  kind: 'notification';
  event: NotificationEvent & {
    cloudDeployment?: {
      applicationId: string;
      provider: string;
      status: string;
      url?: string;
      error?: string;
    };
  };
}

export type StreamedAgentEvent = NotificationStreamEvent | InteractiveSessionStreamEvent;

/** Per-connection cached state for a single feature. */
export interface CachedFeatureState {
  status: AgentRunStatus | null;
  lifecycle: string;
  completedPhases: Set<string>;
  featureName: string;
  prStatus: string | undefined;
  prMergeable: boolean | undefined;
  prCiStatus: string | undefined;
  /** Set once we've detected and emitted a crash event for this feature. */
  crashEmitted?: boolean;
}

/** Per-connection cached state for an interactive session. */
export interface CachedSessionState {
  status: InteractiveSessionStatus;
}

/** Per-connection cached state for an application row. */
export interface CachedApplicationState {
  setupComplete: boolean;
  status: ApplicationStatus;
  gitRemoteUrl: string | undefined;
  cloudDeploymentProvider: CloudDeploymentProvider | undefined;
}

/**
 * Mapping table from terminal-ish `AgentRunStatus` values to the notification
 * they should produce. Exported so helper modules can share one source of
 * truth with the orchestrator.
 */
export const STATUS_TO_EVENT: Partial<
  Record<AgentRunStatus, { eventType: NotificationEventType; severity: NotificationSeverity }>
> = {
  [AgentRunStatus.running]: {
    eventType: NotificationEventType.AgentStarted,
    severity: NotificationSeverity.Info,
  },
  [AgentRunStatus.waitingApproval]: {
    eventType: NotificationEventType.WaitingApproval,
    severity: NotificationSeverity.Warning,
  },
  [AgentRunStatus.completed]: {
    eventType: NotificationEventType.AgentCompleted,
    severity: NotificationSeverity.Success,
  },
  [AgentRunStatus.failed]: {
    eventType: NotificationEventType.AgentFailed,
    severity: NotificationSeverity.Error,
  },
  [AgentRunStatus.interrupted]: {
    eventType: NotificationEventType.AgentFailed,
    severity: NotificationSeverity.Warning,
  },
  [AgentRunStatus.cancelled]: {
    eventType: NotificationEventType.AgentFailed,
    severity: NotificationSeverity.Warning,
  },
};

/** Map agent graph node name from `AgentRun.result` to a phase name. */
export function resultToPhase(result: string | undefined): string | undefined {
  if (!result?.startsWith('node:')) return undefined;
  return result.slice(5); // "node:analyze" → "analyze"
}

/**
 * Map interactive session status → event type. Stays pure so helper modules
 * can call it without hitting tsyringe.
 */
export function statusToInteractiveEventType(
  status: InteractiveSessionStatus
): InteractiveSessionEventType {
  switch (status) {
    case InteractiveSessionStatus.booting:
      return InteractiveSessionEventType.Booting;
    case InteractiveSessionStatus.ready:
      return InteractiveSessionEventType.Ready;
    case InteractiveSessionStatus.error:
      return InteractiveSessionEventType.Error;
    default:
      return InteractiveSessionEventType.Stopped;
  }
}
