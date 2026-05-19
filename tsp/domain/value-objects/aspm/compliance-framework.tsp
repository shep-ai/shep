/**
 * @module Shep.Domain.ValueObjects.Aspm.ComplianceFramework
 *
 * Compliance framework identifier for ComplianceControl rows. MVP ships
 * with OWASP ASVS and CWE Top 25. Regulated frameworks (SOC2, PCI DSS,
 * HIPAA) are additive rows in the same table later — no schema change.
 */
@doc("Compliance framework identifier")
enum ComplianceFramework {
  @doc("OWASP Application Security Verification Standard")
  OwaspAsvs: "OwaspAsvs",

  @doc("CWE Top 25 Most Dangerous Software Weaknesses")
  CweTop25: "CweTop25",
}
