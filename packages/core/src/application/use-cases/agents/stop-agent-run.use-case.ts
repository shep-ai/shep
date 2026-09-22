/**
 * Stop Agent Run Use Case
 *
 * Marks a running agent as interrupted, then terminates its worker's whole
 * process tree — the worker AND the agent CLI subprocesses it started —
 * escalating to SIGKILL when the tree ignores SIGTERM. Using "interrupted"
 * (not "cancelled") so the run is resumable via `shep feat resume`.
 *
 * `execute` resolves once the tree is gone: normally milliseconds (the
 * worker's SIGTERM handler exits at once), at most the terminator's grace
 * period plus a forced kill for a worker that ignores the request.
 */

import { injectable, inject } from 'tsyringe';
import type { IAgentRunRepository } from '../../ports/output/agents/agent-run-repository.interface.js';
import type { IPhaseTimingRepository } from '../../ports/output/agents/phase-timing-repository.interface.js';
import type { IPhaseTimingContext } from '../../ports/output/services/phase-timing-context.interface.js';
import type { IProcessLivenessProbe } from '../../ports/output/services/process-liveness.interface.js';
import type { IProcessTreeTerminator } from '../../ports/output/services/process-tree-terminator.interface.js';
import type { ILogger } from '../../ports/output/services/logger.interface.js';
import { AgentRunStatus } from '../../../domain/generated/output.js';
import {
  NON_TERMINAL_AGENT_RUN_STATUSES,
  TERMINAL_AGENT_RUN_STATUSES,
} from '../../../domain/shared/agent-run-status.js';
import { AdmitQueuedFeaturesUseCase } from '../features/capacity/admit-queued-features.use-case.js';

/**
 * Statuses a Stop may move to `interrupted`. The condition is part of the
 * write, so a run that finished between the read and the write keeps its real
 * outcome instead of being reported as stopped.
 */
const STOPPABLE_STATUSES = NON_TERMINAL_AGENT_RUN_STATUSES;

@injectable()
export class StopAgentRunUseCase {
  constructor(
    @inject('IAgentRunRepository')
    private readonly agentRunRepository: IAgentRunRepository,
    @inject('IPhaseTimingRepository')
    private readonly phaseTimingRepository: IPhaseTimingRepository,
    @inject('IPhaseTimingContext')
    private readonly phaseTimingContext: IPhaseTimingContext,
    @inject('IProcessLivenessProbe')
    private readonly liveness: IProcessLivenessProbe,
    @inject('IProcessTreeTerminator')
    private readonly terminator: IProcessTreeTerminator,
    @inject(AdmitQueuedFeaturesUseCase)
    private readonly admitQueued: AdmitQueuedFeaturesUseCase,
    @inject('ILogger')
    private readonly logger: ILogger
  ) {}

  async execute(id: string): Promise<{ stopped: boolean; reason: string }> {
    const run = await this.agentRunRepository.findById(id);
    if (!run) {
      return { stopped: false, reason: 'Agent run not found' };
    }

    if (TERMINAL_AGENT_RUN_STATUSES.has(run.status)) {
      return { stopped: false, reason: `Agent run already in terminal state: ${run.status}` };
    }

    if (!run.pid) {
      // No PID — just mark as interrupted (resumable)
      const now = new Date();
      const marked = await this.agentRunRepository.updateStatus(
        id,
        AgentRunStatus.interrupted,
        { error: 'Stopped by user (no PID)', completedAt: now, updatedAt: now },
        { allowedFrom: STOPPABLE_STATUSES }
      );
      if (!marked) return this.alreadyFinished(id);
      await this.phaseTimingContext.recordLifecycleEvent(
        'run:stopped',
        id,
        this.phaseTimingRepository
      );
      await this.drainCapacityQueue();
      return { stopped: true, reason: 'Marked as interrupted (no PID to signal)' };
    }

    const alive = this.liveness.isProcessAlive(run.pid);

    // Record the stop BEFORE signalling. The worker's own writes (heartbeat,
    // completion, its SIGTERM handler) are only allowed from pending/running,
    // so once this lands nothing the dying worker writes can overturn it.
    const now = new Date();
    const marked = await this.agentRunRepository.updateStatus(
      id,
      AgentRunStatus.interrupted,
      { error: 'Stopped by user', completedAt: now, updatedAt: now },
      { allowedFrom: STOPPABLE_STATUSES }
    );
    if (!marked) return this.alreadyFinished(id);

    if (alive) {
      // The whole tree, not just the worker: its agent CLI subprocesses would
      // otherwise outlive the stop, and a worker ignoring SIGTERM is escalated.
      await this.terminator.terminateTree(run.pid);
    }

    // For alive processes, the worker's SIGTERM handler records run:stopped.
    // For dead processes, record it here since the worker can't.
    if (!alive) {
      await this.phaseTimingContext.recordLifecycleEvent(
        'run:stopped',
        id,
        this.phaseTimingRepository
      );
    }

    await this.drainCapacityQueue();

    return {
      stopped: true,
      reason: alive
        ? `Terminated worker PID ${run.pid} and its subprocesses`
        : `Process already dead, marked as interrupted`,
    };
  }

  /**
   * A stopped run no longer holds a parallel-feature slot (its status releases
   * it even though the lifecycle still reads as running), so this is one of the
   * events that frees a slot — admit the next queued feature now rather than on
   * the next unrelated transition. Best-effort: the stop itself succeeded.
   */
  private async drainCapacityQueue(): Promise<void> {
    try {
      await this.admitQueued.execute();
    } catch (error) {
      // The dashboard's state-side drain retries on its next load.
      this.logger.warn('Capacity queue drain after stop failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async alreadyFinished(id: string): Promise<{ stopped: false; reason: string }> {
    const current = await this.agentRunRepository.findById(id);
    return {
      stopped: false,
      reason: `Agent run already in terminal state: ${current?.status ?? 'unknown'}`,
    };
  }
}
