/**
 * @module Shep.Domain.ValueObjects.ActivityEntry
 *
 * Defines the ActivityEntry value object — an immutable record of a
 * single field change on a work item. Activity entries form the audit
 * trail / activity feed for work items.
 *
 * ## Invariants
 * - Activity entries are append-only: no updates or deletes (NFR-8)
 * - Each entry records exactly one field change with old and new values
 * - Values are stored as text representations regardless of original type
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";

@doc("An immutable record of a field change on a work item")
model ActivityEntry extends BaseEntity {
  @doc("Work item this activity belongs to")
  workItemId: UUID;

  @doc("Name of the field that changed (e.g., 'state', 'priority', 'title')")
  fieldName: string;

  @doc("Previous value as text (null for creation events)")
  oldValue?: string;

  @doc("New value as text")
  newValue?: string;

  @doc("ID of the actor who made the change")
  actorId: string;
}
