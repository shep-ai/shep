/**
 * Label Repository Interface (Output Port)
 *
 * Defines the contract for Label entity persistence operations.
 * Implementations handle database-specific logic (SQLite, etc.).
 *
 * Following Clean Architecture:
 * - Domain and Application layers depend on this interface
 * - Infrastructure layer provides concrete implementations
 */

import type { Label } from '../../../../domain/generated/output.js';

/**
 * Repository interface for Label entity persistence.
 *
 * Implementations must:
 * - Handle database connection management
 * - Provide thread-safe operations
 * - Exclude soft-deleted labels from queries by default
 */
export interface ILabelRepository {
  /**
   * Create a new label record.
   *
   * @param label - The label to persist
   */
  create(label: Label): Promise<void>;

  /**
   * Find a label by its unique ID (excludes soft-deleted).
   *
   * @param id - The label UUID
   * @returns The label or null if not found
   */
  findById(id: string): Promise<Label | null>;

  /**
   * List all non-deleted labels for a project.
   *
   * @param projectId - The project UUID to scope the query
   * @returns Array of labels for the project
   */
  listByProject(projectId: string): Promise<Label[]>;

  /**
   * Update mutable fields on an existing label.
   *
   * @param id - The label UUID
   * @param fields - Partial set of updatable fields
   */
  update(id: string, fields: Partial<Pick<Label, 'name' | 'color' | 'parentId'>>): Promise<void>;

  /**
   * Soft-delete a label by setting deletedAt timestamp.
   *
   * @param id - The label UUID to soft-delete
   */
  softDelete(id: string): Promise<void>;
}
