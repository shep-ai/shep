/**
 * Run Plan Staleness Probe Interface (Output Port)
 *
 * A cached `DevServerRunPlan` is only as good as the on-disk facts that
 * produced it. Two of those facts are needed by the run-plan use cases:
 *
 * - the repository's current config-file fingerprint, which decides whether a
 *   stored plan has drifted (`isStale`), and
 * - whether a committed `.shep/dev.json` currently controls the repository,
 *   which decides whether a typed override would take effect at all.
 *
 * Both are computed by infrastructure (`computeConfigHash`, the
 * `.shep/dev.json` reader). This port exists so the application layer can ask
 * for them without importing an infrastructure utility — the exact violating
 * pattern the code-quality rules name.
 *
 * Staleness is derived ONCE, in `GetDevServerRunPlanUseCase`, so the CLI and
 * the web disclosure agree by construction. No presentation layer computes it.
 *
 * Following Clean Architecture:
 * - Application layer depends on this interface
 * - Infrastructure layer provides the concrete implementation
 */

export interface IRunPlanStalenessProbe {
  /**
   * Current config-file fingerprint for a repository directory. Compared
   * against a stored plan's `configHash` to decide staleness.
   *
   * Implementations MUST NOT throw — an unreadable directory yields the same
   * digest as an empty one, which reads as "changed" rather than crashing a
   * plan lookup.
   *
   * @param repoPath - Absolute repository/worktree path (forward slashes)
   */
  currentConfigHash(repoPath: string): string;

  /**
   * Whether a valid committed `.shep/dev.json` currently controls the
   * repository. When true, that file outranks every persisted plan, so a
   * database override would be silently shadowed and must be refused.
   *
   * Implementations MUST NOT throw — an unreadable or malformed file is
   * "no committed override", never an error.
   *
   * @param repoPath - Absolute repository/worktree path (forward slashes)
   */
  hasRepoDevConfig(repoPath: string): boolean;
}
