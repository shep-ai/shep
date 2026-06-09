/**
 * Scheduled Workflow Database Mapper
 *
 * Maps between ScheduledWorkflow domain objects and SQLite database rows.
 *
 * Mapping Rules:
 * - TypeScript objects (camelCase) <-> SQL columns (snake_case)
 * - Dates stored as INTEGER (unix milliseconds)
 * - Optional fields stored as NULL when missing
 * - toolConstraints stored as JSON TEXT array
 * - enabled stored as INTEGER (0/1)
 * - SoftDeletableEntity: deletedAt mapped to deleted_at
 */

import type { ScheduledWorkflow } from '../../../../domain/generated/output.js';

/**
 * Database row type matching the scheduled_workflows table schema.
 * Uses snake_case column names.
 */
export interface ScheduledWorkflowRow {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  tool_constraints: string | null;
  cron_expression: string | null;
  timezone: string | null;
  enabled: number;
  last_run_at: number | null;
  next_run_at: number | null;
  repository_path: string;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
}

/**
 * Maps ScheduledWorkflow domain object to database row.
 * Converts Date objects to unix milliseconds and complex fields to JSON for SQL storage.
 *
 * @param workflow - ScheduledWorkflow domain object
 * @returns Database row object with snake_case columns
 */
export function toDatabase(workflow: ScheduledWorkflow): ScheduledWorkflowRow {
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description ?? null,
    prompt: workflow.prompt,
    tool_constraints: workflow.toolConstraints ? JSON.stringify(workflow.toolConstraints) : null,
    cron_expression: workflow.cronExpression ?? null,
    timezone: workflow.timezone ?? null,
    enabled: workflow.enabled ? 1 : 0,
    last_run_at:
      workflow.lastRunAt instanceof Date
        ? workflow.lastRunAt.getTime()
        : (workflow.lastRunAt ?? null),
    next_run_at:
      workflow.nextRunAt instanceof Date
        ? workflow.nextRunAt.getTime()
        : (workflow.nextRunAt ?? null),
    repository_path: workflow.repositoryPath,
    deleted_at:
      workflow.deletedAt instanceof Date
        ? workflow.deletedAt.getTime()
        : (workflow.deletedAt ?? null),
    created_at:
      workflow.createdAt instanceof Date ? workflow.createdAt.getTime() : workflow.createdAt,
    updated_at:
      workflow.updatedAt instanceof Date ? workflow.updatedAt.getTime() : workflow.updatedAt,
  };
}

/**
 * Maps database row to ScheduledWorkflow domain object.
 * Converts unix milliseconds back to Date objects and JSON strings to arrays.
 *
 * @param row - Database row with snake_case columns
 * @returns ScheduledWorkflow domain object with camelCase properties
 */
export function fromDatabase(row: ScheduledWorkflowRow): ScheduledWorkflow {
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    enabled: row.enabled === 1,
    repositoryPath: row.repository_path,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.description != null && { description: row.description }),
    ...(row.tool_constraints != null && {
      toolConstraints: JSON.parse(row.tool_constraints) as string[],
    }),
    ...(row.cron_expression != null && { cronExpression: row.cron_expression }),
    ...(row.timezone != null && { timezone: row.timezone }),
    ...(row.last_run_at != null && { lastRunAt: new Date(row.last_run_at) }),
    ...(row.next_run_at != null && { nextRunAt: new Date(row.next_run_at) }),
    ...(row.deleted_at != null && { deletedAt: new Date(row.deleted_at) }),
  };
}
