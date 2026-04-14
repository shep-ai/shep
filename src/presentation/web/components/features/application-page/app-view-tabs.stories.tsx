import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { DeploymentState } from '@shepai/core/domain/generated/output';
import { AppViewTabs, type AppView } from './app-view-tabs';
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

function Wrapper({ deploy }: { deploy: DeployActionState }) {
  const [active, setActive] = useState<AppView>('ide');
  return (
    <div className="bg-background border-border w-[480px] rounded-md border">
      <AppViewTabs active={active} onChange={setActive} deploy={deploy} />
      <div className="text-muted-foreground p-4 text-xs">Active view: {active}</div>
    </div>
  );
}

const meta: Meta<typeof Wrapper> = {
  title: 'ApplicationPage/AppViewTabs',
  component: Wrapper,
  parameters: { layout: 'centered' },
};
export default meta;
type Story = StoryObj<typeof Wrapper>;

export const Idle: Story = {
  args: { deploy: makeDeploy() },
};

export const DevServerBooting: Story = {
  args: {
    deploy: makeDeploy({
      status: DeploymentState.Booting,
      deployLoading: true,
    }),
  },
};

export const DevServerReady: Story = {
  args: {
    deploy: makeDeploy({
      status: DeploymentState.Ready,
      url: 'http://localhost:5173',
    }),
  },
};

export const DevServerError: Story = {
  args: {
    deploy: makeDeploy({
      deployError: 'Port 5173 is already in use',
    }),
  },
};
