/**
 * @module Shep.Domain.Entities.Aspm.Team
 *
 * A Team groups [[Owner]] entities and rolls up posture metrics at the
 * team level for executive dashboards. Each team optionally belongs to a
 * [[BusinessUnit]] for an additional rollup dimension.
 */
import "../../../common/base.tsp";
import "../../../common/scalars.tsp";

@doc("Team groups owners and rolls up ASPM posture")
model Team extends SoftDeletableEntity {
  @doc("Human-readable team name")
  name: string;

  @doc("Optional short identifier for URL slugs and CLI usage")
  slug?: string;

  @doc("Business unit this team rolls up into")
  businessUnitId?: UUID;
}
