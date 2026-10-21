/**
 * ResumeApplicationWorkflowUseCase unit tests
 *
 * The "Setup failed" banner's "Try again" calls this use case and promises to
 * "re-run the last failed step" — e.g. after the user logs in to their agent.
 * When setup failed before any workflow step existed (scaffold failure, or a
 * session boot that threw before the steps were seeded), there is no step to
 * re-run, so Try again restarts setup from scratch.
 */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

import { ResumeApplicationWorkflowUseCase } from '@/application/use-cases/applications/resume-application-workflow.use-case.js';
import type { IWorkflowStepRepository } from '@/application/ports/output/repositories/workflow-step-repository.interface.js';
import type { IInteractiveSessionService } from '@/application/ports/output/services/interactive-session-service.interface.js';
import type { IInteractiveSessionRepository } from '@/application/ports/output/repositories/interactive-session-repository.interface.js';
import type { ILogger } from '@/application/ports/output/services/logger.interface.js';
import type { SendInteractiveMessageUseCase } from '@/application/use-cases/interactive/send-interactive-message.use-case.js';
import type { RunApplicationSetupUseCase } from '@/application/use-cases/applications/run-application-setup.use-case.js';
import {
  ApplicationStatus,
  WorkflowStepStatus,
  type Application,
  type WorkflowStep,
} from '@/domain/generated/output.js';
import { APPLICATION_CREATION_WORKFLOW } from '@/application/use-cases/applications/application-creation.workflow.js';
import { createMockApplicationRepository } from '../../../../helpers/application-repository.mock.js';

interface SetupOptions {
  steps?: WorkflowStepStatus[];
  app?: Partial<Application>;
}

function setup({ steps: initial = [], app: appOverrides = {} }: SetupOptions = {}) {
  let steps = initial.map((status, i) => ({ id: `step-${i + 1}`, status }) as WorkflowStep);
  const stepRepo = {
    listByFeature: vi.fn(async () => steps),
    findById: vi.fn(async (id: string) => steps.find((s) => s.id === id) ?? null),
    // Honours the guard like the SQLite repository: refuse once the row left `allowedFrom`.
    updateStatus: vi.fn(
      async (
        id: string,
        status: WorkflowStepStatus,
        _metadata?: Record<string, unknown>,
        guard?: { allowedFrom: readonly WorkflowStepStatus[] }
      ) => {
        const row = steps.find((s) => s.id === id);
        if (!row || (guard && !guard.allowedFrom.includes(row.status))) return false;
        steps = steps.map((s) => (s.id === id ? { ...s, status } : s));
        return true;
      }
    ),
  } as unknown as IWorkflowStepRepository;
  const app = {
    id: 'app-1',
    repositoryPath: '/wt',
    description: 'build me a todo app',
    status: ApplicationStatus.Idle,
    setupComplete: false,
    ...appOverrides,
  } as Application;
  const appRepo = createMockApplicationRepository({
    findById: vi.fn().mockResolvedValue(app),
  });
  const session = {
    waitForTurnDone: vi.fn().mockResolvedValue(undefined),
    notifyWorkflowStep: vi.fn(),
    setActiveStep: vi.fn(),
    clearActiveStep: vi.fn(),
  } as unknown as IInteractiveSessionService;
  const sendMessage = {
    execute: vi.fn().mockResolvedValue({}),
  } as unknown as SendInteractiveMessageUseCase;
  const runSetup = {
    execute: vi.fn().mockResolvedValue(undefined),
  } as unknown as RunApplicationSetupUseCase;
  const logger: ILogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const useCase = new ResumeApplicationWorkflowUseCase(
    appRepo,
    stepRepo,
    session,
    sendMessage,
    {
      findLatestAgentSessionIdForFeature: vi.fn().mockResolvedValue(null),
      clearAgentSessionIdsForFeature: vi.fn().mockResolvedValue(undefined),
    } as unknown as IInteractiveSessionRepository,
    runSetup,
    logger
  );
  return { useCase, stepRepo, appRepo, sendMessage, runSetup, app, steps: () => steps };
}

