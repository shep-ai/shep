/**
 * ResumeApplicationWorkflowUseCase unit tests — send failure handling.
 *
 * Each step subscribes to its turn's completion before sending. When the send
 * throws (e.g. the Application's agent has no interactive mode), nothing will
 * ever complete that turn, so the subscription must be torn down rather than
 * left waiting — and setup must not be marked complete.
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

describe('ResumeApplicationWorkflowUseCase', () => {
  // The "Setup failed" banner's "Try again" calls this use case and promises
  // to re-run the failed step — e.g. after the user logs in to their agent.
  it('re-runs a failed step and completes setup when it succeeds', async () => {
    let step = { id: 'step-1', status: WorkflowStepStatus.failed } as unknown as WorkflowStep;
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

    await useCase.execute({ applicationId: 'app-1' });

    expect(stepRepo.updateStatus).toHaveBeenCalledWith('step-1', WorkflowStepStatus.pending);
    expect(sendMessage.execute).toHaveBeenCalledOnce();
    expect(appRepo.update).toHaveBeenCalledWith('app-1', { setupComplete: true });
  });

  it('fails the step, tears down the turn waiter and leaves setup incomplete when the send throws', async () => {
    let step = { id: 'step-1', status: WorkflowStepStatus.pending } as unknown as WorkflowStep;
    const stepRepo = {
      listByFeature: vi.fn().mockResolvedValue([step]),
      findById: vi.fn(async () => step),
      updateStatus: vi.fn(async (_id: string, status: WorkflowStepStatus) => {
        step = { ...step, status };
      }),
    } as unknown as IWorkflowStepRepository;
    const appRepo = {
      findById: vi
        .fn()
        .mockResolvedValue({ id: 'app-1', repositoryPath: '/wt', agentType: 'gemini-cli' }),
      update: vi.fn(),
    } as unknown as IApplicationRepository;

    let turnSignal: AbortSignal | undefined;
    const session = {
      waitForTurnDone: vi.fn((_featureId: string, signal?: AbortSignal) => {
        turnSignal = signal;
        return new Promise<void>((_resolve, reject) =>
          signal?.addEventListener('abort', () => reject(new Error('waitForTurnDone aborted')))
        );
      }),
      notifyWorkflowStep: vi.fn(),
      setActiveStep: vi.fn(),
      clearActiveStep: vi.fn(),
    } as unknown as IInteractiveSessionService;
    const sendMessage = {
      execute: vi
        .fn()
        .mockRejectedValue(new Error('Gemini CLI does not support chat sessions yet.')),
    } as unknown as SendInteractiveMessageUseCase;

    const useCase = new ResumeApplicationWorkflowUseCase(appRepo, stepRepo, session, sendMessage, {
      findLatestAgentSessionIdForFeature: vi.fn(),
    } as unknown as IInteractiveSessionRepository);

    await useCase.execute({ applicationId: 'app-1' });

    expect(turnSignal?.aborted).toBe(true);
    expect(stepRepo.updateStatus).toHaveBeenCalledWith('step-1', WorkflowStepStatus.failed, {
      error: 'Gemini CLI does not support chat sessions yet.',
    });
    expect(appRepo.update).not.toHaveBeenCalled();
  });
});
