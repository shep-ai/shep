/**
 * Resume Application Workflow Use Case
 *
 * Resumes an interrupted or failed application-creation workflow — the
 * "Try again" on the web "Setup failed" banner and "Continue" on an
 * interrupted step.
 *
 * 1. An application in `Error` is claimed back to `Idle` (the status setup
 *    runs under) with a guarded write, and only the caller that wins the
 *    claim continues. `Error` is written only after a setup or resume has
 *    stopped, so nothing else is walking the steps.
 * 2. No workflow steps yet (setup failed before they were seeded — a
 *    scaffold failure, or a session boot that threw): setup restarts through
 *    `RunApplicationSetupUseCase`, the same pipeline creation runs, keeping
 *    any files already in the project folder.
 * 3. Otherwise `interrupted` steps — and `failed` ones, but only after the
 *    Error claim — are reset to `pending`, and the remaining steps are walked.
 *    Every reset and every `pending → running` is a guarded write, so when
 *    two walkers race (two clicks with no Error to claim, or a resume beside
 *    the creation orchestrator) each step's prompt is sent once, by whichever
 *    walker claimed it; the other stops at that step.
 * 4. Setup is marked complete only when every step is `done`. A step that
 *    fails again puts the application back in `Error`, and so does a claimed
 *    resume that stops without finishing.
 *
 * Not covered: a step force-stopped to `interrupted` while its walker is in
 * fact still alive can be re-run by a resume; the walker's own `done` write
 * is unguarded.
 *
 * The agent SDK session is resumed (same conversation context) because
 * the session service looks up the previous `agentSessionId` from the DB.
 */

import { injectable, inject } from 'tsyringe';
import {
  ApplicationStatus,
  WorkflowStepStatus,
  type Application,
  type WorkflowStep,
} from '../../../domain/generated/output.js';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type {
  IWorkflowStepRepository,
  WorkflowStepStatusGuard,
} from '../../ports/output/repositories/workflow-step-repository.interface.js';
import type { IInteractiveSessionService } from '../../ports/output/services/interactive-session-service.interface.js';
import type { IInteractiveSessionRepository } from '../../ports/output/repositories/interactive-session-repository.interface.js';
import type { ILogger } from '../../ports/output/services/logger.interface.js';
import type { SendInteractiveMessageUseCase } from '../interactive/send-interactive-message.use-case.js';
import type { RunApplicationSetupUseCase } from './run-application-setup.use-case.js';
import { featureIdForApplication } from '../../../domain/shared/feature-id.js';
import { APPLICATION_CREATION_WORKFLOW } from './application-creation.workflow.js';

/** Statuses a resumed workflow runs under, and so may leave for Error when a step fails again. */
const SETUP_RUNNING_STATUSES = [ApplicationStatus.Idle, ApplicationStatus.Active] as const;

