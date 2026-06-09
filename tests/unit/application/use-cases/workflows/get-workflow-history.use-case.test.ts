import 'reflect-metadata';
import { describe, it, expect, beforeEach, type vi } from 'vitest';
import { GetScheduledWorkflowHistoryUseCase as GetWorkflowHistoryUseCase } from '@shepai/core/application/use-cases/scheduled-workflows/get-scheduled-workflow-history.use-case.js';
import type { IWorkflowRepository } from '@shepai/core/application/ports/output/repositories/workflow-repository.interface.js';
import type { IWorkflowExecutionRepository } from '@shepai/core/application/ports/output/repositories/workflow-execution-repository.interface.js';
import {
  createMockWorkflowRepo,
  createMockExecutionRepo,
  createTestWorkflow,
  createTestExecution,
} from './workflow-test-helpers.js';

describe('GetWorkflowHistoryUseCase', () => {
  let useCase: GetWorkflowHistoryUseCase;
  let repo: IWorkflowRepository;
  let executionRepo: IWorkflowExecutionRepository;

  beforeEach(() => {
    repo = createMockWorkflowRepo();
    executionRepo = createMockExecutionRepo();
    useCase = new GetWorkflowHistoryUseCase(repo, executionRepo);
  });

  it('returns executions ordered by most recent first', async () => {
    const workflow = createTestWorkflow();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(workflow);

    const executions = [
      createTestExecution({ id: 'exec-2', startedAt: new Date('2026-01-15T12:00:00Z') }),
      createTestExecution({ id: 'exec-1', startedAt: new Date('2026-01-15T10:00:00Z') }),
    ];
    (executionRepo.findByWorkflowId as ReturnType<typeof vi.fn>).mockResolvedValue(executions);

    const result = await useCase.execute(workflow.id);

    expect(result).toHaveLength(2);
    expect(executionRepo.findByWorkflowId).toHaveBeenCalledWith(workflow.id, 20);
  });

  it('respects limit parameter', async () => {
    const workflow = createTestWorkflow();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(workflow);

    await useCase.execute(workflow.id, undefined, 5);

    expect(executionRepo.findByWorkflowId).toHaveBeenCalledWith(workflow.id, 5);
  });

  it('returns empty array for workflow with no history', async () => {
    const workflow = createTestWorkflow();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(workflow);

    const result = await useCase.execute(workflow.id);

    expect(result).toEqual([]);
  });

  it('throws for non-existent workflow', async () => {
    await expect(useCase.execute('nonexistent')).rejects.toThrow(
      'Workflow not found: "nonexistent"'
    );
  });
});
