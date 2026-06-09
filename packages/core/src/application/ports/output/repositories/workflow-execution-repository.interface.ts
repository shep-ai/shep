/**
 * Workflow Execution Repository Interface
 *
 * Output port for WorkflowExecution persistence operations.
 * Implementations handle database-specific logic (SQLite, etc.).
 *
 * Following Clean Architecture:
 * - Domain and Application layers depend on this interface
 * - Infrastructure layer provides concrete implementations
 */

import type {
  WorkflowExecution,
  WorkflowExecutionStatus,
} from '../../../../domain/generated/output.js';

/**
 * Repository interface for WorkflowExecution entity persistence.
 *
 * Implementations must:
 * - Handle database connection management
 * - Provide thread-safe operations
 * - Support efficient queries by workflowId and status
 * - Support retention cleanup via deleteOlderThan
 */
export interface IWorkflowExecutionRepository {
  /**
   * Create a new execution record.
   *
   * @param execution - The execution to persist
   */
  create(execution: WorkflowExecution): Promise<void>;

  /**
   * Find an execution by its unique ID.
   *
   * @param id - The execution ID
   * @returns The execution or null if not found
   */
  findById(id: string): Promise<WorkflowExecution | null>;

  /**
   * Find executions for a specific workflow, ordered by started_at DESC.
   *
   * @param workflowId - The workflow ID
   * @param limit - Optional maximum number of records to return
   * @returns Array of executions, most recent first
   */
  findByWorkflowId(workflowId: string, limit?: number): Promise<WorkflowExecution[]>;

  /**
   * Find executions with a specific status.
   * Used by the scheduler for crash recovery (finding stale 'running' records).
   *
   * @param status - The execution status to filter by
   * @returns Array of matching executions
   */
  findByStatus(status: WorkflowExecutionStatus): Promise<WorkflowExecution[]>;

  /**
   * Update an existing execution record.
   *
   * @param execution - The execution with updated fields
   */
  update(execution: WorkflowExecution): Promise<void>;

  /**
   * Delete execution records older than the given date.
   * Used for retention cleanup (default: 30 days).
   *
   * @param date - Delete records with started_at before this date
   * @returns The number of records deleted
   */
  deleteOlderThan(date: Date): Promise<number>;
}
