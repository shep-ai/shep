import type { Meta, StoryObj } from '@storybook/react';
import { ClusterStatus } from '@shepai/core/domain/generated/output';
import { ClusterDetailDrawer, type ClusterDetailData } from './cluster-detail-drawer';

const meta: Meta<typeof ClusterDetailDrawer> = {
  title: 'Drawers/ClusterDetailDrawer',
  component: ClusterDetailDrawer,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof ClusterDetailDrawer>;

const readyCluster: ClusterDetailData = {
  id: 'cluster-1',
  name: 'dev-cluster',
  description: 'Local development Kubernetes cluster',
  status: ClusterStatus.Ready,
  kubeconfigPath: '~/.shep/clusters/cluster-1/kubeconfig',
  argoCdEnabled: true,
  argoCdNamespace: 'argocd',
  lastProvisionedAt: '2024-01-15 10:30:00',
  lastHealthCheckAt: '2024-01-15 12:00:00',
  linkedRepos: [
    { id: 'repo-1', name: 'frontend-app' },
    { id: 'repo-2', name: 'backend-api' },
  ],
  linkedApps: [{ id: 'app-1', name: 'Dashboard' }],
};

const stoppedCluster: ClusterDetailData = {
  id: 'cluster-2',
  name: 'staging-cluster',
  status: ClusterStatus.Stopped,
  linkedRepos: [],
  linkedApps: [],
};

const errorCluster: ClusterDetailData = {
  id: 'cluster-3',
  name: 'broken-cluster',
  status: ClusterStatus.Error,
  errorMessage: 'Docker daemon is not running',
  linkedRepos: [],
  linkedApps: [],
};

export const Default: Story = {
  args: {
    open: true,
    onClose: (): void => undefined,
    cluster: readyCluster,
  },
};

export const Stopped: Story = {
  args: {
    open: true,
    onClose: (): void => undefined,
    cluster: stoppedCluster,
    onProvision: (): void => undefined,
  },
};

export const Error: Story = {
  args: {
    open: true,
    onClose: (): void => undefined,
    cluster: errorCluster,
    onProvision: (): void => undefined,
    onDestroy: (): void => undefined,
  },
};

export const NoCluster: Story = {
  args: {
    open: true,
    onClose: (): void => undefined,
    cluster: null,
  },
};

export const Closed: Story = {
  args: {
    open: false,
    onClose: (): void => undefined,
    cluster: readyCluster,
  },
};
