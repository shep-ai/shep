/**
 * SdlcSubTask Repository Interface (Output Port)
 *
 * Defines the contract for SdlcSubTask entity persistence operations.
 * Implementations handle database-specific logic (SQLite, etc.).
 *
 * Following Clean Architecture:
 * - Domain and Application layers depend on this interface
 * - Infrastructure layer provides concrete implementations
 */

import type { SdlcSubTask, TaskState } from '../../../../domain/generated/output.js';

/**
 * Fields that can be supplied when upserting a sub-task by its stable key.
 * All fields except the idempotency keys (taskId, subTaskKey) are updatable.
 */
export interface SdlcSubTaskUpsertFields {
  /** Feature UUID — denormalized for board grouping */
  featureId: string;
  /** Human-readable name of the sub-task */
  name: string;
  /** Optional rich-text description */
  description?: string;
  /** Current workflow state */
  status: TaskState;
  /** Float64 sort position for fractional indexing */
  sortOrder: number;
}

/**
 * Repository interface for SdlcSubTask entity persistence.
 *
 * Implementations must:
 * - Handle database connection management
 * - Provide thread-safe operations
 * - Return sub-tasks ordered by sort_order ASC, created_at ASC by default
 */
export interface ISdlcSubTaskRepository {
  /**
   * Create a new SdlcSubTask record.
   *
   * @param subTask - The sub-task to persist (id, createdAt, updatedAt must be set by caller)
   * @throws If a sub-task with the same id already exists
   */
  create(subTask: SdlcSubTask): Promise<void>;

  /**
   * Find a sub-task by its unique ID.
   *
   * @param id - The sub-task UUID
   * @returns The sub-task or null if not found
   */
  findById(id: string): Promise<SdlcSubTask | null>;

  /**
   * List all sub-tasks belonging to a specific task, ordered by sort_order ASC.
   *
   * @param taskId - The parent SdlcTask UUID
   * @returns Array of sub-tasks for the task
   */
  listByTask(taskId: string): Promise<SdlcSubTask[]>;

  /**
   * List all sub-tasks belonging to a specific feature (epic), ordered by
   * sort_order ASC. Useful for bulk board loads without per-task round-trips.
   *
   * @param featureId - The feature (epic) UUID
   * @returns Array of sub-tasks for the feature
   */
  listByFeature(featureId: string): Promise<SdlcSubTask[]>;

  /**
   * Idempotent upsert: insert the sub-task if (taskId, subTaskKey) does not
   * exist, otherwise update its mutable fields. Safe to call multiple times
   * with the same key — will not duplicate rows.
   *
   * @param id         - UUID to use when inserting a new row
   * @param taskId     - The parent SdlcTask UUID
   * @param subTaskKey - Stable idempotency key within the task (e.g. 'subtask-1')
   * @param fields     - Fields to set on insert or update
   */
  upsertByKey(
    id: string,
    taskId: string,
    subTaskKey: string,
    fields: SdlcSubTaskUpsertFields
  ): Promise<void>;

  /**
   * Update only the status of an existing sub-task and bump updated_at.
   *
   * @param id     - The sub-task UUID
   * @param status - New TaskState value
   */
  updateStatus(id: string, status: TaskState): Promise<void>;

  /**
   * Update only the sort order of an existing sub-task and bump updated_at.
   *
   * @param id        - The sub-task UUID
   * @param sortOrder - New float64 sort position
   */
  updateSortOrder(id: string, sortOrder: number): Promise<void>;
}
