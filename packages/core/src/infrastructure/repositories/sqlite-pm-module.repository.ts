/**
 * SQLite PmModule Repository Implementation
 *
 * Implements IPmModuleRepository using better-sqlite3.
 * Includes junction table operations for module_work_items.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { IPmModuleRepository } from '../../application/ports/output/repositories/pm-module-repository.interface.js';
import type { PmModule } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type PmModuleRow,
} from '../persistence/sqlite/mappers/pm-module.mapper.js';

@injectable()
export class SQLitePmModuleRepository implements IPmModuleRepository {
  constructor(private readonly db: Database.Database) {}

  async create(mod: PmModule): Promise<void> {
    const row = toDatabase(mod);
    const stmt = this.db.prepare(`
      INSERT INTO pm_modules (
        id, project_id, name, description, status, lead_id,
        start_date, end_date, created_at, updated_at, deleted_at
      ) VALUES (
        @id, @project_id, @name, @description, @status, @lead_id,
        @start_date, @end_date, @created_at, @updated_at, @deleted_at
      )
    `);
    stmt.run(row);
  }

  async findById(id: string): Promise<PmModule | null> {
    const stmt = this.db.prepare('SELECT * FROM pm_modules WHERE id = ? AND deleted_at IS NULL');
    const row = stmt.get(id) as PmModuleRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async listByProject(projectId: string): Promise<PmModule[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM pm_modules WHERE project_id = ? AND deleted_at IS NULL ORDER BY created_at ASC'
    );
    const rows = stmt.all(projectId) as PmModuleRow[];
    return rows.map(fromDatabase);
  }

  async update(
    id: string,
    fields: Partial<
      Pick<PmModule, 'name' | 'description' | 'status' | 'leadId' | 'startDate' | 'endDate'>
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
    if (fields.status !== undefined) {
      setClauses.push('status = ?');
      values.push(fields.status);
    }
    if (fields.leadId !== undefined) {
      setClauses.push('lead_id = ?');
      values.push(fields.leadId);
    }
    if (fields.startDate !== undefined) {
      setClauses.push('start_date = ?');
      values.push(fields.startDate instanceof Date ? fields.startDate.getTime() : fields.startDate);
    }
    if (fields.endDate !== undefined) {
      setClauses.push('end_date = ?');
      values.push(fields.endDate instanceof Date ? fields.endDate.getTime() : fields.endDate);
    }

    values.push(id);
    const stmt = this.db.prepare(
      `UPDATE pm_modules SET ${setClauses.join(', ')} WHERE id = ? AND deleted_at IS NULL`
    );
    stmt.run(...values);
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(
      'UPDATE pm_modules SET deleted_at = ?, updated_at = ? WHERE id = ?'
    );
    stmt.run(now, now, id);
  }

  async addWorkItem(moduleId: string, workItemId: string): Promise<void> {
    const stmt = this.db.prepare(
      'INSERT OR IGNORE INTO module_work_items (module_id, work_item_id) VALUES (?, ?)'
    );
    stmt.run(moduleId, workItemId);
  }

  async removeWorkItem(moduleId: string, workItemId: string): Promise<void> {
    const stmt = this.db.prepare(
      'DELETE FROM module_work_items WHERE module_id = ? AND work_item_id = ?'
    );
    stmt.run(moduleId, workItemId);
  }

  async getWorkItemIds(moduleId: string): Promise<string[]> {
    const stmt = this.db.prepare('SELECT work_item_id FROM module_work_items WHERE module_id = ?');
    const rows = stmt.all(moduleId) as { work_item_id: string }[];
    return rows.map((r) => r.work_item_id);
  }

  async getModuleIdsForWorkItem(workItemId: string): Promise<string[]> {
    const stmt = this.db.prepare('SELECT module_id FROM module_work_items WHERE work_item_id = ?');
    const rows = stmt.all(workItemId) as { module_id: string }[];
    return rows.map((r) => r.module_id);
  }
}
