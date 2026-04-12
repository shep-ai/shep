/**
 * SQLite CustomProperty Repository Implementation
 *
 * Implements ICustomPropertyRepository using better-sqlite3.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { ICustomPropertyRepository } from '../../application/ports/output/repositories/custom-property-repository.interface.js';
import type { CustomProperty } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type CustomPropertyRow,
} from '../persistence/sqlite/mappers/custom-property.mapper.js';

@injectable()
export class SQLiteCustomPropertyRepository implements ICustomPropertyRepository {
  constructor(private readonly db: Database.Database) {}

  async create(property: CustomProperty): Promise<void> {
    const row = toDatabase(property);
    const stmt = this.db.prepare(`
      INSERT INTO custom_properties (
        id, project_id, name, property_type, options, is_required,
        display_order, created_at, updated_at, deleted_at
      ) VALUES (
        @id, @project_id, @name, @property_type, @options, @is_required,
        @display_order, @created_at, @updated_at, @deleted_at
      )
    `);
    stmt.run(row);
  }

  async findById(id: string): Promise<CustomProperty | null> {
    const stmt = this.db.prepare(
      'SELECT * FROM custom_properties WHERE id = ? AND deleted_at IS NULL'
    );
    const row = stmt.get(id) as CustomPropertyRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async listByProject(projectId: string): Promise<CustomProperty[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM custom_properties WHERE project_id = ? AND deleted_at IS NULL ORDER BY display_order ASC'
    );
    const rows = stmt.all(projectId) as CustomPropertyRow[];
    return rows.map(fromDatabase);
  }

  async update(
    id: string,
    fields: Partial<
      Pick<CustomProperty, 'name' | 'propertyType' | 'options' | 'isRequired' | 'displayOrder'>
    >
  ): Promise<void> {
    const now = Date.now();
    const setClauses: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (fields.name !== undefined) {
      setClauses.push('name = ?');
      values.push(fields.name);
    }
    if (fields.propertyType !== undefined) {
      setClauses.push('property_type = ?');
      values.push(fields.propertyType);
    }
    if (fields.options !== undefined) {
      setClauses.push('options = ?');
      values.push(fields.options);
    }
    if (fields.isRequired !== undefined) {
      setClauses.push('is_required = ?');
      values.push(fields.isRequired ? 1 : 0);
    }
    if (fields.displayOrder !== undefined) {
      setClauses.push('display_order = ?');
      values.push(fields.displayOrder);
    }

    values.push(id);
    const stmt = this.db.prepare(
      `UPDATE custom_properties SET ${setClauses.join(', ')} WHERE id = ? AND deleted_at IS NULL`
    );
    stmt.run(...values);
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(
      'UPDATE custom_properties SET deleted_at = ?, updated_at = ? WHERE id = ?'
    );
    stmt.run(now, now, id);
  }
}
