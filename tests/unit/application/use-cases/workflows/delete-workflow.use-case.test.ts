import 'reflect-metadata';
import { describe, it, expect, beforeEach, type vi } from 'vitest';
import { DeleteScheduledWorkflowUseCase as DeleteWorkflowUseCase } from '@shepai/core/application/use-cases/scheduled-workflows/delete-scheduled-workflow.use-case.js';
import type { IWorkflowRepository } from '@shepai/core/application/ports/output/repositories/workflow-repository.interface.js';
import type { IWorkflowExecutionRepository } from '@shepai/core/application/ports/output/repositories/workflow-execution-repository.interface.js';
import type { IClock } from '@shepai/core/application/ports/output/services/clock.interface.js';
import { WorkflowExecutionStatus } from '@shepai/core/domain/generated/output.js';
import {
  createMockWorkflowRepo,
  createMockExecutionRepo,
  createMockClock,
  createTestWorkflow,
  createTestExecution,
} from './workflow-test-helpers.js';

describe('DeleteWorkflowUseCase', () => {
  let useCase: DeleteWorkflowUseCase;
  let repo: IWorkflowRepository;
  let executionRepo: IWorkflowExecutionRepository;
  let clock: IClock;

  beforeEach(() => {
    repo = createMockWorkflowRepo();
    executionRepo = createMockExecutionRepo();
    clock = createMockClock();
    useCase = new DeleteWorkflowUseCase(repo, executionRepo, clock);
  });

  it('soft-deletes a workflow found by ID', async () => {
    const workflow = createTestWorkflow();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(workflow);

    const result = await useCase.execute(workflow.id);

    expect(repo.softDelete).toHaveBeenCalledWith(workflow.id);
    expect(result.id).toBe(workflow.id);
  });

  it('cancels queued executions for the workflow', async () => {
    const workflow = createTestWorkflow();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(workflow);

    const queuedExec = createTestExecution({
      workflowId: workflow.id,
      status: WorkflowExecutionStatus.Queued,
    });
    const otherExec = createTestExecution({
      id: 'exec-other',
      workflowId: 'other-wf',
      status: WorkflowExecutionStatus.Queued,
    });
    (executionRepo.findByStatus as ReturnType<typeof vi.fn>).mockResolvedValue([
      queuedExec,
      otherExec,
    ]);

    await useCase.execute(workflow.id);

    // Should cancel only the execution belonging to our workflow
    expect(executionRepo.update).toHaveBeenCalledTimes(1);
    expect(executionRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: queuedExec.id,
        status: WorkflowExecutionStatus.Cancelled,
      })
    );
  });

  it('throws when workflow is not found', async () => {
    await expect(useCase.execute('nonexistent')).rejects.toThrow(
      'Workflow not found: "nonexistent"'
    );
  });

  it('finds workflow by name when repositoryPath is provided', async () => {
    const workflow = createTestWorkflow();
    (repo.findByName as ReturnType<typeof vi.fn>).mockResolvedValue(workflow);

    const result = await useCase.execute(workflow.name, '/repo');

    expect(repo.findByName).toHaveBeenCalledWith(workflow.name, '/repo');
    expect(repo.softDelete).toHaveBeenCalledWith(workflow.id);
    expect(result.name).toBe(workflow.name);
  });
});
