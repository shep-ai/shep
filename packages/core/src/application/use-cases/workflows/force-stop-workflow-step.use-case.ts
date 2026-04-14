/**
 * Force Stop Workflow Step Use Case
 *
 * Manually flips a stuck `pending` or `running` workflow step to
 * `interrupted`. Used when a daemon restart or lost SSE update left a
 * step displayed as in-progress even though the underlying agent turn
 * finished (or was never started after recovery). Reusing the
 * `interrupted` status keeps the existing "Continue" retry flow in the
 * UI just working.
 *
 * This use case intentionally does NOT kill any agent process — the
 * process lifecycle is owned by `StopAgentRunUseCase`. It only
 * mutates the persisted step row and notifies SSE subscribers so the
 * tracker updates live.
 */

import { injectable, inject } from 'tsyringe';
import type { IWorkflowStepRepository } from '../../ports/output/repositories/workflow-step-repository.interface.js';
import type { IInteractiveSessionService } from '../../ports/output/services/interactive-session-service.interface.js';
import { WorkflowStepStatus } from '../../../domain/generated/output.js';

export interface ForceStopWorkflowStepInput {
  stepId: string;
}

export interface ForceStopWorkflowStepResult {
  stopped: boolean;
  reason: string;
}

const FORCE_STOP_ERROR_MESSAGE = 'Force-stopped by user';

@injectable()
export class ForceStopWorkflowStepUseCase {
  constructor(
    @inject('IWorkflowStepRepository')
    private readonly stepRepo: IWorkflowStepRepository,
    @inject('IInteractiveSessionService')
    private readonly session: IInteractiveSessionService
  ) {}

  async execute(input: ForceStopWorkflowStepInput): Promise<ForceStopWorkflowStepResult> {
    const step = await this.stepRepo.findById(input.stepId);
    if (!step) {
      return { stopped: false, reason: `Workflow step ${input.stepId} not found` };
    }

    const isActive =
      step.status === WorkflowStepStatus.running || step.status === WorkflowStepStatus.pending;
    if (!isActive) {
      return {
        stopped: false,
        reason: `Workflow step already in terminal state: ${step.status}`,
      };
    }

    await this.stepRepo.updateStatus(step.id, WorkflowStepStatus.interrupted, {
      error: FORCE_STOP_ERROR_MESSAGE,
    });

    const refreshed = await this.stepRepo.findById(step.id);
    if (refreshed) {
      this.session.notifyWorkflowStep(step.featureId, refreshed);
    }

    return { stopped: true, reason: 'Marked as interrupted' };
  }
}
