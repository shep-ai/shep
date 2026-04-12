/**
 * SavedView Repository Interface (Output Port)
 *
 * Defines the contract for SavedView entity persistence operations.
 * Implementations handle database-specific logic (SQLite, etc.).
 *
 * Following Clean Architecture:
 * - Domain and Application layers depend on this interface
 * - Infrastructure layer provides concrete implementations
 */

import type { SavedView } from '../../../../domain/generated/output.js';

/**
 * Repository interface for SavedView entity persistence.
 *
 * Implementations must:
 * - Handle database connection management
 * - Provide thread-safe operations
 * - Exclude soft-deleted views from queries by default
 */
export interface ISavedViewRepository {
  /**
   * Create a new saved view record.
   *
   * @param view - The saved view to persist
   */
  create(view: SavedView): Promise<void>;

  /**
   * Find a saved view by its unique ID (excludes soft-deleted).
   *
   * @param id - The saved view UUID
   * @returns The saved view or null if not found
   */
  findById(id: string): Promise<SavedView | null>;

  /**
   * List all non-deleted saved views for a project.
   *
   * @param projectId - The project UUID to scope the query
   * @returns Array of saved views for the project
   */
  listByProject(projectId: string): Promise<SavedView[]>;

  /**
   * Update mutable fields on an existing saved view.
   *
   * @param id - The saved view UUID
   * @param fields - Partial set of updatable fields
   */
  update(
    id: string,
    fields: Partial<
      Pick<SavedView, 'name' | 'description' | 'isPublic' | 'layout' | 'configuration'>
    >
  ): Promise<void>;

  /**
   * Soft-delete a saved view by setting deletedAt timestamp.
   *
   * @param id - The saved view UUID to soft-delete
   */
  softDelete(id: string): Promise<void>;
}
