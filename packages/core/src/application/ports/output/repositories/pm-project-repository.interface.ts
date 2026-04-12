/**
 * PmProject Repository Interface (Output Port)
 *
 * Defines the contract for PmProject entity persistence operations.
 * Implementations handle database-specific logic (SQLite, etc.).
 *
 * Following Clean Architecture:
 * - Domain and Application layers depend on this interface
 * - Infrastructure layer provides concrete implementations
 */

import type { PmProject } from '../../../../domain/generated/output.js';

/**
 * Repository interface for PmProject entity persistence.
 *
 * Implementations must:
 * - Handle database connection management
 * - Provide thread-safe operations
 * - Support query by slug and identifier prefix for uniqueness
 * - Exclude soft-deleted projects from queries by default
 */
export interface IPmProjectRepository {
  /**
   * Create a new project record.
   *
   * @param project - The project to persist
   */
  create(project: PmProject): Promise<void>;

  /**
   * Find a project by its unique ID (excludes soft-deleted).
   *
   * @param id - The project UUID
   * @returns The project or null if not found
   */
  findById(id: string): Promise<PmProject | null>;

  /**
   * Find a project by its URL-friendly slug (excludes soft-deleted).
   *
   * @param slug - The project slug
   * @returns The project or null if not found
   */
  findBySlug(slug: string): Promise<PmProject | null>;

  /**
   * Find a project by its work item identifier prefix (excludes soft-deleted).
   *
   * @param prefix - The identifier prefix (e.g., 'PROJ')
   * @returns The project or null if not found
   */
  findByIdentifierPrefix(prefix: string): Promise<PmProject | null>;

  /**
   * List all non-deleted projects.
   *
   * @returns Array of all active projects
   */
  list(): Promise<PmProject[]>;

  /**
   * Update mutable fields on an existing project.
   *
   * @param id - The project UUID
   * @param fields - Partial set of updatable fields
   */
  update(
    id: string,
    fields: Partial<
      Pick<
        PmProject,
        | 'name'
        | 'slug'
        | 'description'
        | 'estimateType'
        | 'startDate'
        | 'endDate'
        | 'featureToggles'
      >
    >
  ): Promise<void>;

  /**
   * Soft-delete a project by setting deletedAt timestamp.
   *
   * @param id - The project UUID to soft-delete
   */
  softDelete(id: string): Promise<void>;

  /**
   * Atomically increment the work item counter and return the new value.
   * Used for generating sequential work item identifiers (e.g., PROJ-42).
   *
   * @param projectId - The project UUID
   * @returns The new counter value after increment
   */
  incrementWorkItemCounter(projectId: string): Promise<number>;
}
