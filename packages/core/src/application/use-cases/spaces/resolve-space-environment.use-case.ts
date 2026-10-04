/**
 * ResolveSpaceEnvironmentUseCase (spec 121)
 *
 * For a repository: its space, the environment change the space's agent
 * settings call for, and — given the agent type about to run — a refusal
 * message when the space does not allow it. The feature worker and the
 * interactive session bootstrapper apply the result; nothing here touches
 * process.env.
 */

import { injectable, inject } from 'tsyringe';
import type { AgentType } from '../../../domain/generated/output.js';
import {
  isAgentAllowedInSpace,
  spaceEnvironment,
  type SpaceEnvironment,
} from '../../../domain/shared/space-environment.js';
import { ResolveSpaceContextUseCase, type SpaceContext } from './resolve-space-context.use-case.js';

export interface ResolvedSpaceEnvironment {
  context: SpaceContext;
  environment: SpaceEnvironment;
  /** Set when `agentType` was given and the space does not allow it. */
  agentRefusal?: string;
}

@injectable()
export class ResolveSpaceEnvironmentUseCase {
  constructor(
    @inject(ResolveSpaceContextUseCase) private readonly resolveContext: ResolveSpaceContextUseCase
  ) {}

  async execute(repositoryPath: string, agentType?: AgentType): Promise<ResolvedSpaceEnvironment> {
    const context = await this.resolveContext.execute(repositoryPath);
    const settings = context.space.agentSettings;
    const refused = agentType !== undefined && !isAgentAllowedInSpace(settings, agentType);
    return {
      context,
      environment: spaceEnvironment(settings),
      ...(refused
        ? {
            agentRefusal: `The ${context.space.name} space allows only ${(settings?.allowedAgentTypes ?? []).join(', ')} agents; this run uses ${agentType}.`,
          }
        : {}),
    };
  }
}
