/**
 * Workspace port of standalone harness runs (spec 119, F4): every standalone
 * task runs in its own git worktree, never in the user's checkout. Apply turns
 * the worktree's changes into a commit on a named branch; discard removes the
 * worktree (state and evidence stay in the store).
 */

export interface HarnessWorkspace {
  path: string;
  branch: string;
  /** Commit the worktree started from. */
  baseCommit: string;
}

export interface HarnessWorkspaceChanges {
  /** Unified diff against the base commit, including new files. */
  patch: string;
  files: string[];
}

export interface IHarnessWorkspaceService {
  create(repoRoot: string, sessionId: string): Promise<HarnessWorkspace>;
  changes(workspacePath: string, baseCommit: string): Promise<HarnessWorkspaceChanges>;
  /** Commit every change in the worktree; returns the commit, or undefined when nothing changed. */
  commitAll(workspacePath: string, message: string): Promise<string | undefined>;
  /** Point `branch` (in the source repository) at `commit`; refuses to move an existing branch. */
  createBranch(repoRoot: string, branch: string, commit: string): Promise<void>;
  remove(repoRoot: string, workspacePath: string): Promise<void>;
  exists(workspacePath: string): Promise<boolean>;
}
