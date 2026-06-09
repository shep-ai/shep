/**
 * Security Event Repository Interface
 *
 * Output port for SecurityEvent persistence operations.
 * Implementations handle database-specific logic (SQLite, etc.).
 *
 * Following Clean Architecture:
 * - Domain and Application layers depend on this interface
 * - Infrastructure layer provides concrete implementations
 */

import type { SecurityEvent, SecuritySeverity } from '../../../../domain/generated/output.js';

/**
 * Options for querying security events.
 */
export interface SecurityEventQueryOptions {
  /** Maximum number of events to return */
  limit?: number;
  /** Number of events to skip (for pagination) */
  offset?: number;
  /** Filter by minimum severity level */
  severity?: SecuritySeverity;
}

/**
 * Repository interface for SecurityEvent entity persistence.
 *
 * Implementations must:
 * - Handle database connection management
 * - Provide thread-safe operations (SQLite WAL handles concurrency)
 * - Support repository-scoped and feature-scoped queries
 * - Use parameterized queries for all SQL operations
 */
export interface ISecurityEventRepository {
  /**
   * Persist a new security event.
   *
   * @param event - The security event to persist
   */
  save(event: SecurityEvent): Promise<void>;

  /**
   * Find security events for a given repository path.
   *
   * Results are ordered by created_at DESC (most recent first).
   *
   * @param repositoryPath - Absolute path to the repository
   * @param options - Optional query filters and pagination
   * @returns Array of matching security events
   */
  findByRepository(
    repositoryPath: string,
    options?: SecurityEventQueryOptions
  ): Promise<SecurityEvent[]>;

  /**
   * Find security events for a given feature run.
   *
   * Results are ordered by created_at DESC (most recent first).
   *
   * @param featureId - The feature ID to filter by
   * @param options - Optional query filters and pagination
   * @returns Array of matching security events
   */
  findByFeature(featureId: string, options?: SecurityEventQueryOptions): Promise<SecurityEvent[]>;

  /**
   * Delete security events older than the given date.
   *
   * Used for 90-day retention cleanup.
   *
   * @param date - Events created before this date will be deleted
   * @returns Number of events deleted
   */
  deleteOlderThan(date: Date): Promise<number>;

  /**
   * Count security events for a given repository path.
   *
   * @param repositoryPath - Absolute path to the repository
   * @returns Total count of security events
   */
  count(repositoryPath: string): Promise<number>;
}
