import { describe, it, expect } from 'vitest';
import {
  applicationLeafIdsForRepository,
  appSelectionId,
  featureSelectionId,
  selectionStateForApplication,
  selectionStateForRepository,
  toggleLeaves,
  leafIdsForRepository,
  computeBulkTargets,
} from '@/components/features/aspm/aspm-scan-dialog/compute-bulk-targets';
import type { ScanTargetTree } from '@shepai/core/application/use-cases/aspm/scan/list-scan-targets';

const FIXTURE: ScanTargetTree = {
  repositories: [
    {
      repositoryId: 'repo-1',
      repositoryName: 'my-shop',
      repositoryPath: '/repos/my-shop',
      applications: [
        {
          applicationId: 'app-web',
          applicationName: 'web',
          applicationPath: '/repos/my-shop',
          lastScannedAt: null,
          features: [
            {
              featureId: 'feat-auth',
              featureName: 'auth',
              featureBranch: 'feat/auth',
              worktreePath: '/wt/auth',
            },
          ],
        },
        {
          applicationId: 'app-api',
          applicationName: 'api',
          applicationPath: '/repos/my-shop',
          lastScannedAt: null,
          features: [],
        },
      ],
    },
  ],
};

describe('compute-bulk-targets', () => {
  it('reports repository selection as checked when every leaf is selected', () => {
    const repo = FIXTURE.repositories[0]!;
    const selected = new Set(leafIdsForRepository(repo));
    expect(selectionStateForRepository(selected, repo)).toBe('checked');
  });

  it('reports repository selection as indeterminate when some leaves are selected', () => {
    const repo = FIXTURE.repositories[0]!;
    const selected = new Set([appSelectionId('app-web')]);
    expect(selectionStateForRepository(selected, repo)).toBe('indeterminate');
  });

  it('reports application selection as indeterminate when only its feature is selected', () => {
    const app = FIXTURE.repositories[0]!.applications[0]!;
    const selected = new Set([featureSelectionId('feat-auth')]);
    expect(selectionStateForApplication(selected, app)).toBe('indeterminate');
  });

  it('toggleLeaves selects every leaf when starting from an empty selection', () => {
    const repo = FIXTURE.repositories[0]!;
    const next = toggleLeaves(new Set(), leafIdsForRepository(repo));
    expect(next.size).toBe(3);
    expect(next.has(appSelectionId('app-web'))).toBe(true);
    expect(next.has(appSelectionId('app-api'))).toBe(true);
    expect(next.has(featureSelectionId('feat-auth'))).toBe(true);
  });

  it('toggleLeaves clears every leaf when the repo was fully selected', () => {
    const repo = FIXTURE.repositories[0]!;
    const all = new Set(leafIdsForRepository(repo));
    const next = toggleLeaves(all, leafIdsForRepository(repo));
    expect(next.size).toBe(0);
  });

  it('computes one bulk-target per selected application, using its name as label', () => {
    const selected = new Set([appSelectionId('app-web'), appSelectionId('app-api')]);
    const targets = computeBulkTargets(FIXTURE, selected);
    expect(targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ applicationId: 'app-web', label: 'web' }),
        expect.objectContaining({ applicationId: 'app-api', label: 'api' }),
      ])
    );
    expect(targets.every((t) => t.scanPath === undefined)).toBe(true);
  });

  it('computes a feature target with the worktreePath as scanPath and the parent applicationId', () => {
    const selected = new Set([featureSelectionId('feat-auth')]);
    const targets = computeBulkTargets(FIXTURE, selected);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toEqual({
      applicationId: 'app-web',
      scanPath: '/wt/auth',
      label: 'web · auth',
    });
  });

  it('ignores selection ids the index does not recognise', () => {
    const selected = new Set(['app:does-not-exist', 'feat:also-missing']);
    expect(computeBulkTargets(FIXTURE, selected)).toEqual([]);
  });

  it('applicationLeafIdsForRepository returns only the app leaves for the main-branch shortcut', () => {
    const repo = FIXTURE.repositories[0]!;
    expect(applicationLeafIdsForRepository(repo)).toEqual([
      appSelectionId('app-web'),
      appSelectionId('app-api'),
    ]);
  });
});
