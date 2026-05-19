/**
 * @module Shep.Domain.Entities.Aspm.SecurityPolicy
 *
 * SecurityPolicy holds the workspace-wide SLA windows per canonical
 * severity (FR-19) plus ingestion safety limits (NFR-14 max document
 * size). One active policy per workspace in MVP. The active policy
 * feeds the pure-domain SLA computation.
 *
 * Defaults match CISA BOD 22-01-style expectations:
 *   Critical=7d, High=30d, Medium=90d, Low=180d.
 *
 * Info-level findings are excluded from SLA tracking by convention —
 * no Info window is required.
 */
import "../../../common/base.tsp";
import "../../value-objects/aspm/sla-window.tsp";

@doc("Workspace-wide ASPM security policy (SLA windows + ingestion limits)")
model SecurityPolicy extends SoftDeletableEntity {
  @doc("Human-readable policy name")
  name: string;

  @doc("Whether this is the active policy for the workspace (only one active)")
  active: boolean;

  @doc("SLA windows per canonical severity (calendar days)")
  slaWindows: SLAWindow[];

  @doc("Maximum ingestion document size in bytes (default 100MB)")
  maxIngestBytes: int64;
}