describe('ResumeApplicationWorkflowUseCase', () => {
  describe('when workflow steps exist', () => {
    it('re-runs a failed step and completes setup when it succeeds', async () => {
      const { useCase, stepRepo, appRepo, sendMessage } = setup({
        steps: [WorkflowStepStatus.failed],
        app: { status: ApplicationStatus.Error },
      });

      await useCase.execute({ applicationId: 'app-1' });

      expect(stepRepo.updateStatus).toHaveBeenCalledWith(
        'step-1',
        WorkflowStepStatus.pending,
        undefined,
        { allowedFrom: [WorkflowStepStatus.interrupted, WorkflowStepStatus.failed] }
      );
      expect(sendMessage.execute).toHaveBeenCalledOnce();
      expect(appRepo.update).toHaveBeenCalledWith('app-1', { setupComplete: true });
    });

    it('still re-runs an interrupted step', async () => {
      const { useCase, stepRepo, sendMessage } = setup({
        steps: [WorkflowStepStatus.interrupted],
      });

      await useCase.execute({ applicationId: 'app-1' });

      expect(stepRepo.updateStatus).toHaveBeenCalledWith(
        'step-1',
        WorkflowStepStatus.pending,
        undefined,
        { allowedFrom: [WorkflowStepStatus.interrupted] }
      );
      expect(sendMessage.execute).toHaveBeenCalledOnce();
    });

    it('sends each step once when two resumes race (no Error claim to serialise them)', async () => {
      const { useCase, sendMessage, appRepo } = setup({
        steps: [WorkflowStepStatus.interrupted],
      });

      await Promise.all([
        useCase.execute({ applicationId: 'app-1' }),
        useCase.execute({ applicationId: 'app-1' }),
      ]);

      expect(sendMessage.execute).toHaveBeenCalledOnce();
      expect(
        appRepo.update.mock.calls.filter(([, fields]) => fields.setupComplete === true)
      ).toHaveLength(1);
    });

    it('does not mark setup complete while another walker still holds a running step', async () => {
      const { useCase, appRepo, sendMessage } = setup({
        steps: [WorkflowStepStatus.done, WorkflowStepStatus.running],
      });

      await useCase.execute({ applicationId: 'app-1' });

      expect(sendMessage.execute).not.toHaveBeenCalled();
      expect(appRepo.update).not.toHaveBeenCalledWith(
        'app-1',
        expect.objectContaining({ setupComplete: true })
      );
    });

    it('leaves a failed step alone until the application has reached Error', async () => {
      // The orchestrator marks the step failed a moment before it writes Error;
      // retrying in that window would run beside the failure handling.
      const { useCase, sendMessage, appRepo, steps } = setup({
        steps: [WorkflowStepStatus.failed],
      });

      await useCase.execute({ applicationId: 'app-1' });

      expect(steps()[0].status).toBe(WorkflowStepStatus.failed);
      expect(sendMessage.execute).not.toHaveBeenCalled();
      expect(appRepo.update).not.toHaveBeenCalled();
    });

    it('puts a claimed application back in Error when the walk stops without finishing', async () => {
      const count = APPLICATION_CREATION_WORKFLOW.steps.length + 1; // one row with no definition
      const { useCase, appRepo } = setup({
        steps: Array.from({ length: count }, () => WorkflowStepStatus.failed),
        app: { status: ApplicationStatus.Error },
      });

      await useCase.execute({ applicationId: 'app-1' });

      expect(appRepo.update).not.toHaveBeenCalledWith(
        'app-1',
        expect.objectContaining({ setupComplete: true })
      );
      expect(appRepo.updateStatus).toHaveBeenLastCalledWith('app-1', ApplicationStatus.Error, {
        allowedFrom: [ApplicationStatus.Idle, ApplicationStatus.Active],
      });
    });

    it('skips a step that is already done', async () => {
      const { useCase, sendMessage, appRepo } = setup({ steps: [WorkflowStepStatus.done] });

      await useCase.execute({ applicationId: 'app-1' });

      expect(sendMessage.execute).not.toHaveBeenCalled();
      expect(appRepo.update).toHaveBeenCalledWith('app-1', { setupComplete: true });
    });

    it('never restarts setup from scratch', async () => {
      const { useCase, runSetup } = setup({
        steps: [WorkflowStepStatus.failed],
        app: { status: ApplicationStatus.Error },
      });

      await useCase.execute({ applicationId: 'app-1' });

      expect(runSetup.execute).not.toHaveBeenCalled();
    });

    it('moves an application in Error back to Idle before re-running the failed step', async () => {
      const { useCase, appRepo, sendMessage } = setup({
        steps: [WorkflowStepStatus.failed],
        app: { status: ApplicationStatus.Error },
      });

      await useCase.execute({ applicationId: 'app-1' });

      expect(appRepo.updateStatus).toHaveBeenCalledWith('app-1', ApplicationStatus.Idle, {
        allowedFrom: [ApplicationStatus.Error],
      });
      expect(appRepo.updateStatus.mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(sendMessage.execute).mock.invocationCallOrder[0]
      );
    });

    it('does not re-run anything when another resume already claimed the Error state', async () => {
      const { useCase, appRepo, stepRepo, sendMessage } = setup({
        steps: [WorkflowStepStatus.failed],
        app: { status: ApplicationStatus.Error },
      });
      appRepo.updateStatus.mockResolvedValue(false);

      await useCase.execute({ applicationId: 'app-1' });

      expect(stepRepo.updateStatus).not.toHaveBeenCalled();
      expect(sendMessage.execute).not.toHaveBeenCalled();
    });

    it('puts the application back in Error when the re-run step fails again', async () => {
      const { useCase, appRepo, sendMessage } = setup({
        steps: [WorkflowStepStatus.failed],
        app: { status: ApplicationStatus.Error },
      });
      vi.mocked(sendMessage.execute).mockRejectedValue(new Error('agent not logged in'));

      await useCase.execute({ applicationId: 'app-1' });

      expect(appRepo.updateStatus).toHaveBeenLastCalledWith('app-1', ApplicationStatus.Error, {
        allowedFrom: [ApplicationStatus.Idle, ApplicationStatus.Active],
      });
      expect(appRepo.update).not.toHaveBeenCalledWith('app-1', { setupComplete: true });
    });

    it('leaves the status alone for an application that is not in Error', async () => {
      const { useCase, appRepo } = setup({ steps: [WorkflowStepStatus.interrupted] });

      await useCase.execute({ applicationId: 'app-1' });

      expect(appRepo.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('when setup failed before any workflow step existed', () => {
    it('claims the Error state and restarts setup through the creation pipeline', async () => {
      const { useCase, appRepo, runSetup, app } = setup({
        app: { status: ApplicationStatus.Error },
      });

      await useCase.execute({ applicationId: 'app-1' });

      expect(appRepo.updateStatus).toHaveBeenCalledWith('app-1', ApplicationStatus.Idle, {
        allowedFrom: [ApplicationStatus.Error],
      });
      expect(runSetup.execute).toHaveBeenCalledOnce();
      expect(runSetup.execute).toHaveBeenCalledWith({
        application: { ...app, status: ApplicationStatus.Idle },
        initialPrompt: app.description,
        // A retry must never delete what is already in the project folder.
        keepExistingFiles: true,
      });
      expect(appRepo.updateStatus.mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(runSetup.execute).mock.invocationCallOrder[0]
      );
    });

    it('does not start a second setup when the claim is lost (one is already running)', async () => {
      const { useCase, appRepo, runSetup, sendMessage } = setup({
        app: { status: ApplicationStatus.Error },
      });
      appRepo.updateStatus.mockResolvedValue(false);

      await useCase.execute({ applicationId: 'app-1' });

      expect(runSetup.execute).not.toHaveBeenCalled();
      expect(sendMessage.execute).not.toHaveBeenCalled();
    });

    it('does not start setup while the original creation is still running (not in Error)', async () => {
      const { useCase, appRepo, runSetup } = setup({ app: { status: ApplicationStatus.Idle } });
      // The guarded write is what refuses it: the row is Idle, not Error.
      appRepo.updateStatus.mockResolvedValue(false);

      await useCase.execute({ applicationId: 'app-1' });

      expect(runSetup.execute).not.toHaveBeenCalled();
    });

    it('does nothing for an application whose setup already completed', async () => {
      const { useCase, appRepo, runSetup } = setup({
        app: { status: ApplicationStatus.Error, setupComplete: true },
      });

      await useCase.execute({ applicationId: 'app-1' });

      expect(appRepo.updateStatus).not.toHaveBeenCalled();
      expect(runSetup.execute).not.toHaveBeenCalled();
    });
  });

  it('throws when the application does not exist', async () => {
    const { useCase, appRepo } = setup();
    appRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute({ applicationId: 'missing' })).rejects.toThrow(/not found/);
  });
});
