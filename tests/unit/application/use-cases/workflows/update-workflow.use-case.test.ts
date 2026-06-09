import 'reflect-metadata';
import { describe, it, expect, beforeEach, type vi } from 'vitest';
import { UpdateScheduledWorkflowUseCase } from '@shepai/core/application/use-cases/scheduled-workflows/update-scheduled-workflow.use-case.js';
import type { IWorkflowRepository } from '@shepai/core/application/ports/output/repositories/workflow-repository.interface.js';
import type { IClock } from '@shepai/core/application/ports/output/services/clock.interface.js';
import {
  createMockWorkflowRepo,
  createMockClock,
  createTestWorkflow,
} from './workflow-test-helpers.js';

describe('UpdateWorkflowUseCase', () => {
  let useCase: UpdateScheduledWorkflowUseCase;
  let repo: IWorkflowRepository;
  let clock: IClock;

  beforeEach(() => {
    repo = createMockWorkflowRepo();
    clock = createMockClock();
    useCase = new UpdateScheduledWorkflowUseCase(repo, clock);
  });

  it('updates description successfully', async () => {
    const existing = createTestWorkflow();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    const result = await useCase.execute({
      id: existing.id,
      description: 'Updated description',
    });

    expect(result.description).toBe('Updated description');
    expect(result.prompt).toBe(existing.prompt);
    expect(repo.update).toHaveBeenCalledWith(result);
  });

  it('validates name uniqueness when name changes', async () => {
    const existing = createTestWorkflow();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (repo.findByName as ReturnType<typeof vi.fn>).mockResolvedValue(
      createTestWorkflow({ id: 'other', name: 'taken-name' })
    );

    await expect(useCase.execute({ id: existing.id, name: 'taken-name' })).rejects.toThrow(
      'A workflow named "taken-name" already exists in this repository.'
    );
  });

  it('throws when workflow is not found', async () => {
    await expect(useCase.execute({ id: 'nonexistent', description: 'test' })).rejects.toThrow(
      'Workflow not found: "nonexistent"'
    );
  });

  it('recalculates nextRunAt when cron expression changes', async () => {
    const existing = createTestWorkflow({
      cronExpression: '0 9 * * *',
      nextRunAt: new Date('2026-01-15T09:00:00Z'),
    });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    const result = await useCase.execute({
      id: existing.id,
      cronExpression: '0 10 * * *',
    });

    expect(result.cronExpression).toBe('0 10 * * *');
    expect(result.nextRunAt).toBeDefined();
    expect(result.nextRunAt).toBeInstanceOf(Date);
  });

  it('skips name uniqueness check when name is not changing', async () => {
    const existing = createTestWorkflow();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    await useCase.execute({ id: existing.id, prompt: 'new prompt' });

    expect(repo.findByName).not.toHaveBeenCalled();
  });
});
