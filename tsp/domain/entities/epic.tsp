/**
 * @module Shep.Domain.Entities.Epic
 *
 * Defines the Epic entity — a large container within a project that
 * groups related work items. A work item belongs to at most one Epic.
 *
 * ## Invariants
 * - Epics are scoped to a single project
 * - A work item can belong to at most one Epic (enforced at application layer)
 * - Status follows the EpicStatus enum lifecycle
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";
import "../../common/enums/work-item-enums.tsp";

@doc("A large container within a project that groups related work items")
model Epic extends SoftDeletableEntity {
  @doc("Project this epic belongs to")
  projectId: UUID;

  @doc("Epic name")
  name: string;

  @doc("Optional description of the epic's scope and goals")
  description?: string;

  @doc("Current lifecycle status")
  status: EpicStatus = EpicStatus.Backlog;

  @doc("Planned start date")
  startDate?: utcDateTime;

  @doc("Target end date")
  endDate?: utcDateTime;
}
