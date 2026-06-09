/**
 * @module Shep.Domain.ValueObjects.Aspm.ScanStageName
 *
 * Closed set of stages the scan orchestrator knows how to run. The list
 * mirrors the FindingDomain enum 1-to-1 except for `sbom` which is a
 * prerequisite for the `sca` stage (SBOM has to exist before OSV can
 * query against it).
 */
@doc("Identifier of a single stage executed by ScanApplicationUseCase")
enum ScanStageName {
  @doc("Software Bill of Materials build (in-house, 9 ecosystems)")
  Sbom: "sbom",

  @doc("Software Composition Analysis — OSV.dev lookup over the SBOM")
  Sca: "sca",

  @doc("Secret scanning (regex + Shannon entropy, in-house)")
  Secrets: "secrets",

  @doc("Static Application Security Testing — agent-driven")
  Sast: "sast",

  @doc("Container hardening checks — agent-driven")
  Container: "container",

  @doc("Infrastructure-as-Code misconfiguration checks — agent-driven")
  Iac: "iac",
}
