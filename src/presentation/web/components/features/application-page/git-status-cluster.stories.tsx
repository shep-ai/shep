import type { Meta, StoryObj } from '@storybook/react';

import { GitStatusCluster } from './git-status-cluster';

const meta: Meta<typeof GitStatusCluster> = {
  title: 'ApplicationPage/GitStatusCluster',
  component: GitStatusCluster,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof GitStatusCluster>;

export const Default: Story = {
  args: {
    applicationId: 'app-001',
    repositoryPath: '/home/user/workspaces/example-app',
  },
};

export const AlternateRepo: Story = {
  args: {
    applicationId: 'app-002',
    repositoryPath: '/home/user/workspaces/another-app',
  },
};
