/**
 * @module Shep.Domain.ValueObjects.Aspm.Criticality
 *
 * Business criticality tier for an Application or adjacent asset.
 * Tier1 = revenue/regulatory critical; Tier3 = experimental / internal-only.
 * Used as a multiplier in the RiskScore composite.
 */
@doc("Business criticality tier for an ASPM asset")
enum Criticality {
  @doc("Tier 1 — business-critical / revenue or regulated")
  Tier1: "Tier1",

  @doc("Tier 2 — important but not business-critical")
  Tier2: "Tier2",

  @doc("Tier 3 — experimental / internal-only")
  Tier3: "Tier3",
}
