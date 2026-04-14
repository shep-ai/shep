import type { Meta, StoryObj } from '@storybook/react';
import {
  CloudDeploymentProvider,
  CloudDeploymentStatus,
} from '@shepai/core/domain/generated/output';
import { DeployPanel } from './deploy-panel';
import type { CloudDeployActionApi } from '@/hooks/use-cloud-deploy-action';
import type { GitStatusDto } from '@/hooks/use-git-status';
import type { SmartDeployState } from '@/hooks/use-smart-deploy-state';

function makeCloudApi(
  overrides: Partial<CloudDeployActionApi['state']> = {}
): CloudDeployActionApi {
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

const cleanRemoteStatus: GitStatusDto = {
  branch: 'main',
  uncommittedCount: 0,
  unpushedCount: 0,
  hasRemote: true,
  remoteUrl: 'https://github.com/blackpc/landing-page-hero',
};

const noop = () => undefined;

const meta: Meta<typeof DeployPanel> = {
  title: 'ApplicationPage/DeployPanel',
  component: DeployPanel,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="bg-background border-border w-[360px] rounded-md border shadow-md">
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof DeployPanel>;

const sharedHandlers = {
  onSaveChanges: noop,
  onPublishToWeb: noop,
  onRedeploy: noop,
  onSetUpCodeStorage: noop,
  onConnectCloud: noop,
  onSwitchProvider: noop,
  onOpenLogs: noop,
  onOpenInGitHub: noop,
};

const baseSmart = (overrides: Partial<SmartDeployState> = {}): SmartDeployState => ({
  kind: 'deploy',
  changeCount: 0,
  hasCloud: true,
  hasRemote: true,
  liveUrl: null,
  errorMessage: null,
  failedSource: null,
  ...overrides,
});

export const FirstTimeNothingSetUp: Story = {
  args: {
    state: baseSmart({ kind: 'getOnline', hasRemote: false, hasCloud: false }),
    gitStatus: {
      branch: null,
      uncommittedCount: 0,
      unpushedCount: 0,
      hasRemote: false,
      remoteUrl: null,
    },
    cloudDeploy: makeCloudApi(),
    cloudProviderName: null,
    lastDeployedAgo: null,
    ...sharedHandlers,
  },
};

export const HasRemoteNotConnectedToCloud: Story = {
  args: {
    state: baseSmart({ kind: 'deploy', hasCloud: false }),
    gitStatus: cleanRemoteStatus,
    cloudDeploy: makeCloudApi(),
    cloudProviderName: null,
    lastDeployedAgo: null,
    ...sharedHandlers,
  },
};

export const HasRemoteCleanReadyToDeploy: Story = {
  args: {
    state: baseSmart({ kind: 'deploy' }),
    gitStatus: cleanRemoteStatus,
    cloudDeploy: makeCloudApi(),
    cloudProviderName: 'Cloudflare Pages',
    lastDeployedAgo: null,
    ...sharedHandlers,
  },
};

export const DirtyHasRemoteHasCloud: Story = {
  args: {
    state: baseSmart({ kind: 'pushAndDeploy', changeCount: 5 }),
    gitStatus: { ...cleanRemoteStatus, uncommittedCount: 5 },
    cloudDeploy: makeCloudApi(),
    cloudProviderName: 'Cloudflare Pages',
    lastDeployedAgo: null,
    ...sharedHandlers,
  },
};

export const DirtyOnlyNoCloud: Story = {
  args: {
    state: baseSmart({ kind: 'save', changeCount: 3, hasCloud: false }),
    gitStatus: { ...cleanRemoteStatus, uncommittedCount: 3 },
    cloudDeploy: makeCloudApi(),
    cloudProviderName: null,
    lastDeployedAgo: null,
    ...sharedHandlers,
  },
};

export const Live: Story = {
  args: {
    state: baseSmart({
      kind: 'live',
      liveUrl: 'https://landing-page-hero-features-pricing-85f4e3.pages.dev',
    }),
    gitStatus: cleanRemoteStatus,
    cloudDeploy: makeCloudApi({
      status: CloudDeploymentStatus.Deployed,
      url: 'https://landing-page-hero-features-pricing-85f4e3.pages.dev',
      lastDeployedAt: new Date(Date.now() - 2 * 60 * 1000),
    }),
    cloudProviderName: 'Cloudflare Pages',
    lastDeployedAgo: '2 minutes ago',
    ...sharedHandlers,
  },
};

export const DeployFailed: Story = {
  args: {
    state: baseSmart({
      kind: 'failed',
      errorMessage:
        'Cloudflare API GET /accounts/.../deployments returned a non-JSON response (HTTP 502).',
      failedSource: 'deploy',
    }),
    gitStatus: cleanRemoteStatus,
    cloudDeploy: makeCloudApi({
      status: CloudDeploymentStatus.Failed,
      error: 'Cloudflare API returned 502',
    }),
    cloudProviderName: 'Cloudflare Pages',
    lastDeployedAgo: null,
    ...sharedHandlers,
  },
};

export const SaveFailed: Story = {
  args: {
    state: baseSmart({
      kind: 'failed',
      errorMessage: 'git push failed: remote rejected (permission denied)',
      failedSource: 'sync',
      changeCount: 3,
    }),
    gitStatus: { ...cleanRemoteStatus, uncommittedCount: 3 },
    cloudDeploy: makeCloudApi(),
    cloudProviderName: 'Cloudflare Pages',
    lastDeployedAgo: null,
    ...sharedHandlers,
  },
};
