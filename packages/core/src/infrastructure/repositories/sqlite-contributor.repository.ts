/**
 * SQLite Contributor Repository (spec 097, FR-21).
 *
 * Backed by the `contributors` table (migration 101). All queries use
 * parameterized statements; the leaderboard query uses the indexed
 * `pr_count` and `last_contribution_at` columns.
 */

import type Database from 'better-sqlite3';
import { inject, injectable } from 'tsyringe';
import type {
  IContributorRepository,
  FindTopByPrCountOptions,
} from '../../application/ports/output/repositories/contributor-repository.interface.js';
import type { Contributor } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type ContributorRow,
} from '../persistence/sqlite/mappers/contributor.mapper.js';

/**
 * Returns the [start, endExclusive) UTC ms boundaries of the calendar month
 * containing `now`.
 */
function currentMonthBoundsUtc(now: Date): { start: number; endExclusive: number } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const start = Date.UTC(year, month, 1);
  const endExclusive = Date.UTC(year, month + 1, 1);
  return { start, endExclusive };
}

@injectable()
export class SQLiteContributorRepository implements IContributorRepository {
  constructor(@inject('Database') private readonly db: Database.Database) {}

  async create(contributor: Contributor): Promise<void> {
    const row = toDatabase(contributor);
    this.db
      .prepare(
        `INSERT INTO contributors
           (id, github_login, display_name, avatar_url, lane, level,
            first_contribution_at, last_contribution_at, pr_count, issue_count,
            created_at, updated_at)
         VALUES (@id, @github_login, @display_name, @avatar_url, @lane, @level,
                 @first_contribution_at, @last_contribution_at, @pr_count, @issue_count,
                 @created_at, @updated_at)`
      )
      .run(row);
  }

  async findById(id: string): Promise<Contributor | null> {
    const row = this.db.prepare('SELECT * FROM contributors WHERE id = ? LIMIT 1').get(id) as
      | ContributorRow
      | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findByGitHubLogin(login: string): Promise<Contributor | null> {
    const row = this.db
      .prepare('SELECT * FROM contributors WHERE github_login = ? LIMIT 1')
      .get(login) as ContributorRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async update(contributor: Contributor): Promise<void> {
    const row = toDatabase(contributor);
    this.db
      .prepare(
        `UPDATE contributors
            SET github_login          = @github_login,
                display_name          = @display_name,
                avatar_url            = @avatar_url,
                lane                  = @lane,
                level                 = @level,
                first_contribution_at = @first_contribution_at,
                last_contribution_at  = @last_contribution_at,
                pr_count              = @pr_count,
                issue_count           = @issue_count,
                updated_at            = @updated_at
          WHERE id = @id`
      )
      .run(row);
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM contributors WHERE id = ?').run(id);
  }

  async listAll(): Promise<Contributor[]> {
    const rows = this.db
      .prepare('SELECT * FROM contributors ORDER BY github_login ASC')
      .all() as ContributorRow[];
    return rows.map(fromDatabase);
  }

  async findTopByPrCount(options: FindTopByPrCountOptions): Promise<Contributor[]> {
    if (options.limit <= 0) return [];

    if (options.scope === 'allTime') {
      const rows = this.db
        .prepare(
          `SELECT * FROM contributors
             ORDER BY pr_count DESC, github_login ASC
             LIMIT ?`
        )
        .all(options.limit) as ContributorRow[];
      return rows.map(fromDatabase);
    }

    const { start, endExclusive } = currentMonthBoundsUtc(new Date());
    const rows = this.db
      .prepare(
        `SELECT * FROM contributors
           WHERE last_contribution_at >= ? AND last_contribution_at < ?
           ORDER BY pr_count DESC, github_login ASC
           LIMIT ?`
      )
      .all(start, endExclusive, options.limit) as ContributorRow[];
    return rows.map(fromDatabase);
  }
}
