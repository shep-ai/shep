/**
 * SQLite ActivityLog Repository Implementation
 *
 * Implements IActivityLogRepository using better-sqlite3.
 * This is an append-only repository per NFR-8 (audit trail immutability).
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { IActivityLogRepository } from '../../application/ports/output/repositories/activity-log-repository.interface.js';
import type { ActivityEntry } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type ActivityEntryRow,
} from '../persistence/sqlite/mappers/activity-log.mapper.js';

@injectable()
export class SQLiteActivityLogRepository implements IActivityLogRepository {
  constructor(private readonly db: Database.Database) {}

  async create(entry: ActivityEntry): Promise<void> {
    const row = toDatabase(entry);
    const stmt = this.db.prepare(`
      INSERT INTO activity_log (
        id, work_item_id, field_name, old_value, new_value,
        actor_id, created_at, updated_at
      ) VALUES (
        @id, @work_item_id, @field_name, @old_value, @new_value,
        @actor_id, @created_at, @updated_at
      )
    `);
    stmt.run(row);
  }

  async listByWorkItem(workItemId: string): Promise<ActivityEntry[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM activity_log WHERE work_item_id = ? ORDER BY created_at ASC'
    );
    const rows = stmt.all(workItemId) as ActivityEntryRow[];
    return rows.map(fromDatabase);
  }
}
