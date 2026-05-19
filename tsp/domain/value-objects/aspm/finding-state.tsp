/**
 * @module Shep.Domain.ValueObjects.Aspm.FindingState
 *
 * Lifecycle states for a SecurityFinding. Distinct from the *effective*
 * state seen by posture rollups — an Active RiskException temporarily
 * masks the underlying state at read time.
 */
@doc("Lifecycle state of a security finding")
enum FindingState {
  @doc("Newly ingested, not yet triaged")
  Open: "Open",

  @doc("Triaged — assigned an owner and confirmed real")
  Triaged: "Triaged",

  @doc("Active remediation in progress")
  InProgress: "InProgress",

  @doc("Remediated — code/config fix verified")
  Resolved: "Resolved",

  @doc("Closed without remediation (duplicate, withdrawn, etc.)")
  Closed: "Closed",

  @doc("Active RiskException — temporarily excluded from posture")
  Exception: "Exception",
}
