/**
 * @module Shep.Domain.Entities.WorkItem
 *
 * Defines the WorkItem entity — the central unit of work in the PM system.
 * WorkItem is a separate aggregate root from Feature; they are independent
 * entities with optional linking via a relation table.
 *
 * ## Invariants
 * - sequenceId is atomically generated per project (PROJ-1, PROJ-2, ...)
 * - identifierPrefix is denormalized from the project for fast display
 * - Parent-child hierarchy supports max 3 levels of nesting
 * - stateId must reference a valid WorkItemState in the same project
 * - sortOrder (float64) enables manual ordering with insertion between items
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";
import "../../common/enums/work-item-enums.tsp";

@doc("A unit of work within a project — issue, task, bug, or story")
model WorkItem extends SoftDeletableEntity {
  @doc("Project this work item belongs to")
  projectId: UUID;

  @doc("Sequential number within the project (e.g., 42 in PROJ-42)")
  sequenceId: int32;

  @doc("Denormalized project prefix for display (e.g., 'PROJ')")
  identifierPrefix: string;

  @doc("Work item title (required)")
  title: string;

  @doc("Rich text description stored as JSON (TipTap/ProseMirror format)")
  description?: string;

  @doc("Current workflow state ID")
  stateId: UUID;

  @doc("Priority level")
  priority: Priority = Priority.None;

  @doc("Parent work item ID for sub-item hierarchy (max 3 levels)")
  parentId?: UUID;

  @doc("Manual sort order (float64 for insertion between items)")
  sortOrder: float64 = 0;

  @doc("Planned start date")
  startDate?: utcDateTime;

  @doc("Target due date")
  dueDate?: utcDateTime;

  @doc("Estimate value — category label (XS/S/M/L/XL) or numeric string")
  estimateValue?: string;

  @doc("Custom property values as JSON object keyed by property ID")
  customPropertyValues?: string;
}
