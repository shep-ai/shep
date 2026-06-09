/**
 * SQLite Team Repository
 *
 * Feature 098, phase 2. Backed by the teams table (migration 103).
 */

import type Database from 'better-sqlite3';
import { inject, injectable } from 'tsyringe';
import type { ITeamRepository } from '../../../application/ports/output/repositories/team-repository.interface.js';
import type { Team } from '../../../domain/generated/output.js';
import { toDatabase, fromDatabase, type TeamRow } from './mappers/team-mapper.js';

@injectable()
export class SQLiteTeamRepository implements ITeamRepository {
  constructor(@inject('Database') private readonly db: Database.Database) {}

  async create(team: Team): Promise<void> {
    const row = toDatabase(team);
    this.db
      .prepare(
        `INSERT INTO teams
         (id, name, slug, business_unit_id, created_at, updated_at, deleted_at)
         VALUES (@id, @name, @slug, @business_unit_id, @created_at, @updated_at, @deleted_at)`
      )
      .run(row);
  }

  async findById(id: string): Promise<Team | null> {
    const row = this.db
      .prepare('SELECT * FROM teams WHERE id = ? AND deleted_at IS NULL')
      .get(id) as TeamRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findBySlug(slug: string): Promise<Team | null> {
    const row = this.db
      .prepare('SELECT * FROM teams WHERE LOWER(slug) = LOWER(?) AND deleted_at IS NULL LIMIT 1')
      .get(slug) as TeamRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async listAll(): Promise<Team[]> {
    const rows = this.db
      .prepare('SELECT * FROM teams WHERE deleted_at IS NULL ORDER BY name ASC, created_at ASC')
      .all() as TeamRow[];
    return rows.map(fromDatabase);
  }

  async listByBusinessUnit(businessUnitId: string): Promise<Team[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM teams WHERE business_unit_id = ? AND deleted_at IS NULL ORDER BY name ASC, created_at ASC'
      )
      .all(businessUnitId) as TeamRow[];
    return rows.map(fromDatabase);
  }

  async update(
    id: string,
    fields: Partial<Pick<Team, 'name' | 'slug' | 'businessUnitId'>>
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
    if (fields.businessUnitId !== undefined) {
      setClauses.push('business_unit_id = ?');
      values.push(fields.businessUnitId);
    }

    values.push(id);
    this.db
      .prepare(`UPDATE teams SET ${setClauses.join(', ')} WHERE id = ? AND deleted_at IS NULL`)
      .run(...values);
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    this.db
      .prepare('UPDATE teams SET deleted_at = ?, updated_at = ? WHERE id = ?')
      .run(now, now, id);
  }
}
