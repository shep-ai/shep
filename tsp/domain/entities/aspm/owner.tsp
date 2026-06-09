/**
 * @module Shep.Domain.Entities.Aspm.Owner
 *
 * An Owner represents a person or team identifier responsible for an
 * Application, Service, ApiAsset, CloudEnvironment, or a SecurityFinding
 * derived from one of those. The ownership resolver walks YAML and UI
 * mappings to assign an Owner to every finding.
 *
 * Owners are soft-deletable for audit — closing or reassigning a finding
 * never destructively loses the historical owner record.
 *
 * Related entities: [[Team]] groups Owners; [[BusinessUnit]] groups Teams.
 */
import "../../../common/base.tsp";
import "../../../common/scalars.tsp";

@doc("Owner of ASPM assets and findings (person or team identifier)")
model Owner extends SoftDeletableEntity {
  @doc("Human-readable owner name")
  name: string;

  @doc("Optional contact handle (e.g. email, Slack handle, GitHub login)")
  handle?: string;

  @doc("Team this owner belongs to")
  teamId?: UUID;

  @doc("Free-form notes about this owner (e.g. on-call rotation, escalation)")
  notes?: string;
}
