/**
 * WorkItemState Repository Interface (Output Port)
 *
 * Defines the contract for WorkItemState entity persistence operations.
 * Implementations handle database-specific logic (SQLite, etc.).
 *
 * Following Clean Architecture:
 * - Domain and Application layers depend on this interface
 * - Infrastructure layer provides concrete implementations
 */

import type { WorkItemState } from '../../../../domain/generated/output.js';

/**
 * Repository interface for WorkItemState entity persistence.
 *
 * Implementations must:
 * - Handle database connection management
 * - Provide thread-safe operations
 * - Exclude soft-deleted states from queries by default
 * - Support reordering states within a project
 */
export interface IWorkItemStateRepository {
  /**
   * Create a new workflow state record.
   *
   * @param state - The workflow state to persist
   */
  create(state: WorkItemState): Promise<void>;

  /**
   * Find a workflow state by its unique ID (excludes soft-deleted).
   *
   * @param id - The state UUID
   * @returns The state or null if not found
   */
  findById(id: string): Promise<WorkItemState | null>;

  /**
   * List all non-deleted workflow states for a project, ordered by displayOrder.
   *
   * @param projectId - The project UUID to scope the query
   * @returns Array of workflow states ordered by displayOrder ascending
   */
  listByProject(projectId: string): Promise<WorkItemState[]>;

  /**
   * Update mutable fields on an existing workflow state.
   *
   * @param id - The state UUID
   * @param fields - Partial set of updatable fields
   */
  update(
    id: string,
    fields: Partial<
      Pick<WorkItemState, 'name' | 'color' | 'displayOrder' | 'stateGroup' | 'isDefault'>
    >
  ): Promise<void>;

  /**
   * Soft-delete a workflow state by setting deletedAt timestamp.
   *
   * @param id - The state UUID to soft-delete
   */
  softDelete(id: string): Promise<void>;

  /**
   * Seed the default set of workflow states for a newly created project.
   * Creates Backlog, Todo, In Progress, Done, and Cancelled states.
   *
   * @param projectId - The project UUID to seed states for
   */
  seedDefaultStates(projectId: string): Promise<void>;

  /**
   * Batch-reorder workflow states by updating their displayOrder values.
   *
   * @param states - Array of state ID and new displayOrder pairs
   */
  reorder(states: { id: string; displayOrder: number }[]): Promise<void>;
}
