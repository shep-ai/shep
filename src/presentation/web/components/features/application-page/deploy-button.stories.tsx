import type { Meta, StoryObj } from '@storybook/react';
import {
  CloudDeploymentProvider,
  CloudDeploymentStatus,
} from '@shepai/core/domain/generated/output';
import { DeployButton } from './deploy-button';
import type { CloudDeployActionApi } from '@/hooks/use-cloud-deploy-action';

function makeApi(overrides: Partial<CloudDeployActionApi['state']> = {}): CloudDeployActionApi {
  return {
    state: {
      provider: CloudDeploymentProvider.CloudflarePages,
      status: CloudDeploymentStatus.NotDeployed,
      url: null,
      error: null,
      deploymentId: null,
      lastDeployedAt: null,
      isWorking: false,
      ...overrides,
    },
    refresh: async () => undefined,
    selectProvider: async () => undefined,
    initiate: async () => undefined,
    connect: async () => undefined,
  };
}

const meta: Meta<typeof DeployButton> = {
  title: 'ApplicationPage/DeployButton',
  component: DeployButton,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof DeployButton>;

export const NotDeployed: Story = {
  args: { deploy: makeApi() },
};

export const Deploying: Story = {
  args: {
    deploy: makeApi({ status: CloudDeploymentStatus.Deploying, isWorking: true }),
  },
};

export const Deployed: Story = {
  args: {
    deploy: makeApi({
      status: CloudDeploymentStatus.Deployed,
      url: 'https://my-app.pages.dev',
    }),
  },
};

export const Failed: Story = {
  args: {
    deploy: makeApi({
      status: CloudDeploymentStatus.Failed,
      error: 'Cloudflare API returned 403',
    }),
  },
};

export const DisabledWhileAgentRunning: Story = {
  args: { deploy: makeApi(), disabled: true },
};
