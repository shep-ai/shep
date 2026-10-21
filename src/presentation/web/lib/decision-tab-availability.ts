import type { FeatureArtifact, ResearchArtifact } from '@shepai/core/domain/generated/output';

/** Whether each spec-decisions drawer tab would render any content. */
export interface DecisionTabAvailability {
  hasTechDecisions: boolean;
  hasProductDecisions: boolean;
}

/**
 * Derive the decisions-tab flags from the artifacts those tabs read, so the
 * drawer can hide an empty tab from server data instead of client fetch state.
 *
 * Mirrors the tabs exactly:
 * - Tech Decisions reads `research.yaml`; `TechDecisionsContent` renders
 *   nothing for an empty `decisions` list.
 * - Product reads `spec.yaml` and lists only `resolved` open questions.
 * - An artifact that could not be read (`null`) renders "No … available."
 */
export function toDecisionTabAvailability(
  research: ResearchArtifact | null,
  spec: FeatureArtifact | null
): DecisionTabAvailability {
  return {
    hasTechDecisions: (research?.decisions.length ?? 0) > 0,
    hasProductDecisions: spec?.openQuestions.some((question) => question.resolved) ?? false,
  };
}
