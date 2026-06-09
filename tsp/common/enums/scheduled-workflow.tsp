/**
 * @module Shep.Common.Enums.ScheduledWorkflow
 *
 * Defines enums for the scheduled workflow subsystem. These enums classify
 * the trigger mechanism for workflow executions and the execution status
 * lifecycle that each workflow run progresses through.
 *
 * ## Trigger Types
 *
 * Workflows can be triggered in two ways:
 * - **Manual**: User-initiated via CLI (`shep workflow run`) or web UI trigger button
 * - **Scheduled**: Automatically triggered by the daemon's cron scheduler
 *
 * ## Execution Status Lifecycle
 *
 * ```
 * queued ──► running ──► completed
 *                   └──► failed
 *    └──► cancelled
 * ```
 */
/**
 * How a workflow execution was triggered.
 *
 * Stored on each WorkflowExecution record to distinguish between
 * user-initiated and cron-scheduled runs.
 */
@doc("How a workflow execution was triggered")
enum WorkflowTriggerType {
  @doc("Manually triggered by user via CLI or web UI")
  Manual: "manual",

  @doc("Automatically triggered by the cron scheduler")
  Scheduled: "scheduled",
}

/**
 * Lifecycle status of a workflow execution.
 *
 * ```
 * queued ──► running ──► completed
 *                   └──► failed
 *    └──► cancelled
 * ```
 */
@doc("Lifecycle status of a workflow execution")
enum WorkflowExecutionStatus {
  @doc("Execution is queued and waiting to run")
  Queued: "queued",

  @doc("Execution is currently in progress")
  Running: "running",

  @doc("Execution completed successfully")
  Completed: "completed",

  @doc("Execution failed with an error")
  Failed: "failed",

  @doc("Execution was cancelled before completion")
  Cancelled: "cancelled",
}
