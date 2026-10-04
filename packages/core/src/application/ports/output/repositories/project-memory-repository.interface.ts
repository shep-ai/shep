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

import type {
  ProjectMemory,
  MemoryCategory,
  MemoryScope,
} from '../../../../domain/generated/output.js';

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
  /** Reach of the entry on insert. Defaults to Project; an existing entry keeps its scope. */
  scope?: MemoryScope;
  /** Space the entry belongs to (spec 120). Stamped on insert; an existing entry keeps its space. */
  spaceId?: string;
  /** Product line the entry belongs to, when its repository has one. Stamped on insert. */
  productLineId?: string;
}

/**
 * Where an entry sits after a scope change: the space (and product line) of
 * the repository it was promoted or demoted in.
 */
export interface ProjectMemoryPlacement {
  spaceId: string;
  productLineId?: string;
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
   * List memory entries for the management UI, ordered by repository, then
   * category, then most-recently-updated first.
   *
   * @param spaceId - When given, only entries of that space
   * @returns The matching entries
   */
  listAll(spaceId?: string): Promise<ProjectMemory[]>;

  /**
   * Entries that reach every repository of one space: `Space` entries and
   * legacy `Organization` entries whose `spaceId` is the given space. Never
   * returns another space's entries (spec 120).
   *
   * @param spaceId - The space to read
   */
  listSpaceWide(spaceId: string): Promise<ProjectMemory[]>;

  /**
   * `ProductLine` entries of one product line.
   *
   * @param productLineId - The product line to read
   */
  listProductLine(productLineId: string): Promise<ProjectMemory[]>;

  /** How many entries belong to a space, of any scope. */
  countBySpace(spaceId: string): Promise<number>;

  /**
   * Update an existing entry's content (and bump updatedAt).
   *
   * @param id      - The entry UUID
   * @param content - The new content
   */
  updateContent(id: string, content: string): Promise<void>;

  /**
   * Update an existing entry's scope and placement (and bump updatedAt). Used
   * to promote a project learning to its product line or space, or demote it.
   *
   * @param id        - The entry UUID
   * @param scope     - The new scope
   * @param placement - The space and product line the entry now belongs to
   */
  updateScope(id: string, scope: MemoryScope, placement: ProjectMemoryPlacement): Promise<void>;

  /**
   * Delete an entry by its unique ID. No-op if it does not exist.
   *
   * @param id - The entry UUID
   */
  delete(id: string): Promise<void>;

  /**
   * Idempotent upsert keyed on (repositoryPath, category, entryKey).
   * Inserts a new row if the key does not exist, otherwise updates the
   * existing row's `content`, `sourceFeatureId`, and `updatedAt`. An existing
   * row keeps its scope and space: only updateScope changes those, so
   * re-recording never demotes a promoted entry. Safe to call repeatedly
   * with the same key — will not duplicate rows.
   *
   * @param entry - The fields to insert or update
   */
  upsert(entry: ProjectMemoryUpsert): Promise<void>;
}
