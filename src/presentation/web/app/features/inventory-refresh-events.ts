import { NotificationEventType } from '@shepai/core/domain/generated/output';

/**
 * Agent events that change a row the `/features` inventory renders — a
 * feature's lifecycle, its derived node state (agent run status), whether its
 * PR is open, or an application row's status. Log lines, collaboration and
 * workflow events leave every row as it was, so they do not trigger a refresh.
 */
export const INVENTORY_REFRESH_EVENT_TYPES: ReadonlySet<NotificationEventType> = new Set([
  NotificationEventType.AgentStarted,
  NotificationEventType.PhaseCompleted,
  NotificationEventType.WaitingApproval,
  NotificationEventType.AgentCompleted,
  NotificationEventType.AgentFailed,
  NotificationEventType.MergeReviewReady,
  NotificationEventType.PrMerged,
  NotificationEventType.PrClosed,
  NotificationEventType.ApplicationUpdated,
]);
