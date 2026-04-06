/**
 * Git PR Service Interface
 *
 * Output port for git PR and merge operations.
 * Implementations manage PR creation, merging, and CI status checks.
 */

import type { PrStatus } from '../../../../domain/generated/output.js';

/**
 * Error codes for git PR operations.
 */
export enum GitPrErrorCode {
  AUTH_FAILURE = 'AUTH_FAILURE',
  BRANCH_NOT_FOUND = 'BRANCH_NOT_FOUND',
  CI_TIMEOUT = 'CI_TIMEOUT',
  GH_NOT_FOUND = 'GH_NOT_FOUND',
  GIT_ERROR = 'GIT_ERROR',
  MERGE_CONFLICT = 'MERGE_CONFLICT',
  MERGE_FAILED = 'MERGE_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  PR_NOT_FOUND = 'PR_NOT_FOUND',
  REMOTE_ALREADY_EXISTS = 'REMOTE_ALREADY_EXISTS',
  REPO_CREATE_FAILED = 'REPO_CREATE_FAILED',
  REBASE_CONFLICT = 'REBASE_CONFLICT',
  SYNC_FAILED = 'SYNC_FAILED',
}

/**
 * Typed error for git PR operations.
 */
export class GitPrError extends Error {
  constructor(
    message: string,
    public readonly code: GitPrErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'GitPrError';
  }
}

/**
 * CI check status values.
 */
export type CiStatus = 'success' | 'failure' | 'pending';

/**
 * Result of a CI status check.
 */
export interface CiStatusResult {
  /** Overall CI status */
  status: CiStatus;
  /** URL to the CI run (e.g., GitHub Actions run URL) */
  runUrl?: string;
  /** Excerpt from CI logs (e.g., failure output) */
  logExcerpt?: string;
}

/**
 * Summary of diff statistics between branches or commits.
 */
export interface DiffSummary {
  /** Number of files changed */
  filesChanged: number;
  /** Number of lines added */
  additions: number;
  /** Number of lines deleted */
  deletions: number;
  /** Number of commits in the diff */
  commitCount: number;
}

/**
 * A single hunk in a file diff showing the actual line changes.
 */
export interface DiffHunk {
  /** Header line (e.g. "@@ -1,5 +1,7 @@") */
  header: string;
  /** Lines in this hunk with their type and content */
  lines: DiffLine[];
}

/**
 * A single line within a diff hunk.
 */
export interface DiffLine {
  /** Type of change: added, removed, or context (unchanged) */
  type: 'added' | 'removed' | 'context';
  /** The line content (without the leading +/-/space) */
  content: string;
  /** Old file line number (undefined for added lines) */
  oldNumber?: number;
  /** New file line number (undefined for removed lines) */
  newNumber?: number;
}

/**
 * Per-file diff data showing what changed in a single file.
 */
export interface FileDiff {
  /** File path (new path for renames) */
  path: string;
  /** Previous path if the file was renamed */
  oldPath?: string;
  /** Number of lines added */
  additions: number;
  /** Number of lines removed */
  deletions: number;
  /** Change type */
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  /** Diff hunks with actual line changes */
  hunks: DiffHunk[];
}

/**
 * Result of creating a pull request.
 */
export interface PrCreateResult {
  /** URL of the created PR */
  url: string;
  /** PR number */
  number: number;
}

/**
 * PR status information returned by batch status queries.
 */
export interface PrStatusInfo {
  /** PR number */
  number: number;
  /** Current PR state (Open, Merged, or Closed) */
  state: PrStatus;
  /** URL of the pull request */
  url: string;
  /** Head branch name of the PR */
  headRefName: string;
  /** Whether the PR can be merged (undefined if unknown, false = merge conflicts) */
  mergeable?: boolean;
}

/**
 * Merge strategy for pull requests.
 */
export type MergeStrategy = 'squash' | 'merge' | 'rebase';

/**
 * Service interface for git PR and merge operations.
 */
export interface IGitPrService {
  /**
   * Check if the repository has any configured git remotes.
   *
   * @param cwd - Working directory path
   * @returns True if at least one remote is configured
   */
  hasRemote(cwd: string): Promise<boolean>;

  /**
   * Get the remote URL for the repository (origin remote).
   * Returns an HTTPS-style URL suitable for browser linking.
   * SSH URLs (git@...) are converted to https:// equivalents.
   *
   * @param cwd - Working directory path
   * @returns The remote URL, or null if no remote is configured
   */
  getRemoteUrl(cwd: string): Promise<string | null>;

