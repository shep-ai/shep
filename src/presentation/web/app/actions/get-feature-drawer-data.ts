'use server';

import { resolve } from '@/lib/server-container';
import type { IFeatureRepository } from '@shepai/core/application/ports/output/repositories/feature-repository.interface';
import type { IAgentRunRepository } from '@shepai/core/application/ports/output/agents/agent-run-repository.interface';
import type { IRepositoryRepository } from '@shepai/core/application/ports/output/repositories/repository-repository.interface';
import type { IGitPrService } from '@shepai/core/application/ports/output/services/git-pr-service.interface';
import type { GetFeatureArtifactUseCase } from '@shepai/core/application/use-cases/features/get-feature-artifact.use-case';
import { buildFeatureNodeData } from '@/app/build-feature-node-data';
import { getSettings } from '@shepai/core/infrastructure/services/settings.service';
import type { FeatureNodeData } from '@/components/common/feature-node';

/**
 * Fetches full FeatureNodeData for a given feature ID.
 * Used by the drawer for targeted data syncing without triggering
 * a full router.refresh() / server component re-render.
 *
 * CI status and mergeable status are read from the DB (already updated
 * by PrSyncWatcherService) instead of making duplicate GitHub API calls.
 */
export async function getFeatureDrawerData(featureId: string): Promise<FeatureNodeData | null> {
  try {
    const featureRepo = resolve<IFeatureRepository>('IFeatureRepository');
    const agentRunRepo = resolve<IAgentRunRepository>('IAgentRunRepository');
    const repoRepo = resolve<IRepositoryRepository>('IRepositoryRepository');
    const gitPrService = resolve<IGitPrService>('IGitPrService');
    const getArtifact = resolve<GetFeatureArtifactUseCase>('GetFeatureArtifactUseCase');

    const feature = await featureRepo.findById(featureId);
    if (!feature) return null;

    const run = feature.agentRunId ? await agentRunRepo.findById(feature.agentRunId) : null;

    // CI status and mergeable status are read from the feature record (updated by
    // PrSyncWatcherService every 30s) — no duplicate GitHub API calls needed.
    // Only getDefaultBranch and getRemoteUrl are kept as they are local git operations.
    const [repo, baseBranch, artifact, remoteUrl, coordinationPeer] = await Promise.all([
      repoRepo.findByPath(feature.repositoryPath).catch(() => null),
      gitPrService.getDefaultBranch(feature.repositoryPath).catch(() => 'main'),
      getArtifact.execute(featureId).catch(() => null),
      gitPrService.getRemoteUrl(feature.repositoryPath).catch(() => null),
      feature.coordination
        ? featureRepo.findById(feature.coordination.peerFeatureId).catch(() => null)
        : null,
    ]);

    const { workflow } = getSettings();

    return buildFeatureNodeData(feature, run, {
      repositoryName: repo?.name,
      baseBranch,
      oneLiner: artifact?.oneLiner,
      remoteUrl: remoteUrl ?? undefined,
      enableEvidence: workflow.enableEvidence,
      commitEvidence: workflow.commitEvidence,
      hideCiStatus: workflow.hideCiStatus,
      coordinationPeerName: coordinationPeer?.name,
    });
  } catch {
    return null;
  }
}
