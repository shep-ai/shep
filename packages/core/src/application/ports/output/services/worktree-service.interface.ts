/**
 * Worktree Service Interface
 *
 * Output port for git worktree operations.
 * Implementations manage git worktree creation, removal, and listing.
 */

/**
 * Information about a git worktree.
 */
export interface WorktreeInfo {
  /** Absolute path to the worktree directory */
  path: string;
  /** HEAD commit hash */
  head: string;
  /** Branch name (empty for detached HEAD) */
  branch: string;
  /** Whether this is the main worktree */
  isMain: boolean;
}

/**
 * Error codes for worktree operations.
 */
export enum WorktreeErrorCode {
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  BRANCH_IN_USE = 'BRANCH_IN_USE',
  NOT_FOUND = 'NOT_FOUND',
  DIRTY_WORKTREE = 'DIRTY_WORKTREE',
  GIT_ERROR = 'GIT_ERROR',
  /** A user-configured worktree provisioning command failed or timed out. */
  HOOK_FAILED = 'HOOK_FAILED',
}

/**
 * Typed error for worktree operations.
 */
export class WorktreeError extends Error {
  constructor(
    message: string,
    public readonly code: WorktreeErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'WorktreeError';
  }
}

/**
 * Service interface for git worktree management.
 */
export interface IWorktreeService {
  /**
   * Create a new worktree with a new branch.
   *
   * @param repoPath - Path to the git repository
   * @param branch - Branch name to create
   * @param worktreePath - Path for the new worktree directory
   * @param startPoint - Optional commit/branch to start from (defaults to HEAD)
   * @returns Information about the created worktree
   * @throws WorktreeError with appropriate code
   */
  create(
    repoPath: string,
    branch: string,
    worktreePath: string,
    startPoint?: string
  ): Promise<WorktreeInfo>;

  /**
   * Create a worktree for an already-existing branch (no -b flag).
   *
   * Unlike create(), this does not create a new branch. It attaches a worktree
   * to a branch that already exists locally or as a remote tracking ref.
   * For remote-only branches, pass "origin/<branch>" as the branch argument
   * so that git automatically sets up local tracking.
   *
   * @param repoPath - Path to the git repository
   * @param branch - Existing branch name or remote tracking ref (e.g., "origin/my-branch")
   * @param worktreePath - Path for the new worktree directory
   * @returns Information about the created worktree
   * @throws WorktreeError with appropriate code
   */
  addExisting(repoPath: string, branch: string, worktreePath: string): Promise<WorktreeInfo>;

  /**
   * Remove an existing worktree.
   *
   * @param repoPath - Absolute path to the main repository (used as cwd for git)
   * @param worktreePath - Path to the worktree to remove
   * @param force - When true, passes --force to git worktree remove (handles dirty worktrees)
   * @throws WorktreeError if worktree not found or has uncommitted changes
   */
  remove(repoPath: string, worktreePath: string, force?: boolean): Promise<void>;

  /**
   * List all worktrees in a repository.
   *
   * @param repoPath - Path to the git repository
   * @returns Array of worktree information
   */
  list(repoPath: string): Promise<WorktreeInfo[]>;

  /**
   * Check if a worktree for a branch already exists.
   *
   * @param repoPath - Path to the git repository
   * @param branch - Branch name to check
   * @returns True if a worktree for this branch exists
   */
  exists(repoPath: string, branch: string): Promise<boolean>;

  /**
   * Check if a git branch exists in the repository.
   *
   * @param repoPath - Path to the git repository
   * @param branch - Branch name to check
   * @returns True if the branch exists
   */
  branchExists(repoPath: string, branch: string): Promise<boolean>;

  /**
   * Check if a remote branch exists (e.g., on origin).
   *
   * @param repoPath - Path to the git repository
   * @param branch - Branch name to check (without remote prefix)
   * @returns True if the remote branch exists
   */
  remoteBranchExists(repoPath: string, branch: string): Promise<boolean>;

  /**
   * Get the conventional worktree path for a branch.
   *
   * @param repoPath - Path to the git repository
   * @param branch - Branch name
   * @returns Computed worktree path (e.g., /repo/.worktrees/branch-name)
   */
  getWorktreePath(repoPath: string, branch: string): string;

  /**
   * List all local and remote branch names in a repository.
   *
   * Returns unique branch names (without remote prefixes like "origin/").
   * Excludes HEAD pointers and the current branch marker.
   *
   * @param repoPath - Path to the git repository
   * @returns Array of branch name strings
   */
  listBranches(repoPath: string): Promise<string[]>;

  /**
   * Prune stale worktree entries whose directories no longer exist.
   *
   * @param repoPath - Path to the git repository
   */
  prune(repoPath: string): Promise<void>;

  /**
   * Ensure a directory is a valid git repository with at least one commit.
   * If the directory is not a git repo, initializes it with `git init`
   * and creates an empty initial commit. No-ops for existing repos.
   *
   * @param repoPath - Path to the directory to check/initialize
   * @throws WorktreeError if git initialization fails
   */
  ensureGitRepository(repoPath: string): Promise<void>;
}
