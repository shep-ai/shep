import type { Meta, StoryObj } from '@storybook/react';
import { DiscoveryRunStatus } from '@shepai/core/domain/generated/output';
import { DiscoveryPanel } from './discovery-panel';
import { DISCOVERY_RUN, runInStory } from './opportunities-fixtures';

const meta: Meta<typeof DiscoveryPanel> = {
  title: 'Features/Opportunities/DiscoveryPanel',
  component: DiscoveryPanel,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { spaceId: 'space-acme', run: runInStory },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Scheduled: Story = { args: { everyHours: 24, latest: DISCOVERY_RUN } };

export const NeverRan: Story = {};

export const Running: Story = {
  args: { latest: { ...DISCOVERY_RUN, status: DiscoveryRunStatus.Running } },
};

export const Failed: Story = {
  args: {
    latest: {
      ...DISCOVERY_RUN,
      status: DiscoveryRunStatus.Failed,
      proposed: 0,
      error: 'The agent call timed out after 10 minutes.',
    },
  },
};
