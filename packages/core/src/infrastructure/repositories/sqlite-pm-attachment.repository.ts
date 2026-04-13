/**
 * SQLite PM Attachment Repository Implementation
 *
 * Implements IPmAttachmentRepository using better-sqlite3.
 * Manages file attachments associated with work items.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { IPmAttachmentRepository } from '../../application/ports/output/repositories/pm-attachment-repository.interface.js';
import type { PmAttachment } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type PmAttachmentRow,
} from '../persistence/sqlite/mappers/pm-attachment.mapper.js';

@injectable()
export class SQLitePmAttachmentRepository implements IPmAttachmentRepository {
  constructor(private readonly db: Database.Database) {}

  async create(attachment: PmAttachment): Promise<void> {
    const row = toDatabase(attachment);
    const stmt = this.db.prepare(`
      INSERT INTO pm_attachments (
        id, work_item_id, filename, mime_type, file_size,
        storage_path, created_at, updated_at, deleted_at
      ) VALUES (
        @id, @work_item_id, @filename, @mime_type, @file_size,
        @storage_path, @created_at, @updated_at, @deleted_at
      )
    `);
    stmt.run(row);
  }

  async findById(id: string): Promise<PmAttachment | null> {
    const stmt = this.db.prepare(
      'SELECT * FROM pm_attachments WHERE id = ? AND deleted_at IS NULL'
    );
    const row = stmt.get(id) as PmAttachmentRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async listByWorkItem(workItemId: string): Promise<PmAttachment[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM pm_attachments WHERE work_item_id = ? AND deleted_at IS NULL'
    );
    const rows = stmt.all(workItemId) as PmAttachmentRow[];
    return rows.map(fromDatabase);
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(
      'UPDATE pm_attachments SET deleted_at = ?, updated_at = ? WHERE id = ?'
    );
    stmt.run(now, now, id);
  }
}
