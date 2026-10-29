/**
 * @module Shep.Agents.DeployTarget
 *
 * Deployment target discriminated union definitions for the Shep AI CLI.
 *
 * This module defines the DeployTarget union type which specifies what can
 * be deployed by the LocalDeployAgent. Targets can be a single ActionItem,
 * a single Task, or multiple Tasks.
 *
 * ## Discriminated Union Pattern
 *
 * The DeployTarget uses TypeSpec's discriminated union pattern with a `kind`
 * discriminator to enable type-safe handling of different deployment scenarios:
 *
 * ```
 * DeployTarget
 *     |
 *     +-- DeployTargetActionItem (kind: "actionItem")
 *     |       |
 *     |       +-- actionItem: ActionItem
 *     |
 *     +-- DeployTargetTask (kind: "task")
 *     |       |
 *     |       +-- task: Task
 *     |
 *     +-- DeployTargetTasks (kind: "tasks")
 *             |
 *             +-- tasks: Task[]
 * ```
 *
 * ## Usage Examples
 *
 * ```typescript
 * // Deploy a single action item
 * const target: DeployTarget = {
 *   kind: "actionItem",
 *   actionItem: myActionItem
 * };
 *
 * // Deploy a single task
 * const target: DeployTarget = {
 *   kind: "task",
 *   task: myTask
 * };
 *
 * // Deploy multiple tasks
 * const target: DeployTarget = {
 *   kind: "tasks",
 *   tasks: [task1, task2, task3]
 * };
 * ```
 *
 * @see docs/architecture/agent-system.md - Agent system architecture
 * @see ./deploy-agent.tsp - LocalDeployAgent that uses DeployTarget
 */
import "../domain/entities/task.tsp";
import "../domain/entities/action-item.tsp";

/**
 * Single ActionItem deployment target.
 *
 * Used when deploying the changes from a single, atomic action item.
 * This is the most granular deployment target, typically used for
 * quick previews or testing individual changes.
 *
 * @example
 * ```json
 * {
 *   "kind": "actionItem",
 *   "actionItem": {
 *     "id": "550e8400-e29b-41d4-a716-446655440000",
 *     "name": "Add login button",
 *     "description": "Add a login button to the header component"
 *   }
 * }
 * ```
 */
@doc("Deployment target wrapping a single ActionItem for granular deployments")
model DeployTargetActionItem {
  @doc("Discriminator indicating this is an action item target")
  kind: "actionItem";

  @doc("The action item to deploy - represents an atomic unit of work")
  actionItem: ActionItem;
}

/**
 * Single Task deployment target.
 *
 * Used when deploying all changes from a single task, which may include
 * multiple action items. This provides a more complete deployment scope
 * than individual action items.
 *
 * @example
 * ```json
 * {
 *   "kind": "task",
 *   "task": {
 *     "id": "550e8400-e29b-41d4-a716-446655440001",
 *     "state": "Done",
 *     "actionItems": [...]
 *   }
 * }
 * ```
 */
@doc("Deployment target wrapping a single Task for task-level deployments")
model DeployTargetTask {
  @doc("Discriminator indicating this is a task target")
  kind: "task";

  @doc("The task to deploy - includes all action items within the task")
  task: Task;
}

/**
 * Multiple Tasks deployment target.
 *
 * Used when deploying changes from multiple tasks simultaneously.
 * This is useful for deploying related tasks together or performing
 * integration deployments that span multiple work items.
 *
 * @example
 * ```json
 * {
 *   "kind": "tasks",
 *   "tasks": [
 *     { "id": "task-1", "state": "Done", ... },
 *     { "id": "task-2", "state": "Done", ... }
 *   ]
 * }
 * ```
 */
@doc("Deployment target wrapping multiple Tasks for batch deployments")
model DeployTargetTasks {
  @doc("Discriminator indicating this is a multi-task target")
  kind: "tasks";

  @doc("The tasks to deploy - enables batch deployment of related work")
  tasks: Task[];
}

/**
 * Union of all possible deployment targets.
 *
 * DeployTarget is a discriminated union that allows the LocalDeployAgent
 * to accept different deployment scopes. The `kind` field serves as the
 * discriminator for runtime type checking.
 *
 * ## Deployment Scope Hierarchy
 *
 * ```
 * Scope Level     | Target Type           | Use Case
 * --------------- | --------------------- | ---------------------------------
 * Granular        | DeployTargetActionItem| Single atomic change preview
 * Standard        | DeployTargetTask      | Complete task deployment
 * Batch           | DeployTargetTasks     | Multiple related tasks together
 * ```
 *
 * @see LocalDeployAgentOperations.Deploy - Accepts DeployTarget as input
 */
@doc("Target for deployment operations - can be an action item, single task, or multiple tasks")
@discriminated(#{ envelope: "none", discriminatorPropertyName: "kind" })
union DeployTarget {
  @doc("Deploy a single action item for granular change preview")
  actionItem: DeployTargetActionItem,

  @doc("Deploy a single task with all its action items")
  task: DeployTargetTask,

  @doc("Deploy multiple tasks together for batch deployments")
  tasks: DeployTargetTasks,
}
