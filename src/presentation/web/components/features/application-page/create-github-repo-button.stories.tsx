import type { Meta, StoryObj } from '@storybook/react';
import { CreateGitHubRepoButton } from './create-github-repo-button';

const meta: Meta<typeof CreateGitHubRepoButton> = {
  title: 'ApplicationPage/CreateGitHubRepoButton',
  component: CreateGitHubRepoButton,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof CreateGitHubRepoButton>;

export const NoRemote: Story = {
  args: { applicationId: 'app-001' },
};

export const WithRemote: Story = {
  args: {
    applicationId: 'app-001',
    initialRemoteUrl: 'https://github.com/shep-ai/example-app',
  },
};

export const DisabledWhileAgentRunning: Story = {
  args: { applicationId: 'app-001', disabled: true },
};
