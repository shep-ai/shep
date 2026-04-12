/**
 * @module Shep.Domain.Entities.SavedView
 *
 * Defines the SavedView entity — a persisted view configuration for
 * work items within a project. Stores layout type, filters, grouping,
 * sorting, and display property preferences as a JSON blob.
 *
 * ## Invariants
 * - configuration is an opaque JSON blob consumed by the presentation layer
 * - layout is a separate indexed column for filtering views by type
 * - isPublic determines visibility within a project
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";
import "../../common/enums/work-item-enums.tsp";

@doc("A saved view configuration for work items in a project")
model SavedView extends SoftDeletableEntity {
  @doc("Project this view belongs to")
  projectId: UUID;

  @doc("Display name for the saved view")
  name: string;

  @doc("Optional description")
  description?: string;

  @doc("Whether this view is visible to all project members")
  isPublic: boolean = false;

  @doc("Layout type for this view")
  layout: ViewLayout;

  @doc("Full view configuration as JSON (filters, grouping, sorting, display properties)")
  configuration: string;

  @doc("ID of the user who created this view")
  createdBy?: string;
}