/** Steps a resume may reset to `pending`, and the guard each reset carries. */
const RETRYABLE: WorkflowStepStatusGuard = { allowedFrom: [WorkflowStepStatus.interrupted] };
const RETRYABLE_AFTER_ERROR: WorkflowStepStatusGuard = {
  allowedFrom: [WorkflowStepStatus.interrupted, WorkflowStepStatus.failed],
};
/** The `pending → running` claim on a step. */
const CLAIMABLE: WorkflowStepStatusGuard = { allowedFrom: [WorkflowStepStatus.pending] };

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
    private readonly sessionRepo: IInteractiveSessionRepository,
    @inject('RunApplicationSetupUseCase')
    private readonly runSetup: RunApplicationSetupUseCase,
    @inject('ILogger')
    private readonly logger: ILogger
  ) {}

  async execute(input: ResumeApplicationWorkflowInput): Promise<void> {
    const app = await this.appRepo.findById(input.applicationId);
    if (!app) throw new Error(`Application ${input.applicationId} not found`);

    const featureId = featureIdForApplication(app.id);
    const steps = await this.stepRepo.listByFeature(featureId);
    if (steps.length === 0) {
      await this.restartSetup(app);
      return;
    }

    // `Error` means the last run stopped — nothing is in flight. Claim it
    // back before touching any step; a concurrent resume that lost the claim
    // leaves the steps to the winner.
    const claimedFromError = app.status === ApplicationStatus.Error;
    if (claimedFromError && !(await this.claimFromError(app.id))) return;

    // Reset retryable steps to pending. `failed` is retryable only after the
    // Error claim: the orchestrator marks a step failed a moment before it
    // writes Error, and a retry in between would run beside its failure handling.
    const retryable = claimedFromError ? RETRYABLE_AFTER_ERROR : RETRYABLE;
    for (const step of steps) {
      if (!retryable.allowedFrom.includes(step.status)) continue;
      if (
        await this.stepRepo.updateStatus(step.id, WorkflowStepStatus.pending, undefined, retryable)
      ) {
        this.session.notifyWorkflowStep(featureId, await this.refreshStep(step.id));
      }
    }

    if (!(await this.walk(app, featureId, steps))) return;

    if (await this.allDone(featureId)) {
      const agentSessionId = await this.sessionRepo.findLatestAgentSessionIdForFeature(featureId);
      await this.appRepo.update(app.id, {
        setupComplete: true,
        ...(agentSessionId ? { agentSessionId } : {}),
      });
      return;
    }

    // Stopped at a step this resume could not claim: another walker owns it
    // and will finish or fail the setup. A resume that took the app out of
    // Error and stopped short hands it back, so the banner offers a retry.
    this.logger.info('[resume-application] walk stopped before every step was done', {
      applicationId: app.id,
    });
    if (claimedFromError) await this.markFailed(app.id);
  }

  /**
   * Walk the steps in order: skip done ones, claim and run pending ones.
   * Returns false when a step failed (the application is then in `Error`),
   * true when the walk ended — finished or stopped at a step it could not claim.
   */
  private async walk(app: Application, featureId: string, steps: WorkflowStep[]): Promise<boolean> {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const definition = APPLICATION_CREATION_WORKFLOW.steps[i];
      if (!definition) break;

      const current = await this.stepRepo.findById(step.id);
      if (!current) break;
      if (current.status === WorkflowStepStatus.done) continue;
      if (
        !(await this.stepRepo.updateStatus(
          step.id,
          WorkflowStepStatus.running,
          undefined,
          CLAIMABLE
        ))
      ) {
        break;
      }

      this.session.notifyWorkflowStep(featureId, await this.refreshStep(step.id));
      this.session.setActiveStep(featureId, step.id);

      const turnDone = this.session.waitForTurnDone(featureId);
      // Handled up front: the turn can fail while the send is still in flight.
      turnDone.catch(() => undefined);

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
        await this.markFailed(app.id);
        return false;
      } finally {
        this.session.clearActiveStep(featureId);
      }
    }
    return true;
  }

  private async allDone(featureId: string): Promise<boolean> {
    const steps = await this.stepRepo.listByFeature(featureId);
    return steps.every((step) => step.status === WorkflowStepStatus.done);
  }

  private async markFailed(applicationId: string): Promise<void> {
    await this.appRepo.updateStatus(applicationId, ApplicationStatus.Error, {
      allowedFrom: SETUP_RUNNING_STATUSES,
    });
  }

  /**
   * Setup failed before any workflow step existed, so there is no step to
   * re-run: start setup again through the creation pipeline. The scaffold
   * runs only if the project folder holds nothing to keep; otherwise setup
   * continues from the brief and workflow on the files as they are.
   *
   * Only an application in `Error` is restarted. While the original creation
   * (or an earlier retry) is still scaffolding or booting the session, the row
   * sits at `Idle` with no steps yet, and the guarded claim refuses it — that
   * is how this never starts a second workflow beside a running one.
   */
  private async restartSetup(app: Application): Promise<void> {
    if (app.setupComplete) return;
    if (!(await this.claimFromError(app.id))) {
      this.logger.info('[resume-application] setup not in Error; nothing to restart', {
        applicationId: app.id,
      });
      return;
    }
    this.logger.info('[resume-application] no workflow steps; restarting application setup', {
      applicationId: app.id,
    });
    await this.runSetup.execute({
      application: { ...app, status: ApplicationStatus.Idle },
      initialPrompt: app.description,
      // The setup may have failed after the scaffold succeeded, and the user
      // may have kept building since: never scaffold over what is there.
      keepExistingFiles: true,
    });
  }

  /** Guarded Error → Idle. True only for the caller that moved it. */
  private claimFromError(applicationId: string): Promise<boolean> {
    return this.appRepo.updateStatus(applicationId, ApplicationStatus.Idle, {
      allowedFrom: [ApplicationStatus.Error],
    });
  }

  private async refreshStep(stepId: string): Promise<WorkflowStep> {
    const row = await this.stepRepo.findById(stepId);
    if (!row) throw new Error(`Workflow step ${stepId} vanished`);
    return row;
  }
}
