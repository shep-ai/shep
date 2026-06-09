import 'reflect-metadata';
import { describe, it, expect, beforeEach, type vi } from 'vitest';
import { RunScheduledWorkflowUseCase } from '@shepai/core/application/use-cases/scheduled-workflows/run-scheduled-workflow.use-case.js';
import type { IWorkflowRepository } from '@shepai/core/application/ports/output/repositories/workflow-repository.interface.js';
import type { IWorkflowExecutionRepository } from '@shepai/core/application/ports/output/repositories/workflow-execution-repository.interface.js';
import type { IClock } from '@shepai/core/application/ports/output/services/clock.interface.js';
import {
  WorkflowTriggerType,
  WorkflowExecutionStatus,
} from '@shepai/core/domain/generated/output.js';
import {
  createMockWorkflowRepo,
  createMockExecutionRepo,
  createMockClock,
  createTestWorkflow,
} from './workflow-test-helpers.js';

describe('RunWorkflowUseCase', () => {
  let useCase: RunScheduledWorkflowUseCase;
  let repo: IWorkflowRepository;
  let executionRepo: IWorkflowExecutionRepository;
  let clock: IClock;

  beforeEach(() => {
    repo = createMockWorkflowRepo();
    executionRepo = createMockExecutionRepo();
    clock = createMockClock();
    useCase = new RunScheduledWorkflowUseCase(repo, executionRepo, clock);
  });

  it('creates a queued execution with Manual trigger', async () => {
    const workflow = createTestWorkflow();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(workflow);

    const result = await useCase.execute(workflow.id);

    expect(result.workflowId).toBe(workflow.id);
    expect(result.triggerType).toBe(WorkflowTriggerType.Manual);
    expect(result.status).toBe(WorkflowExecutionStatus.Queued);
    expect(result.id).toBeDefined();
    expect(executionRepo.create).toHaveBeenCalledWith(result);
  });

  it('works on disabled workflows', async () => {
    const workflow = createTestWorkflow({ enabled: false });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(workflow);

    const result = await useCase.execute(workflow.id);

    expect(result.triggerType).toBe(WorkflowTriggerType.Manual);
    expect(result.status).toBe(WorkflowExecutionStatus.Queued);
  });

  it('throws for non-existent workflow', async () => {
    await expect(useCase.execute('nonexistent')).rejects.toThrow(
      'Workflow not found: "nonexistent"'
    );
  });

  it('generates a UUID for the execution', async () => {
    const workflow = createTestWorkflow();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(workflow);

    const result = await useCase.execute(workflow.id);

    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });
});
