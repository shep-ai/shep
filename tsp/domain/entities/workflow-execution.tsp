/**
 * @module Shep.Domain.Entities.WorkflowExecution
 *
 * Defines the WorkflowExecution entity representing a single run of a
 * ScheduledWorkflow. Each execution tracks the trigger type, status lifecycle,
 * timing information, and output/error details.
 *
 * ## Execution Lifecycle
 *
 * ```
 * queued ──► running ──► completed
 *                   └──► failed
 *    └──► cancelled
 * ```
 *
 * ## Retention Policy
 *
 * WorkflowExecution records are hard-deleted (not soft-deleted) by the 30-day
 * retention policy. This is why the entity extends BaseEntity rather than
 * SoftDeletableEntity — there is no need to preserve deleted execution records.
 *
 * @see domain/entities/scheduled-workflow.tsp - Parent workflow definition
 * @see common/enums/scheduled-workflow.tsp - Trigger type and status enums
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";
import "../../common/enums/scheduled-workflow.tsp";

/**
 * WorkflowExecution Entity
 *
 * Tracks a single run of a ScheduledWorkflow including its trigger mechanism,
 * status progression, timing, and output. Execution records are used for
 * history viewing, debugging, and audit purposes.
 *
 * Extends BaseEntity (not SoftDeletableEntity) because execution records
 * are hard-deleted by the time-based retention policy.
 */
@doc("A single execution record for a scheduled workflow run")
model WorkflowExecution extends BaseEntity {
  @doc("ID of the ScheduledWorkflow that was executed")
  workflowId: UUID;

  @doc("How this execution was triggered (manual or scheduled)")
  triggerType: WorkflowTriggerType;

  @doc("Current lifecycle status of this execution")
  status: WorkflowExecutionStatus;

  @doc("Timestamp when the execution started running")
  startedAt: utcDateTime;

  @doc("Timestamp when the execution completed or failed (null if still running)")
  completedAt?: utcDateTime;

  @doc("Duration of the execution in milliseconds (null if still running)")
  durationMs?: integer;

  @doc("Summary of the execution output (truncated if too long)")
  outputSummary?: string;

  @doc("Error message if the execution failed")
  errorMessage?: string;
}
