/**
 * @module Shep.Domain.Entities.SdlcSubTask
 *
 * Defines the SdlcSubTask entity — a first-class persisted granular step
 * within an SdlcTask on the SDLC Board. SdlcSubTask promotes what were
 * previously embedded `ActionItem` entries into real-time trackable records,
 * enabling fine-grained progress visibility per task card.
 *
 * ## Relationship to SdlcTask and Feature
 *
 * Each SdlcSubTask belongs to exactly one SdlcTask via `taskId`. The
 * `featureId` is denormalized from the parent task to allow efficient
 * board-level queries (list all subtasks for a feature) without joining
 * through the task table.
 *
 * ## Sub-task Lifecycle
 *
 * ```
 * Todo --> WIP --> Done
 *           |       |
 *           v       v
 *        Review <---+
 *           |
 *           v
 *     (back to WIP if issues found)
 * ```
 *
 * ## Idempotency
 *
 * The `subTaskKey` field provides a stable idempotency key scoped to its
 * parent task (e.g. "subtask-1"). Combined with `taskId`, it uniquely
 * identifies a sub-task for upsert operations by the agent executor.
 */
import "../../common/base.tsp";
import "../../common/enums/states.tsp";

/**
 * SdlcSubTask Entity
 *
 * A first-class persisted granular step within an SdlcTask. Subtasks are
 * rendered as progress indicators inside each SdlcTask card on the SDLC
 * Board, giving real-time visibility into agent execution at the action-item
 * level.
 *
 * ## Properties
 *
 * | Property    | Type        | Required | Description                                         |
 * |-------------|-------------|----------|-----------------------------------------------------|
 * | id          | UUID        | Yes      | Unique identifier (from BaseEntity)                 |
 * | taskId      | string      | Yes      | FK to the parent SdlcTask                           |
 * | featureId   | string      | Yes      | Denormalized FK to Feature for board-level queries  |
 * | subTaskKey  | string      | Yes      | Stable idempotency key within the task              |
 * | name        | string      | Yes      | Human-readable name of the sub-task step            |
 * | description | string      | No       | Optional additional detail for the sub-task         |
 * | status      | TaskState   | Yes      | Current execution status of this sub-task           |
 * | sortOrder   | float64     | Yes      | Manual ordering within the parent task              |
 * | createdAt   | utcDateTime | Yes      | When created (from BaseEntity)                      |
 * | updatedAt   | utcDateTime | Yes      | When last updated (from BaseEntity)                 |
 *
 * ## Example
 *
 * ```json
 * {
 *   "id": "660e8400-e29b-41d4-a716-446655440002",
 *   "taskId": "550e8400-e29b-41d4-a716-446655440001",
 *   "featureId": "feat-550e8400-e29b-41d4-a716-446655440000",
 *   "subTaskKey": "subtask-1",
 *   "name": "Create callback route",
 *   "description": "Register POST /auth/callback in the router",
 *   "status": "Done",
 *   "sortOrder": 1.0
 * }
 * ```
 */
@doc("A persisted granular sub-task step within an SdlcTask, tracked on the SDLC Board")
model SdlcSubTask extends BaseEntity {
  /**
   * Foreign key referencing the parent SdlcTask.
   * Scopes subTaskKey uniqueness and enables task-level sub-task listing.
   */
  @doc("FK to the parent SdlcTask that owns this sub-task")
  taskId: string;

  /**
   * Denormalized foreign key referencing the parent Feature (epic).
   * Stored on the sub-task to allow efficient board-level queries without
   * an additional join through the SdlcTask table.
   */
  @doc("Denormalized FK to the parent Feature for efficient board-level queries")
  featureId: string;

  /**
   * Stable idempotency key scoped to the parent task (e.g. "subtask-1").
   * Combined with taskId, uniquely identifies a sub-task for upsert
   * operations by the agent executor.
   */
  @doc("Stable idempotency key within the task (e.g. 'subtask-1'); unique per taskId")
  subTaskKey: string;

  /**
   * Human-readable name of the sub-task step.
   * Displayed as a checklist item inside the parent task card on the SDLC Board.
   */
  @doc("Human-readable name of the sub-task step shown in the card progress list")
  name: string;

  /**
   * Optional additional detail clarifying the scope or acceptance criteria
   * for this sub-task step.
   */
  @doc("Optional additional detail or acceptance criteria for this sub-task")
  description?: string;

  /**
   * Current execution status of the sub-task.
   * Updated in real time by the agent executor to reflect granular progress.
   */
  @doc("Current execution status of this sub-task (Todo, WIP, Review, Done)")
  status: TaskState;

  /**
   * Manual sort order within the parent task's sub-task list.
   * Uses float64 to allow insertion between items without renumbering
   * (e.g. 1.5 between 1.0 and 2.0).
   */
  @doc("Manual sort order within the parent task (float64 for gap-free insertion)")
  sortOrder: float64;
}
