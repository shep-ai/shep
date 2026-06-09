/**
 * @module Shep.Domain.ValueObjects.Aspm.FindingDomain
 *
 * Classifies the source/kind of a SecurityFinding. Used by ingestion
 * adapters to tag findings and by the UI/CLI to filter the unified
 * findings stream.
 */
@doc("Category of security finding (source/kind)")
enum FindingDomain {
  @doc("Source-code finding (SAST, lint-style security rules)")
  Code: "Code",

  @doc("Dependency / SBOM vulnerability (CVE in a third-party library)")
  Dependency: "Dependency",

  @doc("Secret leaked in code or config (token, key, credential)")
  Secret: "Secret",

  @doc("Container image vulnerability (base image, installed packages)")
  Container: "Container",

  @doc("Cloud misconfiguration (IaC, runtime cloud posture)")
  Cloud: "Cloud",

  @doc("API security finding (auth, schema, exposure)")
  Api: "Api",

  @doc("Identity / IAM finding (over-privileged role, stale credential)")
  Identity: "Identity",

  @doc("Runtime security signal (telemetry-derived risk)")
  Runtime: "Runtime",

  @doc("Compliance / policy violation")
  Compliance: "Compliance",

  @doc("AI-generated change risk graduated to a finding")
  Ai: "Ai",
}
