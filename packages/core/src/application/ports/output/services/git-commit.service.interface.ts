/**
 * Git Commit Service (port)
 *
 * Owns committing (and optionally pushing) local working-tree changes
 * for an Application's git repository. Separate from IGitRemoteService
 * which covers bootstrapping the GitHub repo from nothing.
 */

export class GitCommitError extends Error {
  readonly code = 'GIT_COMMIT_FAILED';
  constructor(message: string) {
    super(message);
  }
}

export class GitPushError extends Error {
  readonly code = 'GIT_PUSH_FAILED';
  constructor(message: string) {
    super(message);
  }
}

export interface CommitChangesInput {
  /** Absolute path to the local repository working directory. */
  cwd: string;
  /** Commit message. */
  message: string;
}

export interface CommitChangesResult {
  /** True if a commit was created; false if there were no staged changes. */
  committed: boolean;
}

export interface CommitAndPushResult extends CommitChangesResult {
  /** True if the commit was pushed to origin. */
  pushed: boolean;
}

export interface IGitCommitService {
  /**
   * Stage all working-tree changes and create a commit with the given
   * message. Idempotent: if the working tree is clean, returns
   * `{ committed: false }` without throwing.
   *
   * Throws GitCommitError if git reports an unexpected failure.
   */
  commitChanges(input: CommitChangesInput): Promise<CommitChangesResult>;

  /**
   * Commit (as per commitChanges) AND push HEAD to the `origin` remote.
   * If there is nothing to commit but there ARE local commits ahead of
   * origin, those are pushed. If there is no `origin` remote configured
   * GitPushError is thrown.
   */
  commitAndPush(input: CommitChangesInput): Promise<CommitAndPushResult>;
}
