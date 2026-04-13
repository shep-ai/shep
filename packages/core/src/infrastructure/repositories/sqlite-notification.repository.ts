/**
 * SQLite PmNotification Repository Implementation
 *
 * Implements INotificationRepository using better-sqlite3.
 * Manages in-app notifications for PM events.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { INotificationRepository } from '../../application/ports/output/repositories/notification-repository.interface.js';
import type { PmNotification } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type PmNotificationRow,
} from '../persistence/sqlite/mappers/notification.mapper.js';

@injectable()
export class SQLiteNotificationRepository implements INotificationRepository {
  constructor(private readonly db: Database.Database) {}

  async create(notification: PmNotification): Promise<void> {
    const row = toDatabase(notification);
    const stmt = this.db.prepare(`
      INSERT INTO pm_notifications (
        id, project_id, recipient_id, type, title, body,
        is_read, is_archived, reference_id, reference_type,
        created_at, updated_at, deleted_at
      ) VALUES (
        @id, @project_id, @recipient_id, @type, @title, @body,
        @is_read, @is_archived, @reference_id, @reference_type,
        @created_at, @updated_at, @deleted_at
      )
    `);
    stmt.run(row);
  }

  async findById(id: string): Promise<PmNotification | null> {
    const stmt = this.db.prepare(
      'SELECT * FROM pm_notifications WHERE id = ? AND deleted_at IS NULL'
    );
    const row = stmt.get(id) as PmNotificationRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async listByRecipient(
    recipientId: string,
    options?: { unreadOnly?: boolean; projectId?: string; limit?: number }
  ): Promise<PmNotification[]> {
    const conditions: string[] = ['recipient_id = ?', 'deleted_at IS NULL', 'is_archived = 0'];
    const params: unknown[] = [recipientId];

    if (options?.unreadOnly) {
      conditions.push('is_read = 0');
    }
    if (options?.projectId) {
      conditions.push('project_id = ?');
      params.push(options.projectId);
    }

    const limit = options?.limit ?? 50;
    const sql = `SELECT * FROM pm_notifications WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as PmNotificationRow[];
    return rows.map(fromDatabase);
  }

  async markRead(id: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(
      'UPDATE pm_notifications SET is_read = 1, updated_at = ? WHERE id = ?'
    );
    stmt.run(now, id);
  }

  async markAllRead(recipientId: string, projectId?: string): Promise<void> {
    const now = Date.now();
    if (projectId) {
      const stmt = this.db.prepare(
        'UPDATE pm_notifications SET is_read = 1, updated_at = ? WHERE recipient_id = ? AND project_id = ? AND is_read = 0'
      );
      stmt.run(now, recipientId, projectId);
    } else {
      const stmt = this.db.prepare(
        'UPDATE pm_notifications SET is_read = 1, updated_at = ? WHERE recipient_id = ? AND is_read = 0'
      );
      stmt.run(now, recipientId);
    }
  }

  async archive(id: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(
      'UPDATE pm_notifications SET is_archived = 1, updated_at = ? WHERE id = ?'
    );
    stmt.run(now, id);
  }

  async countUnread(recipientId: string, projectId?: string): Promise<number> {
    if (projectId) {
      const stmt = this.db.prepare(
        'SELECT COUNT(*) as count FROM pm_notifications WHERE recipient_id = ? AND project_id = ? AND is_read = 0 AND deleted_at IS NULL AND is_archived = 0'
      );
      const result = stmt.get(recipientId, projectId) as { count: number };
      return result.count;
    }
    const stmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM pm_notifications WHERE recipient_id = ? AND is_read = 0 AND deleted_at IS NULL AND is_archived = 0'
    );
    const result = stmt.get(recipientId) as { count: number };
    return result.count;
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(
      'UPDATE pm_notifications SET deleted_at = ?, updated_at = ? WHERE id = ?'
    );
    stmt.run(now, now, id);
  }
}
