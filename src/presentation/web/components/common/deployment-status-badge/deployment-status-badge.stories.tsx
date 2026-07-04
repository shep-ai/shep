import type { Meta, StoryObj } from '@storybook/react';
import { DeploymentState } from '@shepai/core/domain/generated/output';
import { DeploymentStatusBadge } from './deployment-status-badge';

const meta: Meta<typeof DeploymentStatusBadge> = {
  title: 'Common/DeploymentStatusBadge',
  component: DeploymentStatusBadge,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof DeploymentStatusBadge>;

/** Analyzing — blue badge with animated spinner, "Analyzing..." label. */
export const Analyzing: Story = {
  args: { status: DeploymentState.Analyzing },
};

/** Installing — blue badge with animated spinner, "Installing..." label. */
export const Installing: Story = {
  args: { status: DeploymentState.Installing },
};

/** Booting — blue badge with animated spinner. */
export const Booting: Story = {
  args: { status: DeploymentState.Booting },
};

/** Ready — green badge with clickable URL and external link icon. */
export const Ready: Story = {
  args: { status: DeploymentState.Ready, url: 'http://localhost:3000' },
};

/** Stopped — renders nothing (badge disappears). */
export const Stopped: Story = {
  args: { status: DeploymentState.Stopped },
};

/** No deployment — renders nothing. */
export const NoDeployment: Story = {
  args: { status: null },
};

/** Booting with View Logs button — shows log button next to spinner. */
export const BootingWithLogs: Story = {
  args: { status: DeploymentState.Booting, targetId: 'demo-target' },
};

/** Analyzing with View Logs button — logs are available from the first stage. */
export const AnalyzingWithLogs: Story = {
  args: { status: DeploymentState.Analyzing, targetId: 'demo-target' },
};

/** Installing with View Logs button. */
export const InstallingWithLogs: Story = {
  args: { status: DeploymentState.Installing, targetId: 'demo-target' },
};

/** Ready with View Logs button — shows URL and log button. */
export const ReadyWithLogs: Story = {
  args: { status: DeploymentState.Ready, url: 'http://localhost:3000', targetId: 'demo-target' },
};