  /**
   * Create a GitHub repository and link it to the local repo.
   * Uses `gh repo create` with `--source=.` and `--push` to atomically
   * create the remote repo, add the origin remote, and push the current branch.
   *
   * @param cwd - Working directory path
   * @param name - Repository name (e.g. "my-repo" or "org/my-repo")
   * @param options - Creation options
   * @returns The URL of the created GitHub repository
   * @throws GitPrError with REPO_CREATE_FAILED code on creation failure
   * @throws GitPrError with GH_NOT_FOUND code if gh CLI is not installed
   * @throws GitPrError with AUTH_FAILURE code if gh is not authenticated
   */
  createGitHubRepo(
    cwd: string,
    name: string,
    options: { isPrivate: boolean; org?: string }
  ): Promise<string>;

  /**
   * Add a git remote to the local repository.
   *
   * @param cwd - Working directory path
   * @param remoteName - Name for the remote (e.g. "origin")
   * @param remoteUrl - URL of the remote repository
   * @throws GitPrError with GIT_ERROR code on failure
   */
  addRemote(cwd: string, remoteName: string, remoteUrl: string): Promise<void>;

  /**
   * Detect the repository's default branch with robust fallback chain:
   * 1. Remote HEAD (git symbolic-ref refs/remotes/origin/HEAD)
   * 2. Local branches named main or master (in that order)
   * 3. Current branch (git symbolic-ref HEAD)
   *
   * @param cwd - Working directory path
   * @returns The default branch name (e.g. "main", "master", "develop")
   */
  getDefaultBranch(cwd: string): Promise<string>;

  /**
   * Resolve a git ref to its SHA hash.
   *
   * @param cwd - Working directory path
   * @param ref - Git ref to resolve (branch name, tag, HEAD, etc.)
   * @returns The resolved SHA hash
   */
  revParse(cwd: string, ref: string): Promise<string>;

  /**
   * Check if the working directory has uncommitted changes.
   *
   * @param cwd - Working directory path
   * @returns True if there are uncommitted changes
   * @throws GitPrError with GIT_ERROR code on failure
   */
  hasUncommittedChanges(cwd: string): Promise<boolean>;

  /**
   * Stage all changes and create a commit.
   *
   * @param cwd - Working directory path
   * @param message - Commit message
   * @returns The commit SHA
   * @throws GitPrError with GIT_ERROR code on failure
   */
  commitAll(cwd: string, message: string): Promise<string>;

  /**
   * Push the current branch to the remote.
   *
   * @param cwd - Working directory path
   * @param branch - Branch name to push
   * @param setUpstream - Whether to set upstream tracking
   * @throws GitPrError with MERGE_CONFLICT or AUTH_FAILURE code
   */
  push(cwd: string, branch: string, setUpstream?: boolean): Promise<void>;

  /**
   * Create a pull request from a pr.yaml file.
   *
   * @param cwd - Working directory path
   * @param prYamlPath - Path to the pr.yaml file
   * @returns URL and number of the created PR
   * @throws GitPrError with GH_NOT_FOUND or AUTH_FAILURE code
   */
  createPr(cwd: string, prYamlPath: string): Promise<PrCreateResult>;

  /**
   * Merge a pull request immediately.
   *
   * The PR must be in a mergeable state (all required checks passed, reviews
   * approved). If not, this throws GitPrError with MERGE_FAILED code.
   *
   * @param cwd - Working directory path
   * @param prNumber - PR number to merge
   * @param strategy - Merge strategy (squash, merge, rebase)
   * @throws GitPrError with MERGE_FAILED code if the PR cannot be merged
   */
  mergePr(cwd: string, prNumber: number, strategy?: MergeStrategy): Promise<void>;

  /**
   * Merge a source branch into a target branch using git merge.
   *
   * @param cwd - Working directory path
   * @param sourceBranch - Branch to merge from
   * @param targetBranch - Branch to merge into
   * @throws GitPrError with MERGE_CONFLICT code
   */
  mergeBranch(cwd: string, sourceBranch: string, targetBranch: string): Promise<void>;

  /**
   * Get the current CI status for the branch.
   *
   * @param cwd - Working directory path
   * @param branch - Branch to check CI for
   * @returns CI status result
   * @throws GitPrError with GH_NOT_FOUND or NETWORK_ERROR code
   */
  getCiStatus(cwd: string, branch: string): Promise<CiStatusResult>;

  /**
   * Watch CI until it completes or times out.
   *
   * @param cwd - Working directory path
   * @param branch - Branch to watch CI for
   * @param timeoutMs - Maximum time to wait in milliseconds
   * @param intervalSeconds - Poll interval in seconds for gh run watch (default: 30)
   * @returns CI status result when complete
   * @throws GitPrError with CI_TIMEOUT code on timeout
   */
  watchCi(
    cwd: string,
    branch: string,
    timeoutMs?: number,
    intervalSeconds?: number
  ): Promise<CiStatusResult>;

