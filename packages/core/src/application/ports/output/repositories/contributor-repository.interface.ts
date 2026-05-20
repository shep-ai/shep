/**
 * Contributor Repository Interface (Output Port) — spec 097, FR-21.
 *
 * Persistence contract for the Contributor entity. Implementations handle
 * database-specific logic (SQLite, etc.). The application layer depends only
 * on this interface (injected by string token) and never on the concrete
 * adapter.
 */

import type { Contributor } from '../../../../domain/generated/output.js';

/**
 * Scope for the leaderboard aggregate query.
 *
 * - `month`: contributors whose `lastContributionAt` falls in the current
 *   calendar month (UTC).
 * - `allTime`: every known contributor.
 */
export type ContributorLeaderboardScope = 'month' | 'allTime';

export interface FindTopByPrCountOptions {
  /** Time scope for the leaderboard. */
  scope: ContributorLeaderboardScope;
  /** Maximum number of contributors to return. Must be > 0. */
  limit: number;
}

export interface IContributorRepository {
  /** Insert a new contributor. Throws on uniqueness conflict (github_login). */
  create(contributor: Contributor): Promise<void>;

  /** Lookup a contributor by id. Returns null if not found. */
  findById(id: string): Promise<Contributor | null>;

  /** Lookup a contributor by their unique GitHub login. Returns null if not found. */
  findByGitHubLogin(login: string): Promise<Contributor | null>;

  /** Replace an existing contributor in place. */
  update(contributor: Contributor): Promise<void>;

  /** Remove a contributor by id. Cascades to recognition_events. */
  delete(id: string): Promise<void>;

  /** List all contributors ordered by github_login ASC. */
  listAll(): Promise<Contributor[]>;

  /**
   * Top contributors by PR count for the leaderboard component.
   *
   * Implementations should execute a single aggregate query against the
   * indexed `contributors` table and (when scope === 'month') filter by
   * `last_contribution_at` falling within the current UTC calendar month.
   */
  findTopByPrCount(options: FindTopByPrCountOptions): Promise<Contributor[]>;
}
