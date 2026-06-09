/**
 * SQLite Security Event Repository Implementation
 *
 * Implements ISecurityEventRepository using SQLite database.
 * Uses prepared statements to prevent SQL injection.
 * Supports 90-day retention cleanup.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type {
  ISecurityEventRepository,
  SecurityEventQueryOptions,
} from '../../application/ports/output/repositories/security-event.repository.interface.js';
import type { SecurityEvent } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type SecurityEventRow,
} from '../persistence/sqlite/mappers/security-event.mapper.js';

/**
 * SQLite implementation of ISecurityEventRepository.
 * Manages SecurityEvent persistence with repository-scoped queries.
 */
@injectable()
export class SQLiteSecurityEventRepository implements ISecurityEventRepository {
  constructor(private readonly db: Database.Database) {}

  async save(event: SecurityEvent): Promise<void> {
    const row = toDatabase(event);

    const stmt = this.db.prepare(`
      INSERT INTO security_events (
        id, repository_path, feature_id, severity, category,
        disposition, actor, message, remediation_summary, created_at
      ) VALUES (
        @id, @repository_path, @feature_id, @severity, @category,
        @disposition, @actor, @message, @remediation_summary, @created_at
      )
    `);

    stmt.run(row);
  }

  async findByRepository(
    repositoryPath: string,
    options?: SecurityEventQueryOptions
  ): Promise<SecurityEvent[]> {
    let sql = 'SELECT * FROM security_events WHERE repository_path = ?';
    const params: unknown[] = [repositoryPath];

    if (options?.severity) {
      sql += ' AND severity = ?';
      params.push(options.severity);
    }

    sql += ' ORDER BY created_at DESC';

    if (options?.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options?.offset) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as SecurityEventRow[];

    return rows.map(fromDatabase);
  }

  async findByFeature(
    featureId: string,
    options?: SecurityEventQueryOptions
  ): Promise<SecurityEvent[]> {
    let sql = 'SELECT * FROM security_events WHERE feature_id = ?';
    const params: unknown[] = [featureId];

    if (options?.severity) {
      sql += ' AND severity = ?';
      params.push(options.severity);
    }

    sql += ' ORDER BY created_at DESC';

    if (options?.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options?.offset) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as SecurityEventRow[];

    return rows.map(fromDatabase);
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const stmt = this.db.prepare('DELETE FROM security_events WHERE created_at < ?');
    const result = stmt.run(date.toISOString());
    return result.changes;
  }

  async count(repositoryPath: string): Promise<number> {
    const stmt = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM security_events WHERE repository_path = ?'
    );
    const row = stmt.get(repositoryPath) as { cnt: number };
    return row.cnt;
  }
}
