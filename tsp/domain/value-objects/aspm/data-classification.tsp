/**
 * @module Shep.Domain.ValueObjects.Aspm.DataClassification
 *
 * Sensitivity classification for the data handled by an Application or
 * adjacent asset. Feeds the RiskScore composite — restricted-data assets
 * weight findings higher than public-data ones.
 */
@doc("Sensitivity classification for the data handled by an ASPM asset")
enum DataClassification {
  @doc("Public — no confidentiality requirements")
  Public: "Public",

  @doc("Internal — non-public business data")
  Internal: "Internal",

  @doc("Confidential — restricted to specific roles / parties")
  Confidential: "Confidential",

  @doc("Restricted — regulated data (PII, PHI, PCI, secrets)")
  Restricted: "Restricted",
}
