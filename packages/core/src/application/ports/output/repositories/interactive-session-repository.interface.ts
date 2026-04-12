/**
 * Interactive Session Repository Interface
 *
 * Output port for InteractiveSession persistence operations.
 *
 * Following Clean Architecture:
 * - Domain and Application layers depend on this interface
 * - Infrastructure layer provides the SQLite implementation
 */

import type {
  InteractiveSession,
  InteractiveSessionStatus,
} from '../../../../domain/generated/output.js';

/**
 * Repository interface for InteractiveSession entity persistence.
 */
export interface IInteractiveSessionRepository {
  /**
   * Create a new interactive session record.
   */
  create(session: InteractiveSession): Promise<void>;

  /**
   * Find a session by its unique ID.
   */
  findById(id: string): Promise<InteractiveSession | null>;

  /**
   * Find the most recent session for a given feature.
   *
   * @param featureId - Polymorphic scope key: may be a spec ID, repo ID, or any
   *   future entity that owns an interactive chat. Not a FK to a single table.
   */
  findByFeatureId(featureId: string): Promise<InteractiveSession | null>;

  /**
   * Find all sessions with status 'booting' or 'ready'.
   * Used for concurrent session cap enforcement and zombie cleanup.
   */
  findAllActive(): Promise<InteractiveSession[]>;

  /**
   * Update session status and optionally set stoppedAt.
   */
  updateStatus(id: string, status: InteractiveSessionStatus, stoppedAt?: Date): Promise<void>;

  /**
   * Update the lastActivityAt timestamp for a session.
   */
  updateLastActivity(id: string, lastActivityAt: Date): Promise<void>;

  /**
   * Mark all sessions with status 'booting' or 'ready' as 'stopped'.
   * Called on server startup to clean up zombie sessions from prior restart.
   */
  markAllActiveStopped(): Promise<void>;

  /**
   * Count sessions with status 'booting' or 'ready'.
   * Used to enforce the concurrent session cap.
   */
  countActiveSessions(): Promise<number>;

  /**
   * Persist the agent SDK session ID for resumption across service restarts.
   * Agent-agnostic: works with Claude, Cursor, Codex, or any future agent.
   */
  updateAgentSessionId(id: string, agentSessionId: string): Promise<void>;

  /**
   * Retrieve the agent SDK session ID for a given session.
   */
  getAgentSessionId(id: string): Promise<string | null>;

  /**
   * Return the most recent non-null `agent_session_id` across ALL
   * sessions for this feature, regardless of status. Used by the
   * session service to resume the same agent conversation across
   * reboots — even when an intervening boot failed (so the latest
   * session row has no agentSessionId), the last known good
   * agentSessionId is still found and reused.
   *
   * Returns `null` if no session for the feature has ever captured
   * an agentSessionId (e.g. brand new feature, first boot, or every
   * boot has failed before the agent reported its sessionId).
   */
  findLatestAgentSessionIdForFeature(featureId: string): Promise<string | null>;

  /**
   * Update the turn status for a session.
   * Values: 'idle' | 'processing' | 'unread'
   */
  updateTurnStatus(id: string, turnStatus: string): Promise<void>;

  /**
   * Get turn statuses for multiple feature IDs in a single query.
   * Returns a map of featureId → turnStatus for features that have an active session.
   */
  getTurnStatuses(featureIds: string[]): Promise<Map<string, string>>;

  /**
   * Get ALL non-idle turn statuses across all active sessions.
   * Returns a map of featureId → turnStatus (only 'processing' | 'unread' entries).
   */
  getAllActiveTurnStatuses(): Promise<Map<string, string>>;

  /**
   * Accumulate usage from a completed turn onto the session totals.
   * All values are ADDED to the existing totals (not replaced).
   */
  accumulateUsage(
    id: string,
    usage: { costUsd: number; inputTokens: number; outputTokens: number; turns: number }
  ): Promise<void>;

  /**
   * Get cumulative usage for a session.
   */
  getUsage(id: string): Promise<{
    totalCostUsd: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTurns: number;
  } | null>;
}
