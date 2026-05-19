/**
 * @module Shep.Domain.ValueObjects.Aspm.Exposure
 *
 * Exposure classification for an Application or adjacent asset. Used as
 * an input to the RiskScore composite — internet-exposed assets receive
 * a larger contribution from this dimension than air-gapped ones.
 */
@doc("Exposure classification for an ASPM asset")
enum Exposure {
  @doc("Reachable from the public internet")
  Internet: "Internet",

  @doc("Reachable only on internal/corporate networks")
  Internal: "Internal",

  @doc("Air-gapped — no network reachability outside a controlled boundary")
  Airgapped: "Airgapped",

  @doc("Exposure has not been declared")
  Unknown: "Unknown",
}
