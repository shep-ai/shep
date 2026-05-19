/**
 * SQLite Service Repository
 *
 * Feature 098, phase 2. Backed by the services table (migration 105).
 */

import type Database from 'better-sqlite3';
import { inject, injectable } from 'tsyringe';
import type { IServiceRepository } from '../../../application/ports/output/repositories/service-repository.interface.js';
import type { Service } from '../../../domain/generated/output.js';
import { toDatabase, fromDatabase, type ServiceRow } from './mappers/service-mapper.js';

@injectable()
export class SQLiteServiceRepository implements IServiceRepository {
  constructor(@inject('Database') private readonly db: Database.Database) {}

  async create(service: Service): Promise<void> {
    const row = toDatabase(service);
    this.db
      .prepare(
        `INSERT INTO services
         (id, name, slug, application_id, owner_id, exposure, created_at, updated_at, deleted_at)
         VALUES (@id, @name, @slug, @application_id, @owner_id, @exposure, @created_at, @updated_at, @deleted_at)`
      )
      .run(row);
  }

  async findById(id: string): Promise<Service | null> {
    const row = this.db
      .prepare('SELECT * FROM services WHERE id = ? AND deleted_at IS NULL')
      .get(id) as ServiceRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findByApplicationId(applicationId: string): Promise<Service[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM services WHERE application_id = ? AND deleted_at IS NULL ORDER BY name ASC, created_at ASC'
      )
      .all(applicationId) as ServiceRow[];
    return rows.map(fromDatabase);
  }

  async listAll(): Promise<Service[]> {
    const rows = this.db
      .prepare('SELECT * FROM services WHERE deleted_at IS NULL ORDER BY name ASC, created_at ASC')
      .all() as ServiceRow[];
    return rows.map(fromDatabase);
  }

  async update(
    id: string,
    fields: Partial<Pick<Service, 'name' | 'slug' | 'ownerId' | 'exposure'>>
  ): Promise<void> {
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
    if (fields.ownerId !== undefined) {
      setClauses.push('owner_id = ?');
      values.push(fields.ownerId);
    }
    if (fields.exposure !== undefined) {
      setClauses.push('exposure = ?');
      values.push(fields.exposure);
    }

    values.push(id);
    this.db
      .prepare(`UPDATE services SET ${setClauses.join(', ')} WHERE id = ? AND deleted_at IS NULL`)
      .run(...values);
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    this.db
      .prepare('UPDATE services SET deleted_at = ?, updated_at = ? WHERE id = ?')
      .run(now, now, id);
  }
}