  /**
   * Delete a branch locally and optionally on the remote.
   *
   * @param cwd - Working directory path
   * @param branch - Branch to delete
   * @param deleteRemote - Whether to also delete the remote branch
   * @throws GitPrError with BRANCH_NOT_FOUND or GIT_ERROR code
   */
  deleteBranch(cwd: string, branch: string, deleteRemote?: boolean): Promise<void>;

  /**
   * Get diff summary statistics between the current branch and a base branch.
   *
   * @param cwd - Working directory path
   * @param baseBranch - Base branch to compare against
   * @returns Diff summary with file count, additions, deletions, and commit count
   * @throws GitPrError with GIT_ERROR code
   */
  getPrDiffSummary(cwd: string, baseBranch: string): Promise<DiffSummary>;

  /**
   * Get per-file diffs between the current branch and a base branch.
   *
   * @param cwd - Working directory path
   * @param baseBranch - Base branch to compare against
   * @returns Array of per-file diffs with hunks and line changes
   * @throws GitPrError with GIT_ERROR code
   */
  getFileDiffs(cwd: string, baseBranch: string): Promise<FileDiff[]>;

  /**
   * List PR statuses for all open and recently-updated PRs in a repository.
   *
   * @param cwd - Working directory path (repository root)
   * @returns Array of PR status info with number, state, and URL
   * @throws GitPrError with GH_NOT_FOUND, AUTH_FAILURE, or GIT_ERROR code
   */
  listPrStatuses(cwd: string): Promise<PrStatusInfo[]>;

  /**
   * Verify that a feature branch has been merged into a base branch.
   * Uses `git merge-base --is-ancestor` to check if featureBranch
   * is an ancestor of baseBranch (meaning all its commits are reachable).
   *
   * @param cwd - Working directory path
   * @param featureBranch - The branch that should have been merged
   * @param baseBranch - The branch that should contain the merge
   * @param premergeBaseSha - Optional SHA of baseBranch before merge; if provided and
   *   baseBranch HEAD has advanced, the merge is considered verified even when the
   *   trees differ (handles agents that clean up artifacts during squash merge)
   * @returns True if featureBranch is an ancestor of baseBranch
   */
  verifyMerge(
    cwd: string,
    featureBranch: string,
    baseBranch: string,
    premergeBaseSha?: string
  ): Promise<boolean>;

  /**
   * Perform a local squash merge: checkout baseBranch, merge --squash featureBranch,
   * commit with the given message, and optionally delete the feature branch.
   *
   * This is a deterministic operation that does not require an AI agent.
   *
   * @param cwd - Working directory path (the original repository, NOT a worktree)
   * @param featureBranch - Branch to merge from
   * @param baseBranch - Branch to merge into
   * @param commitMessage - Commit message for the squash merge
   * @param hasRemote - Whether the repo has a remote (controls git fetch)
   * @throws GitPrError with MERGE_CONFLICT or GIT_ERROR code
   */
  localMergeSquash(
    cwd: string,
    featureBranch: string,
    baseBranch: string,
    commitMessage: string,
    hasRemote?: boolean
  ): Promise<void>;

  /**
   * Check if a PR has merge conflicts via `gh pr view --json mergeable`.
   *
   * @param cwd - Working directory path
   * @param prNumber - PR number to check
   * @returns True if the PR is mergeable, false if it has conflicts, undefined if unknown
   * @throws GitPrError with GH_NOT_FOUND or GIT_ERROR code
   */
  getMergeableStatus(cwd: string, prNumber: number): Promise<boolean | undefined>;

  /**
   * Retrieve failure logs for a CI run via `gh run view --log-failed`.
   * Output is truncated to the first `logMaxChars` characters (head truncation).
   * A notice is appended when truncation occurs.
   *
   * @param cwd - Working directory (must be inside a git repo so gh can resolve the remote)
   * @param runId - GitHub Actions run ID (numeric string)
   * @param branch - Branch name (informational, used in truncation notice)
   * @param logMaxChars - Maximum characters to return (default 50_000)
   * @returns Truncated failure log output
   * @throws GitPrError with GH_NOT_FOUND or GIT_ERROR code on failure
   */
  getFailureLogs(cwd: string, runId: string, branch: string, logMaxChars?: number): Promise<string>;

  // --- Rebase & Sync operations ---

