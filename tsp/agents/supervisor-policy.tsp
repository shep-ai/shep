/**
 * @module Shep.Agents.SupervisorPolicy
 *
 * Supervisor policy that controls how a delegated supervisor agent
 * evaluates approval gates, questions, and lifecycle events.
 *
 * Supports three scope levels — global, repository, and application —
 * with optional per-feature overrides. Resolution cascade:
 * feature → repo → app → global.
 *
 * @see specs/093-agent-collaboration-supervision/research.yaml
 */
import "../common/base.tsp";

/**
 * Supervisor Scope Type
 *
 * Determines the level at which a supervisor policy applies.
 *
 * | Value  | Description                                                          |
 * |--------|----------------------------------------------------------------------|
 * | global | Applies to all agent work when no narrower policy exists             |
 * | repo   | Scoped to a specific repository (standalone or app-owned)            |
 * | app    | Scoped to a Shep application (covers all repos/features in the app) |
 */
@doc("Level at which a supervisor policy applies")
enum SupervisorScopeType {
  @doc("Global policy — applies when no narrower scope matches")
  global: "global",

  @doc("Repository-scoped policy — covers all features in a repo")
  repo: "repo",

  @doc("Application-scoped policy — covers all repos/features in the app")
  app: "app",
}

/**
 * Supervisor Autonomy
 *
 * Authority delegated to the supervisor for the configured scope.
 *
 * | Value      | Description                                                     |
 * |------------|-----------------------------------------------------------------|
 * | advisory   | Supervisor advises but cannot decide; user keeps full control   |
 * | cosign     | Both supervisor and user must approve                           |
 * | autonomous | Supervisor can decide on the user's behalf                      |
 *
 * `advisory` is the default for any new policy.
 */
@doc("Authority delegated to the supervisor for the configured scope")
enum SupervisorAutonomy {
  @doc("Supervisor advises only; user keeps full control")
  advisory: "advisory",

  @doc("Supervisor and user must both approve")
  cosign: "cosign",

  @doc("Supervisor may decide on the user's behalf")
  autonomous: "autonomous",
}

/**
 * Supervisor Policy
 *
 * Persisted policy resolved by scope cascade: feature → repo → app → global.
 * JSON columns (`gateAuthorityJson`, `policyRulesJson`,
 * `notificationOverridesJson`) carry structured config that evolves
 * independently of the row.
 *
 * Scope rules:
 * - `global` policy: `scopeId` is null, `featureId` is null
 * - `repo` policy: `scopeId` is the repository UUID
 * - `app` policy: `scopeId` is the application UUID
 * - Per-feature override: any scope type + `featureId` set
 *
 * ## Properties
 *
 * | Property                   | Type                  | Required | Description                                                  |
 * |----------------------------|-----------------------|----------|--------------------------------------------------------------|
 * | id                         | UUID                  | Yes      | Unique identifier (from BaseEntity)                          |
 * | scopeType                  | SupervisorScopeType   | Yes      | Level at which this policy applies                           |
 * | scopeId                    | string                | No       | App or repo UUID (null for global policies)                  |
 * | featureId                  | string                | No       | Optional per-feature override                                |
 * | enabled                    | boolean               | Yes      | Master enable toggle                                         |
 * | autonomyLevel              | SupervisorAutonomy    | Yes      | Default autonomy (advisory by default)                       |
 * | gateAuthorityJson          | string                | No       | Per-gate autonomy override JSON map                          |
 * | modelId                    | string                | No       | LLM model id (resolved through IAgentExecutorProvider)       |
 * | promptVersion              | string                | No       | Reproducibility marker for the evaluator prompt              |
 * | policyRulesJson            | string                | No       | JSON array of structured rules                               |
 * | notificationOverridesJson  | string                | No       | JSON object overriding notification preferences              |
 * | createdAt                  | utcDateTime           | Yes      | From BaseEntity                                              |
 * | updatedAt                  | utcDateTime           | Yes      | From BaseEntity                                              |
 */
@doc("Supervisor policy with cascading scope: global → repo → app → feature")
model SupervisorPolicy extends BaseEntity {
  @doc("Level at which this policy applies (global, repo, or app)")
  scopeType: SupervisorScopeType;

  @doc("Scope identifier — app or repo UUID (null for global policies)")
  scopeId?: string;

  @doc("Feature scope identifier (optional per-feature override)")
  featureId?: string;

  @doc("Master enable toggle")
  enabled: boolean;

  @doc("Default autonomy level (advisory by default)")
  autonomyLevel: SupervisorAutonomy;

  @doc("JSON map: per-gate autonomy override (e.g. { prd: 'advisory', merge: 'autonomous' })")
  gateAuthorityJson?: string;

  @doc("LLM model identifier resolved through IAgentExecutorProvider")
  modelId?: string;

  @doc("Evaluator prompt version marker for audit reproducibility")
  promptVersion?: string;

  @doc("JSON array of structured policy rules")
  policyRulesJson?: string;

  @doc("JSON array of deterministic GuardrailRules evaluated before the LLM evaluator")
  guardrailRulesJson?: string;

  @doc("JSON object overriding the user's notification preferences for supervisor events")
  notificationOverridesJson?: string;
}
