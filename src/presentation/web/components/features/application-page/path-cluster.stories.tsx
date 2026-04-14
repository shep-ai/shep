import type { Meta, StoryObj } from '@storybook/react';

import { PathCluster } from './path-cluster';

const meta: Meta<typeof PathCluster> = {
  title: 'ApplicationPage/PathCluster',
  component: PathCluster,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof PathCluster>;

export const Default: Story = {
  args: {
    applicationId: 'app-001',
    repositoryPath: '/home/user/workspaces/example-app',
  },
};

export const LongPath: Story = {
  args: {
    applicationId: 'app-002',
    repositoryPath: '/home/user/workspaces/some/very/deeply/nested/example-app',
  },
};
