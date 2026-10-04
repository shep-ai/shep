/** SQLite feedback key repository (spec 127). */

import type Database from 'better-sqlite3';
import type { FeedbackKey } from '../../domain/generated/output.js';
import type { IFeedbackKeyRepository } from '../../application/ports/output/repositories/feedback-key-repository.interface.js';
import {
  feedbackKeyFromDatabase,
  feedbackKeyToDatabase,
  type FeedbackKeyRow,
} from '../persistence/sqlite/mappers/feedback-key.mapper.js';

export class SQLiteFeedbackKeyRepository implements IFeedbackKeyRepository {
  constructor(private readonly db: Database.Database) {}

  async list(spaceId?: string): Promise<FeedbackKey[]> {
    const rows = (
      spaceId === undefined
        ? this.db.prepare('SELECT * FROM feedback_keys ORDER BY created_at ASC, id').all()
        : this.db
            .prepare('SELECT * FROM feedback_keys WHERE space_id = ? ORDER BY created_at ASC, id')
            .all(spaceId)
    ) as FeedbackKeyRow[];
    return rows.map(feedbackKeyFromDatabase);
  }

  async findById(id: string): Promise<FeedbackKey | null> {
    return this.one('SELECT * FROM feedback_keys WHERE id = ?', id);
  }

  async findByHash(keyHash: string): Promise<FeedbackKey | null> {
    return this.one('SELECT * FROM feedback_keys WHERE key_hash = ?', keyHash);
  }

  async create(key: FeedbackKey): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO feedback_keys (id, space_id, name, prefix, key_hash, last_used_at, revoked_at,
           created_at, updated_at)
         VALUES (@id, @space_id, @name, @prefix, @key_hash, @last_used_at, @revoked_at,
           @created_at, @updated_at)`
      )
      .run(feedbackKeyToDatabase(key));
  }

  async update(key: FeedbackKey): Promise<void> {
    this.db
      .prepare(
        `UPDATE feedback_keys SET space_id = @space_id, name = @name, prefix = @prefix,
           key_hash = @key_hash, last_used_at = @last_used_at, revoked_at = @revoked_at,
           updated_at = @updated_at
         WHERE id = @id`
      )
      .run(feedbackKeyToDatabase(key));
  }

  private one(sql: string, value: string): FeedbackKey | null {
    const row = this.db.prepare(sql).get(value) as FeedbackKeyRow | undefined;
    return row ? feedbackKeyFromDatabase(row) : null;
  }
}
