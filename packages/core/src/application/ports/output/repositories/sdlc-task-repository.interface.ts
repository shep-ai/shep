/**
 * SdlcTask Repository Interface (Output Port)
 *
 * Defines the contract for SdlcTask entity persistence operations.
 * Implementations handle database-specific logic (SQLite, etc.).
 *
 * Following Clean Architecture:
 * - Domain and Application layers depend on this interface
 * - Infrastructure layer provides concrete implementations
 */

import type { SdlcTask, TaskState } from '../../../../domain/generated/output.js';

/**
 * Fields that can be supplied when upserting a task by its stable key.
 * All fields except the idempotency keys (featureId, taskKey) are updatable.
 */
export interface SdlcTaskUpsertFields {
  /** Human-readable title of the task */
  title: string;
  /** Optional rich-text description */
  description?: string;
  /** Current workflow state */
  status: TaskState;
  /** Float64 sort position for fractional indexing */
  sortOrder: number;
  /** Optional git branch associated with this task */
  branch?: string;
  /** Task keys this task depends on (for board dependency badges) */
  dependsOnKeys?: string[];
  /** Optional agent run ID that owns this task */
  agentRunId?: string;
}

/**
 * Repository interface for SdlcTask entity persistence.
 *
 * Implementations must:
 * - Handle database connection management
 * - Provide thread-safe operations
 * - Return tasks ordered by sort_order ASC, created_at ASC by default
 */
export interface ISdlcTaskRepository {
  /**
   * Create a new SdlcTask record.
   *
   * @param task - The task to persist (id, createdAt, updatedAt must be set by caller)
   * @throws If a task with the same id already exists
   */
  create(task: SdlcTask): Promise<void>;

  /**
   * Find a task by its unique ID.
   *
   * @param id - The task UUID
   * @returns The task or null if not found
   */
  findById(id: string): Promise<SdlcTask | null>;

  /**
   * List all tasks belonging to a specific feature (epic), ordered by sort_order ASC.
   *
   * @param featureId - The feature (epic) UUID
   * @returns Array of tasks for the feature
   */
  listByFeature(featureId: string): Promise<SdlcTask[]>;

  /**
   * List all tasks across every feature — used by the global SDLC Board.
   * Returns tasks ordered by feature_id, then sort_order ASC.
   *
   * @returns All persisted SDLC tasks
   */
  listAllActive(): Promise<SdlcTask[]>;

  /**
   * Idempotent upsert: insert the task if (featureId, taskKey) does not exist,
   * otherwise update its mutable fields. Safe to call multiple times with the
   * same key — will not duplicate rows.
   *
   * @param id         - UUID to use when inserting a new row
   * @param featureId  - The owning feature UUID
   * @param taskKey    - Stable idempotency key within the feature (e.g. 'task-1')
   * @param fields     - Fields to set on insert or update
   */
  upsertByKey(
    id: string,
    featureId: string,
    taskKey: string,
    fields: SdlcTaskUpsertFields
  ): Promise<void>;

  /**
   * Update only the status of an existing task and bump updated_at.
   *
   * @param id     - The task UUID
   * @param status - New TaskState value
   */
  updateStatus(id: string, status: TaskState): Promise<void>;

  /**
   * Update only the sort order of an existing task and bump updated_at.
   *
   * @param id        - The task UUID
   * @param sortOrder - New float64 sort position
   */
  updateSortOrder(id: string, sortOrder: number): Promise<void>;

  /**
   * Hard-delete all tasks belonging to a feature. Used when a feature is
   * removed and all associated SDLC data must be cleaned up.
   *
   * @param featureId - The feature UUID whose tasks should be removed
   */
  deleteByFeature(featureId: string): Promise<void>;
}
