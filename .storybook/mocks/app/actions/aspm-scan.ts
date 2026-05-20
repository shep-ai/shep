/**
 * Storybook mock for aspm-scan server actions. Returns deterministic
 * fixture data so the dialog + progress panel render without hitting
 * the real DI container.
 */

import type { AspmScanActionResult } from '../../../../src/presentation/web/app/actions/aspm-scan';

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
