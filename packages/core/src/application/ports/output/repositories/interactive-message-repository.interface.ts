/**
 * Interactive Message Repository Interface
 *
 * Output port for InteractiveMessage persistence operations.
 *
 * Following Clean Architecture:
 * - Domain and Application layers depend on this interface
 * - Infrastructure layer provides the SQLite implementation
 */

import type { InteractiveMessage } from '../../../../domain/generated/output.js';

/**
 * Repository interface for InteractiveMessage entity persistence.
 */
export interface IInteractiveMessageRepository {
  /**
   * Persist a new message record.
   */
  create(message: InteractiveMessage): Promise<void>;

  /**
   * Find all messages for a feature, ordered by created_at ASC.
   * Messages are scoped by featureId (not sessionId) for cross-session continuity.
   *
   * @param featureId - Polymorphic scope key: may be a spec ID, repo ID, or any
   *   future entity that owns an interactive chat. Not a FK to a single table.
   * @param limit - Maximum number of messages to return (default 200)
   */
  findByFeatureId(featureId: string, limit?: number): Promise<InteractiveMessage[]>;

  /**
   * Messages of a scope created strictly after `since`, ordered by created_at ASC.
   * Lets an open chat stream pick up rows written by another process — an
   * agent's `shep chat block` call or an MCP server (spec 137).
   */
  findByFeatureIdSince(featureId: string, since: Date): Promise<InteractiveMessage[]>;

  /**
   * Find all messages for a specific session, ordered by created_at ASC.
   */
  findBySessionId(sessionId: string): Promise<InteractiveMessage[]>;

  /**
   * Delete all messages for a feature. Used for "clear chat" functionality.
   */
  deleteByFeatureId(featureId: string): Promise<void>;
}
