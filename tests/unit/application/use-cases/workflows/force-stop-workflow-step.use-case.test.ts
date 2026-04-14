/**
 * ForceStopWorkflowStepUseCase Unit Tests
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForceStopWorkflowStepUseCase } from '@/application/use-cases/workflows/force-stop-workflow-step.use-case.js';
import type { IWorkflowStepRepository } from '@/application/ports/output/repositories/workflow-step-repository.interface.js';
import type { IInteractiveSessionService } from '@/application/ports/output/services/interactive-session-service.interface.js';
import { WorkflowStepStatus, type WorkflowStep } from '@/domain/generated/output.js';

function makeStep(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  const now = new Date().toISOString();
  return {
    id: 'step-123',
    sessionId: 'session-1',
    featureId: 'feat-1',
    workflowId: 'application-creation-v1',
    stepKey: 'components',
    stepIndex: 0,
    title: 'Building the pieces',
    description: 'Designing and creating polished reusable parts',
    status: WorkflowStepStatus.running,
    startedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeRepo(): IWorkflowStepRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    ensureSteps: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    listBySession: vi.fn().mockResolvedValue([]),
    listByFeature: vi.fn().mockResolvedValue([]),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    markAllRunningAsInterrupted: vi.fn().mockResolvedValue(0),
    deleteByFeatureId: vi.fn().mockResolvedValue(undefined),
  };
}

function makeSession(): IInteractiveSessionService {
  return {
    notifyWorkflowStep: vi.fn(),
  } as unknown as IInteractiveSessionService;
}

describe('ForceStopWorkflowStepUseCase', () => {
  let useCase: ForceStopWorkflowStepUseCase;
  let repo: IWorkflowStepRepository;
  let session: IInteractiveSessionService;

  beforeEach(() => {
    repo = makeRepo();
    session = makeSession();
    useCase = new ForceStopWorkflowStepUseCase(repo, session);
  });

  it('returns stopped=false when step not found', async () => {
    vi.mocked(repo.findById).mockResolvedValue(null);

    const result = await useCase.execute({ stepId: 'missing' });

    expect(result.stopped).toBe(false);
    expect(result.reason).toContain('not found');
    expect(repo.updateStatus).not.toHaveBeenCalled();
  });

  it('returns stopped=false when step already in a terminal state', async () => {
    vi.mocked(repo.findById).mockResolvedValue(makeStep({ status: WorkflowStepStatus.done }));

    const result = await useCase.execute({ stepId: 'step-123' });

    expect(result.stopped).toBe(false);
    expect(result.reason).toContain('terminal');
    expect(repo.updateStatus).not.toHaveBeenCalled();
    expect(session.notifyWorkflowStep).not.toHaveBeenCalled();
  });

  it('flips a running step to interrupted and notifies subscribers', async () => {
    const running = makeStep({ status: WorkflowStepStatus.running });
    const interrupted = makeStep({ status: WorkflowStepStatus.interrupted });
    vi.mocked(repo.findById).mockResolvedValueOnce(running).mockResolvedValueOnce(interrupted);

    const result = await useCase.execute({ stepId: 'step-123' });

    expect(result.stopped).toBe(true);
    expect(repo.updateStatus).toHaveBeenCalledWith(
      'step-123',
      WorkflowStepStatus.interrupted,
      expect.objectContaining({ error: expect.stringContaining('Force-stopped') })
    );
    expect(session.notifyWorkflowStep).toHaveBeenCalledWith('feat-1', interrupted);
  });

  it('flips a pending step to interrupted too (stuck pending after restart)', async () => {
    const pending = makeStep({ status: WorkflowStepStatus.pending });
    const interrupted = makeStep({ status: WorkflowStepStatus.interrupted });
    vi.mocked(repo.findById).mockResolvedValueOnce(pending).mockResolvedValueOnce(interrupted);

    const result = await useCase.execute({ stepId: 'step-123' });

    expect(result.stopped).toBe(true);
    expect(repo.updateStatus).toHaveBeenCalledWith(
      'step-123',
      WorkflowStepStatus.interrupted,
      expect.any(Object)
    );
  });
});
