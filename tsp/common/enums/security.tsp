/**
 * @module Shep.Common.Enums.Security
 *
 * Defines enums for the supply-chain security subsystem. These enums control
 * security mode behavior, classify risky agent actions, determine enforcement
 * dispositions, and grade finding severity.
 *
 * ## Security Mode
 *
 * | Mode     | Behavior                                    |
 * |----------|---------------------------------------------|
 * | Disabled | No security checks, legacy permissive mode  |
 * | Advisory | Evaluate and surface findings, never block   |
 * | Enforce  | Block risky actions and fail CI on violation |
 *
 * ## Action Categories (FR-7)
 *
 * Five coarse categories for runtime guardrails:
 * - DependencyInstall — npm/pnpm/yarn install or upgrade
 * - PackageScriptExec — package.json lifecycle scripts
 * - CiWorkflowModify — changes to CI/release workflow files
 * - PublishRelease — npm publish or semantic-release
 * - SandboxEscalation — requests to relax agent sandbox
 */
/**
 * The effective security mode for a repository.
 *
 * Controls whether security policy is disabled, advisory-only (surface
 * findings without blocking), or enforced (block risky actions and fail CI).
 */
@doc("Effective security mode for a repository")
enum SecurityMode {
  @doc("No security checks — legacy permissive behavior")
  Disabled: "Disabled",

  @doc("Evaluate policy and surface findings without blocking")
  Advisory: "Advisory",

  @doc("Block risky actions and fail CI on policy violations")
  Enforce: "Enforce",
}

/**
 * Categories of risky agent actions subject to runtime guardrails.
 *
 * Matches the five categories defined in FR-7. Each category maps to a
 * set of runtime behaviors that the executeNode() pattern intercepts.
 */
@doc("Categories of risky agent actions for runtime guardrails")
enum SecurityActionCategory {
  @doc("Dependency installation or upgrade (npm/pnpm/yarn install)")
  DependencyInstall: "DependencyInstall",

  @doc("Package-manager lifecycle script execution (preinstall, postinstall)")
  PackageScriptExec: "PackageScriptExec",

  @doc("CI or release workflow file modification")
  CiWorkflowModify: "CiWorkflowModify",

  @doc("Publish or release action (npm publish, semantic-release)")
  PublishRelease: "PublishRelease",

  @doc("Request to relax agent sandbox restrictions")
  SandboxEscalation: "SandboxEscalation",
}

/**
 * How a security action should be handled at runtime.
 *
 * Each action category is mapped to a disposition in the security policy.
 * - Allowed: proceed without interruption
 * - Denied: block before execution, record violation event
 * - ApprovalRequired: route through HITL interrupt for explicit approval
 */
@doc("Enforcement disposition for a security action category")
enum SecurityActionDisposition {
  @doc("Action is allowed without restriction")
  Allowed: "Allowed",

  @doc("Action is denied — blocked before execution")
  Denied: "Denied",

  @doc("Action requires explicit human approval via HITL interrupt")
  ApprovalRequired: "ApprovalRequired",
}

/**
 * Severity level for security findings and events.
 *
 * | Severity | Examples                                     |
 * |----------|----------------------------------------------|
 * | Low      | Informational — version range is permissive  |
 * | Medium   | Dependency uses git source instead of registry|
 * | High     | Lifecycle scripts detected in dependency      |
 * | Critical | Lockfile missing or tampered                  |
 */
@doc("Severity level for security findings")
enum SecuritySeverity {
  @doc("Informational finding with minimal risk")
  Low: "Low",

  @doc("Finding with moderate risk requiring attention")
  Medium: "Medium",

  @doc("Significant risk that should be remediated")
  High: "High",

  @doc("Critical risk requiring immediate action")
  Critical: "Critical",
}

/**
 * Type of dependency risk detected by the evaluator.
 */
@doc("Type of dependency risk finding")
enum DependencyRiskType {
  @doc("Manifest and lockfile are inconsistent")
  LockfileInconsistency: "LockfileInconsistency",

  @doc("Dependency uses a non-registry source (git, file, url)")
  NonRegistrySource: "NonRegistrySource",

  @doc("Dependency contains risky lifecycle scripts")
  LifecycleScript: "LifecycleScript",

  @doc("Dependency is on the policy denylist")
  DenylistViolation: "DenylistViolation",

  @doc("Dependency is not on the required allowlist")
  AllowlistViolation: "AllowlistViolation",

  @doc("Version range is too permissive per policy")
  VersionRangePolicy: "VersionRangePolicy",
}

/**
 * Type of release integrity check performed.
 */
@doc("Type of release integrity check")
enum ReleaseIntegrityCheckType {
  @doc("Verify release runs in CI, not locally")
  CiOnlyPublishing: "CiOnlyPublishing",

  @doc("Verify secrets are configured as GitHub Actions secrets")
  SecretConfiguration: "SecretConfiguration",

  @doc("Verify npm provenance flags are present")
  ProvenanceConfiguration: "ProvenanceConfiguration",

  @doc("Verify release workflow has not been tampered with")
  WorkflowIntegrity: "WorkflowIntegrity",
}
