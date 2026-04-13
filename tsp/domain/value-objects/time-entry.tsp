/**
 * @module Shep.Domain.ValueObjects.TimeEntry
 *
 * Defines the TimeEntry value object — a record of time logged against
 * a work item. Used for time tracking and worklog reports.
 *
 * ## Invariants
 * - Duration is stored in minutes (integer)
 * - loggedAt records when the work was performed (not when the entry was created)
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";

@doc("A record of time logged against a work item")
model TimeEntry extends BaseEntity {
  @doc("Work item this time entry is logged against")
  workItemId: UUID;

  @doc("Duration of work in minutes")
  durationMinutes: int32;

  @doc("Optional note describing the work performed")
  note?: string;

  @doc("When the work was performed")
  loggedAt: utcDateTime;
}
