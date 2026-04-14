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

/**
 * Read-only snapshot of a local git working tree. Drives the SmartDeployButton
 * label state machine + the DeployPanel "Code Storage" section.
 *
 * `uncommittedCount` covers files that have local edits relative to HEAD
 * (modified, added, deleted, untracked). `unpushedCount` covers commits
 * that exist locally but not on the configured upstream branch.
 *
 * `hasRemote` is independent of both counts — a brand-new repo with no
 * commits and no remote returns `{ uncommittedCount: 0, unpushedCount: 0,
 * hasRemote: false, branch: 'main' }`.
 */
export interface GitWorkingTreeStatus {
  /** Current branch name, or `null` if HEAD is detached / no commits yet. */
  branch: string | null;
  /** Number of working-tree changes (`git status --porcelain` line count). */
  uncommittedCount: number;
  /** Number of local commits ahead of the configured upstream. 0 if no upstream. */
  unpushedCount: number;
  /** True iff a remote named `origin` is configured. */
  hasRemote: boolean;
  /** The origin URL when `hasRemote` is true; otherwise `null`. */
  remoteUrl: string | null;
}

export interface CommitAndPushInput {
  /** Absolute path to the local repository working directory. */
  cwd: string;
  /** Commit message — single line, sanitised by the caller. */
  message: string;
  /** Optional log emitter so the orchestrating use case can capture progress. */
  onLog?: GitRemoteLogEmitter;
}

export interface CommitAndPushResult {
  /** SHA of the new HEAD commit, or the existing HEAD if nothing was committed. */
  headSha: string;
  /** True iff at least one new commit was created (no-op when working tree was clean). */
  committed: boolean;
  /** True iff a push was attempted. False when there's nothing to push. */
  pushed: boolean;
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

  /**
   * Read the current state of the local working tree. Cheap (a handful of
   * `git` subprocess calls) — safe to poll every few seconds from the UI.
   */
  getStatus(cwd: string): Promise<GitWorkingTreeStatus>;

  /**
   * Stage all changes, commit with the given message, and push to origin.
   * No-op when the working tree is clean AND there are no unpushed commits.
   * Throws GitRemoteCreationError when push fails — the caller should
   * surface that through the operation log.
   */
  commitAndPush(input: CommitAndPushInput): Promise<CommitAndPushResult>;
}
