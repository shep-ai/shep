/**
 * @module Shep.Domain.ValueObjects.Aspm.ExceptionReason
 *
 * Typed reason taxonomy for RiskException declarations. Stored on the
 * RiskException entity alongside the human justification text for audit.
 */
@doc("Reason taxonomy for a declared risk exception")
enum ExceptionReason {
  @doc("Scanner false positive — finding does not reflect real risk")
  FalsePositive: "FalsePositive",

  @doc("Risk knowingly accepted by the owner / business")
  AcceptedRisk: "AcceptedRisk",

  @doc("Compensating control in place that mitigates the risk")
  CompensatingControl: "CompensatingControl",

  @doc("Finding is not applicable in this context")
  NotApplicable: "NotApplicable",

  @doc("Other — see justification text")
  Other: "Other",
}
