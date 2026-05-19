/**
 * @module Shep.Domain.ValueObjects.Aspm.SlaState
 *
 * Computed SLA state for a finding given the active SecurityPolicy and the
 * current time. Derived purely from (discoveredAt, canonicalSeverity, policy,
 * now) via ISlaClockPort — no persistence required.
 *
 * Bands:
 *  - Healthy : elapsed < 50% of the policy window
 *  - AtRisk  : 50% ≤ elapsed < 100% of the policy window
 *  - Breached: elapsed ≥ 100% of the policy window
 */
@doc("Computed SLA state of a security finding")
enum SlaState {
  @doc("Within healthy SLA window (< 50% elapsed)")
  Healthy: "Healthy",

  @doc("Approaching SLA breach (50%-100% elapsed)")
  AtRisk: "AtRisk",

  @doc("SLA window exceeded")
  Breached: "Breached",
}
