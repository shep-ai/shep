import type { Meta, StoryObj } from '@storybook/react';
import VersionPageClient from './version-page-client';
import type { VersionInfo, SystemInfo } from '@/lib/version';

const meta: Meta<typeof VersionPageClient> = {
  title: 'Version/VersionPageClient',
  component: VersionPageClient,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof VersionPageClient>;

function makeVersionInfo(overrides: Partial<VersionInfo> = {}): VersionInfo {
  return {
    version: '1.206.2',
    name: '@shepai/cli',
    description: 'Autonomous AI Native SDLC Platform',
    branch: 'main',
    commitHash: 'a1b2c3d',
    ...overrides,
  };
}

function makeSystemInfo(overrides: Partial<SystemInfo> = {}): SystemInfo {
  return {
    nodeVersion: 'v22.22.2',
    platform: 'darwin',
    arch: 'arm64',
    ...overrides,
  };
}

export const Default: Story = {
  args: {
    versionInfo: makeVersionInfo(),
    systemInfo: makeSystemInfo(),
  },
};

export const SystemTab: Story = {
  args: {
    versionInfo: makeVersionInfo(),
    systemInfo: makeSystemInfo(),
  },
  parameters: {
    activeTab: 'system',
  },
};

export const FeaturesTab: Story = {
  args: {
    versionInfo: makeVersionInfo(),
    systemInfo: makeSystemInfo(),
  },
  parameters: {
    activeTab: 'features',
  },
};

export const LongVersionString: Story = {
  args: {
    versionInfo: makeVersionInfo({
      version: '1.207.0-alpha.3+build.456',
    }),
    systemInfo: makeSystemInfo(),
  },
};

export const LinuxAmd64: Story = {
  args: {
    versionInfo: makeVersionInfo({
      version: '1.206.2',
    }),
    systemInfo: makeSystemInfo({
      platform: 'linux',
      arch: 'x64',
      nodeVersion: 'v20.18.1',
    }),
  },
};
