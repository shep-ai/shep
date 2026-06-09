import 'reflect-metadata';
import { describe, it, expect, beforeEach, type vi } from 'vitest';
import { ListScheduledWorkflowsUseCase as ListWorkflowsUseCase } from '@shepai/core/application/use-cases/scheduled-workflows/list-scheduled-workflows.use-case.js';
import { GetScheduledWorkflowUseCase as GetWorkflowUseCase } from '@shepai/core/application/use-cases/scheduled-workflows/get-scheduled-workflow.use-case.js';
import type { IWorkflowRepository } from '@shepai/core/application/ports/output/repositories/workflow-repository.interface.js';
import { createMockWorkflowRepo, createTestWorkflow } from './workflow-test-helpers.js';

describe('ListWorkflowsUseCase', () => {
  let useCase: ListWorkflowsUseCase;
  let repo: IWorkflowRepository;

  beforeEach(() => {
    repo = createMockWorkflowRepo();
    useCase = new ListWorkflowsUseCase(repo);
  });

  it('returns all workflows for a repo path', async () => {
    const workflows = [
      createTestWorkflow({ id: 'wf-1', name: 'workflow-1' }),
      createTestWorkflow({ id: 'wf-2', name: 'workflow-2' }),
    ];
    (repo.list as ReturnType<typeof vi.fn>).mockResolvedValue(workflows);

    const result = await useCase.execute({ repositoryPath: '/repo' });

    expect(result).toHaveLength(2);
    expect(repo.list).toHaveBeenCalledWith({ repositoryPath: '/repo' });
  });

  it('filters by enabled state', async () => {
    (repo.list as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await useCase.execute({ repositoryPath: '/repo', enabled: true });

    expect(repo.list).toHaveBeenCalledWith({ repositoryPath: '/repo', enabled: true });
  });

  it('returns empty array when no workflows exist', async () => {
    const result = await useCase.execute();

    expect(result).toEqual([]);
  });
});

describe('GetWorkflowUseCase', () => {
  let useCase: GetWorkflowUseCase;
  let repo: IWorkflowRepository;

  beforeEach(() => {
    repo = createMockWorkflowRepo();
    useCase = new GetWorkflowUseCase(repo);
  });

  it('finds a workflow by ID', async () => {
    const workflow = createTestWorkflow();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(workflow);

    const result = await useCase.execute('wf-1');

    expect(result.id).toBe('wf-1');
  });

  it('finds a workflow by name and repositoryPath', async () => {
    const workflow = createTestWorkflow();
    (repo.findByName as ReturnType<typeof vi.fn>).mockResolvedValue(workflow);

    const result = await useCase.execute('test-workflow', '/repo');

    expect(result.name).toBe('test-workflow');
    expect(repo.findByName).toHaveBeenCalledWith('test-workflow', '/repo');
  });

  it('throws for non-existent workflow', async () => {
    await expect(useCase.execute('nonexistent')).rejects.toThrow(
      'Workflow not found: "nonexistent"'
    );
  });

  it('prefers ID lookup over name lookup', async () => {
    const workflow = createTestWorkflow();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(workflow);

    await useCase.execute('wf-1', '/repo');

    // findByName should not be called since findById found it
    expect(repo.findByName).not.toHaveBeenCalled();
  });
});
