/**
 * Application-creation workflow definition.
 *
 * The five steps Shep walks every new application through, with the
 * friendly non-technical title/description the user sees in the
 * tracker card AND the focused agent-facing prompt the orchestrator
 * sends for that step.
 *
 * History note: earlier versions had `plan`/`content`/`deps`/`style`
 * steps that were folded away, and a `scaffold` step that ran bun
 * bootstrap + `bunx shadcn init` + a bash flatten one-liner inside an
 * agent turn. `scaffold` was deleted in v4 because doing it inside
 * the agent turn repeatedly failed in three ways: (1) bun might not
 * be on PATH, (2) `shadcn init --template vite` creates a child
 * directory that needed a fragile flatten, (3) the final `bun add`
 * was sometimes skipped. All four phases now run deterministically
 * in `BunShadcnScaffolder` at application-creation time, BEFORE the
 * first agent turn ever starts. The agent lands on a flat, ready-to-
 * code project and its very first step is `components`.
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

export const APPLICATION_CREATION_WORKFLOW_ID = 'application-creation-v4';

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
      stepKey: 'components',
      title: 'Building the pieces',
      description: 'Designing and creating polished reusable parts',
      prompt: [
        '**Your VERY FIRST tool call MUST be `Read TEMPLATE.md`** at the project root. That file is the Shep cheat sheet — it lists every pre-built component you already have, the palette that is already configured, the helpers you MUST use instead of reinventing, and the hard rules. Read it BEFORE you plan anything.',
        '',
        'The project you are working in was already scaffolded and dependency-installed by Shep BEFORE your first turn — you do NOT need to run `bunx shadcn init`, `bun install`, or any bootstrap. `package.json`, `src/main.tsx`, the shadcn primitives under `src/components/ui/`, the Shep pre-built `src/components/common/*`, the helpers under `src/lib/*`, and the types under `src/types/common.ts` are ALREADY there.',
        '',
        '**Hard rules — rewriting any of the pre-built pieces below is FORBIDDEN:**',
        '  • Avatar, StatusDot, Badge, EmptyState, LoadingSpinner, ErrorBoundary, BottomNav, TopBar, IconButton, SectionHeader — already exist under `src/components/common/`. Import them from `@/components/common`. NEVER reimplement them.',
        '  • The palette is already configured in `src/index.css`. Use Tailwind semantic classes (`bg-background`, `bg-card`, `text-foreground`, `bg-primary`, `border-border`). Do NOT pick a new palette, do NOT hardcode `slate-*` / `violet-*` when a semantic class will do.',
        '  • `formatRelativeTime`, `formatCurrency`, `formatCompactNumber` live in `@/lib/format`. Use them — do NOT hand-roll date/number formatting.',
        '  • `pickName`, `pickParagraph`, `pickPrice`, `pickTimestamp`, `pickAvatar`, `pickInitials` live in `@/lib/mock`. Use them for ALL sample data. Lorem ipsum is FORBIDDEN.',
        '  • `User`, `Id`, `Url`, `Timestamp`, `OnlineStatus`, `Timestamped` types live in `@/types/common`. Import from there instead of redefining.',
        '',
        'AFTER reading TEMPLATE.md, plan the app (silently — do NOT share the plan with the user): what screens it has, what app-specific feature components it needs ON TOP of the pre-built common ones, what data shapes flow between them.',
        '',
        'Then build ONLY the app-specific feature components under `src/components/features/`. Every component is a real `.tsx` file. Small reusable pieces first, then larger compositions. Do NOT wire routing or full-page composition here — that is the next step.',
        '',
        '**Build every feature component fully polished on the first pass — there is no separate polish step later.** Each component must ship with:',
        '  • Tailwind semantic classes from the Shep palette (never re-pick colors).',
        '  • A consistent spacing and typography scale.',
        '  • Hover states and transitions where they make sense.',
        '  • Mobile-first responsive classes.',
        '  • No inline `<style>` blocks.',
        '',
        'Populate every component with realistic content the moment you create it, generated from `@/lib/mock` helpers. Lorem ipsum is FORBIDDEN.',
        '',
        'Every screen with a list/feed/grid MUST handle the empty case with `<EmptyState />`.',
        'Every tappable icon MUST use `<IconButton />`, not a raw `<button>`.',
        '',
        'When the feature components are drafted with real content AND final visuals, reply with a one-sentence confirmation.',
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
      stepKey: 'verify',
      title: 'Double-checking',
      description: 'Making sure it runs cleanly',
      prompt: [
        "Run `bun run build` (or the project's typecheck via `bun run tsc --noEmit` if no build script exists) and fix EVERY error and warning. The app MUST start cleanly with `bun run dev` on the very first try — no errors in the browser console, no unresolved imports.",
        '',
        'Use `bun` for every command in this step — never fall back to `npm`, `npx`, or `yarn`.',
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
