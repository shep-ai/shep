/**
 * Comment Repository Interface (Output Port)
 *
 * Defines the contract for Comment entity persistence operations.
 * Implementations handle database-specific logic (SQLite, etc.).
 *
 * Following Clean Architecture:
 * - Domain and Application layers depend on this interface
 * - Infrastructure layer provides concrete implementations
 */

import type { Comment } from '../../../../domain/generated/output.js';

/**
 * Repository interface for Comment entity persistence.
 *
 * Implementations must:
 * - Handle database connection management
 * - Provide thread-safe operations
 * - Exclude soft-deleted comments from queries by default
 * - Support threaded comments via parentId
 */
export interface ICommentRepository {
  /**
   * Create a new comment record.
   *
   * @param comment - The comment to persist
   */
  create(comment: Comment): Promise<void>;

  /**
   * Find a comment by its unique ID (excludes soft-deleted).
   *
   * @param id - The comment UUID
   * @returns The comment or null if not found
   */
  findById(id: string): Promise<Comment | null>;

  /**
   * List all non-deleted comments for a work item, ordered by creation time.
   *
   * @param workItemId - The work item UUID to scope the query
   * @returns Array of comments for the work item
   */
  listByWorkItem(workItemId: string): Promise<Comment[]>;

  /**
   * Update the content of an existing comment.
   *
   * @param id - The comment UUID
   * @param fields - Partial set of updatable fields
   */
  update(id: string, fields: Partial<Pick<Comment, 'content'>>): Promise<void>;

  /**
   * Soft-delete a comment by setting deletedAt timestamp.
   *
   * @param id - The comment UUID to soft-delete
   */
  softDelete(id: string): Promise<void>;
}
