import { resolve } from '@/lib/server-container';
import type { ListFeaturesUseCase } from '@shepai/core/application/use-cases/features/list-features.use-case';
import type { ListRepositoriesUseCase } from '@shepai/core/application/use-cases/repositories/list-repositories.use-case';
import type { FeatureTreeRow } from '@/components/features/feature-tree-table';
import type { FeatureStatus } from '@/components/common/feature-status-config';
import { SdlcLifecycle } from '@shepai/core/domain/generated/output';

export interface InventoryRepo {
  name: string;
  remoteUrl?: string;
}

const LIFECYCLE_TO_STATUS: Record<string, FeatureStatus> = {
  [SdlcLifecycle.Started]: 'pending',
  [SdlcLifecycle.Analyze]: 'in-progress',
  [SdlcLifecycle.Requirements]: 'action-needed',
  [SdlcLifecycle.Research]: 'in-progress',
  [SdlcLifecycle.Planning]: 'in-progress',
  [SdlcLifecycle.Implementation]: 'in-progress',
  [SdlcLifecycle.Review]: 'action-needed',
  [SdlcLifecycle.Maintain]: 'done',
  [SdlcLifecycle.Blocked]: 'blocked',
  [SdlcLifecycle.Pending]: 'pending',
  [SdlcLifecycle.Deleting]: 'blocked',
  [SdlcLifecycle.AwaitingUpstream]: 'action-needed',
  [SdlcLifecycle.Archived]: 'done',
};

function lifecycleToStatus(lifecycle: SdlcLifecycle): FeatureStatus {
  return LIFECYCLE_TO_STATUS[lifecycle] ?? 'pending';
}

export async function getFeatureTreeData(): Promise<{
  features: FeatureTreeRow[];
  repos: InventoryRepo[];
}> {
  const listFeatures = resolve<ListFeaturesUseCase>('ListFeaturesUseCase');
  const listRepos = resolve<ListRepositoriesUseCase>('ListRepositoriesUseCase');

  const [features, repositories] = await Promise.all([
    listFeatures.execute({ includeArchived: true }),
    listRepos.execute(),
  ]);

  const repoByPath = new Map<string, { name: string; remoteUrl?: string }>();
  for (const repo of repositories) {
    repoByPath.set(repo.path, { name: repo.name, remoteUrl: repo.remoteUrl });
  }

  const featureRows = features.map((feature) => {
    const repo = repoByPath.get(feature.repositoryPath);
    return {
      id: feature.id,
      name: feature.name,
      status: lifecycleToStatus(feature.lifecycle),
      lifecycle: feature.lifecycle,
      branch: feature.branch,
      repositoryName:
        repo?.name ?? feature.repositoryPath.split('/').pop() ?? feature.repositoryPath,
      remoteUrl: repo?.remoteUrl,
      parentId: feature.parentId ?? undefined,
    };
  });

  const repos = repositories.map((repo) => ({
    name: repo.name,
    remoteUrl: repo.remoteUrl,
  }));

  return { features: featureRows, repos };
}
