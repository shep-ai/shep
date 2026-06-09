import type { Meta, StoryObj } from '@storybook/react';
import { AspmScanDialog } from './aspm-scan-dialog';
import type { AspmBulkScanResult } from '@/app/actions/aspm-scan';
import type { ScanTargetTree } from '@shepai/core/application/use-cases/aspm/scan/list-scan-targets';

const meta: Meta<typeof AspmScanDialog> = {
  title: 'Features/Aspm/AspmScanDialog',
  component: AspmScanDialog,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof meta>;

const baseTree: ScanTargetTree = {
  repositories: [
    {
      repositoryId: 'repo-shop',
      repositoryName: 'my-shop',
      repositoryPath: '/repos/my-shop',
      applications: [
        {
          applicationId: 'app-1',
          applicationName: 'web-frontend',
          applicationPath: '/repos/my-shop',
          lastScannedAt: null,
          features: [
            {
              featureId: 'feat-1',
              featureName: 'auth-refactor',
              featureBranch: 'feat/auth-refactor',
              worktreePath: '/wt/auth-refactor',
            },
          ],
        },
        {
          applicationId: 'app-2',
          applicationName: 'payments-api',
          applicationPath: '/repos/my-shop',
          lastScannedAt: null,
          features: [],
        },
      ],
    },
    {
      repositoryName: 'internal-tools',
      repositoryPath: '/repos/internal-tools',
      applications: [
        {
          applicationId: 'app-3',
          applicationName: 'admin-dashboard',
          applicationPath: '/repos/internal-tools',
          lastScannedAt: null,
          features: [],
        },
      ],
    },
  ],
};

const successResult: AspmBulkScanResult = {
  ok: true,
  results: [
    {
      applicationId: 'app-1',
      label: 'web-frontend',
      ok: true,
      summary: {
        scanRunId: 'sr-1',
        applicationId: 'app-1',
        status: 'Succeeded' as never,
        findingsInserted: 5,
        stages: [],
      },
    },
  ],
  totals: { targets: 1, succeeded: 1, failed: 0, findingsInserted: 5 },
};

const partialFailureResult: AspmBulkScanResult = {
  ok: false,
  results: [
    {
      applicationId: 'app-1',
      label: 'web-frontend',
      ok: true,
      summary: {
        scanRunId: 'sr-1',
        applicationId: 'app-1',
        status: 'Succeeded' as never,
        findingsInserted: 5,
        stages: [],
      },
    },
    {
      applicationId: 'app-2',
      label: 'payments-api',
      ok: false,
      error: 'agent quota exceeded',
    },
  ],
  totals: { targets: 2, succeeded: 1, failed: 1, findingsInserted: 5 },
};

export const Default: Story = {
  args: {
    loadTargetsOverride: async () => ({ ok: true, tree: baseTree }),
    startBulkScanOverride: async () => successResult,
  },
};

export const Loading: Story = {
  args: {
    loadTargetsOverride: (): Promise<{ ok: boolean; tree?: ScanTargetTree; error?: string }> =>
      new Promise(() => undefined),
    startBulkScanOverride: async () => successResult,
  },
};

export const Error: Story = {
  args: {
    loadTargetsOverride: async () => ({ ok: false, error: 'Database unavailable' }),
    startBulkScanOverride: async () => ({
      ok: false,
      results: [],
      totals: { targets: 0, succeeded: 0, failed: 0, findingsInserted: 0 },
      error: 'Application not found',
    }),
  },
};

export const PartialFailure: Story = {
  args: {
    loadTargetsOverride: async () => ({ ok: true, tree: baseTree }),
    startBulkScanOverride: async () => partialFailureResult,
  },
};
