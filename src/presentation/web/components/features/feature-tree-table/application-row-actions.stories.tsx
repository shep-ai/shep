import type { Meta, StoryObj } from '@storybook/react';
import { ApplicationRowActions } from './application-row-actions';
import { DeploymentStatusProvider } from '@/hooks/deployment-status-provider';

const meta: Meta<typeof ApplicationRowActions> = {
  title: 'Features/ApplicationRowActions',
  component: ApplicationRowActions,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  decorators: [
    (Story) => (
      <DeploymentStatusProvider initialDeployments={[]}>
        <Story />
      </DeploymentStatusProvider>
    ),
  ],
  args: {
    applicationId: 'app-abc-123',
    applicationName: 'Marketing Site',
    repositoryPath: '/home/user/repos/marketing-site',
  },
};

export default meta;
type Story = StoryObj<typeof ApplicationRowActions>;

/** Default — no cloud deployment, no local server. Shows Open / Start / Delete. */
export const Default: Story = {};

/** With a cloud preview URL — adds the "Open live preview" entry. */
export const WithCloudPreview: Story = {
  args: {
    cloudUrl: 'https://abc123.example.pages.dev',
  },
};

/** Loading state — shown when a deploy or stop call is in flight. */
export const Loading: Story = {
  args: {
    applicationId: 'app-loading-1',
  },
};

/** Error state — surface area is unchanged; errors are reported via toast. */
export const Error: Story = {
  args: {
    applicationId: 'app-error-1',
  },
};
