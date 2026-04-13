/**
 * SQLite Cycle Repository Implementation
 *
 * Implements ICycleRepository using better-sqlite3.
 * Includes junction table operations for cycle_work_items.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { ICycleRepository } from '../../application/ports/output/repositories/cycle-repository.interface.js';
import type { Cycle } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type CycleRow,
} from '../persistence/sqlite/mappers/cycle.mapper.js';

@injectable()
export class SQLiteCycleRepository implements ICycleRepository {
  constructor(private readonly db: Database.Database) {}

  async create(cycle: Cycle): Promise<void> {
    const row = toDatabase(cycle);
    const stmt = this.db.prepare(`
      INSERT INTO cycles (
        id, project_id, name, description, status,
        start_date, end_date, created_at, updated_at, deleted_at
      ) VALUES (
        @id, @project_id, @name, @description, @status,
        @start_date, @end_date, @created_at, @updated_at, @deleted_at
      )
    `);
    stmt.run(row);
  }

  async findById(id: string): Promise<Cycle | null> {
    const stmt = this.db.prepare('SELECT * FROM cycles WHERE id = ? AND deleted_at IS NULL');
    const row = stmt.get(id) as CycleRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async listByProject(projectId: string): Promise<Cycle[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM cycles WHERE project_id = ? AND deleted_at IS NULL ORDER BY start_date ASC, created_at ASC'
    );
    const rows = stmt.all(projectId) as CycleRow[];
    return rows.map(fromDatabase);
  }

  async findActiveByProject(projectId: string): Promise<Cycle | null> {
    const stmt = this.db.prepare(
      "SELECT * FROM cycles WHERE project_id = ? AND status = 'Active' AND deleted_at IS NULL"
    );
    const row = stmt.get(projectId) as CycleRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async update(
    id: string,
    fields: Partial<Pick<Cycle, 'name' | 'description' | 'status' | 'startDate' | 'endDate'>>
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
      `UPDATE cycles SET ${setClauses.join(', ')} WHERE id = ? AND deleted_at IS NULL`
    );
    stmt.run(...values);
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare('UPDATE cycles SET deleted_at = ?, updated_at = ? WHERE id = ?');
    stmt.run(now, now, id);
  }

  async addWorkItem(cycleId: string, workItemId: string): Promise<void> {
    const stmt = this.db.prepare(
      'INSERT OR IGNORE INTO cycle_work_items (cycle_id, work_item_id) VALUES (?, ?)'
    );
    stmt.run(cycleId, workItemId);
  }

  async removeWorkItem(cycleId: string, workItemId: string): Promise<void> {
    const stmt = this.db.prepare(
      'DELETE FROM cycle_work_items WHERE cycle_id = ? AND work_item_id = ?'
    );
    stmt.run(cycleId, workItemId);
  }

  async getWorkItemIds(cycleId: string): Promise<string[]> {
    const stmt = this.db.prepare('SELECT work_item_id FROM cycle_work_items WHERE cycle_id = ?');
    const rows = stmt.all(cycleId) as { work_item_id: string }[];
    return rows.map((r) => r.work_item_id);
  }

  async findCycleForWorkItem(projectId: string, workItemId: string): Promise<string | null> {
    const stmt = this.db.prepare(`
      SELECT c.id FROM cycles c
      JOIN cycle_work_items cwi ON cwi.cycle_id = c.id
      WHERE c.project_id = ? AND cwi.work_item_id = ? AND c.deleted_at IS NULL
      LIMIT 1
    `);
    const row = stmt.get(projectId, workItemId) as { id: string } | undefined;
    return row ? row.id : null;
  }
}
