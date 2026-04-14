/**
 * GitHub Repository Name Taken Error
 *
 * Thrown by the git remote service when `gh repo create` reports that the
 * requested repository name already exists on the target owner. The UI
 * surfaces this inline so the user can pick a different name.
 */
export class GitHubRepoNameTakenError extends Error {
  readonly code = 'GH_REPO_NAME_TAKEN';
  constructor(
    public readonly ownerLogin: string,
    public readonly repoName: string
  ) {
    super(`Repository "${repoName}" already exists on ${ownerLogin}.`);
    this.name = 'GitHubRepoNameTakenError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
