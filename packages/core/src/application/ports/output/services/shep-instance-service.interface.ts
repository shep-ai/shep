/**
 * Shep Instance Service Interface
 *
 * Output port for detecting whether a given path is the same directory
 * (or a worktree of) the currently running Shep instance.
 *
 * Starting a dev server for the running Shep instance's own repository
 * would spawn a nested Shep process that conflicts with the shared
 * ~/.shep/data SQLite database — so deployment use cases reject it.
 */

export interface IShepInstanceService {
  /**
   * Return true when `targetPath` resolves to the same canonical directory
   * as the running Shep instance.
   *
   * Implementations must normalize paths to forward slashes and use
   * `fs.realpathSync` so symlinks, case differences, and trailing
   * separators do not yield false negatives.
   */
  isSameInstance(targetPath: string): boolean;
}
