/**
 * @module Shep.Agents.WorkflowStep
 *
 * A persisted step of a multi-step workflow executed inside an
 * interactive session. The orchestrator walks a workflow definition
 * (e.g. "application creation": scaffold → deps → plan → … → report)
 * and writes one row per step. Every `InteractiveMessage` produced
 * during a step is tagged with the step's id via
 * `InteractiveMessage.stepId`, so the UI can group the conversation
 * by step without parsing marker strings.
 *
 * Persisting status BEFORE the agent is invoked and AFTER it
 * completes is the core robustness guarantee: a browser refresh or
 * daemon crash never loses in-progress state — it's always a SELECT
 * away.
 */
import "../common/base.tsp";

/**
 * Workflow Step Status
 *
 * Lifecycle of a single workflow step.
 *
 * | Value       | Description                                                        |
 * |-------------|--------------------------------------------------------------------|
 * | pending     | Created but not yet started                                        |
 * | running     | Currently being executed by the agent                              |
 * | done        | Completed successfully                                             |
 * | failed      | The agent turn failed; the orchestrator stopped                    |
 * | interrupted | The daemon crashed / restarted mid-step; recoverable with retry    |
 */
@doc("Lifecycle status of a single workflow step")
enum WorkflowStepStatus {
  @doc("Created but not yet started")
  pending: "pending",

  @doc("Currently being executed by the agent")
  running: "running",

  @doc("Completed successfully")
  done: "done",

  @doc("The agent turn failed; the orchestrator stopped")
  failed: "failed",

  @doc("The daemon crashed / restarted mid-step; recoverable")
  interrupted: "interrupted",
}

/**
 * Workflow Step
 *
 * One persisted row per step in a running or completed workflow
 * execution. The `sessionId` ties it to the interactive session that
 * runs the steps; `featureId` is the polymorphic scope (matches
 * `InteractiveMessage.featureId`) so queries for a chat can fetch
 * steps in a single shot.
 *
 * ## Properties
 *
 * | Property    | Type                | Required | Description                                      |
 * |-------------|---------------------|----------|--------------------------------------------------|
 * | id          | UUID                | Yes      | Unique identifier (from BaseEntity)              |
 * | sessionId   | string              | Yes      | Parent interactive session                       |
 * | featureId   | string              | Yes      | Polymorphic scope key (feature/repo/global)      |
 * | workflowId  | string              | Yes      | Logical workflow id (e.g. application-creation-v1)|
 * | stepKey     | string              | Yes      | Stable key inside the workflow (e.g. scaffold)   |
 * | stepIndex   | int32               | Yes      | Order within the workflow                        |
 * | title       | string              | Yes      | Non-technical title shown to the user            |
 * | description | string              | Yes      | Non-technical subtitle shown to the user         |
 * | status      | WorkflowStepStatus  | Yes      | Lifecycle state                                  |
 * | startedAt   | utcDateTime         | No       | When the step transitioned to `running`          |
 * | finishedAt  | utcDateTime         | No       | When the step transitioned to `done`/`failed`    |
 * | metadata    | string              | No       | JSON blob (summary, details, error)              |
 */
@doc("A persisted step of a multi-step workflow executed inside an interactive session")
model WorkflowStep extends BaseEntity {
  @doc("Parent interactive session id")
  sessionId: string;

  @doc("Polymorphic scope key: matches InteractiveMessage.featureId")
  featureId: string;

  @doc("Logical workflow id (e.g. 'application-creation-v1')")
  workflowId: string;

  @doc("Stable key inside the workflow (e.g. 'scaffold', 'deps')")
  stepKey: string;

  @doc("Order of this step within the workflow, starting at 0")
  stepIndex: int32;

  @doc("Non-technical title shown to the user")
  title: string;

  @doc("Non-technical subtitle shown to the user")
  description: string;

  @doc("Current lifecycle status")
  status: WorkflowStepStatus;

  @doc("When the step transitioned to running")
  startedAt?: utcDateTime;

  @doc("When the step transitioned to done/failed/interrupted")
  finishedAt?: utcDateTime;

  @doc("JSON blob with summary, details, error — populated when done/failed")
  metadata?: string;
}
