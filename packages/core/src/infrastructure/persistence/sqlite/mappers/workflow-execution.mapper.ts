/**
 * Workflow Execution Database Mapper
 *
 * Maps between WorkflowExecution domain objects and SQLite database rows.
 *
 * Mapping Rules:
 * - TypeScript objects (camelCase) <-> SQL columns (snake_case)
 * - Dates stored as INTEGER (unix milliseconds)
 * - Optional fields stored as NULL when missing
 * - Enum values (WorkflowTriggerType, WorkflowExecutionStatus) stored as strings
 */

import type { WorkflowExecution } from '../../../../domain/generated/output.js';
import type {
  WorkflowTriggerType,
  WorkflowExecutionStatus,
} from '../../../../domain/generated/output.js';

/**
 * Database row type matching the workflow_executions table schema.
 * Uses snake_case column names.
 */
export interface WorkflowExecutionRow {
  id: string;
  workflow_id: string;
  trigger_type: string;
  status: string;
  started_at: number;
  completed_at: number | null;
  duration_ms: number | null;
  output_summary: string | null;
  error_message: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * Maps WorkflowExecution domain object to database row.
 * Converts Date objects to unix milliseconds for SQL storage.
 *
 * @param execution - WorkflowExecution domain object
 * @returns Database row object with snake_case columns
 */
export function toDatabase(execution: WorkflowExecution): WorkflowExecutionRow {
  return {
    id: execution.id,
    workflow_id: execution.workflowId,
    trigger_type: execution.triggerType,
    status: execution.status,
    started_at:
      execution.startedAt instanceof Date ? execution.startedAt.getTime() : execution.startedAt,
    completed_at:
      execution.completedAt instanceof Date
        ? execution.completedAt.getTime()
        : (execution.completedAt ?? null),
    duration_ms: execution.durationMs ?? null,
    output_summary: execution.outputSummary ?? null,
    error_message: execution.errorMessage ?? null,
    created_at:
      execution.createdAt instanceof Date ? execution.createdAt.getTime() : execution.createdAt,
    updated_at:
      execution.updatedAt instanceof Date ? execution.updatedAt.getTime() : execution.updatedAt,
  };
}

/**
 * Maps database row to WorkflowExecution domain object.
 * Converts unix milliseconds back to Date objects.
 *
 * @param row - Database row with snake_case columns
 * @returns WorkflowExecution domain object with camelCase properties
 */
export function fromDatabase(row: WorkflowExecutionRow): WorkflowExecution {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    triggerType: row.trigger_type as WorkflowTriggerType,
    status: row.status as WorkflowExecutionStatus,
    startedAt: new Date(row.started_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.completed_at != null && { completedAt: new Date(row.completed_at) }),
    ...(row.duration_ms != null && { durationMs: row.duration_ms }),
    ...(row.output_summary != null && { outputSummary: row.output_summary }),
    ...(row.error_message != null && { errorMessage: row.error_message }),
  };
}
