/**
 * ActivityLog Repository Interface (Output Port)
 *
 * Defines the contract for ActivityEntry persistence operations.
 * Implementations handle database-specific logic (SQLite, etc.).
 *
 * Following Clean Architecture:
 * - Domain and Application layers depend on this interface
 * - Infrastructure layer provides concrete implementations
 *
 * NOTE: This is an append-only repository per NFR-8 (audit trail immutability).
 * No update or delete methods are provided.
 */

import type { ActivityEntry } from '../../../../domain/generated/output.js';

/**
 * Repository interface for ActivityEntry persistence (append-only).
 *
 * Implementations must:
 * - Handle database connection management
 * - Provide thread-safe operations
 * - Never allow mutation or deletion of existing entries (NFR-8)
 */
export interface IActivityLogRepository {
  /**
   * Append a new activity entry to the log.
   *
   * @param entry - The activity entry to persist
   */
  create(entry: ActivityEntry): Promise<void>;

  /**
   * List all activity entries for a work item, ordered by creation time ascending.
   *
   * @param workItemId - The work item UUID to scope the query
   * @returns Array of activity entries in chronological order
   */
  listByWorkItem(workItemId: string): Promise<ActivityEntry[]>;
}
