/**
 * Build the FeatureTreeRow[] the ASPM Inventory page hands to
 * FeatureTreeTable. One row per application, decorated with ASPM-specific
 * fields (`_aspmOpenBySeverity`, `_aspmTotalOpen`, `_aspmLastScannedAt`)
 * so the table's extra columns and the row-actions portal manager can
 * render severity badges and the Scan-now control without re-querying.
 *
 * Pure — kept in a colocated module for direct testing without React /
 * Tabulator overhead.
 */

import type { InventoryPostureRow } from '@shepai/core/application/use-cases/aspm/posture/list-inventory-posture';
import type { FeatureTreeRow } from '@/components/features/feature-tree-table';

export interface AspmInventoryRowsInput {
  postureRows: InventoryPostureRow[];
  /** Maps repositoryPath → { id, name, remoteUrl } for the standard table column. */
  repoByPath: Map<string, { id: string; name: string; remoteUrl?: string }>;
}

export function buildAspmInventoryRows({
  postureRows,
  repoByPath,
}: AspmInventoryRowsInput): FeatureTreeRow[] {
  return postureRows.map((row) => {
    const repo = repoByPath.get(row.repositoryPath);
    const repoName = repo?.name ?? row.repositoryPath.split(/[/\\]/).pop() ?? row.repositoryPath;
    return {
      id: `app-${row.applicationId}`,
      name: row.name,
      status: 'done',
      lifecycle: 'Application',
      branch: '',
      repositoryName: repoName,
      remoteUrl: repo?.remoteUrl,
      _repositoryPath: row.repositoryPath,
      _repositoryId: repo?.id,
      _isApplication: true,
      _applicationId: row.applicationId,
      _aspmOpenBySeverity: row.openBySeverity.map((s) => ({
        severity: s.severity,
        count: s.count,
      })),
      _aspmTotalOpen: row.totalOpen,
      _aspmLastScannedAt: row.lastScannedAt,
    };
  });
}
