import type { Meta, StoryObj } from '@storybook/react';

import {
  BedrockMemoryPanel,
  type BedrockEnableResult,
  type BedrockLifecycleResult,
  type BedrockMemoryPanelActions,
} from './bedrock-memory-panel';
import { BedrockTargetKind } from '@shepai/core/domain/generated/output';
import type { BedrockHealth, BedrockMemorySnapshot } from '@shepai/core/domain/generated/output';

const meta: Meta<typeof BedrockMemoryPanel> = {
  title: 'Components/BedrockMemoryPanel',
  component: BedrockMemoryPanel,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: '560px', padding: '1rem' }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof BedrockMemoryPanel>;

const okHealth: BedrockHealth = {
  python: { tier: 'python', status: 'ok', detail: '3.11.4' },
  pipx: { tier: 'pipx', status: 'ok', detail: '1.5.0' },
  bedrock: { tier: 'bedrock', status: 'ok', detail: '0.7.2' },
  overall: 'ok',
};

const partialHealth: BedrockHealth = {
  python: { tier: 'python', status: 'ok', detail: '3.11.4' },
  pipx: { tier: 'pipx', status: 'missing', remediation: 'Install pipx' },
  bedrock: { tier: 'bedrock', status: 'missing', remediation: 'pipx install project-bedrock' },
  overall: 'missing',
};

const populatedSnapshot: BedrockMemorySnapshot = {
  cwd: '/Users/dev/my-app',
  present: true,
  totalBytes: BigInt(5_120),
  mostRecentlyModifiedAt: new Date(Date.now() - 1000 * 60 * 12),
  files: [
    {
      path: 'context/overview.md',
      sizeBytes: BigInt(1820),
      modifiedAt: new Date(Date.now() - 1000 * 60 * 12),
      preview:
        '# Project overview\n\nThis app is a Next.js dashboard backed by a Postgres database. The auth flow uses Clerk and we expose a REST API under /api/v1 …',
    },
    {
      path: 'context/architecture.md',
      sizeBytes: BigInt(2200),
      modifiedAt: new Date(Date.now() - 1000 * 60 * 90),
      preview:
        '## Architecture\n\nWe follow Clean Architecture with four layers: domain, application, infrastructure, presentation. Dependencies always point inward.',
    },
    {
      path: 'memory/sessions/2026-05-19-deploy-pipeline.md',
      sizeBytes: BigInt(1100),
      modifiedAt: new Date(Date.now() - 1000 * 60 * 60 * 5),
      preview:
        'Session notes for the deploy pipeline rework. We migrated from manual rsync to Vercel and the Github Actions workflow now runs canary deploys before promoting.',
    },
  ],
};

const emptySnapshot: BedrockMemorySnapshot = {
  cwd: '/Users/dev/my-app',
  present: true,
  totalBytes: BigInt(0),
  files: [],
};

const missingSnapshot: BedrockMemorySnapshot = {
  cwd: '/Users/dev/my-app',
  present: false,
  totalBytes: BigInt(0),
  files: [],
};

const okEnable: BedrockMemoryPanelActions['enable'] = async () => ({ ok: true });
const okLifecycle: BedrockMemoryPanelActions['sync'] = async () =>
  ({ ok: true, stdout: 'ok' }) as BedrockLifecycleResult;

const errEnable: BedrockMemoryPanelActions['enable'] = async () =>
  ({
    ok: false,
    code: 'PIPX_NOT_INSTALLED',
    remediation: 'Install pipx via Homebrew: `brew install pipx && pipx ensurepath`',
  }) as BedrockEnableResult;

const refreshSame =
  (s: BedrockMemorySnapshot | null): BedrockMemoryPanelActions['refreshSnapshot'] =>
  async () =>
    s;

const happyActions: BedrockMemoryPanelActions = {
  enable: okEnable,
  sync: okLifecycle,
  ship: okLifecycle,
  refreshSnapshot: refreshSame(populatedSnapshot),
};

const errorActions: BedrockMemoryPanelActions = {
  enable: errEnable,
  sync: async () =>
    ({
      ok: false,
      code: 'BEDROCK_NOT_ENABLED',
      remediation: 'Enable bedrock memory on this target first.',
    }) as BedrockLifecycleResult,
  ship: async () =>
    ({
      ok: false,
      code: 'BEDROCK_NOT_ENABLED',
      remediation: 'Enable bedrock memory on this target first.',
    }) as BedrockLifecycleResult,
  refreshSnapshot: refreshSame(null),
};

export const Default: Story = {
  args: {
    targetKind: BedrockTargetKind.Application,
    targetId: 'app-1',
    targetLabel: 'my-app',
    initialEnabled: true,
    initialSnapshot: populatedSnapshot,
    initialHealth: okHealth,
    actions: happyActions,
  },
};

export const RepositoryTarget: Story = {
  args: {
    targetKind: BedrockTargetKind.Repository,
    targetId: 'repo-1',
    targetLabel: 'shep-ai/cli',
    initialEnabled: true,
    initialSnapshot: populatedSnapshot,
    initialHealth: okHealth,
    actions: happyActions,
  },
};

export const FeatureTarget: Story = {
  args: {
    targetKind: BedrockTargetKind.Feature,
    targetId: 'feat-1',
    targetLabel: 'feat/checkout-flow',
    initialEnabled: true,
    initialSnapshot: populatedSnapshot,
    initialHealth: okHealth,
    actions: happyActions,
  },
};

export const Disabled: Story = {
  args: {
    targetKind: BedrockTargetKind.Application,
    targetId: 'app-2',
    targetLabel: 'fresh-app',
    initialEnabled: false,
    initialSnapshot: null,
    initialHealth: partialHealth,
    actions: happyActions,
  },
};

export const EnabledButEmpty: Story = {
  args: {
    targetKind: BedrockTargetKind.Application,
    targetId: 'app-3',
    targetLabel: 'just-enabled',
    initialEnabled: true,
    initialSnapshot: emptySnapshot,
    initialHealth: okHealth,
    actions: happyActions,
  },
};

export const EnabledFilesMissing: Story = {
  args: {
    targetKind: BedrockTargetKind.Application,
    targetId: 'app-4',
    targetLabel: 'flag-on-disk-gone',
    initialEnabled: true,
    initialSnapshot: missingSnapshot,
    initialHealth: okHealth,
    actions: happyActions,
  },
};

export const Loading: Story = {
  args: {
    targetKind: BedrockTargetKind.Application,
    targetId: 'app-5',
    targetLabel: 'loading',
    initialEnabled: true,
    initialSnapshot: null,
    initialHealth: okHealth,
    actions: happyActions,
  },
};

export const ErrorEnabling: Story = {
  args: {
    targetKind: BedrockTargetKind.Application,
    targetId: 'app-6',
    targetLabel: 'broken-prereqs',
    initialEnabled: false,
    initialSnapshot: null,
    initialHealth: partialHealth,
    actions: errorActions,
  },
};

export const NoHealthChecked: Story = {
  args: {
    targetKind: BedrockTargetKind.Application,
    targetId: 'app-7',
    targetLabel: 'no-doctor-yet',
    initialEnabled: true,
    initialSnapshot: populatedSnapshot,
    initialHealth: null,
    actions: happyActions,
  },
};
