/**
 * @module Shep.Domain.Entities.ScheduledWorkflow
 *
 * Defines the ScheduledWorkflow entity representing a user-defined reusable
 * automation that can run on-demand or on a cron schedule via the shep daemon.
 * Each workflow contains an agent prompt and optional tool constraints that
 * define what the AI agent will execute.
 *
 * ## Entity Relationships
 *
 * ```
 * +---------------------------------------------------+
 * |            SCHEDULED WORKFLOW                      |
 * +---------------------------------------------------+
 * | name: string (unique per repository)              |
 * | prompt: string (agent instruction)                |
 * | cronExpression?: string (cron schedule)            |
 * | enabled: boolean                                  |
 * +---------------------------------------------------+
 *            |
 *            | 0..*
 *            v
 *     +--------------------+
 *     | WorkflowExecution  |
 *     +--------------------+
 *     | triggerType         |
 *     | status              |
 *     | startedAt           |
 *     +--------------------+
 * ```
 *
 * ## Lifecycle
 *
 * ```
 * create ──► enabled (scheduling active) ──► disabled (scheduling paused)
 *                                        ──► deleted (soft-delete)
 * ```
 *
 * @see domain/entities/workflow-execution.tsp - Execution history records
 * @see common/enums/scheduled-workflow.tsp - Trigger type and status enums
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";

/**
 * ScheduledWorkflow Entity
 *
 * A reusable automation definition containing an agent prompt and optional
 * tool constraints. Workflows can be triggered manually via CLI/web UI or
 * automatically via a cron schedule managed by the daemon scheduler.
 *
 * Extends SoftDeletableEntity to preserve execution history for audit
 * when a workflow is deleted.
 */
@doc("User-defined reusable automation that runs on demand or on a cron schedule")
model ScheduledWorkflow extends SoftDeletableEntity {
  @doc("Unique human-readable name identifying this workflow within the repository")
  name: string;

  @doc("Optional human-readable description of what this workflow does")
  description?: string;

  @doc("Agent prompt instruction that the AI agent will execute when the workflow runs")
  prompt: string;

  @doc("Optional allowlist of tool names the workflow agent is permitted to use")
  toolConstraints?: string[];

  @doc("Cron expression defining the schedule (5-field format: min hour dom month dow)")
  cronExpression?: string;

  @doc("IANA timezone for cron evaluation (e.g. America/New_York). Defaults to UTC")
  timezone?: string;

  @doc("Whether the workflow schedule is active. Disabled workflows retain their cron expression but do not auto-execute")
  enabled: boolean;

  @doc("Timestamp of the most recent execution (manual or scheduled)")
  lastRunAt?: utcDateTime;

  @doc("Calculated timestamp of the next scheduled execution based on cron expression")
  nextRunAt?: utcDateTime;

  @doc("Absolute file system path to the repository this workflow operates on")
  repositoryPath: string;
}
