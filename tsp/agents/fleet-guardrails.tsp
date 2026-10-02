import "../common/base.tsp";

/**
 * Lifecycle gate targeted by a guardrail rule.
 *
 * Shared vocabulary for the fleet surfaces: a triage item parked on a gate
 * carries one of these, and `shep fleet approve --gate <type>` filters on it.
 */
@doc("Lifecycle gate target for deterministic guardrail rules")
enum GuardrailGateType {
  @doc("Applies to PRD approval gates")
  prd: "prd",

  @doc("Applies to Plan approval gates")
  plan: "plan",

  @doc("Applies to Merge/PR review approval gates")
  merge: "merge",

  @doc("Applies to all approval gates")
  all: "all",
}

/**
 * Deterministic criteria-based rule governing gate approvals and escalations.
 *
 * Rules are evaluated in pure TypeScript *before* the supervisor's LLM
 * evaluator runs. A rule never short-circuits another rule: every rule matching
 * the gate must pass before a gate can be auto-approved, so adding a stricter
 * rule can only ever make the outcome safer.
 *
 * A rule with no criteria at all (`{ gate: "all", autoApprove: true }`) passes
 * trivially — that is the explicit "approve everything" configuration.
 */
@doc("Deterministic criteria-based rule governing gate approvals and escalations")
model GuardrailRule {
  @doc("Unique identifier for this rule")
  id: string;

  @doc("Which gate this rule governs (prd, plan, merge, or all)")
  gate: GuardrailGateType;

  @doc("Maximum lines of diff permitted for auto-approval")
  maxDiffLines?: int32;

  @doc("Maximum number of files changed permitted for auto-approval")
  maxFilesChanged?: int32;

  @doc("Glob patterns that trigger mandatory escalation if touched (e.g. auth/**, migrations/**)")
  blockedPathPatterns?: string[];

  @doc("Whether CI pipeline must be passing for auto-approval")
  requireCiPass?: boolean;

  @doc("Whether auto-approval is granted when all criteria pass (false = advise only)")
  autoApprove: boolean;
}

/**
 * Outcome of evaluating guardrail rules against a feature run.
 */
@doc("Result of evaluating deterministic guardrail rules against an approval gate")
model GuardrailEvaluationResult {
  @doc("True if all criteria are satisfied")
  passed: boolean;

  @doc("True if the gate should be auto-approved without human intervention")
  autoApproved: boolean;

  @doc("Rule that decided the outcome, when a single rule is responsible")
  ruleId?: string;

  @doc("List of violation reasons if any criteria failed")
  violations: string[];

  @doc("Human-readable explanation of the evaluation")
  rationale: string;
}
