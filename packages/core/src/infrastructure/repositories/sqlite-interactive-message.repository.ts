/**
 * SQLite Interactive Message Repository Implementation
 *
 * Implements IInteractiveMessageRepository using SQLite database.
 * Uses prepared statements to prevent SQL injection.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { IInteractiveMessageRepository } from '../../application/ports/output/repositories/interactive-message-repository.interface.js';
import type { InteractiveMessage } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type InteractiveMessageRow,
} from '../persistence/sqlite/mappers/interactive-message.mapper.js';

const DEFAULT_MESSAGE_LIMIT = 200;

@injectable()
export class SQLiteInteractiveMessageRepository implements IInteractiveMessageRepository {
  constructor(private readonly db: Database.Database) {}

  async create(message: InteractiveMessage): Promise<void> {
    const row = toDatabase(message);
    this.db
      .prepare(
        `INSERT INTO interactive_messages
          (id, feature_id, session_id, role, content, step_id, created_at, updated_at)
         VALUES
          (@id, @feature_id, @session_id, @role, @content, @step_id, @created_at, @updated_at)`
      )
      .run(row);
  }

  async findByFeatureId(
    featureId: string,
    limit: number = DEFAULT_MESSAGE_LIMIT
  ): Promise<InteractiveMessage[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM interactive_messages
         WHERE feature_id = ?
         ORDER BY created_at ASC
         LIMIT ?`
      )
      .all(featureId, limit) as InteractiveMessageRow[];
    return rows.map(fromDatabase);
  }

  async findBySessionId(sessionId: string): Promise<InteractiveMessage[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM interactive_messages
         WHERE session_id = ?
         ORDER BY created_at ASC`
      )
      .all(sessionId) as InteractiveMessageRow[];
    return rows.map(fromDatabase);
  }

  async deleteByFeatureId(featureId: string): Promise<void> {
    this.db.prepare(`DELETE FROM interactive_messages WHERE feature_id = ?`).run(featureId);
  }
}
