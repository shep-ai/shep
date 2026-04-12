/**
 * CustomProperty Repository Interface (Output Port)
 *
 * Defines the contract for CustomProperty entity persistence operations.
 * Implementations handle database-specific logic (SQLite, etc.).
 *
 * Following Clean Architecture:
 * - Domain and Application layers depend on this interface
 * - Infrastructure layer provides concrete implementations
 */

import type { CustomProperty } from '../../../../domain/generated/output.js';

/**
 * Repository interface for CustomProperty entity persistence.
 *
 * Implementations must:
 * - Handle database connection management
 * - Provide thread-safe operations
 * - Exclude soft-deleted custom properties from queries by default
 */
export interface ICustomPropertyRepository {
  /**
   * Create a new custom property record.
   *
   * @param property - The custom property to persist
   */
  create(property: CustomProperty): Promise<void>;

  /**
   * Find a custom property by its unique ID (excludes soft-deleted).
   *
   * @param id - The custom property UUID
   * @returns The custom property or null if not found
   */
  findById(id: string): Promise<CustomProperty | null>;

  /**
   * List all non-deleted custom properties for a project, ordered by displayOrder.
   *
   * @param projectId - The project UUID to scope the query
   * @returns Array of custom properties ordered by displayOrder ascending
   */
  listByProject(projectId: string): Promise<CustomProperty[]>;

  /**
   * Update mutable fields on an existing custom property.
   *
   * @param id - The custom property UUID
   * @param fields - Partial set of updatable fields
   */
  update(
    id: string,
    fields: Partial<
      Pick<CustomProperty, 'name' | 'propertyType' | 'options' | 'isRequired' | 'displayOrder'>
    >
  ): Promise<void>;

  /**
   * Soft-delete a custom property by setting deletedAt timestamp.
   *
   * @param id - The custom property UUID to soft-delete
   */
  softDelete(id: string): Promise<void>;
}
