/**
 * Conflict Resolution Service Interface
 *
 * Output port for agent-powered git conflict resolution during rebase
 * operations. Implementations orchestrate the detect → resolve → validate →
 * stage → continue loop, delegating the actual resolution work to an agent.
 */

/**
 * Service interface for agent-powered conflict resolution.
 */
export interface IConflictResolutionService {
  /**
   * Resolve all conflicts during an in-progress rebase.
   *
   * Handles multi-commit rebases where each commit may introduce conflicts.
   * On exhausted retries, aborts the rebase and throws.
   *
   * @param cwd - Working directory (repo root or worktree path)
   * @param featureBranch - Feature branch being rebased
   * @param baseBranch - Base branch being rebased onto
   */
  resolve(cwd: string, featureBranch: string, baseBranch: string): Promise<void>;

  /**
   * Resolve conflicts that arose from a failed stash pop after a rebase.
   *
   * Unlike {@link resolve}, this does NOT call `rebase --continue`; the
   * rebase is already complete. On success, the caller is responsible for
   * dropping the stash entry.
   *
   * @param cwd - Working directory (repo root or worktree path)
   * @param featureBranch - Feature branch name
   * @param baseBranch - Base branch name
   */
  resolveStashPop(cwd: string, featureBranch: string, baseBranch: string): Promise<void>;
}
