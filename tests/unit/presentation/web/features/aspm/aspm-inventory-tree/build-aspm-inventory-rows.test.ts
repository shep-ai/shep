/**
 * build-aspm-inventory-rows unit tests
 *
 * The row builder is pure — these asserts pin down the shape the
 * FeatureTreeTable's extra columns + the row-actions portal manager
 * expect (`_aspmOpenBySeverity`, `_aspmTotalOpen`, `_aspmLastScannedAt`,
 * `_isApplication`, `_applicationId`).
 */

import { describe, it, expect } from 'vitest';

import { buildAspmInventoryRows } from '@/components/features/aspm/aspm-inventory-tree/build-aspm-inventory-rows';
import type { AspmInventoryFeature } from '@/components/features/aspm/aspm-inventory-tree/build-aspm-inventory-rows';
import type { InventoryPostureRow } from '@shepai/core/application/use-cases/aspm/posture/list-inventory-posture';
import { CanonicalSeverity } from '@shepai/core/domain/generated/output';

function makeFeature(overrides: Partial<AspmInventoryFeature>): AspmInventoryFeature {
  return {
    id: 'feat-stub',
    name: 'stub',
    branch: 'feat/stub',
    repositoryPath: '/repos/example',
    worktreePath: '/wt/stub',
    ...overrides,
  };
}

function makePostureRow(
  overrides: Partial<InventoryPostureRow> & { applicationId: string; name: string }
): InventoryPostureRow {
  return {
    repositoryPath: '/repos/example',
    lastScannedAt: null,
    openBySeverity: [],
    totalOpen: 0,
    application: {} as InventoryPostureRow['application'],
    ...overrides,
  };
}

