/**
 * AgentHarnessImprover (spec 150) — runs an improver stage as an agent session
 * in its evidence workspace.
 *
 * The agent comes from IAgentExecutorProvider (the user's configured agent);
 * nothing here names an agent type. The session works in the workspace as its
 * cwd, so its file edits to `context/harness/` are the proposal.
 */

import { inject, injectable } from 'tsyringe';
import type { IAgentExecutorProvider } from '../../../application/ports/output/agents/agent-executor-provider.interface.js';
import {
  ImproverError,
  type IHarnessImprover,
  type ImproverMission,
  type ImproverReply,
} from '../../../application/ports/output/services/harness-improver.interface.js';
import { renderMission } from './prompts/render-mission.js';

/** An improver session may take as long as a planning phase. */
export const IMPROVER_TIMEOUT_MS = 30 * 60 * 1000;
export const IMPROVER_MAX_TURNS = 80;
const PHASE_PREFIX = 'learn';

@injectable()
export class AgentHarnessImprover implements IHarnessImprover {
  constructor(
    @inject('IAgentExecutorProvider') private readonly executors: IAgentExecutorProvider
  ) {}

  async run(mission: ImproverMission): Promise<ImproverReply> {
    const executor = await this.executors.getExecutor();
    try {
      const result = await executor.execute(renderMission(mission), {
        cwd: mission.workspaceRoot,
        timeout: IMPROVER_TIMEOUT_MS,
        maxTurns: IMPROVER_MAX_TURNS,
        callContext: {
          ...(mission.featureId ? { featureId: mission.featureId } : {}),
          phase: `${PHASE_PREFIX}:${mission.label}`,
        },
      });
      return { text: result.result ?? '', costUsd: result.usage?.costUsd ?? 0 };
    } catch (error) {
      throw new ImproverError(error instanceof Error ? error.message : String(error));
    }
  }
}
