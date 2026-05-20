/**
 * @module Shep.Agents.ContributorOnboardingOutput
 *
 * Structured output contract for the contributor-onboarding custom agent
 * (spec 097, FR-34..FR-36 / task-36).
 *
 * The contributor-onboarding agent reads a single GitHub issue and returns
 * a structured grooming artifact. This contract is versioned independently
 * of the agent's system prompt so prompt iteration and schema evolution can
 * happen on different cadences:
 *
 *  - Prompt body lives at `prompts/contributor-onboarding/system.md`
 *  - Schema lives here (TypeSpec) and is generated to
 *    `packages/core/src/domain/generated/output.ts` as
 *    `ContributorOnboardingAgentOutput`.
 *
 * Callers (`GroomIssueUseCase`, the welcome workflow, the
 * register-contributor-onboarding-agent registration) parse the agent
 * response against this type. NFR-3 forbids raw-string comparisons for
 * domain concepts, so `lane` and `difficulty` are typed as the matching
 * value-object enums rather than `string`.
 *
 * @see prompts/contributor-onboarding/system.md
 * @see prompts/contributor-onboarding/output-schema.md
 */
import "../domain/value-objects/contributor-lane.tsp";
import "../domain/value-objects/contribution-difficulty.tsp";

/**
 * Contributor-Onboarding Agent Output
 *
 * Single source of truth for the agent's structured response shape.
 *
 * ## Properties
 *
 * | Property             | Type                     | Required | Description                                              |
 * |----------------------|--------------------------|----------|----------------------------------------------------------|
 * | lane                 | ContributorLane          | Yes      | Lane the issue belongs to                                |
 * | difficulty           | ContributionDifficulty   | Yes      | How much project context the contributor needs           |
 * | acceptanceCriteria   | string                   | Yes      | Markdown checklist (lines start with `- [ ] `)           |
 * | suggestedLabels      | string[]                 | Yes      | Labels to apply; MUST include lane:<lane> + difficulty:* |
 * | welcomeComment       | string                   | No       | Optional welcome body when difficulty === goodFirst      |
 */
@doc("Structured output produced by the contributor-onboarding custom agent")
model ContributorOnboardingAgentOutput {
  @doc("Lane assignment — must match ContributorLane enum verbatim")
  lane: ContributorLane;

  @doc("Difficulty rating — must match ContributionDifficulty enum verbatim")
  difficulty: ContributionDifficulty;

  @doc("Markdown checklist of acceptance criteria; each line begins with '- [ ] '")
  acceptanceCriteria: string;

  @doc("Suggested labels to apply; MUST include lane:<lane> and difficulty:<difficulty>")
  suggestedLabels: string[];

  @doc("Optional welcome comment body — present only when difficulty === goodFirst")
  welcomeComment?: string;
}
