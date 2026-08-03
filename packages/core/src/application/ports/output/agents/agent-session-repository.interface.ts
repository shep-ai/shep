/**
 * Agent Session Repository Interface
 *
 * Output port for reading agent provider CLI sessions.
 * Implementations handle provider-specific storage formats
 * (e.g. JSONL files for Claude Code).
 *
 * Following Clean Architecture:
 * - Application layer defines this interface
 * - Infrastructure layer provides concrete implementations
 */

import type { AgentSession } from '../../../../domain/generated/output.js';

/**
 * Options for listing agent sessions.
 */
export interface ListSessionsOptions {
  /** Maximum number of sessions to return (default 20, 0 = all) */
  limit?: number;
  /** Filter sessions by project path (absolute path, matched against session cwd) */
  projectPath?: string;
  /**
   * When true, also collect sessions recorded inside worktrees of the given
   * `projectPath` — both sibling provider directories sharing the project's
   * encoded prefix and shep's own `~/.shep/repos/<hash>` worktree directories.
   *
   * Only meaningful alongside `projectPath`. Defaults to false so existing
   * callers keep their current behaviour.
   */
  includeWorktrees?: boolean;
}

/**
 * Options for fetching a single agent session.
 */
export interface GetSessionOptions {
  /** Maximum number of messages to include (default 20, 0 = all) */
  messageLimit?: number;
}

/**
 * Repository interface for reading agent provider CLI sessions.
 *
 * Implementations must:
 * - Read sessions from provider-specific local storage
 * - Sort results by last-modified time descending
 * - Handle malformed files gracefully (skip with debug log)
 * - Accept injectable base path for testability
 */
export interface IAgentSessionRepository {
  /**
   * List sessions sorted by last-modified time descending.
   *
   * @param options - Listing options (limit, etc.)
   * @returns Array of sessions (empty array for unsupported providers)
   */
  list(options?: ListSessionsOptions): Promise<AgentSession[]>;

  /**
   * Find a session by its provider-native ID.
   *
   * @param id - The session ID (filename without extension for Claude Code)
   * @param options - Options controlling message inclusion
   * @returns The session with messages populated, or null if not found
   */
  findById(id: string, options?: GetSessionOptions): Promise<AgentSession | null>;

  /**
   * Whether this repository has a real implementation for its provider.
   * Returns false for stub implementations (Cursor, Gemini).
   * Used by use cases to emit a warning and return empty results.
   */
  isSupported(): boolean;
}
