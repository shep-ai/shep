import { resolve } from '@/lib/server-container';
import type { ListFeaturesUseCase } from '@shepai/core/application/use-cases/features/list-features.use-case';
import type { ListRepositoriesUseCase } from '@shepai/core/application/use-cases/repositories/list-repositories.use-case';
import type { ListAgentRunsUseCase } from '@shepai/core/application/use-cases/agents/list-agent-runs.use-case';
import type {
  ListApplicationsUseCase,
  ApplicationWithStatus,
  ApplicationEffectiveStatus,
} from '@shepai/core/application/use-cases/applications/list-applications.use-case';
import type { ListDeploymentsUseCase } from '@shepai/core/application/use-cases/deployments/list-deployments.use-case';
import type { DeploymentStatusEntry } from '@shepai/core/application/ports/output/services/deployment-service.interface';
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

const APP_STATUS_TO_FEATURE_STATUS: Record<ApplicationEffectiveStatus, FeatureStatus> = {
  ready: 'done',
  building: 'in-progress',
  interrupted: 'action-needed',
  failed: 'error',
};

const APP_STATUS_LIFECYCLE_LABEL: Record<ApplicationEffectiveStatus, string> = {
  ready: 'Application',
  building: 'Application · Building',
  interrupted: 'Application · Interrupted',
  failed: 'Application · Failed',
};

function applicationToTreeRow(
  app: ApplicationWithStatus,
  repoByPath: Map<string, { id: string; name: string; remoteUrl?: string }>
): FeatureTreeRow {
  const repo = repoByPath.get(app.repositoryPath);
  const repoName = repo?.name ?? app.repositoryPath.split(/[/\\]/).pop() ?? app.repositoryPath;
  return {
    id: `app-${app.id}`,
    name: app.name,
    status: APP_STATUS_TO_FEATURE_STATUS[app.effectiveStatus],
    lifecycle: APP_STATUS_LIFECYCLE_LABEL[app.effectiveStatus],
    branch: '',
    repositoryName: repoName,
    remoteUrl: repo?.remoteUrl,
    _repositoryPath: app.repositoryPath,
    _repositoryId: repo?.id,
    _isApplication: true,
    _applicationId: app.id,
    _applicationCloudUrl: app.cloudDeploymentUrl ?? undefined,
  };
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
  /** Combined feature + application rows for the inventory table. */
  inventoryRows: FeatureTreeRow[];
  repos: InventoryRepo[];
  createData: InventoryCreateData;
  applications: ApplicationWithStatus[];
  initialDeployments: DeploymentStatusEntry[];
}> {
  const listFeatures = resolve<ListFeaturesUseCase>('ListFeaturesUseCase');
  const listRepos = resolve<ListRepositoriesUseCase>('ListRepositoriesUseCase');
  const listAgentRuns = resolve<ListAgentRunsUseCase>('ListAgentRunsUseCase');

  const [features, repositories, agentRuns, workflowDefaults, applications, initialDeployments] =
    await Promise.all([
      listFeatures.execute({ includeArchived: true }),
      listRepos.execute(),
      listAgentRuns.execute(),
      getWorkflowDefaults().catch(() => undefined),
      resolveListApplications().catch((): ApplicationWithStatus[] => []),
      resolveListDeployments().catch((): DeploymentStatusEntry[] => []),
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

  const applicationRows: FeatureTreeRow[] = applications.map((app) =>
    applicationToTreeRow(app, repoByPath)
  );

  const inventoryRows: FeatureTreeRow[] = [...applicationRows, ...featureRows];

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

  return {
    features: featureRows,
    inventoryRows,
    repos,
    createData,
    applications,
    initialDeployments,
  };
}

/**
 * Resolve and execute ListApplicationsUseCase. Wrapped so the call site
 * can swallow registration errors (e.g. when the use case isn't bound
 * in tests) without losing the rest of the data.
 */
async function resolveListApplications(): Promise<ApplicationWithStatus[]> {
  const useCase = resolve<ListApplicationsUseCase>('ListApplicationsUseCase');
  return useCase.execute();
}

async function resolveListDeployments(): Promise<DeploymentStatusEntry[]> {
  const useCase = resolve<ListDeploymentsUseCase>('ListDeploymentsUseCase');
  return useCase.execute();
}
