import { resolve } from '@/lib/server-container';
import type { ListFeaturesUseCase } from '@shepai/core/application/use-cases/features/list-features.use-case';
import type { ListRepositoriesUseCase } from '@shepai/core/application/use-cases/repositories/list-repositories.use-case';
import type { GetApplicationUseCase } from '@shepai/core/application/use-cases/applications/get-application.use-case';
import type { ListPluginsUseCase } from '@shepai/core/application/use-cases/plugins/list-plugins.use-case';
import { getSettings } from '@shepai/core/infrastructure/services/settings.service';
import { getWorkflowDefaults } from '@/app/actions/get-workflow-defaults';
import { getViewerPermission } from '@/app/actions/get-viewer-permission';
import { CreateDrawerClient } from '@/components/common/control-center-drawer/create-drawer-client';
import type { BuildMode } from '@/components/common/feature-create-drawer';
import { URL_PARAMS } from '@/lib/url-params';

/** Skip static pre-rendering since we need runtime DI container. */
export const dynamic = 'force-dynamic';

interface CreateDrawerPageSearchParams {
  [URL_PARAMS.repo]?: string;
  [URL_PARAMS.parent]?: string;
  [URL_PARAMS.prompt]?: string;
  [URL_PARAMS.mode]?: string;
  [URL_PARAMS.applicationId]?: string;
}

interface CreateDrawerPageProps {
  searchParams: Promise<CreateDrawerPageSearchParams>;
}

function parseMode(raw: string | undefined): BuildMode | undefined {
  if (raw === 'application' || raw === 'fast' || raw === 'spec') return raw;
  return undefined;
}

export default async function CreateDrawerPage({ searchParams }: CreateDrawerPageProps) {
  const params = await searchParams;
  const repo = params[URL_PARAMS.repo];
  const parent = params[URL_PARAMS.parent];
  const prompt = params[URL_PARAMS.prompt];
  const mode = params[URL_PARAMS.mode];
  const applicationId = params[URL_PARAMS.applicationId];
  const initialMode = parseMode(mode);

  const listFeatures = resolve<ListFeaturesUseCase>('ListFeaturesUseCase');
  const listRepos = resolve<ListRepositoriesUseCase>('ListRepositoriesUseCase');
  const listPlugins = resolve<ListPluginsUseCase>('ListPluginsUseCase');
  const settings = getSettings();

  // When an applicationId is supplied, look up the Application server-side so
  // the drawer can pre-fill repositoryPath and pin spec mode. A malformed id
  // or a missing application falls back to non-scoped mode (the drawer is a
  // parallel-slot overlay — a hard 404 here would hide the underlying canvas).
  const applicationPromise = applicationId
    ? resolve<GetApplicationUseCase>('GetApplicationUseCase')
        .execute(applicationId)
        .catch(() => null)
    : Promise.resolve(null);

  const [features, repositories, workflowDefaults, viewerPerm, application, plugins] =
    await Promise.all([
      listFeatures.execute(),
      listRepos.execute().catch(() => []),
      getWorkflowDefaults().catch(() => undefined),
      repo
        ? getViewerPermission(repo).catch(() => ({ canPushDirectly: false }))
        : Promise.resolve({ canPushDirectly: false }),
      applicationPromise,
      listPlugins.execute().catch(() => []),
    ]);

  const featureOptions = features
    .map((f) => ({ id: f.id, name: f.name }))
    .filter((f) => f.id && !f.id.startsWith('#'));

  const repositoryOptions = repositories.map((r) => ({
    id: r.id,
    name: r.name,
    path: r.path,
    isFork: r.isFork,
    upstreamUrl: r.upstreamUrl,
  }));

  // Application-scoped overrides: the entry-point-determined fields are
  // pinned, everything else stays user-editable per the spec's resolved Q6.
  // The URL `applicationId` is the canonical scope signal — it locks the
  // drawer even if the server-side Application lookup couldn't resolve a
  // repository path (e.g., DI not yet warm in tests).
  const scopedRepositoryPath = application?.repositoryPath ?? repo ?? '';
  const scopedApplicationId = application?.id ?? applicationId;

  const installedPlugins = plugins.map((p) => ({
    name: p.name,
    displayName: p.displayName ?? p.name,
    enabled: p.enabled,
  }));

  return (
    <CreateDrawerClient
      repositoryPath={scopedRepositoryPath}
      initialParentId={parent}
      initialDescription={prompt}
      initialMode={initialMode}
      initialApplicationId={scopedApplicationId}
      features={featureOptions}
      repositories={repositoryOptions}
      workflowDefaults={workflowDefaults}
      currentAgentType={settings.agent.type}
      currentModel={settings.models.default}
      canPushDirectly={viewerPerm.canPushDirectly}
      installedPlugins={installedPlugins}
    />
  );
}
