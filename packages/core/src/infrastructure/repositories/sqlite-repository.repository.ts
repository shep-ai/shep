/**
 * SQLite Repository Repository Implementation
 *
 * Implements IRepositoryRepository using better-sqlite3.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { IRepositoryRepository } from '../../application/ports/output/repositories/repository-repository.interface.js';
import type { Repository } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type RepositoryRow,
} from '../persistence/sqlite/mappers/repository.mapper.js';

@injectable()
export class SQLiteRepositoryRepository implements IRepositoryRepository {
  constructor(private readonly db: Database.Database) {}

  async create(repository: Repository): Promise<Repository> {
    const row = toDatabase(repository);
    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO repositories (id, name, path, created_at, updated_at)
      VALUES (@id, @name, @path, @created_at, @updated_at)
    `);
    insertStmt.run(row);
    const selectStmt = this.db.prepare('SELECT * FROM repositories WHERE path = ?');
    const existing = selectStmt.get(row.path) as RepositoryRow;
    return fromDatabase(existing);
  }

  async findById(id: string): Promise<Repository | null> {
    const stmt = this.db.prepare('SELECT * FROM repositories WHERE id = ? AND deleted_at IS NULL');
    const row = stmt.get(id) as RepositoryRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findByPath(path: string): Promise<Repository | null> {
    const stmt = this.db.prepare(
      "SELECT * FROM repositories WHERE REPLACE(path, '\\', '/') = ? AND deleted_at IS NULL"
    );
    const row = stmt.get(path.replace(/\\/g, '/')) as RepositoryRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async list(): Promise<Repository[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM repositories WHERE deleted_at IS NULL ORDER BY created_at ASC'
    );
    const rows = stmt.all() as RepositoryRow[];
    return rows.map(fromDatabase);
  }

  async remove(id: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM repositories WHERE id = ?');
    stmt.run(id);
  }

  async findByPathIncludingDeleted(path: string): Promise<Repository | null> {
    const stmt = this.db.prepare("SELECT * FROM repositories WHERE REPLACE(path, '\\', '/') = ?");
    const row = stmt.get(path.replace(/\\/g, '/')) as RepositoryRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findByRemoteUrl(url: string): Promise<Repository | null> {
    const normalized = SQLiteRepositoryRepository.normalizeRemoteUrl(url);
    const stmt = this.db.prepare(
      'SELECT * FROM repositories WHERE remote_url = ? AND deleted_at IS NULL'
    );
    const row = stmt.get(normalized) as RepositoryRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findByUpstreamUrl(url: string): Promise<Repository | null> {
    const normalized = SQLiteRepositoryRepository.normalizeRemoteUrl(url);
    const stmt = this.db.prepare(
      'SELECT * FROM repositories WHERE upstream_url = ? AND deleted_at IS NULL'
    );
    const row = stmt.get(normalized) as RepositoryRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async update(
    id: string,
    fields: Partial<Pick<Repository, 'name' | 'path' | 'remoteUrl' | 'isFork' | 'upstreamUrl'>>
  ): Promise<Repository> {
    const now = Date.now();
    const setClauses: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (fields.name !== undefined) {
      setClauses.push('name = ?');
      values.push(fields.name);
    }
    if (fields.path !== undefined) {
      setClauses.push('path = ?');
      values.push(fields.path);
    }
    if (fields.remoteUrl !== undefined) {
      setClauses.push('remote_url = ?');
      values.push(fields.remoteUrl);
    }
    if (fields.isFork !== undefined) {
      setClauses.push('is_fork = ?');
      values.push(fields.isFork ? 1 : 0);
    }
    if (fields.upstreamUrl !== undefined) {
      setClauses.push('upstream_url = ?');
      values.push(fields.upstreamUrl);
    }

    values.push(id);
    const stmt = this.db.prepare(`UPDATE repositories SET ${setClauses.join(', ')} WHERE id = ?`);
    const result = stmt.run(...values);

    if (result.changes === 0) {
      throw new Error(`Repository not found: ${id}`);
    }

    const selectStmt = this.db.prepare('SELECT * FROM repositories WHERE id = ?');
    const row = selectStmt.get(id) as RepositoryRow;
    return fromDatabase(row);
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(
      'UPDATE repositories SET deleted_at = ?, updated_at = ? WHERE id = ?'
    );
    stmt.run(now, now, id);
  }

  async restore(id: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(
      'UPDATE repositories SET deleted_at = NULL, created_at = ?, updated_at = ? WHERE id = ?'
    );
    stmt.run(now, now, id);
  }

  static normalizeRemoteUrl(url: string): string {
    return url.replace(/\.git$/, '').toLowerCase();
  }
}
