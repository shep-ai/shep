/**
 * SessionSpaceEnvironment (spec 121)
 *
 * The space environment for an interactive session: the feature's repository
 * decides the space (never the worktree path, which lives under the Shep home
 * and would resolve into the default space). Sessions that are not about a
 * feature — global, application or repository chats — keep the host
 * environment.
 *
 * Unlike the feature worker, the daemon runs sessions of different spaces at
 * once, so the environment travels with each session's options instead of
 * changing process.env.
 */

import type { AgentType } from '../../../../domain/generated/output.js';
import type { SpaceEnvironment } from '../../../../domain/shared/space-environment.js';
import type { IFeatureRepository } from '../../../../application/ports/output/repositories/feature-repository.interface.js';
import type { ResolveSpaceEnvironmentUseCase } from '../../../../application/use-cases/spaces/resolve-space-environment.use-case.js';

export interface SessionSpaceEnvironmentResult {
  environment?: SpaceEnvironment;
  /** Why the space refuses this agent type, when it does. */
  refusal?: string;
}

export class SessionSpaceEnvironment {
  constructor(
    private readonly features: IFeatureRepository,
    private readonly resolveEnvironment: ResolveSpaceEnvironmentUseCase
  ) {}

  async resolve(featureId: string, agentType: AgentType): Promise<SessionSpaceEnvironmentResult> {
    const feature = await this.features.findById(featureId);
    if (!feature?.repositoryPath) return {};
    const { environment, agentRefusal } = await this.resolveEnvironment.execute(
      feature.repositoryPath,
      agentType
    );
    return { environment, ...(agentRefusal ? { refusal: agentRefusal } : {}) };
  }
}
