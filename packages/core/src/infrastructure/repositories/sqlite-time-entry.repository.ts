/**
 * SQLite Time Entry Repository Implementation
 *
 * Implements ITimeEntryRepository using better-sqlite3.
 * Tracks time logged against work items for project time management.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { ITimeEntryRepository } from '../../application/ports/output/repositories/time-entry-repository.interface.js';
import type { TimeEntry } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type TimeEntryRow,
} from '../persistence/sqlite/mappers/time-entry.mapper.js';

@injectable()
export class SQLiteTimeEntryRepository implements ITimeEntryRepository {
  constructor(private readonly db: Database.Database) {}

  async create(entry: TimeEntry): Promise<void> {
    const row = toDatabase(entry);
    const stmt = this.db.prepare(`
      INSERT INTO time_entries (
        id, work_item_id, duration_minutes, note,
        logged_at, created_at, updated_at
      ) VALUES (
        @id, @work_item_id, @duration_minutes, @note,
        @logged_at, @created_at, @updated_at
      )
    `);
    stmt.run(row);
  }

  async findById(id: string): Promise<TimeEntry | null> {
    const stmt = this.db.prepare('SELECT * FROM time_entries WHERE id = ?');
    const row = stmt.get(id) as TimeEntryRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async listByWorkItem(workItemId: string): Promise<TimeEntry[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM time_entries WHERE work_item_id = ? ORDER BY logged_at DESC'
    );
    const rows = stmt.all(workItemId) as TimeEntryRow[];
    return rows.map(fromDatabase);
  }

  async listByProject(projectId: string, startDate?: Date, endDate?: Date): Promise<TimeEntry[]> {
    const conditions: string[] = ['wi.project_id = ?'];
    const values: unknown[] = [projectId];

    if (startDate !== undefined) {
      conditions.push('te.logged_at >= ?');
      values.push(startDate instanceof Date ? startDate.getTime() : startDate);
    }
    if (endDate !== undefined) {
      conditions.push('te.logged_at <= ?');
      values.push(endDate instanceof Date ? endDate.getTime() : endDate);
    }

    const stmt = this.db.prepare(`
      SELECT te.* FROM time_entries te
      JOIN work_items wi ON wi.id = te.work_item_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY te.logged_at DESC
    `);
    const rows = stmt.all(...values) as TimeEntryRow[];
    return rows.map(fromDatabase);
  }

  async getTotalMinutes(workItemId: string): Promise<number> {
    const stmt = this.db.prepare(
      'SELECT COALESCE(SUM(duration_minutes), 0) as total FROM time_entries WHERE work_item_id = ?'
    );
    const row = stmt.get(workItemId) as { total: number };
    return row.total;
  }

  async delete(id: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM time_entries WHERE id = ?');
    stmt.run(id);
  }
}
