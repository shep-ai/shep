/**
 * Client-side mirror of the application-creation workflow's
 * user-facing step titles + descriptions. Used to render a
 * placeholder tracker BEFORE the backend orchestrator has written
 * the real `workflow_steps` rows — the user sees all 5 pending
 * cards the instant they land on the application page, instead
 * of a blank area that suddenly pops into existence a few
 * hundred milliseconds later.
 *
 * The old `scaffold` placeholder is gone — scaffolding now runs
 * deterministically in `BunShadcnScaffolder` BEFORE the agent turn
 * starts, so the project is already flat + dependency-installed
 * when the user lands on the application page.
 *
 * Keep this in sync with
 * `packages/core/src/application/use-cases/applications/application-creation.workflow.ts`.
 * The real steps replace the placeholder as soon as the first
 * `workflow_step` SSE chunk arrives.
 */

export interface PlaceholderStep {
  stepKey: string;
  title: string;
  description: string;
}

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
