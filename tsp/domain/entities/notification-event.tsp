/**
 * @module Shep.Domain.Entities.NotificationEvent
 *
 * Defines the NotificationEvent model representing a notification emitted
 * when an agent transitions through lifecycle states. This is a value object
 * (no BaseEntity inheritance) since notification events are ephemeral —
 * they are emitted, delivered to active channels, and not persisted.
 *
 * ## Event Flow
 *
 * ```
 * NotificationWatcherService (polls DB)
 *   → detects status transition
 *   → creates NotificationEvent
 *   → emits to NotificationEventBus
 *   → fans out to: SSE clients, desktop notifier
 * ```
 *
 * ## Optional Payloads
 *
 * Some event types carry a scoped payload beyond the generic
 * feature/agent-run envelope:
 *
 *   • `ApplicationUpdated`        → `applicationUpdate`
 *   • `OperationLogAppended`      → `operationLogAppend`
 *   • `CloudDeploymentUpdated`    → `cloudDeployment` (runtime-only; see
 *     NotificationStreamEvent in stream-agent-events.types.ts)
 *
 * Clients select the payload they care about by event type and can patch
 * their local state directly — no HTTP refetch required.
 */
import "../../common/base.tsp";
import "../../common/enums/notification.tsp";
import "../../common/enums/cloud-deployment.tsp";
import "./application.tsp";
import "./operation-log-entry.tsp";

@doc("Scoped payload for an ApplicationUpdated notification — carries only the fields the client patches in-place. Deltas for unchanged fields are omitted.")
model ApplicationUpdatePayload {
  @doc("The application whose row changed")
  applicationId: string;

  @doc("Current setup_complete flag (after the transition)")
  setupComplete: boolean;

  @doc("Current application status (after the transition)")
  status: ApplicationStatus;

  @doc("Current git remote URL, if one is set")
  gitRemoteUrl?: string;

  @doc("Selected cloud deployment provider, if one is set")
  cloudDeploymentProvider?: CloudDeploymentProvider;
}

@doc("Scoped payload for an OperationLogAppended notification — carries the newly-appended entry so clients can patch their log list in-place without a refetch.")
model OperationLogAppendPayload {
  @doc("The newly-appended operation log entry")
  entry: OperationLogEntry;
}

@doc("Notification event emitted for agent lifecycle transitions")
model NotificationEvent {
  @doc("Type of lifecycle event")
  eventType: NotificationEventType;

  @doc("ID of the agent run that triggered this event")
  agentRunId: string;

  @doc("ID of the feature that triggered this event")
  featureId: string;

  @doc("Human-readable feature name")
  featureName: string;

  @doc("Phase name (only for phaseCompleted events)")
  phaseName?: string;

  @doc("Human-readable event description")
  message: string;

  @doc("Display severity for notification rendering")
  severity: NotificationSeverity;

  @doc("When the event occurred")
  timestamp: utcDateTime;

  @doc("Scoped payload for ApplicationUpdated events — present iff eventType === ApplicationUpdated")
  applicationUpdate?: ApplicationUpdatePayload;

  @doc("Scoped payload for OperationLogAppended events — present iff eventType === OperationLogAppended")
  operationLogAppend?: OperationLogAppendPayload;
}
