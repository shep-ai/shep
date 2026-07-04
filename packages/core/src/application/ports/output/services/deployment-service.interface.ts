/**
 * Deployment Service Interface
 *
 * Output port for managing local dev server deployments.
 * Infrastructure layer provides the concrete DeploymentService implementation
 * backed by an in-memory process registry.
 *
 * Following Clean Architecture:
 * - Application layer depends on this interface
 * - Infrastructure layer provides concrete implementations
 */

import type Database from 'better-sqlite3';
import type { DeploymentState } from '@/domain/generated/output.js';

/** A single log line captured from a deployment's stdout or stderr. */
export interface LogEntry {
  /** Which deployment produced this line. */
  targetId: string;
  /** Which output stream produced this line. */
  stream: 'stdout' | 'stderr';
  /** The line content (without trailing newline). */
  line: string;
  /** Timestamp (ms since epoch) when the line was captured. */
  timestamp: number;
}

/**
 * Explicit run instructions for a deployment, produced by the
 * dev-server-agent graph (or a cached run plan). When provided to start(),
 * the service spawns exactly this command instead of running dev-script
 * detection.
 */
export interface RunPlanOverride {
  /** Full shell command to spawn (executed with shell: true). */
  command: string;
  /** Absolute working directory to spawn the command in. */
  cwd: string;
  /**
   * Extra environment variables merged on top of the scrubbed base env.
   * Applied AFTER the cli-only blocklist scrub, so these always win.
   */
  env?: Record<string, string>;
}

/** Optional behaviour overrides for IDeploymentService.start(). */
export interface StartOptions {
  /** When present, spawn this plan verbatim and skip dev-script detection. */
  runPlan?: RunPlanOverride;
}

/** Status snapshot returned by getStatus(). */
export interface DeploymentStatus {
  /** Current lifecycle state of the deployment. */
  state: DeploymentState;
  /** Detected URL when the dev server is Ready, null while Booting. */
  url: string | null;
}

/** Status snapshot including the target identifier, returned by listAll(). */
export interface DeploymentStatusEntry extends DeploymentStatus {
  /** Unique identifier for the deployment target (featureId or repositoryPath). */
  targetId: string;
  /** Type of target ('feature' or 'repository'). */
  targetType: string;
}

/**
 * Port interface for managing local dev server deployments.
 *
 * Implementations must:
 * - Maintain an in-memory registry of active deployments keyed by targetId
 * - Enforce one deployment per target (stop existing before starting new)
 * - Detect the dev script from package.json and spawn via the correct package manager
 * - Parse stdout/stderr for port/URL detection
 * - Support graceful shutdown (SIGTERM → SIGKILL) for individual and bulk stops
 */
export interface IDeploymentService {
  /**
   * Inject the database connection for persistence.
   * Must be called before start/stop/getStatus to enable DB persistence.
   */
  setDatabase(db: Database.Database): void;

  /**
   * Recover dev servers from the database on startup.
   * Validates each PID is still alive; removes dead rows.
   */
  recoverAll(): void;

  /**
   * Start a dev server deployment for the given target.
   * If a deployment already exists for this targetId, it is stopped first
   * (transient Analyzing/Installing entries are simply replaced).
   *
   * When `options.runPlan` is provided, the service spawns exactly that
   * command in that cwd (shell: true, scrubbed env + runPlan.env overrides)
   * and never runs dev-script detection. Without a runPlan the dev script is
   * detected from package.json as before. start() never installs
   * dependencies — installation is the dev-server-agent graph's job.
   *
   * @param targetId - Unique identifier for the deployment target (featureId or repositoryId)
   * @param targetPath - Absolute filesystem path to the directory to run the dev server in
   * @param targetType - Type of target ('feature' or 'repository')
   * @param options - Optional overrides (e.g. an explicit run plan)
   * @throws Error if no dev script is found in package.json or the process fails to spawn
   */
  start(targetId: string, targetPath: string, targetType?: string, options?: StartOptions): void;

