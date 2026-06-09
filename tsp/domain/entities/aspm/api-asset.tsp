/**
 * @module Shep.Domain.Entities.Aspm.ApiAsset
 *
 * An ApiAsset represents an external- or internal-facing API surface
 * attached to an [[Application]]. API findings (e.g. broken auth,
 * schema drift) reference both the application and the api asset for
 * targeted triage.
 */
import "../../../common/base.tsp";
import "../../../common/scalars.tsp";
import "../../value-objects/aspm/exposure.tsp";

@doc("API asset — external or internal API surface attached to an Application")
model ApiAsset extends SoftDeletableEntity {
  @doc("Human-readable API asset name")
  name: string;

  @doc("Base URL of the API (e.g. https://api.example.com/v1)")
  baseUrl?: string;

  @doc("Application this API asset belongs to")
  applicationId: UUID;

  @doc("Optional owner override (otherwise inherits from Application)")
  ownerId?: UUID;

  @doc("Optional exposure override (otherwise inherits from Application)")
  exposure?: Exposure;

  @doc("Optional path to the API schema file (POSIX separators, repo-relative)")
  schemaPath?: string;
}
