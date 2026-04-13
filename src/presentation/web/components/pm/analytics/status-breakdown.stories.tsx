import type { Meta, StoryObj } from '@storybook/react';
import { StatusBreakdown } from './status-breakdown';

const meta: Meta<typeof StatusBreakdown> = {
  title: 'PM/Analytics/StatusBreakdown',
  component: StatusBreakdown,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-full max-w-3xl">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    totalItems: 24,
    byState: [
      {
        stateId: 's1',
        stateName: 'Backlog',
        stateGroup: 'Backlog',
        stateColor: '#a3a3a3',
        count: 5,
      },
      {
        stateId: 's2',
        stateName: 'Todo',
        stateGroup: 'Unstarted',
        stateColor: '#60a5fa',
        count: 6,
      },
      {
        stateId: 's3',
        stateName: 'In Progress',
        stateGroup: 'Started',
        stateColor: '#fbbf24',
        count: 4,
      },
      {
        stateId: 's4',
        stateName: 'In Review',
        stateGroup: 'Started',
        stateColor: '#a78bfa',
        count: 2,
      },
      {
        stateId: 's5',
        stateName: 'Done',
        stateGroup: 'Completed',
        stateColor: '#34d399',
        count: 7,
      },
    ],
    byPriority: [
      { priority: 'Urgent', count: 2 },
      { priority: 'High', count: 5 },
      { priority: 'Medium', count: 10 },
      { priority: 'Low', count: 4 },
      { priority: 'None', count: 3 },
    ],
  },
};

export const FewStates: Story = {
  args: {
    totalItems: 8,
    byState: [
      {
        stateId: 's1',
        stateName: 'Todo',
        stateGroup: 'Unstarted',
        stateColor: '#60a5fa',
        count: 3,
      },
      {
        stateId: 's2',
        stateName: 'Done',
        stateGroup: 'Completed',
        stateColor: '#34d399',
        count: 5,
      },
    ],
    byPriority: [
      { priority: 'High', count: 2 },
      { priority: 'Medium', count: 6 },
    ],
  },
};

export const Empty: Story = {
  args: {
    totalItems: 0,
    byState: [],
    byPriority: [],
  },
};
