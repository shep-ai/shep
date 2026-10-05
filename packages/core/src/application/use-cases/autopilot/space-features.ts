/**
 * The features of a space's repositories that are still in flight, and how
 * many of them wait for a person to approve a gate (spec 132).
 */

import { AgentRunStatus } from '../../../domain/generated/output.js';
import { isFeatureInFlight } from '../../../domain/shared/autopilot.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IAgentRunRepository } from '../../ports/output/agents/agent-run-repository.interface.js';
import type { ResolveSpaceContextUseCase } from '../spaces/resolve-space-context.use-case.js';

export interface SpaceFeatureCounts {
  inFlight: number;
  awaitingApproval: number;
}

export async function countSpaceFeatures(
  features: IFeatureRepository,
  agentRuns: IAgentRunRepository,
  spaceContext: ResolveSpaceContextUseCase,
  spaceId: string
): Promise<SpaceFeatureCounts> {
  const candidates = (await features.list()).filter((feature) =>
    isFeatureInFlight(feature.lifecycle)
  );
  const contexts = await spaceContext.executeMany(candidates.map((f) => f.repositoryPath));
  const inSpace = candidates.filter((_, index) => contexts[index]?.space.id === spaceId);
  const runIds = inSpace.flatMap((feature) => (feature.agentRunId ? [feature.agentRunId] : []));
  const runs = runIds.length > 0 ? await agentRuns.findByIds(runIds) : [];
  return {
    inFlight: inSpace.length,
    awaitingApproval: runs.filter((run) => run.status === AgentRunStatus.waitingApproval).length,
  };
}
