/**
 * ProjectMemory Repository Interface (Output Port)
 *
 * Defines the contract for ProjectMemory persistence ("Shep Brain").
 * Implementations handle database-specific logic (SQLite, etc.).
 *
 * Following Clean Architecture:
 * - Domain and Application layers depend on this interface
 * - Infrastructure layer provides concrete implementations
 */

import type { ProjectMemory, MemoryCategory } from '../../../../domain/generated/output.js';

/**
 * Fields supplied when upserting a memory entry by its stable key.
 *
 * The tuple (repositoryPath, category, entryKey) is the idempotency key:
 * inserting with an existing tuple updates `content` / `sourceFeatureId`
 * in place rather than creating a duplicate row.
 */
export interface ProjectMemoryUpsert {
  /** UUID to use when inserting a new row (ignored on update). */
  id: string;
  /** Normalised repository path scoping the memory. */
  repositoryPath: string;
  /** Category of knowledge captured. */
  category: MemoryCategory;
  /** Stable upsert key within (repositoryPath, category). */
  entryKey: string;
  /** The memory text injected into agent prompts. */
  content: string;
  /** Optional ID of the feature whose merge produced this entry. */
  sourceFeatureId?: string;
}

/**
 * Repository interface for ProjectMemory persistence.
 *
 * Implementations must:
 * - Handle database connection management
 * - Provide thread-safe operations
 * - Return entries ordered by category, then most-recently-updated first
 */
export interface IProjectMemoryRepository {
  /**
   * Create a new ProjectMemory record.
   *
   * @param memory - The entry to persist (id, createdAt, updatedAt set by caller)
   * @throws If an entry with the same id already exists
   */
  create(memory: ProjectMemory): Promise<void>;

  /**
   * Find an entry by its unique ID.
   *
   * @param id - The entry UUID
   * @returns The entry or null if not found
   */
  findById(id: string): Promise<ProjectMemory | null>;

  /**
   * List all memory entries for a repository, ordered by category then
   * most-recently-updated first.
   *
   * @param repositoryPath - Normalised repository path
   * @returns Array of entries scoped to the repository
   */
  listByRepository(repositoryPath: string): Promise<ProjectMemory[]>;

  /**
   * List every memory entry across all repositories, ordered by repository,
   * then category, then most-recently-updated first. Backs the management UI.
   *
   * @returns All persisted memory entries
   */
  listAll(): Promise<ProjectMemory[]>;

  /**
   * Update an existing entry's content (and bump updatedAt).
   *
   * @param id      - The entry UUID
   * @param content - The new content
   */
  updateContent(id: string, content: string): Promise<void>;

  /**
   * Delete an entry by its unique ID. No-op if it does not exist.
   *
   * @param id - The entry UUID
   */
  delete(id: string): Promise<void>;

  /**
   * Idempotent upsert keyed on (repositoryPath, category, entryKey).
   * Inserts a new row if the key does not exist, otherwise updates the
   * existing row's `content`, `sourceFeatureId`, and `updatedAt`. Safe to
   * call repeatedly with the same key — will not duplicate rows.
   *
   * @param entry - The fields to insert or update
   */
  upsert(entry: ProjectMemoryUpsert): Promise<void>;
}
