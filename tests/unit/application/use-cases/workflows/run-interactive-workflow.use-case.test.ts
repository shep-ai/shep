/**
 * RunWorkflowUseCase (interactive step orchestrator) unit tests
 *
 * Not to be confused with `run-workflow.use-case.test.ts`, which covers
 * `RunScheduledWorkflowUseCase`.
 *
 * Its caller, `CreateApplicationUseCase`, treats a normal return as "setup
 * complete" and only marks the Application `Error` when this throws. A failed
 * step must therefore reject, and a send that throws must not leave a turn
 * waiter behind.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { RunWorkflowUseCase } from '@/application/use-cases/workflows/run-workflow.use-case.js';
import type { WorkflowDefinition } from '@/application/use-cases/applications/application-creation.workflow.js';
import type { IWorkflowStepRepository } from '@/application/ports/output/repositories/workflow-step-repository.interface.js';
import type { IInteractiveSessionService } from '@/application/ports/output/services/interactive-session-service.interface.js';
import type { IInteractiveSessionRepository } from '@/application/ports/output/repositories/interactive-session-repository.interface.js';
import type { ILogger } from '@/application/ports/output/services/logger.interface.js';
import type { SendInteractiveMessageUseCase } from '@/application/use-cases/interactive/send-interactive-message.use-case.js';
import { WorkflowStepStatus, type WorkflowStep } from '@/domain/generated/output.js';

const WORKFLOW: WorkflowDefinition = {
  id: 'test-workflow-v1',
  steps: [
    { stepKey: 'one', title: 'Step one', description: '', prompt: 'do one' },
    { stepKey: 'two', title: 'Step two', description: '', prompt: 'do two' },
  ],
};

const INPUT = { featureId: 'app-feat', worktreePath: '/wt', workflow: WORKFLOW };

function makeStepRepo(): IWorkflowStepRepository {
  const rows = new Map<string, WorkflowStep>();
  return {
    ensureSteps: vi.fn(async (sessionId: string, workflowId: string, featureId: string, seeds) => {
      return seeds.map((seed: { stepKey: string; stepIndex: number; title: string }) => {
        const row = {
          id: `step-${seed.stepKey}`,
          sessionId,
          workflowId,
          featureId,
          stepKey: seed.stepKey,
          stepIndex: seed.stepIndex,
          title: seed.title,
          status: WorkflowStepStatus.pending,
        } as unknown as WorkflowStep;
        rows.set(row.id, row);
        return row;
      });
    }),
    updateStatus: vi.fn(async (stepId: string, status: WorkflowStepStatus) => {
      const row = rows.get(stepId);
      if (row) rows.set(stepId, { ...row, status });
    }),
    findById: vi.fn(async (stepId: string) => rows.get(stepId) ?? null),
  } as unknown as IWorkflowStepRepository;
}

/** Session double whose turns are settled explicitly by each test. */
function makeSession() {
  const turns: { resolve: () => void; reject: (err: Error) => void; signal?: AbortSignal }[] = [];
  const session = {
    waitForTurnDone: vi.fn(
      (_featureId: string, signal?: AbortSignal) =>
        new Promise<void>((resolve, reject) => {
          turns.push({ resolve, reject, signal });
          signal?.addEventListener('abort', () => reject(new Error('waitForTurnDone aborted')));
        })
    ),
    getChatState: vi.fn().mockResolvedValue({ sessionInfo: { sessionId: 'session-1' } }),
    notifyWorkflowStep: vi.fn(),
    setActiveStep: vi.fn(),
    clearActiveStep: vi.fn(),
  };
  return { session: session as unknown as IInteractiveSessionService, turns };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

describe('RunWorkflowUseCase', () => {
  let stepRepo: IWorkflowStepRepository;
  let sendMessage: { execute: ReturnType<typeof vi.fn> };
  let logger: ILogger;
  const usageRepo = { getUsage: vi.fn().mockResolvedValue(null) };

  beforeEach(() => {
    stepRepo = makeStepRepo();
    sendMessage = { execute: vi.fn().mockResolvedValue({}) };
    logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  });

  function makeUseCase(session: IInteractiveSessionService): RunWorkflowUseCase {
    return new RunWorkflowUseCase(
      stepRepo,
      session,
      sendMessage as unknown as SendInteractiveMessageUseCase,
      usageRepo as unknown as IInteractiveSessionRepository,
      logger
    );
  }

  it('runs every step and resolves when all turns complete', async () => {
    const { session, turns } = makeSession();
    const run = makeUseCase(session).execute(INPUT);

    await flush();
    turns[0].resolve();
    await flush();
    turns[1].resolve();

    await expect(run).resolves.toBeUndefined();
    expect(sendMessage.execute).toHaveBeenCalledTimes(2);
    expect(stepRepo.updateStatus).toHaveBeenCalledWith(
      'step-two',
      WorkflowStepStatus.done,
      expect.any(Object)
    );
  });

  // e.g. the first send is rejected up front because the agent has no
  // interactive mode — no turn will ever complete.
  it('rejects and tears down the turn waiter when the first send throws', async () => {
    const { session, turns } = makeSession();
    const failure = new Error('Gemini CLI does not support chat sessions yet.');
    sendMessage.execute.mockRejectedValueOnce(failure);

    await expect(makeUseCase(session).execute(INPUT)).rejects.toBe(failure);

    expect(turns[0].signal?.aborted).toBe(true);
    expect(stepRepo.ensureSteps).not.toHaveBeenCalled();
  });

  it('marks the first step failed and rejects when its turn fails', async () => {
    const { session, turns } = makeSession();
    const run = makeUseCase(session).execute(INPUT);

    await flush();
    turns[0].reject(new Error('Interactive session failed before the turn completed'));

    await expect(run).rejects.toThrow('Interactive session failed before the turn completed');
    expect(stepRepo.updateStatus).toHaveBeenCalledWith('step-one', WorkflowStepStatus.failed, {
      error: 'Interactive session failed before the turn completed',
    });
    expect(sendMessage.execute).toHaveBeenCalledTimes(1);
  });

  it('marks a later step failed and rejects when its send throws', async () => {
    const { session, turns } = makeSession();
    sendMessage.execute.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('send failed'));
    const run = makeUseCase(session).execute(INPUT);

    await flush();
    turns[0].resolve();

    await expect(run).rejects.toThrow('send failed');
    expect(stepRepo.updateStatus).toHaveBeenCalledWith('step-two', WorkflowStepStatus.failed, {
      error: 'send failed',
    });
    expect(turns[1].signal?.aborted).toBe(true);
  });
});
