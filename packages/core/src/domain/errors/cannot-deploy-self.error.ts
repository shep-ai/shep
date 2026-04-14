/**
 * Cannot Deploy Self Error
 *
 * Thrown by deployment use cases when the target repository is the same
 * directory (or a worktree of) the currently running Shep instance.
 * Spawning a nested Shep dev server would collide on the shared
 * ~/.shep/data SQLite database.
 */
export class CannotDeploySelfError extends Error {
  readonly code = 'CANNOT_DEPLOY_SELF';
  constructor(public readonly repositoryPath: string) {
    super('Cannot start a dev server for the repository Shep is running from');
    this.name = 'CannotDeploySelfError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
