/**
 * DevServerRunPlan Repository Interface (Output Port)
 *
 * Defines the contract for persisting dev-server run plans — the cached
 * per-repository analysis of how to spawn a dev server (spec 103,
 * agentic-dev-server). Implementations handle database-specific logic
 * (SQLite, etc.).
 *
 * Following Clean Architecture:
 * - Domain and Application layers depend on this interface
 * - Infrastructure layer provides concrete implementations
 */

import type { DevServerRunPlan } from '../../../../domain/generated/output.js';

/**
 * Repository interface for DevServerRunPlan persistence.
 *
 * Plans are keyed by `repoPath` (the absolute, forward-slash-normalized
 * repository/worktree path) — deliberately NOT a foreign key to any
 * entity, because Applications, Feature worktrees, and bare Repositories
 * share one plan cache per on-disk path.
 */
export interface IDevServerRunPlanRepository {
  /**
   * Find the cached run plan for a repository path.
   *
   * @param repoPath - Absolute repository/worktree path (forward slashes)
   * @returns The plan or null if none is cached for the path
   */
  findByRepoPath(repoPath: string): Promise<DevServerRunPlan | null>;

  /**
   * Insert or update the run plan for its `repoPath`.
   *
   * Idempotent: inserting with an existing `repoPath` replaces every
   * mutable column of the row in place (the original `createdAt` is
   * preserved). Safe to call repeatedly — will not duplicate rows.
   *
   * @param plan - The complete plan to persist
   */
  upsert(plan: DevServerRunPlan): Promise<void>;

  /**
   * Delete the cached plan for a repository path. Used to invalidate a
   * plan that caused a start failure so the next run re-analyzes.
   * No-op if no plan exists for the path.
   *
   * @param repoPath - Absolute repository/worktree path (forward slashes)
   */
  deleteByRepoPath(repoPath: string): Promise<void>;

  /**
   * Stamp the lockfile/manifest hash of the last successful dependency
   * install onto the plan (and bump `updatedAt`). Called only after a
   * successful install so staleness checks compare against reality.
   * No-op if no plan exists for the path.
   *
   * @param repoPath - Absolute repository/worktree path (forward slashes)
   * @param hash     - The config/lockfile hash captured at install time
   */
  stampInstallHash(repoPath: string, hash: string): Promise<void>;
}
