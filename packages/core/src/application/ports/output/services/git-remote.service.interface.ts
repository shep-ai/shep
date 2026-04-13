/**
 * Git Remote Service (port)
 *
 * Owns creation of a GitHub repository for an Application's local folder.
 * v1 delegates to the `gh` CLI — no tokens, no OAuth app.
 */

export class GhNotAuthenticatedError extends Error {
  readonly code = 'GH_NOT_AUTHENTICATED';
  constructor() {
    super('GitHub CLI is not authenticated. Run `gh auth login` (or the Sign-in button) first.');
  }
}

export class GitRemoteCreationError extends Error {
  readonly code = 'GIT_REMOTE_CREATION_FAILED';
  constructor(message: string) {
    super(message);
  }
}

export interface CreateGitHubRepoInput {
  /** Absolute path to the local repository working directory. */
  cwd: string;
  /** URL-friendly slug used as the GitHub repo name. */
  slug: string;
  /** Short description attached to the GitHub repo. */
  description: string;
  /** Optional. Default: public. */
  visibility?: 'public' | 'private';
}

export interface IGitRemoteService {
  /**
   * Returns true iff `gh auth token` exits 0 and yields a non-empty token.
   */
  isGhAuthenticated(): Promise<boolean>;

  /**
   * Initialize git in cwd (idempotent), commit any uncommitted changes,
   * create a new GitHub repository via `gh repo create`, add it as origin,
   * and push. Returns the remote URL.
   *
   * Throws GhNotAuthenticatedError if `gh` is not signed in.
   */
  createGitHubRepoAndPush(input: CreateGitHubRepoInput): Promise<{ remoteUrl: string }>;
}
