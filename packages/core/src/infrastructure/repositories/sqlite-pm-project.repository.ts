/**
 * SQLite PmProject Repository Implementation
 *
 * Implements IPmProjectRepository using better-sqlite3.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { IPmProjectRepository } from '../../application/ports/output/repositories/pm-project-repository.interface.js';
import type { PmProject } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type PmProjectRow,
} from '../persistence/sqlite/mappers/pm-project.mapper.js';

@injectable()
export class SQLitePmProjectRepository implements IPmProjectRepository {
  constructor(private readonly db: Database.Database) {}

  async create(project: PmProject): Promise<void> {
    const row = toDatabase(project);
    const stmt = this.db.prepare(`
      INSERT INTO pm_projects (
        id, name, slug, description, identifier_prefix, work_item_counter,
        estimate_type, application_id, start_date, end_date, feature_toggles,
        created_at, updated_at, deleted_at
      ) VALUES (
        @id, @name, @slug, @description, @identifier_prefix, @work_item_counter,
        @estimate_type, @application_id, @start_date, @end_date, @feature_toggles,
        @created_at, @updated_at, @deleted_at
      )
    `);
    stmt.run(row);
  }

  async findById(id: string): Promise<PmProject | null> {
    const stmt = this.db.prepare('SELECT * FROM pm_projects WHERE id = ? AND deleted_at IS NULL');
    const row = stmt.get(id) as PmProjectRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findBySlug(slug: string): Promise<PmProject | null> {
    const stmt = this.db.prepare('SELECT * FROM pm_projects WHERE slug = ? AND deleted_at IS NULL');
    const row = stmt.get(slug) as PmProjectRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findByIdentifierPrefix(prefix: string): Promise<PmProject | null> {
    const stmt = this.db.prepare(
      'SELECT * FROM pm_projects WHERE identifier_prefix = ? AND deleted_at IS NULL'
    );
    const row = stmt.get(prefix) as PmProjectRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async list(): Promise<PmProject[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM pm_projects WHERE deleted_at IS NULL ORDER BY created_at ASC'
    );
    const rows = stmt.all() as PmProjectRow[];
    return rows.map(fromDatabase);
  }

  async update(
    id: string,
    fields: Partial<
      Pick<
        PmProject,
        | 'name'
        | 'slug'
        | 'description'
        | 'estimateType'
        | 'startDate'
        | 'endDate'
        | 'featureToggles'
      >
    >
  ): Promise<void> {
    const now = Date.now();
    const setClauses: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (fields.name !== undefined) {
      setClauses.push('name = ?');
      values.push(fields.name);
    }
    if (fields.slug !== undefined) {
      setClauses.push('slug = ?');
      values.push(fields.slug);
    }
    if (fields.description !== undefined) {
      setClauses.push('description = ?');
      values.push(fields.description);
    }
    if (fields.estimateType !== undefined) {
      setClauses.push('estimate_type = ?');
      values.push(fields.estimateType);
    }
    if (fields.startDate !== undefined) {
      setClauses.push('start_date = ?');
      values.push(fields.startDate instanceof Date ? fields.startDate.getTime() : fields.startDate);
    }
    if (fields.endDate !== undefined) {
      setClauses.push('end_date = ?');
      values.push(fields.endDate instanceof Date ? fields.endDate.getTime() : fields.endDate);
    }
    if (fields.featureToggles !== undefined) {
      setClauses.push('feature_toggles = ?');
      values.push(fields.featureToggles);
    }

    values.push(id);
    const stmt = this.db.prepare(
      `UPDATE pm_projects SET ${setClauses.join(', ')} WHERE id = ? AND deleted_at IS NULL`
    );
    stmt.run(...values);
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(
      'UPDATE pm_projects SET deleted_at = ?, updated_at = ? WHERE id = ?'
    );
    stmt.run(now, now, id);
  }

  async incrementWorkItemCounter(projectId: string): Promise<number> {
    const stmt = this.db.prepare(
      'UPDATE pm_projects SET work_item_counter = work_item_counter + 1, updated_at = ? WHERE id = ? AND deleted_at IS NULL RETURNING work_item_counter'
    );
    const row = stmt.get(Date.now(), projectId) as { work_item_counter: number } | undefined;
    if (!row) {
      throw new Error(`Project not found: ${projectId}`);
    }
    return row.work_item_counter;
  }
}
