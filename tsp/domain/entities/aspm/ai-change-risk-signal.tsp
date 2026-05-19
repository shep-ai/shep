/**
 * @module Shep.Domain.Entities.Aspm.AiChangeRiskSignal
 *
 * AiChangeRiskSignal is Shep's purpose-built triage record for risk
 * introduced by AI-generated changes (secrets in a diff, suspicious
 * dependency additions, large unreviewed diffs, license violations,
 * prompt-injection-shaped patterns).
 *
 * Modelled as a distinct entity (not a tagged SecurityFinding) so the
 * unified Findings backlog keeps clean SLA math and exception stats.
 * Confirmed signals graduate to a SecurityFinding via
 * graduate-ai-signal-to-finding, preserving evidence and creating the
 * link back to the originating signal.
 */
import "../../../common/base.tsp";
import "../../../common/scalars.tsp";
import "../../value-objects/aspm/ai-signal-state.tsp";
import "../../value-objects/aspm/ai-signal-type.tsp";
import "../../value-objects/aspm/canonical-severity.tsp";

@doc("AI-generated change risk signal — Shep's differentiating triage record")
model AiChangeRiskSignal extends SoftDeletableEntity {
  @doc("Application this signal attaches to")
  applicationId: UUID;

  @doc("Originating Shep agent session id (so reviewers can navigate to the run)")
  agentSessionId?: string;

  @doc("Type of AI-change risk signal")
  signalType: AiSignalType;

  @doc("Canonical severity for posture rollups when graduated")
  severity: CanonicalSeverity;

  @doc("Short human-readable summary of the signal")
  summary: string;

  @doc("Free-form evidence payload (JSON-serialized — diff snippets, dep name, etc.)")
  evidence?: string;

  @doc("Lifecycle state in the AI-review queue")
  state: AiSignalState;

  @doc("Optional owner of the signal (otherwise inherits from Application)")
  ownerId?: UUID;

  @doc("If graduated, the resulting SecurityFinding id")
  graduatedFindingId?: UUID;

  @doc("When the signal was first recorded")
  discoveredAt: utcDateTime;

  @doc("When the signal was resolved, dismissed, or graduated")
  resolvedAt?: utcDateTime;
}
