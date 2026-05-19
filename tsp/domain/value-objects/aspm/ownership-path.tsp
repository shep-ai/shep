/**
 * @module Shep.Domain.ValueObjects.Aspm.OwnershipPath
 *
 * A single entry parsed from .shep/ownership.yaml or declared via the UI.
 * Maps a path glob to an Owner / Team / BusinessUnit. The ownership resolver
 * walks these in deterministic priority order to compute the effective
 * owner for a finding.
 */
import "../../../common/scalars.tsp";

@doc("A single ownership mapping (path glob -> owner/team/business unit)")
model OwnershipPath {
  @doc("Path glob this mapping applies to (POSIX separators, repo-relative)")
  pathGlob: string;

  @doc("Owner UUID assigned to this path")
  ownerId: UUID;

  @doc("Team UUID assigned to this path")
  teamId?: UUID;

  @doc("BusinessUnit UUID assigned to this path")
  businessUnitId?: UUID;

  @doc("Source of the mapping (yaml | ui)")
  source: string;
}
