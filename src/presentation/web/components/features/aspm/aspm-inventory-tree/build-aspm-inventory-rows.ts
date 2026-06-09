/**
 * Build the FeatureTreeRow[] the ASPM Inventory page hands to
 * FeatureTreeTable. The row tree mirrors the security-relevant domain
 * hierarchy:
 *
 *   Repository (group header, materialised by Tabulator)
 *     ├─ Application                              ← `_isApplication`
 *     │    └─ Feature worktree (child branch)     ← `_isAspmFeature`
 *     └─ Feature worktree (loose, no application) ← `_isAspmFeature`
 *
 * Pure — kept colocated for direct testing without React / Tabulator
 * overhead. The page passes the raw posture rows + the full repository
 * list + every Feature row; the builder fans them out into the tree
 * shape Tabulator expects (`_children`).
 *
 * Visibility rules:
 *
 * - Repositories with no applications AND no live features get a single
 *   `_isRepoPlaceholder` row so the group header still renders (and the
 *   Scan-all portal trigger still appears) but the reviewer sees "no
 *   applications yet" instead of an invisible repo.
 * - Features with lifecycle `Archived` are dropped — the work is finished
 *   so they only add noise to the security inventory.
 * - Features without a `worktreePath` are still surfaced. The DB only
 *   populates `worktree_path` for some flows, so filtering on it would
 *   hide active branches the user can see in their repo. Whether or not
 *   a feature is scannable is a downstream concern — the inventory's job
 *   is just to show what exists.
 */

import type { InventoryPostureRow } from '@shepai/core/application/use-cases/aspm/posture/list-inventory-posture';
import type { FeatureTreeRow } from '@/components/features/feature-tree-table';

export interface AspmInventoryRepoMeta {
  id: string;
  name: string;
  remoteUrl?: string;
}

/**
 * Lightweight projection of a domain Feature the inventory cares about.
 * Server code maps `Feature` → `AspmInventoryFeature` before handing it
 * in so the builder stays decoupled from the generated domain types.
 */
export interface AspmInventoryFeature {
  id: string;
  name: string;
  branch: string;
  repositoryPath: string;
  worktreePath?: string;
  applicationId?: string;
  lifecycle?: string;
}

export interface AspmInventoryRowsInput {
  postureRows: InventoryPostureRow[];
  /** Maps repositoryPath → { id, name, remoteUrl } for the standard table column. */
  repoByPath: Map<string, AspmInventoryRepoMeta>;
  /** Every Feature in the workspace — partitioned into per-app and per-repo children. */
  features?: readonly AspmInventoryFeature[];
}

const ARCHIVED_LIFECYCLE = 'Archived';

function buildFeatureRow(
  feature: AspmInventoryFeature,
  repoName: string,
  repoMeta: AspmInventoryRepoMeta | undefined
): FeatureTreeRow {
  const row: FeatureTreeRow = {
    id: `feat-${feature.id}`,
    name: feature.name,
    status: 'in-progress',
    lifecycle: feature.lifecycle ?? 'Feature',
    branch: feature.branch,
    repositoryName: repoName,
    remoteUrl: repoMeta?.remoteUrl,
    _repositoryPath: feature.repositoryPath,
    _repositoryId: repoMeta?.id,
    _isApplication: false,
    _isAspmFeature: true,
    _featureId: feature.id,
    // Feature rows have no scan history of their own — the scan attribution
    // lives on the parent application. Leaving these undefined makes the
    // Security/Last-scan formatters render an em-dash on feature rows.
    _aspmOpenBySeverity: [],
    _aspmTotalOpen: 0,
    _aspmLastScannedAt: null,
  };
  if (feature.worktreePath !== undefined && feature.worktreePath.length > 0) {
    row._featureWorktreePath = feature.worktreePath;
  }
  if (feature.applicationId !== undefined && feature.applicationId.length > 0) {
    row._applicationId = feature.applicationId;
  }
  return row;
}

export function buildAspmInventoryRows({
  postureRows,
  repoByPath,
  features = [],
}: AspmInventoryRowsInput): FeatureTreeRow[] {
  const liveFeatures = features.filter((f) => f.lifecycle !== ARCHIVED_LIFECYCLE);

  const featuresByApp = new Map<string, AspmInventoryFeature[]>();
  const featuresByRepoPath = new Map<string, AspmInventoryFeature[]>();
  for (const feature of liveFeatures) {
    if (feature.applicationId !== undefined && feature.applicationId.length > 0) {
      const existing = featuresByApp.get(feature.applicationId) ?? [];
      existing.push(feature);
      featuresByApp.set(feature.applicationId, existing);
    } else {
      const existing = featuresByRepoPath.get(feature.repositoryPath) ?? [];
      existing.push(feature);
      featuresByRepoPath.set(feature.repositoryPath, existing);
    }
  }

  const rows: FeatureTreeRow[] = [];
  const reposWithRows = new Set<string>();

  for (const row of postureRows) {
    const repo = repoByPath.get(row.repositoryPath);
    const repoName = repo?.name ?? row.repositoryPath.split(/[/\\]/).pop() ?? row.repositoryPath;
    reposWithRows.add(row.repositoryPath);

    const childFeatures = featuresByApp.get(row.applicationId) ?? [];
    const appRow: FeatureTreeRow = {
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
    if (childFeatures.length > 0) {
      appRow._children = childFeatures.map((f) => buildFeatureRow(f, repoName, repo));
    }
    rows.push(appRow);
  }

  for (const [path, looseFeatures] of featuresByRepoPath) {
    const repo = repoByPath.get(path);
    const repoName = repo?.name ?? path.split(/[/\\]/).pop() ?? path;
    for (const feature of looseFeatures) {
      rows.push(buildFeatureRow(feature, repoName, repo));
    }
    reposWithRows.add(path);
  }

  for (const [path, repo] of repoByPath) {
    if (reposWithRows.has(path)) continue;
    rows.push({
      id: `repo-placeholder-${repo.id}`,
      name: '— no applications or branches —',
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
