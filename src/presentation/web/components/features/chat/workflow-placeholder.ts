/**
 * Client-side mirror of the application-creation workflow's
 * user-facing step titles + descriptions. Used to render a
 * placeholder tracker BEFORE the backend orchestrator has written
 * the real `workflow_steps` rows — the user sees all the pending
 * cards the instant they land on the application page, instead
 * of a blank area that suddenly pops into existence a few
 * hundred milliseconds later.
 *
 * The first entry — `scaffold` — is a SYNTHETIC step that does not
 * correspond to a real `workflow_steps` row. It represents the
 * `BunShadcnScaffolder` phase (project-tree creation + `bun install`)
 * which runs BEFORE the agent turn starts. That phase can take a
 * long time (dependency install), and without this card the user
 * would see an all-pending tracker and think nothing is happening.
 *
 * The rest of the list mirrors the real workflow steps. Keep them
 * in sync with
 * `packages/core/src/application/use-cases/applications/application-creation.workflow.ts`.
 * The real rows replace the non-scaffold placeholders as soon as the
 * first `workflow_step` SSE chunk arrives; the scaffold card is
 * injected on top by `ChatTab` via `scaffoldingState` so it stays
 * visible across both phases.
 */

export interface PlaceholderStep {
  stepKey: string;
  title: string;
  description: string;
}

/**
 * Stable key for the synthetic scaffold card. Exported so `ChatTab`
 * can prepend a matching `EnhancedStepState` and the rest of the
 * tracker plumbing can identify it without stringly-typed comparisons.
 */
export const SCAFFOLD_STEP_KEY = 'scaffold';

export const APPLICATION_CREATION_PLACEHOLDER_STEPS: PlaceholderStep[] = [
  {
    stepKey: 'components',
    title: 'Building the pieces',
    description: 'Designing and creating polished reusable parts',
  },
  { stepKey: 'wire', title: 'Connecting everything', description: 'Wiring navigation and forms' },
  { stepKey: 'verify', title: 'Double-checking', description: 'Making sure it runs cleanly' },
  { stepKey: 'commit', title: 'Saving a snapshot', description: 'Committing the initial build' },
  { stepKey: 'report', title: 'Your app is ready', description: 'Summary of what was built' },
];
