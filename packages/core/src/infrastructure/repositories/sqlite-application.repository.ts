/**
 * SQLite Application Repository Implementation
 *
 * Implements IApplicationRepository using better-sqlite3.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { IApplicationRepository } from '../../application/ports/output/repositories/application-repository.interface.js';
import type { Application } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type ApplicationRow,
} from '../persistence/sqlite/mappers/application.mapper.js';

@injectable()
export class SQLiteApplicationRepository implements IApplicationRepository {
  constructor(private readonly db: Database.Database) {}

  async create(application: Application): Promise<void> {
    const row = toDatabase(application);
    const stmt = this.db.prepare(`
      INSERT INTO applications (
        id, name, slug, description, repository_path, additional_paths,
        agent_type, model_override, status, setup_complete, agent_session_id, created_at, updated_at, deleted_at
      ) VALUES (
        @id, @name, @slug, @description, @repository_path, @additional_paths,
        @agent_type, @model_override, @status, @setup_complete, @agent_session_id, @created_at, @updated_at, @deleted_at
      )
    `);
    stmt.run(row);
  }

  async findById(id: string): Promise<Application | null> {
    const stmt = this.db.prepare('SELECT * FROM applications WHERE id = ? AND deleted_at IS NULL');
    const row = stmt.get(id) as ApplicationRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findBySlug(slug: string): Promise<Application | null> {
    const stmt = this.db.prepare(
      'SELECT * FROM applications WHERE slug = ? AND deleted_at IS NULL'
    );
    const row = stmt.get(slug) as ApplicationRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findByPath(path: string): Promise<Application | null> {
    const stmt = this.db.prepare(
      "SELECT * FROM applications WHERE REPLACE(repository_path, '\\', '/') = ? AND deleted_at IS NULL"
    );
    const row = stmt.get(path.replace(/\\/g, '/')) as ApplicationRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async list(): Promise<Application[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM applications WHERE deleted_at IS NULL ORDER BY created_at ASC'
    );
    const rows = stmt.all() as ApplicationRow[];
    return rows.map(fromDatabase);
  }

  async update(
    id: string,
    fields: Partial<
      Pick<
        Application,
        | 'name'
        | 'status'
        | 'additionalPaths'
        | 'agentType'
        | 'modelOverride'
        | 'setupComplete'
        | 'agentSessionId'
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
    if (fields.status !== undefined) {
      setClauses.push('status = ?');
      values.push(fields.status);
    }
    if (fields.additionalPaths !== undefined) {
      setClauses.push('additional_paths = ?');
      values.push(JSON.stringify(fields.additionalPaths));
    }
    if (fields.agentType !== undefined) {
      setClauses.push('agent_type = ?');
      values.push(fields.agentType);
    }
    if (fields.modelOverride !== undefined) {
      setClauses.push('model_override = ?');
      values.push(fields.modelOverride);
    }
    if (fields.setupComplete !== undefined) {
      setClauses.push('setup_complete = ?');
      values.push(fields.setupComplete ? 1 : 0);
    }
    if (fields.agentSessionId !== undefined) {
      setClauses.push('agent_session_id = ?');
      values.push(fields.agentSessionId);
    }

    values.push(id);
    const stmt = this.db.prepare(
      `UPDATE applications SET ${setClauses.join(', ')} WHERE id = ? AND deleted_at IS NULL`
    );
    stmt.run(...values);
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(
      'UPDATE applications SET deleted_at = ?, updated_at = ? WHERE id = ?'
    );
    stmt.run(now, now, id);
  }

  async restore(id: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(
      'UPDATE applications SET deleted_at = NULL, updated_at = ? WHERE id = ?'
    );
    stmt.run(now, id);
  }
}
