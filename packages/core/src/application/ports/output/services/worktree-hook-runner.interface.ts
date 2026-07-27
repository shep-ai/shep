/**
 * Worktree Hook Runner Interface
 *
 * Output port for the user-configurable commands that provision a feature
 * worktree (`settings.worktree`). Two hooks exist:
 *
 * - **create** — replaces the built-in `git worktree add` entirely. Used when
 *   an external tool must lay down the tree (monorepo bootstrappers, bind
 *   mounts, shared-object clones).
 * - **post-create** — runs after the worktree exists, from inside it. Used to
 *   symlink `node_modules`, copy untracked config, or warm caches.
 *
 * Implementations resolve the commands from settings; when nothing is
 * configured every method is a no-op and the built-in git flow is used.
 */

/**
 * Everything a worktree hook needs to know about the tree being provisioned.
 * Each field is exported to the hook process as a `SHEP_`-prefixed env var.
 */
export interface WorktreeHookContext {
  /** Absolute path to the main repository clone. */
  repoPath: string;
  /** Absolute path the worktree must exist at once the hook returns. */
  worktreePath: string;
  /** Branch that must be checked out in the worktree. */
  branch: string;
  /**
   * Start ref for a branch that does not exist yet. Undefined when `branch`
   * already exists and only needs to be checked out.
   */
  startPoint?: string;
}

export interface IWorktreeHookRunner {
  /**
   * Whether a custom create command is configured. When true the caller must
   * delegate provisioning to {@link runCreateHook} instead of `git worktree add`.
   */
  hasCreateHook(): boolean;

  /**
   * Run the configured create command with the main repository as cwd.
   *
   * @throws WorktreeError with code HOOK_FAILED when the command fails,
   *   times out, or no create command is configured.
   */
  runCreateHook(context: WorktreeHookContext): Promise<void>;

  /**
   * Run the configured post-create command with the worktree as cwd.
   * No-ops when no post-create command is configured.
   *
   * @throws WorktreeError with code HOOK_FAILED when the command fails or times out.
   */
  runPostCreateHook(context: WorktreeHookContext): Promise<void>;
}
