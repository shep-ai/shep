/**
 * @module Shep.Domain.ValueObjects.Aspm.AiSignalState
 *
 * Lifecycle states for an AiChangeRiskSignal. Separate from FindingState
 * so the AI-review queue and the unified Findings backlog can be triaged
 * independently. A confirmed signal graduates to a SecurityFinding via
 * graduate-ai-signal-to-finding.
 */
@doc("Lifecycle state of an AI-change risk signal")
enum AiSignalState {
  @doc("Newly recorded, awaiting reviewer triage")
  Open: "Open",

  @doc("Reviewer acknowledged but not yet resolved")
  Acknowledged: "Acknowledged",

  @doc("Confirmed and converted into a SecurityFinding")
  GraduatedToFinding: "GraduatedToFinding",

  @doc("Dismissed as a false positive")
  Dismissed: "Dismissed",

  @doc("Resolved without graduation (signal addressed in place)")
  Resolved: "Resolved",
}
