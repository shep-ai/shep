import { resolve } from '@/lib/server-container';
import type { IFeatureRepository } from '@shepai/core/application/ports/output/repositories/feature-repository.interface';
import type { IAgentRunRepository } from '@shepai/core/application/ports/output/agents/agent-run-repository.interface';
import type { IRepositoryRepository } from '@shepai/core/application/ports/output/repositories/repository-repository.interface';
import type { IGitPrService } from '@shepai/core/application/ports/output/services/git-pr-service.interface';
import type { GetFeatureArtifactUseCase } from '@shepai/core/application/use-cases/features/get-feature-artifact.use-case';
import type { GetResearchArtifactUseCase } from '@shepai/core/application/use-cases/features/get-research-artifact.use-case';
import { buildFeatureNodeData } from '@/app/build-feature-node-data';
import { getSettings } from '@shepai/core/infrastructure/services/settings.service';
import { toDecisionTabAvailability } from '@/lib/decision-tab-availability';
import {
  computeDrawerView,
  parseTabKey,
} from '@/components/common/control-center-drawer/drawer-view';
import { FeatureDrawerClient } from '@/components/common/control-center-drawer/feature-drawer-client';

/** Skip static pre-rendering since we need runtime DI container. */
export const dynamic = 'force-dynamic';

interface FeatureDrawerTabPageProps {
  params: Promise<{ featureId: string; tab: string }>;
}

export default async function FeatureDrawerTabPage({ params }: FeatureDrawerTabPageProps) {
  const { featureId, tab } = await params;
  const urlTab = parseTabKey(tab);

  try {
    const featureRepo = resolve<IFeatureRepository>('IFeatureRepository');
    const agentRunRepo = resolve<IAgentRunRepository>('IAgentRunRepository');
    const repoRepo = resolve<IRepositoryRepository>('IRepositoryRepository');
    const gitPrService = resolve<IGitPrService>('IGitPrService');

    const feature = await featureRepo.findById(featureId);
    if (!feature) return null;

    const run = feature.agentRunId ? await agentRunRepo.findById(feature.agentRunId) : null;

    const getArtifact = resolve<GetFeatureArtifactUseCase>('GetFeatureArtifactUseCase');
    const getResearch = resolve<GetResearchArtifactUseCase>('GetResearchArtifactUseCase');
    // Research is read here (not deferred to useDrawerSync) so a deep link to a
    // decisions tab knows server-side whether that tab exists.
    const [repo, baseBranch, artifact, research, remoteUrl] = await Promise.all([
      repoRepo.findByPath(feature.repositoryPath).catch(() => null),
      gitPrService.getDefaultBranch(feature.repositoryPath).catch(() => 'main'),
      getArtifact.execute(featureId).catch(() => null),
      getResearch.execute(featureId).catch(() => null),
      gitPrService.getRemoteUrl(feature.repositoryPath).catch(() => null),
    ]);

    const { workflow, interactiveAgent } = getSettings();
    const nodeData = buildFeatureNodeData(feature, run, {
      repositoryName: repo?.name,
      baseBranch,
      oneLiner: artifact?.oneLiner,
      remoteUrl: remoteUrl ?? undefined,
      enableEvidence: workflow.enableEvidence,
      commitEvidence: workflow.commitEvidence,
      ciWatchEnabled: workflow.ciWatchEnabled,
      decisionTabs: toDecisionTabAvailability(research, artifact),
    });

    const view = computeDrawerView({
      selectedNode: nodeData,
      isCreateDrawerOpen: false,
      pendingRepositoryPath: '',
      pendingParentFeatureId: undefined,
      selectedRepoNode: null,
      features: [],
      workflowDefaults: undefined,
    });

    if (!view) return null;

    return (
      <FeatureDrawerClient
        view={view}
        urlTab={urlTab}
        interactiveAgentEnabled={interactiveAgent?.enabled ?? true}
      />
    );
  } catch {
    return null;
  }
}
