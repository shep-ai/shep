/**
 * @module Shep.Common.Enums.Notification
 *
 * Defines enums for the agent notification subsystem. These enums classify
 * the types of agent lifecycle events that trigger notifications and the
 * severity levels used for rendering (toast color, icon, urgency).
 *
 * ## Notification Events
 *
 * Notifications are emitted for a curated set of meaningful agent lifecycle
 * transitions: started, phase completed, waiting for approval, completed,
 * and failed. Intermediate heartbeats and user-initiated states (cancelled)
 * are excluded to avoid noise.
 *
 * ## Severity Mapping
 *
 * | Event              | Severity |
 * |--------------------|----------|
 * | Agent Started      | info     |
 * | Phase Completed    | info     |
 * | Waiting Approval   | warning  |
 * | Agent Completed    | success  |
 * | Agent Failed       | error    |
 * | PR Merged          | success  |
 * | PR Closed          | warning  |
 * | PR Checks Passed   | success  |
 * | PR Checks Failed   | error    |
 * | PR Blocked         | warning  |
 * | MR Review Ready    | info     |
 */
/**
 * Types of agent lifecycle events that trigger notifications.
 *
 * ```
 * agent_started ──► phase_completed (×N) ──► agent_completed
 *                                     └──► waiting_approval ──► ...
 *                                     └──► agent_failed
 * ```
 */
@doc("Types of agent lifecycle notification events")
enum NotificationEventType {
  @doc("Agent has started running")
  AgentStarted: "agent_started",

  @doc("Agent completed a workflow phase (analyze, requirements, research, plan, implement)")
  PhaseCompleted: "phase_completed",

  @doc("Agent is paused awaiting human approval")
  WaitingApproval: "waiting_approval",

  @doc("Agent completed successfully")
  AgentCompleted: "agent_completed",

  @doc("Agent execution failed with an error")
  AgentFailed: "agent_failed",

  @doc("Pull request was merged on GitHub")
  PrMerged: "pr_merged",

  @doc("Pull request was closed without merging on GitHub")
  PrClosed: "pr_closed",

  @doc("Pull request CI checks passed")
  PrChecksPassed: "pr_checks_passed",

  @doc("Pull request CI checks failed")
  PrChecksFailed: "pr_checks_failed",

  @doc("Pull request has merge conflicts and cannot be merged")
  PrBlocked: "pr_blocked",

  @doc("Feature is ready for merge review — PR created and waiting for approval")
  MergeReviewReady: "merge_review_ready",

  @doc("Cloud deployment status changed — emitted by the in-process cloud deployment event bus")
  CloudDeploymentUpdated: "cloud_deployment_updated",
}

/**
 * Severity level for notification display rendering.
 *
 * Maps to toast variants:
 * - info → toast.info()
 * - warning → toast.warning()
 * - success → toast.success()
 * - error → toast.error()
 */
@doc("Severity level for notification display")
enum NotificationSeverity {
  @doc("Informational event (agent started, phase completed)")
  Info: "info",

  @doc("Warning requiring attention (waiting for approval)")
  Warning: "warning",

  @doc("Successful outcome (agent completed)")
  Success: "success",

  @doc("Error condition (agent failed)")
  Error: "error",
}
