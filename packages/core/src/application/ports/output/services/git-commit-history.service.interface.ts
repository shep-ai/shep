/**
 * Git Commit History (port)
 *
 * Read-only facts about commits that use cases reason over without running
 * git themselves — today, when the commit a branch points at was made.
 */

export interface IGitCommitHistoryService {
  /**
   * The committer date of the commit `ref` points at, falling back to
   * `origin/<ref>` when the local branch is gone. Null when neither resolves.
   *
   * @throws when `ref` is not a safe git ref argument
   */
  getCommitDate(cwd: string, ref: string): Promise<Date | null>;
}
