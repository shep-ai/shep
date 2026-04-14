import type { Meta, StoryObj } from '@storybook/react';
import { DeploymentState } from '@shepai/core/domain/generated/output';
import { WebPreviewTab } from './web-preview-tab';
import type { DeployActionState } from '@/hooks/use-deploy-action';

function makeDeploy(overrides: Partial<DeployActionState> = {}): DeployActionState {
  return {
    deploy: async () => undefined,
    stop: async () => undefined,
    deployLoading: false,
    stopLoading: false,
    deployError: null,
    status: null,
    url: null,
    ...overrides,
  };
}

const meta: Meta<typeof WebPreviewTab> = {
  title: 'ApplicationPage/WebPreviewTab',
  component: WebPreviewTab,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ height: 500, width: 720, display: 'flex', flexDirection: 'column' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof WebPreviewTab>;

export const Default: Story = {
  args: { deploy: makeDeploy() },
};

export const Booting: Story = {
  args: {
    deploy: makeDeploy({ status: DeploymentState.Booting, deployLoading: true }),
  },
};

export const Ready: Story = {
  args: {
    // Render an about:blank-equivalent so the iframe has a valid src
    // without ever hitting the network in Storybook.
    deploy: makeDeploy({
      status: DeploymentState.Ready,
      url: 'about:blank',
    }),
  },
};

export const ErrorState: Story = {
  args: {
    deploy: makeDeploy({
      deployError: 'Failed to install dependencies: ENOSPC',
    }),
  },
};
