import type { Meta, StoryObj } from '@storybook/react';
import { AgentActivityList } from './agent-activity-list';
import { DONE_ACTIVITY, FLEET_ACTIVITIES } from './agent-activity-story-fixtures';

const meta: Meta<typeof AgentActivityList> = {
  title: 'Composed/AgentActivity/AgentActivityList',
  component: AgentActivityList,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { activities: FLEET_ACTIVITIES },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithFinished: Story = { args: { activities: [...FLEET_ACTIVITIES, DONE_ACTIVITY] } };

export const Empty: Story = { args: { activities: [] } };

export const LongNames: Story = {
  args: {
    activities: FLEET_ACTIVITIES.map((activity) => ({
      ...activity,
      name: `${activity.name} — with a very long feature name that has to wrap or truncate cleanly`,
    })),
  },
};
