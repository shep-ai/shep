/**
 * @module Shep.Deployment.DevServerRunPlan
 *
 * Defines the DevServerRunPlan entity and RunPlanSource enum for the
 * agentic dev-server flow (spec 103).
 *
 * A DevServerRunPlan is the persisted result of analyzing HOW to run a
 * repository's dev server — the exact command, working directory, package
 * manager, and one-time setup commands. Plans are produced either
 * deterministically (detectDevScript) or by structured agent analysis,
 * and cached per repository path so subsequent starts skip re-analysis.
 *
 * ## Design Notes
 *
 * DevServerRunPlan is deliberately keyed by `repoPath` rather than a UUID:
 * - Plans serve Applications, Feature worktrees, AND bare Repositories —
 *   the three deployment target types share one plan cache per on-disk path.
 * - `repoPath` is therefore NOT a foreign key to any entity.
 *
 * Cache invalidation is hash-driven:
 * - `configHash` — hash of the config-file set that produced the plan;
 *   a mismatch means the plan is stale and analysis must re-run.
 * - `installStampHash` — lockfile/manifest hash stamped after the last
 *   successful dependency install; a mismatch means deps are stale.
 *
 * ## Usage
 *
 * Import this module to work with dev-server run plans:
 *
 * ```typespec
 * import "./dev-server-run-plan.tsp";
 *
 * op getRunPlan(repoPath: string): DevServerRunPlan;
 * ```
 */
import "../common/scalars.tsp";

/**
 * How a DevServerRunPlan was produced.
 *
 * Determines whether the plan came from zero-LLM deterministic detection
 * or from structured agent analysis. Deterministic plans are preferred
 * (faster, free); agent plans handle ambiguous or non-standard repos.
 */
@doc("Sources for dev-server run plan production")
enum RunPlanSource {
  /**
   * Plan produced by deterministic detection (detectDevScript)
   * without any LLM involvement.
   */
  @doc("Plan produced by deterministic detection without an LLM")
  Deterministic,

  /**
   * Plan produced by structured agent analysis of the repository
   * (used when deterministic detection is ambiguous or fails).
   */
  @doc("Plan produced by structured agent analysis")
  Agent,
}

/**
 * A persisted plan describing how to run a repository's dev server.
 *
 * DevServerRunPlan is keyed by `repoPath` (not a UUID) because plans are
 * a per-on-disk-path cache shared by all deployment target types. It
 * captures the spawn command, working directory, package-manager and
 * setup metadata, plus the hashes used for cache/staleness invalidation.
 *
 * @example Deterministic plan:
 * ```json
 * {
 *   "repoPath": "/home/user/my-app",
 *   "source": "Deterministic",
 *   "command": "npm run dev",
 *   "cwd": "/home/user/my-app",
 *   "packageManager": "npm",
 *   "setupCommands": [],
 *   "configHash": "3f7a...",
 *   "createdAt": "2026-07-04T10:00:00Z",
 *   "updatedAt": "2026-07-04T10:00:00Z"
 * }
 * ```
 *
 * @example Agent-produced monorepo plan:
 * ```json
 * {
 *   "repoPath": "/home/user/mono",
 *   "source": "Agent",
 *   "command": "pnpm dev",
 *   "cwd": "/home/user/mono/apps/web",
 *   "packageManager": "pnpm",
 *   "expectedPort": 3000,
 *   "language": "TypeScript",
 *   "framework": "Next.js",
 *   "setupCommands": ["corepack enable pnpm"],
 *   "configHash": "9b2c...",
 *   "installStampHash": "77de...",
 *   "createdAt": "2026-07-04T10:00:00Z",
 *   "updatedAt": "2026-07-04T11:30:00Z"
 * }
 * ```
 */
@doc("Persisted plan describing how to run a repository's dev server, keyed by repository path")
model DevServerRunPlan {
  @doc("Absolute path of the repository/worktree the plan applies to (primary key)")
  repoPath: string;

  @doc("How the plan was produced (Deterministic detection or Agent analysis)")
  source: RunPlanSource;

  @doc("Exact command to spawn the dev server")
  command: string;

  @doc("Working directory for the spawn (may be a subdirectory in monorepos)")
  cwd: string;

  @doc("Package manager for installs (npm/pnpm/yarn/bun); absent for non-package stacks")
  packageManager?: string;

  @doc("Port the server is expected to listen on (verify-node TCP fallback)")
  expectedPort?: int32;

  @doc("Detected primary language (informational/logging)")
  language?: string;

  @doc("Detected framework (informational/logging)")
  framework?: string;

  @doc("Ordered one-time setup commands to run before first start (may be empty)")
  setupCommands: string[];

  @doc("Hash of the config-file set that produced this plan (cache invalidation)")
  configHash: string;

  @doc("Lockfile/manifest hash stamped after the last successful install (staleness)")
  installStampHash?: string;

  @doc("Timestamp when the plan was created")
  @visibility("read")
  createdAt: utcDateTime;

  @doc("Timestamp when the plan was last updated")
  @visibility("read")
  updatedAt: utcDateTime;
}
