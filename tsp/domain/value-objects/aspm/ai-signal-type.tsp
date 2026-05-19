/**
 * @module Shep.Domain.ValueObjects.Aspm.AiSignalType
 *
 * Classifies the rule that fired to produce an AiChangeRiskSignal. Used by
 * the AI-review queue UI to filter and route signals.
 */
@doc("Type of AI-generated change risk signal")
enum AiSignalType {
  @doc("Secret pattern detected in the AI-generated diff")
  SecretInDiff: "SecretInDiff",

  @doc("AI-generated change added a high-risk dependency")
  HighRiskDependencyAdded: "HighRiskDependencyAdded",

  @doc("AI-generated diff is unusually large and unreviewed")
  LargeUnreviewedDiff: "LargeUnreviewedDiff",

  @doc("AI-generated change introduces an incompatible license")
  LicenseViolation: "LicenseViolation",

  @doc("AI-generated text or code matches prompt-injection shapes")
  PromptInjectionShape: "PromptInjectionShape",

  @doc("Other heuristic — see signal evidence for details")
  Other: "Other",
}
