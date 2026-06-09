/**
 * @module Shep.Domain.ValueObjects.Aspm.CanonicalSeverity
 *
 * Canonical 5-level severity used across ASPM. Every SecurityFinding stores
 * both the raw scanner severity string AND a CanonicalSeverity so the UI,
 * SLA math, posture rollups, and campaign queries can operate on a single
 * comparable scale.
 *
 * Bands align with CVSS v3.1 severity ranges:
 *  - Critical: 9.0–10.0
 *  - High:     7.0–8.9
 *  - Medium:   4.0–6.9
 *  - Low:      0.1–3.9
 *  - Info:     0.0 (informational, no impact)
 */
@doc("Canonical 5-level severity for ASPM findings (aligned with CVSS v3.1 bands)")
enum CanonicalSeverity {
  @doc("Critical — CVSS 9.0-10.0 equivalent")
  Critical: "Critical",

  @doc("High — CVSS 7.0-8.9 equivalent")
  High: "High",

  @doc("Medium — CVSS 4.0-6.9 equivalent")
  Medium: "Medium",

  @doc("Low — CVSS 0.1-3.9 equivalent")
  Low: "Low",

  @doc("Informational — no actionable impact")
  Info: "Info",
}
