/**
 * @module Shep.Domain.Entities.WorkItemState
 *
 * Defines the WorkItemState entity — a customizable workflow state
 * within a project. States belong to one of five fixed semantic groups
 * (Backlog, Unstarted, Started, Completed, Cancelled) that provide
 * the foundation for analytics.
 *
 * ## Invariants
 * - Each state must belong to exactly one StateGroup
 * - Each project must have at least one state in Backlog and Completed groups
 * - Exactly one state per project can be marked as default (isDefault=true)
 * - displayOrder determines rendering sequence within the project
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";
import "../../common/enums/work-item-enums.tsp";

@doc("A customizable workflow state within a project, belonging to a fixed semantic group")
model WorkItemState extends SoftDeletableEntity {
  @doc("Project this state belongs to")
  projectId: UUID;

  @doc("Display name for the state (e.g., 'In Review', 'QA Testing')")
  name: string;

  @doc("Hex color code for UI rendering (e.g., '#3b82f6')")
  color: string;

  @doc("Position in the state list for ordering")
  displayOrder: int32;

  @doc("Semantic group this state belongs to — used for analytics and burndown")
  stateGroup: StateGroup;

  @doc("Whether this is the default state for new work items in the project")
  isDefault: boolean = false;
}
