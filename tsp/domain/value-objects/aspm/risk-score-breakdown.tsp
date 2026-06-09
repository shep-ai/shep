/**
 * @module Shep.Domain.ValueObjects.Aspm.RiskScoreBreakdown
 *
 * Audit-friendly breakdown of the composite RiskScore. Stored alongside
 * the score on the RiskScore entity so the UI can render the contribution
 * of each dimension and so a future postmortem can reconstruct why a
 * specific finding was prioritized.
 *
 * Sum of all *Contribution fields equals `total` (modulo rounding).
 */
@doc("Per-dimension breakdown of a composite RiskScore total")
model RiskScoreBreakdown {
  @doc("Total composite score, 0-100 inclusive")
  total: int32;

  @doc("Contribution from CVSS base severity")
  cvssContribution: float64;

  @doc("Contribution from EPSS exploitability percentile")
  epssContribution: float64;

  @doc("Contribution from CISA KEV membership")
  kevContribution: float64;

  @doc("Contribution from asset exposure")
  exposureContribution: float64;

  @doc("Contribution from asset criticality tier")
  criticalityContribution: float64;

  @doc("Contribution from data classification")
  dataClassificationContribution: float64;
}