  /**
   * Sync the remote-tracking ref for the base branch.
   * If currently on the base branch, uses `git pull --ff-only`.
   * If on a different branch (including worktrees), uses `git fetch origin <baseBranch>`
   * which updates `origin/<baseBranch>` without touching the local branch ref.
   * This avoids the "refusing to fetch into branch checked out at..." error
   * when the local base branch is checked out in another worktree.
   *
   * @param cwd - Working directory path
   * @param baseBranch - The base branch to sync (e.g. "main")
   * @throws GitPrError with SYNC_FAILED code if the branch has diverged and cannot fast-forward
   * @throws GitPrError with GIT_ERROR code on other git failures
   */
  syncMain(cwd: string, baseBranch: string): Promise<void>;

  /**
   * Rebase the feature branch onto `origin/<baseBranch>`.
   * Uses the remote-tracking ref (not the local branch) to avoid issues
   * when the local base branch is checked out in another worktree.
   * Checks for dirty worktree before starting. Detects conflict state
   * from git exit code and stderr — throws REBASE_CONFLICT if conflicts
   * are encountered (caller is responsible for resolution or abort).
   *
   * @param cwd - Working directory path
   * @param featureBranch - The feature branch to rebase
   * @param baseBranch - The base branch name (rebase target will be origin/<baseBranch>)
   * @throws GitPrError with GIT_ERROR code if the worktree is dirty
   * @throws GitPrError with REBASE_CONFLICT code if conflicts are detected
   * @throws GitPrError with BRANCH_NOT_FOUND code if a branch does not exist
   */
  rebaseOnMain(cwd: string, featureBranch: string, baseBranch: string): Promise<void>;

  /**
   * Get the list of files with unresolved conflicts (unmerged paths).
   * Uses `git diff --name-only --diff-filter=U` to identify conflicted files.
   *
   * @param cwd - Working directory path
   * @returns Array of file paths with unresolved conflicts
   * @throws GitPrError with GIT_ERROR code on failure
   */
  getConflictedFiles(cwd: string): Promise<string[]>;

  /**
   * Stage specific files in the working directory.
   * Uses `git add` for the specified file paths.
   *
   * @param cwd - Working directory path
   * @param files - Array of file paths to stage
   * @throws GitPrError with GIT_ERROR code on failure
   */
  stageFiles(cwd: string, files: string[]): Promise<void>;

  /**
   * Continue an in-progress rebase after conflicts have been resolved.
   * Runs `git rebase --continue`. May throw REBASE_CONFLICT if the next
   * commit in the rebase also has conflicts.
   *
   * @param cwd - Working directory path
   * @throws GitPrError with REBASE_CONFLICT code if new conflicts are detected
   * @throws GitPrError with GIT_ERROR code on other git failures
   */
  rebaseContinue(cwd: string): Promise<void>;

  /**
   * Abort an in-progress rebase, restoring the branch to its pre-rebase state.
   * Runs `git rebase --abort`.
   *
   * @param cwd - Working directory path
   * @throws GitPrError with GIT_ERROR code on failure
   */
  rebaseAbort(cwd: string): Promise<void>;

  /**
   * Stash uncommitted changes in the working directory.
   * Runs `git stash push -m <message>`.
   *
   * @param cwd - Working directory path
   * @param message - Optional stash message
   * @returns True if changes were stashed, false if working directory was clean
   * @throws GitPrError with GIT_ERROR code on failure
   */
  stash(cwd: string, message?: string): Promise<boolean>;

  /**
   * Pop the most recent stash entry.
   * Runs `git stash pop`.
   *
   * @param cwd - Working directory path
   * @throws GitPrError with GIT_ERROR code on failure (including stash pop conflicts)
   */
  stashPop(cwd: string): Promise<void>;

  /**
   * Drop the most recent stash entry without applying it.
   * Runs `git stash drop`.
   *
   * @param cwd - Working directory path
   * @throws GitPrError with GIT_ERROR code on failure (e.g., no stash entries)
   */
  stashDrop(cwd: string): Promise<void>;

  /**
   * Get the sync status (ahead/behind counts) between a feature branch
   * and a base branch's remote-tracking ref.
   *
   * Uses:
   * - `git rev-list --count origin/<baseBranch>..<featureBranch>` → ahead
   * - `git rev-list --count <featureBranch>..origin/<baseBranch>` → behind
   *
   * @param cwd - Working directory path
   * @param featureBranch - The feature branch to check
   * @param baseBranch - The base branch name (uses origin/<baseBranch>)
   * @returns Object with ahead and behind commit counts
   * @throws GitPrError with GIT_ERROR code on failure
   */
  getBranchSyncStatus(
    cwd: string,
    featureBranch: string,
    baseBranch: string
  ): Promise<{ ahead: number; behind: number }>;
}
