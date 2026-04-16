import type { Meta, StoryObj } from '@storybook/react';
import { ClusterStatus } from '@shepai/core/domain/generated/output';
import { ClusterStatusBadge } from './cluster-status-badge';

const meta: Meta<typeof ClusterStatusBadge> = {
  title: 'Common/ClusterStatusBadge',
  component: ClusterStatusBadge,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof ClusterStatusBadge>;

export const Provisioning: Story = {
  args: { status: ClusterStatus.Provisioning },
};

export const Ready: Story = {
  args: { status: ClusterStatus.Ready },
};

export const Stopping: Story = {
  args: { status: ClusterStatus.Stopping },
};

export const Stopped: Story = {
  args: { status: ClusterStatus.Stopped },
};

export const Error: Story = {
  args: { status: ClusterStatus.Error },
};

export const Destroying: Story = {
  args: { status: ClusterStatus.Destroying },
};

export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {Object.values(ClusterStatus).map((status) => (
        <div key={status} className="flex items-center gap-4">
          <span className="text-muted-foreground w-24 text-xs">{status}</span>
          <ClusterStatusBadge status={status} />
        </div>
      ))}
    </div>
  ),
};
