/**
 * Workflow Repository Interface
 *
 * Output port for ScheduledWorkflow persistence operations.
 * Implementations handle database-specific logic (SQLite, etc.).
 *
 * Following Clean Architecture:
 * - Domain and Application layers depend on this interface
 * - Infrastructure layer provides concrete implementations
 */

import type { ScheduledWorkflow } from '../../../../domain/generated/output.js';

/**
 * Filters for listing workflows.
 */
export interface WorkflowListFilters {
  repositoryPath?: string;
  enabled?: boolean;
  /** When true, include soft-deleted workflows in results. Default: false. */
  includeDeleted?: boolean;
}

/**
 * Repository interface for ScheduledWorkflow entity persistence.
 *
 * Implementations must:
 * - Handle database connection management
 * - Provide thread-safe operations
 * - Support query by name + repositoryPath for uniqueness
 * - Exclude soft-deleted workflows from queries by default
 */
export interface IWorkflowRepository {
  /**
   * Create a new workflow record.
   *
   * @param workflow - The workflow to persist
   */
  create(workflow: ScheduledWorkflow): Promise<void>;

  /**
   * Find a workflow by its unique ID (excludes soft-deleted).
   *
   * @param id - The workflow ID
   * @returns The workflow or null if not found
   */
  findById(id: string): Promise<ScheduledWorkflow | null>;

  /**
   * Find a workflow by name within a repository (excludes soft-deleted).
   *
   * @param name - The workflow name
   * @param repositoryPath - The repository path to scope the search
   * @returns The workflow or null if not found
   */
  findByName(name: string, repositoryPath: string): Promise<ScheduledWorkflow | null>;

  /**
   * Find all enabled, non-deleted workflows.
   * Used by the scheduler service to determine which workflows need evaluation.
   *
   * @returns Array of enabled workflows
   */
  findEnabled(): Promise<ScheduledWorkflow[]>;

  /**
   * List workflows with optional filters.
   * Excludes soft-deleted workflows unless includeDeleted is true.
   *
   * @param filters - Optional filters for repositoryPath, enabled state, and includeDeleted
   * @returns Array of matching workflows
   */
  list(filters?: WorkflowListFilters): Promise<ScheduledWorkflow[]>;

  /**
   * Update an existing workflow.
   *
   * @param workflow - The workflow with updated fields
   */
  update(workflow: ScheduledWorkflow): Promise<void>;

  /**
   * Soft-delete a workflow by setting deletedAt timestamp.
   * Preserves execution history for audit purposes.
   *
   * @param id - The workflow ID to soft-delete
   */
  softDelete(id: string): Promise<void>;
}
