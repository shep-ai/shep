/**
 * ListScanTargetsUseCase
 *
 * Returns the tree the ASPM "Scan now" dialog uses to let users pick what
 * to scan: every Repository the platform knows about, with its child
 * Applications, with their child Features (worktrees). The dialog renders
 * a checkbox tree and the bulk-scan server action runs one
 * {@link ScanApplicationUseCase} call per selected leaf:
 *
 *   - selecting a repository  → scan every Application underneath it
 *   - selecting an application → scan the app at its `repositoryPath`
 *   - selecting a feature      → scan the parent application but use the
 *                                feature's `worktreePath` as the scan root
 *
 * Features without a `worktreePath` are filtered out because the scanner
 * has no on-disk location to walk. Applications whose `repositoryPath`
 * has no matching Repository row land under a synthetic group so they
 * are still scannable from the UI.
 */

import { inject, injectable } from 'tsyringe';
import type { IRepositoryRepository } from '../../../ports/output/repositories/repository-repository.interface.js';
import type { IFeatureRepository } from '../../../ports/output/repositories/feature-repository.interface.js';
import type { ListApplicationsUseCase } from '../../applications/list-applications.use-case.js';

export interface ScanFeatureTarget {
  featureId: string;
  featureName: string;
  featureBranch: string;
  worktreePath: string;
}

export interface ScanApplicationTarget {
  applicationId: string;
  applicationName: string;
  applicationPath: string;
  lastScannedAt: Date | null;
  features: ScanFeatureTarget[];
}

export interface ScanRepositoryTarget {
  repositoryId?: string;
  repositoryName: string;
  repositoryPath: string;
  applications: ScanApplicationTarget[];
}

export interface ScanTargetTree {
  repositories: ScanRepositoryTarget[];
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

function repoDisplayName(path: string): string {
  const segments = normalizePath(path).split('/').filter(Boolean);
  return segments.at(-1) ?? path;
}

@injectable()
export class ListScanTargetsUseCase {
  constructor(
    @inject('ListApplicationsUseCase')
    private readonly listApplications: ListApplicationsUseCase,
    @inject('IRepositoryRepository')
    private readonly repoRepo: IRepositoryRepository,
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository
  ) {}

  async execute(): Promise<ScanTargetTree> {
    const [applications, repositories, features] = await Promise.all([
      this.listApplications.execute(),
      this.repoRepo.list(),
      this.featureRepo.list(),
    ]);

    const repoByPath = new Map<string, { id: string; name: string; path: string }>();
    for (const r of repositories) {
      repoByPath.set(normalizePath(r.path), { id: r.id, name: r.name, path: r.path });
    }

    const featuresByApp = new Map<string, ScanFeatureTarget[]>();
    for (const f of features) {
      if (!f.applicationId) continue;
      if (!f.worktreePath || f.worktreePath.length === 0) continue;
      const existing = featuresByApp.get(f.applicationId) ?? [];
      existing.push({
        featureId: f.id,
        featureName: f.name,
        featureBranch: f.branch,
        worktreePath: f.worktreePath,
      });
      featuresByApp.set(f.applicationId, existing);
    }

    const grouped = new Map<string, ScanRepositoryTarget>();
    for (const app of applications) {
      const key = normalizePath(app.repositoryPath);
      const repoMeta = repoByPath.get(key);
      const groupKey = repoMeta?.id ?? `path:${key}`;
      let group = grouped.get(groupKey);
      if (!group) {
        group = {
          repositoryId: repoMeta?.id,
          repositoryName: repoMeta?.name ?? repoDisplayName(app.repositoryPath),
          repositoryPath: repoMeta?.path ?? app.repositoryPath,
          applications: [],
        };
        grouped.set(groupKey, group);
      }
      group.applications.push({
        applicationId: app.id,
        applicationName: app.name,
        applicationPath: app.repositoryPath,
        lastScannedAt: app.lastScannedAt ?? null,
        features: featuresByApp.get(app.id) ?? [],
      });
    }

    for (const group of grouped.values()) {
      group.applications.sort((a, b) => a.applicationName.localeCompare(b.applicationName));
      for (const a of group.applications) {
        a.features.sort((x, y) => x.featureName.localeCompare(y.featureName));
      }
    }

    return {
      repositories: [...grouped.values()].sort((a, b) =>
        a.repositoryName.localeCompare(b.repositoryName)
      ),
    };
  }
}
