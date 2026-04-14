import type { Meta, StoryObj } from '@storybook/react';
import { PublishToGitHubButton } from './publish-to-github-button';

/**
 * The button drives its own state via fetch() against the API routes — the
 * stories below render it in a fixed initial state by either pre-seeding the
 * remote URL prop (has-remote case) or letting the loading spinner show
 * (the fetch will fail in storybook because there is no api server).
 */
const meta: Meta<typeof PublishToGitHubButton> = {
  title: 'ApplicationPage/PublishToGitHubButton',
  component: PublishToGitHubButton,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  args: {
    applicationId: 'app-storybook',
    defaultRepoName: 'my-cool-app',
    initialRemoteUrl: null,
  },
};

export const HasRemote: Story = {
  args: {
    applicationId: 'app-storybook',
    defaultRepoName: 'my-cool-app',
    initialRemoteUrl: 'https://github.com/octocat/my-cool-app',
  },
};

export const Disabled: Story = {
  args: {
    applicationId: 'app-storybook',
    defaultRepoName: 'my-cool-app',
    initialRemoteUrl: null,
    disabled: true,
  },
};
