import { resolve } from '@/lib/server-container';
import type { ListFeaturesUseCase } from '@shepai/core/application/use-cases/features/list-features.use-case';
import type { ListRepositoriesUseCase } from '@shepai/core/application/use-cases/repositories/list-repositories.use-case';
import type { ListAgentRunsUseCase } from '@shepai/core/application/use-cases/agents/list-agent-runs.use-case';
import type { AgentRun } from '@shepai/core/domain/generated/output';
import type { FeatureTreeRow } from '@/components/features/feature-tree-table';
import type { FeatureStatus } from '@/components/common/feature-status-config';
import type {
  ParentFeatureOption,
  RepositoryOption,
} from '@/components/common/feature-create-drawer';
import type { WorkflowDefaults } from '@/app/actions/get-workflow-defaults';
import { SdlcLifecycle, PrStatus } from '@shepai/core/domain/generated/output';
import { deriveNodeState } from '@/components/common/feature-node/derive-feature-state';
import { getWorkflowDefaults } from '@/app/actions/get-workflow-defaults';
import { getSettings } from '@shepai/core/infrastructure/services/settings.service';

export interface InventoryRepo {
  name: string;
  remoteUrl?: string;
}

/** Data needed by the create-feature drawer embedded in the inventory page. */
export interface InventoryCreateData {
  featureOptions: ParentFeatureOption[];
  repositoryOptions: RepositoryOption[];
  workflowDefaults?: WorkflowDefaults;
  currentAgentType?: string;
  currentModel?: string;
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

/**
 * Build a lookup of the latest agent run per feature ID.
 * ListAgentRunsUseCase returns runs sorted by createdAt desc,
 * so the first run per featureId is the latest.
 */
function buildLatestAgentRunMap(agentRuns: AgentRun[]): Map<string, AgentRun> {
  const map = new Map<string, AgentRun>();
  for (const run of agentRuns) {
    if (run.featureId && !map.has(run.featureId)) {
      map.set(run.featureId, run);
    }
  }
  return map;
}

export async function getFeatureTreeData(): Promise<{
  features: FeatureTreeRow[];
  repos: InventoryRepo[];
  createData: InventoryCreateData;
}> {
  const listFeatures = resolve<ListFeaturesUseCase>('ListFeaturesUseCase');
  const listRepos = resolve<ListRepositoriesUseCase>('ListRepositoriesUseCase');
  const listAgentRuns = resolve<ListAgentRunsUseCase>('ListAgentRunsUseCase');

  const [features, repositories, agentRuns, workflowDefaults] = await Promise.all([
    listFeatures.execute({ includeArchived: true }),
    listRepos.execute(),
    listAgentRuns.execute(),
    getWorkflowDefaults().catch(() => undefined),
  ]);

  const repoByPath = new Map<string, { id: string; name: string; remoteUrl?: string }>();
  for (const repo of repositories) {
    repoByPath.set(repo.path, { id: repo.id, name: repo.name, remoteUrl: repo.remoteUrl });
  }

  const latestRunByFeature = buildLatestAgentRunMap(agentRuns);

  // Build a set of feature IDs that are parents (have children)
  const parentIds = new Set<string>();
  for (const feature of features) {
    if (feature.parentId) {
      parentIds.add(feature.parentId);
    }
  }

  const featureRows: FeatureTreeRow[] = features.map((feature) => {
    const repo = repoByPath.get(feature.repositoryPath);
    const latestRun = latestRunByFeature.get(feature.id);
    return {
      id: feature.id,
      name: feature.name,
      status: lifecycleToStatus(feature.lifecycle),
      lifecycle: feature.lifecycle,
      branch: feature.branch,
      repositoryName:
        repo?.name ?? feature.repositoryPath.split('/').pop() ?? feature.repositoryPath,
      remoteUrl: repo?.remoteUrl,
      _repositoryPath: feature.repositoryPath,
      _repositoryId: repo?.id,
      parentId: feature.parentId ?? undefined,
      nodeState: deriveNodeState(feature, latestRun),
      hasChildren: parentIds.has(feature.id),
      hasOpenPr: feature.pr?.status === PrStatus.Open,
    };
  });

  const repos = repositories.map((repo) => ({
    name: repo.name,
    remoteUrl: repo.remoteUrl,
  }));

  const settings = getSettings();

  const featureOptions: ParentFeatureOption[] = features
    .map((f) => ({ id: f.id, name: f.name }))
    .filter((f) => f.id && !f.id.startsWith('#'));

  const repositoryOptions: RepositoryOption[] = repositories.map((r) => ({
    id: r.id,
    name: r.name,
    path: r.path,
  }));

  const createData: InventoryCreateData = {
    featureOptions,
    repositoryOptions,
    workflowDefaults,
    currentAgentType: settings.agent.type,
    currentModel: settings.models.default,
  };

  return { features: featureRows, repos, createData };
}