  /**
   * Surface an externally-driven pre-spawn state (Analyzing / Installing)
   * for a target so getStatus()/listAll() (and thus polling/SSE consumers)
   * can show progress before any process exists.
   *
   * Transient entries are in-memory ONLY and are NEVER persisted to the
   * dev_servers table — same rationale as Booting: a child shep instance
   * sharing the global DB must not see (and kill) them during recovery.
   *
   * Clearing rules:
   * - A subsequent start() for the same targetId replaces the transient entry.
   * - stop() on a transient entry just removes it (there is no process to kill).
   * - A subsequent setTransientState() call replaces the previous transient state.
   *
   * @param targetId - Unique identifier for the deployment target
   * @param targetPath - Absolute filesystem path of the target
   * @param targetType - Type of target ('feature' or 'repository')
   * @param state - The pre-spawn lifecycle state to surface
   */
  setTransientState(
    targetId: string,
    targetPath: string,
    targetType: string,
    state: DeploymentState.Analyzing | DeploymentState.Installing
  ): void;

  /**
   * Stop a running deployment gracefully.
   * Sends SIGTERM to the process group, then SIGKILL after a timeout.
   * No-op if no deployment exists for this targetId.
   *
   * @param targetId - Unique identifier for the deployment target
   */
  stop(targetId: string): Promise<void>;

  /**
   * Get the current deployment status for a target.
   *
   * @param targetId - Unique identifier for the deployment target
   * @returns Status snapshot with state and url, or null if no deployment exists
   */
  getStatus(targetId: string): DeploymentStatus | null;

  /**
   * List all currently tracked deployments (both in-memory and persisted in DB)
   * that have a live process. Dead deployments are cleaned up as a side effect.
   *
   * Used by ListDeploymentsUseCase for bulk hydration on page load and
   * shared-state synchronization across client components.
   *
   * @returns Array of status entries keyed by targetId (never null; empty when no deployments)
   */
  listAll(): DeploymentStatusEntry[];

  /**
   * Force-stop all tracked deployments immediately.
   * Called during daemon shutdown to prevent orphaned dev server processes.
   */
  stopAll(): void;

  // --- Log accumulation ---

  /**
   * Append a synthetic log line to a target's log buffer and emit it on the
   * 'log' event so live consumers (SSE route) stream it immediately.
   *
   * Used by the dev-server-agent graph to surface its own progress
   * (analysis, install, remediation) alongside real process output. The
   * entry is recorded with stream 'stdout' and the current timestamp.
   *
   * When the target's entry is already gone because its process exited
   * (e.g. the agent graph reporting a failure after a crash), the line is
   * appended to the target's retained post-mortem trail instead. No-op for
   * never-tracked targets — synthetic lines never create a trail on their
   * own.
   *
   * @param targetId - Unique identifier for the deployment target
   * @param line - The log line content (without trailing newline)
   */
  appendLog(targetId: string, line: string): void;

  /**
   * Get the accumulated log buffer for a deployment.
   *
   * After a spontaneous process exit or a failed dev-server-agent run the
   * retained post-mortem trail is returned until a new lifecycle for the
   * target begins (next start/setTransientState) or the trail is dismissed
   * (explicit stop of a live entry, stopAll).
   *
   * @param targetId - Unique identifier for the deployment target
   * @returns Array of log entries in chronological order, or null if the target is untracked
   */
  getLogs(targetId: string): LogEntry[] | null;

  /**
   * Subscribe to real-time log events from all deployments.
   *
   * @param event - Event name (only 'log' is supported)
   * @param handler - Callback invoked with each new log entry
   */
  on(event: 'log', handler: (entry: LogEntry) => void): void;

  /**
   * Unsubscribe from real-time log events.
   *
   * @param event - Event name (only 'log' is supported)
   * @param handler - The same callback reference passed to on()
   */
  off(event: 'log', handler: (entry: LogEntry) => void): void;
}
