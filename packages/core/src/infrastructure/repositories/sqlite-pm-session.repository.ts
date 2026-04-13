import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { IPmSessionRepository } from '../../application/ports/output/repositories/pm-session-repository.interface.js';
import type { PmSession } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type PmSessionRow,
} from '../persistence/sqlite/mappers/pm-session.mapper.js';

@injectable()
export class SQLitePmSessionRepository implements IPmSessionRepository {
  constructor(private readonly db: Database.Database) {}

  async create(session: PmSession): Promise<void> {
    const row = toDatabase(session);
    const stmt = this.db.prepare(`
      INSERT INTO pm_sessions (
        id, user_id, token, expires_at,
        created_at, updated_at, deleted_at
      ) VALUES (
        @id, @user_id, @token, @expires_at,
        @created_at, @updated_at, @deleted_at
      )
    `);
    stmt.run(row);
  }

  async findByToken(token: string): Promise<PmSession | null> {
    const stmt = this.db.prepare(
      'SELECT * FROM pm_sessions WHERE token = ? AND deleted_at IS NULL'
    );
    const row = stmt.get(token) as PmSessionRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findValidByToken(token: string): Promise<PmSession | null> {
    const now = Date.now();
    const stmt = this.db.prepare(
      'SELECT * FROM pm_sessions WHERE token = ? AND deleted_at IS NULL AND expires_at > ?'
    );
    const row = stmt.get(token, now) as PmSessionRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async listByUser(userId: string): Promise<PmSession[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM pm_sessions WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC'
    );
    const rows = stmt.all(userId) as PmSessionRow[];
    return rows.map(fromDatabase);
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare('UPDATE pm_sessions SET deleted_at = ? WHERE id = ?');
    stmt.run(now, id);
  }

  async deleteExpired(): Promise<number> {
    const now = Date.now();
    const stmt = this.db.prepare(
      'UPDATE pm_sessions SET deleted_at = ? WHERE expires_at <= ? AND deleted_at IS NULL'
    );
    const result = stmt.run(now, now);
    return result.changes;
  }
}
