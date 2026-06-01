/**
 * SQLite SdlcTask Repository Implementation
 *
 * Implements ISdlcTaskRepository using better-sqlite3.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type {
  ISdlcTaskRepository,
  SdlcTaskUpsertFields,
} from '../../application/ports/output/repositories/sdlc-task-repository.interface.js';
import type { SdlcTask, TaskState } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type SdlcTaskRow,
} from '../persistence/sqlite/mappers/sdlc-task.mapper.js';

@injectable()
export class SQLiteSdlcTaskRepository implements ISdlcTaskRepository {
  constructor(private readonly db: Database.Database) {}

  async create(task: SdlcTask): Promise<void> {
    const row = toDatabase(task);
    const stmt = this.db.prepare(`
      INSERT INTO sdlc_tasks (
        id, feature_id, task_key, title, description,
        status, sort_order, branch, depends_on_keys, agent_run_id,
        created_at, updated_at
      ) VALUES (
        @id, @feature_id, @task_key, @title, @description,
        @status, @sort_order, @branch, @depends_on_keys, @agent_run_id,
        @created_at, @updated_at
      )
    `);
    stmt.run(row);
  }

  async findById(id: string): Promise<SdlcTask | null> {
    const stmt = this.db.prepare('SELECT * FROM sdlc_tasks WHERE id = ?');
    const row = stmt.get(id) as SdlcTaskRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async listByFeature(featureId: string): Promise<SdlcTask[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM sdlc_tasks WHERE feature_id = ? ORDER BY sort_order ASC, created_at ASC'
    );
    const rows = stmt.all(featureId) as SdlcTaskRow[];
    return rows.map(fromDatabase);
  }

  async listAllActive(): Promise<SdlcTask[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM sdlc_tasks ORDER BY feature_id ASC, sort_order ASC, created_at ASC'
    );
    const rows = stmt.all() as SdlcTaskRow[];
    return rows.map(fromDatabase);
  }

  async upsertByKey(
    id: string,
    featureId: string,
    taskKey: string,
    fields: SdlcTaskUpsertFields
  ): Promise<void> {
    const now = Date.now();
    const dependsOnKeysJson =
      fields.dependsOnKeys && fields.dependsOnKeys.length > 0
        ? JSON.stringify(fields.dependsOnKeys)
        : null;
    const stmt = this.db.prepare(`
      INSERT INTO sdlc_tasks (
        id, feature_id, task_key, title, description,
        status, sort_order, branch, depends_on_keys, agent_run_id,
        created_at, updated_at
      ) VALUES (
        @id, @feature_id, @task_key, @title, @description,
        @status, @sort_order, @branch, @depends_on_keys, @agent_run_id,
        @created_at, @updated_at
      )
      ON CONFLICT(feature_id, task_key) DO UPDATE SET
        title          = excluded.title,
        description    = excluded.description,
        status         = excluded.status,
        sort_order     = excluded.sort_order,
        branch         = excluded.branch,
        depends_on_keys = excluded.depends_on_keys,
        agent_run_id   = excluded.agent_run_id,
        updated_at     = excluded.updated_at
    `);
    stmt.run({
      id,
      feature_id: featureId,
      task_key: taskKey,
      title: fields.title,
      description: fields.description ?? null,
      status: fields.status,
      sort_order: fields.sortOrder,
      branch: fields.branch ?? null,
      depends_on_keys: dependsOnKeysJson,
      agent_run_id: fields.agentRunId ?? null,
      created_at: now,
      updated_at: now,
    });
  }

  async updateStatus(id: string, status: TaskState): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare('UPDATE sdlc_tasks SET status = ?, updated_at = ? WHERE id = ?');
    stmt.run(status, now, id);
  }

  async updateSortOrder(id: string, sortOrder: number): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(
      'UPDATE sdlc_tasks SET sort_order = ?, updated_at = ? WHERE id = ?'
    );
    stmt.run(sortOrder, now, id);
  }

  async deleteByFeature(featureId: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM sdlc_tasks WHERE feature_id = ?');
    stmt.run(featureId);
  }
}
