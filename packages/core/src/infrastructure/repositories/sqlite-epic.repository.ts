/**
 * SQLite Epic Repository Implementation
 *
 * Implements IEpicRepository using better-sqlite3.
 * Epics group related work items under a higher-level initiative.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { IEpicRepository } from '../../application/ports/output/repositories/epic-repository.interface.js';
import type { Epic } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type EpicRow,
} from '../persistence/sqlite/mappers/epic.mapper.js';

@injectable()
export class SQLiteEpicRepository implements IEpicRepository {
  constructor(private readonly db: Database.Database) {}

  async create(epic: Epic): Promise<void> {
    const row = toDatabase(epic);
    const stmt = this.db.prepare(`
      INSERT INTO epics (
        id, project_id, name, description, status,
        start_date, end_date, created_at, updated_at, deleted_at
      ) VALUES (
        @id, @project_id, @name, @description, @status,
        @start_date, @end_date, @created_at, @updated_at, @deleted_at
      )
    `);
    stmt.run(row);
  }

  async findById(id: string): Promise<Epic | null> {
    const stmt = this.db.prepare('SELECT * FROM epics WHERE id = ? AND deleted_at IS NULL');
    const row = stmt.get(id) as EpicRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async listByProject(projectId: string): Promise<Epic[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM epics WHERE project_id = ? AND deleted_at IS NULL ORDER BY created_at ASC'
    );
    const rows = stmt.all(projectId) as EpicRow[];
    return rows.map(fromDatabase);
  }

  async update(
    id: string,
    fields: Partial<Pick<Epic, 'name' | 'description' | 'status' | 'startDate' | 'endDate'>>
  ): Promise<void> {
    const now = Date.now();
    const setClauses: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (fields.name !== undefined) {
      setClauses.push('name = ?');
      values.push(fields.name);
    }
    if (fields.description !== undefined) {
      setClauses.push('description = ?');
      values.push(fields.description);
    }
    if (fields.status !== undefined) {
      setClauses.push('status = ?');
      values.push(fields.status);
    }
    if (fields.startDate !== undefined) {
      setClauses.push('start_date = ?');
      values.push(fields.startDate instanceof Date ? fields.startDate.getTime() : fields.startDate);
    }
    if (fields.endDate !== undefined) {
      setClauses.push('end_date = ?');
      values.push(fields.endDate instanceof Date ? fields.endDate.getTime() : fields.endDate);
    }

    values.push(id);
    const stmt = this.db.prepare(
      `UPDATE epics SET ${setClauses.join(', ')} WHERE id = ? AND deleted_at IS NULL`
    );
    stmt.run(...values);
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare('UPDATE epics SET deleted_at = ?, updated_at = ? WHERE id = ?');
    stmt.run(now, now, id);
  }

  async getWorkItemCount(epicId: string): Promise<{ total: number; completed: number }> {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN wis.state_group = 'Completed' THEN 1 ELSE 0 END), 0) as completed
      FROM work_items wi
      JOIN work_item_states wis ON wis.id = wi.state_id
      WHERE wi.epic_id = ?
    `);
    const row = stmt.get(epicId) as { total: number; completed: number };
    return { total: row.total, completed: row.completed };
  }
}
