import type { Meta, StoryObj } from '@storybook/react';
import { AgentActivityPageClient } from './agent-activity-page-client';
import {
  DONE_ACTIVITY,
  FLEET_ACTIVITIES,
  stubActivityFetch,
  type ActivityFetchStub,
} from '@/components/agent-activity/agent-activity-story-fixtures';

function withActivity(stub: ActivityFetchStub) {
  return function ActivityFetchDecorator(Story: React.FC) {
    stubActivityFetch(stub);
    return <Story />;
  };
}

const meta: Meta<typeof AgentActivityPageClient> = {
  title: 'Features/AgentActivityPage',
  component: AgentActivityPageClient,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  args: {},
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { decorators: [withActivity({ activities: FLEET_ACTIVITIES })] };

export const WithFinished: Story = {
  decorators: [withActivity({ activities: [...FLEET_ACTIVITIES, DONE_ACTIVITY] })],
};

export const Empty: Story = { decorators: [withActivity({ activities: [] })] };

export const Loading: Story = { decorators: [withActivity({ pending: true })] };

export const ErrorState: Story = { decorators: [withActivity({ error: 'database is locked' })] };
