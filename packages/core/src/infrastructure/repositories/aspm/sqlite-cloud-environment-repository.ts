/**
 * SQLite CloudEnvironment Repository
 *
 * Feature 098, phase 2. Backed by the cloud_environments table (migration 107).
 */

import type Database from 'better-sqlite3';
import { inject, injectable } from 'tsyringe';
import type { ICloudEnvironmentRepository } from '../../../application/ports/output/repositories/cloud-environment-repository.interface.js';
import type { CloudEnvironment } from '../../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type CloudEnvironmentRow,
} from './mappers/cloud-environment-mapper.js';

@injectable()
export class SQLiteCloudEnvironmentRepository implements ICloudEnvironmentRepository {
  constructor(@inject('Database') private readonly db: Database.Database) {}

  async create(env: CloudEnvironment): Promise<void> {
    const row = toDatabase(env);
    this.db
      .prepare(
        `INSERT INTO cloud_environments
         (id, name, provider, account_id, application_id, owner_id, region, created_at, updated_at, deleted_at)
         VALUES (@id, @name, @provider, @account_id, @application_id, @owner_id, @region, @created_at, @updated_at, @deleted_at)`
      )
      .run(row);
  }

  async findById(id: string): Promise<CloudEnvironment | null> {
    const row = this.db
      .prepare('SELECT * FROM cloud_environments WHERE id = ? AND deleted_at IS NULL')
      .get(id) as CloudEnvironmentRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findByApplicationId(applicationId: string): Promise<CloudEnvironment[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM cloud_environments WHERE application_id = ? AND deleted_at IS NULL ORDER BY name ASC, created_at ASC'
      )
      .all(applicationId) as CloudEnvironmentRow[];
    return rows.map(fromDatabase);
  }

  async listAll(): Promise<CloudEnvironment[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM cloud_environments WHERE deleted_at IS NULL ORDER BY name ASC, created_at ASC'
      )
      .all() as CloudEnvironmentRow[];
    return rows.map(fromDatabase);
  }

  async update(
    id: string,
    fields: Partial<
      Pick<CloudEnvironment, 'name' | 'provider' | 'accountId' | 'ownerId' | 'region'>
    >
  ): Promise<void> {
    const setClauses: string[] = ['updated_at = ?'];
    const values: unknown[] = [Date.now()];

    if (fields.name !== undefined) {
      setClauses.push('name = ?');
      values.push(fields.name);
    }
    if (fields.provider !== undefined) {
      setClauses.push('provider = ?');
      values.push(fields.provider);
    }
    if (fields.accountId !== undefined) {
      setClauses.push('account_id = ?');
      values.push(fields.accountId);
    }
    if (fields.ownerId !== undefined) {
      setClauses.push('owner_id = ?');
      values.push(fields.ownerId);
    }
    if (fields.region !== undefined) {
      setClauses.push('region = ?');
      values.push(fields.region);
    }

    values.push(id);
    this.db
      .prepare(
        `UPDATE cloud_environments SET ${setClauses.join(', ')} WHERE id = ? AND deleted_at IS NULL`
      )
      .run(...values);
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    this.db
      .prepare('UPDATE cloud_environments SET deleted_at = ?, updated_at = ? WHERE id = ?')
      .run(now, now, id);
  }
}
