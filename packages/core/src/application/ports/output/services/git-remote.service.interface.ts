/**
 * Git Remote Service (port)
 *
 * Owns creation of a GitHub repository for an Application's local folder.
 * v1 delegates to the `gh` CLI — no tokens, no OAuth app.
 *
 * Errors live in domain/errors/ as zero-import files so cross-bundle
 * `instanceof` checks (web routes vs. core use cases) resolve to the same
 * class identity. Importing them via this port file would cause turbopack
 * to bundle the entire interface module on the consumer side.
 */

export interface CreateGitHubRepoInput {
  /** Absolute path to the local repository working directory. */
  cwd: string;
  /** URL-friendly slug used as the GitHub repo name. */
  slug: string;
  /** Short description attached to the GitHub repo. */
  description: string;
  /** Optional. Default: public. */
  visibility?: 'public' | 'private';
  /**
   * Optional GitHub organization login to create the repo under.
   * If omitted (or set to the user's own login), the repo is created
   * on the authenticated user's personal account.
   */
  ownerLogin?: string;
  /**
   * Optional log emitter — invoked for each meaningful step (subprocess
   * exit, gh API call, error). The orchestrating use case captures these
   * and persists them as OperationLogEntry rows. Service implementations
   * never persist anything themselves, keeping the dependency rule intact.
   */
  onLog?: GitRemoteLogEmitter;
}

/**
 * Log levels mirror OperationLogLevel but are kept as a string union here
 * so the port doesn't import the generated domain enum (zero-dependency
 * rule for application/ports).
 */
export type GitRemoteLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type GitRemoteLogEmitter = (
  level: GitRemoteLogLevel,
  message: string,
  detail?: string
) => void;

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
