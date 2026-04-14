/**
 * Git Remote Creation Error
 *
 * Generic catch-all wrapper for failures inside the git remote service that
 * aren't covered by a more specific domain error.
 */
export class GitRemoteCreationError extends Error {
  readonly code = 'GIT_REMOTE_CREATION_FAILED';
  constructor(message: string) {
    super(message);
    this.name = 'GitRemoteCreationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
