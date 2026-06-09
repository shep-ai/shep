/**
 * SQLite ApiAsset Repository
 *
 * Feature 098, phase 2. Backed by the api_assets table (migration 106).
 * The mapper normalizes schemaPath to POSIX separators before persistence
 * (NFR-11 — cross-platform paths).
 */

import type Database from 'better-sqlite3';
import { inject, injectable } from 'tsyringe';
import type { IApiAssetRepository } from '../../../application/ports/output/repositories/api-asset-repository.interface.js';
import type { ApiAsset } from '../../../domain/generated/output.js';
import { toDatabase, fromDatabase, type ApiAssetRow } from './mappers/api-asset-mapper.js';

function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

@injectable()
export class SQLiteApiAssetRepository implements IApiAssetRepository {
  constructor(@inject('Database') private readonly db: Database.Database) {}

  async create(asset: ApiAsset): Promise<void> {
    const row = toDatabase(asset);
    this.db
      .prepare(
        `INSERT INTO api_assets
         (id, name, base_url, application_id, owner_id, exposure, schema_path, created_at, updated_at, deleted_at)
         VALUES (@id, @name, @base_url, @application_id, @owner_id, @exposure, @schema_path, @created_at, @updated_at, @deleted_at)`
      )
      .run(row);
  }

  async findById(id: string): Promise<ApiAsset | null> {
    const row = this.db
      .prepare('SELECT * FROM api_assets WHERE id = ? AND deleted_at IS NULL')
      .get(id) as ApiAssetRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findByApplicationId(applicationId: string): Promise<ApiAsset[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM api_assets WHERE application_id = ? AND deleted_at IS NULL ORDER BY name ASC, created_at ASC'
      )
      .all(applicationId) as ApiAssetRow[];
    return rows.map(fromDatabase);
  }

  async listAll(): Promise<ApiAsset[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM api_assets WHERE deleted_at IS NULL ORDER BY name ASC, created_at ASC'
      )
      .all() as ApiAssetRow[];
    return rows.map(fromDatabase);
  }

  async update(
    id: string,
    fields: Partial<Pick<ApiAsset, 'name' | 'baseUrl' | 'ownerId' | 'exposure' | 'schemaPath'>>
  ): Promise<void> {
    const setClauses: string[] = ['updated_at = ?'];
    const values: unknown[] = [Date.now()];

    if (fields.name !== undefined) {
      setClauses.push('name = ?');
      values.push(fields.name);
    }
    if (fields.baseUrl !== undefined) {
      setClauses.push('base_url = ?');
      values.push(fields.baseUrl);
    }
    if (fields.ownerId !== undefined) {
      setClauses.push('owner_id = ?');
      values.push(fields.ownerId);
    }
    if (fields.exposure !== undefined) {
      setClauses.push('exposure = ?');
      values.push(fields.exposure);
    }
    if (fields.schemaPath !== undefined) {
      setClauses.push('schema_path = ?');
      values.push(toPosix(fields.schemaPath));
    }

    values.push(id);
    this.db
      .prepare(`UPDATE api_assets SET ${setClauses.join(', ')} WHERE id = ? AND deleted_at IS NULL`)
      .run(...values);
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    this.db
      .prepare('UPDATE api_assets SET deleted_at = ?, updated_at = ? WHERE id = ?')
      .run(now, now, id);
  }
}
