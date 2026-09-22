/**
 * Agent Run Repository Interface
 *
 * Output port for AgentRun persistence operations.
 * Implementations handle database-specific logic (SQLite, etc.).
 *
 * Following Clean Architecture:
 * - Domain and Application layers depend on this interface
 * - Infrastructure layer provides concrete implementations
 */

import type { AgentRun, AgentRunStatus } from '../../../../domain/generated/output.js';

export interface AgentRunPinnedConfigUpdate {
  agentType: AgentRun['agentType'];
  modelId?: AgentRun['modelId'];
  updatedAt: AgentRun['updatedAt'];
}

/**
 * Repository interface for AgentRun entity persistence.
 *
 * Implementations must:
 * - Handle database connection management
 * - Provide thread-safe operations
 * - Support query by thread ID and PID for crash recovery
 */
/**
 * Conditions a status transition must satisfy at the moment of the write.
 *
 * A transition decided from an earlier read is a race: the daemon's crash
 * sweep reads `running`, asks the OS whether the PID is alive, and by then the
 * worker has written `completed` and exited — the normal path. Without a guard
 * the sweep overwrites a successful run with "crashed".
 *
 * Deliberately opt-in rather than a blanket "never leave a terminal status".
 * Resuming an interrupted run is a legitimate terminal-to-running transition
 * (ResumeFeatureUseCase, and approve/reject of a waiting run), and a default
 * guard would refuse it while a live agent kept working.
 */
export interface AgentRunStatusUpdateOptions {
  /** Apply the update only while the run is in one of these statuses. */
  allowedFrom?: readonly AgentRunStatus[];
}

/**
 * Fields a status transition may write alongside the status.
 *
 * `pid` additionally accepts `null` to clear a previous worker's PID in the
 * same statement as the transition — a resume that claims a waiting run must
 * not leave the dead worker's PID where Stop would signal it. `undefined`
 * leaves any field unchanged.
 */
export type AgentRunStatusUpdates = Omit<Partial<AgentRun>, 'pid'> & { pid?: number | null };

export interface IAgentRunRepository {
  /**
   * Create a new agent run record.
   *
   * @param agentRun - The agent run to persist
   */
  create(agentRun: AgentRun): Promise<void>;

  /**
   * Find an agent run by its unique ID.
   *
   * @param id - The agent run ID
   * @returns The agent run or null if not found
   */
  findById(id: string): Promise<AgentRun | null>;

  /**
   * Batch-fetch multiple agent runs by id. Used by the SSE poll loop and
   * the dashboard SSR layout to replace per-feature `findById` calls
   * (kills the N+1 query pattern). Empty input returns `[]` without
   * touching the database. Missing ids are silently dropped.
   *
   * @param ids - Agent run IDs to fetch
   * @returns Array of matching agent runs (length <= ids.length)
   */
  findByIds(ids: readonly string[]): Promise<AgentRun[]>;

  /**
   * Find an agent run by its LangGraph thread ID.
   *
   * @param threadId - The LangGraph thread ID
   * @returns The agent run or null if not found
   */
  findByThreadId(threadId: string): Promise<AgentRun | null>;

  /**
   * Find the most recently created agent run for a feature, or null if the
   * feature has no runs. Used to resolve the run a WhatsApp HITL reply
   * (approve/reject) should act on (spec 101).
   *
   * @param featureId - The feature id
   * @returns The latest agent run for the feature, or null
   */
  findLatestByFeatureId(featureId: string): Promise<AgentRun | null>;

  /**
   * Update agent run status with optional additional field updates.
   *
   * @param id - The agent run ID
   * @param status - The new status
   * @param updates - Optional additional fields to update
   * @param options - Optional state guard; see {@link AgentRunStatusUpdateOptions}
   * @returns True when a row was actually updated. A guarded write that lost
   *   the race returns false instead of silently doing nothing.
   */
  updateStatus(
    id: string,
    status: AgentRunStatus,
    updates?: AgentRunStatusUpdates,
    options?: AgentRunStatusUpdateOptions
  ): Promise<boolean>;

  /**
   * Update the pinned executor config for an existing run.
   *
   * @param id - The agent run ID
   * @param updates - The pinned config fields to persist
   */
  updatePinnedConfig(id: string, updates: AgentRunPinnedConfigUpdate): Promise<void>;

  /**
   * Find all running agent runs for a given process ID.
   * Used for crash recovery to detect orphaned processes.
   *
   * @param pid - The process ID to search for
   * @returns Array of running agent runs with the given PID
   */
  findRunningByPid(pid: number): Promise<AgentRun[]>;

  /**
   * List all agent runs.
   *
   * @returns Array of all agent runs
   */
  list(): Promise<AgentRun[]>;

  /**
   * Delete an agent run by ID.
   *
   * @param id - The agent run ID to delete
   */
  delete(id: string): Promise<void>;
}
