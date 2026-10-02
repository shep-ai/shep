/**
 * @module Shep.Domain.Entities.Harness.State
 *
 * Canonical, addressable state of the query-aware agent harness (spec 119):
 * sessions, tasks, repository snapshots and the append-only event log.
 *
 * The transcript is never the state. A model call sees a temporary projection
 * of these records, recorded as a ContextPlan.
 */
import "../../../common/base.tsp";
import "../../../common/enums/harness.tsp";

@doc("Cost, time and token limits for one harness task")
model HarnessBudget {
  @doc("Maximum spend in USD for the task (unset: no limit)")
  maxUsd?: float64;

  @doc("Maximum wall time in milliseconds (unset: the caller's timeout)")
  maxWallTimeMs?: int32;

  @doc("Maximum input tokens per model call")
  maxInputTokens?: int32;

  @doc("Maximum output tokens per model call")
  maxOutputTokens?: int32;

  @doc("Budget mode controlling quality/cost trade-offs")
  quality: HarnessBudgetMode;
}

/**
 * HarnessSession — a grouping of harness tasks. A feature run owns exactly one
 * session (keyed by agentRunId); a standalone task or eval case gets its own.
 */
@doc("A logical harness work session (a feature run, a standalone task, or an eval case)")
model HarnessSession extends BaseEntity {
  @doc("Lifecycle status of the session")
  status: HarnessSessionStatus;

  @doc("Where the session came from")
  origin: HarnessSessionOrigin;

  @doc("Context-assembly mode used by the session")
  mode: HarnessMode;

  @doc("Repository root (or worktree) the session operates in")
  repoRoot: string;

  @doc("Human-readable goal of the session")
  title: string;

  @doc("Agent run this session belongs to (feature sessions)")
  agentRunId?: string;

  @doc("Feature this session belongs to (feature sessions)")
  featureId?: string;

  @doc("Original repository path when the session runs in a dedicated worktree")
  sourceRepoPath?: string;

  @doc("Dedicated worktree path of a standalone session")
  worktreePath?: string;

  @doc("Branch of the dedicated worktree of a standalone session")
  worktreeBranch?: string;

  @doc("Root task of the session")
  rootTaskId?: string;

  @doc("Model id used by the session")
  modelId?: string;

  @doc("Whether shadow context planning is on for this session")
  shadowContext: boolean;

  @doc("Commit a standalone session's worktree started from (the base of its patch)")
  baseCommit?: string;

  @doc("When a person asked to stop the session; the running task stops before its next turn")
  stopRequestedAt?: utcDateTime;
}

/**
 * HarnessTask — the canonical unit of work. In a feature run every executor
 * call (one SDLC phase or implement sub-phase) is one task.
 */
@doc("The canonical unit of harness work")
model HarnessTask extends BaseEntity {
  @doc("Owning session")
  sessionId: string;

  @doc("Parent task, for child tasks")
  parentTaskId?: string;

  @doc("Goal as given by the caller")
  goal: string;

  @doc("Normalized goal used for fingerprints and dedupe")
  normalizedGoal: string;

  @doc("Read-only, write or side-effect task")
  type: HarnessTaskType;

  @doc("Lifecycle status")
  status: HarnessTaskStatus;

  @doc("SDLC phase label when the task is a feature-node call (e.g. implement:phase-2)")
  phase?: string;

  @doc("Repository snapshot the task started from")
  repoSnapshotId?: string;

  @doc("Budget for the task")
  budget: HarnessBudget;

  @doc("Stable dedupe key over normalized goal, scope, snapshot and type")
  dedupeKey: string;

  @doc("Monotonic state version, bumped whenever task state that feeds context changes")
  stateVersion: int32;

  @doc("Number of model calls made so far")
  turnCount: int32;

  @doc("Structured result once completed or failed")
  result?: HarnessTaskResult;

  @doc("Failure reason when status is failed")
  failureReason?: string;

  @doc("OS process running the task; lets a stop cancel a task whose process has exited")
  ownerPid?: int32;
}

@doc("A reference to repository evidence bound to a snapshot or content hash")
model HarnessEvidenceRef {
  @doc("Repository-relative path or resource identifier")
  resource: string;

  @doc("Snapshot the evidence refers to")
  repoSnapshotId?: string;

  @doc("First line of the referenced range")
  startLine?: int32;

  @doc("Last line of the referenced range")
  endLine?: int32;

  @doc("Content hash of the referenced content")
  contentHash?: string;
}

@doc("Structured result of a harness task, returned instead of a transcript")
model HarnessTaskResult {
  @doc("Outcome")
  status: HarnessTaskOutcome;

  @doc("Short summary of what was done")
  summary: string;

  @doc("Evidence supporting the result")
  evidence: HarnessEvidenceRef[];

  @doc("Chunks produced by the task")
  producedChunkIds: string[];

  @doc("Blob reference of the produced patch, if any")
  patchRef?: string;

  @doc("Chunks holding test results")
  testResultChunkIds?: string[];

  @doc("Self-reported confidence between 0 and 1")
  confidence?: float64;
}

@doc("An immutable fingerprint of a repository working tree")
model RepoSnapshot extends BaseEntity {
  @doc("Owning session")
  sessionId: string;

  @doc("Repository root")
  root: string;

  @doc("HEAD commit, if the root is a git repository")
  gitCommit?: string;

  @doc("Hash over tracked and untracked non-ignored file contents")
  workingTreeHash: string;

  @doc("Hash of the staged diff")
  stagedDiffHash?: string;

  @doc("Hash of the unstaged diff")
  unstagedDiffHash?: string;

  @doc("Blob reference of the per-file hash map, used to compute drift")
  fileHashesRef?: string;

  @doc("Number of files in the snapshot")
  fileCount: int32;
}

@doc("An append-only harness event; sequence is monotonic within a session")
model HarnessEvent extends BaseEntity {
  @doc("Owning session")
  sessionId: string;

  @doc("Task the event concerns")
  taskId?: string;

  @doc("Monotonic sequence number within the session")
  sequence: int32;

  @doc("Event type")
  type: HarnessEventType;

  @doc("Small JSON payload (larger payloads live in payloadRef)")
  payload: Record<unknown>;

  @doc("Blob reference for payloads larger than the inline limit")
  payloadRef?: string;
}
