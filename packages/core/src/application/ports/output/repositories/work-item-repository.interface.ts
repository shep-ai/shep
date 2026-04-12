/**
 * WorkItem Repository Interface (Output Port)
 *
 * Defines the contract for WorkItem entity persistence operations.
 * Implementations handle database-specific logic (SQLite, etc.).
 *
 * Following Clean Architecture:
 * - Domain and Application layers depend on this interface
 * - Infrastructure layer provides concrete implementations
 */

import type { WorkItem } from '../../../../domain/generated/output.js';

/**
 * Filters for querying work items within a project.
 */
export interface WorkItemFilter {
  /** Filter by workflow state IDs */
  stateIds?: string[];
  /** Filter by priority levels */
  priorities?: string[];
  /** Filter by assigned user IDs */
  assigneeIds?: string[];
  /** Filter by label IDs */
  labelIds?: string[];
  /** Filter by start date range (from) */
  startDateFrom?: Date;
  /** Filter by start date range (to) */
  startDateTo?: Date;
  /** Filter by due date range (from) */
  dueDateFrom?: Date;
  /** Filter by due date range (to) */
  dueDateTo?: Date;
  /** Filter by parent work item ID (null = top-level only) */
  parentId?: string | null;
  /** Full-text search across title and description */
  searchText?: string;
}

/**
 * Repository interface for WorkItem entity persistence.
 *
 * Implementations must:
 * - Handle database connection management
 * - Provide thread-safe operations
 * - Exclude soft-deleted work items from queries by default
 * - Support many-to-many relationships for labels and assignees via junction tables
 */
export interface IWorkItemRepository {
  /**
   * Create a new work item record.
   *
   * @param item - The work item to persist
   */
  create(item: WorkItem): Promise<void>;

  /**
   * Find a work item by its unique ID (excludes soft-deleted).
   *
   * @param id - The work item UUID
   * @returns The work item or null if not found
   */
  findById(id: string): Promise<WorkItem | null>;

  /**
   * Find a work item by its project-scoped identifier (e.g., sequence 42 in project X).
   * Excludes soft-deleted work items.
   *
   * @param projectId - The project UUID
   * @param sequenceId - The sequential number within the project
   * @returns The work item or null if not found
   */
  findByIdentifier(projectId: string, sequenceId: number): Promise<WorkItem | null>;

  /**
   * List work items for a project with optional filters.
   * Excludes soft-deleted work items.
   *
   * @param projectId - The project UUID
   * @param filters - Optional filters to narrow results
   * @returns Array of matching work items
   */
  listByProject(projectId: string, filters?: WorkItemFilter): Promise<WorkItem[]>;

  /**
   * Update mutable fields on an existing work item.
   *
   * @param id - The work item UUID
   * @param fields - Partial set of updatable fields
   */
  update(
    id: string,
    fields: Partial<
      Pick<
        WorkItem,
        | 'title'
        | 'description'
        | 'stateId'
        | 'priority'
        | 'parentId'
        | 'sortOrder'
        | 'startDate'
        | 'dueDate'
        | 'estimateValue'
        | 'customPropertyValues'
      >
    >
  ): Promise<void>;

  /**
   * Soft-delete a work item by setting deletedAt timestamp.
   *
   * @param id - The work item UUID to soft-delete
   */
  softDelete(id: string): Promise<void>;

  /**
   * Add a label to a work item (many-to-many via junction table).
   *
   * @param workItemId - The work item UUID
   * @param labelId - The label UUID to associate
   */
  addLabel(workItemId: string, labelId: string): Promise<void>;

  /**
   * Remove a label from a work item.
   *
   * @param workItemId - The work item UUID
   * @param labelId - The label UUID to disassociate
   */
  removeLabel(workItemId: string, labelId: string): Promise<void>;

  /**
   * Add an assignee to a work item (many-to-many via junction table).
   *
   * @param workItemId - The work item UUID
   * @param assigneeId - The assignee user ID to associate
   */
  addAssignee(workItemId: string, assigneeId: string): Promise<void>;

  /**
   * Remove an assignee from a work item.
   *
   * @param workItemId - The work item UUID
   * @param assigneeId - The assignee user ID to disassociate
   */
  removeAssignee(workItemId: string, assigneeId: string): Promise<void>;

  /**
   * Get all label IDs associated with a work item.
   *
   * @param workItemId - The work item UUID
   * @returns Array of label UUIDs
   */
  getLabels(workItemId: string): Promise<string[]>;

  /**
   * Get all assignee IDs associated with a work item.
   *
   * @param workItemId - The work item UUID
   * @returns Array of assignee user IDs
   */
  getAssignees(workItemId: string): Promise<string[]>;
}
