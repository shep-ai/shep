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
