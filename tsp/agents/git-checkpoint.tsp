/**
 * @module Shep.Agents.GitCheckpoint
 *
 * A snapshot of a feature's worktree taken after a feature-agent graph step
 * (spec 135). The snapshot is a git commit stored under a hidden ref,
 * `refs/shep/checkpoints/<featureId>/<sequence>-<node>`, built through a
 * temporary index so the feature branch, HEAD and the real index are never
 * touched. Rows are stored in the git_checkpoints table.
 */
import "../common/base.tsp";

/**
 * Why a checkpoint was taken.
 */
@doc("Why a git checkpoint was taken")
enum GitCheckpointKind {
  @doc("The worktree before the first recorded step of a feature")
  Baseline,

  @doc("The worktree after a feature-agent graph step")
  Step,

  @doc("The worktree just before a restore, so the restore can be undone")
  PreRestore,
}

/**
 * Why a feature's worktree cannot be restored to a checkpoint right now.
 * Restore writes to a working tree, so it is refused whenever it could touch
 * the user's own checkout or race a running agent.
 */
@doc("Why a feature's worktree cannot be restored to a checkpoint right now")
enum CheckpointRestoreBlocker {
  @doc("The feature has no worktree of its own (it runs in the repository checkout)")
  NoOwnWorktree,

  @doc("git does not report the directory as a linked worktree")
  NotLinkedWorktree,

  @doc("The worktree cannot be read (removed from disk, or not a git directory)")
  WorktreeUnavailable,

  @doc("The feature's latest agent run is pending or running")
  AgentRunning,
}

@doc("A hidden-ref snapshot of a feature's worktree after one feature-agent step")
model GitCheckpoint extends BaseEntity {
  @doc("Feature this checkpoint belongs to")
  featureId: string;

  @doc("Agent run that produced the step, when one was running")
  agentRunId?: string;

  @doc("Position within the feature's checkpoints; the baseline is 0")
  sequence: int32;

  @doc("Why the checkpoint was taken")
  kind: GitCheckpointKind;

  @doc("Graph node name (implement, repair_research, merge, ...) or baseline / pre-restore")
  node: string;

  @doc("Full hidden ref name, e.g. refs/shep/checkpoints/<featureId>/0003-implement")
  ref: string;

  @doc("Checkpoint commit the ref points at")
  commitSha: string;

  @doc("Tree of the checkpoint commit: the worktree content at capture time")
  treeSha: string;

  @doc("Branch HEAD at capture time (absent on an unborn branch)")
  headSha?: string;

  @doc("Files changed versus the previous checkpoint")
  filesChanged: int32;

  @doc("Lines added versus the previous checkpoint")
  additions: int32;

  @doc("Lines deleted versus the previous checkpoint")
  deletions: int32;
}
