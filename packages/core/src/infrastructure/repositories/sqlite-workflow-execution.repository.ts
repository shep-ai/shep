/**
 * SQLite Workflow Execution Repository Implementation
 *
 * Implements IWorkflowExecutionRepository using SQLite database.
 * Uses prepared statements to prevent SQL injection.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { IWorkflowExecutionRepository } from '../../application/ports/output/repositories/workflow-execution-repository.interface.js';
import type { WorkflowExecution, WorkflowExecutionStatus } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type WorkflowExecutionRow,
} from '../persistence/sqlite/mappers/workflow-execution.mapper.js';

/**
 * SQLite implementation of IWorkflowExecutionRepository.
 * Manages WorkflowExecution persistence with CRUD and retention cleanup.
 */
@injectable()
export class SQLiteWorkflowExecutionRepository implements IWorkflowExecutionRepository {
  constructor(private readonly db: Database.Database) {}

  async create(execution: WorkflowExecution): Promise<void> {
    const row = toDatabase(execution);

    const stmt = this.db.prepare(`
      INSERT INTO workflow_executions (
        id, workflow_id, trigger_type, status,
        started_at, completed_at, duration_ms,
        output_summary, error_message,
        created_at, updated_at
      ) VALUES (
        @id, @workflow_id, @trigger_type, @status,
        @started_at, @completed_at, @duration_ms,
        @output_summary, @error_message,
        @created_at, @updated_at
      )
    `);

    stmt.run(row);
  }

  async findById(id: string): Promise<WorkflowExecution | null> {
    const stmt = this.db.prepare('SELECT * FROM workflow_executions WHERE id = ?');
    const row = stmt.get(id) as WorkflowExecutionRow | undefined;

    if (!row) {
      return null;
    }

    return fromDatabase(row);
  }

  async findByWorkflowId(workflowId: string, limit?: number): Promise<WorkflowExecution[]> {
    const sql = limit
      ? 'SELECT * FROM workflow_executions WHERE workflow_id = ? ORDER BY started_at DESC LIMIT ?'
      : 'SELECT * FROM workflow_executions WHERE workflow_id = ? ORDER BY started_at DESC';

    const stmt = this.db.prepare(sql);
    const rows = (
      limit ? stmt.all(workflowId, limit) : stmt.all(workflowId)
    ) as WorkflowExecutionRow[];

    return rows.map(fromDatabase);
  }

  async findByStatus(status: WorkflowExecutionStatus): Promise<WorkflowExecution[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM workflow_executions WHERE status = ? ORDER BY started_at ASC'
    );
    const rows = stmt.all(status) as WorkflowExecutionRow[];

    return rows.map(fromDatabase);
  }

  async update(execution: WorkflowExecution): Promise<void> {
    const row = toDatabase(execution);

    const stmt = this.db.prepare(`
      UPDATE workflow_executions SET
        workflow_id = @workflow_id,
        trigger_type = @trigger_type,
        status = @status,
        started_at = @started_at,
        completed_at = @completed_at,
        duration_ms = @duration_ms,
        output_summary = @output_summary,
        error_message = @error_message,
        updated_at = @updated_at
      WHERE id = @id
    `);

    stmt.run(row);
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const stmt = this.db.prepare('DELETE FROM workflow_executions WHERE started_at < ?');
    const result = stmt.run(date.getTime());
    return result.changes;
  }
}
