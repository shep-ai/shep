import "../common/base.tsp";

/**
 * Lifecycle gate targeted by a guardrail rule.
 *
 * Shared vocabulary for the fleet surfaces: a triage item parked on a gate
 * carries one of these, and `shep fleet approve --gate <type>` filters on it.
 * Guardrail rules themselves (`GuardrailRule`, `GuardrailEvaluationResult`)
 * land with the guardrails slice.
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
