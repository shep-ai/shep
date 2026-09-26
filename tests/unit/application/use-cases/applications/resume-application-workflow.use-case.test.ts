/**
 * ResumeApplicationWorkflowUseCase unit tests
 *
 * The "Setup failed" banner's "Try again" calls this use case and promises to
 * "re-run the last failed step" — e.g. after the user logs in to their agent.
 */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

import { ResumeApplicationWorkflowUseCase } from '@/application/use-cases/applications/resume-application-workflow.use-case.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import type { IWorkflowStepRepository } from '@/application/ports/output/repositories/workflow-step-repository.interface.js';
import type { IInteractiveSessionService } from '@/application/ports/output/services/interactive-session-service.interface.js';
import type { IInteractiveSessionRepository } from '@/application/ports/output/repositories/interactive-session-repository.interface.js';
import type { SendInteractiveMessageUseCase } from '@/application/use-cases/interactive/send-interactive-message.use-case.js';
import { WorkflowStepStatus, type WorkflowStep } from '@/domain/generated/output.js';

function setup(initial: WorkflowStepStatus) {
  let step = { id: 'step-1', status: initial } as unknown as WorkflowStep;
  const stepRepo = {
    listByFeature: vi.fn().mockResolvedValue([step]),
    findById: vi.fn(async () => step),
    updateStatus: vi.fn(async (_id: string, status: WorkflowStepStatus) => {
      step = { ...step, status };
    }),
  } as unknown as IWorkflowStepRepository;
  const appRepo = {
    findById: vi.fn().mockResolvedValue({ id: 'app-1', repositoryPath: '/wt' }),
    update: vi.fn(),
  } as unknown as IApplicationRepository;
  const session = {
    waitForTurnDone: vi.fn().mockResolvedValue(undefined),
    notifyWorkflowStep: vi.fn(),
    setActiveStep: vi.fn(),
    clearActiveStep: vi.fn(),
  } as unknown as IInteractiveSessionService;
  const sendMessage = {
    execute: vi.fn().mockResolvedValue({}),
  } as unknown as SendInteractiveMessageUseCase;
  const useCase = new ResumeApplicationWorkflowUseCase(appRepo, stepRepo, session, sendMessage, {
    findLatestAgentSessionIdForFeature: vi.fn().mockResolvedValue(null),
  } as unknown as IInteractiveSessionRepository);
  return { useCase, stepRepo, appRepo, sendMessage };
}

describe('ResumeApplicationWorkflowUseCase', () => {
  it('re-runs a failed step and completes setup when it succeeds', async () => {
    const { useCase, stepRepo, appRepo, sendMessage } = setup(WorkflowStepStatus.failed);

    await useCase.execute({ applicationId: 'app-1' });

    expect(stepRepo.updateStatus).toHaveBeenCalledWith('step-1', WorkflowStepStatus.pending);
    expect(sendMessage.execute).toHaveBeenCalledOnce();
    expect(appRepo.update).toHaveBeenCalledWith('app-1', { setupComplete: true });
  });

  it('still re-runs an interrupted step', async () => {
    const { useCase, stepRepo, sendMessage } = setup(WorkflowStepStatus.interrupted);

    await useCase.execute({ applicationId: 'app-1' });

    expect(stepRepo.updateStatus).toHaveBeenCalledWith('step-1', WorkflowStepStatus.pending);
    expect(sendMessage.execute).toHaveBeenCalledOnce();
  });

  it('skips a step that is already done', async () => {
    const { useCase, sendMessage, appRepo } = setup(WorkflowStepStatus.done);

    await useCase.execute({ applicationId: 'app-1' });

    expect(sendMessage.execute).not.toHaveBeenCalled();
    expect(appRepo.update).toHaveBeenCalledWith('app-1', { setupComplete: true });
  });
});
