/**
 * @module Shep.Domain.Entities.PmProject
 *
 * Defines the PmProject entity — a standalone project container for
 * project management work items, cycles, modules, and pages.
 *
 * PmProject is a separate aggregate root from Application. It has an
 * optional applicationId FK for linking to an AI workspace but no hard
 * dependency. Named "PmProject" to avoid collision with the existing
 * CreateProjectUseCase (filesystem scaffolding).
 *
 * ## Invariants
 * - identifierPrefix must be 2-5 uppercase letters, unique across non-deleted projects
 * - workItemCounter is atomically incremented when creating work items
 * - Each project must have at least one state in Backlog and Completed groups
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";
import "../../common/enums/work-item-enums.tsp";

@doc("A project management container for work items, cycles, and modules")
model PmProject extends SoftDeletableEntity {
  @doc("Human-readable project name")
  name: string;

  @doc("URL-friendly identifier derived from name")
  slug: string;

  @doc("Project description")
  description?: string;

  @doc("Short prefix for work item IDs (2-5 uppercase letters, e.g., PROJ)")
  identifierPrefix: string;

  @doc("Atomic counter for sequential work item ID generation")
  workItemCounter: int32 = 0;

  @doc("Estimation system used by this project")
  estimateType: EstimateType = EstimateType.Category;

  @doc("Optional link to an Application (AI workspace)")
  applicationId?: UUID;

  @doc("Project start date")
  startDate?: utcDateTime;

  @doc("Project end date")
  endDate?: utcDateTime;

  @doc("Feature toggles JSON — enables/disables cycles, modules, epics, pages, intake, time tracking")
  featureToggles?: string;
}
