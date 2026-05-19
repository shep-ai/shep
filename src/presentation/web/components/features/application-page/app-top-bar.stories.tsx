import type { Meta, StoryObj } from '@storybook/react';
import { within, userEvent, expect } from '@storybook/test';
import type { Application } from '@shepai/core/domain/generated/output';
import {
  ApplicationStatus,
  CloudDeploymentStatus,
  DeploymentState,
} from '@shepai/core/domain/generated/output';

import type { DeployActionState } from '@/hooks/use-deploy-action';
import type { CloudDeployActionApi } from '@/hooks/use-cloud-deploy-action';

import { AppTopBar } from './app-top-bar';

const baseApp: Application = {
  id: 'app-001',
  name: 'My Todo App',
  slug: 'my-todo-app',
  description: 'A full-stack todo application',
  repositoryPath: '/home/user/projects/my-todo-app',
  additionalPaths: [],
  status: ApplicationStatus.Idle,
  setupComplete: true,
  bedrockEnabled: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

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

const idleCloudDeploy: CloudDeployActionApi = {
  state: {
    provider: null,
    status: CloudDeploymentStatus.NotDeployed,
    url: null,
    error: null,
    deploymentId: null,
    lastDeployedAt: null,
    isWorking: false,
  },
  refresh: async () => undefined,
  selectProvider: async () => undefined,
  initiate: async () => undefined,
  connect: async () => undefined,
};

const meta: Meta<typeof AppTopBar> = {
  title: 'ApplicationPage/AppTopBar',
  component: AppTopBar,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof AppTopBar>;

export const IdleIde: Story = {
  args: {
    application: baseApp,
    activeView: 'ide',
    onViewChange: () => undefined,
    agentRunning: false,
    deploy: idleDeploy,
    cloudDeploy: idleCloudDeploy,
  },
};

export const PreviewReady: Story = {
  args: {
    application: { ...baseApp, gitRemoteUrl: 'https://github.com/user/my-todo-app' },
    activeView: 'web',
    onViewChange: () => undefined,
    agentRunning: false,
    deploy: readyDeploy,
    cloudDeploy: idleCloudDeploy,
  },
};

export const AgentRunning: Story = {
  args: {
    application: baseApp,
    activeView: 'ide',
    onViewChange: () => undefined,
    agentRunning: true,
    deploy: idleDeploy,
    cloudDeploy: idleCloudDeploy,
  },
};

/**
 * **OverflowMenuOpen** — opens the `⋯` overflow menu and asserts the new
 * "Open in Control Center (SDD mode)" entry is rendered. Verifies the
 * SDD entry-point on the application page.
 */
export const OverflowMenuOpen: Story = {
  args: {
    application: baseApp,
    activeView: 'ide',
    onViewChange: () => undefined,
    agentRunning: false,
    deploy: idleDeploy,
    cloudDeploy: idleCloudDeploy,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: 'More options' });
    await userEvent.click(trigger);

    const body = within(canvasElement.ownerDocument.body);
    const item = await body.findByTestId('open-in-control-center-sdd-menu-item');
    await expect(item).toBeInTheDocument();
  },
};