describe('buildAspmInventoryRows', () => {
  it('produces one application row per posture row with ASPM fields attached', () => {
    const scannedAt = new Date('2026-05-19T12:00:00Z');
    const rows = buildAspmInventoryRows({
      postureRows: [
        makePostureRow({
          applicationId: 'app-1',
          name: 'cli',
          repositoryPath: '/repos/cli-platform',
          lastScannedAt: scannedAt,
          openBySeverity: [
            { severity: CanonicalSeverity.Critical, count: 2 },
            { severity: CanonicalSeverity.High, count: 4 },
          ],
          totalOpen: 6,
        }),
      ],
      repoByPath: new Map([
        ['/repos/cli-platform', { id: 'r-1', name: 'cli-platform', remoteUrl: 'git@x:y/cli' }],
      ]),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'app-app-1',
      name: 'cli',
      _isApplication: true,
      _applicationId: 'app-1',
      _repositoryPath: '/repos/cli-platform',
      _repositoryId: 'r-1',
      repositoryName: 'cli-platform',
      remoteUrl: 'git@x:y/cli',
      _aspmTotalOpen: 6,
      _aspmLastScannedAt: scannedAt,
    });
    expect(rows[0]?._aspmOpenBySeverity).toEqual([
      { severity: CanonicalSeverity.Critical, count: 2 },
      { severity: CanonicalSeverity.High, count: 4 },
    ]);
  });

  it('falls back to the repository path basename when no repo lookup is found', () => {
    const rows = buildAspmInventoryRows({
      postureRows: [
        makePostureRow({
          applicationId: 'app-9',
          name: 'orphan',
          repositoryPath: '/some/where/orphan-repo',
        }),
      ],
      repoByPath: new Map(),
    });
    expect(rows[0]?.repositoryName).toBe('orphan-repo');
    expect(rows[0]?._repositoryId).toBeUndefined();
  });

  it('preserves a null lastScannedAt so the column can render "Never"', () => {
    const rows = buildAspmInventoryRows({
      postureRows: [
        makePostureRow({ applicationId: 'app-1', name: 'unscanned', lastScannedAt: null }),
      ],
      repoByPath: new Map(),
    });
    expect(rows[0]?._aspmLastScannedAt).toBeNull();
  });

  it('returns an empty list when no posture rows are supplied', () => {
    const rows = buildAspmInventoryRows({ postureRows: [], repoByPath: new Map() });
    expect(rows).toEqual([]);
  });

  it('emits a placeholder row for repositories that have no applications and no features', () => {
    const rows = buildAspmInventoryRows({
      postureRows: [
        makePostureRow({
          applicationId: 'app-1',
          name: 'cli',
          repositoryPath: '/repos/cli-platform',
        }),
      ],
      repoByPath: new Map([
        ['/repos/cli-platform', { id: 'r-1', name: 'cli-platform' }],
        ['/repos/empty-repo', { id: 'r-2', name: 'empty-repo', remoteUrl: 'git@x:y/empty' }],
      ]),
      features: [],
    });

    expect(rows).toHaveLength(2);
    const placeholder = rows.find((r) => r._isRepoPlaceholder === true);
    expect(placeholder).toMatchObject({
      _isRepoPlaceholder: true,
      _isApplication: false,
      _repositoryId: 'r-2',
      _repositoryPath: '/repos/empty-repo',
      repositoryName: 'empty-repo',
      remoteUrl: 'git@x:y/empty',
      _aspmTotalOpen: 0,
      _aspmLastScannedAt: null,
    });
    expect(placeholder?._aspmOpenBySeverity).toEqual([]);
  });

  it('attaches features that have applicationId as _children of their parent app row', () => {
    const rows = buildAspmInventoryRows({
      postureRows: [
        makePostureRow({
          applicationId: 'app-1',
          name: 'cli',
          repositoryPath: '/repos/cli-platform',
        }),
      ],
      repoByPath: new Map([['/repos/cli-platform', { id: 'r-1', name: 'cli-platform' }]]),
      features: [
        makeFeature({
          id: 'feat-1',
          name: 'auth-rewrite',
          branch: 'feat/auth-rewrite',
          repositoryPath: '/repos/cli-platform',
          worktreePath: '/wt/auth-rewrite',
          applicationId: 'app-1',
        }),
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?._children).toHaveLength(1);
    const child = rows[0]?._children?.[0];
    expect(child).toMatchObject({
      id: 'feat-feat-1',
      name: 'auth-rewrite',
      branch: 'feat/auth-rewrite',
      _isAspmFeature: true,
      _featureId: 'feat-1',
      _featureWorktreePath: '/wt/auth-rewrite',
      _applicationId: 'app-1',
      _repositoryId: 'r-1',
      _repositoryPath: '/repos/cli-platform',
    });
  });

  it('shows applicationless features as direct repo-group children instead of a placeholder', () => {
    const rows = buildAspmInventoryRows({
      postureRows: [],
      repoByPath: new Map([['/repos/empty-with-feats', { id: 'r-2', name: 'empty-with-feats' }]]),
      features: [
        makeFeature({
          id: 'feat-loose',
          name: 'sandbox',
          branch: 'feat/sandbox',
          repositoryPath: '/repos/empty-with-feats',
          worktreePath: '/wt/sandbox',
        }),
      ],
    });

    expect(rows.find((r) => r._isRepoPlaceholder === true)).toBeUndefined();
    const featRow = rows.find((r) => r._isAspmFeature === true);
    expect(featRow).toMatchObject({
      id: 'feat-feat-loose',
      _isAspmFeature: true,
      _featureId: 'feat-loose',
      _featureWorktreePath: '/wt/sandbox',
      _repositoryId: 'r-2',
      _repositoryPath: '/repos/empty-with-feats',
      repositoryName: 'empty-with-feats',
    });
    expect(featRow?._applicationId).toBeUndefined();
  });

  it('keeps features without a worktree path so the inventory still surfaces them', () => {
    const rows = buildAspmInventoryRows({
      postureRows: [
        makePostureRow({
          applicationId: 'app-1',
          name: 'cli',
          repositoryPath: '/repos/cli-platform',
        }),
      ],
      repoByPath: new Map([['/repos/cli-platform', { id: 'r-1', name: 'cli-platform' }]]),
      features: [
        makeFeature({
          id: 'feat-no-wt',
          name: 'no-wt-yet',
          branch: 'feat/no-wt-yet',
          applicationId: 'app-1',
          repositoryPath: '/repos/cli-platform',
          worktreePath: undefined,
        }),
      ],
    });

    expect(rows[0]?._children).toHaveLength(1);
    expect(rows[0]?._children?.[0]).toMatchObject({
      _isAspmFeature: true,
      _featureId: 'feat-no-wt',
      branch: 'feat/no-wt-yet',
    });
    expect(rows[0]?._children?.[0]?._featureWorktreePath).toBeUndefined();
  });

  it('drops Archived features so the security inventory stays focused on live work', () => {
    const rows = buildAspmInventoryRows({
      postureRows: [
        makePostureRow({
          applicationId: 'app-1',
          name: 'cli',
          repositoryPath: '/repos/cli-platform',
        }),
      ],
      repoByPath: new Map([['/repos/cli-platform', { id: 'r-1', name: 'cli-platform' }]]),
      features: [
        makeFeature({
          id: 'feat-archived',
          applicationId: 'app-1',
          repositoryPath: '/repos/cli-platform',
          worktreePath: '/wt/archived',
          lifecycle: 'Archived',
        }),
        makeFeature({
          id: 'feat-live',
          applicationId: 'app-1',
          repositoryPath: '/repos/cli-platform',
          worktreePath: '/wt/live',
          lifecycle: 'Review',
        }),
      ],
    });

    const children = rows[0]?._children ?? [];
    expect(children).toHaveLength(1);
    expect(children[0]?._featureId).toBe('feat-live');
  });
});
