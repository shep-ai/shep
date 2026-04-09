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
    stepKey: 'scaffold',
    title: 'Setting up your project',
    description: 'Creating the foundation files',
  },
  {
    id: 's-2',
    stepKey: 'deps',
    title: 'Installing design tools',
    description: 'Adding Tailwind and essentials',
  },
  {
    id: 's-3',
    stepKey: 'plan',
    title: 'Sketching the app',
    description: 'Planning screens and data',
  },
  {
    id: 's-4',
    stepKey: 'components',
    title: 'Building the pieces',
    description: 'Creating reusable parts',
  },
  {
    id: 's-5',
    stepKey: 'content',
    title: 'Adding realistic content',
    description: 'Writing copy and sample data',
  },
  {
    id: 's-6',
    stepKey: 'wire',
    title: 'Connecting everything',
    description: 'Wiring navigation and forms',
  },
  {
    id: 's-7',
    stepKey: 'style',
    title: 'Polishing the look',
    description: 'Applying colors, spacing, and motion',
  },
  {
    id: 's-8',
    stepKey: 'verify',
    title: 'Double-checking',
    description: 'Making sure it runs cleanly',
  },
  {
    id: 's-9',
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
    };
  });
}

export const AllPending: Story = { args: { steps: build() } };

export const InProgress: Story = {
  args: {
    steps: build({
      scaffold: {
        status: 'done',
        metadata: {
          summary: 'Created a new Vite + React project',
          details: ['package.json', 'vite.config.ts'],
        },
      },
      deps: {
        status: 'done',
        metadata: { summary: 'Installed Tailwind and a handful of utilities' },
      },
      plan: { status: 'running' },
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
      scaffold: { status: 'done', metadata: { summary: 'Scaffold complete' } },
      deps: { status: 'failed', metadata: { error: 'npm install exited with code 1' } },
    }),
  },
};

export const InterruptedAfterCrash: Story = {
  args: {
    steps: build({
      scaffold: { status: 'done', metadata: { summary: 'Scaffold complete' } },
      deps: { status: 'interrupted' },
    }),
  },
};
