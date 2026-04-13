/**
 * Plugin Repository Interface
 *
 * Output port for Plugin persistence operations.
 * Implementations handle database-specific logic (SQLite, etc.).
 *
 * Following Clean Architecture:
 * - Domain and Application layers depend on this interface
 * - Infrastructure layer provides concrete implementations
 */

import type { Plugin } from '../../../../domain/generated/output.js';

/**
 * Repository interface for Plugin entity persistence.
 *
 * Implementations must:
 * - Handle database connection management
 * - Provide thread-safe operations
 * - Enforce unique plugin names
 */
export interface IPluginRepository {
  /**
   * Create a new plugin record.
   *
   * @param plugin - The plugin to persist
   */
  create(plugin: Plugin): Promise<void>;

  /**
   * Find a plugin by its unique ID.
   *
   * @param id - The plugin ID
   * @returns The plugin or null if not found
   */
  findById(id: string): Promise<Plugin | null>;

  /**
   * Find a plugin by its unique name.
   *
   * @param name - The plugin name (e.g., 'mempalace', 'ruflo')
   * @returns The plugin or null if not found
   */
  findByName(name: string): Promise<Plugin | null>;

  /**
   * List all plugins ordered by name.
   *
   * @returns Array of all plugins
   */
  list(): Promise<Plugin[]>;

  /**
   * Update an existing plugin.
   *
   * @param plugin - The plugin with updated fields
   */
  update(plugin: Plugin): Promise<void>;

  /**
   * Delete a plugin by ID (hard delete).
   *
   * @param id - The plugin ID to delete
   */
  delete(id: string): Promise<void>;
}
