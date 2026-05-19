/**
 * @module Shep.Domain.Entities.Aspm.BusinessUnit
 *
 * Top-level rollup grouping for ASPM. BusinessUnit is the coarsest
 * organizational axis — Teams roll up into BusinessUnits, and Owners
 * roll up into Teams. Posture dashboards aggregate findings by BU.
 *
 * Single-workspace MVP: BusinessUnit is a grouping field, not a hard
 * scope. Forward-compatible with future multi-workspace tenancy.
 */
import "../../../common/base.tsp";

@doc("Top-level rollup grouping for ASPM (e.g. division, product line)")
model BusinessUnit extends SoftDeletableEntity {
  @doc("Human-readable business unit name")
  name: string;

  @doc("Optional short identifier for URL slugs and CLI usage")
  slug?: string;
}
