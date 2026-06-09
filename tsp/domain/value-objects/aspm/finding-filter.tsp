/**
 * @module Shep.Domain.ValueObjects.Aspm.FindingFilter
 *
 * Typed filter shape reused across `list-findings`, `rank-findings`,
 * `get-campaign-progress`, and the serialized targetQuery on
 * RemediationCampaign. One filter primitive — three workflows.
 *
 * Every field is optional and represents an additional AND-narrowed
 * predicate. Empty filter = "all findings".
 */
import "../../../common/scalars.tsp";
import "./canonical-severity.tsp";
import "./finding-domain.tsp";
import "./finding-state.tsp";

@doc("Reusable filter shape for findings list / ranking / campaign queries")
model FindingFilter {
  @doc("Restrict to these canonical severities")
  severities?: CanonicalSeverity[];

  @doc("Restrict to these finding domains")
  findingDomains?: FindingDomain[];

  @doc("Restrict to findings on these applications")
  applicationIds?: UUID[];

  @doc("Restrict to findings owned by these owners")
  ownerIds?: UUID[];

  @doc("Restrict to findings with KEV-listed CVEs (true) or non-KEV (false)")
  kev?: boolean;

  @doc("Restrict to these finding states")
  states?: FindingState[];

  @doc("Restrict to these scanner rule identifiers")
  ruleIds?: string[];

  @doc("Restrict to these CVE identifiers")
  cveIds?: string[];
}
