import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { IPmUserRepository } from '../../application/ports/output/repositories/pm-user-repository.interface.js';
import type { PmUser } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type PmUserRow,
} from '../persistence/sqlite/mappers/pm-user.mapper.js';

@injectable()
export class SQLitePmUserRepository implements IPmUserRepository {
  constructor(private readonly db: Database.Database) {}

  async create(user: PmUser): Promise<void> {
    const row = toDatabase(user);
    const stmt = this.db.prepare(`
      INSERT INTO pm_users (
        id, email, password_hash, display_name, is_system_user,
        created_at, updated_at, deleted_at
      ) VALUES (
        @id, @email, @password_hash, @display_name, @is_system_user,
        @created_at, @updated_at, @deleted_at
      )
    `);
    stmt.run(row);
  }

  async findById(id: string): Promise<PmUser | null> {
    const stmt = this.db.prepare('SELECT * FROM pm_users WHERE id = ? AND deleted_at IS NULL');
    const row = stmt.get(id) as PmUserRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findByEmail(email: string): Promise<PmUser | null> {
    const stmt = this.db.prepare('SELECT * FROM pm_users WHERE email = ? AND deleted_at IS NULL');
    const row = stmt.get(email) as PmUserRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findSystemUser(): Promise<PmUser | null> {
    const stmt = this.db.prepare(
      'SELECT * FROM pm_users WHERE is_system_user = 1 AND deleted_at IS NULL LIMIT 1'
    );
    const row = stmt.get() as PmUserRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async list(): Promise<PmUser[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM pm_users WHERE deleted_at IS NULL ORDER BY display_name ASC'
    );
    const rows = stmt.all() as PmUserRow[];
    return rows.map(fromDatabase);
  }

  async update(
    id: string,
    fields: Partial<Pick<PmUser, 'email' | 'passwordHash' | 'displayName'>>
  ): Promise<void> {
    const setClauses: string[] = ['updated_at = ?'];
    const values: unknown[] = [Date.now()];

    if (fields.email !== undefined) {
      setClauses.push('email = ?');
      values.push(fields.email);
    }
    if (fields.passwordHash !== undefined) {
      setClauses.push('password_hash = ?');
      values.push(fields.passwordHash);
    }
    if (fields.displayName !== undefined) {
      setClauses.push('display_name = ?');
      values.push(fields.displayName);
    }

    values.push(id);
    const stmt = this.db.prepare(
      `UPDATE pm_users SET ${setClauses.join(', ')} WHERE id = ? AND deleted_at IS NULL`
    );
    stmt.run(...values);
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare('UPDATE pm_users SET deleted_at = ? WHERE id = ?');
    stmt.run(now, id);
  }
}
