/**
 * Stop Agent Run Use Case
 *
 * Sends SIGTERM to a running agent's worker process and marks it as interrupted.
 * Using "interrupted" (not "cancelled") so the run is resumable via `shep feat resume`.
 */

import { injectable, inject } from 'tsyringe';
import type { IAgentRunRepository } from '../../ports/output/agents/agent-run-repository.interface.js';
import type { IPhaseTimingRepository } from '../../ports/output/agents/phase-timing-repository.interface.js';
import type { IPhaseTimingContext } from '../../ports/output/services/phase-timing-context.interface.js';
import { AgentRunStatus } from '../../../domain/generated/output.js';

@injectable()
export class StopAgentRunUseCase {
  constructor(
    @inject('IAgentRunRepository')
    private readonly agentRunRepository: IAgentRunRepository,
    @inject('IPhaseTimingRepository')
    private readonly phaseTimingRepository: IPhaseTimingRepository,
    @inject('IPhaseTimingContext')
    private readonly phaseTimingContext: IPhaseTimingContext
  ) {}

  async execute(id: string): Promise<{ stopped: boolean; reason: string }> {
    const run = await this.agentRunRepository.findById(id);
    if (!run) {
      return { stopped: false, reason: 'Agent run not found' };
    }

    const terminalStatuses = new Set([
      AgentRunStatus.completed,
      AgentRunStatus.failed,
      AgentRunStatus.interrupted,
      AgentRunStatus.cancelled,
    ]);

    if (terminalStatuses.has(run.status)) {
      return { stopped: false, reason: `Agent run already in terminal state: ${run.status}` };
    }

    if (!run.pid) {
      // No PID — just mark as interrupted (resumable)
      const now = new Date();
      await this.agentRunRepository.updateStatus(id, AgentRunStatus.interrupted, {
        error: 'Stopped by user (no PID)',
        completedAt: now,
        updatedAt: now,
      });
      await this.phaseTimingContext.recordLifecycleEvent(
        'run:stopped',
        id,
        this.phaseTimingRepository
      );
      return { stopped: true, reason: 'Marked as interrupted (no PID to signal)' };
    }

    // Check if process is alive
    let alive = false;
    try {
      process.kill(run.pid, 0);
      alive = true;
    } catch {
      alive = false;
    }

    if (alive) {
      // Send SIGTERM for graceful shutdown
      try {
        process.kill(run.pid, 'SIGTERM');
      } catch {
        // Process may have died between check and signal
      }
    }

    const now = new Date();
    await this.agentRunRepository.updateStatus(id, AgentRunStatus.interrupted, {
      error: 'Stopped by user',
      completedAt: now,
      updatedAt: now,
    });

    // For alive processes, the worker's SIGTERM handler records run:stopped.
    // For dead processes, record it here since the worker can't.
    if (!alive) {
      await this.phaseTimingContext.recordLifecycleEvent(
        'run:stopped',
        id,
        this.phaseTimingRepository
      );
    }

    return {
      stopped: true,
      reason: alive
        ? `Sent SIGTERM to PID ${run.pid}`
        : `Process already dead, marked as interrupted`,
    };
  }
}
