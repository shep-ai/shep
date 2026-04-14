/**
 * Application Repository Not On Disk Error
 *
 * Thrown by deployment use cases when an application's repositoryPath no
 * longer exists on the local filesystem — e.g. the user deleted the folder
 * out from under us. The caller (CLI / TUI / Web) should surface this as a
 * recoverable precondition failure, not an internal error.
 */
export class ApplicationRepositoryNotOnDiskError extends Error {
  readonly code = 'APPLICATION_REPOSITORY_NOT_ON_DISK';
  constructor(
    public readonly applicationId: string,
    public readonly repositoryPath: string
  ) {
    super(`Repository path does not exist: ${repositoryPath}`);
    this.name = 'ApplicationRepositoryNotOnDiskError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
