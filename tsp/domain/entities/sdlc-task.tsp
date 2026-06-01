/**
 * @module Shep.Domain.Entities.SdlcTask
 *
 * Defines the SdlcTask entity — a first-class persisted unit of work within
 * the SDLC Board. SdlcTask promotes what was previously an embedded, non-persisted
 * task in `tasks.yaml` to a real-time trackable entity, enabling the SDLC Kanban
 * Board to stream live agent progress.
 *
 * ## Relationship to Feature (Epic)
 *
 * Each SdlcTask belongs to exactly one Feature (the epic). Multiple SdlcTask
 * records share a featureId and are grouped by that epic on the board.
 *
 * ## Task Lifecycle
 *
 * ```
 * Todo --> WIP --> Review --> Done
 *           |                   |
 *           +<------------------+
 *         (issues found in review)
 * ```
 *
 * ## Idempotency
 *
 * The `taskKey` field provides a stable idempotency key within a feature
 * (e.g. "task-1"). Combined with `featureId`, it uniquely identifies a task
 * for upsert operations and dependency references.
 *
 * ## Dependency Graph
 *
 * `dependsOnKeys` references taskKeys within the same feature, enabling the
 * board to render dependency badges and determine execution order.
 */
import "../../common/base.tsp";
import "../../common/enums/states.tsp";

/**
 * SdlcTask Entity
 *
 * A first-class persisted task in the SDLC Board system. Represents a
 * discrete unit of work within a Feature (epic) that is tracked in real time
 * as agents execute the development plan.
 *
 * ## Properties
 *
 * | Property       | Type        | Required | Description                                         |
 * |----------------|-------------|----------|-----------------------------------------------------|
 * | id             | UUID        | Yes      | Unique identifier (from BaseEntity)                 |
 * | featureId      | string      | Yes      | FK to Feature (the epic this task belongs to)       |
 * | taskKey        | string      | Yes      | Stable idempotency key within a feature (e.g. "task-1") |
 * | title          | string      | Yes      | Human-readable title of the task                    |
 * | description    | string      | No       | Optional detailed description or acceptance criteria |
 * | status         | TaskState   | Yes      | Current kanban column for this task                 |
 * | sortOrder      | float64     | Yes      | Manual ordering (float64 for insertion between items)|
 * | branch         | string      | No       | Git branch associated with this task                |
 * | dependsOnKeys  | string[]    | No       | taskKeys this task depends on (same feature)        |
 * | agentRunId     | string      | No       | ID of the agent run executing this task             |
 * | createdAt      | utcDateTime | Yes      | When created (from BaseEntity)                      |
 * | updatedAt      | utcDateTime | Yes      | When last updated (from BaseEntity)                 |
 *
 * ## Example
 *
 * ```json
 * {
 *   "id": "550e8400-e29b-41d4-a716-446655440001",
 *   "featureId": "feat-550e8400-e29b-41d4-a716-446655440000",
 *   "taskKey": "task-1",
 *   "title": "Implement OAuth callback handler",
 *   "description": "Create the OAuth callback endpoint that processes authentication responses",
 *   "status": "WIP",
 *   "sortOrder": 1.0,
 *   "branch": "feature/oauth-callback",
 *   "dependsOnKeys": [],
 *   "agentRunId": "run-abc123"
 * }
 * ```
 */
@doc("A first-class persisted SDLC task within a Feature (epic) tracked on the SDLC Board")
model SdlcTask extends BaseEntity {
  /**
   * Foreign key referencing the parent Feature (epic).
   * Groups tasks by epic on the SDLC Board and scopes taskKey uniqueness.
   */
  @doc("FK to the parent Feature (epic) that owns this task")
  featureId: string;

  /**
   * Stable idempotency key within the scope of a feature (e.g. "task-1", "task-2").
   * Combined with featureId, uniquely identifies a task for upsert operations,
   * dependency references, and agent status transitions.
   */
  @doc("Stable idempotency key within the feature (e.g. 'task-1'); unique per featureId")
  taskKey: string;

  /**
   * Human-readable title summarising what this task accomplishes.
   * Displayed as the card header on the SDLC Board.
   */
  @doc("Human-readable title of the task shown on the kanban card")
  title: string;

  /**
   * Optional detailed description, acceptance criteria, or implementation notes
   * that provide context for the task.
   */
  @doc("Optional detailed description or acceptance criteria for the task")
  description?: string;

  /**
   * Current kanban column status of the task.
   * Drives which column the card appears in on the SDLC Board.
   * Updated in real time by the agent executor.
   */
  @doc("Current kanban status of the task (Todo, WIP, Review, Done)")
  status: TaskState;

  /**
   * Manual sort order within a kanban column.
   * Uses float64 to allow insertion between items without renumbering
   * the entire list (e.g. 1.5 between 1.0 and 2.0).
   */
  @doc("Manual sort order within the column (float64 for gap-free insertion)")
  sortOrder: float64;

  /**
   * Optional Git branch associated with this task's implementation.
   * Populated by the agent when it creates or checks out a working branch.
   */
  @doc("Git branch where implementation work for this task occurs")
  branch?: string;

  /**
   * taskKeys (within the same feature) that must reach Done before this
   * task can begin. Rendered as dependency badges on the board card and
   * used by the agent scheduler to determine execution order.
   */
  @doc("taskKeys within the same feature that this task depends on")
  dependsOnKeys?: string[];

  /**
   * Optional ID of the agent run currently executing or that last executed
   * this task. Enables traceability from a task card back to the agent log.
   */
  @doc("ID of the agent run executing or that last executed this task")
  agentRunId?: string;
}
