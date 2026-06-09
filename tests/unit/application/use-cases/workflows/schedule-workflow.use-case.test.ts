import 'reflect-metadata';
import { describe, it, expect, beforeEach, type vi } from 'vitest';
import { ScheduleScheduledWorkflowUseCase } from '@shepai/core/application/use-cases/scheduled-workflows/schedule-scheduled-workflow.use-case.js';
import type { IWorkflowRepository } from '@shepai/core/application/ports/output/repositories/workflow-repository.interface.js';
import type { IClock } from '@shepai/core/application/ports/output/services/clock.interface.js';
import {
  createMockWorkflowRepo,
  createMockClock,
  createTestWorkflow,
} from './workflow-test-helpers.js';

describe('ScheduleWorkflowUseCase', () => {
  let useCase: ScheduleScheduledWorkflowUseCase;
  let repo: IWorkflowRepository;
  let clock: IClock;

  beforeEach(() => {
    repo = createMockWorkflowRepo();
    clock = createMockClock();
    useCase = new ScheduleScheduledWorkflowUseCase(repo, clock);
  });

  it('sets cron expression and calculates nextRunAt', async () => {
    const workflow = createTestWorkflow();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(workflow);

    const result = await useCase.execute({
      nameOrId: workflow.id,
      cronExpression: '0 9 * * MON',
    });

    expect(result.cronExpression).toBe('0 9 * * MON');
    expect(result.nextRunAt).toBeDefined();
    expect(result.nextRunAt).toBeInstanceOf(Date);
    expect(repo.update).toHaveBeenCalledWith(result);
  });

  it('calculates nextRunAt with timezone', async () => {
    const workflow = createTestWorkflow();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(workflow);

    const result = await useCase.execute({
      nameOrId: workflow.id,
      cronExpression: '0 9 * * *',
      timezone: 'America/New_York',
    });

    expect(result.cronExpression).toBe('0 9 * * *');
    expect(result.timezone).toBe('America/New_York');
    expect(result.nextRunAt).toBeDefined();
  });

  it('clears schedule when cron is null', async () => {
    const workflow = createTestWorkflow({
      cronExpression: '0 9 * * *',
      nextRunAt: new Date('2026-01-16T09:00:00Z'),
    });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(workflow);

    const result = await useCase.execute({
      nameOrId: workflow.id,
      cronExpression: null,
    });

    expect(result.cronExpression).toBeUndefined();
    expect(result.nextRunAt).toBeUndefined();
    expect(repo.update).toHaveBeenCalledWith(result);
  });

  it('throws with descriptive error for invalid cron', async () => {
    const workflow = createTestWorkflow();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(workflow);

    await expect(
      useCase.execute({
        nameOrId: workflow.id,
        cronExpression: 'invalid',
      })
    ).rejects.toThrow(/Invalid cron expression "invalid"/);
  });

  it('throws when workflow is not found', async () => {
    await expect(
      useCase.execute({
        nameOrId: 'nonexistent',
        cronExpression: '0 9 * * *',
      })
    ).rejects.toThrow('Workflow not found: "nonexistent"');
  });
});
