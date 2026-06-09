/**
 * Pure helpers for the multi-select AspmScanDialog. The dialog stores a flat
 * `Set<string>` of selection IDs — one per leaf (application or feature). These
 * helpers translate between that flat selection and:
 *
 *   - the bulk-target list the {@link startBulkScan} server action consumes
 *   - the tri-state checkbox view (checked / indeterminate / unchecked) for
 *     repository and application rows in the picker tree
 *
 * Kept pure so the dialog stays a thin shell and so this logic is unit-tested
 * without touching the React render path.
 */

import type {
  ScanApplicationTarget,
  ScanRepositoryTarget,
  ScanTargetTree,
} from '@shepai/core/application/use-cases/aspm/scan/list-scan-targets';
import type { AspmBulkScanTarget } from '@/app/actions/aspm-scan';

export const APP_PREFIX = 'app:';
export const FEAT_PREFIX = 'feat:';

export function appSelectionId(applicationId: string): string {
  return `${APP_PREFIX}${applicationId}`;
}

export function featureSelectionId(featureId: string): string {
  return `${FEAT_PREFIX}${featureId}`;
}

/** Every selectable leaf id under an application (the app itself + its features). */
export function leafIdsForApplication(app: ScanApplicationTarget): string[] {
  return [
    appSelectionId(app.applicationId),
    ...app.features.map((f) => featureSelectionId(f.featureId)),
  ];
}

/** Every selectable leaf id under a repository (all its apps + all their features). */
export function leafIdsForRepository(repo: ScanRepositoryTarget): string[] {
  return repo.applications.flatMap(leafIdsForApplication);
}

/**
 * Only the application leaves under a repository — used when the caller
 * wants to scan the repo's "main" working tree (every app at its
 * `repositoryPath`) without also walking every feature worktree.
 */
export function applicationLeafIdsForRepository(repo: ScanRepositoryTarget): string[] {
  return repo.applications.map((app) => appSelectionId(app.applicationId));
}

export type SelectionState = 'checked' | 'indeterminate' | 'unchecked';

export function selectionStateForLeaves(
  selected: ReadonlySet<string>,
  leafIds: readonly string[]
): SelectionState {
  if (leafIds.length === 0) return 'unchecked';
  let on = 0;
  for (const id of leafIds) if (selected.has(id)) on += 1;
  if (on === 0) return 'unchecked';
  if (on === leafIds.length) return 'checked';
  return 'indeterminate';
}

export function selectionStateForApplication(
  selected: ReadonlySet<string>,
  app: ScanApplicationTarget
): SelectionState {
  return selectionStateForLeaves(selected, leafIdsForApplication(app));
}

export function selectionStateForRepository(
  selected: ReadonlySet<string>,
  repo: ScanRepositoryTarget
): SelectionState {
  return selectionStateForLeaves(selected, leafIdsForRepository(repo));
}

interface FeatureLookupEntry {
  applicationId: string;
  featureName: string;
  featureBranch: string;
  worktreePath: string;
}

interface AppLookupEntry {
  applicationName: string;
}

/**
 * Build the lookup tables consumed by {@link computeBulkTargets}. Doing this
 * once on the tree avoids walking it for every selected id.
 */
export function buildSelectionIndex(tree: ScanTargetTree): {
  apps: Map<string, AppLookupEntry>;
  features: Map<string, FeatureLookupEntry>;
} {
  const apps = new Map<string, AppLookupEntry>();
  const features = new Map<string, FeatureLookupEntry>();
  for (const repo of tree.repositories) {
    for (const app of repo.applications) {
      apps.set(app.applicationId, { applicationName: app.applicationName });
      for (const f of app.features) {
        features.set(f.featureId, {
          applicationId: app.applicationId,
          featureName: f.featureName,
          featureBranch: f.featureBranch,
          worktreePath: f.worktreePath,
        });
      }
    }
  }
  return { apps, features };
}

export function computeBulkTargets(
  tree: ScanTargetTree,
  selected: ReadonlySet<string>
): AspmBulkScanTarget[] {
  const { apps, features } = buildSelectionIndex(tree);
  const out: AspmBulkScanTarget[] = [];
  for (const id of selected) {
    if (id.startsWith(APP_PREFIX)) {
      const appId = id.slice(APP_PREFIX.length);
      const meta = apps.get(appId);
      if (!meta) continue;
      out.push({ applicationId: appId, label: meta.applicationName });
    } else if (id.startsWith(FEAT_PREFIX)) {
      const featureId = id.slice(FEAT_PREFIX.length);
      const meta = features.get(featureId);
      if (!meta) continue;
      out.push({
        applicationId: meta.applicationId,
        scanPath: meta.worktreePath,
        label: `${apps.get(meta.applicationId)?.applicationName ?? meta.applicationId} · ${meta.featureName}`,
      });
    }
  }
  return out;
}

interface FeatureSelectionLeaf {
  id: string;
  featureId: string;
}

/**
 * Convenience: when the user clicks a tri-state checkbox at the repo or app
 * level, return the next selection set. If the row is fully checked we
 * uncheck every leaf under it; otherwise we check every leaf under it.
 */
export function toggleLeaves(
  selected: ReadonlySet<string>,
  leafIds: readonly string[]
): Set<string> {
  const next = new Set(selected);
  const state = selectionStateForLeaves(selected, leafIds);
  if (state === 'checked') {
    for (const id of leafIds) next.delete(id);
  } else {
    for (const id of leafIds) next.add(id);
  }
  return next;
}

export function toggleSingle(selected: ReadonlySet<string>, leafId: string): Set<string> {
  const next = new Set(selected);
  if (next.has(leafId)) next.delete(leafId);
  else next.add(leafId);
  return next;
}

export { type FeatureSelectionLeaf };
