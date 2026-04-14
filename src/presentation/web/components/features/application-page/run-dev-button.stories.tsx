import type { Meta, StoryObj } from '@storybook/react';
import { DeploymentState } from '@shepai/core/domain/generated/output';
import { RunDevButton } from './run-dev-button';
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

const meta: Meta<typeof RunDevButton> = {
  title: 'ApplicationPage/RunDevButton',
  component: RunDevButton,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof RunDevButton>;

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
    deploy: makeDeploy({
      status: DeploymentState.Ready,
      url: 'http://localhost:5173',
    }),
  },
};

export const ReadyCompact: Story = {
  args: {
    deploy: makeDeploy({
      status: DeploymentState.Ready,
      url: 'http://localhost:5173',
    }),
    variant: 'compact',
  },
};

export const ErrorState: Story = {
  args: {
    deploy: makeDeploy({ deployError: 'Failed to start dev server: EADDRINUSE' }),
  },
};

export const Disabled: Story = {
  args: { deploy: makeDeploy(), disabled: true },
};
