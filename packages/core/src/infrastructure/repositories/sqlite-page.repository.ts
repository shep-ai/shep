/**
 * SQLite Page Repository Implementation
 *
 * Implements IPageRepository using better-sqlite3.
 * Supports hierarchical page structures with parent-child relationships.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { IPageRepository } from '../../application/ports/output/repositories/page-repository.interface.js';
import type { Page } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type PageRow,
} from '../persistence/sqlite/mappers/page.mapper.js';

@injectable()
export class SQLitePageRepository implements IPageRepository {
  constructor(private readonly db: Database.Database) {}

  async create(page: Page): Promise<void> {
    const row = toDatabase(page);
    const stmt = this.db.prepare(`
      INSERT INTO pages (
        id, project_id, title, content, parent_id,
        sort_order, is_favorite, created_at, updated_at, deleted_at
      ) VALUES (
        @id, @project_id, @title, @content, @parent_id,
        @sort_order, @is_favorite, @created_at, @updated_at, @deleted_at
      )
    `);
    stmt.run(row);
  }

  async findById(id: string): Promise<Page | null> {
    const stmt = this.db.prepare('SELECT * FROM pages WHERE id = ? AND deleted_at IS NULL');
    const row = stmt.get(id) as PageRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async listByProject(projectId: string): Promise<Page[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM pages WHERE project_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC'
    );
    const rows = stmt.all(projectId) as PageRow[];
    return rows.map(fromDatabase);
  }

  async listChildren(parentId: string): Promise<Page[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM pages WHERE parent_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC'
    );
    const rows = stmt.all(parentId) as PageRow[];
    return rows.map(fromDatabase);
  }

  async update(
    id: string,
    fields: Partial<Pick<Page, 'title' | 'content' | 'parentId' | 'sortOrder' | 'isFavorite'>>
  ): Promise<void> {
    const now = Date.now();
    const setClauses: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (fields.title !== undefined) {
      setClauses.push('title = ?');
      values.push(fields.title);
    }
    if (fields.content !== undefined) {
      setClauses.push('content = ?');
      values.push(fields.content);
    }
    if (fields.parentId !== undefined) {
      setClauses.push('parent_id = ?');
      values.push(fields.parentId);
    }
    if (fields.sortOrder !== undefined) {
      setClauses.push('sort_order = ?');
      values.push(fields.sortOrder);
    }
    if (fields.isFavorite !== undefined) {
      setClauses.push('is_favorite = ?');
      values.push(fields.isFavorite ? 1 : 0);
    }

    values.push(id);
    const stmt = this.db.prepare(
      `UPDATE pages SET ${setClauses.join(', ')} WHERE id = ? AND deleted_at IS NULL`
    );
    stmt.run(...values);
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare('UPDATE pages SET deleted_at = ?, updated_at = ? WHERE id = ?');
    stmt.run(now, now, id);
  }
}
