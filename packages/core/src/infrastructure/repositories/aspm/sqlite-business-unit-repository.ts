/**
 * SQLite BusinessUnit Repository
 *
 * Feature 098, phase 2. Backed by the business_units table (migration 104).
 */

import type Database from 'better-sqlite3';
import { inject, injectable } from 'tsyringe';
import type { IBusinessUnitRepository } from '../../../application/ports/output/repositories/business-unit-repository.interface.js';
import type { BusinessUnit } from '../../../domain/generated/output.js';
import { toDatabase, fromDatabase, type BusinessUnitRow } from './mappers/business-unit-mapper.js';

@injectable()
export class SQLiteBusinessUnitRepository implements IBusinessUnitRepository {
  constructor(@inject('Database') private readonly db: Database.Database) {}

  async create(bu: BusinessUnit): Promise<void> {
    const row = toDatabase(bu);
    this.db
      .prepare(
        `INSERT INTO business_units
         (id, name, slug, created_at, updated_at, deleted_at)
         VALUES (@id, @name, @slug, @created_at, @updated_at, @deleted_at)`
      )
      .run(row);
  }

  async findById(id: string): Promise<BusinessUnit | null> {
    const row = this.db
      .prepare('SELECT * FROM business_units WHERE id = ? AND deleted_at IS NULL')
      .get(id) as BusinessUnitRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findBySlug(slug: string): Promise<BusinessUnit | null> {
    const row = this.db
      .prepare(
        'SELECT * FROM business_units WHERE LOWER(slug) = LOWER(?) AND deleted_at IS NULL LIMIT 1'
      )
      .get(slug) as BusinessUnitRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async listAll(): Promise<BusinessUnit[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM business_units WHERE deleted_at IS NULL ORDER BY name ASC, created_at ASC'
      )
      .all() as BusinessUnitRow[];
    return rows.map(fromDatabase);
  }

  async update(id: string, fields: Partial<Pick<BusinessUnit, 'name' | 'slug'>>): Promise<void> {
    const setClauses: string[] = ['updated_at = ?'];
    const values: unknown[] = [Date.now()];

    if (fields.name !== undefined) {
      setClauses.push('name = ?');
      values.push(fields.name);
    }
    if (fields.slug !== undefined) {
      setClauses.push('slug = ?');
      values.push(fields.slug);
    }

    values.push(id);
    this.db
      .prepare(
        `UPDATE business_units SET ${setClauses.join(', ')} WHERE id = ? AND deleted_at IS NULL`
      )
      .run(...values);
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    this.db
      .prepare('UPDATE business_units SET deleted_at = ?, updated_at = ? WHERE id = ?')
      .run(now, now, id);
  }
}
