/**
 * @module Shep.Domain.Entities.Aspm.CloudEnvironment
 *
 * A CloudEnvironment represents a deployment target / cloud account /
 * cloud project linked to an [[Application]]. Cloud-domain findings
 * (e.g. IaC misconfigurations, runtime cloud posture) reference both
 * the application and the cloud environment.
 */
import "../../../common/base.tsp";
import "../../../common/scalars.tsp";

@doc("Cloud environment — deployment target / account / project")
model CloudEnvironment extends SoftDeletableEntity {
  @doc("Human-readable environment name (e.g. payments-prod, web-staging)")
  name: string;

  @doc("Cloud provider identifier (free-form; e.g. aws, gcp, azure, cloudflare)")
  provider: string;

  @doc("Provider-specific account / project / subscription id")
  accountId?: string;

  @doc("Application this cloud environment belongs to")
  applicationId: UUID;

  @doc("Optional owner override (otherwise inherits from Application)")
  ownerId?: UUID;

  @doc("Optional region identifier")
  region?: string;
}
