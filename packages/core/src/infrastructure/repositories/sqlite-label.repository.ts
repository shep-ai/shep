/**
 * SQLite Label Repository Implementation
 *
 * Implements ILabelRepository using better-sqlite3.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { ILabelRepository } from '../../application/ports/output/repositories/label-repository.interface.js';
import type { Label } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type LabelRow,
} from '../persistence/sqlite/mappers/label.mapper.js';

@injectable()
export class SQLiteLabelRepository implements ILabelRepository {
  constructor(private readonly db: Database.Database) {}

  async create(label: Label): Promise<void> {
    const row = toDatabase(label);
    const stmt = this.db.prepare(`
      INSERT INTO labels (
        id, project_id, name, color, parent_id,
        created_at, updated_at, deleted_at
      ) VALUES (
        @id, @project_id, @name, @color, @parent_id,
        @created_at, @updated_at, @deleted_at
      )
    `);
    stmt.run(row);
  }

  async findById(id: string): Promise<Label | null> {
    const stmt = this.db.prepare('SELECT * FROM labels WHERE id = ? AND deleted_at IS NULL');
    const row = stmt.get(id) as LabelRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async listByProject(projectId: string): Promise<Label[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM labels WHERE project_id = ? AND deleted_at IS NULL ORDER BY name ASC'
    );
    const rows = stmt.all(projectId) as LabelRow[];
    return rows.map(fromDatabase);
  }

  async update(
    id: string,
    fields: Partial<Pick<Label, 'name' | 'color' | 'parentId'>>
  ): Promise<void> {
    const now = Date.now();
    const setClauses: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (fields.name !== undefined) {
      setClauses.push('name = ?');
      values.push(fields.name);
    }
    if (fields.color !== undefined) {
      setClauses.push('color = ?');
      values.push(fields.color);
    }
    if (fields.parentId !== undefined) {
      setClauses.push('parent_id = ?');
      values.push(fields.parentId);
    }

    values.push(id);
    const stmt = this.db.prepare(
      `UPDATE labels SET ${setClauses.join(', ')} WHERE id = ? AND deleted_at IS NULL`
    );
    stmt.run(...values);
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare('UPDATE labels SET deleted_at = ?, updated_at = ? WHERE id = ?');
    stmt.run(now, now, id);
  }
}
