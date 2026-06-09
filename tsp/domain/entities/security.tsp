/**
 * @module Shep.Domain.Entities.Security
 *
 * Defines the security domain models for the supply-chain security subsystem.
 * These models represent security policy configuration, runtime events,
 * dependency findings, release integrity results, and effective policy snapshots.
 *
 * ## Model Hierarchy
 *
 * ```
 * SupplyChainSecurityPolicy — Policy rules from shep.security.yaml
 * SecurityEvent           — Persisted security event (extends BaseEntity)
 * DependencyFinding       — Single dependency risk finding
 * ReleaseIntegrityCheck   — Single release integrity check result
 * ReleaseIntegrityResult  — Aggregated release integrity outcome
 * EffectivePolicySnapshot — Computed effective policy at evaluation time
 * ActionDispositionEntry  — Map entry: action category → disposition
 * DependencyRules         — Policy rules for dependency risk evaluation
 * ReleaseRules            — Policy rules for release integrity checks
 * ```
 *
 * ## Persistence
 *
 * SecurityEvent is the only model persisted to its own table (security_events).
 * SecurityPolicy is read from the shep.security.yaml file.
 * EffectivePolicySnapshot is computed at runtime from policy + settings.
 * DependencyFinding and ReleaseIntegrityResult are transient evaluation outputs.
 */
import "../../common/base.tsp";
import "../../common/enums/security.tsp";

/**
 * A single mapping from an action category to its enforcement disposition.
 *
 * Used as an array entry in SecurityPolicy to represent the action disposition
 * map, since TypeSpec does not support native map types.
 */
@doc("Mapping of an action category to its enforcement disposition")
model ActionDispositionEntry {
  @doc("The action category")
  category: SecurityActionCategory;

  @doc("How this action should be handled")
  disposition: SecurityActionDisposition;
}

/**
 * Policy rules for dependency risk evaluation.
 *
 * Configures which dependency checks are active and provides
 * allowlists/denylists for the dependency risk evaluator.
 */
@doc("Dependency risk evaluation policy rules")
model DependencyRules {
  @doc("Check manifest-lockfile consistency (default: true)")
  checkLockfileConsistency: boolean = true;

  @doc("Flag packages with lifecycle scripts (default: true)")
  checkLifecycleScripts: boolean = true;

  @doc("Flag non-registry dependency sources (default: true)")
  checkNonRegistrySource: boolean = true;

  @doc("Enforce strict version ranges — no ^ or * (default: false)")
  enforceStrictVersionRanges: boolean = false;

  @doc("Packages explicitly allowed (empty = allow all)")
  allowlist: string[] = #[];

  @doc("Packages explicitly denied")
  denylist: string[] = #[];
}

/**
 * Policy rules for release integrity checks.
 *
 * Configures which release checks are active for the publish-path
 * enforcement flow.
 */
@doc("Release integrity policy rules")
model ReleaseRules {
  @doc("Require publishing from CI only, not local (default: true)")
  requireCiOnlyPublishing: boolean = true;

  @doc("Require npm provenance flags on publish (default: true)")
  requireProvenance: boolean = true;

  @doc("Check that release workflow has not been tampered with (default: true)")
  checkWorkflowIntegrity: boolean = true;
}

/**
 * Security policy as read from shep.security.yaml.
 *
 * Defines the repository's security posture: which mode to use, how each
 * action category is handled, and what dependency/release rules apply.
 *
 * Named SupplyChainSecurityPolicy to disambiguate from the ASPM SecurityPolicy
 * (workspace-wide SLA windows) defined in tsp/domain/entities/aspm/security-policy.tsp.
 */
@doc("Security policy configuration from shep.security.yaml")
model SupplyChainSecurityPolicy {
  @doc("Desired security mode for this repository")
  mode: SecurityMode;

  @doc("Per-action-category enforcement dispositions")
  actionDispositions: ActionDispositionEntry[];

  @doc("Dependency risk evaluation rules")
  dependencyRules: DependencyRules;

  @doc("Release integrity check rules")
  releaseRules: ReleaseRules;
}

/**
 * Persisted security event tied to a repository and optionally a feature run.
 *
 * Security events record policy violations, approval decisions, and
 * enforcement outcomes. They are queryable from the Control Center and
 * CLI and subject to 90-day retention.
 */
@doc("Persisted security event for audit and observability")
model SecurityEvent extends BaseEntity {
  @doc("Absolute path to the repository this event belongs to")
  repositoryPath: string;

  @doc("Feature ID if this event occurred during a feature run")
  featureId?: string;

  @doc("Severity of this security event")
  severity: SecuritySeverity;

  @doc("Action category that triggered this event")
  category: SecurityActionCategory;

  @doc("How the action was handled (allowed, denied, approval-required)")
  disposition: SecurityActionDisposition;

  @doc("Actor or source that triggered this event (agent, user, CI)")
  actor?: string;

  @doc("Human-readable event description")
  message?: string;

  @doc("Actionable remediation guidance")
  remediationSummary?: string;
}

/**
 * A single dependency risk finding from the evaluator.
 *
 * Represents one detected risk in a project dependency. Transient —
 * produced during evaluation and included in enforcement output.
 */
@doc("Single dependency risk finding")
model DependencyFinding {
  @doc("Package name (e.g. 'lodash', '@types/node')")
  packageName: string;

  @doc("Package version or range (e.g. '^4.17.0')")
  version?: string;

  @doc("Severity of this finding")
  severity: SecuritySeverity;

  @doc("Type of dependency risk detected")
  riskType: DependencyRiskType;

  @doc("Human-readable description of the finding")
  message: string;

  @doc("Actionable remediation guidance")
  remediation?: string;
}

/**
 * A single release integrity check result.
 */
@doc("Result of a single release integrity check")
model ReleaseIntegrityCheck {
  @doc("Type of check performed")
  checkType: ReleaseIntegrityCheckType;

  @doc("Whether this check passed")
  passed: boolean;

  @doc("Human-readable description of the result")
  message: string;

  @doc("Severity when this check fails")
  severity: SecuritySeverity;
}

/**
 * Aggregated result of all release integrity checks.
 */
@doc("Aggregated release integrity evaluation result")
model ReleaseIntegrityResult {
  @doc("Individual check results")
  checks: ReleaseIntegrityCheck[];

  @doc("Whether all checks passed")
  passed: boolean;
}

/**
 * Snapshot of the computed effective policy at evaluation time.
 *
 * Produced by the policy engine after merging global defaults with
 * repository policy. Includes the resolved mode, source origin,
 * evaluation timestamp, and the final action dispositions.
 */
@doc("Computed effective security policy snapshot")
model EffectivePolicySnapshot {
  @doc("Resolved effective security mode")
  mode: SecurityMode;

  @doc("Where the policy was sourced from (e.g. 'shep.security.yaml', 'settings-default')")
  source: string;

  @doc("ISO timestamp when this snapshot was computed")
  evaluatedAt: string;

  @doc("Resolved per-action-category enforcement dispositions")
  actionDispositions: ActionDispositionEntry[];
}
