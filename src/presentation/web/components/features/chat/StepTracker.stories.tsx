import type { Meta, StoryObj } from '@storybook/react';
import { StepTracker } from './StepTracker';
import type { EnhancedStepState } from './useChatRuntime';

const meta: Meta<typeof StepTracker> = {
  title: 'Features/Chat/StepTracker',
  component: StepTracker,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="w-[480px] rounded-xl border">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof StepTracker>;

const DEFS: { id: string; stepKey: string; title: string; description: string }[] = [
  {
    id: 's-1',
    stepKey: 'components',
    title: 'Building the pieces',
    description: 'Designing and creating polished reusable parts',
  },
  {
    id: 's-2',
    stepKey: 'wire',
    title: 'Connecting everything',
    description: 'Wiring navigation and forms',
  },
  {
    id: 's-3',
    stepKey: 'verify',
    title: 'Double-checking',
    description: 'Making sure it runs cleanly',
  },
  {
    id: 's-4',
    stepKey: 'commit',
    title: 'Saving a snapshot',
    description: 'Committing the initial build',
  },
  {
    id: 's-5',
    stepKey: 'report',
    title: 'Your app is ready',
    description: 'Summary of what was built',
  },
];

function build(
  overrides: Partial<Record<string, Partial<EnhancedStepState>>> = {}
): EnhancedStepState[] {
  return DEFS.map((d) => {
    const o = overrides[d.stepKey] ?? {};
    return {
      definition: d,
      status: o.status ?? 'pending',
      metadata: o.metadata ?? null,
      toolMessages: o.toolMessages ?? [],
      startedAt: o.startedAt ?? null,
      finishedAt: o.finishedAt ?? null,
    };
  });
}

export const AllPending: Story = { args: { steps: build() } };

export const InProgress: Story = {
  args: {
    steps: build({
      components: { status: 'running' },
    }),
  },
};

export const AllDone: Story = {
  args: {
    steps: build(
      Object.fromEntries(
        DEFS.map((d) => [
          d.stepKey,
          { status: 'done' as const, metadata: { summary: `${d.title} — finished cleanly` } },
        ])
      )
    ),
  },
};

export const FailedMidway: Story = {
  args: {
    steps: build({
      components: { status: 'done', metadata: { summary: 'Components ready' } },
      wire: { status: 'failed', metadata: { error: 'bun run build exited with code 1' } },
    }),
  },
};

export const InterruptedAfterCrash: Story = {
  args: {
    steps: build({
      components: { status: 'done', metadata: { summary: 'Components ready' } },
      wire: { status: 'interrupted' },
    }),
  },
};

/**
 * A step stuck in `running` after a daemon restart. The tracker shows
 * an inline force-stop control on the running card so the user can
 * manually flip the stuck step to `interrupted` and resume via the
 * standard Continue retry flow.
 */
export const StuckRunningWithForceStop: Story = {
  args: {
    steps: build({
      components: { status: 'done', metadata: { summary: 'Components ready' } },
      wire: {
        status: 'running',
        startedAt: Date.now() - 2 * 60 * 1000,
      },
    }),
    // eslint-disable-next-line no-console
    onForceStop: (stepId: string) => console.log('force-stop', stepId),
  },
};

/**
 * Scaffolding phase — the synthetic first-card state that ChatTab
 * prepends via the `scaffoldingState` prop while `BunShadcnScaffolder`
 * installs dependencies. The rest of the tracker still shows the
 * pending placeholder cards because the agent turn has not started
 * yet.
 */
export const ScaffoldingRunning: Story = {
  args: {
    steps: [
      {
        definition: {
          id: 'placeholder-scaffold',
          stepKey: 'scaffold',
          title: 'Preparing your project',
          description: 'Scaffolding the project tree and installing dependencies',
        },
        status: 'running' as const,
        metadata: null,
        toolMessages: [],
        startedAt: Date.now() - 40 * 1000,
        finishedAt: null,
      },
      ...build(),
    ],
  },
};

/**
 * Scaffolding finished and the real workflow has begun — the scaffold
 * card flips to `done` with a captured duration while the first real
 * step (`components`) goes `running`.
 */
export const ScaffoldingDoneWorkflowRunning: Story = {
  args: {
    steps: [
      {
        definition: {
          id: 'placeholder-scaffold',
          stepKey: 'scaffold',
          title: 'Preparing your project',
          description: 'Scaffolding the project tree and installing dependencies',
        },
        status: 'done' as const,
        metadata: null,
        toolMessages: [],
        startedAt: Date.now() - 90 * 1000,
        finishedAt: Date.now() - 30 * 1000,
      },
      ...build({
        components: {
          status: 'running',
          startedAt: Date.now() - 25 * 1000,
        },
      }),
    ],
  },
};
