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
 * | Workflow Started   | info     |
 * | Workflow Completed | success  |
 * | Workflow Failed    | error    |
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

  @doc("Application row changed — one or more of setupComplete, status, gitRemoteUrl, or cloudDeploymentProvider transitioned since the last poll")
  ApplicationUpdated: "application_updated",

  @doc("A new OperationLogEntry was appended for a long-running operation (scaffold, cloud deploy, git publish, repo sync)")
  OperationLogAppended: "operation_log_appended",

  @doc("A non-blocking AgentQuestion was raised by a running agent and is awaiting an answer (spec 093)")
  AgentQuestionPending: "agent_question_pending",

  @doc("A blocking AgentQuestion was raised by a running agent — the agent is paused and MUST be answered (spec 093)")
  AgentQuestionBlocking: "agent_question_blocking",

  @doc("An inter-agent message could not be delivered or was rejected by the hub (spec 093)")
  AgentMessageBlocked: "agent_message_blocked",

  @doc("Supervisor agent escalated a decision back to the user (spec 093)")
  SupervisorEscalated: "supervisor_escalated",

  @doc("Supervisor agent evaluation failed (timeout, model error, exception); fell back to standard human approval (spec 093, FR-22)")
  SupervisorFailed: "supervisor_failed",

  @doc("Scheduled workflow execution has started")
  WorkflowStarted: "workflow_started",

  @doc("Scheduled workflow execution completed successfully")
  WorkflowCompleted: "workflow_completed",

  @doc("Scheduled workflow execution failed with an error")
  WorkflowFailed: "workflow_failed",
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
