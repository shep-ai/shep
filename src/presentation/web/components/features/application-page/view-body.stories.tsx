import type { Meta, StoryObj } from '@storybook/react';
import { DeploymentState } from '@shepai/core/domain/generated/output';

import type { DeployActionState } from '@/hooks/use-deploy-action';

import { ViewBody } from './view-body';

const idleDeploy: DeployActionState = {
  status: null,
  url: null,
  deployLoading: false,
  stopLoading: false,
  deployError: null,
  deploy: async () => undefined,
  stop: async () => undefined,
};

const readyDeploy: DeployActionState = {
  ...idleDeploy,
  status: DeploymentState.Ready,
  url: 'http://localhost:4321',
};

const meta: Meta<typeof ViewBody> = {
  title: 'ApplicationPage/ViewBody',
  component: ViewBody,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="h-dvh w-full">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ViewBody>;

export const IdeView: Story = {
  args: {
    activeView: 'ide',
    applicationId: 'app-001',
    terminalCwd: '/home/user/example-app',
    deploy: idleDeploy,
  },
};

export const WebReady: Story = {
  args: {
    activeView: 'web',
    applicationId: 'app-001',
    terminalCwd: '/home/user/example-app',
    deploy: readyDeploy,
  },
};
