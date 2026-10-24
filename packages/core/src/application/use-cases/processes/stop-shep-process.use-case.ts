/**
 * Stop Shep Process Use Case (spec 144)
 *
 * `shep ps stop <id>`: resolves the ids `shep ps` shows (a run id, a feature
 * id, or a prefix of either) to one agent run and stops it through the
 * existing StopAgentRunUseCase. A feature id means that feature's running
 * agent. The daemon is never stopped here: that is `shep stop`. Never throws.
 */

import { inject, injectable } from 'tsyringe';
import type { AgentRun } from '../../../domain/generated/output.js';
import {
  refuseStoppingOwnRun,
  type EnvironmentVariables,
} from '../../../domain/shared/agent-run-environment.js';
import { expectsLiveProcess } from '../../../domain/shared/shep-process.js';
import type { IDaemonService } from '../../ports/output/services/daemon-service.interface.js';
import { ListAgentRunsUseCase } from '../agents/list-agent-runs.use-case.js';
import { StopAgentRunUseCase } from '../agents/stop-agent-run.use-case.js';
import type { StopShepProcessResult } from './shep-process.types.js';

export interface StopShepProcessOptions {
  /** The caller's environment: a Shep agent never stops the run it executes in. */
  environment?: EnvironmentVariables;
  /** Stop it even from inside that run. */
  force?: boolean;
}

/** What `shep ps` shows in the KIND column for the daemon. */
const DAEMON_ALIAS = 'daemon';

@injectable()
export class StopShepProcessUseCase {
  constructor(
    @inject(ListAgentRunsUseCase)
    private readonly listRuns: Pick<ListAgentRunsUseCase, 'execute'>,
    @inject(StopAgentRunUseCase)
    private readonly stopRun: Pick<StopAgentRunUseCase, 'execute'>,
    @inject('IDaemonService')
    private readonly daemon: Pick<IDaemonService, 'read'>
  ) {}

  async execute(
    idOrPrefix: string,
    options: StopShepProcessOptions = {}
  ): Promise<StopShepProcessResult> {
    const id = idOrPrefix.trim();
    try {
      if (await this.isDaemon(id)) {
        return refused('The web daemon is not an agent run. Stop it with: shep stop');
      }

      const runs = await this.listRuns.execute();
      const exact = runs.find((r) => r.id === id);
      const featureRuns = runs.filter((r) => r.featureId?.startsWith(id));
      const candidates = exact
        ? [exact]
        : unique([
            ...runs.filter((r) => r.id.startsWith(id)),
            ...featureRuns.filter((r) => expectsLiveProcess(r.status)),
          ]);

      if (candidates.length > 1) {
        const ids = candidates.map((r) => r.id).join(', ');
        return refused(`Several agent runs match ${id}: ${ids}. Use a longer id.`);
      }
      if (candidates.length === 0) {
        return refused(
          featureRuns.length > 0
            ? `${id} has no running agent.`
            : `No agent run or feature matches ${id}.`
        );
      }

      const [target] = candidates;
      const refusal = refuseStoppingOwnRun(
        options.environment ?? {},
        { runId: target.id, ...(target.featureId && { featureId: target.featureId }) },
        options.force === true
      );
      if (refusal) return refused(refusal);

      const result = await this.stopRun.execute(target.id);
      return { stopped: result.stopped, message: result.reason, runId: target.id };
    } catch (error) {
      return refused(error instanceof Error ? error.message : String(error));
    }
  }

  private async isDaemon(id: string): Promise<boolean> {
    if (id.toLowerCase() === DAEMON_ALIAS) return true;
    const state = await this.daemon.read();
    return state !== null && String(state.pid) === id;
  }
}

function unique(runs: AgentRun[]): AgentRun[] {
  return [...new Map(runs.map((r) => [r.id, r])).values()];
}

function refused(message: string): StopShepProcessResult {
  return { stopped: false, message };
}
