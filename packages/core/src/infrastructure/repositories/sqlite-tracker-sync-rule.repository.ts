/** SQLite tracker sync rule repository (spec 122). */

import type Database from 'better-sqlite3';
import type { TrackerSyncRule } from '../../domain/generated/output.js';
import type { ITrackerSyncRuleRepository } from '../../application/ports/output/repositories/tracker-sync-rule-repository.interface.js';
import {
  trackerSyncRuleFromDatabase,
  trackerSyncRuleToDatabase,
  type TrackerSyncRuleRow,
} from '../persistence/sqlite/mappers/tracker-sync.mapper.js';

export class SQLiteTrackerSyncRuleRepository implements ITrackerSyncRuleRepository {
  constructor(private readonly db: Database.Database) {}

  async list(connectionId?: string): Promise<TrackerSyncRule[]> {
    const rows = (
      connectionId === undefined
        ? this.db.prepare('SELECT * FROM tracker_sync_rules ORDER BY created_at ASC').all()
        : this.db
            .prepare(
              'SELECT * FROM tracker_sync_rules WHERE connection_id = ? ORDER BY created_at ASC'
            )
            .all(connectionId)
    ) as TrackerSyncRuleRow[];
    return rows.map(trackerSyncRuleFromDatabase);
  }

  async findById(id: string): Promise<TrackerSyncRule | null> {
    const row = this.db.prepare('SELECT * FROM tracker_sync_rules WHERE id = ?').get(id) as
      | TrackerSyncRuleRow
      | undefined;
    return row ? trackerSyncRuleFromDatabase(row) : null;
  }

  async create(rule: TrackerSyncRule): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO tracker_sync_rules (id, connection_id, project_id, scope, direction,
           interval_minutes, enabled, cursor, last_run_at, last_run, last_error, created_at,
           updated_at)
         VALUES (@id, @connection_id, @project_id, @scope, @direction, @interval_minutes,
           @enabled, @cursor, @last_run_at, @last_run, @last_error, @created_at, @updated_at)`
      )
      .run(trackerSyncRuleToDatabase(rule));
  }

  async update(rule: TrackerSyncRule): Promise<void> {
    this.db
      .prepare(
        `UPDATE tracker_sync_rules SET connection_id = @connection_id, project_id = @project_id,
           scope = @scope, direction = @direction, interval_minutes = @interval_minutes,
           enabled = @enabled, cursor = @cursor, last_run_at = @last_run_at,
           last_run = @last_run, last_error = @last_error, updated_at = @updated_at
         WHERE id = @id`
      )
      .run(trackerSyncRuleToDatabase(rule));
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM tracker_sync_rules WHERE id = ?').run(id);
  }

  async deleteByConnection(connectionId: string): Promise<void> {
    this.db.prepare('DELETE FROM tracker_sync_rules WHERE connection_id = ?').run(connectionId);
  }
}
