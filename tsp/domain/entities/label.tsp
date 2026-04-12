/**
 * @module Shep.Domain.Entities.Label
 *
 * Defines the Label entity — a project-scoped tag for categorizing work items.
 * Labels support one level of parent-child nesting for grouping.
 *
 * ## Invariants
 * - Label names must be unique within a project (among non-deleted labels)
 * - parentId enables one level of nesting only (parent labels cannot have a parent)
 * - A work item may have zero or more labels (many-to-many via junction table)
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";

@doc("A project-scoped label for categorizing work items")
model Label extends SoftDeletableEntity {
  @doc("Project this label belongs to")
  projectId: UUID;

  @doc("Label display name")
  name: string;

  @doc("Hex color code for UI rendering (e.g., '#ef4444')")
  color: string;

  @doc("Optional parent label ID for one-level grouping")
  parentId?: UUID;
}
