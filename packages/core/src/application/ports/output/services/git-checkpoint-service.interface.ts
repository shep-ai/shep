/**
 * Git Checkpoint Service Port (spec 138)
 *
 * Git plumbing behind feature checkpoints. Implementations must never move a
 * branch or HEAD and never touch the real index while capturing; only
 * {@link IGitCheckpointService.restoreWorktree} writes to the working tree.
 */

import type { FileDiff } from './git-pr-service.interface.js';

/** The worktree's content as a git tree, plus the branch HEAD it sits on. */
export interface WorktreeSnapshot {
  /** Tree object holding every tracked and untracked, non-ignored file. */
  treeSha: string;
  /** Branch HEAD, absent on an unborn branch. */
  headSha?: string;
}

export interface CommitCheckpointInput {
  /** Any directory of the repository (the worktree that was snapshotted). */
  cwd: string;
  treeSha: string;
  /** Parent commit — the branch HEAD at capture time. */
  headSha?: string;
  /** Full ref to point at the new commit (refs/shep/checkpoints/...). */
  ref: string;
  message: string;
}

/** Size of the change between two trees. */
export interface CheckpointDiffStat {
  filesChanged: number;
  additions: number;
  deletions: number;
}

export interface IGitCheckpointService {
  /** Write the worktree to a tree object through a temporary index. */
  snapshotWorktree(cwd: string): Promise<WorktreeSnapshot>;

  /** Create the checkpoint commit and point `ref` at it; returns the commit id. */
  commitCheckpoint(input: CommitCheckpointInput): Promise<string>;

  /** Change summary between two trees; `fromTree` undefined means "from empty". */
  diffStat(cwd: string, fromTree: string | undefined, toTree: string): Promise<CheckpointDiffStat>;

  /** Full per-file diff between two checkpoint objects (commits or trees). */
  diff(cwd: string, from: string, to: string): Promise<FileDiff[]>;

  /**
   * Make the working tree equal `treeSha`: files missing from it are removed
   * (ignored files are kept), the index is reset to HEAD, the branch is not moved.
   */
  restoreWorktree(cwd: string, treeSha: string): Promise<void>;

  /** True when `cwd` is a linked worktree (`git worktree add`), not a main checkout. */
  isLinkedWorktree(cwd: string): Promise<boolean>;

  /** Delete every ref under `refPrefix`; returns how many were deleted. */
  deleteRefs(cwd: string, refPrefix: string): Promise<number>;
}
