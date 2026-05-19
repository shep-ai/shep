/**
 * @module Shep.Domain.ValueObjects.Bedrock
 *
 * Defines value objects for the project-bedrock integration:
 *
 * - BedrockLifecycleAction: the typed set of subcommand actions exposed
 *   through `IBedrockIntegrationService` (init, sync, ship). `doctor`
 *   is kept separate because its return shape differs structurally.
 * - BedrockTierStatus: per-prerequisite-tier health record returned by
 *   doctor() for python, pipx, and the bedrock binary.
 * - BedrockHealth: aggregate health record covering all three tiers
 *   plus the rolled-up overall status.
 *
 * These are value objects (not entities) — they do NOT extend BaseEntity
 * and have no independent identity.
 */
/**
 * Lifecycle action exposed through IBedrockIntegrationService.
 *
 * Each value maps 1:1 to a `bedrock` CLI subcommand that the application
 * port can dispatch. doctor() is not included here — it has a typed
 * BedrockHealth return shape rather than a stdout-based result.
 */
@doc("Lifecycle action dispatched to the project-bedrock CLI")
enum BedrockLifecycleAction {
  @doc("Bootstrap bedrock memory in the current worktree")
  Init: "init",

  @doc("Reconcile bedrock memory with the git working tree")
  Sync: "sync",

  @doc("Commit pending bedrock memory updates to git")
  Ship: "ship",
}

/**
 * Per-tier prerequisite health status.
 *
 * Returned for each of python, pipx, and the bedrock binary by the
 * three-tier doctor() check.
 */
@doc("Health status for a single bedrock prerequisite tier")
model BedrockTierStatus {
  @doc("Name of the tier being checked (e.g. python, pipx, bedrock)")
  tier: string;

  @doc("Status of this tier: ok, missing, or error")
  status: "ok" | "missing" | "error";

  @doc("Optional human-readable detail (e.g. detected version)")
  detail?: string;

  @doc("Optional remediation hint shown to the user when status is missing or error")
  remediation?: string;
}

/**
 * Aggregate bedrock prerequisite health.
 *
 * Returned by IBedrockIntegrationService.doctor(). The overall field is
 * the rolled-up status: ok only when every tier is ok; otherwise it
 * mirrors the worst tier (error wins over missing).
 */
@doc("Aggregate health report for the bedrock prerequisite chain")
model BedrockHealth {
  @doc("Health of the Python interpreter prerequisite")
  python: BedrockTierStatus;

  @doc("Health of the pipx package manager prerequisite")
  pipx: BedrockTierStatus;

  @doc("Health of the bedrock binary prerequisite")
  bedrock: BedrockTierStatus;

  @doc("Rolled-up overall status across all three tiers")
  overall: "ok" | "missing" | "error";
}

/**
 * Kind of shep entity that can opt in to project-bedrock memory.
 *
 * Used by EnableBedrockForTargetUseCase and the web visualization
 * to identify which entity owns a bedrock memory store. Each kind
 * resolves to a different repository port and persistence column:
 *
 *  - Application -> IApplicationRepository.bedrockEnabled
 *  - Repository  -> IRepositoryRepository.bedrockEnabled
 *  - Feature     -> IFeatureRepository.bedrockEnabled
 */
@doc("Kind of shep entity owning a bedrock memory store")
enum BedrockTargetKind {
  @doc("A Lovable-style persistent Application workspace")
  Application: "application",

  @doc("A tracked code Repository")
  Repository: "repository",

  @doc("A Feature run executing inside a worktree")
  Feature: "feature",
}

/**
 * Reference to a bedrock-capable target.
 *
 * Resolved by a use case into a concrete absolute filesystem path
 * (the cwd passed to IBedrockIntegrationService) and a persistence
 * write of the bedrockEnabled flag on the owning entity.
 */
@doc("Typed reference to a bedrock-capable entity (kind + id)")
model BedrockTargetRef {
  @doc("Which kind of entity owns the bedrock memory")
  kind: BedrockTargetKind;

  @doc("Identifier of the owning entity (Application.id, Repository.id, or Feature.id)")
  id: string;
}

/**
 * Metadata describing a single markdown file inside the bedrock
 * memory store at the target's worktree.
 *
 * Captured by IBedrockMemoryReader for the visualization panel —
 * sizes and mtimes power the freshness indicators; preview is the
 * first ~200 characters of the file (UTF-8) for tooltip rendering.
 */
@doc("One file in the bedrock memory store")
model BedrockMemoryFile {
  @doc("Path of the file relative to the target's worktree (forward slashes)")
  path: string;

  @doc("File size in bytes")
  sizeBytes: int64;

  @doc("UTC timestamp of the most recent on-disk modification")
  modifiedAt: utcDateTime;

  @doc("Optional short UTF-8 preview of the file contents (truncated)")
  preview?: string;
}

/**
 * Snapshot of the bedrock memory store at a single worktree.
 *
 * Returned by GetBedrockMemorySnapshotUseCase and rendered by the
 * BedrockMemoryPanel web component so users can SEE what bedrock
 * is tracking — not just whether it is enabled. When `.bedrock/`
 * is absent on disk, `present` is false and `files` is empty even
 * if the owning entity's bedrockEnabled flag is true (drift).
 */
@doc("Snapshot of the on-disk bedrock memory store at a target worktree")
model BedrockMemorySnapshot {
  @doc("Absolute path to the worktree that was probed")
  cwd: string;

  @doc("Whether a `.bedrock/` directory exists at cwd")
  present: boolean;

  @doc("All bedrock memory files discovered at cwd")
  files: BedrockMemoryFile[];

  @doc("Total size in bytes of all bedrock memory files combined")
  totalBytes: int64;

  @doc("UTC timestamp of the most recently modified bedrock memory file (if any)")
  mostRecentlyModifiedAt?: utcDateTime;
}
