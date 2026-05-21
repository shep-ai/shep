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
import type { InventoryPostureRow } from '@shepai/core/application/use-cases/aspm/posture/list-inventory-posture';
import { CanonicalSeverity } from '@shepai/core/domain/generated/output';

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
});
