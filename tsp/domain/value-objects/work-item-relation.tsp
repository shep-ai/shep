/**
 * @module Shep.Domain.ValueObjects.WorkItemRelation
 *
 * Defines the WorkItemRelation value object — a directional relationship
 * between two work items. Each relation has a source (from) and target (to)
 * with a specific relation type.
 *
 * ## Invariants
 * - sourceWorkItemId and targetWorkItemId must be different
 * - RelationType determines the semantic meaning of the direction
 * - Blocking: source blocks target
 * - Duplicate: source is a duplicate of target
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";
import "../../common/enums/work-item-enums.tsp";

@doc("A directional relationship between two work items")
model WorkItemRelation extends BaseEntity {
  @doc("Source work item ID (the 'from' side)")
  sourceWorkItemId: UUID;

  @doc("Target work item ID (the 'to' side)")
  targetWorkItemId: UUID;

  @doc("Type of relationship")
  relationType: RelationType;
}
