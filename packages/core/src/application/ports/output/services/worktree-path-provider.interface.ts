/**
 * Worktree Path Provider Interface
 *
 * Output port for deriving a feature's worktree filesystem path from a
 * repository path and branch name. Abstracts away how the provider resolves
 * the shep home directory so application-layer use cases stay independent
 * of infrastructure path helpers.
 */

/**
 * Provider for computing worktree paths for features.
 */
export interface IWorktreePathProvider {
  /**
   * Compute the worktree path for a given repository and branch.
   *
   * @param repoPath - Absolute path to the repository root
   * @param branch - Git branch name
   * @returns Absolute path to the worktree directory
   */
  getWorktreePath(repoPath: string, branch: string): string;
}
