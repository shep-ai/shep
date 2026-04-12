/**
 * @module Shep.Domain.Entities.WorkItemType
 *
 * Defines the WorkItemType entity — a classification type for work items
 * within a project (Task, Bug, Story, Feature).
 *
 * Each project gets default types on creation. Users can configure
 * which types are active and their display properties.
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";
import "../../common/enums/work-item-enums.tsp";

@doc("A work item type classification within a project")
model WorkItemType extends SoftDeletableEntity {
  @doc("Project this type belongs to")
  projectId: UUID;

  @doc("Type name (Task, Bug, Story, Feature)")
  name: WorkItemTypeName;

  @doc("Optional description of when to use this type")
  description?: string;

  @doc("Optional icon identifier for UI rendering")
  icon?: string;

  @doc("Whether this is the default type for new work items")
  isDefault: boolean = false;
}
