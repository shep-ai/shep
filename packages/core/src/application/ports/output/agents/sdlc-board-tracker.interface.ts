/**
 * ISdlcBoardTracker — Output port for surfacing SDLC task/sub-task progress
 * onto the SDLC Kanban Board (spec sdlc-board).
 *
 * The feature-agent is the source of truth for task execution. This port
 * provides the contract through which the agent writes task and sub-task
 * status updates so the board can reflect live progress.
 *
 * Design principles:
 * - Idempotent: `seedTasks` may be called multiple times with the same keys
 *   without creating duplicate rows — the underlying upsert handles conflicts.
 * - Key-addressed: status updates are addressed by stable string keys
 *   (`taskKey`, `subTaskKey`) rather than UUIDs, so agents do not need to
 *   track generated row identifiers.
 * - Graceful no-ops: if a key does not exist when a status update arrives
 *   the call resolves without error — the board simply retains its current
 *   state.
 *
 * Application layer — MUST NOT import from infrastructure.
 */

import type { TaskState } from '../../../../domain/generated/output.js';

/**
 * Shape of a single sub-task when seeding the board.
 */
export interface SeedSubTask {
  /** Stable idempotency key within the parent task (e.g. `'subtask-1'`). */
  subTaskKey: string;
  /** Human-readable name of the sub-task. */
  name: string;
  /** Optional rich-text description. */
  description?: string;
  /**
   * Initial workflow state.
   * Defaults to {@link TaskState.Todo} when omitted.
   */
  status?: TaskState;
  /** Float64 sort position for fractional indexing. */
  sortOrder: number;
}

/**
 * Shape of a single task when seeding the board.
 */
export interface SeedTask {
  /** Stable idempotency key within the feature (e.g. `'task-1'`). */
  taskKey: string;
  /** Human-readable title of the task. */
  title: string;
  /** Optional rich-text description. */
  description?: string;
  /**
   * Initial workflow state.
   * Defaults to {@link TaskState.Todo} when omitted.
   */
  status?: TaskState;
  /** Float64 sort position for fractional indexing. */
  sortOrder: number;
  /** Optional git branch associated with this task. */
  branch?: string;
  /** Task keys this task depends on (for board dependency badges). */
  dependsOnKeys?: string[];
  /** Optional agent run ID that owns this task. */
  agentRunId?: string;
  /** Sub-tasks nested under this task. */
  subTasks: SeedSubTask[];
}

/**
 * Output port through which the feature-agent writes task and sub-task
 * progress onto the SDLC Board.
 *
 * Implementations live in the infrastructure layer and are injected via the
 * DI container under the string token `'ISdlcBoardTracker'`.
 */
export interface ISdlcBoardTracker {
  /**
   * Idempotent upsert of the entire task plan for a feature.
   *
   * Called once at plan-ready time (and safely re-callable on restarts).
   * For each {@link SeedTask} the implementation upserts the task row and
   * then upserts every nested {@link SeedSubTask} row. Omitted `status`
   * fields default to {@link TaskState.Todo}.
   *
   * @param featureId - UUID of the owning Feature (epic).
   * @param tasks     - Ordered array of tasks with their nested sub-tasks.
   */
  seedTasks(featureId: string, tasks: SeedTask[]): Promise<void>;

  /**
   * Transition a task's workflow state.
   *
   * Resolves the task by its stable `taskKey` within the given `featureId`
   * and updates its status. No-ops gracefully when the key is not found.
   *
   * @param featureId - UUID of the owning Feature (epic).
   * @param taskKey   - Stable idempotency key (e.g. `'task-1'`).
   * @param status    - New {@link TaskState} value.
   */
  setTaskStatus(featureId: string, taskKey: string, status: TaskState): Promise<void>;

  /**
   * Transition a sub-task's workflow state.
   *
   * First resolves the parent task by `taskKey` within `featureId`, then
   * resolves the sub-task by `subTaskKey` within that task, and updates its
   * status. No-ops gracefully when either key is not found.
   *
   * @param featureId  - UUID of the owning Feature (epic).
   * @param taskKey    - Stable key identifying the parent task.
   * @param subTaskKey - Stable key identifying the sub-task within the task.
   * @param status     - New {@link TaskState} value.
   */
  setSubTaskStatus(
    featureId: string,
    taskKey: string,
    subTaskKey: string,
    status: TaskState
  ): Promise<void>;
}
