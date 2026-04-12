/**
 * SQLite Workflow Step Repository
 *
 * Source-of-truth for workflow step lifecycle. All status
 * transitions are single-row UPDATEs that stamp `started_at` /
 * `finished_at` alongside the status change so a crash between
 * two statements never leaves dangling data.
 *
 * `ensureSteps` is idempotent: on first call it inserts the seed
 * list; on subsequent calls it just returns the existing rows.
 * The orchestrator uses this on every run so resuming an
 * interrupted workflow is a no-op for the repository.
 */

import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { injectable } from 'tsyringe';
import type {
  IWorkflowStepRepository,
  StepSeed,
} from '../../application/ports/output/repositories/workflow-step-repository.interface.js';
import { type WorkflowStep, WorkflowStepStatus } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type WorkflowStepRow,
} from '../persistence/sqlite/mappers/workflow-step.mapper.js';

@injectable()
export class SQLiteWorkflowStepRepository implements IWorkflowStepRepository {
  constructor(private readonly db: Database.Database) {}

  async create(step: WorkflowStep): Promise<void> {
    const row = toDatabase(step);
    this.db
      .prepare(
        `INSERT INTO workflow_steps
           (id, session_id, feature_id, workflow_id, step_key, step_index,
            title, description, status, started_at, finished_at, metadata,
            created_at, updated_at)
         VALUES
           (@id, @session_id, @feature_id, @workflow_id, @step_key, @step_index,
            @title, @description, @status, @started_at, @finished_at, @metadata,
            @created_at, @updated_at)`
      )
      .run(row);
  }

  async ensureSteps(
    sessionId: string,
    workflowId: string,
    featureId: string,
    seeds: readonly StepSeed[]
  ): Promise<WorkflowStep[]> {
    const existing = this.db
      .prepare(
        `SELECT * FROM workflow_steps
          WHERE session_id = ? AND workflow_id = ?
          ORDER BY step_index ASC`
      )
      .all(sessionId, workflowId) as WorkflowStepRow[];

    if (existing.length > 0) {
      return existing.map(fromDatabase);
    }

    const now = Date.now();
    const insert = this.db.prepare(
      `INSERT INTO workflow_steps
         (id, session_id, feature_id, workflow_id, step_key, step_index,
          title, description, status, started_at, finished_at, metadata,
          created_at, updated_at)
       VALUES
         (@id, @session_id, @feature_id, @workflow_id, @step_key, @step_index,
          @title, @description, @status, @started_at, @finished_at, @metadata,
          @created_at, @updated_at)`
    );

    const txn = this.db.transaction((rows: WorkflowStepRow[]) => {
      for (const row of rows) insert.run(row);
    });

    const rows: WorkflowStepRow[] = seeds.map((seed) => ({
      id: randomUUID(),
      session_id: sessionId,
      feature_id: featureId,
      workflow_id: workflowId,
      step_key: seed.stepKey,
      step_index: seed.stepIndex,
      title: seed.title,
      description: seed.description,
      status: WorkflowStepStatus.pending,
      started_at: null,
      finished_at: null,
      metadata: null,
      created_at: now,
      updated_at: now,
    }));

    txn(rows);
    return rows.map(fromDatabase);
  }

  async findById(stepId: string): Promise<WorkflowStep | null> {
    const row = this.db.prepare(`SELECT * FROM workflow_steps WHERE id = ?`).get(stepId) as
      | WorkflowStepRow
      | undefined;
    return row ? fromDatabase(row) : null;
  }

  async listBySession(sessionId: string): Promise<WorkflowStep[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM workflow_steps
          WHERE session_id = ?
          ORDER BY step_index ASC`
      )
      .all(sessionId) as WorkflowStepRow[];
    return rows.map(fromDatabase);
  }

  async listByFeature(featureId: string): Promise<WorkflowStep[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM workflow_steps
          WHERE feature_id = ?
          ORDER BY step_index ASC`
      )
      .all(featureId) as WorkflowStepRow[];
    return rows.map(fromDatabase);
  }

  async updateStatus(
    stepId: string,
    status: WorkflowStepStatus,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const now = Date.now();
    const metadataJson = metadata ? JSON.stringify(metadata) : null;

    if (status === WorkflowStepStatus.running) {
      this.db
        .prepare(
          `UPDATE workflow_steps
              SET status = ?, started_at = ?, updated_at = ?,
                  metadata = COALESCE(?, metadata)
            WHERE id = ?`
        )
        .run(status, now, now, metadataJson, stepId);
      return;
    }

    const isTerminal =
      status === WorkflowStepStatus.done ||
      status === WorkflowStepStatus.failed ||
      status === WorkflowStepStatus.interrupted;

    if (isTerminal) {
      this.db
        .prepare(
          `UPDATE workflow_steps
              SET status = ?, finished_at = ?, updated_at = ?,
                  metadata = COALESCE(?, metadata)
            WHERE id = ?`
        )
        .run(status, now, now, metadataJson, stepId);
      return;
    }

    // Any other transition (e.g. resetting to pending for retry)
    this.db
      .prepare(
        `UPDATE workflow_steps
            SET status = ?, updated_at = ?,
                metadata = COALESCE(?, metadata)
          WHERE id = ?`
      )
      .run(status, now, metadataJson, stepId);
  }

  async markAllRunningAsInterrupted(): Promise<number> {
    const now = Date.now();
    const result = this.db
      .prepare(
        `UPDATE workflow_steps
            SET status = 'interrupted',
                finished_at = COALESCE(finished_at, ?),
                updated_at = ?
          WHERE status = 'running'`
      )
      .run(now, now);
    return result.changes;
  }

  async deleteByFeatureId(featureId: string): Promise<void> {
    this.db.prepare(`DELETE FROM workflow_steps WHERE feature_id = ?`).run(featureId);
  }
}
