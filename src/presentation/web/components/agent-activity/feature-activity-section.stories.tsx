import type { Meta, StoryObj } from '@storybook/react';
import { FeatureActivitySection } from './feature-activity-section';
import {
  GATE_ACTIVITY,
  QUESTION_ACTIVITY,
  WORKING_ACTIVITY,
  stubActivityFetch,
  type ActivityFetchStub,
} from './agent-activity-story-fixtures';

function withActivity(stub: ActivityFetchStub) {
  return function ActivityFetchDecorator(Story: React.FC) {
    stubActivityFetch(stub);
    return (
      <div className="max-w-md">
        <Story />
      </div>
    );
  };
}

const meta: Meta<typeof FeatureActivitySection> = {
  title: 'Composed/AgentActivity/FeatureActivitySection',
  component: FeatureActivitySection,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { featureId: WORKING_ACTIVITY.featureId },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Live card over the stubbed routes: click Notify me to see the watching state. */
export const Default: Story = { decorators: [withActivity({ activities: [WORKING_ACTIVITY] })] };

export const ApprovalGate: Story = {
  args: { featureId: GATE_ACTIVITY.featureId },
  decorators: [withActivity({ activities: [GATE_ACTIVITY] })],
};

export const AgentQuestion: Story = {
  args: { featureId: QUESTION_ACTIVITY.featureId },
  decorators: [withActivity({ activities: [QUESTION_ACTIVITY] })],
};

export const Loading: Story = { decorators: [withActivity({ pending: true })] };

export const ErrorState: Story = { decorators: [withActivity({ error: 'database is locked' })] };
