/**
 * @module Shep.Domain.Entities.Aspm.RemediationCampaign
 *
 * A RemediationCampaign carries a serialized [[FindingFilter]] target
 * query plus campaign metadata (owner, due date, status). Campaign
 * progress is computed at read time by re-running the query — no
 * Finding↔Campaign join table.
 *
 * The same FindingFilter value object is reused by `list-findings`,
 * `rank-findings`, and `get-campaign-progress` — one filter primitive,
 * three workflows.
 */
import "../../../common/base.tsp";
import "../../../common/scalars.tsp";
import "../../value-objects/aspm/campaign-status.tsp";
import "../../value-objects/aspm/finding-filter.tsp";

@doc("Remediation campaign with a query-shaped target and read-time progress")
model RemediationCampaign extends SoftDeletableEntity {
  @doc("Human-readable campaign name")
  name: string;

  @doc("Long-form description / sprint goal")
  description: string;

  @doc("Serialized target query — same shape as list-findings filter")
  targetQuery: FindingFilter;

  @doc("Lifecycle state of the campaign")
  status: CampaignStatus;

  @doc("Owner accountable for the campaign")
  ownerId?: UUID;

  @doc("Target completion date")
  dueDate?: utcDateTime;

  @doc("When the campaign transitioned to Completed or Cancelled")
  closedAt?: utcDateTime;
}
