/**
 * Client-side mirror of the application-creation workflow's
 * user-facing step titles + descriptions. Used to render a
 * placeholder tracker BEFORE the backend orchestrator has written
 * the real `workflow_steps` rows — the user sees all 8 pending
 * cards the instant they land on the application page, instead
 * of a blank area that suddenly pops into existence a few
 * hundred milliseconds later.
 *
 * Keep this in sync with
 * `packages/core/src/application/workflows/application-creation.workflow.ts`.
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
    stepKey: 'scaffold',
    title: 'Setting up your project',
    description: 'Creating the foundation files',
  },
  {
    stepKey: 'deps',
    title: 'Installing design tools',
    description: 'Adding Tailwind and essentials',
  },
  {
    stepKey: 'components',
    title: 'Building the pieces',
    description: 'Designing and creating reusable parts',
  },
  { stepKey: 'wire', title: 'Connecting everything', description: 'Wiring navigation and forms' },
  {
    stepKey: 'style',
    title: 'Polishing the look',
    description: 'Applying colors, spacing, and motion',
  },
  { stepKey: 'verify', title: 'Double-checking', description: 'Making sure it runs cleanly' },
  { stepKey: 'commit', title: 'Saving a snapshot', description: 'Committing the initial build' },
  { stepKey: 'report', title: 'Your app is ready', description: 'Summary of what was built' },
];
