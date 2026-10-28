import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { FeatureActivityCard } from './feature-activity-card';
import {
  DONE_ACTIVITY,
  FAILED_ACTIVITY,
  GATE_ACTIVITY,
  QUESTION_ACTIVITY,
  QUEUED_ACTIVITY,
  WORKING_ACTIVITY,
} from './agent-activity-story-fixtures';

const notify = { watching: false, error: null, onStart: fn(), onStop: fn() };

const meta: Meta<typeof FeatureActivityCard> = {
  title: 'Composed/AgentActivity/FeatureActivityCard',
  component: FeatureActivityCard,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
  args: { activity: WORKING_ACTIVITY, notify },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Watching: Story = { args: { notify: { ...notify, watching: true } } };

export const AgentQuestion: Story = { args: { activity: QUESTION_ACTIVITY } };

export const ApprovalGate: Story = { args: { activity: GATE_ACTIVITY } };

export const ApprovalGateInDrawer: Story = { args: { activity: GATE_ACTIVITY, inDrawer: true } };

export const Queued: Story = { args: { activity: QUEUED_ACTIVITY } };

export const Failed: Story = { args: { activity: FAILED_ACTIVITY } };

export const Done: Story = { args: { activity: DONE_ACTIVITY } };

export const NotifyFailed: Story = {
  args: { notify: { ...notify, error: 'not-found' } },
};

export const Loading: Story = { args: { activity: undefined, loading: true } };

export const ErrorState: Story = { args: { activity: undefined, error: 'database is locked' } };

export const NotFound: Story = { args: { activity: undefined, notFound: true } };
