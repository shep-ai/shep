/**
 * @module Shep.Domain.Entities.PmModule
 *
 * Defines the PmModule entity — an epic-like grouping of work items.
 *
 * Modules group related work items across cycles, with lifecycle tracking
 * and progress calculation. Named "PmModule" to avoid collision with the
 * TypeScript `module` keyword.
 *
 * ## Invariants
 * - Work items can belong to multiple modules (many-to-many via module_work_items)
 * - Progress is computed as percentage of assigned items in Completed state group
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";
import "../../common/enums/work-item-enums.tsp";

@doc("An epic-like grouping of related work items within a project")
model PmModule extends SoftDeletableEntity {
  @doc("Parent project this module belongs to")
  projectId: UUID;

  @doc("Human-readable module name")
  name: string;

  @doc("Optional description of module scope and goals")
  description?: string;

  @doc("Current lifecycle status")
  status: ModuleStatus = ModuleStatus.Backlog;

  @doc("Optional lead/owner for this module")
  leadId?: string;

  @doc("Module start date")
  startDate?: utcDateTime;

  @doc("Module end date")
  endDate?: utcDateTime;
}
