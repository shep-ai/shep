/**
 * @module Shep.Domain.Entities.Aspm.Service
 *
 * A Service is an adjacent asset attached to an [[Application]] — a
 * sub-process, daemon, or runtime concern that warrants its own finding
 * stream while remaining anchored to the Application for ownership and
 * rollups. Findings reference an applicationId AND an optional serviceId.
 */
import "../../../common/base.tsp";
import "../../../common/scalars.tsp";
import "../../value-objects/aspm/exposure.tsp";

@doc("Service — adjacent asset attached to an Application")
model Service extends SoftDeletableEntity {
  @doc("Human-readable service name")
  name: string;

  @doc("Optional short identifier for URL slugs and CLI usage")
  slug?: string;

  @doc("Application this service belongs to")
  applicationId: UUID;

  @doc("Optional owner override (otherwise inherits from Application)")
  ownerId?: UUID;

  @doc("Optional exposure override (otherwise inherits from Application)")
  exposure?: Exposure;
}
