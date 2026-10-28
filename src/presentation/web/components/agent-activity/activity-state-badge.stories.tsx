import type { Meta, StoryObj } from '@storybook/react';
import { AgentActivityState } from '@shepai/core/domain/generated/output';
import { ActivityStateBadge } from './activity-state-badge';

const meta: Meta<typeof ActivityStateBadge> = {
  title: 'Composed/AgentActivity/ActivityStateBadge',
  component: ActivityStateBadge,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  args: { state: AgentActivityState.Working },
  argTypes: {
    state: { control: 'select', options: Object.values(AgentActivityState) },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Blocked: Story = { args: { state: AgentActivityState.Blocked } };

export const Failed: Story = { args: { state: AgentActivityState.Failed } };

export const AllStates: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {Object.values(AgentActivityState).map((state) => (
        <ActivityStateBadge key={state} state={state} />
      ))}
    </div>
  ),
};
