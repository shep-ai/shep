/**
 * WorkItemRelation Repository Interface (Output Port)
 *
 * Defines the contract for WorkItemRelation entity persistence operations.
 * Implementations handle database-specific logic (SQLite, etc.).
 *
 * Following Clean Architecture:
 * - Domain and Application layers depend on this interface
 * - Infrastructure layer provides concrete implementations
 */

/**
 * Represents a directional relation between two work items.
 */
export interface WorkItemRelation {
  /** Unique identifier for the relation */
  id: string;
  /** The source (origin) work item ID */
  sourceWorkItemId: string;
  /** The target (destination) work item ID */
  targetWorkItemId: string;
  /** The type of relation (e.g., 'Blocking', 'RelatesTo', 'Duplicate', 'StartsBefore', 'FinishesBefore') */
  relationType: string;
  /** When the relation was created */
  createdAt: Date;
}

/**
 * Repository interface for WorkItemRelation entity persistence.
 *
 * Implementations must:
 * - Handle database connection management
 * - Provide thread-safe operations
 * - Enforce uniqueness of (source, target, relationType) tuples
 */
export interface IWorkItemRelationRepository {
  /**
   * Create a new work item relation record.
   *
   * @param relation - The relation to persist
   */
  create(relation: WorkItemRelation): Promise<void>;

  /**
   * Delete a work item relation by its unique ID.
   *
   * @param id - The relation UUID to delete
   */
  delete(id: string): Promise<void>;

  /**
   * List all relations where the given work item is either the source or target.
   *
   * @param workItemId - The work item UUID
   * @returns Array of matching relations
   */
  listByWorkItem(workItemId: string): Promise<WorkItemRelation[]>;

  /**
   * Find an existing relation by source, target, and type.
   * Used to check for duplicates before creating.
   *
   * @param sourceId - The source work item UUID
   * @param targetId - The target work item UUID
   * @param relationType - The relation type string
   * @returns The matching relation or null if not found
   */
  findExisting(
    sourceId: string,
    targetId: string,
    relationType: string
  ): Promise<WorkItemRelation | null>;
}
