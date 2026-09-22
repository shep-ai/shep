/**
 * Show Agent Run Use Case
 *
 * Retrieves a single agent run by ID with process liveness check.
 *
 * Business Rules:
 * - Tries exact ID match first, then prefix match via list()
 * - Throws if the agent run does not exist
 * - Checks process liveness for runs that have a pid
 */

import { injectable, inject } from 'tsyringe';
import { ReconcileAgentRunLivenessUseCase } from './reconcile-agent-run-liveness.use-case.js';
import type { AgentRun } from '../../../domain/generated/output.js';
import type { IAgentRunRepository } from '../../ports/output/agents/agent-run-repository.interface.js';
import type { IFeatureAgentProcessService } from '../../ports/output/agents/feature-agent-process.interface.js';

export interface ShowAgentRunResult {
  run: AgentRun;
  isAlive: boolean;
}

@injectable()
export class ShowAgentRunUseCase {
  constructor(
    @inject('IAgentRunRepository')
    private readonly runRepo: IAgentRunRepository,
    @inject('IFeatureAgentProcessService')
    private readonly processService: IFeatureAgentProcessService,
    @inject(ReconcileAgentRunLivenessUseCase)
    private readonly reconcileRunLiveness: ReconcileAgentRunLivenessUseCase
  ) {}

  async execute(runId: string): Promise<ShowAgentRunResult> {
    // Settle crashed, hung and never-started runs first, so what every surface
    // shows reflects them. Never throws.
    await this.reconcileRunLiveness.execute();
    // Try exact match first
    let run = await this.runRepo.findById(runId);

    // Fall back to prefix match
    if (!run) {
      const allRuns = await this.runRepo.list();
      run = allRuns.find((r) => r.id.startsWith(runId)) ?? null;
    }

    if (!run) {
      throw new Error(`Agent run not found: "${runId}"`);
    }

    const isAlive = run.pid != null ? this.processService.isAlive(run.pid) : false;

    return { run, isAlive };
  }
}
