/**
 * @module Shep.Domain.Entities.Cycle
 *
 * Defines the Cycle entity — a time-boxed iteration (sprint) within a project.
 *
 * Cycles group work items into fixed-duration sprints with start/end dates.
 * Only one cycle per project can be Active at any given time; others are
 * Upcoming or Completed.
 *
 * ## Invariants
 * - Only one cycle per project may have status Active
 * - startDate must be before endDate
 * - Work items are associated via a many-to-many junction table (cycle_work_items)
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";
import "../../common/enums/work-item-enums.tsp";

@doc("A time-boxed iteration (sprint) within a project")
model Cycle extends SoftDeletableEntity {
  @doc("Parent project this cycle belongs to")
  projectId: UUID;

  @doc("Human-readable cycle name (e.g., Sprint 1)")
  name: string;

  @doc("Optional description of sprint goals")
  description?: string;

  @doc("Current lifecycle status")
  status: CycleStatus = CycleStatus.Upcoming;

  @doc("Sprint start date")
  startDate?: utcDateTime;

  @doc("Sprint end date")
  endDate?: utcDateTime;
}
