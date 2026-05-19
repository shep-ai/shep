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
