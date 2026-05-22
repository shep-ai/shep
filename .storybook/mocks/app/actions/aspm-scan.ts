/**
 * Storybook mock for aspm-scan server actions. Returns deterministic
 * fixture data so the dialog + progress panel render without hitting
 * the real DI container.
 */

import type {
  AspmBulkScanResult,
  AspmScanActionResult,
} from '../../../../src/presentation/web/app/actions/aspm-scan';
import type { ScanTargetTree } from '../../../../packages/core/src/application/use-cases/aspm/scan/list-scan-targets';

export async function startScan(): Promise<AspmScanActionResult> {
  return {
    ok: true,
    summary: {
      scanRunId: 'sr-storybook-1',
      applicationId: 'app-1',
      status: 'Succeeded' as never,
      findingsInserted: 7,
      stages: [
        { name: 'sbom' as never, status: 'Succeeded' as never, componentsCount: 42 },
        { name: 'sca' as never, status: 'Succeeded' as never, findingsCount: 3 },
        { name: 'secrets' as never, status: 'Succeeded' as never, findingsCount: 2 },
        { name: 'sast' as never, status: 'Succeeded' as never, findingsCount: 1 },
        { name: 'container' as never, status: 'Skipped' as never },
        { name: 'iac' as never, status: 'Succeeded' as never, findingsCount: 1 },
      ],
    },
  };
}

export async function rescanApplication(): Promise<AspmScanActionResult> {
  return startScan();
}

export async function listScanRuns(): Promise<{ ok: boolean; runs: unknown[] }> {
  return { ok: true, runs: [] };
}

export async function startBulkScan(): Promise<AspmBulkScanResult> {
  return {
    ok: true,
    results: [
      {
        applicationId: 'app-1',
        label: 'web (storybook)',
        ok: true,
        summary: {
          scanRunId: 'sr-storybook-bulk-1',
          applicationId: 'app-1',
          status: 'Succeeded' as never,
          findingsInserted: 4,
          stages: [],
        },
      },
    ],
    totals: { targets: 1, succeeded: 1, failed: 0, findingsInserted: 4 },
  };
}

export async function listAspmScanTargets(): Promise<{
  ok: boolean;
  tree?: ScanTargetTree;
  error?: string;
}> {
  return {
    ok: true,
    tree: {
      repositories: [
        {
          repositoryId: 'repo-1',
          repositoryName: 'my-shop',
          repositoryPath: '/repos/my-shop',
          applications: [
            {
              applicationId: 'app-1',
              applicationName: 'web',
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
              applicationName: 'api',
              applicationPath: '/repos/my-shop',
              lastScannedAt: null,
              features: [],
            },
          ],
        },
      ],
    },
  };
}
