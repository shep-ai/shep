/**
 * Resume Application Workflow Use Case
 *
 * Resumes an interrupted application-creation workflow by:
 * 1. Resetting any `interrupted` steps back to `pending`
 * 2. Walking remaining steps: for each pending step, send its prompt
 *    to the agent, wait for the turn to complete, mark it done.
 *
 * The agent SDK session is resumed (same conversation context) because
 * the session service looks up the previous `agentSessionId` from the DB.
 */

import { injectable, inject } from 'tsyringe';
import { WorkflowStepStatus, type WorkflowStep } from '../../../domain/generated/output.js';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type { IWorkflowStepRepository } from '../../ports/output/repositories/workflow-step-repository.interface.js';
import type { IInteractiveSessionService } from '../../ports/output/services/interactive-session-service.interface.js';
import type { IInteractiveSessionRepository } from '../../ports/output/repositories/interactive-session-repository.interface.js';
import type { SendInteractiveMessageUseCase } from '../interactive/send-interactive-message.use-case.js';
import { featureIdForApplication } from '../../../domain/shared/feature-id.js';
import { APPLICATION_CREATION_WORKFLOW } from './application-creation.workflow.js';

export interface ResumeApplicationWorkflowInput {
  applicationId: string;
}

@injectable()
export class ResumeApplicationWorkflowUseCase {
  constructor(
    @inject('IApplicationRepository')
    private readonly appRepo: IApplicationRepository,
    @inject('IWorkflowStepRepository')
    private readonly stepRepo: IWorkflowStepRepository,
    @inject('IInteractiveSessionService')
    private readonly session: IInteractiveSessionService,
    @inject('SendInteractiveMessageUseCase')
    private readonly sendMessage: SendInteractiveMessageUseCase,
    @inject('IInteractiveSessionRepository')
    private readonly sessionRepo: IInteractiveSessionRepository
  ) {}

  async execute(input: ResumeApplicationWorkflowInput): Promise<void> {
    const app = await this.appRepo.findById(input.applicationId);
    if (!app) throw new Error(`Application ${input.applicationId} not found`);

    const featureId = featureIdForApplication(app.id);
    const steps = await this.stepRepo.listByFeature(featureId);
    if (steps.length === 0) return;

    // Reset interrupted steps back to pending
    for (const step of steps) {
      if (step.status === WorkflowStepStatus.interrupted) {
        await this.stepRepo.updateStatus(step.id, WorkflowStepStatus.pending);
        this.session.notifyWorkflowStep(featureId, await this.refreshStep(step.id));
      }
    }

    // Walk steps — skip done ones, execute pending ones sequentially
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const definition = APPLICATION_CREATION_WORKFLOW.steps[i];
      if (!definition) break;

      // Refresh status (might have been reset above)
      const current = await this.stepRepo.findById(step.id);
      if (!current) break;
      if (current.status === WorkflowStepStatus.done) continue;
      if (current.status !== WorkflowStepStatus.pending) break;

      // Mark running
      await this.stepRepo.updateStatus(step.id, WorkflowStepStatus.running);
      this.session.notifyWorkflowStep(featureId, await this.refreshStep(step.id));
      this.session.setActiveStep(featureId, step.id);

      const turnDone = this.session.waitForTurnDone(featureId);

      try {
        await this.sendMessage.execute({
          featureId,
          content: definition.prompt,
          worktreePath: app.repositoryPath,
          model: app.modelOverride,
          agentType: app.agentType,
        });
        await turnDone;

        await this.stepRepo.updateStatus(step.id, WorkflowStepStatus.done, {
          summary: definition.title,
        });
        this.session.notifyWorkflowStep(featureId, await this.refreshStep(step.id));
      } catch (err) {
        await this.stepRepo.updateStatus(step.id, WorkflowStepStatus.failed, {
          error: err instanceof Error ? err.message : String(err),
        });
        this.session.notifyWorkflowStep(featureId, await this.refreshStep(step.id));
        return;
      } finally {
        this.session.clearActiveStep(featureId);
      }
    }

    // All remaining steps completed — mark setup as done and persist session ID
    const agentSessionId = await this.sessionRepo.findLatestAgentSessionIdForFeature(featureId);
    await this.appRepo.update(app.id, {
      setupComplete: true,
      ...(agentSessionId ? { agentSessionId } : {}),
    });
  }

  private async refreshStep(stepId: string): Promise<WorkflowStep> {
    const row = await this.stepRepo.findById(stepId);
    if (!row) throw new Error(`Workflow step ${stepId} vanished`);
    return row;
  }
}
