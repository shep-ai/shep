/**
 * SQLite Comment Repository Implementation
 *
 * Implements ICommentRepository using better-sqlite3.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { ICommentRepository } from '../../application/ports/output/repositories/comment-repository.interface.js';
import type { Comment } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type CommentRow,
} from '../persistence/sqlite/mappers/comment.mapper.js';

@injectable()
export class SQLiteCommentRepository implements ICommentRepository {
  constructor(private readonly db: Database.Database) {}

  async create(comment: Comment): Promise<void> {
    const row = toDatabase(comment);
    const stmt = this.db.prepare(`
      INSERT INTO comments (
        id, work_item_id, parent_id, content, author_id,
        created_at, updated_at, deleted_at
      ) VALUES (
        @id, @work_item_id, @parent_id, @content, @author_id,
        @created_at, @updated_at, @deleted_at
      )
    `);
    stmt.run(row);
  }

  async findById(id: string): Promise<Comment | null> {
    const stmt = this.db.prepare('SELECT * FROM comments WHERE id = ? AND deleted_at IS NULL');
    const row = stmt.get(id) as CommentRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async listByWorkItem(workItemId: string): Promise<Comment[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM comments WHERE work_item_id = ? AND deleted_at IS NULL ORDER BY created_at ASC'
    );
    const rows = stmt.all(workItemId) as CommentRow[];
    return rows.map(fromDatabase);
  }

  async update(id: string, fields: Partial<Pick<Comment, 'content'>>): Promise<void> {
    const now = Date.now();
    const setClauses: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (fields.content !== undefined) {
      setClauses.push('content = ?');
      values.push(fields.content);
    }

    values.push(id);
    const stmt = this.db.prepare(
      `UPDATE comments SET ${setClauses.join(', ')} WHERE id = ? AND deleted_at IS NULL`
    );
    stmt.run(...values);
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare('UPDATE comments SET deleted_at = ?, updated_at = ? WHERE id = ?');
    stmt.run(now, now, id);
  }
}
