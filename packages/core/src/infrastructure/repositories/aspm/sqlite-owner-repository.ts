/**
 * SQLite Owner Repository
 *
 * Feature 098, phase 2 (Asset & Ownership Model). Backed by the owners
 * table (migration 102).
 */

import type Database from 'better-sqlite3';
import { inject, injectable } from 'tsyringe';
import type { IOwnerRepository } from '../../../application/ports/output/repositories/owner-repository.interface.js';
import type { Owner } from '../../../domain/generated/output.js';
import { toDatabase, fromDatabase, type OwnerRow } from './mappers/owner-mapper.js';

@injectable()
export class SQLiteOwnerRepository implements IOwnerRepository {
  constructor(@inject('Database') private readonly db: Database.Database) {}

  async create(owner: Owner): Promise<void> {
    const row = toDatabase(owner);
    this.db
      .prepare(
        `INSERT INTO owners
         (id, name, handle, team_id, notes, created_at, updated_at, deleted_at)
         VALUES (@id, @name, @handle, @team_id, @notes, @created_at, @updated_at, @deleted_at)`
      )
      .run(row);
  }

  async findById(id: string): Promise<Owner | null> {
    const row = this.db
      .prepare('SELECT * FROM owners WHERE id = ? AND deleted_at IS NULL')
      .get(id) as OwnerRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findByHandle(handle: string): Promise<Owner | null> {
    const row = this.db
      .prepare('SELECT * FROM owners WHERE LOWER(handle) = LOWER(?) AND deleted_at IS NULL LIMIT 1')
      .get(handle) as OwnerRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async listAll(): Promise<Owner[]> {
    const rows = this.db
      .prepare('SELECT * FROM owners WHERE deleted_at IS NULL ORDER BY name ASC, created_at ASC')
      .all() as OwnerRow[];
    return rows.map(fromDatabase);
  }

  async listByTeam(teamId: string): Promise<Owner[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM owners WHERE team_id = ? AND deleted_at IS NULL ORDER BY name ASC, created_at ASC'
      )
      .all(teamId) as OwnerRow[];
    return rows.map(fromDatabase);
  }

  async update(
    id: string,
    fields: Partial<Pick<Owner, 'name' | 'handle' | 'teamId' | 'notes'>>
  ): Promise<void> {
    const setClauses: string[] = ['updated_at = ?'];
    const values: unknown[] = [Date.now()];

    if (fields.name !== undefined) {
      setClauses.push('name = ?');
      values.push(fields.name);
    }
    if (fields.handle !== undefined) {
      setClauses.push('handle = ?');
      values.push(fields.handle);
    }
    if (fields.teamId !== undefined) {
      setClauses.push('team_id = ?');
      values.push(fields.teamId);
    }
    if (fields.notes !== undefined) {
      setClauses.push('notes = ?');
      values.push(fields.notes);
    }

    values.push(id);
    this.db
      .prepare(`UPDATE owners SET ${setClauses.join(', ')} WHERE id = ? AND deleted_at IS NULL`)
      .run(...values);
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    this.db
      .prepare('UPDATE owners SET deleted_at = ?, updated_at = ? WHERE id = ?')
      .run(now, now, id);
  }
}
