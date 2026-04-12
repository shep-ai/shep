/**
 * Application-creation workflow definition.
 *
 * The eight steps Shep walks every new application through, with the
 * friendly non-technical title/description the user sees in the
 * tracker card AND the focused agent-facing prompt the orchestrator
 * sends for that step.
 *
 * History note: an earlier version had separate `plan` and `content`
 * steps. They produced agent text confirmations with no actual tool
 * work, leaving lonely "title-only" cards in the tracker. Both have
 * been folded into the `components` step which now plans, builds,
 * and writes real content in a single agent turn.
 *
 * Key design notes:
 *   - The orchestrator (`RunWorkflowUseCase`) sends each step's
 *     `prompt` as a user turn against the SAME interactive session,
 *     so the agent has full history from the previous steps.
 *   - The very first step's prompt is decorated with a brief-read
 *     directive by `CreateApplicationUseCase` so the agent reads
 *     `SHEP_BRIEF.md` before doing anything else. Subsequent steps
 *     can just say "do X" because the brief is already loaded.
 *   - Titles and descriptions are user-facing. Never put code, paths,
 *     or jargon in them — they show in step cards next to avatars.
 */

export interface WorkflowStepDefinition {
  /** Stable key persisted in `workflow_steps.step_key`. */
  stepKey: string;
  /** User-facing card title. */
  title: string;
  /** User-facing card subtitle. */
  description: string;
  /** Focused agent prompt for this step. Sent as a user turn. */
  prompt: string;
}

export interface WorkflowDefinition {
  /** Versioned logical id persisted in `workflow_steps.workflow_id`. */
  id: string;
  /** Ordered step list. */
  steps: WorkflowStepDefinition[];
}

export const APPLICATION_CREATION_WORKFLOW_ID = 'application-creation-v2';

/**
 * The canonical application-creation workflow. Bumping the `id`
 * suffix ("-v1" → "-v2") triggers a new set of step rows for any
 * session that starts after the bump, without touching existing
 * data. Old rows remain queryable by their old workflow id.
 */
export const APPLICATION_CREATION_WORKFLOW: WorkflowDefinition = {
  id: APPLICATION_CREATION_WORKFLOW_ID,
  steps: [
    {
      stepKey: 'scaffold',
      title: 'Setting up your project',
      description: 'Creating the foundation files',
      prompt: [
        'Your task for this step is ONLY to scaffold the Vite + React + TypeScript project.',
        '',
        'Run this exact command as your first tool call, no discovery commands before it:',
        '',
        '```',
        'npm create vite@latest . -- --template react-ts',
        '```',
        '',
        '(note the dot — scaffold INTO the current directory).',
        '',
        'Then run `npm install`. Do not write any source files in this step. Do not touch Tailwind or any other dependency — that is the next step. When `npm install` finishes cleanly, reply with a short plain-English confirmation (one sentence).',
      ].join('\n'),
    },
    {
      stepKey: 'deps',
      title: 'Installing design tools',
      description: 'Adding Tailwind and essentials',
      prompt: [
        'Install Tailwind CSS via the official Vite guide and wire it into `src/index.css` / `tailwind.config.js` so it actually compiles.',
        '',
        'Then add the minimum extras the app will need (from this list, only what the app will actually use): `react-router-dom`, `react-hook-form`, `zod`, `lucide-react`, `clsx`, `tailwind-merge`. Keep `package.json` lean — no speculative libraries.',
        '',
        'When done, reply with a short plain-English confirmation (one sentence).',
      ].join('\n'),
    },
    {
      stepKey: 'components',
      title: 'Building the pieces',
      description: 'Designing and creating reusable parts',
      prompt: [
        "Plan the app first — what screens it has, what reusable components those screens need, what data shapes flow between them. Keep the plan in your head; do NOT share it with the user, the next step's output is what they will see.",
        '',
        'Then build the leaf components bottom-up. Every component is a real `.tsx` file under `src/`. Small reusable pieces first, then larger compositions. Do NOT wire routing or full-page composition here — that is the next step.',
        '',
        'Populate every component with realistic, hand-crafted content the moment you create it: real-sounding names, dates, prices, copy. Lorem ipsum is FORBIDDEN.',
        '',
        'When the components are drafted with their real content, reply with a one-sentence confirmation.',
      ].join('\n'),
    },
    {
      stepKey: 'wire',
      title: 'Connecting everything',
      description: 'Wiring navigation and forms',
      prompt: [
        'Wire the app together: routing, forms, state, any mock data flow. The app should feel like a coherent whole, not a page of disconnected components.',
        '',
        'Reply with a one-sentence confirmation when the wiring is done.',
      ].join('\n'),
    },
    {
      stepKey: 'style',
      title: 'Polishing the look',
      description: 'Applying colors, spacing, and motion',
      prompt: [
        'Polish the visuals: cohesive Tailwind palette, consistent spacing scale, typography, hover states, transitions. Mobile-first responsive. No inline `<style>` blocks.',
        '',
        'Reply with a one-sentence confirmation when the polish pass is finished.',
      ].join('\n'),
    },
    {
      stepKey: 'verify',
      title: 'Double-checking',
      description: 'Making sure it runs cleanly',
      prompt: [
        "Run `npm run build` (or the project's typecheck) and fix EVERY error and warning. The app MUST start cleanly with `npm run dev` on the very first try — no errors in the browser console, no unresolved imports.",
        '',
        'When the build is clean, reply with a one-sentence confirmation.',
      ].join('\n'),
    },
    {
      stepKey: 'commit',
      title: 'Saving a snapshot',
      description: 'Committing the initial build',
      prompt: [
        'Save a git snapshot of the whole initial build so the user can easily roll back later.',
        '',
        'Run these commands in order, from the project root:',
        '',
        '1. `git init` — safe no-op if the directory is already a repo.',
        '2. `git config user.email "shep@shep.bot"` and `git config user.name "Shep"` — repo-local identity so the commit succeeds even when the host machine has no global git config.',
        '3. `git add -A` — stage every file, including node_modules is fine, `.gitignore` from the Vite template already excludes it.',
        '4. `git commit -m "Initial Shep build"` — single commit holding the whole scaffold.',
        '',
        'If any command fails, do NOT give up — fix the issue (for example, configure missing identity) and retry. Only after the commit lands successfully, reply with a one-sentence plain-English confirmation. Do NOT push to any remote.',
      ].join('\n'),
    },
    {
      stepKey: 'report',
      title: 'Your app is ready',
      description: 'Summary of what was built',
      prompt: [
        'Write a short, friendly, plain-language summary for the user: what you built, what they can do in it, and how to view it. No tech jargon — pretend the user has never touched a terminal.',
        '',
        'This is the final step; your reply IS the summary.',
      ].join('\n'),
    },
  ],
};
