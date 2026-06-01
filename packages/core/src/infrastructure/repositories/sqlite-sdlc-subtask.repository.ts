/**
 * SQLite SdlcSubTask Repository Implementation
 *
 * Implements ISdlcSubTaskRepository using better-sqlite3.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type {
  ISdlcSubTaskRepository,
  SdlcSubTaskUpsertFields,
} from '../../application/ports/output/repositories/sdlc-subtask-repository.interface.js';
import type { SdlcSubTask, TaskState } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type SdlcSubTaskRow,
} from '../persistence/sqlite/mappers/sdlc-subtask.mapper.js';

@injectable()
export class SQLiteSdlcSubTaskRepository implements ISdlcSubTaskRepository {
  constructor(private readonly db: Database.Database) {}

  async create(subTask: SdlcSubTask): Promise<void> {
    const row = toDatabase(subTask);
    const stmt = this.db.prepare(`
      INSERT INTO sdlc_subtasks (
        id, task_id, feature_id, sub_task_key, name,
        description, status, sort_order,
        created_at, updated_at
      ) VALUES (
        @id, @task_id, @feature_id, @sub_task_key, @name,
        @description, @status, @sort_order,
        @created_at, @updated_at
      )
    `);
    stmt.run(row);
  }

  async findById(id: string): Promise<SdlcSubTask | null> {
    const stmt = this.db.prepare('SELECT * FROM sdlc_subtasks WHERE id = ?');
    const row = stmt.get(id) as SdlcSubTaskRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async listByTask(taskId: string): Promise<SdlcSubTask[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM sdlc_subtasks WHERE task_id = ? ORDER BY sort_order ASC, created_at ASC'
    );
    const rows = stmt.all(taskId) as SdlcSubTaskRow[];
    return rows.map(fromDatabase);
  }

  async listByFeature(featureId: string): Promise<SdlcSubTask[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM sdlc_subtasks WHERE feature_id = ? ORDER BY sort_order ASC, created_at ASC'
    );
    const rows = stmt.all(featureId) as SdlcSubTaskRow[];
    return rows.map(fromDatabase);
  }

  async upsertByKey(
    id: string,
    taskId: string,
    subTaskKey: string,
    fields: SdlcSubTaskUpsertFields
  ): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO sdlc_subtasks (
        id, task_id, feature_id, sub_task_key, name,
        description, status, sort_order,
        created_at, updated_at
      ) VALUES (
        @id, @task_id, @feature_id, @sub_task_key, @name,
        @description, @status, @sort_order,
        @created_at, @updated_at
      )
      ON CONFLICT(task_id, sub_task_key) DO UPDATE SET
        feature_id   = excluded.feature_id,
        name         = excluded.name,
        description  = excluded.description,
        status       = excluded.status,
        sort_order   = excluded.sort_order,
        updated_at   = excluded.updated_at
    `);
    stmt.run({
      id,
      task_id: taskId,
      feature_id: fields.featureId,
      sub_task_key: subTaskKey,
      name: fields.name,
      description: fields.description ?? null,
      status: fields.status,
      sort_order: fields.sortOrder,
      created_at: now,
      updated_at: now,
    });
  }

  async updateStatus(id: string, status: TaskState): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(
      'UPDATE sdlc_subtasks SET status = ?, updated_at = ? WHERE id = ?'
    );
    stmt.run(status, now, id);
  }

  async updateSortOrder(id: string, sortOrder: number): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(
      'UPDATE sdlc_subtasks SET sort_order = ?, updated_at = ? WHERE id = ?'
    );
    stmt.run(sortOrder, now, id);
  }
}
