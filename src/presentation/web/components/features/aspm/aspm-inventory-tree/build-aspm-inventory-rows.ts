/**
 * Build the FeatureTreeRow[] the ASPM Inventory page hands to
 * FeatureTreeTable. One row per application, decorated with ASPM-specific
 * fields (`_aspmOpenBySeverity`, `_aspmTotalOpen`, `_aspmLastScannedAt`)
 * so the table's extra columns and the row-actions portal manager can
 * render severity badges and the Scan-now control without re-querying.
 *
 * Repositories that have no applications attached yet still appear on the
 * inventory as `_isRepoPlaceholder` rows so the security reviewer can see
 * every tracked repo and trigger Scan-all from the group header. The
 * placeholder rows do not get an actions portal or severity badges — they
 * exist only to keep the repo's group header visible after Tabulator
 * groups by `repositoryName`.
 *
 * Pure — kept in a colocated module for direct testing without React /
 * Tabulator overhead.
 */

import type { InventoryPostureRow } from '@shepai/core/application/use-cases/aspm/posture/list-inventory-posture';
import type { FeatureTreeRow } from '@/components/features/feature-tree-table';

export interface AspmInventoryRepoMeta {
  id: string;
  name: string;
  remoteUrl?: string;
}

export interface AspmInventoryRowsInput {
  postureRows: InventoryPostureRow[];
  /** Maps repositoryPath → { id, name, remoteUrl } for the standard table column. */
  repoByPath: Map<string, AspmInventoryRepoMeta>;
}

export function buildAspmInventoryRows({
  postureRows,
  repoByPath,
}: AspmInventoryRowsInput): FeatureTreeRow[] {
  const rows: FeatureTreeRow[] = [];
  const reposWithApps = new Set<string>();

  for (const row of postureRows) {
    const repo = repoByPath.get(row.repositoryPath);
    const repoName = repo?.name ?? row.repositoryPath.split(/[/\\]/).pop() ?? row.repositoryPath;
    if (repo) reposWithApps.add(row.repositoryPath);
    rows.push({
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
    });
  }

  // Surface every tracked repository even when it has no applications yet
  // so security reviewers can see it on the inventory and start a scan.
  for (const [path, repo] of repoByPath) {
    if (reposWithApps.has(path)) continue;
    rows.push({
      id: `repo-placeholder-${repo.id}`,
      name: '— no applications —',
      status: 'pending',
      lifecycle: '',
      branch: '',
      repositoryName: repo.name,
      remoteUrl: repo.remoteUrl,
      _repositoryPath: path,
      _repositoryId: repo.id,
      _isApplication: false,
      _isRepoPlaceholder: true,
      _aspmOpenBySeverity: [],
      _aspmTotalOpen: 0,
      _aspmLastScannedAt: null,
    });
  }

  return rows;
}
