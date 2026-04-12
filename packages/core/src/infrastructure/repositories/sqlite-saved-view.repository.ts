/**
 * SQLite SavedView Repository Implementation
 *
 * Implements ISavedViewRepository using better-sqlite3.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { ISavedViewRepository } from '../../application/ports/output/repositories/saved-view-repository.interface.js';
import type { SavedView } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type SavedViewRow,
} from '../persistence/sqlite/mappers/saved-view.mapper.js';

@injectable()
export class SQLiteSavedViewRepository implements ISavedViewRepository {
  constructor(private readonly db: Database.Database) {}

  async create(view: SavedView): Promise<void> {
    const row = toDatabase(view);
    const stmt = this.db.prepare(`
      INSERT INTO saved_views (
        id, project_id, name, description, is_public, layout,
        configuration, created_by, created_at, updated_at, deleted_at
      ) VALUES (
        @id, @project_id, @name, @description, @is_public, @layout,
        @configuration, @created_by, @created_at, @updated_at, @deleted_at
      )
    `);
    stmt.run(row);
  }

  async findById(id: string): Promise<SavedView | null> {
    const stmt = this.db.prepare('SELECT * FROM saved_views WHERE id = ? AND deleted_at IS NULL');
    const row = stmt.get(id) as SavedViewRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async listByProject(projectId: string): Promise<SavedView[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM saved_views WHERE project_id = ? AND deleted_at IS NULL ORDER BY name ASC'
    );
    const rows = stmt.all(projectId) as SavedViewRow[];
    return rows.map(fromDatabase);
  }

  async update(
    id: string,
    fields: Partial<
      Pick<SavedView, 'name' | 'description' | 'isPublic' | 'layout' | 'configuration'>
    >
  ): Promise<void> {
    const now = Date.now();
    const setClauses: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (fields.name !== undefined) {
      setClauses.push('name = ?');
      values.push(fields.name);
    }
    if (fields.description !== undefined) {
      setClauses.push('description = ?');
      values.push(fields.description);
    }
    if (fields.isPublic !== undefined) {
      setClauses.push('is_public = ?');
      values.push(fields.isPublic ? 1 : 0);
    }
    if (fields.layout !== undefined) {
      setClauses.push('layout = ?');
      values.push(fields.layout);
    }
    if (fields.configuration !== undefined) {
      setClauses.push('configuration = ?');
      values.push(fields.configuration);
    }

    values.push(id);
    const stmt = this.db.prepare(
      `UPDATE saved_views SET ${setClauses.join(', ')} WHERE id = ? AND deleted_at IS NULL`
    );
    stmt.run(...values);
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(
      'UPDATE saved_views SET deleted_at = ?, updated_at = ? WHERE id = ?'
    );
    stmt.run(now, now, id);
  }
}
